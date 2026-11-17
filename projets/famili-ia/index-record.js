import { isValidCoverageLevel } from "./index-coverage.js";

export const INDEX_RECORD_SCHEMA_VERSION = "1.2.0";
const PREVIOUS_SCHEMA_VERSIONS = new Set(["1.0.0", "1.1.0"]);
const DATE_TYPES = ["creation", "modification", "priseDeVue", "achat", "echeance"];
const SOURCES = ["provider", "extracted", "user-input", "auto-estimate"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertKeys(value, allowed, label) {
  if (!isObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError(`${label} invalide`);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeAccountRef(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new TypeError("accountRef invalide");
  }
  return value.toLowerCase();
}

export function isValidDate(value) {
  if (typeof value !== "string") return false;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
  if (!dateOnly && !timestamp) return false;
  const parsed = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) return false;
  const canonical = parsed.toISOString();
  return dateOnly ? canonical.slice(0, 10) === value :
    canonical === (value.length === 20 ? value.slice(0, -1) + ".000Z" : value);
}

function normalizeValue(input, label, date = false) {
  assertKeys(input, ["value", "source", "estimated", "proof"], label);
  if (!isNonEmptyString(input.value) || (date && !isValidDate(input.value))) {
    throw new TypeError(`${label} : valeur invalide`);
  }
  if (!SOURCES.includes(input.source)) throw new TypeError(`${label} : provenance invalide`);
  if (input.estimated !== undefined && typeof input.estimated !== "boolean") {
    throw new TypeError(`${label} : estimation invalide`);
  }
  const estimated = input.estimated === undefined ? input.source === "auto-estimate" : input.estimated;
  if (input.source === "auto-estimate" && !estimated) {
    throw new TypeError(`${label} : une estimation automatique ne peut pas être confirmée`);
  }
  let proof = null;
  if (input.proof !== undefined && input.proof !== null) {
    assertKeys(input.proof, ["excerpt", "location"], "preuve");
    if (!isNonEmptyString(input.proof.excerpt) ||
        (input.proof.location !== undefined && input.proof.location !== null &&
          !isNonEmptyString(input.proof.location))) {
      throw new TypeError("preuve invalide");
    }
    proof = { excerpt: input.proof.excerpt, location: input.proof.location ?? null };
  }
  return { value: input.value, source: input.source, estimated, proof };
}

export function createIndexRecord(sourceId, itemId, options = {}) {
  if (!isNonEmptyString(sourceId) || !isNonEmptyString(itemId)) {
    throw new TypeError("sourceId et itemId doivent être des chaînes non vides");
  }
  assertKeys(options, ["accountRef", "type", "name", "location", "dates", "coverage", "lastCheck", "fields"], "options");
  const { accountRef = null, type = null, name = null, location = null, dates = {}, coverage = null, lastCheck = null, fields = [] } = options;
  const normalizedAccountRef = normalizeAccountRef(accountRef);
  if (type !== null && !["document", "photo"].includes(type)) throw new TypeError("type invalide");
  if (coverage !== null && !isValidCoverageLevel(coverage)) throw new TypeError("couverture invalide");
  if (lastCheck !== null && !isValidDate(lastCheck)) throw new TypeError("dernière vérification invalide");
  assertKeys(dates, DATE_TYPES, "dates");
  if (!Array.isArray(fields)) throw new TypeError("fields doit être un tableau");

  const normalizedDates = {};
  for (const [key, value] of Object.entries(dates)) {
    normalizedDates[key] = normalizeValue(value, `date ${key}`, true);
  }
  const normalizedFields = Array.from(fields, (field) => {
    assertKeys(field, ["name", "value", "source", "estimated", "proof"], "champ");
    if (!isNonEmptyString(field.name)) throw new TypeError("nom de champ invalide");
    const { name: fieldName, ...value } = field;
    return { name: fieldName, ...normalizeValue(value, "champ") };
  });
  return {
    schema: INDEX_RECORD_SCHEMA_VERSION,
    sourceId,
    accountRef: normalizedAccountRef,
    itemId,
    type,
    name: name === null ? null : normalizeValue(name, "nom"),
    location: location === null ? null : normalizeValue(location, "emplacement"),
    dates: normalizedDates,
    coverage,
    lastCheck,
    fields: normalizedFields
  };
}

export function isValidIndexRecord(record) {
  if (!isObject(record)) return false;
  try {
    assertKeys(record, ["schema", "sourceId", "accountRef", "itemId", "type", "name", "location", "dates", "coverage", "lastCheck", "fields"], "fiche");
    if (record.schema !== INDEX_RECORD_SCHEMA_VERSION ||
        ["accountRef", "type", "name", "location", "dates", "coverage", "lastCheck", "fields"].some((key) =>
          !Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined)) {
      return false;
    }
    const normalized = createIndexRecord(record.sourceId, record.itemId, {
      accountRef: record.accountRef,
      type: record.type, name: record.name, location: record.location, dates: record.dates,
      coverage: record.coverage, lastCheck: record.lastCheck, fields: record.fields
    });
    return normalized.accountRef === record.accountRef;
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function migrateIndexRecord(record, options = {}) {
  if (!isObject(record)) throw new TypeError("Fiche d'index invalide");
  if (!isObject(options) || Object.keys(options).some(key => key !== "accountRef")) {
    throw new TypeError("Options de migration de fiche invalides");
  }
  const expectedAccountRef = Object.hasOwn(options, "accountRef")
    ? normalizeAccountRef(options.accountRef)
    : undefined;
  if (record.schema === INDEX_RECORD_SCHEMA_VERSION) {
    if (!isValidIndexRecord(record)) throw new TypeError("Fiche d'index invalide");
    if (expectedAccountRef !== undefined && record.accountRef !== expectedAccountRef) {
      throw new TypeError("Empreinte de compte incohérente avec la fiche d'index");
    }
    return createIndexRecord(record.sourceId, record.itemId, {
      accountRef: record.accountRef,
      type: record.type,
      name: record.name,
      location: record.location,
      dates: record.dates,
      coverage: record.coverage,
      lastCheck: record.lastCheck,
      fields: record.fields
    });
  }
  if (!PREVIOUS_SCHEMA_VERSIONS.has(record.schema)) {
    throw new TypeError(`Version de fiche d'index non prise en charge : ${record.schema ?? "absente"}`);
  }
  const hasLocation = record.schema === "1.1.0";
  assertKeys(record, [
    "schema", "sourceId", "itemId", "type", "name",
    ...(hasLocation ? ["location"] : []),
    "dates", "coverage", "lastCheck", "fields"
  ], "fiche historique");
  try {
    return createIndexRecord(record.sourceId, record.itemId, {
      accountRef: expectedAccountRef ?? null,
      type: record.type,
      name: record.name,
      location: hasLocation ? record.location : null,
      dates: record.dates,
      coverage: record.coverage,
      lastCheck: record.lastCheck,
      fields: record.fields
    });
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError("Fiche d'index historique invalide");
    throw error;
  }
}

// This adapter is only for the test fixture's discovery shape, not real connectors.
export function fakeConnectorAdapter(discoveryPage, sourceId) {
  if (!isObject(discoveryPage) || !Array.isArray(discoveryPage.items) || !isNonEmptyString(sourceId)) {
    throw new TypeError("page ou source fictive invalide");
  }
  return Array.from(discoveryPage.items, (item) => {
    if (!isObject(item) || !isNonEmptyString(item.id) || !isNonEmptyString(item.name)) {
      throw new TypeError("métadonnées fictives invalides");
    }
    return createIndexRecord(sourceId, item.id, {
      name: { value: item.name, source: "provider" },
      location: null,
      coverage: "metadata"
    });
  });
}
