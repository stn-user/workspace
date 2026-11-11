import { isValidDate, isValidIndexRecord } from "./index-record.js";
import { isValidCoverageLevel } from "./index-coverage.js";
import { normalizeText } from "./search-utils.js";

const VALID_TYPES = Object.freeze(["document", "photo"]);
const VALID_DATE_TYPES = Object.freeze(["creation", "modification", "priseDeVue", "achat", "echeance"]);

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
    if (!["sourceId", "type", "coverage", "dateType", "dateFrom", "dateTo", "personId", "place", "eventTag"].includes(key)) {
      throw new TypeError("Option inconnue");
    }
    const value = options[key];
    if (key === "sourceId" && (typeof value !== "string" || !value.trim())) {
      throw new TypeError("sourceId du filtre invalide");
    }
    if (key === "type" && !VALID_TYPES.includes(value)) throw new TypeError("Type du filtre invalide");
    if (key === "coverage" && !isValidCoverageLevel(value)) throw new TypeError("Couverture du filtre invalide");
    if (key === "dateType" && !VALID_DATE_TYPES.includes(value)) throw new TypeError("Nature de date invalide");
    if (["dateFrom", "dateTo"].includes(key) && !isValidDate(value)) throw new TypeError("Filtre de date invalide");
    if (["personId", "place", "eventTag"].includes(key) && (typeof value !== "string" || !value.trim())) {
      throw new TypeError(`Filtre ${key} invalide`);
    }
  }
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) {
    throw new TypeError("La période de dates est inversée");
  }
}

export function matchesIndexFilters(record, options = {}) {
  validateOptions(options);
  if (options.sourceId !== undefined && record.sourceId !== options.sourceId) return false;
  if (options.type !== undefined && record.type !== options.type) return false;
  if (options.coverage !== undefined && record.coverage !== options.coverage) return false;

  if (options.dateType !== undefined || options.dateFrom !== undefined || options.dateTo !== undefined) {
    const dates = Object.entries(record.dates).filter(([type]) =>
      options.dateType === undefined || type === options.dateType
    );
    if (!dates.some(([, entry]) => {
      const date = entry.value.slice(0, 10);
      return (!options.dateFrom || date >= options.dateFrom) &&
        (!options.dateTo || date <= options.dateTo);
    })) return false;
  }

  if (options.personId !== undefined) {
    const personFields = record.fields.filter(field => field.name === "personIds");
    if (!personFields.some(field => field.value.split(",").map(value => value.trim()).includes(options.personId))) {
      return false;
    }
  }
  if (options.place !== undefined) {
    const normalizedPlace = normalizeText(options.place);
    if (!record.fields.some(field => field.name === "place" &&
        normalizeText(field.value) === normalizedPlace)) return false;
  }
  if (options.eventTag !== undefined) {
    const normalizedTag = normalizeText(options.eventTag);
    if (!record.fields.some(field => field.name === "eventTag" &&
        normalizeText(field.value) === normalizedTag)) return false;
  }
  return true;
}

export function searchIndex(records, query, options = {}) {
  validateRecords(records);
  validateOptions(options);
  if (typeof query !== "string") throw new TypeError("Requête invalide");
  const normalized = normalizeText(query);
  if (!normalized && Object.keys(options).length === 0) {
    throw new TypeError("Requête vide après normalisation");
  }
  const words = normalized ? [...new Set(normalized.split(" "))] : [];
  const results = [];

  for (const record of records) {
    if (!matchesIndexFilters(record, options)) continue;

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

export { isValidCoverageLevel, VALID_TYPES, VALID_DATE_TYPES };
