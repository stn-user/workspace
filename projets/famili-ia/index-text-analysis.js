import { createIndexRecord, isValidIndexRecord } from "./index-record.js";
import { normalizeAlertDate } from "./alert-engine.js";

const label = /\b(?:fin de (?:la )?garantie|date d['’]expiration|expiration|date d['’]echeance|echeance|renouvellement|expire le|a regler avant|a payer avant|prochain entretien|entretien avant|controle avant|a effectuer avant)\b/;
const exactLine = /(?:^|.*\b)(?:fin de (?:la )?garantie|date d['’]expiration|expiration|date d['’]echeance|echeance)\s*(?::|au|le)\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*[.!]?\s*$/;
const deadlineLabels = /\b(?:fin de (?:la )?garantie|date d['’]expiration|expiration|date d['’]echeance|echeance)\b/g;
const negatedDeadline = /\b(?:pas d['’]?(?:echeance|expiration)|pas de fin de (?:la )?garantie|aucun[e]?\s+(?:echeance|expiration|fin de (?:la )?garantie))\b/;

function copyRecord(record, dates = record.dates) {
  return createIndexRecord(record.sourceId, record.itemId, {
    type: record.type, name: record.name, dates,
    coverage: record.coverage, lastCheck: record.lastCheck, fields: record.fields
  });
}

function addWarrantyDuration(purchaseDate, quantity, unit) {
  const [year, month, day] = purchaseDate.split("-").map(Number);
  const monthsToAdd = /^(?:an|ans|annee|annees)$/.test(unit) ? quantity * 12 : quantity;
  const monthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(monthIndex / 12);
  if (targetYear > 9999) return null;
  const targetMonth = monthIndex % 12 + 1;
  const leapYear = targetYear % 4 === 0 && (targetYear % 100 !== 0 || targetYear % 400 === 0);
  const daysInMonth = [
    31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
  ][targetMonth - 1];
  const targetDay = Math.min(day, daysInMonth);
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function estimateWarrantyEnd(record, text) {
  const lines = text.split(/\r\n|\n|\r/);
  const normalizedLines = lines.map(line => line.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr"));
  const purchaseLabel = /\b(?:date d['’]?achat|date achat|achete le|achetee le|acquis le)\b/g;
  const purchaseDatePattern = /(?:^|.*\b)(?:date d['’]?achat|date achat|achete le|achetee le|acquis le)[^\d\n]{0,40}?(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[a-z]+\s+\d{4})(?!\d)/i;
  const durationLabel = /\bduree de (?:la )?garantie\b/g;
  const purchaseEntries = lines.flatMap((line, index) => {
    const normalized = normalizedLines[index];
    return [...normalized.matchAll(purchaseLabel)].map(() => ({ line, normalized }));
  });
  const durationEntries = lines.flatMap((line, index) => {
    const normalized = normalizedLines[index];
    return [...normalized.matchAll(durationLabel)].map(() => ({ line, normalized }));
  });
  if (!durationEntries.length) return null;
  if (durationEntries.length !== 1) {
    return { status: "estimate-ineligible", reason: "Durée de garantie ambiguë : vérification nécessaire." };
  }
  if (purchaseEntries.length !== 1) {
    return { status: "estimate-ineligible", reason: "Date d'achat absente ou ambiguë : vérification nécessaire." };
  }

  const { line: purchaseLine, normalized: normalizedPurchaseLine } = purchaseEntries[0];
  const purchaseMatch = normalizedPurchaseLine.match(purchaseDatePattern);
  const purchaseDate = purchaseMatch ? normalizeAlertDate(purchaseMatch[1]) : null;
  if (!purchaseDate) {
    return { status: "estimate-ineligible", reason: "Calcul impossible : date d'achat explicite et prouvée introuvable." };
  }

  const { line: durationLine, normalized } = durationEntries[0];
  const match = normalized.match(/(?:^|.*\b)duree de (?:la )?garantie\s*(?::|=|de)?\s*(\d{1,2})\s*(ans?|annees?|mois)\s*[.,;!]?\s*$/);
  const quantity = match ? Number(match[1]) : 0;
  if (!match || quantity < 1 || quantity > 50) {
    return { status: "estimate-ineligible", reason: "Durée de garantie non prise en charge : vérification nécessaire." };
  }

  const evidence = [...new Set([purchaseLine.trim(), durationLine.trim()])];
  const estimatedDate = addWarrantyDuration(purchaseDate, quantity, match[2]);
  if (!estimatedDate) {
    return { status: "estimate-ineligible", reason: "Date calculée hors plage prise en charge : vérification nécessaire." };
  }
  return {
    status: "estimated",
    record: copyRecord(record, {
      ...record.dates,
      echeance: {
        value: estimatedDate,
        source: "auto-estimate",
        estimated: true,
        proof: { excerpt: evidence.join("\n"), location: null }
      }
    })
  };
}

export function extractDeadlineFromText(record, text) {
  if (!isValidIndexRecord(record)) throw new TypeError("Fiche d'index invalide");
  if (typeof text !== "string" || !text.trim()) throw new TypeError("Texte vide ou invalide");
  if (record.dates.echeance) return { record: copyRecord(record), status: "kept" };

  const lines = text.split(/\r\n|\n|\r/);
  const marked = lines.filter((line) => label.test(
    line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
  ));
  if (!marked.length) {
    const estimate = estimateWarrantyEnd(record, text);
    return estimate || { record: copyRecord(record), status: "not-found" };
  }
  if (marked.length !== 1) return { record: copyRecord(record), status: "ambiguous" };

  const line = marked[0];
  const normalized = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  if ([...normalized.matchAll(deadlineLabels)].length !== 1 || negatedDeadline.test(normalized)) {
    return { record: copyRecord(record), status: "ambiguous" };
  }
  const match = normalized.match(exactLine);
  if (!match) return { record: copyRecord(record), status: "ambiguous" };
  const date = normalizeAlertDate(match[1]);
  if (!date) return { record: copyRecord(record), status: "invalid-date" };

  const dates = {
    ...record.dates,
    echeance: { value: date, source: "extracted", estimated: false, proof: { excerpt: line, location: null } }
  };
  return { record: copyRecord(record, dates), status: "extracted" };
}
