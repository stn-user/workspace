import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  prepareAssistantQwenDevelopmentCase,
  validateAssistantResponseQwenA5
} from "../assistant-qwen-development-gate.js";
import { assistantResponseHoldout } from "./assistant-response-holdout.js";
import { assistantResponseHoldoutA4 } from "./assistant-response-holdout-a4.js";
import { assistantResponseHoldoutA5 } from "./assistant-response-holdout-a5.js";
import { assistantResponseQwenDevelopment } from "./assistant-response-qwen-development.js";
import { assistantResponseQwenDevelopmentD2 } from "./assistant-response-qwen-development-d2.js";

test("A5 is a balanced, independent 40-case holdout with labels confined to the local harness", () => {
  assert.deepEqual(validateAssistantResponseQwenA5(assistantResponseHoldoutA5), {
    controlId: "A5",
    cases: 40,
    categories: {
      answerable: 8,
      "fact-missing": 8,
      "no-evidence": 8,
      ambiguous: 8,
      conflicting: 8
    }
  });
  assert.equal(new Set(assistantResponseHoldoutA5.cases.map(entry => entry.id)).size, 40);
  assert.ok(assistantResponseHoldoutA5.cases.every(entry =>
    entry.expectedQwenCall === (entry.category === "answerable")));
});

test("A5 matches the app's local decision and exact-evidence gate before inference", () => {
  for (const entry of assistantResponseHoldoutA5.cases) {
    const prepared = prepareAssistantQwenDevelopmentCase(entry);
    assert.equal(prepared.localStatus, entry.expectedLocalStatus, entry.id);
    assert.equal(prepared.qwenEvidence.length > 0, entry.expectedQwenCall, entry.id);
    assert.deepEqual(prepared.qwenEvidence.map(item => item.text), entry.expectedFacts, entry.id);
    assert.equal(typeof prepared.localAnswer, "string", entry.id);
    assert.ok(prepared.localAnswer.trim(), entry.id);
  }
});

test("A5 validation rejects altered balance, labels, and missing evidence expectations", () => {
  const incorrectBalance = structuredClone(assistantResponseHoldoutA5);
  incorrectBalance.cases[0].category = "fact-missing";
  assert.throws(() => validateAssistantResponseQwenA5(incorrectBalance));

  const incorrectGate = structuredClone(assistantResponseHoldoutA5);
  incorrectGate.cases[0].expectedQwenCall = false;
  assert.throws(() => validateAssistantResponseQwenA5(incorrectGate));

  const missingFact = structuredClone(assistantResponseHoldoutA5);
  missingFact.cases[0].expectedFacts = [];
  assert.throws(() => validateAssistantResponseQwenA5(missingFact));
});

test("A5 does not reuse questions or evidence text from the prior checked corpora", async () => {
  const a2Corpus = JSON.parse(await readFile(
    new URL("./fixtures/assistant-evaluation.json", import.meta.url),
    "utf8"
  ));
  const previousCases = [
    ...a2Corpus.cases,
    ...assistantResponseHoldout.cases,
    ...assistantResponseHoldoutA4.cases,
    ...assistantResponseQwenDevelopment.cases,
    ...assistantResponseQwenDevelopmentD2.cases
  ].filter(entry => entry.input && Array.isArray(entry.input.evidence));
  const questions = new Set(previousCases.map(entry => entry.input.question.trim().toLocaleLowerCase("fr")));
  const evidenceTexts = new Set(previousCases.flatMap(entry =>
    entry.input.evidence.map(item => item.text.trim().toLocaleLowerCase("fr"))));

  for (const entry of assistantResponseHoldoutA5.cases) {
    assert.equal(questions.has(entry.input.question.trim().toLocaleLowerCase("fr")), false, entry.id);
    for (const item of entry.input.evidence) {
      assert.equal(evidenceTexts.has(item.text.trim().toLocaleLowerCase("fr")), false, entry.id);
    }
  }
});
