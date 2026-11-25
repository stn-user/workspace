import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  evaluateAssistantResponseDecisions,
  prepareLocalQwenDevelopmentInputs,
  prepareAssistantResponseInputs,
  prepareLocalQwenResponseInputs,
  validateAssistantResponseHoldout,
  validateAssistantResponseDevelopmentSet
} from "../assistant-response-evaluation.js";
import { assistantResponseHoldout } from "./assistant-response-holdout.js";
import { assistantResponseHoldoutA4 } from "./assistant-response-holdout-a4.js";
import { assistantResponseQwenDevelopment } from "./assistant-response-qwen-development.js";

function controlObservations(cases = assistantResponseHoldout.cases) {
  return cases.map(entry => ({
    caseId: entry.id,
    output: { status: entry.expectedStatus, answer: "Contrôle synthétique.", claims: [] }
  }));
}

test("validates the 40-case synthetic decision holdout and exports no gold labels", () => {
  assert.deepEqual(validateAssistantResponseHoldout(assistantResponseHoldout), {
    cases: 40,
    categories: {
      answerable: 8,
      "fact-missing": 8,
      "no-evidence": 8,
      ambiguous: 8,
      conflicting: 8
    }
  });
  const bundle = prepareAssistantResponseInputs(assistantResponseHoldout);
  assert.equal(bundle.cases.length, 40);
  for (const entry of bundle.cases) {
    assert.deepEqual(Object.keys(entry).sort(), ["caseId", "input"]);
    assert.deepEqual(Object.keys(entry.input).sort(), ["evidence", "history", "question"]);
    assert.ok(entry.input.evidence.every(evidence => (
      Object.keys(evidence).sort().join() === "id,name,text"
    )));
  }
  const tooSmall = structuredClone(assistantResponseHoldout);
  tooSmall.cases.pop();
  assert.throws(() => validateAssistantResponseHoldout(tooSmall), /au moins 40 cas/);
});

test("A4 is balanced and exports only production-local Qwen inputs without labels or metadata", () => {
  assert.deepEqual(validateAssistantResponseHoldout(assistantResponseHoldoutA4), {
    cases: 40,
    categories: {
      answerable: 8,
      "fact-missing": 8,
      "no-evidence": 8,
      ambiguous: 8,
      conflicting: 8
    }
  });
  const bundle = prepareLocalQwenResponseInputs(assistantResponseHoldoutA4);
  assert.equal(bundle.controlId, "A4");
  assert.equal(bundle.cases.length, 40);
  for (const entry of bundle.cases) {
    assert.match(entry.caseId, /^a4-\d{3}$/);
    assert.deepEqual(Object.keys(entry).sort(), ["caseId", "input"]);
    assert.deepEqual(Object.keys(entry.input).sort(), ["evidence", "question"]);
    assert.ok(entry.input.evidence.length >= 1 && entry.input.evidence.length <= 2);
    assert.ok(entry.input.evidence.every(evidence => (
      Object.keys(evidence).sort().join() === "id,text,verified" && evidence.verified
    )));
  }
  const exportedText = JSON.stringify(bundle);
  for (const hidden of ["expectedStatus", "reviewRubric", "sourceId", "accountRef", "itemId", "name", "answerable", "conflicting"]) {
    assert.equal(exportedText.includes(hidden), false);
  }
});

test("D1 development set covers all decision classes and exports no labels or source metadata", () => {
  const summary = validateAssistantResponseDevelopmentSet(assistantResponseQwenDevelopment);
  assert.deepEqual(summary, {
    developmentSetId: "D1",
    cases: 16,
    categories: {
      answerable: 4,
      "fact-missing": 3,
      "no-evidence": 3,
      ambiguous: 3,
      conflicting: 3
    }
  });
  const bundle = prepareLocalQwenDevelopmentInputs(assistantResponseQwenDevelopment);
  assert.equal(bundle.datasetId, "D1");
  assert.equal(bundle.cases.length, 16);
  for (const entry of bundle.cases) {
    assert.deepEqual(Object.keys(entry).sort(), ["caseId", "input"]);
    assert.deepEqual(Object.keys(entry.input).sort(), ["evidence", "question"]);
    assert.ok(entry.input.evidence.length >= 1 && entry.input.evidence.length <= 2);
  }
  const exportedText = JSON.stringify(bundle);
  for (const hidden of ["expectedStatus", "reviewRubric", "sourceId", "name", "answerable", "conflicting"]) {
    assert.equal(exportedText.includes(hidden), false);
  }
  const invalid = structuredClone(assistantResponseQwenDevelopment);
  invalid.cases[0].input.evidence[0].verified = false;
  assert.throws(() => validateAssistantResponseDevelopmentSet(invalid), /non vérifiée/);
});

