import { createIndexRecord, isValidIndexRecord } from "./index-record.js";
import { normalizeAlertDate } from "./alert-engine.js";

const label = /\b(?:fin de garantie|date d['’]expiration|expiration|date d['’]echeance|echeance|renouvellement|expire le|a regler avant|a payer avant|prochain entretien|entretien avant|controle avant|a effectuer avant)\b/;
const exactLine = /^\s*(?:fin de garantie|date d['’]expiration|expiration|date d['’]echeance|echeance)\s*:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*$/;

function copyRecord(record, dates = record.dates) {
  return createIndexRecord(record.sourceId, record.itemId, {
    type: record.type, name: record.name, dates,
    coverage: record.coverage, lastCheck: record.lastCheck, fields: record.fields
  });
}

export function extractDeadlineFromText(record, text) {
  if (!isValidIndexRecord(record)) throw new TypeError("Fiche d'index invalide");
  if (typeof text !== "string" || !text.trim()) throw new TypeError("Texte vide ou invalide");
  if (record.dates.echeance) return { record: copyRecord(record), status: "kept" };

  const lines = text.split(/\r\n|\n|\r/);
  const marked = lines.filter((line) => label.test(
    line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
  ));
  if (!marked.length) return { record: copyRecord(record), status: "not-found" };
  if (marked.length !== 1) return { record: copyRecord(record), status: "ambiguous" };

  const line = marked[0];
  const normalized = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const match = normalized.match(exactLine);
  if (!match) return { record: copyRecord(record), status: "ambiguous" };
  const date = normalizeAlertDate(match[1]);
  if (!date) return { record: copyRecord(record), status: "not-found" };

  const dates = {
    ...record.dates,
    echeance: { value: date, source: "extracted", estimated: false, proof: { excerpt: line, location: null } }
  };
  return { record: copyRecord(record, dates), status: "extracted" };
}
