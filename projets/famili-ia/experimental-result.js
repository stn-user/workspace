const provenanceLabels = {
  provider: "métadonnée de la source",
  extracted: "contenu extrait",
  "user-input": "saisie ou correction",
  "auto-estimate": "estimation automatique"
};

const dateLabels = {
  creation: "Création",
  modification: "Modification",
  priseDeVue: "Prise de vue",
  achat: "Achat",
  echeance: "Échéance"
};

function describeValue(entry) {
  const provenance = provenanceLabels[entry.source] || "provenance inconnue";
  return `${entry.value} (${provenance}${entry.estimated ? ", estimation non confirmée" : ""})`;
}

export function describeExperimentalResult(match, record, document, sourceAccess) {
  if (!match || !record || match.sourceId !== record.sourceId || match.itemId !== record.itemId) {
    throw new TypeError("Résultat et fiche incompatibles");
  }
  const details = [];
  details.push(`Type : ${typeof document?.type === "string" && document.type.trim() ? document.type : "inconnu"}`);
  const sourceName = match.sourceId === "drive" ? "Google Drive" : match.sourceId === "onedrive" ? "OneDrive" : "Local";
  details.push(`Source : ${sourceName}`);
  details.push(`Emplacement enregistré : ${typeof document?.sourceDir === "string" && document.sourceDir.trim() ? document.sourceDir : "non disponible"}`);

  const dates = Object.entries(record.dates);
  const photoDate = isPhotoDocument(document) ? getPhotoTimelineDateInfo(document) : null;
  if (dates.length) {
    for (const [key, value] of dates) {
      details.push(`${dateLabels[key]} : ${describeValue(value)}`);
      if (value.proof) details.push(`Preuve : « ${value.proof.excerpt} »${value.proof.location ? ` (${value.proof.location})` : ""}`);
    }
  } else if (typeof document?.date === "string" && document.date.trim() &&
      !["Date inconnue", "Session locale", "Scan proactif"].includes(document.date)) {
    details.push(`${match.sourceId === "drive" || match.sourceId === "onedrive" ? `Modification selon ${sourceName}` : "Date enregistrée (nature inconnue)"} : ${document.date}`);
  } else if (!photoDate) {
    details.push("Date : non disponible");
  }
  if (photoDate && !record.dates.priseDeVue) {
    details.push(`Prise de vue : ${getTimelineDateLabel(photoDate)}`);
  }

  details.push(`Couverture : ${match.coverage === "partial" ? "texte partiellement recherché" : "métadonnées uniquement"}`);
  details.push(sourceAccess || "Accès actuel à l'original inconnu.");
  details.push(match.sourceId === "drive" || match.sourceId === "onedrive"
    ? `Original : recherchez ce fichier par son nom dans ${sourceName} ; son accès n'a pas été vérifié.`
    : "Original : recherchez ce fichier sur l'appareil à l'emplacement indiqué s'il est disponible ; son accès n'a pas été vérifié.");
  const reasons = match.reasons.map(reason => {
    const label = reason.location === "content" ? "Texte extrait"
      : reason.location === "name" ? "Nom"
        : reason.location.startsWith("date.") ? `Date ${dateLabels[reason.location.slice(5)] || reason.location.slice(5)}`
          : reason.location.startsWith("field.") ? `Champ ${reason.location.slice(6)}` : "Correspondance";
    const evidence = reason.proof && reason.proof.excerpt !== reason.value
      ? ` ; preuve : « ${reason.proof.excerpt} »` : "";
    const location = reason.proof?.location ? ` (${reason.proof.location})` : "";
    return `${label} : « ${reason.value} » — ${provenanceLabels[reason.source] || "provenance inconnue"}${reason.estimated ? ", estimation non confirmée" : ""}${evidence}${location}`;
  });
  return {
    name: match.name || "Nom inconnu",
    details,
    reasons,
    canViewCopy: typeof document?.content === "string" && Boolean(document.content.trim())
  };
}
import { isPhotoDocument } from "./photo-annotations.js";
import { getPhotoTimelineDateInfo, getTimelineDateLabel } from "./photo-timeline.js";
