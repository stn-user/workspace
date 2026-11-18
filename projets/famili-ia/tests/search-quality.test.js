import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchResponse,
  evaluateSearchCorpus,
  rankDocuments
} from "../search-utils.js";
import { loadSearchCorpus, searchEvaluationCases } from "./search-corpus.js";
import { IndexSession } from "../index-session.js";
import { isAssistantMatchCurrent, prepareAssistantContext } from "../assistant-context.js";

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

function assistantSession(documents) {
  const session = new IndexSession();
  for (const document of documents) session.trustExtractedContent(document, [document.content]);
  return session;
}

test("shared assistant preserves the annotated documentary intents, synonyms and abstentions", () => {
  const session = assistantSession(corpus);
  for (const item of searchEvaluationCases) {
    const context = prepareAssistantContext({ session, documents: corpus, question: item.query });
    if (item.expectedIds.length === 0) {
      assert.ok(context.status === "clarification" || context.status === "no-evidence", item.query);
      assert.deepEqual(context.matches, []);
      continue;
    }
    assert.equal(context.status, "ready", item.query);
    assert.ok(item.expectedIds.includes(context.matches[0].itemId), item.query);
    if (item.expectedStatus === "ambiguous") {
      assert.equal(buildSearchResponse(context.matches).status, "ambiguous", item.query);
    } else if (item.expectedFact) {
      assert.equal(context.matches[0].exactFact, item.expectedFact, item.query);
      assert.equal(buildSearchResponse(context.matches).status, "supported", item.query);
      assert.ok(context.matches[0].segments.some(segment => segment.includes(item.expectedFact)));
    }
  }
  const document = { id: "reference-duration", name: "Garantie chaudière.txt", isLocal: true,
    content: "Référence : CH-FICTIVE-42\nDurée de garantie : 3 ans" };
  const referenceSession = assistantSession([document]);
  for (const [question, expected] of [
    ["Quelle est la référence de ma chaudière ?", "Référence : CH-FICTIVE-42"],
    ["Quelle est la durée de garantie de ma chaudière ?", "Durée de garantie : 3 ans"]
  ]) {
    const context = prepareAssistantContext({ session: referenceSession, documents: [document], question });
    assert.equal(context.matches[0]?.exactFact, expected);
    assert.equal(buildSearchResponse(context.matches).status, "supported");
  }
  const scan = { id: "ocr", name: "Facture chaudière.jpg", type: "Image", isLocal: true,
    content: "Montant total : 123 euros TTC" };
  const ocr = prepareAssistantContext({
    session: assistantSession([scan]), documents: [scan], question: "Montant chaudière"
  });
  assert.equal(ocr.matches[0]?.exactFact, "Montant total : 123 euros TTC");
});

test("shared assistant keeps index filters and result identities without writes or a second ranker", () => {
  const documents = [
    { id: "local", name: "Facture chaudière.txt", isLocal: true, content: "Montant total : 321 euros" },
    { id: "drive", name: "Facture chaudière.txt", driveSource: true, content: "Montant total : 654 euros" }
  ];
  const before = structuredClone(documents);
  const session = assistantSession(documents);
  const filters = { sourceId: "drive", coverage: "partial" };
  const context = prepareAssistantContext({ session, documents, question: "Quel est le montant de la chaudière ?", filters });
  assert.deepEqual(context.matches.map(({ sourceId, accountRef, itemId }) => [sourceId, accountRef, itemId]),
    session.search(context.query, filters).map(({ sourceId, accountRef, itemId }) => [sourceId, accountRef, itemId]));
  assert.equal(context.matches[0].exactFact, "Montant total : 654 euros");
  assert.deepEqual(context.scope.filters, filters);
  assert.deepEqual(documents, before);
  const excluded = prepareAssistantContext({ session, documents, question: "Montant chaudière", filters: { sourceId: "dropbox" } });
  assert.equal(excluded.status, "no-evidence");
});

test("shared assistant never treats legacy text, metadata facts or demonstration data as verified content", () => {
  const documents = [
    { id: "legacy", name: "Facture chaudière.txt", isLocal: true, content: "Montant total : 9 999 euros" },
    { id: "photo", name: "Facture chaudière.jpg", type: "Image", isLocal: true, content: "Montant total : 7 777 euros" },
    { id: "demo", name: "Facture chaudière.txt", driveDemo: true, content: "Montant total : 8 888 euros" }
  ];
  const context = prepareAssistantContext({ session: new IndexSession(), documents, question: "Montant chaudière" });
  assert.deepEqual(context.matches.map(match => match.itemId), ["legacy"]);
  assert.equal(context.matches[0].exactFact, null);
  assert.equal(context.matches[0].evidence, null);
  assert.equal(buildSearchResponse(context.matches).status, "fact-not-found");
});

