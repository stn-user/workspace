import { normalizeText } from "./search-utils.js";

function queryWords(query) {
  if (typeof query !== "string" || !normalizeText(query)) throw new TypeError("Requête invalide");
  return [...new Set(normalizeText(query).split(" "))];
}

function validateDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc) ||
      typeof doc.sourceId !== "string" || !doc.sourceId.trim() ||
      typeof doc.itemId !== "string" || !doc.itemId.trim() ||
      typeof doc.name !== "string" || !doc.name.trim() ||
      !Array.isArray(doc.segments) || doc.segments.some(segment => typeof segment !== "string")) {
    throw new TypeError("Document de recherche invalide");
  }
}

function findEvidence(segments, words) {
  const found = new Map();
  for (const text of segments) {
    for (const match of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
      const token = normalizeText(match[0]);
      for (const word of words) {
        if (!found.has(word) && token.includes(word)) {
          const start = Math.max(0, match.index - 60);
          const end = Math.min(text.length, match.index + match[0].length + 60);
          found.set(word, text.slice(start, end));
        }
      }
    }
  }
  if (found.size !== words.length) return [];
  return words.map(word => ({
    location: "content", value: found.get(word), source: "extracted",
    estimated: false, proof: { excerpt: found.get(word), location: null }, matchedWords: [word]
  }));
}

export function searchContent(doc, query) {
  const words = queryWords(query);
  validateDocument(doc);
  return findEvidence(doc.segments, words);
}

export function searchContentInDocuments(documents, query) {
  const words = queryWords(query);
  if (!Array.isArray(documents)) throw new TypeError("Documents invalides");
  const seen = new Map();
  const results = [];
  for (const doc of documents) {
    validateDocument(doc);
    if (!seen.has(doc.sourceId)) seen.set(doc.sourceId, new Set());
    if (seen.get(doc.sourceId).has(doc.itemId)) throw new TypeError("Identité dupliquée");
    seen.get(doc.sourceId).add(doc.itemId);
    const reasons = findEvidence(doc.segments, words);
    if (reasons.length) results.push({ sourceId: doc.sourceId, itemId: doc.itemId, reasons });
  }
  return results;
}
