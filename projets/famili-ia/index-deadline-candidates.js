import { createIndexRecord, isValidDate, isValidIndexRecord } from "./index-record.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidCalendarDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidDate(value);
}

export function findDeadlineCandidates(records, referenceDate, daysToExamine) {
  if (!Array.isArray(records)) throw new TypeError("records doit être un tableau");
  if (!isValidCalendarDate(referenceDate)) throw new TypeError("date de référence invalide");
  if (!Number.isSafeInteger(daysToExamine) || daysToExamine < 0) {
    throw new TypeError("nombre de jours invalide (doit être un entier non négatif sûr)");
  }
  const identities = new Map();
  for (const record of records) {
    if (!isValidIndexRecord(record)) throw new TypeError("fiche d'index invalide");
    let items = identities.get(record.sourceId);
    if (!items) {
      items = new Set();
      identities.set(record.sourceId, items);
    }
    if (items.has(record.itemId)) throw new TypeError("identités dupliquées");
    items.add(record.itemId);
  }

  const start = Date.parse(`${referenceDate}T00:00:00.000Z`);
  const candidates = [];
  const ineligible = [];
  for (const record of records) {
    if (!record.dates.echeance) continue;
    const normalized = createIndexRecord(record.sourceId, record.itemId, {
      type: record.type, name: record.name, dates: record.dates,
      coverage: record.coverage, lastCheck: record.lastCheck, fields: record.fields
    });
    const deadline = normalized.dates.echeance;
    const reasons = [];
    if (!isValidCalendarDate(deadline.value)) reasons.push("date-heure non prise en charge");
    if (deadline.estimated) reasons.push("échéance estimée");
    if (!deadline.proof) reasons.push("preuve absente");
    if (reasons.length) {
      ineligible.push({ sourceId: record.sourceId, itemId: record.itemId, reasons });
      continue;
    }
    const daysUntil = (Date.parse(`${deadline.value}T00:00:00.000Z`) - start) / DAY_MS;
    if (daysUntil >= 0 && daysUntil <= daysToExamine) {
      candidates.push({
        sourceId: record.sourceId, itemId: record.itemId,
        name: normalized.name ? normalized.name.value : null,
        dueDate: deadline.value, source: deadline.source,
        proof: { ...deadline.proof }, daysUntil
      });
    }
  }
  return { candidates, ineligible };
}