test("shared assistant isolates identical item IDs across accounts and refuses duplicate full identities", () => {
  const documents = ["a", "b"].map((letter, index) => ({
    id: "same-item", name: "Facture chaudière.txt", oneDriveSource: true,
    oneDriveAccountFingerprint: letter.repeat(64), content: `Montant total : ${index + 1}00 euros`
  }));
  const session = assistantSession(documents);
  const context = prepareAssistantContext({ session, documents, question: "Montant chaudière" });
  assert.equal(context.matches.length, 2);
  assert.deepEqual(context.matches.map(match => match.accountRef), ["a".repeat(64), "b".repeat(64)]);
  assert.equal(buildSearchResponse(context.matches).status, "ambiguous");
  assert.equal(isAssistantMatchCurrent(context.matches[0], [documents[1]], session), false);
  const duplicate = prepareAssistantContext({
    session, documents: [documents[0], { ...documents[0] }], question: "Montant chaudière"
  });
  assert.equal(duplicate.status, "clarification");
  assert.deepEqual(duplicate.matches, []);
});

test("shared assistant revalidates edits, deletions and new conflicting sources without invalidating unchanged syncs", () => {
  const document = { id: "boiler", name: "Facture chaudière.txt", isLocal: true, content: "Montant total : 321 euros" };
  const session = assistantSession([document]);
  const first = prepareAssistantContext({ session, documents: [document], question: "Montant chaudière" });
  const same = prepareAssistantContext({ session, documents: [document], question: "Montant chaudière" });
  assert.equal(same.scope.corpusRevision, first.scope.corpusRevision);
  assert.equal(isAssistantMatchCurrent(first.matches[0], [document], session), true);
  document.content = "Montant total : 789 euros";
  assert.equal(isAssistantMatchCurrent(first.matches[0], [document], session), false);
  const edited = prepareAssistantContext({ session, documents: [document], question: "Montant chaudière" });
  assert.equal(edited.matches[0].exactFact, null);
  assert.ok(edited.scope.corpusRevision > first.scope.corpusRevision);
  session.trustExtractedContent(document, [document.content]);
  const other = { ...document, id: "other", content: "Montant total : 456 euros" };
  session.trustExtractedContent(other, [other.content]);
  const sameFact = { ...document, id: "same-fact" };
  session.trustExtractedContent(sameFact, [sameFact.content]);
  const added = prepareAssistantContext({ session, documents: [document, sameFact, other], question: "Montant chaudière" });
  assert.ok(added.scope.corpusRevision > edited.scope.corpusRevision);
  assert.equal(buildSearchResponse(added.matches).status, "ambiguous");
  assert.deepEqual(added.matches.slice(0, 2).map(match => match.exactFact),
    ["Montant total : 789 euros", "Montant total : 456 euros"]);
  const removed = prepareAssistantContext({ session, documents: [], question: "Montant chaudière" });
  assert.equal(removed.status, "no-evidence");
  assert.equal(isAssistantMatchCurrent(added.matches[0], [], session), false);
});

test("shared assistant extracts a full verified line rather than a truncated lexical preview", () => {
  const content = `Chaudière : ${"clause ".repeat(30)}\nMontant total : 1 234 euros TTC <b>copie fictive</b>`;
  const document = { id: "clause", name: "annexe.txt", content, isLocal: true };
  const session = assistantSession([document]);
  const context = prepareAssistantContext({ session, documents: [document], question: "Montant chaudière" });
  assert.equal(context.matches[0].exactFact, "Montant total : 1 234 euros TTC <b>copie fictive</b>");
  assert.ok(content.includes(context.matches[0].evidence));
  const alias = { id: "alias", name: "Piscine.txt", content: "Bassin de démonstration.", isLocal: true };
  const aliased = prepareAssistantContext({
    session: assistantSession([alias]), documents: [alias], question: "piscine"
  });
  assert.equal(aliased.matches[0].evidence, "Bassin de démonstration.");
});
