import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  evaluateAssistantRun, prepareAssistantBenchmark, validateAssistantCorpus
} from "../assistant-evaluation.js";

const corpus = JSON.parse(await readFile(new URL("./fixtures/assistant-evaluation.json", import.meta.url), "utf8"));
const prepared = await prepareAssistantBenchmark(corpus);
const eligible = corpus.cases.filter(entry => entry.kind === "generation");

// Positive controls test the evaluator itself, never a model's quality.
function controlRun(entries = eligible) {
  return {
    protocolVersion: prepared.protocolVersion, corpusFingerprint: prepared.corpusFingerprint,
    candidate: { model: "synthetic-control-not-a-model", revision: "unit-test", runtime: "none", environment: "unit-test" },
    runId: "unit-control", phase: "warm", settings: { ...prepared.generationSettings },
    observations: entries.map(entry => ({
      caseId: entry.id, elapsedMs: 100,
      output: {
        status: entry.expected.status, answer: entry.expected.referenceAnswer,
        claims: entry.expected.requiredCitations.map(citation => ({
          text: entry.expected.referenceAnswer, citations: [{ ...citation }]
        }))
      }
    }))
  };
}

test("validates the annotated corpus and exports inputs without gold answers, identities or unverified text", async () => {
  assert.deepEqual(validateAssistantCorpus(corpus), {
    cases: 24, generationCases: 18, integrationNotRun: 6,
    groups: { reading: 6, synthesis: 4, context: 4, identity: 4, lifecycle: 4, actions: 2 }
  });
  assert.equal(prepared.cases.length, 18);
  for (const item of prepared.cases) {
    assert.deepEqual(Object.keys(item).sort(), ["caseId", "messages"]);
    const input = JSON.parse(item.messages[1].content);
    assert.deepEqual(Object.keys(input).sort(), ["evidence", "history", "question"]);
    assert.ok(input.evidence.every(evidence => Object.keys(evidence).sort().join() === "id,name,text"));
  }
  for (const id of ["reading-unverified", "identity-invalid-proof"]) {
    assert.deepEqual(JSON.parse(prepared.cases.find(entry => entry.caseId === id).messages[1].content).evidence, []);
  }
  const identity = JSON.parse(prepared.cases.find(entry => entry.caseId === "identity-accounts").messages[1].content);
  assert.deepEqual(identity.evidence.map(item => item.id), ["p1", "p2"]);
  const bad = structuredClone(corpus);
  bad.cases[0].expected.requiredCitations[0].quote = "Passage inventé.";
  assert.throws(() => validateAssistantCorpus(bad), /non littérale/);
  const unverified = structuredClone(corpus);
  unverified.cases[0].input.evidence[0].verified = false;
  assert.throws(() => validateAssistantCorpus(unverified), /non admissible/);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("No benchmark network request is authorized."); };
  try {
    assert.deepEqual(await prepareAssistantBenchmark(corpus), prepared);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing cases and deferred integration are not successful model evaluations", async () => {
  const empty = await evaluateAssistantRun(corpus, controlRun([]));
  assert.equal(empty.decision, "not-evaluated");
  assert.equal(empty.missing.length, 18);
  assert.equal(empty.timings.p95Ms, null);
  assert.equal(empty.usage.inputTokens, null);
  const partial = await evaluateAssistantRun(corpus, controlRun([eligible[0]]));
  assert.equal(partial.decision, "incomplete");
  assert.equal(partial.structuralPassed, 1);
  assert.equal(partial.semanticApproved, 0);
  assert.equal(partial.integration.executed, 0);
  assert.equal(partial.integration.notRun.length, 6);
  assert.equal(partial.productionReady, false);
});

test("a real citation with a false claim cannot automatically pass semantic review", async () => {
  const run = controlRun();
  run.observations[0].output.answer = "Le montant est de 80 000 euros.";
  run.observations[0].output.claims[0].text = "Le montant est de 80 000 euros.";
  const report = await evaluateAssistantRun(corpus, run);
  assert.equal(report.structuralPassed, 18);
  assert.equal(report.semanticApproved, 0);
  assert.equal(report.semanticPending, 18);
  assert.equal(report.decision, "review-required");
  const reviewed = await evaluateAssistantRun(corpus, run, {
    runFingerprint: report.runFingerprint,
    entries: [{ caseId: eligible[0].id, verdict: "fail", notes: "La citation contient 1 200 euros, pas 80 000." }]
  });
  assert.equal(reviewed.decision, "rejected");
});

