import { interpretMomentsLifeQuery } from "./moments-life-query.js";
import { isPhotoDocument } from "./photo-annotations.js";
import { normalizeText } from "./search-utils.js";

const PHOTO_INTENT = /\b(?:photo|photos|image|images|souvenir|souvenirs)\b/;
const QUERY_STOP_WORDS = new Set([
  "a", "au", "aux", "avec", "c", "d", "dans", "de", "des", "du", "elle", "en",
  "et", "il", "j", "je", "l", "la", "le", "les", "m", "ma", "mes", "moi",
  "mon", "n", "ne", "nous", "par", "pour", "qu", "quand", "que", "qui", "s",
  "sa", "ses", "son", "sur", "t", "un",
  "une", "vous", "vos", "veux", "voudrais", "montre", "montrez", "retrouve",
  "retrouver", "cherche", "chercher", "voir", "avait", "avaient", "ans", "an",
  "photos", "photo", "images", "image", "souvenirs", "souvenir", "prises",
  "prise", "pris", "importe", "importee", "importes", "importees", "ajoute",
  "ajoutee", "ajoutes", "ajoutees"
]);

function getPhotoCatalog(photos) {
  const places = new Map();
  const events = new Map();
  for (const photo of photos.filter(isPhotoDocument)) {
    const annotations = photo.photoAnnotations;
    if (annotations?.placeSource === "user" && typeof annotations.placeLabel === "string" &&
        annotations.placeLabel.trim()) {
      places.set(normalizeText(annotations.placeLabel), {
        label: annotations.placeLabel,
        source: "user"
      });
    }
    for (const tag of annotations?.eventTags ?? []) {
      if (typeof tag !== "string" || !tag.trim()) continue;
      events.set(normalizeText(tag), { tag, label: tag, aliases: [tag] });
    }
  }
  return { places: [...places.values()], events: [...events.values()] };
}

function previousCalendarDay(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function photoDateFilters(filters) {
  if (filters.captureLocalDate) {
    return { dateType: "priseDeVue", dateFrom: filters.captureLocalDate, dateTo: filters.captureLocalDate };
  }
  if (filters.captureYear) {
    const year = String(filters.captureYear).padStart(4, "0");
    return { dateType: "priseDeVue", dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  if (filters.captureDateStart) {
    return {
      dateType: "priseDeVue",
      dateFrom: filters.captureDateStart,
      dateTo: previousCalendarDay(filters.captureDateEndExclusive)
    };
  }
  return null;
}

function importedDateRange(filters) {
  if (filters.importLocalDate) {
    return { from: filters.importLocalDate, to: filters.importLocalDate };
  }
  if (filters.importYear) {
    const year = String(filters.importYear).padStart(4, "0");
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return null;
}

function remainingQueryTerms(query, explanations) {
  const ignoredWords = new Set(QUERY_STOP_WORDS);
  for (const explanation of explanations) {
    for (const word of normalizeText(explanation.phrase).split(" ")) {
      if (word) ignoredWords.add(word);
    }
  }
  return normalizeText(query).split(" ").filter(word => word && !ignoredWords.has(word)).join(" ");
}

export function createUnifiedIndexQuery(query, { members = [], photos = [] } = {}) {
  if (typeof query !== "string") throw new TypeError("La recherche doit être une chaîne.");
  if (!Array.isArray(members) || !Array.isArray(photos)) {
    throw new TypeError("Les membres et photos doivent être des tableaux.");
  }
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return { kind: "empty", query: "", filters: {} };

  const normalizedQuery = normalizeText(trimmedQuery);
  if (!PHOTO_INTENT.test(normalizedQuery)) {
    return { kind: "keywords", query: trimmedQuery, filters: {} };
  }

  const photoMembers = members
    .filter(member => member && typeof member.id === "string")
    .map(member => ({ ...member, displayName: member.displayName ?? member.name ?? "" }));
  const catalog = getPhotoCatalog(photos);
  const interpretation = interpretMomentsLifeQuery(trimmedQuery, {
    members: photoMembers,
    places: catalog.places,
    events: catalog.events
  });
  if (interpretation.status === "clarification" &&
      interpretation.clarificationReason !== "unsupported-query") {
    return {
      kind: "clarification",
      query: trimmedQuery,
      filters: {},
      clarificationReason: interpretation.clarificationReason
    };
  }

  const filters = { type: "photo" };
  const interpreted = interpretation.status === "ready" ? interpretation.filters : {};
  if (interpreted.personId) filters.personId = interpreted.personId;
  if (interpreted.placeLabel) filters.place = interpreted.placeLabel;
  if (interpreted.eventTag) filters.eventTag = interpreted.eventTag;
  Object.assign(filters, photoDateFilters(interpreted) ?? {});

  const member = photoMembers.find(entry => entry.id === interpreted.personId);
  const profileMismatch = Boolean(member && (
    (interpreted.memberBirthYear !== undefined &&
      member.birthDate?.slice(0, 4) !== String(interpreted.memberBirthYear)) ||
    (interpreted.memberBirthDate !== undefined && member.birthDate !== interpreted.memberBirthDate)
  ));

  return {
    kind: "photo",
    query: remainingQueryTerms(trimmedQuery, interpretation.explanations),
    filters,
    importDateRange: importedDateRange(interpreted),
    explanations: interpretation.explanations,
    profileMismatch
  };
}

export function mergeUnifiedIndexFilters(parsedFilters, selectedFilters) {
  const merged = { ...selectedFilters };
  for (const [key, value] of Object.entries(parsedFilters)) {
    if (["sourceId", "type", "coverage", "personId", "place", "eventTag"].includes(key) &&
        merged[key] !== undefined && normalizeText(merged[key]) !== normalizeText(value)) {
      return null;
    }
    if (key === "dateType" && merged.dateType !== undefined && merged.dateType !== value) return null;
    merged[key] = value;
  }

  if (parsedFilters.dateFrom || parsedFilters.dateTo) {
    if (selectedFilters.dateFrom) merged.dateFrom = parsedFilters.dateFrom
      ? (parsedFilters.dateFrom > selectedFilters.dateFrom ? parsedFilters.dateFrom : selectedFilters.dateFrom)
      : selectedFilters.dateFrom;
    if (selectedFilters.dateTo) merged.dateTo = parsedFilters.dateTo
      ? (parsedFilters.dateTo < selectedFilters.dateTo ? parsedFilters.dateTo : selectedFilters.dateTo)
      : selectedFilters.dateTo;
  }
  if (merged.dateFrom && merged.dateTo && merged.dateFrom > merged.dateTo) return null;
  return merged;
}

export function isWithinDateRange(value, range) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return false;
  const date = value.slice(0, 10);
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}
