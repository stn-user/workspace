import { readFile } from "node:fs/promises";
import { validateAssistantCorpus } from "../assistant-evaluation.js";
import { evaluateSearchCorpus, normalizeText, rankDocuments } from "../search-utils.js";
import { expandedSearchEvaluationCases, loadSearchCorpus } from "../tests/search-corpus.js";
import { applyEmbeddingAbstentionPolicy } from "../tests/search-abstention-policy.js";

const model = "embeddinggemma:latest";
const endpoint = "http://127.0.0.1:11434/api/embed";
const topK = 3;
const retrievalGate = { top1Accuracy: 0.9, recallAt3: 0.95, strictNoEvidenceAbstentionRate: 1 };

function documentInput(document) {
  const text = [
    document.type && `Type : ${document.type}`,
    document.date,
    document.keywords && `Mots-clés : ${document.keywords}`,
    document.content
  ].filter(Boolean).join("\n");
  return `title: ${document.name} | text: ${text}`;
}

function validateCorpus(documents, cases) {
  const documentIds = new Set(documents.map(document => document.id));
  if (documentIds.size !== documents.length) throw new Error("Le corpus contient des identifiants de documents en double.");
  if (cases.length === 0) throw new Error("Le corpus d'évaluation ne contient aucune requête.");
  for (const searchCase of cases) {
    if (!searchCase.query || !Array.isArray(searchCase.expectedIds)) {
      throw new Error("Une requête du corpus d'évaluation est mal formée.");
    }
    for (const id of searchCase.expectedIds) {
      if (!documentIds.has(id)) throw new Error(`Le document attendu "${id}" est absent du corpus.`);
    }
  }
}

async function loadAssistantEvidenceHoldout() {
  const content = await readFile(new URL("../tests/fixtures/assistant-evaluation.json", import.meta.url), "utf8");
  let corpus;
  try {
    corpus = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Le corpus synthétique de l'Assistant contient un JSON invalide.");
  }
  validateAssistantCorpus(corpus);

  const cases = corpus.cases
    .filter(entry => entry.kind === "generation" && ["reading", "synthesis", "identity"].includes(entry.group))
    .map(entry => {
      const documents = entry.input.evidence.filter(evidence => evidence.verified).map(evidence => {
        const normalizedName = normalizeText(evidence.name);
        const type = ["facture", "contrat", "garantie", "notice"].find(term => normalizedName.includes(term));
        return {
          id: evidence.id,
          name: evidence.name,
          type: type || null,
          keywords: "",
          content: evidence.text
        };
      });
      const expectedIds = [...new Set(entry.expected.requiredCitations.map(citation => citation.evidenceId))];
      if (expectedIds.some(id => !documents.some(document => document.id === id))) {
        throw new Error(`Le cas de contrôle "${entry.id}" cite une pièce qui n'est pas vérifiée.`);
      }
      return {
        id: entry.id,
        query: entry.input.question,
        documents,
        expectedIds,
        expectedStatus: entry.expected.status
      };
    });

  if (cases.length === 0) throw new Error("Le corpus de contrôle ne contient aucun cas de génération exploitable.");
  return cases;
}

async function loadIndependentSearchHoldout() {
  const content = await readFile(new URL("../tests/fixtures/search-retrieval-holdout-a3.json", import.meta.url), "utf8");
  let fixture;
  try {
    fixture = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Le corpus indépendant A3 contient un JSON invalide.");
  }
  if (fixture.synthetic !== true || !Array.isArray(fixture.documents) || !Array.isArray(fixture.cases)) {
    throw new Error("Le corpus indépendant A3 doit être synthétique et contenir documents et requêtes.");
  }
  validateCorpus(fixture.documents, fixture.cases);
  const ids = new Set(fixture.documents.map(document => document.id));
  const statuses = new Set(["answered", "abstained", "clarification", "conflict"]);
  for (const searchCase of fixture.cases) {
    if (!searchCase.id || !statuses.has(searchCase.expectedStatus)) {
      throw new Error("Une annotation de statut du corpus indépendant A3 est invalide.");
    }
    if (searchCase.expectedStatus === "answered" && searchCase.expectedIds.length === 0) {
      throw new Error(`Le cas "${searchCase.id}" attend une réponse sans document de preuve.`);
    }
    if (searchCase.expectedStatus === "conflict" && searchCase.expectedIds.length < 2) {
      throw new Error(`Le cas "${searchCase.id}" attend un conflit sans plusieurs preuves.`);
    }
    if (searchCase.expectedIds.some(id => !ids.has(id))) {
      throw new Error(`Le cas "${searchCase.id}" référence un document absent.`);
    }
  }
  return {
    documents: fixture.documents,
    cases: fixture.cases.map(searchCase => ({ ...searchCase, documents: fixture.documents }))
  };
}

