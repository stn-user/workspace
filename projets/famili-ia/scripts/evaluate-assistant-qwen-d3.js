import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import {
  LOCAL_QWEN_MODEL,
  LOCAL_QWEN_OPTIONS,
  LOCAL_QWEN_PROMPT_VERSION,
  requestLocalQwenRawOutput,
  validateLocalQwenOutput
} from "../assistant-local-qwen.js";
import {
  prepareAssistantQwenDevelopmentCase,
  validateAssistantResponseQwenD3
} from "../assistant-qwen-development-gate.js";
import { assistantResponseQwenDevelopmentD3 } from "../tests/assistant-response-qwen-development-d3.js";

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
  return assistantResponseQwenDevelopmentD3.cases.map(entry => ({
    ...entry,
    prepared: prepareAssistantQwenDevelopmentCase(entry)
  }));
}

export function buildAssistantQwenD3Report(run) {
  if (!run || run.datasetId !== assistantResponseQwenDevelopmentD3.developmentSetId ||
      run.corpusVersion !== assistantResponseQwenDevelopmentD3.version ||
      typeof run.promptVersion !== "string" || !run.promptVersion.trim() ||
      !Array.isArray(run.observations)) {
    throw new TypeError("Campagne incompatible avec le jeu de développement Qwen D3.");
  }
  const cases = expectedCases();
  const observationsById = new Map();
  for (const observation of run.observations) {
    if (!observation || typeof observation.caseId !== "string" ||
        !cases.some(entry => entry.id === observation.caseId) ||
        observationsById.has(observation.caseId)) {
      throw new TypeError("Une observation D3 est inconnue ou dupliquée.");
    }
    observationsById.set(observation.caseId, observation);
  }

  const gateMismatches = [];
  const localStatusMismatches = [];
  const outputFailures = [];
  const unavailable = [];
  let expectedCalls = 0;
  let actualCalls = 0;
  let validModelOutputs = 0;
  let modelStatusFailures = 0;

  for (const entry of cases) {
    if (entry.expectedQwenCall) expectedCalls += 1;
    const observation = observationsById.get(entry.id);
    if (!observation) continue;
    const expectedGate = entry.expectedQwenCall ? "call" : "blocked";
    if (observation.gate !== expectedGate ||
        JSON.stringify(observation.gateEvidence) !== JSON.stringify(entry.prepared.qwenEvidence)) {
      gateMismatches.push(entry.id);
    }
    if ((observation.localStatus === "supported") !== entry.expectedQwenCall ||
        observation.localStatus !== entry.expectedLocalStatus) {
      localStatusMismatches.push(entry.id);
    }
    if (observation.modelInvoked) {
      actualCalls += 1;
      if (!entry.expectedQwenCall || expectedGate !== "call" ||
          JSON.stringify(observation.sentEvidence) !== JSON.stringify(entry.prepared.qwenEvidence)) {
        outputFailures.push({ caseId: entry.id, error: "L'entrée envoyée dépasse la barrière D3 attendue." });
        continue;
      }
      if (typeof observation.error === "string") {
        unavailable.push(entry.id);
        continue;
      }
      if (!Object.hasOwn(observation, "output")) {
        outputFailures.push({ caseId: entry.id, error: "Sortie brute absente après appel déclaré." });
        continue;
      }
      try {
        const output = validateLocalQwenOutput(observation.output, observation.sentEvidence);
        validModelOutputs += 1;
        if (output.status !== "answered") {
          modelStatusFailures += 1;
          outputFailures.push({ caseId: entry.id, error: `Statut inattendu : ${output.status}.` });
        }
        for (const required of entry.prepared.qwenEvidence) {
          const cited = output.claims.some(claim => claim.citations.some(citation =>
            citation.evidenceId === required.id
          ));
          if (!cited) {
            outputFailures.push({
              caseId: entry.id,
              error: `La preuve requise "${required.id}" n'est pas citée.`
            });
          }
        }
      } catch (error) {
        outputFailures.push({
          caseId: entry.id,
          error: error instanceof Error ? error.message : "Réponse Qwen invalide."
        });
      }
    } else if (entry.expectedQwenCall) {
      unavailable.push(entry.id);
    }
  }

  const missing = cases.filter(entry => !observationsById.has(entry.id)).map(entry => entry.id);
  const compared = cases.length - missing.length;
  const uniqueGateMismatches = [...new Set(gateMismatches)];
  const uniqueLocalStatusMismatches = [...new Set(localStatusMismatches)];
  const passes = compared === cases.length && missing.length === 0 &&
    uniqueGateMismatches.length === 0 && uniqueLocalStatusMismatches.length === 0 &&
    unavailable.length === 0 && outputFailures.length === 0 &&
    validModelOutputs === expectedCalls && actualCalls === expectedCalls;

  return {
    developmentSetId: assistantResponseQwenDevelopmentD3.developmentSetId,
    corpusVersion: assistantResponseQwenDevelopmentD3.version,
    promptVersion: run.promptVersion,
    candidate: run.candidate ?? null,
    eligible: cases.length,
    submitted: observationsById.size,
    missing,
    expectedCalls,
    actualCalls,
    validModelOutputs,
    modelStatusFailures,
    gateMismatches: uniqueGateMismatches,
    localStatusMismatches: uniqueLocalStatusMismatches,
    unavailable,
    responseValidationFailures: outputFailures.length,
    validationErrors: outputFailures,
    developmentGate: {
      passes,
      requirement: "Accord exact sur la barrière, le statut local et les sorties Qwen valides avec citations requises."
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
    throw new Error(`Le modèle local "${LOCAL_QWEN_MODEL}" n'est pas installé avec un digest vérifiable ; aucun téléchargement ne sera tenté.`);
  }
  if (typeof runtime?.version !== "string" || !runtime.version) {
    throw new Error("La version du runtime Ollama local n'est pas vérifiable.");
  }
  const observations = [];

  for (const [index, entry] of assistantResponseQwenDevelopmentD3.cases.entries()) {
    const startedAt = performance.now();
    const prepared = prepareAssistantQwenDevelopmentCase(entry);
    const gate = prepared.qwenEvidence.length ? "call" : "blocked";
    const observation = {
      caseId: entry.id,
      contextStatus: prepared.contextStatus,
      localStatus: prepared.localStatus,
      gate,
      gateEvidence: prepared.qwenEvidence,
      modelInvoked: false
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
        observation.error = error instanceof Error ? error.message : "Erreur locale non détaillée.";
      }
    }
    observation.elapsedMs = Number((performance.now() - startedAt).toFixed(1));
    observations.push(observation);
    const outcome = observation.error ? "erreur locale" :
      gate === "call" && observation.modelInvoked ? "sortie brute conservée" : gate;
    console.log(`[${index + 1}/${assistantResponseQwenDevelopmentD3.cases.length}] ${entry.id} : ${outcome}`);
  }

  const run = {
    datasetId: assistantResponseQwenDevelopmentD3.developmentSetId,
    corpusVersion: assistantResponseQwenDevelopmentD3.version,
    promptVersion: LOCAL_QWEN_PROMPT_VERSION,
    candidate: { model: LOCAL_QWEN_MODEL, digest: installedModel.digest, runtime: runtime.version },
    environment: { platform: os.platform(), architecture: os.arch() },
    settings: { ...LOCAL_QWEN_OPTIONS, think: false },
    observations
  };
  await writeFile(outputPath, JSON.stringify(run, null, 2), { encoding: "utf8", flag: "wx" });
  return { outputPath, ...buildAssistantQwenD3Report(run) };
}

async function main() {
  const args = process.argv.slice(2);
  const summary = validateAssistantResponseQwenD3(assistantResponseQwenDevelopmentD3);
  if (args.length === 1 && args[0] === "check") {
    const prepared = expectedCases();
    console.log(JSON.stringify({
      ...summary,
      expectedQwenCalls: prepared.filter(entry => entry.expectedQwenCall).length,
      promptVersion: LOCAL_QWEN_PROMPT_VERSION,
      model: LOCAL_QWEN_MODEL,
      modelRuns: 0
    }, null, 2));
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
    const report = buildAssistantQwenD3Report(run);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.developmentGate.passes
      ? 0
      : report.unavailable.length || report.missing.length ? 2 : 1;
    return;
  }
  throw new Error("Usage : node scripts\\evaluate-assistant-qwen-d3.js check | run-local <run.json> | evaluate <run.json>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Évaluation Qwen D3 : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
    process.exitCode = 1;
  });
}
