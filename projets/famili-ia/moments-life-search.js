import { interpretMomentsLifeQuery } from "./moments-life-query.js";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function getCaptureDate(photo) {
  const value = photo.photoAnnotations?.captureDateOverride?.localDateTime
    ?? photo.photoMetadata?.captureDate?.localDateTime
    ?? photo.capturedAt?.localDateTime
    ?? null;
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : null;
  return isValidDate(date) ? date : null;
}

function getImportedDate(photo) {
  const value = photo.importedAt ?? null;
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  const date = match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  return isValidDate(date) ? date : null;
}

function matchesDateFilters(photo, filters) {
  const captureDate = getCaptureDate(photo);
  const importedDate = getImportedDate(photo);

  if (filters.captureYear !== undefined && captureDate?.slice(0, 4) !== String(filters.captureYear)) return false;
  if (filters.captureLocalDate !== undefined && captureDate !== filters.captureLocalDate) return false;
  if (filters.captureDateStart !== undefined && (!captureDate || captureDate < filters.captureDateStart)) return false;
  if (filters.captureDateEndExclusive !== undefined
    && (!captureDate || captureDate >= filters.captureDateEndExclusive)) return false;
  if (filters.importYear !== undefined && importedDate?.slice(0, 4) !== String(filters.importYear)) return false;
  if (filters.importLocalDate !== undefined && importedDate !== filters.importLocalDate) return false;
  return true;
}

function getPersonIds(photo) {
  const value = photo.photoAnnotations?.personIds ?? photo.personIds;
  return Array.isArray(value) ? value.filter(id => typeof id === "string") : [];
}

function getEventTags(photo) {
  const value = photo.photoAnnotations?.eventTags ?? photo.eventTags;
  return Array.isArray(value) ? value.filter(tag => typeof tag === "string") : [];
}

function getUserPlace(photo) {
  const annotationPlace = photo.photoAnnotations?.placeLabel;
  if (photo.photoAnnotations?.placeSource === "user"
    && typeof annotationPlace === "string" && annotationPlace.trim()) return annotationPlace;
  const place = photo.place;
  return place?.source === "user" && typeof place.label === "string" ? place.label : null;
}

function matchesFilters(photo, filters, members) {
  const personIds = getPersonIds(photo);
  if (filters.personId && !personIds.includes(filters.personId)) return false;
  if (!matchesDateFilters(photo, filters)) return false;

  if (filters.memberBirthYear !== undefined || filters.memberBirthDate !== undefined) {
    const member = members.find(item => item.id === filters.personId);
    if (!member) return false;
    const birthDate = typeof member.birthDate === "string" ? member.birthDate : null;
    if (filters.memberBirthYear !== undefined
      && birthDate?.slice(0, 4) !== String(filters.memberBirthYear)) return false;
    if (filters.memberBirthDate !== undefined && birthDate !== filters.memberBirthDate) return false;
  }

  if (filters.placeLabel !== undefined) {
    if (filters.placeSource === "user" && getUserPlace(photo) === null) return false;
    if (normalizeText(getUserPlace(photo)) !== normalizeText(filters.placeLabel)) return false;
  }
  if (filters.eventTag !== undefined
    && !getEventTags(photo).some(tag => normalizeText(tag) === normalizeText(filters.eventTag))) return false;
  return true;
}

function compareNullableDescending(first, second) {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first === second ? 0 : first > second ? -1 : 1;
}

function comparePhotos(first, second) {
  const captureOrder = compareNullableDescending(getCaptureDate(first), getCaptureDate(second));
  if (captureOrder !== 0) return captureOrder;
  const importOrder = compareNullableDescending(getImportedDate(first), getImportedDate(second));
  if (importOrder !== 0) return importOrder;
  const firstId = String(first.id);
  const secondId = String(second.id);
  return firstId === secondId ? 0 : firstId < secondId ? -1 : 1;
}

function getConfidence(photo, filters) {
  let level = "high";
  const reasons = [];
  const annotations = photo.photoAnnotations;
  const lowerConfidence = (nextLevel) => {
    if (nextLevel === "low" || (nextLevel === "medium" && level === "high")) level = nextLevel;
  };

  if (filters.personId || filters.placeLabel !== undefined || filters.eventTag !== undefined) {
    if (annotations?.source !== "user") {
      lowerConfidence("low");
      reasons.push("La provenance des associations manuelles n'est pas confirmée.");
    }
  }

  const captureFilters = ["captureYear", "captureLocalDate", "captureDateStart", "captureDateEndExclusive"];
  if (captureFilters.some(filter => filters[filter] !== undefined)) {
    const userOverride = photo.photoAnnotations?.captureDateOverride;
    const captureDate = userOverride ?? photo.photoMetadata?.captureDate ?? null;
    const source = userOverride?.source ?? captureDate?.source?.kind;
    if (source === "exif" && Number.isInteger(captureDate.offsetMinutes)) {
      reasons.push("La date de prise de vue vient des métadonnées EXIF avec un fuseau connu.");
    } else if (source === "exif") {
      lowerConfidence("medium");
      reasons.push("La date de prise de vue vient des métadonnées EXIF, mais son fuseau est inconnu.");
    } else if (source === "user") {
      reasons.push("La date de prise de vue a été corrigée manuellement.");
    } else if (source === "legacy" || photo.capturedAt?.localDateTime) {
      lowerConfidence("medium");
      reasons.push("La date de prise de vue provient de données anciennes ou sans provenance détaillée.");
    } else {
      lowerConfidence("low");
      reasons.push("La provenance de la date de prise de vue est inconnue.");
    }
  }

  if (filters.ageYears !== undefined || filters.memberBirthYear !== undefined || filters.memberBirthDate !== undefined) {
    lowerConfidence("medium");
    reasons.push("Le filtre d'âge dépend de la date de naissance enregistrée pour le membre.");
  }

  return {
    level,
    label: level === "high" ? "Élevé" : level === "medium" ? "Modéré" : "À vérifier",
    reasons
  };
}

