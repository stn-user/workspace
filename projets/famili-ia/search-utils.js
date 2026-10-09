const intentTerms = {
  amount: new Set(["combien", "cout", "coute", "couter", "paye", "payer", "prix", "montant", "tarif", "somme", "valeur"]),
  date: new Set(["quand", "date", "echeance", "expire", "expiration", "fin", "jusqu", "termine", "commence", "debut"]),
  duration: new Set(["duree", "longtemps", "annee", "annees", "an", "ans"]),
  frequency: new Set(["frequence", "souvent", "periodicite"]),
  identifier: new Set(["numero", "reference", "identifiant", "ref"])
};

const stopWords = new Set([
  "a", "ai", "au", "aux", "avec", "ce", "combien", "comment", "dans", "de", "des", "du", "elle",
  "en", "est", "et", "la", "le", "les", "ma", "mes", "mon", "ou", "par", "pour", "que", "quel",
  "quelle", "quand", "qui", "quoi", "se", "son", "sur", "un", "une", "vos", "votre", "y", "a-t-il"
]);

const factLabels = {
  amount: ["montant total", "total a payer", "montant", "prix", "cout", "tarif", "somme", "total"],
  date: ["fin de garantie", "date de fin", "date d echeance", "echeance", "date d achat", "date d effet", "date de debut", "date", "expiration"],
  duration: ["duree de garantie", "duree", "periode de garantie"],
  frequency: ["frequence", "periodicite", "tous les", "toutes les", "chaque"],
  identifier: ["numero de facture", "numero", "reference", "identifiant", "ref"]
};

export function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function detectQuestionIntent(question) {
  const normalized = normalizeText(question);
  if (/\b(combien\s+(?:(?:de|d)\s+)?(?:temps|annees?|ans?|mois|jours?|semaines?)|duree|longtemps)\b/.test(normalized)) return "duration";
  if (/\b(frequence|souvent|periodicite)\b/.test(normalized)) return "frequency";
  if (/\b(numero|reference|identifiant|ref)\b/.test(normalized)) return "identifier";
  if (/\b(combien|cout|paye|prix|montant|tarif|somme|valeur)\b/.test(normalized)) return "amount";
  if (/\b(quand|date|echeance|expire|expiration|fin|jusqu|termine|commence|debut)\b/.test(normalized)) return "date";
  return null;
}

export function getQuestionTerms(question) {
  return [...new Set(normalizeText(question).split(/\s+/).filter((term) => (
    term.length > 1 && !stopWords.has(term)
  )))];
}

export function getIntentKeywords(intent) {
  return [...(intentTerms[intent] ?? [])];
}

function getContextTerms(question, intent) {
  const intentWords = intentTerms[intent] ?? new Set();
  return [...new Set(normalizeText(question).split(/\s+/).filter((term) => (
    term.length > 1 && !stopWords.has(term) && !intentWords.has(term)
  )))];
}

function getLabelPriority(line, labels) {
  const normalizedLine = normalizeText(line);
  return labels.findIndex((label) => normalizedLine.includes(label));
}

export function extractExactFact(question, lines) {
  const intent = detectQuestionIntent(question);
  if (!intent) return null;

  const labels = factLabels[intent];
  const contextTerms = getContextTerms(question, intent);

  return lines
    .map((line) => {
      const labelPriority = getLabelPriority(line, labels);
      if (labelPriority < 0) return null;

      const normalizedLine = normalizeText(line);
      const contextMatches = contextTerms.filter((term) => normalizedLine.includes(term)).length;
      const hasValue = intent === "amount"
        ? /\d/.test(line) && /€|eur|euro|usd|\$|gbp|£/i.test(line)
        : intent === "date"
          ? /\b\d{1,2}\s+[a-zA-ZÀ-ÿ]+\s+\d{4}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/.test(line)
          : intent === "duration"
            ? /\d/.test(line) && /\b(an|ans|mois|jour|jours|semaine|semaines)\b/i.test(line)
            : intent === "frequency"
              ? /\b(tous|toutes|chaque)\b/i.test(line)
              : /[a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9./_-]*/.test(line.replace(/^[^:]+:\s*/, ""));

      if (!hasValue) return null;
      return { line, labelPriority, contextMatches };
    })
    .filter(Boolean)
    .sort((a, b) => b.contextMatches - a.contextMatches || a.labelPriority - b.labelPriority || a.line.length - b.line.length)[0]
    ?.line ?? null;
}
