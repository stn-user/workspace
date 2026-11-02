export const PHOTO_ANNOTATIONS_SCHEMA_VERSION = 1;
const MAX_EVENT_TAG_LENGTH = 80;
const MAX_EVENT_TAGS = 50;
const CAPTURE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function normalizeCaptureDateOverride(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new TypeError("La date de prise de vue corrigée doit être une date locale.");
  }
  const match = CAPTURE_DATE_PATTERN.exec(value);
  if (!match) {
    throw new TypeError("Saisissez une date de prise de vue valide.");
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59) {
    throw new TypeError("Saisissez une date de prise de vue valide.");
  }
  return {
    localDateTime: `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${String(second).padStart(2, "0")}`,
    offsetMinutes: null,
    source: "user"
  };
}

function normalizeEventTags(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Les événements associés doivent être une liste.");
  }

  const tags = [];
  const seen = new Set();
  for (const rawTag of value) {
    if (typeof rawTag !== "string") {
      throw new TypeError("Chaque événement associé doit être un libellé textuel.");
    }
    const tag = rawTag.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > MAX_EVENT_TAG_LENGTH) {
      throw new TypeError(`Un libellé d'événement ne peut pas dépasser ${MAX_EVENT_TAG_LENGTH} caractères.`);
    }
    const key = tag.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
    if (tags.length > MAX_EVENT_TAGS) {
      throw new TypeError(`Une photo ne peut pas avoir plus de ${MAX_EVENT_TAGS} événements associés.`);
    }
  }
  return tags;
}

export function normalizePhotoAnnotations(value, validMemberIds = []) {
  if (value == null) value = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Les annotations de photo doivent être un objet.");
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== PHOTO_ANNOTATIONS_SCHEMA_VERSION) {
    throw new TypeError(`Version d'annotations photo non prise en charge : ${value.schemaVersion}.`);
  }
  if (!Array.isArray(value.personIds ?? [])) {
    throw new TypeError("Les membres associés doivent être une liste.");
  }

  const allowedIds = new Set(validMemberIds);
  const personIds = [...new Set(value.personIds ?? [])];
  if (personIds.some(id => typeof id !== "string" || !allowedIds.has(id))) {
    throw new TypeError("Une photo ne peut être associée qu'à des membres existants.");
  }

  const placeLabel = typeof value.placeLabel === "string" ? value.placeLabel.trim().replace(/\s+/g, " ") : "";
  if (placeLabel.length > 120) {
    throw new TypeError("Un libellé de lieu ne peut pas dépasser 120 caractères.");
  }
  if (placeLabel && value.placeSource !== "user") {
    throw new TypeError("Un lieu associé à une photo doit avoir été saisi explicitement par l'utilisateur.");
  }

  return {
    schemaVersion: PHOTO_ANNOTATIONS_SCHEMA_VERSION,
    personIds,
    eventTags: normalizeEventTags(value.eventTags ?? []),
    captureDateOverride: normalizeCaptureDateOverride(value.captureDateOverride),
    placeLabel: placeLabel || null,
    placeSource: placeLabel ? "user" : null,
    source: "user"
  };
}

export function removePhotoMemberAssociation(value, memberId, validMemberIds) {
  const annotations = normalizePhotoAnnotations(value, [...validMemberIds, memberId]);
  return {
    ...annotations,
    personIds: annotations.personIds.filter(id => id !== memberId)
  };
}

export function isPhotoDocument(document) {
  if (!document || typeof document !== "object") return false;
  const name = String(document.name ?? document.originalName ?? "");
  return String(document.type ?? "").toLocaleLowerCase("fr") === "image"
    || /\.(jpe?g|png)$/i.test(name);
}
