import { createContentProvenance } from "./content-index.js";
import { createPhotoMetadata, hashPhotoBytes, parseProviderCaptureDate, providerPhotoLocation } from "./photo-metadata.js";
import { getOneDriveAccountFingerprint } from "./onedrive-account.js";
import { readBoundedBytes } from "./read-bounded-bytes.js";

const textLimit = 1024 * 1024;
const pdfLimit = 10 * 1024 * 1024;
const PHOTO_FILE_PATTERN = /\.(?:jpe?g|png)$/i;

function isOneDrivePhoto(item, extension) {
  return Boolean(item.photo || item.image)
    || (typeof item.file?.mimeType === "string" && item.file.mimeType.toLowerCase().startsWith("image/"))
    || PHOTO_FILE_PATTERN.test(`.${extension}`);
}

function readProviderPhotoMetadata(documentId, photo, location) {
  if (!photo || typeof photo !== "object" || Array.isArray(photo)) photo = {};
  const values = {};
  const captureDate = parseProviderCaptureDate(photo.takenDateTime, "photo.takenDateTime");
  if (captureDate) values.captureDate = captureDate;

  const make = typeof photo.cameraMake === "string" && photo.cameraMake.trim().length <= 120
    ? photo.cameraMake.trim() : "";
  const model = typeof photo.cameraModel === "string" && photo.cameraModel.trim().length <= 120
    ? photo.cameraModel.trim() : "";
  if (make || model) {
    values.device = {
      make: make || null,
      model: model || null,
      source: { kind: "provider", field: "photo.cameraMake/photo.cameraModel" }
    };
  }
  if (location) values.location = location;
  return captureDate || make || model || location ? createPhotoMetadata(documentId, values) : null;
}

export async function oneDriveDocumentId(accountId, itemId) {
  if (typeof accountId !== "string" || !accountId || typeof itemId !== "string" || !itemId) {
    throw new TypeError("Identité OneDrive invalide.");
  }
  const hash = await hashPhotoBytes(new TextEncoder().encode(JSON.stringify([accountId, itemId])));
  return `onedrive-${hash.slice("sha256:".length)}`;
}

export function compareOneDriveCopy(document, item) {
  if (!document || !item || typeof document.name !== "string" || typeof item.name !== "string") {
    throw new TypeError("Comparaison OneDrive invalide.");
  }
  if (document.name !== item.name) return "changed";
  if (typeof document.oneDriveETag !== "string" || !document.oneDriveETag ||
      typeof item.eTag !== "string" || !item.eTag) return "unknown";
  return document.oneDriveETag === item.eTag ? "unchanged" : "changed";
}

export function describeOneDriveChanges(document, item) {
  const changes = [];
  if (document.name !== item.name) changes.push(`nom : ${document.name} → ${item.name}`);
  if (typeof document.oneDriveETag === "string" && document.oneDriveETag
    && typeof item.eTag === "string" && item.eTag
    && document.oneDriveETag !== item.eTag) {
    changes.push("version fournisseur différente");
  }
  return changes;
}

export function canRefreshOneDriveCopy(document, accountFingerprint) {
  return Boolean(document?.oneDriveSource
    && /^[0-9a-f]{64}$/i.test(accountFingerprint ?? "")
    && document.oneDriveAccountFingerprint === accountFingerprint);
}

export function mergeOneDriveDocumentUpdate(existing, refreshed) {
  if (!existing || !refreshed || existing.id !== refreshed.id
    || !existing.oneDriveSource || !refreshed.oneDriveSource
    || !existing.oneDriveAccountFingerprint
    || existing.oneDriveAccountFingerprint !== refreshed.oneDriveAccountFingerprint) {
    throw new TypeError("Remplacement OneDrive invalide ou compte d'origine non vérifié.");
  }
  const merged = {
    ...existing,
    ...refreshed,
    ...(existing.photoAnnotations ? { photoAnnotations: existing.photoAnnotations } : {})
  };
  for (const field of ["contentProvenance", "oneDriveETag", "oneDriveItemId", "photoMetadata"]) {
    if (!Object.hasOwn(refreshed, field)) delete merged[field];
  }
  return merged;
}

function oneDriveWebUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Lien d'origine OneDrive invalide."); }
  const host = url.hostname.toLowerCase();
  const allowed = ["1drv.com", "1drv.ms", "onedrive.com", "onedrive.live.com", "sharepoint.com"];
  if (url.protocol !== "https:" || url.username || url.password ||
      !allowed.some(domain => host === domain || host.endsWith(`.${domain}`)) ||
      (url.pathname === "/" && !url.search) || url.hash) {
    throw new Error("Lien d'origine OneDrive non autorisé.");
  }
  return url.href;
}

