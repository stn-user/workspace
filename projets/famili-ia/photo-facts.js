import { getInventorySource } from "./data-inventory.js";
import { isPhotoDocument, normalizePhotoAnnotations } from "./photo-annotations.js";
import { migratePhotoMetadata } from "./photo-metadata.js";

export const PHOTO_FACTS_SCHEMA_VERSION = 1;

const FACT_KINDS = new Set(["captureDate", "location", "place", "person", "event"]);
const FACT_STATUSES = new Set(["extracted", "suggested", "confirmed", "rejected"]);
const PROVENANCE_KINDS = new Set([
  "exif", "xmp", "iptc", "provider", "user", "filename", "model", "derived", "legacy"
]);
const SINGLE_VALUE_KINDS = new Set(["captureDate", "location", "place"]);
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const DATE_STAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKeys(value, allowed, label) {
  if (!isObject(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new TypeError(`${label} contains an unsupported field.`);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertString(value, label, maxLength = 512) {
  if (!isNonEmptyString(value) || value.trim().length > maxLength || /[\u0000-\u001f]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty, bounded string.`);
  }
  const normalized = value.trim();
  if (/^(?:https?|data|blob):/i.test(normalized) || /\b(?:access|refresh)[_-]?token\b|bearer\s/i.test(normalized)) {
    throw new TypeError(`${label} must not contain a URL or credential.`);
  }
  return normalized;
}

function isValidLocalDateTime(value) {
  if (typeof value !== "string") return false;
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59;
}

function isValidDateStamp(value) {
  if (typeof value !== "string") return false;
  const match = DATE_STAMP_PATTERN.exec(value);
  if (!match) return false;
  const [, date, time, , zone] = match;
  const localDateTime = `${date}T${time ?? "00:00:00"}`;
  if (!isValidLocalDateTime(localDateTime)) return false;
  if (!zone) return true;
  if (zone === "Z") return true;
  const offset = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (!offset) return false;
  const hours = Number(offset[2]);
  const minutes = Number(offset[3]);
  return hours <= 14 && minutes <= 59 && (hours !== 14 || minutes === 0);
}

function normalizeOptionalDateStamp(value, label) {
  if (value == null) return null;
  if (!isValidDateStamp(value)) throw new TypeError(`${label} must be a valid date or timestamp.`);
  return value;
}

function normalizeContentHash(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(value)) {
    throw new TypeError("Photo content hash must be SHA-256.");
  }
  return value.toLowerCase();
}

function normalizeAccountRef(value) {
  if (value == null) return null;
  const accountRef = assertString(value, "Account reference", 160);
  if (!/^[a-f0-9]{64}$/i.test(accountRef)) {
    throw new TypeError("Account reference must be an opaque SHA-256 fingerprint.");
  }
  return accountRef.toLowerCase();
}

function normalizeStableItemId(value) {
  const itemId = assertString(value, "Provider item ID");
  if (/[?#]/.test(itemId)) throw new TypeError("Provider item ID must not be a temporary link.");
  return itemId;
}

function stableFactId(prefix, value) {
  const serialized = JSON.stringify(value);
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  // These deterministic IDs support replay only; the SHA-256 content hash remains the duplicate fingerprint.
  return `${prefix}:${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeProvenance(value) {
  assertKeys(value, ["kind", "field", "providerId", "accountRef", "itemId"], "Provenance");
  if (!PROVENANCE_KINDS.has(value.kind)) throw new TypeError("Provenance kind is invalid.");
  const field = assertString(value.field, "Provenance field", 160);
  const providerId = value.providerId == null ? null : assertString(value.providerId, "Provider ID", 120);
  const accountRef = normalizeAccountRef(value.accountRef);
  const itemId = value.itemId == null ? null : normalizeStableItemId(value.itemId);
  if (value.kind === "provider" && (!providerId || !itemId)) {
    throw new TypeError("Provider provenance requires a provider and stable item ID.");
  }
  return { kind: value.kind, field, providerId, accountRef, itemId };
}

function normalizeSourceCopy(value) {
  assertKeys(value, ["providerId", "accountRef", "itemId", "path", "lastCheckedAt"], "Source copy");
  const providerId = assertString(value.providerId, "Provider ID", 120);
  const accountRef = normalizeAccountRef(value.accountRef);
  const itemId = normalizeStableItemId(value.itemId);
  const path = value.path == null ? null : assertString(value.path, "Source path");
  if (path && (/^(?:https?|data|blob):/i.test(path) || /[?#]/.test(path))) {
    throw new TypeError("A source path must not be a temporary URL.");
  }
  return {
    providerId,
    accountRef,
    itemId,
    path,
    lastCheckedAt: normalizeOptionalDateStamp(value.lastCheckedAt, "lastCheckedAt")
  };
}

function normalizeFactValue(kind, value) {
  if (kind === "captureDate") {
    assertKeys(value, ["raw", "localDateTime", "offsetMinutes"], "Capture date");
    const raw = value.raw == null ? null : assertString(value.raw, "Capture date raw value", 256);
    if (!isValidLocalDateTime(value.localDateTime)) {
      throw new TypeError("Capture date localDateTime is invalid.");
    }
    const offsetMinutes = value.offsetMinutes;
    if (offsetMinutes !== null && (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60)) {
      throw new TypeError("Capture date timezone offset is invalid.");
    }
    return { raw, localDateTime: value.localDateTime, offsetMinutes };
  }
  if (kind === "location") {
    assertKeys(value, ["latitude", "longitude", "altitudeMeters", "accuracyMeters"], "Location");
    if (typeof value.latitude !== "number" || !Number.isFinite(value.latitude)
      || value.latitude < -90 || value.latitude > 90
      || typeof value.longitude !== "number" || !Number.isFinite(value.longitude)
      || value.longitude < -180 || value.longitude > 180) {
      throw new TypeError("Location coordinates are invalid.");
    }
    const altitudeMeters = value.altitudeMeters ?? null;
    const accuracyMeters = value.accuracyMeters ?? null;
    if (altitudeMeters !== null && (typeof altitudeMeters !== "number" || !Number.isFinite(altitudeMeters))) {
      throw new TypeError("Location altitude is invalid.");
    }
    if (accuracyMeters !== null && (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters)
      || accuracyMeters < 0)) {
      throw new TypeError("Location accuracy is invalid.");
    }
    return { latitude: value.latitude, longitude: value.longitude, altitudeMeters, accuracyMeters };
  }
  if (kind === "place") {
    assertKeys(value, ["label"], "Place");
    return { label: assertString(value.label, "Place label", 120) };
  }
  if (kind === "person") {
    assertKeys(value, ["memberId", "label"], "Person");
    const memberId = value.memberId == null ? null : assertString(value.memberId, "Person member ID", 160);
    const label = value.label == null ? null : assertString(value.label, "Person label", 120);
    if (!memberId && !label) throw new TypeError("A person fact requires a member ID or explicit label.");
    return { memberId, label };
  }
  assertKeys(value, ["eventId", "label"], "Event");
  const eventId = value.eventId == null ? null : assertString(value.eventId, "Event ID", 160);
  const label = value.label == null ? null : assertString(value.label, "Event label", 120);
  if (!eventId && !label) throw new TypeError("An event fact requires an ID or label.");
  return { eventId, label };
}

function normalizeEvidence(value, provenance) {
  if (value == null) return null;
  if (value.kind === "metadata-field") {
    assertKeys(value, ["kind", "field", "excerpt"], "Metadata evidence");
    if (provenance.kind === "model") throw new TypeError("Visual model evidence must not contain a text excerpt.");
    return {
      kind: value.kind,
      field: assertString(value.field, "Evidence field", 160),
      excerpt: value.excerpt == null ? null : assertString(value.excerpt, "Evidence excerpt", 500)
    };
  }
  if (value.kind === "model-output") {
    assertKeys(value, ["kind", "method", "modelVersion", "calibratedScore"], "Model evidence");
    if (provenance.kind !== "model") throw new TypeError("Model evidence requires model provenance.");
    const method = assertString(value.method, "Model method", 120);
    const modelVersion = assertString(value.modelVersion, "Model version", 120);
    if (typeof value.calibratedScore !== "number" || !Number.isFinite(value.calibratedScore)
      || value.calibratedScore < 0 || value.calibratedScore > 1) {
      throw new TypeError("Calibrated model score must be between 0 and 1.");
    }
    return { kind: value.kind, method, modelVersion, calibratedScore: value.calibratedScore };
  }
  throw new TypeError("Evidence kind is invalid.");
}

function normalizeReview(value) {
  if (value == null) return null;
  assertKeys(value, ["by", "at"], "Review");
  if (value.by !== "user") throw new TypeError("Only an explicit user review is supported.");
  return { by: value.by, at: normalizeOptionalDateStamp(value.at, "review.at") };
}

function normalizeFact(value) {
  assertKeys(value, [
    "id", "kind", "value", "status", "provenance", "evidence", "analyzedAt", "review", "dependsOnFactIds"
  ], "Photo fact");
  const id = assertString(value.id, "Fact ID", 200);
  if (!FACT_KINDS.has(value.kind)) throw new TypeError("Photo fact kind is invalid.");
  if (!FACT_STATUSES.has(value.status)) throw new TypeError("Photo fact status is invalid.");
  const provenance = normalizeProvenance(value.provenance);
  const evidence = normalizeEvidence(value.evidence, provenance);
  const analyzedAt = normalizeOptionalDateStamp(value.analyzedAt, "analyzedAt");
  const review = normalizeReview(value.review);
  if (["confirmed", "rejected"].includes(value.status) !== Boolean(review)) {
    throw new TypeError("Confirmed and rejected facts require an explicit user review.");
  }
  if (provenance.kind === "user" && value.status !== "confirmed") {
    throw new TypeError("A user-entered fact must be confirmed.");
  }
  if (provenance.kind === "model"
    && (!["suggested", "rejected"].includes(value.status) || evidence?.kind !== "model-output" || !analyzedAt)) {
    throw new TypeError("Model facts must remain suggestions or rejected candidates with model details.");
  }
  if (provenance.kind !== "model" && evidence?.kind === "model-output") {
    throw new TypeError("Model evidence requires model provenance.");
  }
  if (!Array.isArray(value.dependsOnFactIds)) throw new TypeError("dependsOnFactIds must be an array.");
  const dependsOnFactIds = [...new Set(value.dependsOnFactIds.map(id => assertString(id, "Dependency ID", 200)))];
  if (dependsOnFactIds.length !== value.dependsOnFactIds.length || dependsOnFactIds.includes(id)) {
    throw new TypeError("Fact dependencies must be unique and cannot include the fact itself.");
  }
  if (provenance.kind === "derived" && dependsOnFactIds.length === 0) {
    throw new TypeError("A derived fact must identify its source facts.");
  }
  return {
    id,
    kind: value.kind,
    value: normalizeFactValue(value.kind, value.value),
    status: value.status,
    provenance,
    evidence,
    analyzedAt,
    review,
    dependsOnFactIds
  };
}

function validateFactDependencies(facts) {
  const factsById = new Map(facts.map(fact => [fact.id, fact]));
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) throw new TypeError("Photo fact dependencies must not contain cycles.");
    if (visited.has(id)) return;
    const fact = factsById.get(id);
    if (!fact) throw new TypeError(`Photo fact dependency ${id} does not exist.`);
    visiting.add(id);
    for (const dependencyId of fact.dependsOnFactIds) visit(dependencyId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const fact of facts) visit(fact.id);
}

export function createPhotoFactSet(documentId, values = {}) {
  if (!isNonEmptyString(documentId)) throw new TypeError("Photo fact set requires a document ID.");
  const candidate = {
    schemaVersion: PHOTO_FACTS_SCHEMA_VERSION,
    documentId: documentId.trim(),
    contentHash: values.contentHash ?? null,
    sourceCopies: values.sourceCopies ?? [],
    dates: values.dates ?? {},
    facts: values.facts ?? []
  };
  return normalizePhotoFactSet(candidate);
}

export function normalizePhotoFactSet(value) {
  assertKeys(value, ["schemaVersion", "documentId", "contentHash", "sourceCopies", "dates", "facts"], "Photo fact set");
  if (value.schemaVersion !== PHOTO_FACTS_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported photo fact schema version: ${value.schemaVersion ?? "missing"}.`);
  }
  const documentId = assertString(value.documentId, "Document ID", 200);
  const contentHash = normalizeContentHash(value.contentHash);
  if (!Array.isArray(value.sourceCopies) || !Array.isArray(value.facts)) {
    throw new TypeError("Photo fact set copies and facts must be arrays.");
  }
  assertKeys(value.dates, [
    "fileCreatedAt", "fileModifiedAt", "importedAt", "analyzedAt", "lastSourceCheckAt"
  ], "Photo dates");
  const dates = {
    fileCreatedAt: normalizeOptionalDateStamp(value.dates.fileCreatedAt, "fileCreatedAt"),
    fileModifiedAt: normalizeOptionalDateStamp(value.dates.fileModifiedAt, "fileModifiedAt"),
    importedAt: normalizeOptionalDateStamp(value.dates.importedAt, "importedAt"),
    analyzedAt: normalizeOptionalDateStamp(value.dates.analyzedAt, "analyzedAt"),
    lastSourceCheckAt: normalizeOptionalDateStamp(value.dates.lastSourceCheckAt, "lastSourceCheckAt")
  };
  const sourceCopies = value.sourceCopies.map(normalizeSourceCopy);
  const identities = new Set();
  for (const copy of sourceCopies) {
    const identity = JSON.stringify([copy.providerId, copy.accountRef, copy.itemId]);
    if (identities.has(identity)) throw new TypeError("Photo source copy identity must be unique.");
    identities.add(identity);
  }
  const facts = value.facts.map(normalizeFact);
  const factIds = new Set();
  for (const fact of facts) {
    if (factIds.has(fact.id)) throw new TypeError("Photo fact IDs must be unique.");
    factIds.add(fact.id);
  }
  validateFactDependencies(facts);
  return { schemaVersion: PHOTO_FACTS_SCHEMA_VERSION, documentId, contentHash, sourceCopies, dates, facts };
}

function dateFact(id, value, source, status = "extracted") {
  return {
    id,
    kind: "captureDate",
    value: {
      raw: value.raw ?? null,
      localDateTime: value.localDateTime,
      offsetMinutes: value.offsetMinutes ?? null
    },
    status,
    provenance: { kind: source.kind, field: source.field },
    evidence: source.kind === "user" ? null : {
      kind: "metadata-field",
      field: source.field,
      excerpt: value.raw ?? null
    },
    analyzedAt: null,
    review: status === "confirmed" ? { by: "user", at: null } : null,
    dependsOnFactIds: []
  };
}

export function photoFactSetFromDocument(document, { includeLocation = false } = {}) {
  if (!isObject(document) || !isNonEmptyString(document.id) || !isPhotoDocument(document)) {
    throw new TypeError("A photo document requires a persistent ID and a supported photo type.");
  }
  if (typeof includeLocation !== "boolean") throw new TypeError("includeLocation must be a boolean.");
  const documentId = document.id.trim();
  const facts = [];
  if (document.photoMetadata != null) {
    const migrated = migratePhotoMetadata(document.photoMetadata, documentId);
    if (migrated.issues.length) {
      throw new TypeError(`Photo metadata cannot be converted: ${migrated.issues.join("; ")}`);
    }
    const metadata = migrated.metadata;
    if (metadata.captureDate) {
      const source = metadata.captureDate.source;
      const status = source.kind === "user" ? "confirmed"
        : ["legacy", "filename"].includes(source.kind) ? "suggested" : "extracted";
      facts.push(dateFact(
        stableFactId("legacy:captureDate", [source, metadata.captureDate]),
        metadata.captureDate,
        source,
        status
      ));
    }
    if (includeLocation && metadata.location.status === "available") {
      facts.push({
        id: stableFactId("legacy:location", metadata.location),
        kind: "location",
        value: {
          latitude: metadata.location.latitude,
          longitude: metadata.location.longitude,
          altitudeMeters: metadata.location.altitudeMeters,
          accuracyMeters: null
        },
        status: metadata.location.source.kind === "user" ? "confirmed" : "extracted",
        provenance: { kind: metadata.location.source.kind, field: metadata.location.source.field },
        evidence: { kind: "metadata-field", field: metadata.location.source.field, excerpt: null },
        analyzedAt: null,
        review: metadata.location.source.kind === "user" ? { by: "user", at: null } : null,
        dependsOnFactIds: []
      });
    }
  }

  if (document.photoAnnotations != null) {
    const rawIds = document.photoAnnotations.personIds ?? [];
    if (!Array.isArray(rawIds)) throw new TypeError("Photo person annotations must be a list.");
    const annotations = normalizePhotoAnnotations(document.photoAnnotations, rawIds);
    if (annotations.captureDateOverride) {
      facts.push(dateFact(stableFactId("legacy:annotation:captureDate", annotations.captureDateOverride), {
        raw: null,
        localDateTime: annotations.captureDateOverride.localDateTime,
        offsetMinutes: annotations.captureDateOverride.offsetMinutes
      }, { kind: "user", field: "captureDateOverride" }, "confirmed"));
    }
    if (annotations.placeLabel) {
      facts.push({
        id: stableFactId("legacy:annotation:place", annotations.placeLabel),
        kind: "place",
        value: { label: annotations.placeLabel },
        status: "confirmed",
        provenance: { kind: "user", field: "placeLabel" },
        evidence: null,
        analyzedAt: null,
        review: { by: "user", at: null },
        dependsOnFactIds: []
      });
    }
    annotations.personIds.forEach(memberId => {
      facts.push({
        id: stableFactId("legacy:annotation:person", memberId),
        kind: "person",
        value: { memberId, label: null },
        status: "confirmed",
        provenance: { kind: "user", field: "personIds" },
        evidence: null,
        analyzedAt: null,
        review: { by: "user", at: null },
        dependsOnFactIds: []
      });
    });
    annotations.eventTags.forEach(label => {
      facts.push({
        id: stableFactId("legacy:annotation:event", label),
        kind: "event",
        value: { eventId: null, label },
        status: "confirmed",
        provenance: { kind: "user", field: "eventTags" },
        evidence: null,
        analyzedAt: null,
        review: { by: "user", at: null },
        dependsOnFactIds: []
      });
    });
  }

  const indexRecord = document.indexRecord;
  const providerId = typeof indexRecord?.sourceId === "string" ? indexRecord.sourceId : getInventorySource(document);
  const itemId = typeof indexRecord?.itemId === "string" ? indexRecord.itemId : documentId;
  const accountRef = document.dropboxAccountFingerprint ?? document.oneDriveAccountFingerprint ?? null;
  const path = providerId === "local" ? null
    : indexRecord?.location?.value ?? document.sourceDir ?? null;
  const lastCheckedAt = indexRecord?.lastCheck ?? null;
  const sourceCopies = providerId === "demo" ? [] : [
    normalizeSourceCopy({ providerId, accountRef, itemId, path, lastCheckedAt })
  ];

  const factSet = createPhotoFactSet(documentId, {
    contentHash: document.photoMetadata?.contentHash ?? null,
    sourceCopies,
    dates: {
      fileCreatedAt: document.creationDate ?? null,
      fileModifiedAt: document.modificationDate ?? null,
      importedAt: document.importedAt ?? null,
      analyzedAt: null,
      lastSourceCheckAt: lastCheckedAt
    },
    facts
  });
  return factSet;
}

function factValueKey(fact) {
  if (fact.kind === "captureDate") {
    return JSON.stringify([fact.value.localDateTime, fact.value.offsetMinutes]);
  }
  if (fact.kind === "location") {
    return JSON.stringify([fact.value.latitude, fact.value.longitude, fact.value.altitudeMeters]);
  }
  if (fact.kind === "place") {
    return fact.value.label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
  }
  return JSON.stringify(fact.value);
}

export function findPhotoFactConflicts(value) {
  const factSet = normalizePhotoFactSet(value);
  const conflicts = [];
  for (const kind of SINGLE_VALUE_KINDS) {
    const candidates = factSet.facts
      .filter(fact => fact.kind === kind && fact.status !== "rejected")
      .sort((first, second) => first.id.localeCompare(second.id));
    if (new Set(candidates.map(factValueKey)).size < 2) continue;
    conflicts.push({ kind, factIds: candidates.map(fact => fact.id) });
  }
  return conflicts.sort((first, second) => first.kind.localeCompare(second.kind));
}

export function resolvePhotoFact(value, kind) {
  const factSet = normalizePhotoFactSet(value);
  if (!SINGLE_VALUE_KINDS.has(kind)) {
    throw new TypeError("Only single-value photo facts can be resolved.");
  }
  const candidates = factSet.facts
    .filter(fact => fact.kind === kind && fact.status !== "rejected")
    .sort((first, second) => first.id.localeCompare(second.id));
  const confirmed = candidates.filter(fact => fact.status === "confirmed");
  const distinctConfirmed = new Set(confirmed.map(factValueKey));
  const distinctCandidates = new Set(candidates.map(factValueKey));
  let selected = null;
  if (distinctConfirmed.size === 1) {
    selected = confirmed[0];
  } else if (distinctConfirmed.size === 0 && distinctCandidates.size === 1) {
    selected = candidates.find(fact => fact.status === "extracted") ?? candidates[0] ?? null;
  }
  const conflict = findPhotoFactConflicts(factSet).find(item => item.kind === kind);
  return {
    selected,
    conflictingFactIds: conflict?.factIds ?? []
  };
}

export function mergePhotoFactSets(existingValue, incomingValue) {
  const existing = normalizePhotoFactSet(existingValue);
  const incoming = normalizePhotoFactSet(incomingValue);
  if (existing.documentId !== incoming.documentId) {
    throw new TypeError("Cannot merge photo facts linked to different documents.");
  }

  const factsById = new Map(existing.facts.map(fact => [fact.id, fact]));
  for (const fact of incoming.facts) {
    const previous = factsById.get(fact.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(fact)) {
      throw new TypeError(`Cannot replace existing photo fact ${fact.id}; use a new fact ID.`);
    }
    if (!previous) factsById.set(fact.id, fact);
  }

  const copiesByIdentity = new Map(existing.sourceCopies.map(copy => [
    JSON.stringify([copy.providerId, copy.accountRef, copy.itemId]), copy
  ]));
  for (const copy of incoming.sourceCopies) {
    const identity = JSON.stringify([copy.providerId, copy.accountRef, copy.itemId]);
    const previous = copiesByIdentity.get(identity);
    const incomingIsNewer = !previous?.lastCheckedAt
      || (copy.lastCheckedAt != null && Date.parse(copy.lastCheckedAt) > Date.parse(previous.lastCheckedAt));
    copiesByIdentity.set(identity, {
      ...previous,
      ...copy,
      path: (incomingIsNewer ? copy.path : previous?.path) ?? copy.path ?? previous?.path ?? null,
      lastCheckedAt: incomingIsNewer
        ? copy.lastCheckedAt ?? previous?.lastCheckedAt ?? null
        : previous?.lastCheckedAt ?? copy.lastCheckedAt ?? null
    });
  }

  const dates = { ...existing.dates };
  for (const [field, value] of Object.entries(incoming.dates)) {
    if (value == null) continue;
    if (field === "importedAt" && dates[field] != null) continue;
    dates[field] = value;
  }
  return createPhotoFactSet(existing.documentId, {
    contentHash: incoming.contentHash ?? existing.contentHash,
    sourceCopies: [...copiesByIdentity.values()],
    dates,
    facts: [...factsById.values()]
  });
}

export function removePhotoFactsAndDependents(value, factIds) {
  const factSet = normalizePhotoFactSet(value);
  if (!Array.isArray(factIds)) throw new TypeError("Photo fact IDs to remove must be a list.");
  const removals = new Set();
  for (const factId of factIds) {
    if (!factSet.facts.some(fact => fact.id === factId)) {
      throw new TypeError(`Photo fact ${factId} does not exist.`);
    }
    removals.add(factId);
    for (const dependentId of getDependentPhotoFactIds(factSet, factId)) removals.add(dependentId);
  }
  return createPhotoFactSet(factSet.documentId, {
    contentHash: factSet.contentHash,
    sourceCopies: factSet.sourceCopies,
    dates: factSet.dates,
    facts: factSet.facts.filter(fact => !removals.has(fact.id))
  });
}

export function reconcilePhotoFactSet(existingValue, document, { includeLocation = false } = {}) {
  if (typeof includeLocation !== "boolean") throw new TypeError("includeLocation must be a boolean.");
  const incoming = photoFactSetFromDocument(document, { includeLocation });
  if (existingValue == null) return incoming;
  const existing = normalizePhotoFactSet(existingValue);
  if (existing.documentId !== incoming.documentId) {
    throw new TypeError("Cannot reconcile photo facts linked to different documents.");
  }

  const annotationFields = new Set(["captureDateOverride", "placeLabel", "personIds", "eventTags"]);
  let base = createPhotoFactSet(existing.documentId, {
    contentHash: existing.contentHash,
    sourceCopies: existing.sourceCopies,
    dates: existing.dates,
    facts: existing.facts.filter(fact =>
      !(fact.provenance.kind === "user" && annotationFields.has(fact.provenance.field)))
  });
  if (!includeLocation) {
    const locationIds = base.facts.filter(fact => fact.kind === "location").map(fact => fact.id);
    if (locationIds.length) base = removePhotoFactsAndDependents(base, locationIds);
  }
  return mergePhotoFactSets(base, incoming);
}

export function formatPhotoCoordinatePair(value) {
  const location = normalizeFactValue("location", {
    latitude: value?.latitude,
    longitude: value?.longitude,
    altitudeMeters: null,
    accuracyMeters: null
  });
  return `${location.latitude}, ${location.longitude}`;
}

export function normalizePhotoCoordinatePair(value) {
  if (typeof value !== "string") throw new TypeError("Coordinates must be a string.");
  const match = /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*[,;]\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/.exec(value);
  if (!match) throw new TypeError("Coordinates must be an explicit latitude/longitude pair.");
  return formatPhotoCoordinatePair({ latitude: Number(match[1]), longitude: Number(match[2]) });
}

export function redactPhotoFactLocationsForExport(value) {
  if (!isObject(value)) throw new TypeError("Export data must be an object.");
  const exported = JSON.parse(JSON.stringify(value));
  if (!Array.isArray(exported.documents)) return exported;
  exported.documents = exported.documents.map(document => {
    if (!document || typeof document !== "object") return document;
    let redactedDocument = document;
    if (document.photoFacts != null) {
      const factSet = normalizePhotoFactSet(document.photoFacts);
      const locationIds = factSet.facts.filter(fact => fact.kind === "location").map(fact => fact.id);
      redactedDocument = {
        ...redactedDocument,
        photoFacts: locationIds.length
          ? removePhotoFactsAndDependents(factSet, locationIds)
          : factSet
      };
    }
    if (Array.isArray(document.indexRecord?.fields)) {
      redactedDocument = {
        ...redactedDocument,
        indexRecord: {
          ...document.indexRecord,
          fields: document.indexRecord.fields.filter(field => field.name !== "coordinates")
        }
      };
    }
    return redactedDocument;
  });
  return exported;
}

export function findExactPhotoFactDuplicates(values) {
  if (!Array.isArray(values)) throw new TypeError("Photo fact sets must be a list.");
  const factSets = values.map(normalizePhotoFactSet);
  const documentIds = new Set();
  const groups = new Map();
  for (const factSet of factSets) {
    if (documentIds.has(factSet.documentId)) throw new TypeError("Photo fact set document IDs must be unique.");
    documentIds.add(factSet.documentId);
    if (!factSet.contentHash) continue;
    if (!groups.has(factSet.contentHash)) groups.set(factSet.contentHash, []);
    groups.get(factSet.contentHash).push(factSet.documentId);
  }
  const duplicates = [];
  for (const [contentHash, ids] of groups) {
    ids.sort();
    for (let first = 0; first < ids.length; first += 1) {
      for (let second = first + 1; second < ids.length; second += 1) {
        duplicates.push({ firstDocumentId: ids[first], secondDocumentId: ids[second], contentHash });
      }
    }
  }
  return duplicates.sort((first, second) =>
    `${first.firstDocumentId}\u0000${first.secondDocumentId}`
      .localeCompare(`${second.firstDocumentId}\u0000${second.secondDocumentId}`));
}

export function getDependentPhotoFactIds(value, factId) {
  const factSet = normalizePhotoFactSet(value);
  const ids = new Set(factSet.facts.map(fact => fact.id));
  if (!ids.has(factId)) throw new TypeError("Source photo fact does not exist.");
  const dependents = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const fact of factSet.facts) {
      if (!dependents.has(fact.id) && fact.dependsOnFactIds.some(id => id === factId || dependents.has(id))) {
        dependents.add(fact.id);
        changed = true;
      }
    }
  }
  return [...dependents].sort();
}
