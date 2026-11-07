import { isValidIndexRecord } from "./index-record.js";
import { isValidCoverageLevel } from "./index-coverage.js";
import { normalizeText } from "./search-utils.js";

const VALID_TYPES = Object.freeze(["document", "photo"]);

function validateRecords(records) {
  if (!Array.isArray(records)) throw new TypeError("records doit être un tableau");
  const identities = new Map();
  for (const record of records) {
    if (!isValidIndexRecord(record)) throw new TypeError("Fiche d'index invalide");
    let items = identities.get(record.sourceId);
    if (!items) {
      items = new Set();
      identities.set(record.sourceId, items);
    }
    if (items.has(record.itemId)) throw new TypeError("Identités dupliquées");
    items.add(record.itemId);
  }
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) {
    throw new TypeError("Options invalides");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (!["sourceId", "type", "coverage"].includes(key)) throw new TypeError("Option inconnue");
    const value = options[key];
    if (key === "sourceId" && (typeof value !== "string" || !value.trim())) {
      throw new TypeError("sourceId du filtre invalide");
    }
    if (key === "type" && !VALID_TYPES.includes(value)) throw new TypeError("Type du filtre invalide");
    if (key === "coverage" && !isValidCoverageLevel(value)) throw new TypeError("Couverture du filtre invalide");
  }
}

export function searchIndex(records, query, options = {}) {
  validateRecords(records);
  validateOptions(options);
  if (typeof query !== "string") throw new TypeError("Requête invalide");
  const normalized = normalizeText(query);
  if (!normalized) throw new TypeError("Requête vide après normalisation");
  const words = [...new Set(normalized.split(" "))];
  const results = [];

  for (const record of records) {
    if (options.sourceId !== undefined && record.sourceId !== options.sourceId) continue;
    if (options.type !== undefined && record.type !== options.type) continue;
    if (options.coverage !== undefined && record.coverage !== options.coverage) continue;

    const values = [];
    if (record.name) values.push({ location: "name", entry: record.name });
    for (const [key, entry] of Object.entries(record.dates)) {
      values.push({ location: `date.${key}`, entry });
    }
    for (const field of record.fields) {
      values.push({ location: `field.${field.name}`, entry: field });
    }
    const matched = new Set();
    const reasons = [];
    for (const { location, entry } of values) {
      const text = normalizeText(entry.value);
      const matchedWords = words.filter((word) => text.includes(word));
      if (!matchedWords.length) continue;
      for (const word of matchedWords) matched.add(word);
      reasons.push({
        location, value: entry.value, source: entry.source,
        estimated: entry.estimated,
        proof: entry.proof ? { ...entry.proof } : null,
        matchedWords
      });
    }
    if (matched.size !== words.length) continue;
    results.push({
      sourceId: record.sourceId, itemId: record.itemId,
      name: record.name ? record.name.value : null,
      type: record.type, coverage: record.coverage, reasons
    });
  }
  return results;
}

export { isValidCoverageLevel, VALID_TYPES };
