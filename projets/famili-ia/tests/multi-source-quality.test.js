import assert from "node:assert/strict";
import test from "node:test";
import { createContentProvenance } from "../content-index.js";
import { createDocumentIndexRecord } from "../document-index.js";
import { IndexSession } from "../index-session.js";
import { findIndexDeadlines } from "../index-deadline-search.js";
import {
  multiSourceQualityCorpus, qualityReferenceDate, qualitySearchCases, qualityDeadlineGold
} from "./fixtures/multi-source-quality-corpus.js";

const identity = (sourceId, itemId) => JSON.stringify([sourceId, itemId]);

async function loadCorpus() {
  const documents = [];
  for (const fixture of multiSourceQualityCorpus) {
    const document = {
      id: fixture.id, name: fixture.name, content: fixture.text, isLocal: true,
      ...(fixture.source === "drive" ? { driveSource: true } : {}),
      ...(fixture.source === "onedrive" ? { oneDriveSource: true } : {}),
      ...fixture.document
    };
    if (fixture.method) {
      document.contentProvenance = await createContentProvenance(document, [fixture.text], fixture.method);
    }
    document.indexRecord = await createDocumentIndexRecord(document);
    if (fixture.changedText) document.content = fixture.changedText;
    documents.push(document);
  }
  return documents;
}

async function restoreSession(documents) {
  const session = new IndexSession();
  for (const document of documents) await session.restoreDocumentContent(document);
  session.syncDocuments(documents);
  return session;
}

function measureRetrieval(session) {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let correctAbstentions = 0;
  let emptyGoldCases = 0;
  let extractedProofs = 0;
  let invalidProofs = 0;
  const latencies = [];
  const rows = [];
  const bySource = Object.fromEntries(["local", "drive", "onedrive"].map(sourceId => [
    sourceId, { truePositives: 0, falsePositives: 0, falseNegatives: 0 }
  ]));
  const content = new Map(session.getAllContentDocs().map(document => [
    identity(document.sourceId, document.itemId), document.segments
  ]));
  for (const fixture of qualitySearchCases) {
    const started = performance.now();
    const matches = session.search(fixture.query, fixture.filters);
    latencies.push(performance.now() - started);
    const expected = new Set(fixture.expected.map(pair => identity(...pair)));
    const actual = matches.map(match => identity(match.sourceId, match.itemId));
    const actualSet = new Set(actual);
    const missing = [...expected].filter(key => !actualSet.has(key));
    const unexpected = actual.filter(key => !expected.has(key));
    truePositives += actual.filter(key => expected.has(key)).length;
    falsePositives += unexpected.length;
    falseNegatives += missing.length;
    for (const key of expected) {
      const source = bySource[JSON.parse(key)[0]];
      if (actualSet.has(key)) source.truePositives++;
      else source.falseNegatives++;
    }
    for (const key of unexpected) bySource[JSON.parse(key)[0]].falsePositives++;
    if (!expected.size) {
      emptyGoldCases++;
      if (!actual.length) correctAbstentions++;
    }
    assert.equal(actual.length, actualSet.size, `doublon : ${fixture.query}`);
    assert.deepEqual(unexpected, [], `résultats non pertinents : ${fixture.query}`);
    assert.deepEqual(missing.sort(), (fixture.knownMisses || []).map(pair => identity(...pair)).sort(),
      `résultats manquants : ${fixture.query}`);
    for (const match of matches) {
      const segments = content.get(identity(match.sourceId, match.itemId));
      const proofs = match.reasons.filter(reason => reason.source === "extracted");
      for (const reason of proofs) {
        extractedProofs++;
        if (!reason.proof?.excerpt || !segments.some(segment => segment.includes(reason.proof.excerpt))) {
          invalidProofs++;
        }
      }
      if (fixture.proof) assert.ok(proofs.some(reason => reason.proof?.excerpt.includes(fixture.proof)),
        `preuve attendue absente : ${fixture.query}`);
    }
    rows.push({ query: fixture.query, filters: fixture.filters || {}, expected: [...expected], actual,
      missing, limitation: fixture.limitation || null });
  }
  return {
    cases: rows.length, truePositives, falsePositives, falseNegatives,
    bySource: Object.fromEntries(Object.entries(bySource).map(([sourceId, counts]) => [
      sourceId, { ...counts,
        precision: counts.truePositives / (counts.truePositives + counts.falsePositives),
        recall: counts.truePositives / (counts.truePositives + counts.falseNegatives) }
    ])),
    precision: truePositives / (truePositives + falsePositives),
    recall: truePositives / (truePositives + falseNegatives),
    emptyGoldCases, correctAbstentions, correctAbstentionRate: correctAbstentions / emptyGoldCases,
    extractedProofs, invalidProofs,
    meanLatencyMs: latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length,
    maxLatencyMs: Math.max(...latencies),
    rows
  };
}

