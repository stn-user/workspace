import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareAssistantQwenDevelopmentCase } from "../assistant-qwen-development-gate.js";
import { buildAssistantQwenD3Report } from "../scripts/evaluate-assistant-qwen-d3.js";
import { assistantResponseQwenDevelopmentD3 } from "./assistant-response-qwen-development-d3.js";

function controlRun() {
  return {
    datasetId: "D3",
    corpusVersion: "1.0.0",
    promptVersion: "1.1.0",
    candidate: { model: "synthetic-control", digest: "unit-test", runtime: "none" },
    observations: assistantResponseQwenDevelopmentD3.cases.map(entry => {
      const prepared = prepareAssistantQwenDevelopmentCase(entry);
      const gate = prepared.qwenEvidence.length ? "call" : "blocked";
      const observation = {
        caseId: entry.id,
        contextStatus: prepared.contextStatus,
        localStatus: prepared.localStatus,
        gate,
        gateEvidence: prepared.qwenEvidence,
        modelInvoked: entry.expectedQwenCall
      };
      if (entry.expectedQwenCall) {
        observation.sentEvidence = prepared.qwenEvidence;
        observation.output = JSON.stringify({
          status: "answered",
          answer: entry.expectedFacts[0],
          claims: prepared.qwenEvidence.map(evidence => ({
            text: entry.expectedFacts[0],
            citations: [{
              evidenceId: evidence.id,
              quote: evidence.text.slice(evidence.text.indexOf(": ") + 2)
            }]
          }))
        });
      }
      return observation;
    })
  };
}

test("D3 report checks the deterministic gate, valid Qwen responses, and required evidence", () => {
  const report = buildAssistantQwenD3Report(controlRun());
  assert.equal(report.developmentGate.passes, true);
  assert.equal(report.eligible, 20);
  assert.equal(report.expectedCalls, 8);
  assert.equal(report.actualCalls, 8);
  assert.equal(report.validModelOutputs, 8);
  assert.equal(report.responseValidationFailures, 0);
  assert.equal(report.semanticReviewRequired, true);
  assert.equal(report.productionReady, false);

  const brokenRun = controlRun();
  brokenRun.observations.find(item => item.modelInvoked).output = JSON.stringify({
    status: "answered",
    answer: "Une réponse sans citation.",
    claims: []
  });
  const rejected = buildAssistantQwenD3Report(brokenRun);
  assert.equal(rejected.developmentGate.passes, false);
  assert.ok(rejected.responseValidationFailures > 0);

  const wrongEvidenceRun = controlRun();
  const answerable = wrongEvidenceRun.observations.find(item => item.modelInvoked);
  const output = JSON.parse(answerable.output);
  output.claims[0].citations[0].evidenceId = "unknown-evidence";
  answerable.output = JSON.stringify(output);
  const rejectedWrongEvidence = buildAssistantQwenD3Report(wrongEvidenceRun);
  assert.equal(rejectedWrongEvidence.developmentGate.passes, false);
  assert.ok(rejectedWrongEvidence.responseValidationFailures > 0);
});

test("D3 CLI check validates the set without calling a model", () => {
  const script = fileURLToPath(new URL("../scripts/evaluate-assistant-qwen-d3.js", import.meta.url));
  const result = spawnSync(process.execPath, [script, "check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.developmentSetId, "D3");
  assert.equal(summary.cases, 20);
  assert.equal(summary.expectedQwenCalls, 8);
  assert.equal(summary.modelRuns, 0);
});
