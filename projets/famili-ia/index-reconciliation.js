import { createIndexRecord, isValidIndexRecord } from "./index-record.js";

function validateRecords(records, label) {
  if (!Array.isArray(records)) throw new TypeError(`${label} doit être un tableau`);
  const bySource = new Map();
  for (const record of records) {
    if (!isValidIndexRecord(record)) throw new TypeError(`${label} contient une fiche invalide`);
    let items = bySource.get(record.sourceId);
    if (!items) {
      items = new Map();
      bySource.set(record.sourceId, items);
    }
    if (items.has(record.itemId)) throw new TypeError(`${label} contient des identités dupliquées`);
    items.set(record.itemId, record);
  }
  return bySource;
}

function copyRecord(record, name = record.name) {
  return createIndexRecord(record.sourceId, record.itemId, {
    type: record.type, name, dates: record.dates, coverage: record.coverage,
    lastCheck: record.lastCheck, fields: record.fields
  });
}

function validateDiscovery(record) {
  if (record.type !== null || record.coverage !== "metadata" || record.lastCheck !== null ||
      !record.name || record.name.source !== "provider" ||
      record.name.estimated !== false || record.name.proof !== null ||
      Object.keys(record.dates).length !== 0 || record.fields.length !== 0) {
    throw new TypeError("Fiche découverte hors du périmètre de l'adaptateur fictif");
  }
}

function verificationState(record) {
  if (record.coverage === "partial" || record.coverage === "analyzed") return "needs-review";
  if (record.coverage === null) return "unknown";
  return "not-analyzed";
}

export function reconcileIndex(existing, discovered) {
  const existingBySource = validateRecords(existing, "existing");
  const discoveredBySource = validateRecords(discovered, "discovered");
  for (const record of discovered) validateDiscovery(record);

  const results = existing.map((record) => {
    const source = discoveredBySource.get(record.sourceId);
    const incoming = source && source.get(record.itemId);
    const name = incoming && (record.name === null || record.name.source === "provider")
      ? incoming.name : record.name;
    return { record: copyRecord(record, name), verificationState: verificationState(record) };
  });

  for (const record of discovered) {
    const source = existingBySource.get(record.sourceId);
    if (!source || !source.has(record.itemId)) {
      results.push({ record: copyRecord(record), verificationState: "not-analyzed" });
    }
  }
  return results;
}

export function removeIndexRecord(records, sourceId, itemId) {
  validateRecords(records, "records");
  if (typeof sourceId !== "string" || !sourceId.trim() ||
      typeof itemId !== "string" || !itemId.trim()) {
    throw new TypeError("sourceId et itemId doivent être des chaînes non vides");
  }
  const index = records.findIndex((record) => record.sourceId === sourceId && record.itemId === itemId);
  if (index === -1) throw new Error("Fiche non trouvée");
  return { records: records.filter((_, position) => position !== index).map((record) => copyRecord(record)), removed: true };
}
