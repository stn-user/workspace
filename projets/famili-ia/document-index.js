import { getInventorySource } from "./data-inventory.js";
import { restoreContentSegments } from "./content-index.js";
import { createIndexRecord, isValidDate, isValidIndexRecord } from "./index-record.js";
import { isPhotoDocument } from "./photo-annotations.js";
import { normalizeAlertDate } from "./alert-engine.js";
import { parseDocument } from "./document-parser.js";

const PHOTO_DATE_SOURCES = Object.freeze({
  exif: "provider",
  user: "user-input",
  filename: "auto-estimate",
  legacy: "auto-estimate"
});

function photoCaptureDate(document) {
  const override = document.photoAnnotations?.captureDateOverride;
  if (override?.localDateTime) {
    return {
      value: override.localDateTime.slice(0, 10),
      source: "user-input",
      estimated: false,
      proof: null
    };
  }

  const captureDate = document.photoMetadata?.captureDate;
  if (!captureDate?.localDateTime || !captureDate.source?.kind) return null;
  const source = PHOTO_DATE_SOURCES[captureDate.source.kind];
  if (!source) return null;
  return {
    value: captureDate.localDateTime.slice(0, 10),
    source,
    estimated: source === "auto-estimate",
    proof: captureDate.raw ? { excerpt: captureDate.raw, location: null } : null
  };
}

function photoAnnotationFields(document) {
  const annotations = document.photoAnnotations;
  if (!annotations) return [];
  const fields = [];
  if (annotations.personIds?.length) {
    fields.push({
      name: "personIds",
      value: annotations.personIds.join(", "),
      source: "user-input"
    });
  }
  for (const eventTag of annotations.eventTags ?? []) {
    fields.push({ name: "eventTag", value: eventTag, source: "user-input" });
  }
  if (annotations.placeLabel) {
    fields.push({ name: "place", value: annotations.placeLabel, source: "user-input" });
  }
  return fields;
}

function extractedDocumentFields(context) {
  const fields = [];
  if (context.type && context.type !== "autre" && context.typeEvidence) {
    fields.push({
      name: "classification",
      value: context.type,
      source: "auto-estimate",
      estimated: true,
      proof: context.typeEvidence
    });
  }
  if (context.category && context.category !== "autre" && context.typeEvidence) {
    fields.push({
      name: "category",
      value: context.category,
      source: "auto-estimate",
      estimated: true,
      proof: context.typeEvidence
    });
  }
  if (context.provider && context.providerEvidence) {
    fields.push({
      name: "provider",
      value: context.provider,
      source: "extracted",
      proof: context.providerEvidence
    });
  }
  if (Number.isFinite(context.amount) && context.amountEvidence) {
    fields.push({
      name: "amount",
      value: `${context.amount.toFixed(2)} EUR`,
      source: "extracted",
      proof: context.amountEvidence
    });
  }
  if (context.equipment) {
    fields.push({
      name: "equipment",
      value: context.equipment.value,
      source: "extracted",
      proof: context.equipment.proof
    });
  }
  return fields;
}

export function preserveUserValues(record, previous) {
  if (!previous) return record;
  if (!isValidIndexRecord(previous) ||
      previous.sourceId !== record.sourceId || previous.itemId !== record.itemId) {
    throw new TypeError("La fiche d'index existante est invalide ou liée à une autre identité");
  }

  const dates = { ...record.dates };
  for (const [name, value] of Object.entries(previous.dates)) {
    if (value.source === "user-input" && !(name === "priseDeVue" && record.dates.priseDeVue?.source === "user-input")) {
      dates[name] = value;
    }
  }
  const managedAnnotationFields = new Set(["personIds", "eventTag", "place"]);
  const fields = record.fields.map(field => ({ ...field }));
  for (const field of previous.fields) {
    if (field.source !== "user-input" || managedAnnotationFields.has(field.name)) continue;
    const index = fields.findIndex(current => current.name === field.name);
    if (index < 0) fields.push(field);
    else fields[index] = field;
  }
  const name = previous.name?.source === "user-input" ? previous.name : record.name;
  const location = previous.location?.source === "user-input" ? previous.location : record.location;
  return createIndexRecord(record.sourceId, record.itemId, {
    type: record.type,
    name,
    location,
    dates,
    coverage: record.coverage,
    lastCheck: record.lastCheck,
    fields
  });
}

export async function createDocumentIndexRecord(document, { previous = document?.indexRecord } = {}) {
  if (!document || typeof document !== "object" || Array.isArray(document) ||
      typeof document.id !== "string" || !document.id.trim()) {
    throw new TypeError("Document sans identité persistante");
  }

  const sourceId = getInventorySource(document);
  const photo = isPhotoDocument(document);
  const name = document.name || document.originalName;
  const dates = {};
  const providerModificationDate = typeof document.modificationDate === "string" &&
    isValidDate(document.modificationDate) ? document.modificationDate : null;
  if (providerModificationDate) {
    dates.modification = { value: providerModificationDate, source: "provider" };
  }
  let fields = photo ? photoAnnotationFields(document) : [];
  const capturedAt = photo ? photoCaptureDate(document) : null;
  if (capturedAt) dates.priseDeVue = capturedAt;

  const content = await restoreContentSegments(document);
  if (!photo && content.status === "verified" && content.segments.length) {
    const extractedText = content.segments.join("\n");
    const parsed = parseDocument(extractedText, name || "");
    fields = extractedDocumentFields(parsed);
    for (const [type, fact] of Object.entries(parsed.dateFacts)) {
      if (type === "modification" && providerModificationDate) continue;
      dates[type] = {
        value: fact.value,
        source: "extracted",
        estimated: false,
        proof: fact.proof
      };
    }
    const expiryEvidence = parsed.expiryDateEvidence ||
      (typeof document.expiryDateEvidence === "string" &&
        extractedText.split(/\r?\n/).some(line => line.trim() === document.expiryDateEvidence.trim())
        ? document.expiryDateEvidence.trim()
        : null);
    const expiry = normalizeAlertDate(parsed.expiryDate || document.expiryDate);
    if (expiry && expiryEvidence) {
      const lineIndex = extractedText.split(/\r?\n/).findIndex(line => line.trim() === expiryEvidence);
      dates.echeance = {
        value: expiry,
        source: "extracted",
        estimated: false,
        proof: {
          excerpt: expiryEvidence,
          location: lineIndex < 0 ? null : `ligne ${lineIndex + 1}`
        }
      };
    }
  }
  const record = createIndexRecord(sourceId, document.id, {
    type: photo ? "photo" : "document",
    name: typeof name === "string" && name.trim()
      ? { value: name.trim(), source: "provider", estimated: false }
      : null,
    location: typeof document.sourceDir === "string" && document.sourceDir.trim() &&
      !["Saisie manuelle", "Background Sync"].includes(document.sourceDir.trim())
      ? { value: document.sourceDir.trim(), source: "provider", estimated: false }
      : null,
    dates,
    coverage: content.status === "verified" && content.segments.length ? "partial" : "metadata",
    fields
  });
  return preserveUserValues(record, previous);
}