function getPhotoCatalog(photos) {
  const placesByKey = new Map();
  const eventsByKey = new Map();
  for (const photo of photos) {
    const place = getUserPlace(photo);
    if (place) placesByKey.set(normalizeText(place), { label: place, source: "user" });
    for (const tag of getEventTags(photo)) {
      if (typeof tag !== "string" || !tag.trim()) continue;
      eventsByKey.set(normalizeText(tag), { tag, label: tag, aliases: [tag] });
    }
  }
  return {
    places: [...placesByKey.values()],
    events: [...eventsByKey.values()]
  };
}

export function searchMomentsLife(query, {
  photos = [],
  members = [],
  places: suppliedPlaces,
  events: suppliedEvents
} = {}) {
  const normalizedPhotos = photos.filter(photo => photo && typeof photo.id === "string");
  const memberCatalog = members
    .filter(member => member && typeof member.id === "string")
    .map(member => ({ ...member, displayName: member.displayName ?? member.name ?? "" }));
  const catalog = getPhotoCatalog(normalizedPhotos);
  const interpretation = interpretMomentsLifeQuery(query, {
    members: memberCatalog,
    places: suppliedPlaces ?? catalog.places,
    events: suppliedEvents ?? catalog.events
  });

  if (interpretation.status === "clarification") {
    return { status: "clarification", ...interpretation, results: [] };
  }

  const results = normalizedPhotos
    .filter(photo => matchesFilters(photo, interpretation.filters, memberCatalog))
    .sort(comparePhotos)
    .map((photo, index) => ({
      photo,
      rank: index + 1,
      confidence: getConfidence(photo, interpretation.filters),
      reasons: interpretation.explanations.map(item => ({
        filter: item.filter,
        phrase: item.phrase,
        reason: item.reason
      }))
    }));

  return {
    status: results.length === 0 ? "not-found" : "results",
    filters: interpretation.filters,
    explanations: interpretation.explanations,
    clarificationReason: null,
    results
  };
}

export function evaluateMomentsLifeSearch(cases, {
  photos = [],
  members = [],
  places,
  events,
  limit = 5
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("La limite d'évaluation doit être un entier positif.");
  }

  const resultCases = [];
  let clarificationCorrect = 0;
  let notFoundCorrect = 0;
  for (const evaluationCase of cases) {
    const search = searchMomentsLife(evaluationCase.query, { photos, members, places, events });
    if (evaluationCase.expectedStatus === "clarification") {
      const correct = search.status === "clarification"
        && search.clarificationReason === evaluationCase.clarificationReason;
      clarificationCorrect += Number(correct);
      continue;
    }
    if (evaluationCase.expectedStatus === "not-found") {
      const correct = search.status === "not-found" && search.results.length === 0;
      notFoundCorrect += Number(correct);
      continue;
    }

    const expectedIds = new Set(evaluationCase.expectedPhotoIds);
    const topResults = search.results.slice(0, limit);
    const relevantCount = topResults.filter(result => expectedIds.has(result.photo.id)).length;
    const reciprocalRank = topResults.findIndex(result => expectedIds.has(result.photo.id));
    resultCases.push({
      id: evaluationCase.id,
      precisionAtLimit: topResults.length === 0 ? 0 : relevantCount / topResults.length,
      recallAtLimit: expectedIds.size === 0 ? 1 : relevantCount / expectedIds.size,
      reciprocalRank: reciprocalRank === -1 ? 0 : 1 / (reciprocalRank + 1),
      relevantCount,
      returnedCount: topResults.length,
      expectedCount: expectedIds.size
    });
  }

  const mean = (key) => resultCases.length === 0
    ? 0
    : resultCases.reduce((sum, item) => sum + item[key], 0) / resultCases.length;
  const clarificationCases = cases.filter(item => item.expectedStatus === "clarification").length;
  const notFoundCases = cases.filter(item => item.expectedStatus === "not-found").length;
  return {
    precisionAtLimit: mean("precisionAtLimit"),
    recallAtLimit: mean("recallAtLimit"),
    meanReciprocalRank: mean("reciprocalRank"),
    clarificationAccuracy: clarificationCases === 0 ? 1 : clarificationCorrect / clarificationCases,
    notFoundAccuracy: notFoundCases === 0 ? 1 : notFoundCorrect / notFoundCases,
    resultCaseCount: resultCases.length,
    clarificationCaseCount: clarificationCases,
    notFoundCaseCount: notFoundCases,
    cases: resultCases
  };
}
