import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareAssistantQwenDevelopmentCase,
  validateAssistantResponseQwenD2,
  validateAssistantResponseQwenD3
} from "../assistant-qwen-development-gate.js";
import { assistantResponseQwenDevelopmentD2 } from "./assistant-response-qwen-development-d2.js";
import { assistantResponseQwenDevelopmentD3 } from "./assistant-response-qwen-development-d3.js";

test("D2 exercises the real local context and Qwen evidence gate before inference", () => {
  assert.deepEqual(validateAssistantResponseQwenD2(assistantResponseQwenDevelopmentD2), {
    developmentSetId: "D2",
    cases: 16,
    categories: {
      answerable: 4,
      "fact-missing": 3,
      "no-evidence": 3,
      ambiguous: 3,
      conflicting: 3
    }
  });

  test("D3 uses new synthetic cases to exercise local decisions and the prompt evidence gate", () => {
    assert.deepEqual(validateAssistantResponseQwenD3(assistantResponseQwenDevelopmentD3), {
      developmentSetId: "D3",
      cases: 20,
      categories: {
        answerable: 8,
        "fact-missing": 3,
        "no-evidence": 3,
        ambiguous: 3,
        conflicting: 3
      }
    });

    for (const entry of assistantResponseQwenDevelopmentD3.cases) {
      const result = prepareAssistantQwenDevelopmentCase(entry);
      assert.equal(result.localStatus, entry.expectedLocalStatus, entry.id);
      assert.equal(result.qwenEvidence.length > 0, entry.expectedQwenCall, entry.id);
      assert.deepEqual(result.qwenEvidence.map(item => item.text), entry.expectedFacts, entry.id);
    }
  });

  for (const entry of assistantResponseQwenDevelopmentD2.cases) {
    const result = prepareAssistantQwenDevelopmentCase(entry);
    assert.equal(result.localStatus, entry.expectedLocalStatus, entry.id);
    assert.equal(result.qwenEvidence.length > 0, entry.expectedQwenCall, entry.id);
    assert.deepEqual(result.qwenEvidence.map(item => item.text), entry.expectedFacts, entry.id);
  }
});
