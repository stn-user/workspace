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
