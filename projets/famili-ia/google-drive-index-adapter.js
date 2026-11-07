import { createIndexRecord } from "./index-record.js";

const DRIVE_TYPES = ["PDF", "Texte", "Markdown", "Document Google"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidDriveResult(result) {
  return result !== null && typeof result === "object" && !Array.isArray(result) &&
    typeof result.id === "string" && result.id.startsWith("drive-") &&
    isNonEmptyString(result.id.slice("drive-".length)) &&
    isNonEmptyString(result.name) && DRIVE_TYPES.includes(result.type) &&
    isNonEmptyString(result.date) && isNonEmptyString(result.content) &&
    typeof result.keywords === "string" && typeof result.summary === "string" &&
    result.isLocal === true && result.driveSource === true;
}

function validateSourceId(sourceId) {
  if (!isNonEmptyString(sourceId)) throw new TypeError("sourceId doit être une chaîne non vide");
}

function toRecord(sourceId, result) {
  return createIndexRecord(sourceId, result.id, {
    name: { value: result.name, source: "provider" },
    coverage: "metadata"
  });
}

export function adaptDriveResult(sourceId, result) {
  validateSourceId(sourceId);
  if (!isValidDriveResult(result)) throw new TypeError("Résultat Drive invalide");
  return toRecord(sourceId, result);
}

export function adaptDriveResults(sourceId, results) {
  validateSourceId(sourceId);
  if (!Array.isArray(results)) throw new TypeError("results doit être un tableau");
  const seen = new Set();
  for (const result of results) {
    if (!isValidDriveResult(result)) throw new TypeError("Résultat Drive invalide");
    if (seen.has(result.id)) throw new TypeError("Identifiant dupliqué dans la sélection");
    seen.add(result.id);
  }
  return Array.from(results, (result) => toRecord(sourceId, result));
}