async function requestEmbeddings(inputs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Ollama a répondu HTTP ${response.status} : ${await response.text()}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Ollama a renvoyé un JSON invalide.");
    }
    if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== inputs.length) {
      throw new Error("Ollama a renvoyé un nombre d'embeddings inattendu.");
    }

    const dimensions = payload.embeddings[0]?.length;
    if (!Number.isInteger(dimensions) || dimensions === 0 || payload.embeddings.some(vector => (
      !Array.isArray(vector)
      || vector.length !== dimensions
      || vector.some(value => !Number.isFinite(value))
    ))) {
      throw new Error("Ollama a renvoyé des vecteurs invalides ou de dimensions incohérentes.");
    }
    return payload.embeddings;
  } finally {
    clearTimeout(timeout);
  }
}

function cosineSimilarity(left, right) {
  if (left.length !== right.length) throw new Error("Les vecteurs comparés n'ont pas la même dimension.");
  let dotProduct = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) throw new Error("Un embedding de norme nulle ne peut pas être classé.");
  return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    min: Number(sorted[0].toFixed(4)),
    median: Number(median.toFixed(4)),
    max: Number(sorted[sorted.length - 1].toFixed(4))
  };
}

function evaluateRanking(cases, rankForCase) {
  const startedAt = performance.now();
  const positiveCases = cases.filter(searchCase => searchCase.expectedIds.length > 0);
  const noResultCases = cases.filter(searchCase => searchCase.expectedIds.length === 0);
  const noEvidenceCases = noResultCases.filter(searchCase => (
    !Array.isArray(searchCase.documents) || searchCase.documents.length > 0
  ));
  const scorableNoEvidenceIndexes = new Set(noEvidenceCases.map(searchCase => cases.indexOf(searchCase)));
  let top1Correct = 0;
  let reciprocalRankTotal = 0;
  let relevantRetrievedAtK = 0;
  let relevantTotal = 0;
  let strictNoEvidenceAbstentions = 0;
  const errors = [];

  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const searchCase = cases[caseIndex];
    const results = rankForCase(searchCase, caseIndex);
    const expectedIds = new Set(searchCase.expectedIds);
    if (expectedIds.size === 0) {
      if (!scorableNoEvidenceIndexes.has(caseIndex)) continue;
      if (results.length === 0) strictNoEvidenceAbstentions += 1;
      else errors.push({
        query: searchCase.query,
        expectedIds: [],
        topResult: results[0].id
      });
      continue;
    }

    relevantTotal += expectedIds.size;
    if (expectedIds.has(results[0]?.id)) top1Correct += 1;
    const firstRelevantRank = results.findIndex(result => expectedIds.has(result.id));
    if (firstRelevantRank !== -1) reciprocalRankTotal += 1 / (firstRelevantRank + 1);
    relevantRetrievedAtK += results.slice(0, topK).filter(result => expectedIds.has(result.id)).length;
    if (!expectedIds.has(results[0]?.id)) {
      errors.push({
        query: searchCase.query,
        expectedIds: [...expectedIds],
        topResult: results[0]?.id || null
      });
    }
  }

  return {
    positiveQueryCount: positiveCases.length,
    noResultQueryCount: noResultCases.length,
    noEvidenceScoredQueryCount: noEvidenceCases.length,
    top1Accuracy: positiveCases.length ? top1Correct / positiveCases.length : 0,
    meanReciprocalRank: positiveCases.length ? reciprocalRankTotal / positiveCases.length : 0,
    recallAt3: relevantTotal ? relevantRetrievedAtK / relevantTotal : 0,
    strictNoEvidenceAbstentionRate: noEvidenceCases.length
      ? strictNoEvidenceAbstentions / noEvidenceCases.length
      : null,
    unscorableNoEvidenceCaseCount: noResultCases.length - noEvidenceCases.length,
    rankingLatencyMsPerQuery: (performance.now() - startedAt) / cases.length,
    errors
  };
}

