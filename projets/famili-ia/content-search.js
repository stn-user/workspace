import { normalizeText } from "./search-utils.js";

/**
 * Trouve un extrait contenant les mots recherchés
 */
function findExcerpt(text, words) {
  const lines = text.split(/[\r\n]+/);
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (words.every(w => normalized.includes(w))) {
      return line.trim().substring(0, 200);
    }
  }
  return text.length > 200 ? text.substring(0, 200) + "..." : text;
}

/**
 * Vérifie si un document a un texte exploitable valide
 * (pas un message d'erreur ou donnée fictive)
 */
function hasValidText(doc, field) {
  if (!doc[field] || typeof doc[field] !== "string" || !doc[field].trim()) {
    return false;
  }
  const text = normalizeText(doc[field]);
  // Exclure les messages d'erreur et données fictives
  const errorPatterns = [
    /^erreur$/i,
    /impossible de/i,
    /non trouve/i,
    /aucun texte/i,
    /^vide$/i,
    /erreur de lecture/i,
    /erreur de chargement/i,
    /echec/i,
    /echec de/i,
    /non disponible/i,
    /fichier supprime/i
  ];
  if (errorPatterns.some(pattern => pattern.test(doc[field]))) {
    return false;
  }
  // Ignorer les messages très courts qui ressemblent à des erreurs
  if (doc[field].length < 30 && /erreur|impossible|vide/i.test(doc[field])) {
    return false;
  }
  return true;
}

/**
 * Recherche dans un document avec texte extrait disponible
 * Retourne les correspondances avec leurs raisons
 */
export function searchContent(doc, query) {
  if (typeof query !== "string" || !query.trim()) {
    throw new TypeError("Requete invalide");
  }
  
  const normalized = normalizeText(query);
  if (!normalized) {
    throw new TypeError("Requete vide apres normalisation");
  }
  
  const words = [...new Set(normalized.split(" "))];
  const results = [];
  
  // Rechercher dans le nom
  if (doc.name && typeof doc.name === "string") {
    const nameText = normalizeText(doc.name);
    const matchedWords = words.filter(w => nameText.includes(w));
    if (matchedWords.length === words.length) {
      results.push({
        sourceId: doc.sourceId,
        itemId: doc.itemId,
        name: doc.name,
        location: "name",
        excerpt: doc.name,
        source: doc.source || "provider",
        matchedWords
      });
    }
  }
  
  // Rechercher dans le contenu (si disponible et valide)
  if (hasValidText(doc, "content")) {
    const contentText = normalizeText(doc.content);
    const matchedWords = words.filter(w => contentText.includes(w));
    if (matchedWords.length === words.length && matchedWords.length > 0) {
      results.push({
        sourceId: doc.sourceId,
        itemId: doc.itemId,
        name: doc.name,
        location: "content",
        excerpt: findExcerpt(doc.content, words),
        source: "extracted",
        matchedWords
      });
    }
  }
  
  // Rechercher dans le summary (si disponible)
  if (hasValidText(doc, "summary")) {
    const summaryText = normalizeText(doc.summary);
    const matchedWords = words.filter(w => summaryText.includes(w));
    if (matchedWords.length === words.length && matchedWords.length > 0) {
      results.push({
        sourceId: doc.sourceId,
        itemId: doc.itemId,
        name: doc.name,
        location: "summary",
        excerpt: findExcerpt(doc.summary, words),
        source: doc.summarySource || "extracted",
        matchedWords
      });
    }
  }
  
  return results;
}

/**
 * Recherche dans un tableau de documents
 */
export function searchContentInDocuments(documents, query) {
  if (!Array.isArray(documents)) {
    throw new TypeError("Documents doit etre un tableau");
  }
  
  const allResults = [];
  const seen = new Set();
  
  for (const doc of documents) {
    try {
      const results = searchContent(doc, query);
      for (const result of results) {
        const key = `${result.sourceId}|${result.itemId}|${result.location}`;
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(result);
        }
      }
    } catch (e) {
      // Ignorer les documents invalides
    }
  }
  
  return allResults;
}
