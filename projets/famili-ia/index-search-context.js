import { searchIndex } from "./index-search.js";
import { isValidDate } from "./index-record.js";

const keys = ["sourceId", "scope", "availability", "indexing", "lastCheck"];

export function isValidSourceDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor) ||
      (Object.getPrototypeOf(descriptor) !== Object.prototype && Object.getPrototypeOf(descriptor) !== null)) {
    return false;
  }
  if (Reflect.ownKeys(descriptor).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptor, key))) {
    return false;
  }
  return typeof descriptor.sourceId === "string" && descriptor.sourceId.trim().length > 0 &&
    (descriptor.scope === null || (typeof descriptor.scope === "string" && descriptor.scope.trim().length > 0)) &&
    ["available", "unavailable", "unknown"].includes(descriptor.availability) &&
    ["complete", "partial", "in-progress", "unknown"].includes(descriptor.indexing) &&
    (descriptor.lastCheck === null || isValidDate(descriptor.lastCheck));
}

export function searchIndexWithContext(records, query, sourceDescriptors, options = {}) {
  if (!Array.isArray(sourceDescriptors)) throw new TypeError("Les sources doivent être un tableau");
  const descriptors = new Map();
  for (const descriptor of sourceDescriptors) {
    if (!isValidSourceDescriptor(descriptor)) throw new TypeError("Descripteur de source invalide");
    if (descriptors.has(descriptor.sourceId)) throw new TypeError("Source dupliquée");
    descriptors.set(descriptor.sourceId, descriptor);
  }

  const results = searchIndex(records, query, options);
  for (const record of records) {
    if (!descriptors.has(record.sourceId)) throw new TypeError("Source d'une fiche non déclarée");
  }
  if (options.sourceId !== undefined && !descriptors.has(options.sourceId)) {
    throw new TypeError("Source filtrée non déclarée");
  }

  const counts = new Map();
  for (const result of results) counts.set(result.sourceId, (counts.get(result.sourceId) || 0) + 1);
  const sources = sourceDescriptors
    .filter((descriptor) => options.sourceId === undefined || descriptor.sourceId === options.sourceId)
    .map(({ sourceId, scope, availability, indexing, lastCheck }) => ({
      sourceId, scope, availability, indexing, lastCheck, resultCount: counts.get(sourceId) || 0
    }));
  return { results, sources };
}
