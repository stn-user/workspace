import { findDeadlineCandidates } from "./index-deadline-candidates.js";
import { extractDeadlineFromText } from "./index-text-analysis.js";

export function findIndexDeadlines(session, referenceDate, daysToExamine) {
  if (!session || typeof session.getAllRecords !== "function" ||
      typeof session.getAllContentDocs !== "function") {
    throw new TypeError("Session d'index invalide");
  }
  findDeadlineCandidates([], referenceDate, daysToExamine);
  const records = session.getAllRecords();
  const documents = session.getAllContentDocs();
  const processed = [];
  const needReview = [];

  for (const record of records) {
    const doc = documents.find(entry => entry.sourceId === record.sourceId && entry.itemId === record.itemId);
    if (!doc) throw new Error("Segments de la fiche introuvables dans la session");
    if (record.dates.echeance && record.dates.echeance.source === "extracted" &&
        !record.dates.echeance.estimated && record.dates.echeance.proof) {
      processed.push(record);
      continue;
    }
    if (record.dates.echeance) {
      needReview.push({ sourceId: record.sourceId, itemId: record.itemId, name: record.name?.value ?? null,
        reason: "Échéance déjà enregistrée : aucune nouvelle proposition automatique." });
      continue;
    }
    if (!doc.segments.length) {
      needReview.push({ sourceId: record.sourceId, itemId: record.itemId, name: record.name?.value ?? null,
        reason: "Aucun texte extrait fiable disponible." });
      continue;
    }
    const result = extractDeadlineFromText(record, doc.segments.join("\n"));
    if (result.status === "ambiguous") {
      needReview.push({ sourceId: record.sourceId, itemId: record.itemId, name: record.name?.value ?? null,
        reason: "Échéance ambiguë : vérification nécessaire." });
    } else if (result.status === "invalid-date") {
      needReview.push({ sourceId: record.sourceId, itemId: record.itemId, name: record.name?.value ?? null,
        reason: "Date d'échéance invalide : vérification nécessaire." });
    } else if (result.status === "extracted" || result.status === "estimated") {
      processed.push(result.record);
    } else if (result.status === "estimate-ineligible") {
      needReview.push({ sourceId: record.sourceId, itemId: record.itemId, name: record.name?.value ?? null,
        reason: result.reason });
    }
  }

  const { candidates, ineligible } = findDeadlineCandidates(processed, referenceDate, daysToExamine, {
    includeEstimated: true
  });
  return { candidates, needReview, ineligible, outsidePeriod: processed.length - candidates.length - ineligible.length };
}