function evaluateRetrievalGate(metrics) {
  const failures = [];
  if (metrics.top1Accuracy < retrievalGate.top1Accuracy) failures.push("top1-below-threshold");
  if (metrics.recallAt3 < retrievalGate.recallAt3) failures.push("recall-at-3-below-threshold");
  if (metrics.strictNoEvidenceAbstentionRate === null
      || metrics.strictNoEvidenceAbstentionRate < retrievalGate.strictNoEvidenceAbstentionRate) {
    failures.push("no-evidence-abstention-below-100-percent");
  }
  return { thresholds: retrievalGate, passes: failures.length === 0, failures };
}

async function evaluateAssistantEvidenceHoldout() {
  const cases = await loadAssistantEvidenceHoldout();
  const documentOffsets = [];
  let documentCount = 0;
  for (const searchCase of cases) {
    documentOffsets.push(documentCount);
    documentCount += searchCase.documents.length;
  }

  const documents = cases.flatMap(searchCase => searchCase.documents);
  const inputs = [
    ...documents.map(document => documentInput(document)),
    ...cases.map(searchCase => `task: search result | query: ${searchCase.query}`)
  ];
  const startedAt = performance.now();
  const embeddings = await requestEmbeddings(inputs);
  const embeddingRequestMs = performance.now() - startedAt;
  const queryVectors = embeddings.slice(documentCount);
  const rankingByCase = cases.map((searchCase, caseIndex) => (
    searchCase.documents.map((document, documentIndex) => ({
      id: document.id,
      score: cosineSimilarity(
        queryVectors[caseIndex],
        embeddings[documentOffsets[caseIndex] + documentIndex]
      )
    })).sort((left, right) => right.score - left.score)
  ));
  const retrievalCaseIndexes = cases
    .map((searchCase, caseIndex) => searchCase.expectedStatus === "clarification" ? -1 : caseIndex)
    .filter(caseIndex => caseIndex >= 0);
  const retrievalCases = retrievalCaseIndexes.map(caseIndex => cases[caseIndex]);
  const rawMetrics = evaluateRanking(retrievalCases, (_, index) => (
    rankingByCase[retrievalCaseIndexes[index]].slice(0, topK)
  ));
  const decisions = cases.map((searchCase, caseIndex) => (
    applyEmbeddingAbstentionPolicy(searchCase.query, searchCase.documents, rankingByCase[caseIndex], { limit: topK })
  ));
  const gatedMetrics = evaluateRanking(retrievalCases, (_, index) => (
    decisions[retrievalCaseIndexes[index]].candidateIds.map(id => ({ id }))
  ));
  const routeCounts = decisions.reduce((counts, decision) => ({
    ...counts,
    [decision.route]: (counts[decision.route] || 0) + 1
  }), {});
  const expectedStatusCounts = cases.reduce((counts, searchCase) => ({
    ...counts,
    [searchCase.expectedStatus]: (counts[searchCase.expectedStatus] || 0) + 1
  }), {});
  const caseDiagnostics = cases.map((searchCase, caseIndex) => ({
    id: searchCase.id,
    expectedStatus: searchCase.expectedStatus,
    expectedEvidenceIds: searchCase.expectedIds,
    retrievalScored: searchCase.expectedStatus !== "clarification"
      && (searchCase.expectedIds.length > 0 || searchCase.documents.length > 0),
    noEvidenceScored: searchCase.expectedIds.length === 0 && searchCase.documents.length > 0,
    embeddingTop3: rankingByCase[caseIndex].slice(0, topK).map(result => result.id),
    abstentionRoute: decisions[caseIndex].route,
    returnedIds: decisions[caseIndex].candidateIds
  }));

  return {
    source: "Assistant A2 synthetic evidence; history and unverified passages excluded; clarification cases excluded from retrieval scoring",
    documents: documentCount,
    queries: cases.length,
    retrievalScoredCases: retrievalCases.length,
    clarificationCasesExcludedFromRetrievalGate: cases.length - retrievalCases.length,
    embeddedItems: inputs.length,
    embeddingRequestMs: Number(embeddingRequestMs.toFixed(1)),
    expectedStatusCounts,
    answerGenerationEvaluated: false,
    rawEmbeddings: {
      ...rawMetrics,
      retrievalGate: evaluateRetrievalGate(rawMetrics)
    },
    benchmarkOnlyHybridAbstention: {
      ...gatedMetrics,
      retrievalGate: evaluateRetrievalGate(gatedMetrics),
      routeCounts,
      generatedAnswersEvaluated: false,
      caseDiagnostics
    },
    caseDiagnostics
  };
}

