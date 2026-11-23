import { getQuestionSubjectTerms, normalizeText, rankDocuments } from "../search-utils.js";

const requestedTypes = new Set(["facture", "contrat", "garantie", "notice", "reservation"]);

function normalizeToken(value) {
  if (typeof value !== "string") return "";
  const token = normalizeText(value);
  return token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function getRequestedType(query) {
  const matches = [...new Set(
    normalizeText(query).split(/\s+/).map(normalizeToken).filter(token => requestedTypes.has(token))
  )];
  return matches.length > 1 ? { conflict: true, type: null } : { conflict: false, type: matches[0] || null };
}

function isTypeCompatible(documentType, requestedType) {
  return !requestedType.type || !documentType || normalizeToken(documentType) === requestedType.type;
}

function countSubjectAnchors(query, document) {
  const queryTerms = [...new Set(getQuestionSubjectTerms(query).map(normalizeToken).filter(Boolean))];
  const documentTerms = new Set(normalizeText([
    document.name,
    document.keywords,
    document.content
  ].filter(Boolean).join(" ")).split(/\s+/).map(normalizeToken));
  return queryTerms.filter(term => documentTerms.has(term)).length;
}

export function applyEmbeddingAbstentionPolicy(query, documents, embeddingResults, { limit = 3 } = {}) {
  const existingResults = rankDocuments(query, documents, { limit, strategy: "hybrid" });
  if (existingResults.length) {
    return {
      candidateIds: existingResults.map(result => result.document.id),
      route: "existing-search"
    };
  }

  const subjectTerms = getQuestionSubjectTerms(query);
  if (subjectTerms.length === 0) return { candidateIds: [], route: "no-subject" };

  const requestedType = getRequestedType(query);
  if (requestedType.conflict) return { candidateIds: [], route: "conflicting-types" };

  const documentsById = new Map(documents.map(document => [document.id, document]));
  const candidates = embeddingResults.slice(0, limit)
    .map(result => ({ ...result, document: documentsById.get(result.id) }))
    .filter(result => result.document && isTypeCompatible(result.document.type, requestedType))
    .map(result => ({ ...result, anchorCount: countSubjectAnchors(query, result.document) }))
    .filter(result => result.anchorCount > 0);

  if (candidates.length === 0) {
    const typeMatchedCandidates = embeddingResults.slice(0, limit).some(result => {
      const document = documentsById.get(result.id);
      return document && isTypeCompatible(document.type, requestedType);
    });
    return {
      candidateIds: [],
      route: requestedType.type && !typeMatchedCandidates ? "no-type-match" : "no-subject-anchor"
    };
  }

  const bestAnchorCount = Math.max(...candidates.map(candidate => candidate.anchorCount));
  const bestCandidates = candidates.filter(candidate => candidate.anchorCount === bestAnchorCount);
  if (bestCandidates.length !== 1) {
    return {
      candidateIds: bestCandidates.map(candidate => candidate.id),
      route: "multiple-anchored-candidates"
    };
  }

  return { candidateIds: [bestCandidates[0].id], route: "embedding-with-unique-anchor" };
}
