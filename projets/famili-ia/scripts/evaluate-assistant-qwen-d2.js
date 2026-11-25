import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  LOCAL_QWEN_MODEL,
  LOCAL_QWEN_OPTIONS,
  LOCAL_QWEN_PROMPT_VERSION,
  requestLocalQwenRawOutput,
  validateLocalQwenOutput
} from "../assistant-local-qwen.js";
import {
  prepareAssistantQwenDevelopmentCase,
  validateAssistantResponseQwenD2
} from "../assistant-qwen-development-gate.js";
import { assistantResponseQwenDevelopmentD2 } from "../tests/assistant-response-qwen-development-d2.js";

const endpoint = "http://127.0.0.1:11434";

async function readJson(path) {
  const content = await readFile(path, "utf8");
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Fichier JSON invalide ; aucun contenu n'a été affiché.");
  }
}

async function getOllamaJson(path) {
  let response;
  try {
    response = await fetch(`${endpoint}${path}`, { signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    if (error instanceof TypeError || error?.name === "TimeoutError") {
      throw new Error("Ollama local est inaccessible ou ne répond pas à temps.");
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Ollama local a répondu HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error("Ollama local a renvoyé un JSON invalide.");
  }
}

function expectedCases() {
  return assistantResponseQwenDevelopmentD2.cases.map(entry => ({
    ...entry,
    prepared: prepareAssistantQwenDevelopmentCase(entry)
  }));
}

function buildReport(run) {
  const cases = expectedCases();
  const observationsById = new Map();
  for (const observation of run.observations) {
    if (!observation || typeof observation.caseId !== "string" ||
        !cases.some(entry => entry.id === observation.caseId) ||
        observationsById.has(observation.caseId)) {
      throw new TypeError("Une observation D2 est inconnue ou dupliquée.");
    }
    observationsById.set(observation.caseId, observation);
  }

  const gateMismatches = [];
  const localStatusMismatches = [];
  const validationErrors = [];
  const unavailable = [];
  let expectedCalls = 0;
  let actualCalls = 0;
  let exactModelStatuses = 0;
  let validModelOutputs = 0;
  let modelStatusFailures = 0;
  let suppressedUnexpectedCalls = 0;

  for (const entry of cases) {
    if (entry.expectedQwenCall) expectedCalls += 1;
    const observation = observationsById.get(entry.id);
    if (!observation) continue;
    const gate = entry.prepared.qwenEvidence.length > 0 ? "call" : "blocked";
    if (observation.gate !== gate ||
        JSON.stringify(observation.gateEvidence) !== JSON.stringify(entry.prepared.qwenEvidence)) {
      gateMismatches.push(entry.id);
    }
    if ((gate === "call") !== entry.expectedQwenCall) {
      gateMismatches.push(entry.id);
    }
    if (observation.localStatus !== entry.expectedLocalStatus) localStatusMismatches.push(entry.id);
    if (observation.modelInvoked) {
      actualCalls += 1;
      if (!entry.expectedQwenCall || gate !== "call" ||
          JSON.stringify(observation.sentEvidence) !== JSON.stringify(entry.prepared.qwenEvidence)) {
        validationErrors.push({ caseId: entry.id, error: "L'entrée envoyée dépasse la barrière D2 attendue." });
        continue;
      }
      if (typeof observation.error === "string") {
        unavailable.push(entry.id);
        continue;
      }
      if (!Object.hasOwn(observation, "output")) {
        validationErrors.push({ caseId: entry.id, error: "Sortie brute absente après appel déclaré." });
        continue;
      }
      try {
        const output = validateLocalQwenOutput(observation.output, observation.sentEvidence);
        validModelOutputs += 1;
        if (output.status === "answered") exactModelStatuses += 1;
        else modelStatusFailures += 1;
      } catch (error) {
        validationErrors.push({
          caseId: entry.id,
          error: error instanceof Error ? error.message : "Réponse Qwen invalide."
        });
      }
    } else if (entry.expectedQwenCall) {
      if (gate === "call") {
        unavailable.push(entry.id);
      }
    } else if (gate === "call" && observation.modelCallSuppressed !== true) {
      validationErrors.push({ caseId: entry.id, error: "Un appel non prévu n'a pas été neutralisé par le runner D2." });
    }
    if (gate === "call" && !entry.expectedQwenCall && observation.modelCallSuppressed === true) {
      suppressedUnexpectedCalls += 1;
    }
  }

  const missing = cases.filter(entry => !observationsById.has(entry.id)).map(entry => entry.id);
  const compared = cases.length - missing.length;
  const uniqueGateMismatches = [...new Set(gateMismatches)];
  const exactGateAgreement = compared
    ? 1 - uniqueGateMismatches.length / compared
    : null;
  const exactLocalStatusAgreement = compared
    ? 1 - localStatusMismatches.length / compared
    : null;
  const exactModelStatusRate = validModelOutputs
    ? exactModelStatuses / validModelOutputs
    : null;
  const gatePasses = compared === cases.length && missing.length === 0 &&
    gateMismatches.length === 0 && localStatusMismatches.length === 0 &&
    unavailable.length === 0 && validationErrors.length === 0 &&
    validModelOutputs === expectedCalls && modelStatusFailures === 0;

  return {
    developmentSetId: assistantResponseQwenDevelopmentD2.developmentSetId,
    corpusVersion: assistantResponseQwenDevelopmentD2.version,
    promptVersion: run.promptVersion,
    candidate: run.candidate,
    eligible: cases.length,
    submitted: observationsById.size,
    missing,
    expectedCalls,
    actualCalls,
    suppressedUnexpectedCalls,
    exactGateAgreement,
    exactLocalStatusAgreement,
    modelOutputs: validModelOutputs,
    exactModelStatusRate,
    modelStatusFailures,
    gateMismatches: uniqueGateMismatches,
    localStatusMismatches,
    unavailable,
    responseValidationFailures: validationErrors.length,
    validationErrors,
    developmentGate: {
      passes: gatePasses,
      requirement: "Accord exact sur la barrière, le statut local et les sorties Qwen valides des seuls cas admissibles."
    },
    semanticReviewRequired: true,
    productionReady: false
  };
}

async function runLocalCampaign(outputPath) {
  const [runtime, tags] = await Promise.all([
    getOllamaJson("/api/version"),
    getOllamaJson("/api/tags")
  ]);
  const installedModel = tags.models?.find(item => item.name === LOCAL_QWEN_MODEL);
  if (!installedModel?.digest) {
    throw new Error(`Le modèle local "${LOCAL_QWEN_MODEL}" n'est pas installé avec un digest vérifiable.`);
  }
  const observations = [];
  for (const [index, entry] of assistantResponseQwenDevelopmentD2.cases.entries()) {
    const startedAt = performance.now();
    const prepared = prepareAssistantQwenDevelopmentCase(entry);
    const gate = prepared.qwenEvidence.length ? "call" : "blocked";
    const observation = {
      caseId: entry.id,
      contextStatus: prepared.contextStatus,
      localStatus: prepared.localStatus,
      gate,
      gateEvidence: prepared.qwenEvidence,
      modelInvoked: false,
      modelCallSuppressed: gate === "call" && !entry.expectedQwenCall
    };
    if (entry.expectedQwenCall && gate === "call") {
      observation.modelInvoked = true;
      observation.sentEvidence = prepared.qwenEvidence;
      try {
        observation.output = await requestLocalQwenRawOutput({
          question: entry.input.question,
          evidence: prepared.qwenEvidence
        });
      } catch (error) {
        observation.error = error instanceof Error ? error.message : "Erreur locale non détaillée";
      }
    }
    observation.elapsedMs = Number((performance.now() - startedAt).toFixed(1));
    observations.push(observation);
    console.log(`[${index + 1}/${assistantResponseQwenDevelopmentD2.cases.length}] ${entry.id} : ${gate === "call" && observation.modelInvoked ? "sortie brute conservée" : gate}`);
  }
  const run = {
    datasetId: assistantResponseQwenDevelopmentD2.developmentSetId,
    corpusVersion: assistantResponseQwenDevelopmentD2.version,
    promptVersion: LOCAL_QWEN_PROMPT_VERSION,
    candidate: { model: LOCAL_QWEN_MODEL, digest: installedModel.digest, runtime: runtime.version },
    environment: { platform: os.platform(), architecture: os.arch() },
    settings: { ...LOCAL_QWEN_OPTIONS, think: false },
    observations
  };
  await writeFile(outputPath, JSON.stringify(run, null, 2), { encoding: "utf8", flag: "wx" });
  return { outputPath, ...buildReport(run) };
}

async function main() {
  const args = process.argv.slice(2);
  const summary = validateAssistantResponseQwenD2(assistantResponseQwenDevelopmentD2);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({ ...summary, modelRuns: 0 }, null, 2));
    return;
  }
  if (args.length === 2 && args[0] === "run-local") {
    const report = await runLocalCampaign(args[1]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.developmentGate.passes
      ? 0
      : report.unavailable.length || report.missing.length ? 2 : 1;
    return;
  }
  if (args.length === 2 && args[0] === "evaluate") {
    const run = await readJson(args[1]);
    if (run.datasetId !== assistantResponseQwenDevelopmentD2.developmentSetId ||
        run.corpusVersion !== assistantResponseQwenDevelopmentD2.version ||
        typeof run.promptVersion !== "string" || !Array.isArray(run.observations)) {
      throw new Error("Campagne incompatible avec le jeu de développement Qwen D2.");
    }
    const report = buildReport(run);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.developmentGate.passes
      ? 0
      : report.unavailable.length || report.missing.length ? 2 : 1;
    return;
  }
  throw new Error("Usage : node scripts\\evaluate-assistant-qwen-d2.js check | run-local <run.json> | evaluate <run.json>");
}

main().catch(error => {
  console.error(`Évaluation Qwen D2 : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
  process.exitCode = 1;
});
