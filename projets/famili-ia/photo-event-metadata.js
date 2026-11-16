import { normalizeText } from "./search-utils.js";
import { isPhotoDocument } from "./photo-annotations.js";

const WEDDING_ALIASES = Object.freeze(["mariages", "mariage", "noces", "weddings", "wedding"]);
const IGNORED_PATHS = new Set(["saisie manuelle", "background sync"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findWeddingAlias(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return WEDDING_ALIASES.find(alias =>
    (` ${normalized} `).includes(` ${alias} `)) ?? null;
}

function sourceProvenance(document, field) {
  const indexRecord = document.indexRecord;
  const sourceId = typeof indexRecord?.sourceId === "string" ? indexRecord.sourceId : null;
  const itemId = typeof indexRecord?.itemId === "string" ? indexRecord.itemId : document.id;
  const accountRef = document.dropboxAccountFingerprint ?? document.oneDriveAccountFingerprint ?? null;
  if (sourceId && sourceId !== "local" && sourceId !== "demo") {
    return {
      kind: "provider",
      field,
      providerId: sourceId,
      accountRef,
      itemId
    };
  }
  return { kind: "filename", field };
}

function appendCandidate(candidates, document, {
  text,
  source,
  provenance,
  factId = null,
  matchType = "lexical-match"
}) {
  const alias = findWeddingAlias(text);
  if (!alias) return;
  candidates.push({
    photoId: document.id,
    eventId: "wedding",
    eventLabel: "mariage",
    matchedAlias: alias,
    matchType,
    source,
    text,
    provenance,
    sourceFactId: factId
  });
}

function appendPathCandidates(candidates, document, path, provenance) {
  if (typeof path !== "string" || !path.trim() || IGNORED_PATHS.has(normalizeText(path))) return;
  const segments = path.split(/[\\/]+/u).filter(Boolean);
  if (normalizeText(segments[segments.length - 1] ?? "") === normalizeText(document.name ?? "")) {
    segments.pop();
  }
  for (const segment of segments) {
    appendCandidate(candidates, document, {
      text: segment,
      source: "folder-name",
      provenance
    });
  }
}

export function findMetadataEventCandidates(document) {
  if (!isObject(document) || typeof document.id !== "string" || !document.id.trim()
    || !isPhotoDocument(document)) {
    throw new TypeError("A photo document requires a persistent ID and a supported photo type.");
  }

  const candidates = [];
  const facts = document.photoFacts?.facts;
  if (facts != null && !Array.isArray(facts)) {
    throw new TypeError("Photo facts must be a list.");
  }
  for (const fact of facts ?? []) {
    if (!isObject(fact)) throw new TypeError("Photo fact must be an object.");
    if (!["caption", "keyword"].includes(fact.kind) || fact.status === "rejected") continue;
    if (!isObject(fact.value) || typeof fact.value.text !== "string"
      || !isObject(fact.provenance) || !["xmp", "iptc", "provider"].includes(fact.provenance.kind)
      || typeof fact.provenance.field !== "string") {
      throw new TypeError("Photo caption or keyword fact is invalid.");
    }
    const explicitLabel = fact.kind === "keyword"
      && WEDDING_ALIASES.includes(normalizeText(fact.value.text));
    appendCandidate(candidates, document, {
      text: fact.value.text,
      source: fact.kind,
      provenance: fact.provenance,
      factId: typeof fact.id === "string" ? fact.id : null,
      matchType: explicitLabel ? "explicit-label" : "lexical-match"
    });
  }

  const fileName = document.name ?? document.originalName;
  if (typeof fileName === "string" && fileName.trim()) {
    appendCandidate(candidates, document, {
      text: fileName,
      source: "file-name",
      provenance: sourceProvenance(document, "name")
    });
  }

  appendPathCandidates(candidates, document, document.sourceDir, { kind: "filename", field: "sourceDir" });
  for (const copy of document.photoFacts?.sourceCopies ?? []) {
    if (!isObject(copy) || typeof copy.path !== "string" || !copy.path.trim()) continue;
    appendPathCandidates(candidates, document, copy.path, {
      kind: "provider",
      field: "path",
      providerId: copy.providerId,
      accountRef: copy.accountRef,
      itemId: copy.itemId
    });
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const key = JSON.stringify([
      candidate.eventId,
      candidate.matchType,
      candidate.source,
      candidate.provenance,
      candidate.sourceFactId,
      normalizeText(candidate.text)
    ]);
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}
