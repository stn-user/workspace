import { createIndexRecord, isValidIndexRecord } from "./index-record.js";

function validateRecords(records, label) {
  if (!Array.isArray(records)) throw new TypeError(`${label} doit être un tableau`);
  const byIdentity = new Map();
  for (const record of records) {
    if (!isValidIndexRecord(record)) throw new TypeError(`${label} contient une fiche invalide`);
    const identity = JSON.stringify([record.sourceId, record.accountRef, record.itemId]);
    if (byIdentity.has(identity)) throw new TypeError(`${label} contient des identités dupliquées`);
    byIdentity.set(identity, record);
  }
  return byIdentity;
}

function copyRecord(record, name = record.name) {
  return createIndexRecord(record.sourceId, record.itemId, {
    accountRef: record.accountRef,
    type: record.type, name, location: record.location, dates: record.dates, coverage: record.coverage,
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
    const identity = JSON.stringify([record.sourceId, record.accountRef, record.itemId]);
    const incoming = discoveredBySource.get(identity);
    const name = incoming && (record.name === null || record.name.source === "provider")
      ? incoming.name : record.name;
    return { record: copyRecord(record, name), verificationState: verificationState(record) };
  });

  for (const record of discovered) {
    const identity = JSON.stringify([record.sourceId, record.accountRef, record.itemId]);
    if (!existingBySource.has(identity)) {
      results.push({ record: copyRecord(record), verificationState: "not-analyzed" });
    }
  }
  return results;
}

export function removeIndexRecord(records, sourceId, itemId, accountRef) {
  validateRecords(records, "records");
  if (typeof sourceId !== "string" || !sourceId.trim() ||
      typeof itemId !== "string" || !itemId.trim() ||
      (accountRef !== undefined && accountRef !== null &&
        (typeof accountRef !== "string" || !/^[0-9a-f]{64}$/i.test(accountRef)))) {
    throw new TypeError("sourceId et itemId doivent être des chaînes non vides");
  }
  const requestedAccountRef = accountRef === undefined ? undefined
    : accountRef === null ? null : accountRef.toLowerCase();
  const matches = records.flatMap((record, index) =>
    record.sourceId === sourceId && record.itemId === itemId &&
      (requestedAccountRef === undefined || record.accountRef === requestedAccountRef)
      ? [index] : []);
  if (matches.length > 1) throw new Error("Identité ambiguë : accountRef requis");
  const index = matches[0] ?? -1;
  if (index === -1) throw new Error("Fiche non trouvée");
  return { records: records.filter((_, position) => position !== index).map((record) => copyRecord(record)), removed: true };
}
