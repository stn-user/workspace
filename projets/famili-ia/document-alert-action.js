import { ALERT_CATEGORIES, getAlertLevelForDate } from "./alert-engine.js";
import { getInventoryAccountRef, getInventorySource } from "./data-inventory.js";
import { parseDocument } from "./document-parser.js";
import { findDocumentDeadlines } from "./index-deadline-search.js";

export function documentAlertSourceSnapshot(document) {
  return JSON.stringify([getInventorySource(document), getInventoryAccountRef(document),
    document.id, document.name, document.content, document.contentProvenance]);
}

export function documentAlertConfirmationSnapshot(document) {
  return JSON.stringify([document.alertType, document.expiryDate,
    document.expiryDateEvidence, document.expiryDateSource]);
}

export function matchesDocumentAlertIdentity(document, proposal) {
  return document.id === proposal.itemId && getInventorySource(document) === proposal.sourceId &&
    getInventoryAccountRef(document) === proposal.accountRef;
}

export function assertDocumentAlertSource(document, proposal) {
  if (!matchesDocumentAlertIdentity(document, proposal) ||
      documentAlertSourceSnapshot(document) !== proposal.sourceSnapshot) {
    throw new Error("Cette copie a changé ou n'est plus disponible ; vérifiez à nouveau la proposition.");
  }
}

export function prepareDocumentAlertAction(candidate, document, record, content, now = new Date()) {
  if (!document || !record || !content || !matchesDocumentAlertIdentity(document, candidate) ||
      getInventorySource(document) === "demo") {
    throw new Error("Alerte non disponible : copie persistée ou identité unique introuvable.");
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const current = findDocumentDeadlines([record], [content], today, 90).candidates
    .find(entry => entry.sourceId === candidate.sourceId && entry.accountRef === candidate.accountRef &&
      entry.itemId === candidate.itemId);
  const proofLines = candidate.proof.excerpt.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean);
  const verifiedLines = content.segments.flatMap(segment => segment.split(/\r\n|\n|\r/).map(line => line.trim()));
  if (!current || current.dueDate !== candidate.dueDate ||
      Boolean(current.estimated) !== Boolean(candidate.estimated) ||
      current.proof.excerpt !== candidate.proof.excerpt ||
      !proofLines.length || !proofLines.every(line => verifiedLines.includes(line))) {
    throw new Error("Alerte non disponible : proposition ou preuve vérifiée modifiée.");
  }
  const parsedType = parseDocument(content.segments.join("\n"), document.name || document.originalName || "").type;
  const documentType = ALERT_CATEGORIES.includes(document.alertType) ? document.alertType : parsedType;
  if (!ALERT_CATEGORIES.includes(documentType)) {
    throw new Error("Alerte non disponible : catégorie prise en charge non déterminée.");
  }
  if (!["amber", "red"].includes(getAlertLevelForDate(candidate.dueDate, documentType, now))) {
    throw new Error(`Alerte non encore admissible pour cette échéance de type ${documentType}.`);
  }
  return { ...current, documentType, sourceSnapshot: documentAlertSourceSnapshot(document),
    confirmationSnapshot: documentAlertConfirmationSnapshot(document) };
}
