import { formatOneDriveAccountFingerprint } from "./onedrive-account.js";

/**
 * Calcule un score de similarité sémantique entre deux documents basé sur leurs métadonnées (DocumentContext).
 * Pondération : provider (40%), type (20%), category (20%), tags (10%), date (10%).
 */
export function calculateSemanticScore(docA, docB) {
  if (!docA || !docB) return 0;
  let score = 0;

  // 1. Provider (40%)
  if (docA.provider && docB.provider && docA.provider.toLowerCase() === docB.provider.toLowerCase()) {
    score += 0.40;
  }

  // 2. Type (20%)
  if (docA.type && docB.type && docA.type === docB.type) {
    score += 0.20;
  }

  // 3. Category (20%)
  if (docA.category && docB.category && docA.category === docB.category) {
    score += 0.20;
  }

  // 4. Tags (10%)
  if (Array.isArray(docA.tags) && Array.isArray(docB.tags) && docA.tags.length > 0 && docB.tags.length > 0) {
    const commonTags = docA.tags.filter(tag => docB.tags.includes(tag));
    const tagOverlap = commonTags.length / Math.max(docA.tags.length, docB.tags.length);
    score += tagOverlap * 0.10;
  }

  // 5. Date / Proximité temporelle (10%)
  if (docA.date && docB.date) {
    const dateA = new Date(docA.date.split('/').reverse().join('-'));
    const dateB = new Date(docB.date.split('/').reverse().join('-'));
    if (!isNaN(dateA) && !isNaN(dateB)) {
      const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
      if (diffDays <= 30) {
        score += 0.10; // Moins d'un mois d'écart
      } else if (diffDays <= 365) {
        score += 0.05; // Moins d'un an d'écart
      }
    }
  }

  // 🔔 RÈGLES DE RÉBOND (Boost conditionnel)
  // Règle 1 : Facture + Garantie + Même Provider => Fort lien (garantie liée à l'achat)
  const types = [docA.type, docB.type];
  const hasFacture = types.includes('facture');
  const hasGarantie = types.includes('garantie');
  if (hasFacture && hasGarantie && docA.provider && docB.provider && docA.provider.toLowerCase() === docB.provider.toLowerCase()) {
    score += 0.15; // Bonus de 15% pour le lien facture/garantie
  }

  // Règle 2 : Correspondance de tags d'équipement (si un tag correspond à une catégorie connue)
  const equipementCategories = ['maison', 'auto', 'sante', 'finance'];
  const tagsA = new Set(docA.tags || []);
  const tagsB = new Set(docB.tags || []);
  for (const cat of equipementCategories) {
    if (tagsA.has(cat) && tagsB.has(cat)) {
      score += 0.05; // Petit boost si même catégorie d'équipement
      break; // Éviter les doublons si plusieurs tags coïncident
    }
  }

  return score;
}

const intentTerms = {
  amount: new Set(["combien", "cout", "coute", "couter", "paye", "payer", "prix", "montant", "tarif", "somme", "valeur"]),
  date: new Set(["quand", "date", "echeance", "expire", "expiration", "fin", "jusqu", "termine", "commence", "debut"]),
  duration: new Set(["duree", "longtemps", "annee", "annees", "an", "ans"]),
  frequency: new Set(["frequence", "souvent", "periodicite"]),
  identifier: new Set(["numero", "reference", "identifiant", "ref"])
};

const stopWords = new Set([
  "a", "ai", "au", "aux", "avec", "ce", "combien", "comment", "dans", "de", "des", "du", "elle",
  "en", "est", "et", "je", "la", "le", "les", "ma", "mes", "mon", "ou", "par", "pour", "que", "quel",
  "quelle", "quand", "qui", "quoi", "se", "son", "sur", "un", "une", "vos", "votre", "y", "a-t-il"
]);