test("reports exact status decisions separately from non-answer safety and content review", () => {
  const cases = assistantResponseHoldout.cases.map(entry => ({
    caseId: entry.id, expectedStatus: entry.expectedStatus, category: entry.category
  }));
  const report = evaluateAssistantResponseDecisions(cases, controlObservations());
  assert.equal(report.exactDecisionAccuracy, 1);
  assert.equal(report.exactNonAnswerDecisionRate, 1);
  assert.equal(report.nonAnswerSafetyRate, 1);
  assert.equal(report.unsupportedAnswerCount, 0);
  assert.equal(report.decisionGate.passes, true);
  assert.equal(report.semanticReviewRequired, true);
  assert.equal(report.citationReviewRequired, true);
  assert.equal(report.productionReady, false);

  const faulty = controlObservations();
  faulty.find(item => item.caseId === "no-evidence-01").output.status = "answered";
  const rejected = evaluateAssistantResponseDecisions(cases, faulty);
  assert.equal(rejected.exactDecisionAccuracy, 39 / 40);
  assert.equal(rejected.unsupportedAnswerCount, 1);
  assert.equal(rejected.categories["no-evidence"].exactDecisionRate, 7 / 8);
  assert.equal(rejected.decisionGate.passes, false);
});

test("missing and malformed outcomes do not count as correct abstentions", () => {
  const cases = assistantResponseHoldout.cases.map(entry => ({
    caseId: entry.id, expectedStatus: entry.expectedStatus, category: entry.category
  }));
  const observations = controlObservations().slice(0, -1);
  observations[0].output = "{invalid";
  const report = evaluateAssistantResponseDecisions(cases, observations);
  assert.equal(report.missing, 1);
  assert.equal(report.unavailable, 2);
  assert.equal(report.decisionGate.passes, false);
  assert.equal(report.exactDecisionAccuracy, 38 / 40);
  assert.throws(() => evaluateAssistantResponseDecisions(cases, [
    { ...observations[0], error: "also has output" }
  ]), /invalide/);
});

