import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateWeddingMetadata } from "../photo-event-evaluation.js";

const fixtureUrl = new URL("./fixtures/photo-event-evaluation.json", import.meta.url);
const cases = JSON.parse(readFileSync(fixtureUrl, "utf8"));

test("measures each photo once, separates evidence types and excludes unknown labels", () => {
  const result = evaluateWeddingMetadata(cases);
  assert.deepEqual(result, {
    photos: 6,
    evaluated: 5,
    unknown: 1,
    unknownWithSuggestion: 1,
    all: {
      truePositives: 2, falsePositives: 1, falseNegatives: 1, trueNegatives: 1,
      suggestions: 3, abstentions: 2, precision: 2 / 3, recall: 2 / 3
    },
    explicitLabel: {
      truePositives: 1, falsePositives: 0, falseNegatives: 2, trueNegatives: 2,
      suggestions: 1, abstentions: 4, precision: 1, recall: 1 / 3
    },
    lexicalMatch: {
      truePositives: 1, falsePositives: 1, falseNegatives: 2, trueNegatives: 1,
      suggestions: 2, abstentions: 3, precision: 1 / 2, recall: 1 / 3
    }
  });
});

test("multiple matching cues count once per photo, including in overlapping categories", () => {
  const document = { ...cases[0].document, name: "mariage.jpg" };
  const result = evaluateWeddingMetadata([{ document, expectedWedding: true }]);
  assert.equal(result.all.truePositives, 1);
  assert.equal(result.explicitLabel.truePositives, 1);
  assert.equal(result.lexicalMatch.truePositives, 1);
});

test("evaluates a provider folder without reading photo content or using the network", () => {
  const document = {
    id: "provider-photo",
    type: "Image",
    name: "photo.jpg",
    photoFacts: {
      sourceCopies: [{
        providerId: "dropbox", accountRef: "a".repeat(64),
        itemId: "synthetic-item", path: "/Photos/Mariage/photo.jpg"
      }]
    },
    get content() { throw new Error("Photo content must not be read."); }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Network must not be used."); };
  try {
    const result = evaluateWeddingMetadata([{ document, expectedWedding: true }]);
    assert.equal(result.all.truePositives, 1);
    assert.equal(result.lexicalMatch.truePositives, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("undefined precision and recall are null, not successful scores", () => {
  const result = evaluateWeddingMetadata([{ document: cases[4].document, expectedWedding: false }]);
  assert.equal(result.all.precision, null);
  assert.equal(result.all.recall, null);
  assert.equal(evaluateWeddingMetadata([cases[5]]).evaluated, 0);
});

test("rejects missing labels, repeated identities and invalid documents", () => {
  assert.throws(() => evaluateWeddingMetadata([]), /liste non vide/);
  assert.throws(() => evaluateWeddingMetadata([{ document: cases[0].document }]), /annotation/);
  assert.throws(() => evaluateWeddingMetadata([cases[0], cases[0]]), /unique/);
  assert.throws(() => evaluateWeddingMetadata([{ document: { id: "x", name: "x.txt" }, expectedWedding: true }]), /photo document/);
});

test("local CLI prints only aggregate metrics and rejects missing input", () => {
  const script = fileURLToPath(new URL("../scripts/evaluate-photo-events.js", import.meta.url));
  const success = spawnSync(process.execPath, [script, fileURLToPath(fixtureUrl)], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(JSON.parse(success.stdout), evaluateWeddingMetadata(cases));
  assert.ok(!success.stdout.includes("mariage-02.jpg"));

  const failure = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /Usage/);
});