const genericSearchTerms = new Set([
  "achat", "achats", "cout", "coute", "document", "documents", "facture", "factures", "fichier", "fichiers",
  "montant", "payer", "paiement", "pdf", "prix", "total"
]);

const localSynonyms = new Map([
  ["bassin", ["piscine"]],
  ["piscine", ["bassin"]],
  ["cout", ["prix", "montant", "tarif"]],
  ["prix", ["cout", "montant", "tarif"]],
  ["montant", ["prix", "cout", "tarif"]],
  ["tarif", ["prix", "cout", "montant"]],
  ["pompe", ["moteur"]],
  ["moteur", ["pompe"]],
  ["garantie", ["couverture"]],
  ["couverture", ["garantie"]],
  ["entretien", ["maintenance", "revision"]],
  ["maintenance", ["entretien", "revision"]],
  ["revision", ["entretien", "maintenance"]],
  ["renouvellement", ["reconduction"]],
  ["reconduction", ["renouvellement"]],
  ["rincer", ["rincage"]],
  ["rincage", ["rincer"]]
]);

const documentTypeTerms = new Set([
  "assurance", "contrat", "facture", "garantie", "notice", "entretien", "maintenance", "document"
]);

const factLabels = {
  amount: ["montant total", "total a payer", "montant", "prix", "cout", "tarif", "somme", "total"],
  date: ["fin de garantie", "date de fin", "date d echeance", "echeance", "date d achat", "date d effet", "date de debut", "expiration"],
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

function isCloseTermMatch(queryTerm, documentTerms) {
  if (documentTerms.some((term) => term === queryTerm || term.startsWith(queryTerm) || queryTerm.startsWith(term))) {
    return true;
  }

  if (queryTerm.length < 6) return false;
  const maxDistance = queryTerm.length >= 9 ? 2 : 1;

  return documentTerms.some((term) => {
    if (Math.abs(term.length - queryTerm.length) > maxDistance) return false;

    let previousRow = Array.from({ length: term.length + 1 }, (_, index) => index);
    for (let queryIndex = 1; queryIndex <= queryTerm.length; queryIndex += 1) {
      const currentRow = [queryIndex];
      for (let termIndex = 1; termIndex <= term.length; termIndex += 1) {
        currentRow[termIndex] = Math.min(
          currentRow[termIndex - 1] + 1,
          previousRow[termIndex] + 1,
          previousRow[termIndex - 1] + Number(queryTerm[queryIndex - 1] !== term[termIndex - 1])
        );
      }
      previousRow = currentRow;
    }
    return previousRow[term.length] <= maxDistance;
  });
}

export function getSearchMatch(question, searchableText, hasUploadedDocuments = false, refDoc = null) {
  const terms = getQuestionTerms(question);
  if (terms.length === 0) return { matchedTerms: [], score: 0 };

  const documentTerms = [...new Set(normalizeText(searchableText).split(/\s+/))];
  const matchedTerms = terms.filter((term) => isCloseTermMatch(term, documentTerms));
  const specificTerms = terms.filter((term) => !genericSearchTerms.has(term));

  // Si des termes spécifiques sont demandés et qu'aucun ne matche, abandonner
  if (!hasUploadedDocuments && specificTerms.length > 0 && specificTerms.some((term) => !matchedTerms.includes(term))) {
    return { matchedTerms: [], score: 0 };
  }

  // Calcul du score textuel de base
  const baseScore = matchedTerms.length / Math.max(1, terms.length);
  const adjustedThreshold = hasUploadedDocuments ? 0.3 : 0.6;
  let finalScore = baseScore >= adjustedThreshold ? baseScore : 0;

  // 2. Ajout du score sémantique si un document de référence est fourni
  if (refDoc && finalScore > 0) {
    const semScore = calculateSemanticScore(refDoc, { rawText: searchableText, ...(refDoc || {}) });
    // On hybride : on prend le meilleur des deux scores, avec un léger favoritisme du matching textuel pur
    // Formule : 70% du score textuel + 30% du score sémantique (si sémantique fort)
    if (semScore > 0.2) {
      finalScore = (finalScore * 0.7) + (semScore * 0.3);
    }
  }

  return { matchedTerms, score: finalScore };
}

function getExpandedTerms(term) {
  return [term, ...(localSynonyms.get(term) ?? [])];
}

function getEvidenceExcerpt(question, lines) {
  const intent = detectQuestionIntent(question);
  const terms = getQuestionTerms(question)
    .filter(term => !genericSearchTerms.has(term) && !Object.values(intentTerms).some(words => words.has(term)));
  return lines
    .map(line => ({
      line,
      matches: terms.reduce((count, term) => count + Number(
        getExpandedTerms(term).some(expanded => normalizeText(line).split(/\s+/).includes(expanded))
      ), 0),
      labelPriority: intent ? getLabelPriority(line, factLabels[intent]) : -1
    }))
    .filter(({ matches, labelPriority }) => matches > 0 || labelPriority >= 0)
    .sort((left, right) => (
      Number(right.labelPriority >= 0) - Number(left.labelPriority >= 0)
      || left.labelPriority - right.labelPriority
      || right.matches - left.matches
      || left.line.length - right.line.length
    ))[0]
    ?.line ?? null;
}

function getProvenance(document) {
  if (document.oneDriveSource) {
    return `OneDrive · copie enregistrée localement · compte d'origine ${formatOneDriveAccountFingerprint(document.oneDriveAccountFingerprint)}`;
  }
  if (document.driveSource) return "Google Drive · copie temporaire locale";
  if (document.driveDemo) return "Sélection Drive simulée · document fictif";
  if (document.isLocal) return document.sourceDir ? "Stockage local" : "Fichier local";
  return "Démonstration · document fictif";
}

function getMetadataTokens(document) {
  const metadata = [
    document.name,
    document.type,
    document.category,
    document.provider,
    document.keywords,
    ...(Array.isArray(document.tags) ? document.tags : [])
  ].filter(Boolean).join(" ");
  return new Set(normalizeText(metadata).split(/\s+/).filter(Boolean));
}

function getContentTokens(document) {
  return new Set(normalizeText(document.content || "").split(/\s+/).filter(Boolean));
}

function getSearchConfidence(score, exactFact, ambiguous) {
  if (ambiguous) return "incertain";
  if (score >= 0.72 && exactFact) return "élevé";
  if (score >= 0.55) return "moyen";
  return "faible";
}

/**
 * Ranks documents locally using explicit metadata, lexical matches, and a small
 * auditable French synonym map. It abstains unless the query names a subject.
 */
export function rankDocuments(question, documents, { limit = 3, strategy = "hybrid" } = {}) {
  const intent = detectQuestionIntent(question);
  const queryTerms = getQuestionTerms(question);
  const intentWords = intentTerms[intent] ?? new Set();
  const subjectTerms = queryTerms.filter(term => (
    !genericSearchTerms.has(term)
    && !documentTypeTerms.has(term)
    && !intentWords.has(term)
  ));
  if (subjectTerms.length === 0) return [];

  const ranked = documents.map(document => {
    const lines = String(document.content || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const metadataTokens = getMetadataTokens(document);
    const contentTokens = getContentTokens(document);
    const equivalentsFor = term => strategy === "hybrid" ? getExpandedTerms(term) : [term];
    const matchedTerms = subjectTerms.filter(term => {
      const equivalents = equivalentsFor(term);
      return [...metadataTokens, ...contentTokens].some(candidate => (
        equivalents.some(equivalent => isCloseTermMatch(equivalent, [candidate]))
      ));
    });
    if (matchedTerms.length !== subjectTerms.length) return null;

    const metadataCoverage = matchedTerms.filter(term => (
      equivalentsFor(term).some(equivalent => [...metadataTokens].some(candidate => isCloseTermMatch(equivalent, [candidate])))
    )).length / subjectTerms.length;
    const contentCoverage = matchedTerms.length / subjectTerms.length;
    const typeCoverage = queryTerms.some(term => documentTypeTerms.has(term) && metadataTokens.has(term)) ? 0.1 : 0;
    const exactFact = lines.length > 0 ? extractExactFact(question, lines) : null;
    const evidence = exactFact || getEvidenceExcerpt(question, lines);
    const type = normalizeText(document.type || "");
    const intentTypeGroups = {
      amount: ["facture", "contrat"],
      date: ["garantie", "assurance", "contrat", "facture", "entretien"],
      duration: ["garantie", "notice", "contrat"],
      frequency: ["notice", "entretien"],
      identifier: ["facture", "contrat"]
    };
    const compatibleTypes = intentTypeGroups[intent] || [];
    const typePrior = compatibleTypes.includes(type) ? 0.1 : 0;
    const baseScore = (metadataCoverage * 0.55) + (contentCoverage * 0.35) + typeCoverage + typePrior + (exactFact ? 0.1 : 0);
    const strategyScore = strategy === "lexical"
      ? matchedTerms.length / subjectTerms.length
      : strategy === "metadata"
        ? (metadataCoverage * 0.55) + (contentCoverage * 0.35) + typeCoverage + (exactFact ? 0.1 : 0)
        : baseScore;
    const score = Math.min(1, compatibleTypes.length > 0 && !compatibleTypes.includes(type) ? strategyScore * 0.5 : strategyScore);
    return {
      document,
      score,
      matchedTerms,
      exactFact,
      evidence,
      provenance: getProvenance(document),
      intent
    };
  }).filter(result => result && result.score >= 0.5).sort((left, right) => (
    right.score - left.score
    || right.matchedTerms.length - left.matchedTerms.length
    || String(left.document.name).localeCompare(String(right.document.name), "fr")
  ));

  const ambiguousFacts = new Set();
  const displayedResults = ranked.slice(0, limit);
  for (let left = 0; left < displayedResults.length; left += 1) {
    if (!displayedResults[left].exactFact) continue;
    for (let right = left + 1; right < displayedResults.length; right += 1) {
      if (
        displayedResults[right].exactFact
        && displayedResults[left].exactFact !== displayedResults[right].exactFact
        && Math.abs(displayedResults[left].score - displayedResults[right].score) < 0.08
      ) {
        ambiguousFacts.add(displayedResults[left].document.id);
        ambiguousFacts.add(displayedResults[right].document.id);
      }
    }
  }
  return ranked.slice(0, limit).map((result, index) => ({
    ...result,
    ambiguous: ambiguousFacts.has(result.document.id),
    confidence: getSearchConfidence(result.score, result.exactFact, ambiguousFacts.has(result.document.id)),
    answerStatus: ambiguousFacts.has(result.document.id)
      ? "ambiguous"
      : intent && !result.exactFact
        ? "fact-not-found"
        : "supported"
  }));
}

export function buildSearchResponse(results) {
  if (results.length === 0) {
    return {
      status: "not-found",
      label: "AUCUNE SOURCE CORRESPONDANTE",
      answer: "Je n'ai pas trouvé de document correspondant. Essayez de préciser l'équipement, le contrat ou le sujet recherché."
    };
  }

  const best = results[0];
  const ambiguousResults = results.filter(result => result.ambiguous);
  if (ambiguousResults.length > 1) {
    const sources = ambiguousResults
      .slice(0, 2)
      .map(result => `« ${result.document.name} »`)
      .join(" et ");
    return {
      status: "ambiguous",
      label: "PLUSIEURS SOURCES — VÉRIFICATION NÉCESSAIRE",
      answer: `Plusieurs documents contiennent des informations différentes pour cette question (${sources}). Je ne peux pas retenir une réponse unique sans vérification.`
    };
  }

  if (best.answerStatus === "fact-not-found") {
    const evidence = best.evidence ? ` L'extrait rapproché est : « ${best.evidence} ».` : "";
    return {
      status: "fact-not-found",
      label: "INFORMATION NON CONFIRMÉE",
      answer: `Je n'ai pas trouvé de preuve suffisante pour répondre à cette question dans « ${best.document.name} ». Consultez la source avant de conclure.${evidence}`
    };
  }

  if (best.exactFact) {
    return {
      status: "supported",
      label: "RÉPONSE APPUYÉE PAR UN EXTRAIT",
      answer: `Dans « ${best.document.name} », ${best.exactFact}`
    };
  }

  return {
    status: "excerpt",
    label: "EXTRAIT PERTINENT — À VÉRIFIER DANS LE DOCUMENT",
    answer: best.evidence
      ? `Dans « ${best.document.name} », l'extrait correspondant est : « ${best.evidence} ».`
      : `« ${best.document.name} » correspond au sujet recherché, mais aucun extrait textuel vérifiable n'est disponible.`
  };
}

export function evaluateSearchCorpus(cases, documents, { limit = 3, strategy = "hybrid" } = {}) {
  const startedAt = performance.now();
  let retrievedRelevant = 0;
  let relevantResults = 0;
  let totalRelevant = 0;
  let reciprocalRankTotal = 0;
  let factualAnswersCorrect = 0;
  let correctAbstentions = 0;
  let abstentionCases = 0;
  let unsupportedAnswers = 0;
  let sourcedResults = 0;
  let resultCount = 0;

  for (const searchCase of cases) {
    const results = rankDocuments(searchCase.query, documents, { limit, strategy });
    const expectedIds = new Set(searchCase.expectedIds);
    totalRelevant += expectedIds.size;
    const relevantRank = results.findIndex(result => expectedIds.has(result.document.id));
    if (relevantRank !== -1) {
      retrievedRelevant += 1;
      reciprocalRankTotal += 1 / (relevantRank + 1);
    }
    relevantResults += results.filter(result => expectedIds.has(result.document.id)).length;

    if (searchCase.expectedFact !== undefined) {
      const answer = results.find(result => expectedIds.has(result.document.id)) || results[0];
      if (searchCase.expectedFact !== null) {
        if (answer?.exactFact === searchCase.expectedFact && answer.evidence && answer.answerStatus === "supported") {
          factualAnswersCorrect += 1;
        } else {
          unsupportedAnswers += 1;
        }
      } else {
        abstentionCases += 1;
        const correctlyAbstained = searchCase.expectedStatus === "ambiguous"
          ? answer?.answerStatus === "ambiguous"
          : !answer || answer.answerStatus !== "supported";
        if (correctlyAbstained) correctAbstentions += 1;
        else unsupportedAnswers += 1;
      }
    }

    resultCount += results.length;
    sourcedResults += results.filter(result => result.evidence && result.provenance).length;
  }

  const elapsedMs = performance.now() - startedAt;
  const expectedFactCases = cases.filter(searchCase => searchCase.expectedFact !== undefined && searchCase.expectedFact !== null).length;
  return {
    precisionAtK: resultCount ? relevantResults / resultCount : 0,
    recallAtK: totalRelevant ? relevantResults / totalRelevant : 0,
    meanReciprocalRank: cases.length ? reciprocalRankTotal / cases.length : 0,
    factAccuracy: expectedFactCases ? factualAnswersCorrect / expectedFactCases : 1,
    correctAbstentionRate: abstentionCases ? correctAbstentions / abstentionCases : 1,
    unsupportedAnswerCount: unsupportedAnswers,
    sourceCoverage: resultCount ? sourcedResults / resultCount : 0,
    elapsedMs,
    averageLatencyMs: cases.length ? elapsedMs / cases.length : 0
  };
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