function measureDeadlines(result) {
  const expected = new Map(qualityDeadlineGold.map(deadline => [
    identity(deadline.sourceId, deadline.itemId), deadline
  ]));
  const actual = new Map(result.candidates.map(candidate => [identity(candidate.sourceId, candidate.itemId), candidate]));
  const correct = [...actual].filter(([key, candidate]) => {
    const gold = expected.get(key);
    return gold && gold.dueDate === candidate.dueDate &&
      gold.excerpt === candidate.proof.excerpt && Boolean(gold.estimated) === Boolean(candidate.estimated);
  }).length;
  const falsePositives = actual.size - correct;
  const falseNegatives = expected.size - correct;
  assert.equal(result.candidates.length, actual.size, "identités d'échéance dupliquées");
  assert.equal(falsePositives, 0, "proposition ou preuve incorrecte");
  assert.equal(falseNegatives, 0, "échéance admissible manquée");
  for (const fixture of multiSourceQualityCorpus.filter(entry => entry.review)) {
    const reviewed = result.needReview.find(entry => entry.sourceId === fixture.source && entry.itemId === fixture.id);
    assert.ok(reviewed?.reason.includes(fixture.review), `vérification attendue : ${fixture.id}`);
  }
  return {
    proposed: actual.size, truePositives: correct, falsePositives, falseNegatives,
    precision: correct / actual.size, recall: correct / expected.size,
    needReview: result.needReview.length, outsidePeriod: result.outsidePeriod, ineligible: result.ineligible.length
  };
}

test("corpus multi-sources fictif : recherche, preuves, abstentions, échéances et redémarrage mesurés hors réseau", async t => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Accès réseau interdit dans ce corpus fictif."); });
  const started = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
  const documents = await loadCorpus();
  const session = await restoreSession(documents);
  const setupMs = performance.now() - started;
  const retrieval = measureRetrieval(session);
  const deadlineStarted = performance.now();
  const deadlineResult = findIndexDeadlines(session, qualityReferenceDate, 90);
  const deadlineMs = performance.now() - deadlineStarted;
  const deadlines = measureDeadlines(deadlineResult);
  const saved = structuredClone(documents);
  const restarted = await restoreSession(saved);
  const restoredRetrieval = measureRetrieval(restarted);
  assert.deepEqual(restoredRetrieval.rows, retrieval.rows, "résultats et preuves après redémarrage");
  assert.deepEqual(measureDeadlines(findIndexDeadlines(restarted, qualityReferenceDate, 90)), deadlines);
  assert.equal(retrieval.precision, 1);
  assert.equal(retrieval.recall, 1, "les deux manques de la baseline doivent rester corrigés");
  assert.equal(retrieval.correctAbstentionRate, 1);
  assert.equal(retrieval.invalidProofs, 0);
  assert.ok(retrieval.extractedProofs > 0);
  assert.ok(retrieval.maxLatencyMs < 1000, "chaque recherche du petit corpus doit rester sous une seconde");
  assert.ok(setupMs < 10_000, "préparation du petit corpus sous dix secondes");
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  const bySource = Object.fromEntries(["local", "drive", "onedrive"].map(source => [
    source, multiSourceQualityCorpus.filter(fixture => fixture.source === source).length
  ]));
  const { rows, ...metrics } = retrieval;
  console.log(`multi-source-quality ${JSON.stringify({
    documents: documents.length, bySource,
    coverage: { partial: session.getAllRecords().filter(record => record.coverage === "partial").length,
      metadata: session.getAllRecords().filter(record => record.coverage === "metadata").length },
    retrieval: metrics, deadlines, setupMs, deadlineMs,
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    knownMisses: rows.filter(row => row.missing.length)
  })}`);
});

test("corpus multi-sources : altération et retrait ne laissent ni preuve ni proposition résiduelle", async () => {
  const documents = await loadCorpus();
  const session = await restoreSession(documents);
  const local = documents.find(document => document.id === "shared-item" && !document.driveSource);
  local.content = "Copie remplacée sans nouvelle provenance.";
  session.syncDocuments(documents);
  assert.deepEqual(session.search("MISTRAL"), []);
  assert.equal(session.search("CEDRE")[0].sourceId, "drive");
  const changed = findIndexDeadlines(session, qualityReferenceDate, 90);
  assert.ok(!changed.candidates.some(candidate => candidate.itemId === "shared-item" && candidate.sourceId === "local"));
  assert.ok(changed.needReview.some(entry => entry.itemId === "shared-item" && entry.sourceId === "local"));
  session.syncDocuments([]);
  assert.deepEqual(session.getAllRecords(), []);
  assert.deepEqual(session.getAllContentDocs(), []);
  assert.deepEqual(session.search("CEDRE"), []);
  assert.deepEqual(findIndexDeadlines(session, qualityReferenceDate, 90), {
    candidates: [], needReview: [], ineligible: [], outsidePeriod: 0
  });
});