test("decision CLI checks, exports label-free inputs, and evaluates imported statuses", async () => {
  const script = fileURLToPath(new URL("../scripts/evaluate-assistant-decisions.js", import.meta.url));
  const temp = await mkdtemp(join(tmpdir(), "famili-assistant-decisions-"));
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  try {
    const check = invoke("check");
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).modelRuns, 0);

    const inputPath = join(temp, "inputs.json");
    const exported = invoke("export", inputPath);
    assert.equal(exported.status, 0, exported.stderr);
    const bundle = JSON.parse(await readFile(inputPath, "utf8"));
    assert.equal(bundle.cases.length, 40);
    assert.ok(bundle.cases.every(entry => !Object.hasOwn(entry, "expectedStatus")));

    const runPath = join(temp, "observations.json");
    await writeFile(runPath, JSON.stringify({
      corpusVersion: assistantResponseHoldout.version,
      observations: controlObservations()
    }));
    const evaluated = invoke("evaluate", runPath);
    assert.equal(evaluated.status, 0, evaluated.stderr);
    assert.equal(JSON.parse(evaluated.stdout).decisionGate.passes, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("A3 review CLI exports an opaque blind packet and reports disagreements without changing the corpus", async () => {
  const script = fileURLToPath(new URL("../scripts/evaluate-assistant-a3-review.js", import.meta.url));
  const temp = await mkdtemp(join(tmpdir(), "famili-assistant-a3-review-"));
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  try {
    const check = invoke("check");
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).modelRuns, 0);

    const packetPath = join(temp, "review-packet.json");
    const keyPath = join(temp, "private-key.json");
    const exported = invoke("export", packetPath, keyPath);
    assert.equal(exported.status, 0, exported.stderr);
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    const key = JSON.parse(await readFile(keyPath, "utf8"));
    assert.equal(packet.cases.length, 40);
    assert.equal(packet.review.assessments.length, 40);
    assert.equal(key.mappings.length, 40);
    assert.ok(packet.cases.every(entry => /^review-\d{3}$/.test(entry.id)));
    const packetText = JSON.stringify(packet);
    for (const hidden of ["expectedStatus", "reviewRubric", "answerable-01", "fact-missing-01",
      "no-evidence-01", "ambiguous-01", "conflicting-01", "sourceCaseId"]) {
      assert.equal(packetText.includes(hidden), false);
    }

    const reviewed = structuredClone(packet);
    reviewed.review.independentReviewConfirmed = true;
    reviewed.review.candidateOutputsNotConsulted = true;
    const statusByCaseId = new Map(assistantResponseHoldout.cases.map(entry => [entry.id, entry.expectedStatus]));
    for (const assessment of reviewed.review.assessments) {
      const sourceCaseId = key.mappings.find(mapping => mapping.reviewId === assessment.caseId).sourceCaseId;
      assessment.status = statusByCaseId.get(sourceCaseId);
      assessment.rationale = "Décision vérifiée à partir de la question et des preuves.";
    }
    const reviewPath = join(temp, "review.json");
    await writeFile(reviewPath, JSON.stringify(reviewed));
    const accepted = invoke("evaluate", keyPath, reviewPath);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).agreementCount, 40);
    assert.equal(JSON.parse(accepted.stdout).corpusModified, false);

    await writeFile(reviewPath, JSON.stringify(reviewed.review));
    const detachedReview = invoke("evaluate", keyPath, reviewPath);
    assert.equal(detachedReview.status, 0, detachedReview.stderr);
    assert.equal(JSON.parse(detachedReview.stdout).agreementCount, 40);
    assert.equal(JSON.parse(detachedReview.stdout).packetContentVerified, false);
    assert.equal(JSON.parse(detachedReview.stdout).packetBinding, "opaque-case-ids-only");

    reviewed.review.assessments[0].status = reviewed.review.assessments[0].status === "answered"
      ? "abstained" : "answered";
    await writeFile(reviewPath, JSON.stringify(reviewed));
    const disputed = invoke("evaluate", keyPath, reviewPath);
    assert.equal(disputed.status, 0, disputed.stderr);
    const report = JSON.parse(disputed.stdout);
    assert.equal(report.disagreementCount, 1);
    assert.equal(report.result, "adjudication-required");
    assert.equal(report.corpusModified, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("A4 CLI validates and exports the production-local Qwen input without labels or model calls", async () => {
  const script = fileURLToPath(new URL("../scripts/evaluate-assistant-qwen-control.js", import.meta.url));
  const temp = await mkdtemp(join(tmpdir(), "famili-assistant-qwen-a4-"));
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  try {
    const check = invoke("check");
    assert.equal(check.status, 0, check.stderr);
    assert.deepEqual(JSON.parse(check.stdout), {
      controlId: "A4",
      cases: 40,
      categories: {
        answerable: 8,
        "fact-missing": 8,
        "no-evidence": 8,
        ambiguous: 8,
        conflicting: 8
      },
      modelRuns: 0
    });

    const inputPath = join(temp, "a4-inputs.json");
    const exported = invoke("export", inputPath);
    assert.equal(exported.status, 0, exported.stderr);
    const bundle = JSON.parse(await readFile(inputPath, "utf8"));
    assert.equal(bundle.cases.length, 40);
    assert.ok(bundle.cases.every(entry => !Object.hasOwn(entry.input, "expectedStatus")));
    assert.equal(JSON.stringify(bundle).includes("reviewRubric"), false);

    const rerun = invoke("run-local", join(temp, "a4-rerun.json"));
    assert.equal(rerun.status, 1);
    assert.match(rerun.stderr, /A4 a déjà été exécuté et consulté/);

    const runPath = join(temp, "a4-run.json");
    const observations = assistantResponseHoldoutA4.cases.map(entry => {
      const evidence = entry.input.evidence.filter(item => item.verified);
      const claims = entry.expectedStatus === "answered"
        ? [{
          text: evidence[0].text,
          citations: [{ evidenceId: evidence[0].id, quote: evidence[0].text }]
        }]
        : entry.expectedStatus === "conflict"
          ? evidence.map(item => ({
            text: item.text,
            citations: [{ evidenceId: item.id, quote: item.text }]
          }))
          : [];
      return {
        caseId: entry.id,
        output: JSON.stringify({
          status: entry.expectedStatus,
          answer: claims.length ? claims.map(claim => claim.text).join(" / ") : "Information non établie.",
          claims
        })
      };
    });
    await writeFile(runPath, JSON.stringify({
      controlId: "A4",
      corpusVersion: assistantResponseHoldoutA4.version,
      promptVersion: "1.0.0",
      candidate: { model: "qwen3:8b" },
      observations
    }));
    const evaluated = invoke("evaluate", runPath);
    assert.equal(evaluated.status, 0, evaluated.stderr);
    const report = JSON.parse(evaluated.stdout);
    assert.equal(report.promptVersion, "1.0.0");
    assert.equal(report.strictGate.passes, true);
    assert.equal(report.strictGate.productionReady, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("D1 CLI validates, exports label-free inputs, and evaluates a local development run", async () => {
  const script = fileURLToPath(new URL("../scripts/evaluate-assistant-qwen-development.js", import.meta.url));
  const temp = await mkdtemp(join(tmpdir(), "famili-assistant-qwen-d1-"));
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  try {
    const check = invoke("check");
    assert.equal(check.status, 0, check.stderr);
    assert.deepEqual(JSON.parse(check.stdout), {
      developmentSetId: "D1",
      cases: 16,
      categories: {
        answerable: 4,
        "fact-missing": 3,
        "no-evidence": 3,
        ambiguous: 3,
        conflicting: 3
      },
      modelRuns: 0
    });

    const inputPath = join(temp, "d1-inputs.json");
    const exported = invoke("export", inputPath);
    assert.equal(exported.status, 0, exported.stderr);
    const bundle = JSON.parse(await readFile(inputPath, "utf8"));
    assert.equal(bundle.datasetId, "D1");
    assert.equal(bundle.cases.length, 16);
    assert.equal(JSON.stringify(bundle).includes("reviewRubric"), false);
    assert.equal(JSON.stringify(bundle).includes("expectedStatus"), false);

    const runPath = join(temp, "d1-run.json");
    const observations = assistantResponseQwenDevelopment.cases.map(entry => {
      const evidence = entry.input.evidence;
      const claims = entry.expectedStatus === "answered"
        ? [{
          text: evidence[0].text.split("\n")[0],
          citations: [{
            evidenceId: evidence[0].id,
            quote: evidence[0].text.split("\n")[0]
          }]
        }]
        : entry.expectedStatus === "conflict"
          ? evidence.map(item => ({
            text: item.text,
            citations: [{ evidenceId: item.id, quote: item.text }]
          }))
          : [];
      return {
        caseId: entry.id,
        output: JSON.stringify({
          status: entry.expectedStatus,
          answer: claims.length ? claims.map(claim => claim.text).join(" / ") : "Information non établie.",
          claims
        })
      };
    });
    await writeFile(runPath, JSON.stringify({
      datasetId: "D1",
      corpusVersion: assistantResponseQwenDevelopment.version,
      promptVersion: "1.0.0",
      candidate: { model: "qwen3:8b" },
      observations
    }));
    const evaluated = invoke("evaluate", runPath);
    assert.equal(evaluated.status, 0, evaluated.stderr);
    const report = JSON.parse(evaluated.stdout);
    assert.equal(report.decisionSummary.decisionGate.passes, true);
    assert.equal(report.responseValidationFailures, 0);
    assert.equal(report.productionReady, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
