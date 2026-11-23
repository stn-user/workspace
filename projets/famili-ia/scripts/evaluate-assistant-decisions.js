import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import {
  evaluateAssistantResponseDecisions,
  prepareAssistantResponseInputs,
  validateAssistantResponseHoldout
} from "../assistant-response-evaluation.js";
import { prepareAssistantBenchmark } from "../assistant-evaluation.js";
import { assistantResponseHoldout } from "../tests/assistant-response-holdout.js";

const endpoint = "http://127.0.0.1:11434";
const model = "qwen3:8b";
const options = { temperature: 0.2, top_p: 0.9, num_predict: 1024 };

async function readJson(path) {
  const content = await readFile(path, "utf8");
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Fichier JSON invalide ; aucun contenu n'a été affiché.");
  }
}

async function requestJson(path, body = undefined) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), body ? 120_000 : 5_000);
  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Ollama a répondu HTTP ${response.status} : ${await response.text()}`);
    try {
      return await response.json();
    } catch {
      throw new Error("Ollama a renvoyé un JSON invalide.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function runLocalCampaign(outputPath) {
  const [runtime, tags] = await Promise.all([
    requestJson("/api/version"),
    requestJson("/api/tags")
  ]);
  const installedModel = tags.models?.find(item => item.name === model);
  if (!installedModel?.digest) throw new Error(`Le modèle local "${model}" n'est pas installé avec un digest vérifiable.`);
  const a2Corpus = await readJson(new URL("../tests/fixtures/assistant-evaluation.json", import.meta.url));
  const a2Protocol = await prepareAssistantBenchmark(a2Corpus);
  const inputs = prepareAssistantResponseInputs(assistantResponseHoldout);
  const observations = [];

  for (const [index, item] of inputs.cases.entries()) {
    const startedAt = performance.now();
    try {
      const payload = await requestJson("/api/chat", {
        model,
        messages: [
          a2Protocol.cases[0].messages[0],
          { role: "user", content: JSON.stringify(item.input) }
        ],
        format: a2Protocol.responseContract,
        stream: false,
        think: false,
        options
      });
      if (payload.message?.role !== "assistant" || typeof payload.message.content !== "string") {
        throw new Error("Ollama n'a pas renvoyé de message assistant exploitable.");
      }
      observations.push({
        caseId: item.caseId,
        output: payload.message.content,
        elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
        usage: {
          inputTokens: payload.prompt_eval_count,
          outputTokens: payload.eval_count
        }
      });
      console.log(`[${index + 1}/${inputs.cases.length}] ${item.caseId} : sortie reçue`);
    } catch (error) {
      observations.push({
        caseId: item.caseId,
        error: error instanceof Error ? error.message : "Erreur locale non détaillée",
        elapsedMs: Number((performance.now() - startedAt).toFixed(1))
      });
      console.error(`[${index + 1}/${inputs.cases.length}] ${item.caseId} : erreur enregistrée`);
    }
  }

  const run = {
    corpusVersion: inputs.corpusVersion,
    decisionProtocol: "A3-response-status-1.0.0",
    candidate: { model, digest: installedModel.digest, runtime: runtime.version },
    environment: { platform: os.platform(), architecture: os.arch() },
    settings: { ...options, think: false, format: "assistant A2 response schema" },
    observations
  };
  await writeFile(outputPath, JSON.stringify(run, null, 2), { encoding: "utf8", flag: "wx" });
  const summary = evaluateAssistantResponseDecisions(
    assistantResponseHoldout.cases.map(entry => ({
      caseId: entry.id, expectedStatus: entry.expectedStatus, category: entry.category
    })),
    observations
  );
  return {
    outputPath,
    model: run.candidate,
    settings: run.settings,
    submitted: summary.submitted,
    missing: summary.missing,
    unavailable: summary.unavailable,
    elapsedMs: Number(observations.reduce((sum, item) => sum + item.elapsedMs, 0).toFixed(1)),
    rawOutputsPersisted: true,
    decisionSummary: summary
  };
}

async function main() {
  const args = process.argv.slice(2);
  const summary = validateAssistantResponseHoldout(assistantResponseHoldout);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({ ...summary, modelRuns: 0 }, null, 2));
    return;
  }
  if (args.length === 2 && args[0] === "export") {
    const bundle = prepareAssistantResponseInputs(assistantResponseHoldout);
    await writeFile(args[1], JSON.stringify(bundle, null, 2), { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({ exported: bundle.cases.length, expectedLabelsIncluded: false, modelRuns: 0 }));
    return;
  }
  if (args.length === 2 && args[0] === "run-local") {
    const report = await runLocalCampaign(args[1]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.decisionSummary.decisionGate.passes ? 0
      : report.missing || report.unavailable ? 2 : 1;
    return;
  }
  if (args.length === 2 && args[0] === "evaluate") {
    const run = await readJson(args[1]);
    if (run.corpusVersion !== assistantResponseHoldout.version || !Array.isArray(run.observations)) {
      throw new Error("Campagne de décisions incompatible avec le corpus attendu.");
    }
    const report = evaluateAssistantResponseDecisions(
      assistantResponseHoldout.cases.map(entry => ({
        caseId: entry.id, expectedStatus: entry.expectedStatus, category: entry.category
      })),
      run.observations
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.decisionGate.passes ? 0
      : report.missing || report.unavailable ? 2 : 1;
    return;
  }
  throw new Error("Usage : node scripts\\evaluate-assistant-decisions.js check | export <inputs.json> | run-local <run.json> | evaluate <observations.json>");
}

main().catch(error => {
  console.error(`Évaluation des décisions de réponse : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
  process.exitCode = 1;
});