async function evaluateIndependentSearchHoldout() {
  const { documents, cases } = await loadIndependentSearchHoldout();
  const documentOffsets = cases.map((_, caseIndex) => caseIndex * documents.length);
  const documentInputs = documents.map(documentInput);
  const queryInputs = cases.map(searchCase => `task: search result | query: ${searchCase.query}`);
  const inputs = cases.flatMap(() => documentInputs).concat(queryInputs);
  const startedAt = performance.now();
  const embeddings = await requestEmbeddings(inputs);
  const embeddingRequestMs = performance.now() - startedAt;
  const queryVectors = embeddings.slice(documents.length * cases.length);
  const rankingByCase = cases.map((searchCase, caseIndex) => documents.map((document, documentIndex) => ({
    id: document.id,
    score: cosineSimilarity(
      queryVectors[caseIndex],
      embeddings[documentOffsets[caseIndex] + documentIndex]
    )
  })).sort((left, right) => right.score - left.score));
  const decisions = cases.map((searchCase, caseIndex) => (
    applyEmbeddingAbstentionPolicy(searchCase.query, documents, rankingByCase[caseIndex], { limit: topK })
  ));
  const retrievalCaseIndexes = cases
    .map((searchCase, caseIndex) => searchCase.expectedStatus === "clarification" ? -1 : caseIndex)
    .filter(caseIndex => caseIndex >= 0);
  const retrievalCases = retrievalCaseIndexes.map(caseIndex => cases[caseIndex]);
  const rawMetrics = evaluateRanking(retrievalCases, (_, index) => (
    rankingByCase[retrievalCaseIndexes[index]].slice(0, topK)
  ));
  const gatedMetrics = evaluateRanking(retrievalCases, (_, index) => (
    decisions[retrievalCaseIndexes[index]].candidateIds.map(id => ({ id }))
  ));
  const expectedStatusCounts = cases.reduce((counts, searchCase) => ({
    ...counts,
    [searchCase.expectedStatus]: (counts[searchCase.expectedStatus] || 0) + 1
  }), {});
  const caseDiagnostics = cases.map((searchCase, caseIndex) => ({
    id: searchCase.id,
    expectedStatus: searchCase.expectedStatus,
    expectedEvidenceIds: searchCase.expectedIds,
    retrievalScored: searchCase.expectedStatus !== "clarification"
      && (searchCase.expectedIds.length > 0 || searchCase.documents.length > 0),
    embeddingTop3: rankingByCase[caseIndex].slice(0, topK).map(result => result.id),
    abstentionRoute: decisions[caseIndex].route,
    returnedIds: decisions[caseIndex].candidateIds
  }));
  return {
    source: "New synthetic A3 holdout; not used to modify the policy after this run",
    documents: documents.length,
    queries: cases.length,
    retrievalScoredCases: retrievalCases.length,
    clarificationCasesExcludedFromRetrievalGate: cases.length - retrievalCases.length,
    embeddedItems: inputs.length,
    embeddingRequestMs: Number(embeddingRequestMs.toFixed(1)),
    expectedStatusCounts,
    answerGenerationEvaluated: false,
    rawEmbeddings: { ...rawMetrics, retrievalGate: evaluateRetrievalGate(rawMetrics) },
    benchmarkOnlyHybridAbstention: {
      ...gatedMetrics,
      retrievalGate: evaluateRetrievalGate(gatedMetrics),
      generatedAnswersEvaluated: false
    },
    caseDiagnostics
  };
}

