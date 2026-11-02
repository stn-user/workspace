import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchResponse,
  evaluateSearchCorpus,
  rankDocuments
} from "../search-utils.js";
import { loadSearchCorpus, searchEvaluationCases } from "./search-corpus.js";

const corpus = await loadSearchCorpus();

test("ranks local document corpus for synonyms, typos, and factual questions", () => {
  for (const searchCase of searchEvaluationCases) {
    const results = rankDocuments(searchCase.query, corpus);
    if (searchCase.expectedIds.length > 0) {
      assert.ok(results.length > 0, `expected a result for "${searchCase.query}"`);
      assert.ok(
        searchCase.expectedIds.includes(results[0].document.id),
        `expected the relevant document first for "${searchCase.query}", got ${results[0].document.id}`
      );
    } else {
      assert.deepEqual(results, [], `expected abstention for "${searchCase.query}"`);
    }
  }
});

test("returns only source-backed facts and explicitly abstains on missing or ambiguous answers", () => {
  for (const searchCase of searchEvaluationCases.filter(item => item.expectedFact !== undefined)) {
    const results = rankDocuments(searchCase.query, corpus);
    const response = buildSearchResponse(results);

    if (searchCase.expectedStatus === "ambiguous") {
      assert.equal(response.status, "ambiguous");
      assert.match(response.answer, /ne peux pas retenir une réponse unique/i);
      continue;
    }

    if (searchCase.expectedFact === null) {
      assert.equal(response.status, "not-found");
      continue;
    }

    assert.equal(results[0].exactFact, searchCase.expectedFact, searchCase.query);
    assert.ok(results[0].evidence, `missing evidence for "${searchCase.query}"`);
    assert.ok(results[0].provenance, `missing source for "${searchCase.query}"`);
    assert.equal(response.status, "supported");
  }

  const missingFact = rankDocuments(
    "Quel montant ai-je payé pour la piscine ?",
    [corpus.find(document => document.id === "pool-unknown-amount-invoice")]
  );
  assert.equal(missingFact[0].answerStatus, "fact-not-found");
  const missingFactResponse = buildSearchResponse(missingFact);
  assert.equal(missingFactResponse.status, "fact-not-found");
  assert.match(missingFactResponse.answer, /Facture piscine sans montant\.txt/);
  assert.match(missingFactResponse.answer, /montant n'est pas indiqué/i);
});

test("measures retrieval, factual accuracy, abstention, source coverage, and latency", () => {
  const metrics = evaluateSearchCorpus(searchEvaluationCases, corpus);
  assert.ok(metrics.precisionAtK >= 0.85, `precision@k ${metrics.precisionAtK}`);
  assert.ok(metrics.recallAtK >= 0.9, `recall@k ${metrics.recallAtK}`);
  assert.ok(metrics.meanReciprocalRank >= 0.75, `MRR ${metrics.meanReciprocalRank}`);
  assert.equal(metrics.factAccuracy, 1);
  assert.equal(metrics.correctAbstentionRate, 1);
  assert.equal(metrics.unsupportedAnswerCount, 0);
  assert.ok(metrics.sourceCoverage >= 0.9, `source coverage ${metrics.sourceCoverage}`);
  assert.ok(metrics.averageLatencyMs < 1000, `average search latency ${metrics.averageLatencyMs}ms`);
});

test("compares lexical, metadata, and synonym-assisted retrieval without a remote model", () => {
  const lexicalMetrics = evaluateSearchCorpus(searchEvaluationCases, corpus, { limit: 3, strategy: "lexical" });
  const metadataMetrics = evaluateSearchCorpus(searchEvaluationCases, corpus, { limit: 3, strategy: "metadata" });
  const hybridMetrics = evaluateSearchCorpus(searchEvaluationCases, corpus, { limit: 3, strategy: "hybrid" });

  assert.ok(hybridMetrics.meanReciprocalRank > lexicalMetrics.meanReciprocalRank);
  assert.ok(hybridMetrics.recallAtK > metadataMetrics.recallAtK);
  assert.ok(hybridMetrics.factAccuracy > lexicalMetrics.factAccuracy);
});

test("preserves deliberate uncertainty when equally ranked documents state different facts", () => {
  const results = rankDocuments(
    "Quel montant ai-je payé pour la piscine ?",
    corpus
  );
  assert.equal(results[0].ambiguous, true);
  assert.equal(results.find(result => result.document.id === "pool-terrace-invoice").ambiguous, true);
  assert.equal(results[0].answerStatus, "ambiguous");
  const response = buildSearchResponse(results);
  assert.match(response.answer, /Facture installation piscine\.txt/);
  assert.match(response.answer, /Facture terrasse piscine\.txt/);
});
