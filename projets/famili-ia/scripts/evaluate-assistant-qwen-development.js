import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  evaluateAssistantResponseDecisions,
  prepareLocalQwenDevelopmentInputs,
  validateAssistantResponseDevelopmentSet
} from "../assistant-response-evaluation.js";
import {
  LOCAL_QWEN_MODEL,
  LOCAL_QWEN_OPTIONS,
  LOCAL_QWEN_PROMPT_VERSION,
  requestLocalQwenRawOutput,
  validateLocalQwenOutput
} from "../assistant-local-qwen.js";
import { assistantResponseQwenDevelopment } from "../tests/assistant-response-qwen-development.js";

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
  return assistantResponseQwenDevelopment.cases.map(entry => ({
    caseId: entry.id,
    expectedStatus: entry.expectedStatus,
    category: entry.category
  }));
}

function buildReport(run) {
  const decisionSummary = evaluateAssistantResponseDecisions(expectedCases(), run.observations);
  const casesById = new Map(assistantResponseQwenDevelopment.cases.map(entry => [entry.id, entry]));
  const validationErrors = [];
  for (const observation of run.observations) {
    if (!Object.hasOwn(observation, "output")) continue;
    const entry = casesById.get(observation.caseId);
    const evidence = entry.input.evidence.map(({ id, text }) => ({ id, text, verified: true }));
    try {
      validateLocalQwenOutput(observation.output, evidence);
    } catch (error) {
      validationErrors.push({
        caseId: observation.caseId,
        error: error instanceof Error ? error.message : "Réponse Qwen invalide."
      });
    }
  }
  return {
    developmentSetId: assistantResponseQwenDevelopment.developmentSetId,
    corpusVersion: assistantResponseQwenDevelopment.version,
    promptVersion: run.promptVersion,
    candidate: run.candidate,
    decisionSummary,
    responseValidationFailures: validationErrors.length,
    validationErrors,
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
  const inputBundle = prepareLocalQwenDevelopmentInputs(assistantResponseQwenDevelopment);
  const observations = [];

  for (const [index, item] of inputBundle.cases.entries()) {
    const startedAt = performance.now();
    try {
      const output = await requestLocalQwenRawOutput(item.input);
      observations.push({
        caseId: item.caseId,
        output,
        elapsedMs: Number((performance.now() - startedAt).toFixed(1))
      });
      console.log(`[${index + 1}/${inputBundle.cases.length}] ${item.caseId} : sortie brute conservée`);
    } catch (error) {
      observations.push({
        caseId: item.caseId,
        error: error instanceof Error ? error.message : "Erreur locale non détaillée",
        elapsedMs: Number((performance.now() - startedAt).toFixed(1))
      });
      console.error(`[${index + 1}/${inputBundle.cases.length}] ${item.caseId} : erreur enregistrée`);
    }
  }

  const run = {
    datasetId: inputBundle.datasetId,
    corpusVersion: inputBundle.corpusVersion,
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
  const summary = validateAssistantResponseDevelopmentSet(assistantResponseQwenDevelopment);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({ ...summary, modelRuns: 0 }, null, 2));
    return;
  }
  if (args.length === 2 && args[0] === "export") {
    const bundle = prepareLocalQwenDevelopmentInputs(assistantResponseQwenDevelopment);
    await writeFile(args[1], JSON.stringify(bundle, null, 2), { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({
      datasetId: bundle.datasetId,
      exported: bundle.cases.length,
      expectedLabelsIncluded: false,
      modelRuns: 0
    }));
    return;
  }
  if (args.length === 2 && args[0] === "run-local") {
    const report = await runLocalCampaign(args[1]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.decisionSummary.decisionGate.passes &&
      report.responseValidationFailures === 0 ? 0
      : report.decisionSummary.missing || report.decisionSummary.unavailable ? 2 : 1;
    return;
  }
  if (args.length === 2 && args[0] === "evaluate") {
    const run = await readJson(args[1]);
    if (run.datasetId !== assistantResponseQwenDevelopment.developmentSetId ||
        run.corpusVersion !== assistantResponseQwenDevelopment.version ||
        typeof run.promptVersion !== "string" || !Array.isArray(run.observations)) {
      throw new Error("Campagne incompatible avec le jeu de développement Qwen.");
    }
    const report = buildReport(run);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.decisionSummary.decisionGate.passes &&
      report.responseValidationFailures === 0 ? 0
      : report.decisionSummary.missing || report.decisionSummary.unavailable ? 2 : 1;
    return;
  }
  throw new Error("Usage : node scripts\\evaluate-assistant-qwen-development.js check | export <inputs.json> | run-local <run.json> | evaluate <run.json>");
}

main().catch(error => {
  console.error(`Évaluation du jeu de développement Qwen : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
  process.exitCode = 1;
});