async function main() {
  const documents = await loadSearchCorpus();
  const cases = expandedSearchEvaluationCases;
  validateCorpus(documents, cases);

  const documentInputs = documents.map(documentInput);
  const queryInputs = cases.map(searchCase => `task: search result | query: ${searchCase.query}`);
  const inputs = [...documentInputs, ...queryInputs];
  const embeddingStartedAt = performance.now();
  const embeddings = await requestEmbeddings(inputs);
  const embeddingRequestMs = performance.now() - embeddingStartedAt;
  const documentVectors = embeddings.slice(0, documents.length);
  const queryVectors = embeddings.slice(documents.length);
  const rankedByEmbeddings = queryIndex => documents.map((document, documentIndex) => ({
    id: document.id,
    score: cosineSimilarity(queryVectors[queryIndex], documentVectors[documentIndex])
  })).sort((left, right) => right.score - left.score);

  const embeddingScores = cases.map((searchCase, queryIndex) => rankedByEmbeddings(queryIndex));
  const evaluateCurrentSearch = strategy => evaluateRanking(cases, searchCase => (
    rankDocuments(searchCase.query, documents, { strategy }).map(result => ({ id: result.document.id }))
  ));
  const lexical = evaluateCurrentSearch("lexical");
  const metadata = evaluateCurrentSearch("metadata");
  const hybrid = evaluateCurrentSearch("hybrid");
  const embedding = evaluateRanking(cases, (searchCase, queryIndex) => {
    return embeddingScores[queryIndex].slice(0, topK);
  });
  const abstentionDecisions = cases.map((searchCase, queryIndex) => (
    applyEmbeddingAbstentionPolicy(searchCase.query, documents, embeddingScores[queryIndex], { limit: topK })
  ));
  const gatedHybrid = evaluateRanking(cases, (_, queryIndex) => (
    abstentionDecisions[queryIndex].candidateIds.map(id => ({ id }))
  ));
  const routeCounts = abstentionDecisions.reduce((counts, decision) => ({
    ...counts,
    [decision.route]: (counts[decision.route] || 0) + 1
  }), {});
  const positiveBestScores = cases.flatMap((searchCase, queryIndex) => (
    searchCase.expectedIds.length
      ? [Math.max(...embeddingScores[queryIndex]
        .filter(result => searchCase.expectedIds.includes(result.id))
        .map(result => result.score))]
      : []
  ));
  const noResultTopScores = cases.flatMap((searchCase, queryIndex) => (
    searchCase.expectedIds.length === 0 ? [embeddingScores[queryIndex][0].score] : []
  ));
  const hybridAnswerQuality = evaluateSearchCorpus(cases, documents);
  const assistantEvidenceHoldout = await evaluateAssistantEvidenceHoldout();
  const independentSearchHoldout = await evaluateIndependentSearchHoldout();

  console.log(JSON.stringify({
    model,
    runtime: "Ollama local loopback (127.0.0.1)",
    promptFormat: "title: {name} | text: {document}; task: search result | query: {question}",
    documents: documents.length,
    queries: cases.length,
    embeddedItems: inputs.length,
    embeddingRequestMs: Number(embeddingRequestMs.toFixed(1)),
    currentSearch: {
      lexical: { ...lexical, retrievalGate: evaluateRetrievalGate(lexical) },
      metadata: { ...metadata, retrievalGate: evaluateRetrievalGate(metadata) },
      hybrid: {
        ...hybrid,
        retrievalGate: evaluateRetrievalGate(hybrid),
        factAccuracy: hybridAnswerQuality.factAccuracy,
        correctAbstentionRate: hybridAnswerQuality.correctAbstentionRate,
        unsupportedAnswerCount: hybridAnswerQuality.unsupportedAnswerCount
      }
    },
    benchmarkOnlyHybridAbstention: {
      policy: "keep deterministic results; otherwise require an embedding top-3 candidate with explicit type compatibility and a unique lexical subject anchor",
      ...gatedHybrid,
      retrievalGate: evaluateRetrievalGate(gatedHybrid),
      routeCounts,
      generatedAnswersEvaluated: false
    },
    embeddings: {
      ...embedding,
      retrievalGate: evaluateRetrievalGate(embedding),
      factualAnswersEvaluated: false,
      positiveBestScore: summarize(positiveBestScores),
      noResultTop1Score: summarize(noResultTopScores),
      scoreSeparationMargin: Number((Math.min(...positiveBestScores) - Math.max(...noResultTopScores)).toFixed(4))
    },
    assistantEvidenceHoldout,
    independentSearchHoldout
  }, null, 2));
}

main().catch(error => {
  console.error(`Évaluation EmbeddingGemma : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
  process.exitCode = 1;
});
