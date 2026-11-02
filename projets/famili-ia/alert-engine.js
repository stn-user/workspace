/**
 * alert-engine.js - Validation des échéances et génération d'alertes explicables.
 */

const THRESHOLDS = {
  garantie: { amber: 60, red: 15 },
  assurance: { amber: 30, red: null },
  facture: { amber: 30, red: 7 },
  entretien: { amber: 30, red: 7 }
};

export const ALERT_CATEGORIES = Object.keys(THRESHOLDS);

export function normalizeAlertNotificationPreferences(preferences = {}) {
  const allowedLimits = [1, 3, 5];
  const quietHours = preferences.quietHours || {};
  const isValidTime = value => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const start = isValidTime(quietHours.start) ? quietHours.start : "22:00";
  const end = isValidTime(quietHours.end) ? quietHours.end : "08:00";

  return {
    disabledCategories: [...new Set(
      (Array.isArray(preferences.disabledCategories) ? preferences.disabledCategories : [])
        .filter(category => ALERT_CATEGORIES.includes(category))
    )],
    maxPerDay: allowedLimits.includes(Number(preferences.maxPerDay)) ? Number(preferences.maxPerDay) : 3,
    quietHours: {
      enabled: quietHours.enabled === true && start !== end,
      start,
      end
    }
  };
}

const frenchMonths = new Map([
  ["janvier", 1], ["fevrier", 2], ["mars", 3], ["avril", 4],
  ["mai", 5], ["juin", 6], ["juillet", 7], ["aout", 8],
  ["septembre", 9], ["octobre", 10], ["novembre", 11], ["decembre", 12]
]);

function isValidCalendarDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function toIsoDate(year, month, day) {
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getUtcTimestamp(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

/**
 * Returns a validated calendar date in ISO format, or null for ambiguous/invalid input.
 * Numeric dates are interpreted in the application's French day/month/year convention.
 */
export function normalizeAlertDate(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return null;

  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(.+))?$/);
  if (isoMatch) {
    if (isoMatch[4] && Number.isNaN(Date.parse(input))) return null;
    return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const numericMatch = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numericMatch) {
    return toIsoDate(Number(numericMatch[3]), Number(numericMatch[2]), Number(numericMatch[1]));
  }

  const textMatch = normalizeText(input).match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (!textMatch) return null;
  const month = frenchMonths.get(textMatch[2]);
  return month ? toIsoDate(Number(textMatch[3]), month, Number(textMatch[1])) : null;
}

export function getDaysUntilDate(value, now = new Date()) {
  const isoDate = normalizeAlertDate(value);
  if (!isoDate) return null;
  let referenceDate;
  try {
    referenceDate = new Date(Date.prototype.getTime.call(now));
  } catch {
    return null;
  }
  if (Number.isNaN(referenceDate.getTime())) return null;

  const [year, month, day] = isoDate.split("-").map(Number);
  const dueUtc = getUtcTimestamp(year, month, day);
  const todayUtc = getUtcTimestamp(referenceDate.getFullYear(), referenceDate.getMonth() + 1, referenceDate.getDate());
  return Math.round((dueUtc - todayUtc) / 86400000);
}

export function getAlertLevelForDate(value, documentType, now = new Date()) {
  const daysUntil = getDaysUntilDate(value, now);
  const typeConfig = THRESHOLDS[String(documentType || "").toLocaleLowerCase("fr")];
  if (daysUntil === null || !typeConfig) return null;
  if (daysUntil <= 0 || (typeConfig.red !== null && daysUntil <= typeConfig.red)) return "red";
  if (daysUntil <= typeConfig.amber) return "amber";
  return "blue";
}

/**
 * Generates an alert only for a valid, explicitly sourced due date.
 */
export function generateAlertForDoc(doc, now = new Date()) {
  if (!doc?.id || !doc.expiryDate) return null;
  const dueDate = normalizeAlertDate(doc.expiryDate);
  const evidence = typeof doc.expiryDateEvidence === "string" ? doc.expiryDateEvidence.trim() : "";
  const isUserConfirmed = doc.expiryDateSource === "user";
  const documentType = doc.alertType || doc.type;
  if (!dueDate || (!evidence && !isUserConfirmed)) return null;

  const level = getAlertLevelForDate(dueDate, documentType, now);
  if (level !== "red" && level !== "amber") return null;

  return {
    id: `alert-${doc.id}`,
    docId: doc.id,
    documentType: String(documentType).toLocaleLowerCase("fr"),
    source: "document",
    sourceExcerpt: evidence || "Échéance confirmée manuellement.",
    confidence: isUserConfirmed ? "confirmed" : "high",
    title: `${String(documentType).charAt(0).toLocaleUpperCase("fr")}${String(documentType).slice(1)} : ${doc.provider || doc.originalName || doc.name || "Document"}`,
    detail: level === "red" ? "Échéance dépassée ou imminente." : "Échéance à prévoir.",
    type: level,
    dueDate,
    status: "active"
  };
}

export function refreshAlerts(documents, now = new Date()) {
  const alertsById = new Map();
  for (const doc of documents) {
    const alert = generateAlertForDoc(doc, now);
    if (alert) alertsById.set(alert.id, alert);
  }
  return [...alertsById.values()];
}

export function getAlertsToNotify(alerts, now = new Date(), notificationPreferences = {}) {
  const preferences = normalizeAlertNotificationPreferences(notificationPreferences);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const [quietStartHour, quietStartMinute] = preferences.quietHours.start.split(":").map(Number);
  const [quietEndHour, quietEndMinute] = preferences.quietHours.end.split(":").map(Number);
  const quietStart = quietStartHour * 60 + quietStartMinute;
  const quietEnd = quietEndHour * 60 + quietEndMinute;
  const inQuietHours = preferences.quietHours.enabled && (
    quietStart < quietEnd
      ? currentMinute >= quietStart && currentMinute < quietEnd
      : currentMinute >= quietStart || currentMinute < quietEnd
  );
  if (inQuietHours) return [];

  const sentToday = alerts.filter(alert => (
    typeof alert.notificationSentAt === "string"
      && !Number.isNaN(Date.parse(alert.notificationSentAt))
      && (() => {
        const sentAt = new Date(alert.notificationSentAt);
        return sentAt.getFullYear() === now.getFullYear()
          && sentAt.getMonth() === now.getMonth()
          && sentAt.getDate() === now.getDate();
      })()
  )).length;
  const candidates = alerts.filter((alert) => {
    const daysUntil = getDaysUntilDate(alert.dueDate, now);
    const snoozedUntil = normalizeAlertDate(alert.snoozedUntil);
    return alert.source === "document"
      && alert.status !== "ignored"
      && alert.status !== "resolved"
      && !preferences.disabledCategories.includes(alert.documentType)
      && (!snoozedUntil || snoozedUntil <= today)
      && daysUntil !== null
      && daysUntil >= 0
      && daysUntil <= 3
      && alert.notificationSentFor !== alert.dueDate;
  });
  return candidates
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .slice(0, Math.max(0, preferences.maxPerDay - sentToday));
}