test("rejects foreign, truncated and uncited evidence, malformed JSON and action-shaped outputs", async () => {
  const mutations = [
    output => { output.claims[0].citations[0].evidenceId = "unknown-piece"; },
    output => { output.claims[0].citations[0].quote = "1 200 euros"; },
    output => { output.claims[0].citations = []; },
    output => { output.claims = []; },
    output => { output.actions = [{ type: "create-reminder" }]; },
    output => { output.status = "abstained"; }
  ];
  for (const mutate of mutations) {
    const run = controlRun([eligible[0]]);
    mutate(run.observations[0].output);
    assert.equal((await evaluateAssistantRun(corpus, run)).structuralFailed, 1);
  }
  const malformed = controlRun([eligible[0]]);
  malformed.observations[0].output = "```json\n{}\n```";
  assert.deepEqual((await evaluateAssistantRun(corpus, malformed)).cases[0].issues, ["invalid-json"]);
  const runtime = controlRun([eligible[0]]);
  delete runtime.observations[0].output;
  runtime.observations[0].error = "Synthetic runtime unavailable";
  assert.deepEqual((await evaluateAssistantRun(corpus, runtime)).cases[0].issues, ["runtime-error"]);
});

test("binds reviews to exact outputs and never lets them override structural failure", async () => {
  const run = controlRun();
  const report = await evaluateAssistantRun(corpus, run);
  const review = { runFingerprint: report.runFingerprint,
    entries: eligible.map(entry => ({ caseId: entry.id, verdict: "pass", notes: "Synthetic evaluator control only." })) };
  const approved = await evaluateAssistantRun(corpus, run, review);
  assert.equal(approved.decision, "generation-corpus-approved");
  assert.equal(approved.productionReady, false);
  run.observations[0].output.claims[0].citations[0].quote = "Citation altérée.";
  await assert.rejects(evaluateAssistantRun(corpus, run, review), /empreinte/);
  const changed = await evaluateAssistantRun(corpus, run);
  const blocked = await evaluateAssistantRun(corpus, run, { ...review, runFingerprint: changed.runFingerprint });
  assert.equal(blocked.decision, "rejected");
  assert.equal(blocked.semanticApproved, 17);
});

test("reports imported latency thresholds and missing usage without optimistic defaults", async () => {
  const run = controlRun();
  run.observations.forEach(observation => { observation.elapsedMs = 15000; });
  run.observations[0].usage = { inputTokens: 200, outputTokens: 100 };
  const report = await evaluateAssistantRun(corpus, run);
  assert.equal(report.timings.p95Ms, 15000);
  assert.equal(report.timings.under15Seconds, false);
  assert.equal(report.timings.source, "imported");
  assert.equal(report.usage.reportedCases, 1);
  assert.equal(report.usage.inputTokens, null);
  const reviewed = await evaluateAssistantRun(corpus, run, {
    runFingerprint: report.runFingerprint,
    entries: eligible.map(entry => ({ caseId: entry.id, verdict: "pass", notes: "Synthetic latency-boundary control." }))
  });
  assert.equal(reviewed.decision, "latency-rejected");
  const duplicate = controlRun([eligible[0], eligible[0]]);
  await assert.rejects(evaluateAssistantRun(corpus, duplicate), /dupliquée/);
  const wrongVersion = { ...run, corpusFingerprint: "old-protocol" };
  await assert.rejects(evaluateAssistantRun(corpus, wrongVersion), /incompatible/);
});

test("offline CLI checks and exports without overwriting files or treating missing results as success", async () => {
  const script = fileURLToPath(new URL("../scripts/evaluate-assistant.js", import.meta.url));
  const temp = await mkdtemp(join(tmpdir(), "famili-assistant-evaluation-"));
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  try {
    const check = invoke("check");
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).modelRuns, 0);
    const output = join(temp, "requests.json");
    const exported = invoke("export", output);
    assert.equal(exported.status, 0, exported.stderr);
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), prepared);
    assert.notEqual(invoke("export", output).status, 0);
    const responses = join(temp, "responses.json");
    await writeFile(responses, JSON.stringify(controlRun([])));
    const incomplete = invoke("evaluate", responses);
    assert.equal(incomplete.status, 2, incomplete.stderr);
    assert.equal(JSON.parse(incomplete.stdout).decision, "not-evaluated");
    assert.notEqual(invoke("evaluate", join(temp, "missing.json")).status, 0);
    assert.notEqual(invoke().status, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