export async function resolveOneDriveOriginalUrl({
  itemId, accountFingerprint, activeAccountFingerprint, getToken, signal, fetchImpl = fetch
}) {
  if (typeof itemId !== "string" || !itemId.trim() ||
      !/^[0-9a-f]{64}$/i.test(accountFingerprint ?? "") ||
      !/^[0-9a-f]{64}$/i.test(activeAccountFingerprint ?? "") ||
      typeof getToken !== "function" || typeof fetchImpl !== "function") {
    throw new TypeError("Paramètres d'ouverture OneDrive invalides.");
  }
  if (accountFingerprint.toLowerCase() !== activeAccountFingerprint.toLowerCase()) {
    throw new Error("Le compte OneDrive connecté ne correspond pas au compte d'origine de cette copie.");
  }
  if (signal?.aborted) throw new DOMException("Ouverture OneDrive annulée.", "AbortError");
  const token = await getToken();
  if (typeof token !== "string" || !token) throw new Error("Jeton OneDrive indisponible.");
  const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}`);
  url.searchParams.set("$select", "id,webUrl");
  const response = await fetchImpl(url.href, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
    redirect: "error",
    signal
  });
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? `Accès à l'original OneDrive refusé ou expiré (HTTP ${response.status}). Reconnectez-vous puis réessayez.`
      : `Vérification de l'original OneDrive impossible (HTTP ${response.status}).`);
  }
  const item = await response.json();
  if (item?.id !== itemId) throw new Error("L'identité de l'original OneDrive ne correspond plus à la copie.");
  return oneDriveWebUrl(item.webUrl);
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
  return readBoundedBytes(response, limit, "Fichier OneDrive au-delà de la limite de taille.");
}

export async function readOneDriveDocument({
  item, accountId, accountFingerprint, getToken, signal, fetchImpl = fetch,
  getPhotoLocationConsent = () => false
}) {
  if (typeof getPhotoLocationConsent !== "function") {
    throw new TypeError("Le contrôle du consentement GPS doit être une fonction.");
  }
  const id = await oneDriveDocumentId(accountId, item.id);
  const originFingerprint = accountFingerprint ?? await getOneDriveAccountFingerprint(accountId);
  if (!/^[0-9a-f]{64}$/i.test(originFingerprint)) {
    throw new TypeError("Empreinte de compte OneDrive invalide.");
  }
  const extension = item.name.toLowerCase().split(".").pop();
  const type = isOneDrivePhoto(item, extension) ? "Image"
    : extension === "pdf" ? "PDF" : extension === "txt" ? "Texte"
    : extension === "md" ? "Markdown" : "Document";
  const modified = typeof item.lastModifiedDateTime === "string" ? new Date(item.lastModifiedDateTime) : null;
  const document = {
    id, name: item.name, type, date: modified && !Number.isNaN(modified.getTime())
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(modified) : "Date inconnue",
    ...(modified && !Number.isNaN(modified.getTime()) ? { modificationDate: modified.toISOString() } : {}),
    isLocal: true, oneDriveSource: true, oneDriveAccountFingerprint: originFingerprint,
    oneDriveItemId: item.id,
    content: "", summary: "", keywords: ""
  };
  if (typeof item.eTag === "string" && item.eTag) document.oneDriveETag = item.eTag;
  if (type === "Image") {
    let location = null;
    if (getPhotoLocationConsent() === true) {
      const token = await getToken();
      if (getPhotoLocationConsent() === true) {
        const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item.id)}`);
        url.searchParams.set("$select", "id,location");
        const response = await fetchImpl(url.href, {
          headers: { Authorization: `Bearer ${token}` }, credentials: "omit", redirect: "error", signal
        });
        if (!response.ok) throw new Error(`Lecture des métadonnées de localisation OneDrive impossible (HTTP ${response.status}).`);
        const metadata = await response.json();
        if (metadata.id !== item.id) throw new Error("Identité du fichier OneDrive incohérente.");
        if (getPhotoLocationConsent() === true) {
          location = providerPhotoLocation(metadata.location, "location");
        }
      }
    }
    const photoMetadata = readProviderPhotoMetadata(id, item.photo, location);
    if (photoMetadata) document.photoMetadata = photoMetadata;
    return { document, coverage: "metadata", reason: "photo : métadonnées fournisseur uniquement, sans lecture des pixels" };
  }
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
