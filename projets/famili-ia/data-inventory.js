import { formatOneDriveAccountFingerprint } from "./onedrive-account.js";

const DOCUMENT_TYPES = new Set(["facture", "garantie", "contrat", "notice"]);

export function mergeInventoryDocuments(demoDocuments, storedDocuments) {
  const documentsById = new Map(demoDocuments.map((document) => [document.id, document]));

  storedDocuments.forEach((document) => {
    documentsById.set(document.id, document);
  });

  return [...documentsById.values()];
}

export function isInventoryDocumentType(value) {
  return DOCUMENT_TYPES.has(String(value || "").trim().toLocaleLowerCase("fr"));
}

export function getInventorySource(document) {
  if (document.oneDriveSource) return "onedrive";
  if (document.driveSource) return "drive";
  if (document.driveDemo || !document.isLocal) return "demo";
  return "local";
}

export function getInventoryTypeKey(document) {
  const type = String(document.type || "").trim().toLocaleLowerCase("fr");
  const knownTypes = new Set(["facture", "garantie", "contrat", "notice", "pdf", "markdown", "image", "texte", "vidéo", "video"]);
  if (!knownTypes.has(type)) return "other";
  return type.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function getInventoryIndexStatus(document) {
  return String(document.content || "").trim() ? "text" : "metadata";
}

export function filterSearchResultsByChips(results, { type = "", source = "" } = {}) {
  const normalizedType = String(type).trim().toLocaleLowerCase("fr");
  const normalizedSource = String(source).trim().toLocaleLowerCase("fr");
  const supportedTypes = new Set(["facture", "garantie", "contrat", "notice", "pdf", "texte", "markdown", "image", "vidéo", "video"]);
  const supportedSources = new Set(["local", "drive", "onedrive", "demo"]);

  if ((normalizedType && !supportedTypes.has(normalizedType)) || (normalizedSource && !supportedSources.has(normalizedSource))) {
    return [];
  }

  return results.filter(({ document }) => {
    const documentType = String(document.type || "").trim().toLocaleLowerCase("fr");
    const matchesType = !normalizedType
      || (normalizedType === "texte" ? documentType === "texte" || documentType === "markdown" : documentType === normalizedType);
    const matchesSource = !normalizedSource || getInventorySource(document) === normalizedSource;
    return matchesType && matchesSource;
  });
}

function getDocumentKind(document) {
  const type = String(document.type || "").toLocaleLowerCase("fr");
  const name = String(document.name || document.originalName || "").toLocaleLowerCase("fr");
  if (type === "image" || /\.(jpe?g|png|gif|webp|heic)$/i.test(name)) return "images";
  if (["audio", "video", "média", "media"].includes(type) || /\.(mp3|wav|m4a|mp4|mov|avi|mkv)$/i.test(name)) return "médias";
  return "documents";
}

export function filterInventoryDocuments(documents, filters = {}) {
  const type = String(filters.type || "").trim().toLocaleLowerCase("fr");
  const category = String(filters.category || "").trim().toLocaleLowerCase("fr");

  return documents.filter((document) => {
    const documentType = String(document.type || "").trim().toLocaleLowerCase("fr");
    const documentCategory = String(document.category || document.metadata?.category || "").trim().toLocaleLowerCase("fr");
    const kind = getDocumentKind(document);

    if (type && type !== "document" && type !== "tout" && type !== documentType && type !== kind) return false;
    if (!category || category === "tout") return true;
    if (isInventoryDocumentType(category)) return documentType === category;
    if (category === "documents" || category === "images" || category === "médias") return kind === category;
    return documentCategory === category;
  });
}

export function countInventorySources(documents) {
  return documents.reduce((counts, document) => {
    counts[getInventorySource(document)] += 1;
    counts.total += 1;
    return counts;
  }, { total: 0, local: 0, drive: 0, onedrive: 0, demo: 0 });
}
