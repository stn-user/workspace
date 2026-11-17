import { findMetadataEventCandidates } from "./photo-event-metadata.js";

function emptyCounts() {
  return { truePositives: 0, falsePositives: 0, falseNegatives: 0, trueNegatives: 0 };
}

function addObservation(counts, expected, predicted) {
  if (expected) counts[predicted ? "truePositives" : "falseNegatives"] += 1;
  else counts[predicted ? "falsePositives" : "trueNegatives"] += 1;
}

function metrics(counts) {
  const { truePositives, falsePositives, falseNegatives, trueNegatives } = counts;
  const predicted = truePositives + falsePositives;
  const positives = truePositives + falseNegatives;
  return {
    ...counts,
    suggestions: predicted,
    abstentions: falseNegatives + trueNegatives,
    precision: predicted ? truePositives / predicted : null,
    recall: positives ? truePositives / positives : null
  };
}

export function evaluateWeddingMetadata(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new TypeError("Le corpus doit être une liste non vide.");
  }

  const ids = new Set();
  const counts = { all: emptyCounts(), explicitLabel: emptyCounts(), lexicalMatch: emptyCounts() };
  let unknown = 0;
  let unknownWithSuggestion = 0;

  for (const entry of cases) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || !entry.document || typeof entry.document !== "object" || Array.isArray(entry.document)
      || !Object.hasOwn(entry, "expectedWedding")
      || ![true, false, null].includes(entry.expectedWedding)) {
      throw new TypeError("Chaque cas doit contenir un document et une annotation expectedWedding vraie, fausse ou nulle.");
    }
    const id = entry.document.id;
    if (typeof id !== "string" || !id.trim() || ids.has(id)) {
      throw new TypeError("Chaque photo doit avoir un identifiant non vide et unique.");
    }
    ids.add(id);

    const candidates = findMetadataEventCandidates(entry.document);
    const explicit = candidates.some(candidate => candidate.matchType === "explicit-label");
    const lexical = candidates.some(candidate => candidate.matchType === "lexical-match");
    if (entry.expectedWedding === null) {
      unknown += 1;
      if (candidates.length) unknownWithSuggestion += 1;
      continue;
    }
    addObservation(counts.all, entry.expectedWedding, candidates.length > 0);
    addObservation(counts.explicitLabel, entry.expectedWedding, explicit);
    addObservation(counts.lexicalMatch, entry.expectedWedding, lexical);
  }

  return {
    photos: cases.length,
    evaluated: cases.length - unknown,
    unknown,
    unknownWithSuggestion,
    all: metrics(counts.all),
    explicitLabel: metrics(counts.explicitLabel),
    lexicalMatch: metrics(counts.lexicalMatch)
  };
}
