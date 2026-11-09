import { createContentProvenance } from "./content-index.js";
import { hashPhotoBytes } from "./photo-metadata.js";

const textLimit = 1024 * 1024;
const pdfLimit = 10 * 1024 * 1024;

export async function oneDriveDocumentId(accountId, itemId) {
  if (typeof accountId !== "string" || !accountId || typeof itemId !== "string" || !itemId) {
    throw new TypeError("Identité OneDrive invalide.");
  }
  const hash = await hashPhotoBytes(new TextEncoder().encode(JSON.stringify([accountId, itemId])));
  return `onedrive-${hash.slice("sha256:".length)}`;
}

function downloadUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Lien de téléchargement OneDrive invalide."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password ||
      !["1drv.com", "onedrive.com", "sharepoint.com"].some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error("Lien de téléchargement OneDrive non autorisé.");
  }
  return url.href;
}

async function boundedBytes(response, limit) {
  const length = Number(response.headers.get("content-length"));
  if (length > limit) throw new Error("Fichier OneDrive au-delà de la limite de taille.");
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit) throw new Error("Fichier OneDrive au-delà de la limite de taille.");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Fichier OneDrive au-delà de la limite de taille.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function readOneDriveDocument({ item, accountId, getToken, signal, fetchImpl = fetch }) {
  const id = await oneDriveDocumentId(accountId, item.id);
  const extension = item.name.toLowerCase().split(".").pop();
  const type = extension === "pdf" ? "PDF" : extension === "txt" ? "Texte"
    : extension === "md" ? "Markdown" : "Document";
  const modified = typeof item.lastModifiedDateTime === "string" ? new Date(item.lastModifiedDateTime) : null;
  const document = {
    id, name: item.name, type, date: modified && !Number.isNaN(modified.getTime())
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(modified) : "Date inconnue",
    isLocal: true, oneDriveSource: true, content: "", summary: "", keywords: ""
  };
  if (type === "Document") return { document, coverage: "metadata", reason: "format non pris en charge" };
  const limit = type === "PDF" ? pdfLimit : textLimit;
  if (typeof item.size === "number" && item.size > limit) {
    return { document, coverage: "metadata", reason: "taille dépassée" };
  }
  const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item.id)}`);
  url.searchParams.set("$select", "id,@microsoft.graph.downloadUrl");
  const token = await getToken();
  const metadata = await fetchImpl(url.href, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!metadata.ok) throw new Error(`Lecture des métadonnées OneDrive impossible (HTTP ${metadata.status}).`);
  const info = await metadata.json();
  if (info.id !== item.id) throw new Error("Identité du fichier OneDrive incohérente.");
  const authorizedUrl = downloadUrl(info["@microsoft.graph.downloadUrl"]);
  let response;
  try {
    response = await fetchImpl(authorizedUrl, { signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Téléchargement OneDrive inaccessible.");
  }
  if (!response.ok) throw new Error(`Téléchargement OneDrive impossible (HTTP ${response.status}).`);
  let bytes;
  try {
    bytes = await boundedBytes(response, limit);
  } catch (error) {
    if (error.message === "Fichier OneDrive au-delà de la limite de taille.") {
      return { document, coverage: "metadata", reason: "taille dépassée" };
    }
    throw error;
  }
  let segments;
  if (type === "PDF") {
    const { readPdfFileWithSegments } = await import("./document-reader.js");
    let extracted;
    try {
      extracted = await readPdfFileWithSegments(new Blob([bytes], { type: "application/pdf" }));
    } catch (error) {
      return { document, coverage: "metadata", reason: "PDF illisible, scanné ou dépassant 20 pages" };
    }
    document.content = extracted.content;
    segments = extracted.segments;
  } else {
    document.content = new TextDecoder().decode(bytes);
    segments = [document.content];
  }
  if (!document.content.trim()) return { document, coverage: "metadata", reason: "texte vide" };
  document.contentProvenance = await createContentProvenance(
    document, segments, type === "PDF" ? "onedrive-pdf-text" : "onedrive-text"
  );
  return { document, segments, coverage: "partial", reason: null };
}
