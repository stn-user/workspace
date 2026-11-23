import { readFile, writeFile } from "node:fs/promises";
import {
  evaluateAssistantResponseDecisions,
  prepareLocalQwenResponseInputs,
  validateAssistantResponseHoldout
} from "../assistant-response-evaluation.js";
import {
  validateLocalQwenOutput
} from "../assistant-local-qwen.js";
import { assistantResponseHoldoutA4 } from "../tests/assistant-response-holdout-a4.js";

async function readJson(path) {
  const content = await readFile(path, "utf8");
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Fichier JSON invalide ; aucun contenu n'a été affiché.");
  }
}

function expectedCases() {
  return assistantResponseHoldoutA4.cases.map(entry => ({
    caseId: entry.id,
    expectedStatus: entry.expectedStatus,
    category: entry.category
  }));
}

function buildReport(run) {
  const decisionSummary = evaluateAssistantResponseDecisions(expectedCases(), run.observations);
  const casesById = new Map(assistantResponseHoldoutA4.cases.map(entry => [entry.id, entry]));
  const validationErrors = [];
  for (const observation of run.observations) {
    if (!Object.hasOwn(observation, "output")) continue;
    const entry = casesById.get(observation.caseId);
    const evidence = entry.input.evidence.filter(item => item.verified)
      .map(({ id, text }) => ({ id, text, verified: true }));
    try {
      validateLocalQwenOutput(observation.output, evidence);
    } catch (error) {
      validationErrors.push({
        caseId: observation.caseId,
        error: error instanceof Error ? error.message : "Réponse Qwen invalide."
      });
    }
  }
  const strictGatePasses = decisionSummary.decisionGate.passes && validationErrors.length === 0;
  return {
    controlId: assistantResponseHoldoutA4.controlId,
    promptVersion: run.promptVersion,
    candidate: run.candidate,
    decisionSummary,
    responseValidationFailures: validationErrors.length,
    validationErrors,
    strictGate: {
      passes: strictGatePasses,
      requirement: "statuts exacts pour chaque cas et réponses/citations conformes au contrat",
      semanticReviewRequired: true,
      productionReady: false
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const summary = validateAssistantResponseHoldout(assistantResponseHoldoutA4);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({
      controlId: assistantResponseHoldoutA4.controlId,
      ...summary,
      modelRuns: 0
    }, null, 2));
    return;
  }
  if (args.length === 2 && args[0] === "export") {
    const bundle = prepareLocalQwenResponseInputs(assistantResponseHoldoutA4);
    await writeFile(args[1], JSON.stringify(bundle, null, 2), { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({
      controlId: bundle.controlId,
      exported: bundle.cases.length,
      expectedLabelsIncluded: false,
      modelRuns: 0
    }));
    return;
  }
  if (args.length === 2 && args[0] === "run-local") {
    throw new Error("A4 a déjà été exécuté et consulté ; ne le relancez pas. Utilisez un jeu de développement neuf, puis A5.");
  }
  if (args.length === 2 && args[0] === "evaluate") {
    const run = await readJson(args[1]);
    if (run.controlId !== assistantResponseHoldoutA4.controlId ||
        run.corpusVersion !== assistantResponseHoldoutA4.version ||
        run.promptVersion !== "1.0.0" ||
        !Array.isArray(run.observations)) {
      throw new Error("Campagne incompatible avec le contrôle A4 ou la version actuelle des consignes.");
    }
    const report = buildReport(run);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.strictGate.passes ? 0
      : report.decisionSummary.missing || report.decisionSummary.unavailable ? 2 : 1;
    return;
  }
  throw new Error("Usage : node scripts\\evaluate-assistant-qwen-control.js check | export <inputs.json> | evaluate <run.json>");
}

main().catch(error => {
  console.error(`Évaluation du contrôle Qwen A4 : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
  process.exitCode = 1;
});
