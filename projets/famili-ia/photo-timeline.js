function parseLocalDateTime(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

export function getPhotoTimelineDateInfo(photo) {
  const annotations = photo?.photoAnnotations;
  const override = annotations?.captureDateOverride;
  const metadataDate = photo?.photoMetadata?.captureDate;
  const legacyDate = photo?.capturedAt;
  const candidate = override?.localDateTime
    ? { value: override.localDateTime, source: override.source || "user", offsetMinutes: override.offsetMinutes ?? null }
    : metadataDate?.localDateTime
      ? { value: metadataDate.localDateTime, source: metadataDate.source?.kind || null, offsetMinutes: metadataDate.offsetMinutes ?? null }
      : legacyDate?.localDateTime
        ? { value: legacyDate.localDateTime, source: "legacy", offsetMinutes: null }
        : null;

  if (!candidate) return null;
  const localDate = parseLocalDateTime(candidate.value);
  if (!localDate) return null;
  const estimated = !["exif", "user"].includes(candidate.source);
  const validExifOffset = Number.isInteger(candidate.offsetMinutes)
    && Math.abs(candidate.offsetMinutes) <= 14 * 60;
  const timezoneUnknown = candidate.source === "exif" && !validExifOffset;
  return {
    localDate,
    source: candidate.source,
    offsetMinutes: candidate.source === "exif" && validExifOffset ? candidate.offsetMinutes : null,
    estimated,
    timezoneUnknown
  };
}

function getEvents(photo) {
  const values = photo?.photoAnnotations?.eventTags ?? photo?.eventTags ?? [];
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values.flatMap(value => {
    if (typeof value !== "string") return [];
    const label = value.trim().replace(/\s+/g, " ");
    const key = label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ key, label }];
  });
}

function compareEntries(first, second) {
  const firstDate = first.dateInfo?.localDate ?? "";
  const secondDate = second.dateInfo?.localDate ?? "";
  if (firstDate !== secondDate) return firstDate > secondDate ? -1 : 1;
  const firstId = String(first.result.photo?.id ?? "");
  const secondId = String(second.result.photo?.id ?? "");
  return firstId === secondId ? 0 : firstId < secondId ? -1 : 1;
}

function monthLabel(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  const date = new Date(0);
  date.setFullYear(Number(yearText), Number(monthText) - 1, 15);
  date.setHours(12, 0, 0, 0);
  const month = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(date);
  return `${month.charAt(0).toLocaleUpperCase("fr-FR")}${month.slice(1)} ${yearText}`;
}

function dayLabel(dayKey) {
  const [yearText, monthText, dayText] = dayKey.split("-");
  const date = new Date(0);
  date.setFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  date.setHours(12, 0, 0, 0);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function createDateGroups(entries, grouping) {
  const groups = new Map();
  for (const entry of entries) {
    const date = entry.dateInfo?.localDate ?? null;
    const key = date ? (grouping === "month" ? date.slice(0, 7) : date) : "undated";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        kind: date ? grouping : "undated",
        label: date ? (grouping === "month" ? monthLabel(key) : dayLabel(key)) : "Date de prise de vue indisponible",
        entries: []
      });
    }
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()].sort((first, second) => {
    if (first.kind === "undated") return second.kind === "undated" ? 0 : 1;
    if (second.kind === "undated") return -1;
    return first.key === second.key ? 0 : first.key > second.key ? -1 : 1;
  });
}

export function groupPhotosForTimeline(results, grouping = "day") {
  if (!Array.isArray(results)) throw new TypeError("Les résultats de la timeline doivent être une liste.");
  if (!["day", "month", "event"].includes(grouping)) {
    throw new TypeError("Le regroupement de la timeline doit être day, month ou event.");
  }

  const entries = results.map(result => ({
    result,
    dateInfo: getPhotoTimelineDateInfo(result?.photo)
  })).sort(compareEntries);

  if (grouping !== "event") return createDateGroups(entries, grouping);

  const events = new Map();
  for (const entry of entries) {
    const photoEvents = getEvents(entry.result.photo);
    const event = photoEvents.sort((first, second) => first.label.localeCompare(second.label, "fr"))[0]
      ?? { key: "no-event", label: "Sans événement associé" };
    if (!events.has(event.key)) events.set(event.key, { key: event.key, kind: "event", label: event.label, entries: [] });
    events.get(event.key).entries.push(entry);
  }
  return [...events.values()].sort((first, second) => {
    const firstDate = first.entries[0]?.dateInfo?.localDate ?? "";
    const secondDate = second.entries[0]?.dateInfo?.localDate ?? "";
    if (firstDate !== secondDate) return firstDate > secondDate ? -1 : 1;
    return first.label.localeCompare(second.label, "fr");
  });
}

export function getTimelineDateLabel(dateInfo) {
  if (!dateInfo) return "Date de prise de vue indisponible";
  if (dateInfo.estimated) return `Date estimée · ${dateInfo.localDate}`;
  if (dateInfo.timezoneUnknown) return `Date EXIF · fuseau inconnu · ${dateInfo.localDate}`;
  if (dateInfo.source === "user") return `Date locale saisie manuellement · ${dateInfo.localDate}`;
  if (dateInfo.source === "exif") return `Date EXIF · ${dateInfo.localDate}`;
  return `Date de prise de vue · ${dateInfo.localDate}`;
}
