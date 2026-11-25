import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildA5Report,
  evaluateA5Review,
  prepareA5Review
} from "../scripts/evaluate-assistant-qwen-a5.js";
import { LOCAL_QWEN_MODEL, LOCAL_QWEN_PROMPT_VERSION } from "../assistant-local-qwen.js";
import { prepareAssistantQwenDevelopmentCase } from "../assistant-qwen-development-gate.js";
import { assistantResponseHoldoutA5 } from "./assistant-response-holdout-a5.js";

function makeValidRun() {
  return {
    controlId: "A5",
    corpusVersion: assistantResponseHoldoutA5.version,
    promptVersion: LOCAL_QWEN_PROMPT_VERSION,
    candidate: { model: LOCAL_QWEN_MODEL, digest: "synthetic-test-digest", runtime: "test" },
    observations: assistantResponseHoldoutA5.cases.map(entry => {
      const prepared = prepareAssistantQwenDevelopmentCase(entry);
      const gate = prepared.qwenEvidence.length ? "call" : "blocked";
      const observation = {
        caseId: entry.id,
        contextStatus: prepared.contextStatus,
        localStatus: prepared.localStatus,
        localAnswer: prepared.localAnswer,
        gate,
        gateEvidence: prepared.qwenEvidence,
        modelInvoked: entry.expectedQwenCall,
        modelCallSuppressed: false
      };
      if (entry.expectedQwenCall) {
        const fact = entry.expectedFacts[0];
        observation.sentEvidence = prepared.qwenEvidence;
        observation.output = JSON.stringify({
          status: "answered",
          answer: fact,
          claims: [{
            text: fact,
            citations: [{ evidenceId: prepared.qwenEvidence[0].id, quote: fact }]
          }]
        });
      }
      return observation;
    })
  };
}

test("A5 report checks the frozen local gate and answer contract", () => {
  const report = buildA5Report(makeValidRun());
  assert.equal(report.expectedCalls, 8);
  assert.equal(report.actualCalls, 8);
  assert.equal(report.modelOutputs, 8);
  assert.equal(report.exactGateAgreement, 1);
  assert.equal(report.exactLocalStatusAgreement, 1);
  assert.equal(report.strictGate.passes, true);
  assert.equal(report.strictGate.productionReady, false);
});

test("A5 review packet is blinded, fingerprinted, and requires complete independent verdicts", () => {
  const { packet, key } = prepareA5Review(makeValidRun());
  assert.equal(packet.cases.length, 40);
  assert.equal(packet.cases.every(entry => !Object.hasOwn(entry, "category") &&
    !Object.hasOwn(entry, "expectedStatus") && !Object.hasOwn(entry, "reviewRubric")), true);
  packet.review.independentReviewConfirmed = true;
  packet.review.runOutputsNotConsultedBeforeReview = true;
  packet.review.assessments = packet.review.assessments.map(entry => ({
    ...entry,
    verdict: "pass",
    rationale: "La réponse est adaptée aux preuves présentées."
  }));
  assert.equal(evaluateA5Review(packet, key).result, "semantic-review-passed");

  const alteredPacket = structuredClone(packet);
  alteredPacket.cases[0].candidateOutput.answer = "Réponse modifiée.";
  assert.throws(() => evaluateA5Review(alteredPacket, key), /paquet A5 a changé/);

  const failedReview = structuredClone(packet);
  failedReview.review.assessments[0].verdict = "fail";
  failedReview.review.assessments[0].rationale = "La réponse contredit la preuve.";
  const report = evaluateA5Review(failedReview, key);
  assert.equal(report.result, "follow-up-required");
  assert.equal(report.failedCases, 1);
  assert.equal(report.productionReady, false);
});

test("A5 runner refuses a second model campaign after the control run", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/evaluate-assistant-qwen-a5.js", import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, "run-local", "unused-a5-run.json"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /campagne A5 est fermée après son exécution unique/);
});
