const MONTHS = new Map([
  ["janvier", 1],
  ["fevrier", 2],
  ["mars", 3],
  ["avril", 4],
  ["mai", 5],
  ["juin", 6],
  ["juillet", 7],
  ["aout", 8],
  ["septembre", 9],
  ["octobre", 10],
  ["novembre", 11],
  ["decembre", 12]
]);

const SEASONS = new Map([
  ["printemps", { startMonth: 3, endMonth: 6 }],
  ["ete", { startMonth: 6, endMonth: 9 }],
  ["automne", { startMonth: 9, endMonth: 12 }],
  ["hiver", { startMonth: 12, endMonth: 3 }]
]);

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(text, phrase) {
  return phrase !== "" && new RegExp(`(?:^| )${escapeRegExp(phrase)}(?: |$)`).test(text);
}

function isValidDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function dateString(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

function addYears(value, years) {
  const date = parseDate(value);
  if (!date) return null;
  const targetYear = date.year + years;
  if (targetYear > 9999) return null;
  const leapDayClamped = date.month === 2 && date.day === 29
    && !isValidDate(targetYear, date.month, date.day);
  return dateString(targetYear, date.month, leapDayClamped ? 28 : date.day);
}

function getMemberMatches(text, members) {
  const matches = [];
  for (const member of members) {
    if (typeof member?.id !== "string" || typeof member?.displayName !== "string") continue;
    const name = normalizeText(member.displayName);
    if (containsPhrase(text, name)) matches.push(member);
  }
  return matches;
}

function catalogMatches(text, catalog, getAliases) {
  const matches = [];
  for (const entry of catalog) {
    const aliases = getAliases(entry)
      .filter(alias => typeof alias === "string")
      .map(normalizeText)
      .filter(Boolean);
    if (aliases.some(alias => containsPhrase(text, alias))) matches.push(entry);
  }
  return matches;
}

function getDateBasis(text) {
  return /\b(?:importe|importee|importes|importees|ajoute|ajoutee|ajoutes|ajoutees|telecharge|telechargee|telecharges|telechargees)\b/.test(text)
    ? "import"
    : "capture";
}

function getExplanation(filter, phrase, reason) {
  return { filter, phrase, reason };
}

function clarification(filters, explanations, reason) {
  return { status: "clarification", filters, explanations, clarificationReason: reason };
}

export function interpretMomentsLifeQuery(query, {
  members = [],
  places = [],
  events = []
} = {}) {
  if (typeof query !== "string" || query.trim() === "") {
    return clarification({}, [], "empty-query");
  }

  const text = normalizeText(query);
  const filters = {};
  const explanations = [];
  let clarificationReason = null;
  const matchedMembers = getMemberMatches(text, members);
  const ageMatch = /\b(?:quand (?:il|elle) avait|avait|avait alors|a ses)\s+(\d{1,2})\s+ans?\b/.exec(text);

  if (matchedMembers.length > 1) {
    return clarification({}, [], "person-ambiguous");
  }
  const member = matchedMembers[0] ?? null;
  if (member) {
    filters.personId = member.id;
    explanations.push(getExplanation("personId", member.displayName, "explicit-member-name"));
  }

  const birthDateMatch = /\b(?:ne(?:e|s|es)? le|date de naissance(?:(?: de| d) [a-z0-9]+){0,3}(?: est)?(?: le)?) (\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) (\d{4})\b/.exec(text);
  const birthYearMatch = /\b(?:ne(?:e|s|es)? en|date de naissance(?:(?: de| d) [a-z0-9]+){0,3}(?: est)? en) (\d{4})\b/.exec(text);
  if (birthDateMatch) {
    if (!member) {
      clarificationReason = "person-required";
    } else {
      const [, dayText, monthName, yearText] = birthDateMatch;
      const birthDate = dateString(Number(yearText), MONTHS.get(monthName), Number(dayText));
      if (!isValidDate(Number(yearText), MONTHS.get(monthName), Number(dayText))) {
        clarificationReason = "invalid-birth-date";
      } else {
        filters.memberBirthDate = birthDate;
        explanations.push(getExplanation("memberBirthDate", birthDateMatch[0], "explicit-birth-date"));
      }
    }
  }
  if (birthYearMatch) {
    if (!member) {
      clarificationReason = clarificationReason ?? "person-required";
    } else {
      filters.memberBirthYear = Number(birthYearMatch[1]);
      explanations.push(getExplanation("memberBirthYear", birthYearMatch[0], "explicit-birth-year"));
    }
  }

  if (ageMatch) {
    const ageYears = Number(ageMatch[1]);
    if (!member) {
      clarificationReason = clarificationReason ?? "person-required";
    } else if (typeof member.birthDate !== "string" || !parseDate(member.birthDate)) {
      clarificationReason = clarificationReason ?? "birth-date-required";
    } else {
      const start = addYears(member.birthDate, ageYears);
      const endExclusive = addYears(member.birthDate, ageYears + 1);
      if (!start || !endExclusive) {
        clarificationReason = clarificationReason ?? "age-out-of-range";
      } else {
        filters.ageYears = ageYears;
        filters.captureDateStart = start;
        filters.captureDateEndExclusive = endExclusive;
        explanations.push(getExplanation("ageYears", ageMatch[0], "explicit-age"));
        explanations.push(getExplanation("captureDateStart", member.birthDate, "birth-date-anniversary-range"));
        explanations.push(getExplanation("captureDateEndExclusive", member.birthDate, "birth-date-anniversary-range"));
      }
    }
  }

  const dateBasis = getDateBasis(text);
  const fullDateMatch = birthDateMatch ? null
    : /\b(\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) (\d{4})\b/.exec(text);
  const partialDateMatch = fullDateMatch || birthDateMatch ? null
    : /\b(\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.exec(text);
  const seasonEntries = [...SEASONS.entries()].filter(([season]) => containsPhrase(text, season));
  const textWithoutBirthDate = birthDateMatch
    ? text.replace(birthDateMatch[0], "")
    : birthYearMatch ? text.replace(birthYearMatch[0], "") : text;
  const explicitYear = /\b(\d{4})\b/.exec(textWithoutBirthDate)?.[1];

  if (fullDateMatch) {
    const [, dayText, monthName, yearText] = fullDateMatch;
    const year = Number(yearText);
    const month = MONTHS.get(monthName);
    const day = Number(dayText);
    if (!isValidDate(year, month, day)) {
      clarificationReason = clarificationReason ?? "invalid-date";
    } else {
      const filter = dateBasis === "import" ? "importLocalDate" : "captureLocalDate";
      filters[filter] = dateString(year, month, day);
      explanations.push(getExplanation(filter, fullDateMatch[0], dateBasis === "import"
        ? "explicit-import-date"
        : "explicit-capture-date"));
    }
  } else if (partialDateMatch) {
    clarificationReason = clarificationReason ?? "year-required";
  } else if (seasonEntries.length > 1) {
    clarificationReason = clarificationReason ?? "season-ambiguous";
  } else if (seasonEntries.length === 1) {
    if (!explicitYear) {
      clarificationReason = clarificationReason ?? "year-required";
    } else {
      const [season, range] = seasonEntries[0];
      const year = Number(explicitYear);
      if (!isValidDate(year, range.startMonth, 1)
        || (range.startMonth > range.endMonth && year === 9999)) {
        clarificationReason = clarificationReason ?? "year-out-of-range";
      } else if (range.startMonth > range.endMonth) {
        filters.captureDateStart = dateString(year, range.startMonth, 1);
        filters.captureDateEndExclusive = dateString(year + 1, range.endMonth, 1);
      } else {
        filters.captureDateStart = dateString(year, range.startMonth, 1);
        filters.captureDateEndExclusive = dateString(year, range.endMonth, 1);
      }
      explanations.push(getExplanation("captureDateStart", season, "meteorological-season"));
      explanations.push(getExplanation("captureDateEndExclusive", season, "meteorological-season"));
    }
  } else if (explicitYear) {
    const filter = dateBasis === "import" ? "importYear" : "captureYear";
    filters[filter] = Number(explicitYear);
    explanations.push(getExplanation(filter, explicitYear, dateBasis === "import"
      ? "explicit-import-year"
      : "explicit-capture-year"));
  }

  const eventMatches = catalogMatches(text, events, event => [
    event?.label,
    ...(Array.isArray(event?.aliases) ? event.aliases : [])
  ]);
  if (eventMatches.length > 1) {
    clarificationReason = clarificationReason ?? "event-ambiguous";
  } else if (eventMatches.length === 1 && typeof eventMatches[0]?.tag === "string") {
    filters.eventTag = eventMatches[0].tag;
    explanations.push(getExplanation("eventTag", eventMatches[0].label, "explicit-event-label"));
  }

  const matchedPlaces = catalogMatches(text, places, place => [place?.label])
    .filter(place => place.source === "user");
  if (matchedPlaces.length > 1) {
    clarificationReason = clarificationReason ?? "place-ambiguous";
  } else if (matchedPlaces.length === 1) {
    filters.placeLabel = matchedPlaces[0].label;
    filters.placeSource = "user";
    explanations.push(getExplanation("placeLabel", matchedPlaces[0].label, "user-entered-place"));
  } else {
    const freePlaceMatch = /(?:^|\s)(?:à|a|au|aux|dans)\s+([^.!?]+)$/iu.exec(query);
    if (freePlaceMatch) {
      const label = freePlaceMatch[1].replace(/\s+\b(?:en|du|le|import[ée]e?s?|prises?|prise|quand)\b.*$/iu, "").trim();
      if (label && !/^ses\s+\d+\s+ans?$/iu.test(label)) {
        filters.placeLabel = label;
        filters.placeSource = "user";
        explanations.push(getExplanation("placeLabel", label, "explicit-place-query"));
      }
    }
  }

  if (clarificationReason) return clarification(filters, explanations, clarificationReason);
  if (Object.keys(filters).length === 0) {
    return clarification(filters, explanations, "unsupported-query");
  }
  return { status: "ready", filters, explanations, clarificationReason: null };
}
