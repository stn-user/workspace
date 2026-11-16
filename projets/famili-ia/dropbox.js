import { createPhotoMetadata, hashPhotoBytes, parseProviderCaptureDate } from "./photo-metadata.js";
import { createContentProvenance } from "./content-index.js";
import { readBoundedBytes } from "./read-bounded-bytes.js";

export const DROPBOX_SCOPES = ["files.metadata.read", "files.content.read"];

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createDropboxAuthorization(clientId, redirectUri) {
  if (typeof clientId !== "string" || !clientId.trim()) throw new TypeError("Clé d'application Dropbox manquante.");
  const redirect = new URL(redirectUri);
  if (redirect.username || redirect.password || redirect.search || redirect.hash) throw new TypeError("Adresse de retour Dropbox invalide.");
  if (redirect.protocol !== "https:" && !(redirect.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname))) {
    throw new TypeError("Dropbox nécessite HTTPS ou une adresse locale de développement.");
  }
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: clientId, response_type: "code", redirect_uri: redirect.href,
    code_challenge_method: "S256", code_challenge: challenge,
    state, scope: DROPBOX_SCOPES.join(" "), token_access_type: "online"
  }).toString();
  return { url: url.href, state, verifier };
}

export class DropboxAuth {
  #token = null;
  #expiresAt = 0;
  #accountId = null;
  #connecting = false;
  #cancelConnection = null;

  constructor(clientId, redirectUri, { fetchImpl = fetch, windowImpl = window } = {}) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.fetchImpl = (...args) => fetchImpl(...args);
    this.window = windowImpl;
  }

  get connected() { return Boolean(this.#token) && Date.now() < this.#expiresAt; }
  get accountId() {
    if (!this.connected) throw new Error("Connectez ou reconnectez Dropbox.");
    return this.#accountId;
  }
  getToken() {
    if (!this.connected) throw new Error("Session Dropbox expirée ou indisponible : reconnectez Dropbox.");
    return this.#token;
  }
  disconnect() {
    this.cancelConnection();
    this.#token = null;
    this.#accountId = null;
    this.#expiresAt = 0;
  }
  cancelConnection() { this.#cancelConnection?.(); }

  async connect() {
    if (this.#connecting) throw new Error("Une connexion Dropbox est déjà en cours.");
    const popup = this.window.open("about:blank", "_blank", "popup,width=600,height=720");
    if (!popup) throw new Error("Fenêtre Dropbox bloquée : autorisez les fenêtres de connexion.");
    this.#connecting = true;
    const controller = new AbortController();
    this.#cancelConnection = () => controller.abort();
    let cleanup = () => {};
    try {
      const authorization = await createDropboxAuthorization(this.clientId, this.redirectUri);
      if (controller.signal.aborted) throw new Error("Connexion Dropbox annulée.");
      await new Promise((resolve, reject) => {
        let exchanging = false;
        const onAbort = () => reject(new Error("Connexion Dropbox annulée."));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        const timer = setInterval(() => {
          if (popup.closed && !exchanging) reject(new Error("Connexion Dropbox annulée."));
        }, 500);
        const timeout = setTimeout(() => {
          reject(new Error("Délai de connexion Dropbox dépassé."));
          controller.abort();
        }, 120000);
        const onMessage = async event => {
          if (event.origin !== new URL(this.redirectUri).origin || event.source !== popup ||
              event.data?.type !== "famili-dropbox-oauth" || exchanging) return;
          if (event.data.state !== authorization.state) {
            reject(new Error("Retour Dropbox invalide : état de connexion incohérent."));
            return;
          }
          if (event.data.error || typeof event.data.code !== "string" || !event.data.code) {
            reject(new Error("Autorisation Dropbox refusée ou incomplète."));
            return;
          }
          exchanging = true;
          try {
            const response = await this.fetchImpl("https://api.dropboxapi.com/oauth2/token", {
              method: "POST", signal: controller.signal, credentials: "omit", redirect: "error",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "authorization_code", code: event.data.code,
                client_id: this.clientId, redirect_uri: this.redirectUri, code_verifier: authorization.verifier
              }).toString()
            });
            if (!response.ok) throw new Error(`Connexion Dropbox impossible (HTTP ${response.status}).`);
            const token = await response.json();
            const granted = typeof token.scope === "string" ? token.scope.split(/\s+/) : [];
            if (typeof token.access_token !== "string" || !token.access_token ||
                typeof token.account_id !== "string" || !token.account_id ||
                !Number.isFinite(token.expires_in) || token.expires_in <= 0 ||
                token.token_type?.toLowerCase() !== "bearer" ||
                !DROPBOX_SCOPES.every(scope => granted.includes(scope)) ||
                granted.some(scope => !DROPBOX_SCOPES.includes(scope))) {
              throw new Error("Réponse Dropbox invalide ou permissions différentes de la lecture seule attendue.");
            }
            if (controller.signal.aborted) throw new Error("Connexion Dropbox interrompue.");
            this.#token = token.access_token;
            this.#accountId = token.account_id;
            this.#expiresAt = Date.now() + token.expires_in * 1000;
            resolve();
          } catch (error) { reject(error); }
        };
        this.window.addEventListener("message", onMessage);
        cleanup = () => {
          clearInterval(timer);
          clearTimeout(timeout);
          this.window.removeEventListener("message", onMessage);
          controller.signal.removeEventListener("abort", onAbort);
        };
        popup.location.href = authorization.url;
      });
    } finally {
      cleanup();
      controller.abort();
      popup.close();
      this.#connecting = false;
      this.#cancelConnection = null;
    }
  }
}

export async function dropboxIdentity(accountId, itemId) {
  if (typeof accountId !== "string" || !accountId || typeof itemId !== "string" || !itemId) {
    throw new TypeError("Identité Dropbox invalide.");
  }
  const encode = value => new TextEncoder().encode(JSON.stringify(value));
  const accountHash = await hashPhotoBytes(encode(["dropbox", accountId]));
  const itemHash = await hashPhotoBytes(encode(["dropbox", accountId, itemId]));
  return { id: `dropbox-${itemHash.slice(7)}`, accountFingerprint: accountHash.slice(7) };
}

export function canRefreshDropboxCopy(document, accountFingerprint) {
  return Boolean(document?.dropboxSource
    && /^[0-9a-f]{64}$/i.test(accountFingerprint ?? "")
    && document.dropboxAccountFingerprint === accountFingerprint);
}

export function compareDropboxCopy(document, item) {
  if (!document || !item || typeof document.name !== "string" || typeof item.name !== "string") {
    throw new TypeError("Comparaison Dropbox invalide.");
  }
  if (!document.dropboxRev || typeof item.rev !== "string" || !item.rev) return "unknown";
  return document.dropboxRev === item.rev
    && document.name === item.name
    && document.sourceDir === item.path_display
    ? "unchanged" : "changed";
}

export function describeDropboxChanges(document, item) {
  const changes = [];
  if (document.name !== item.name) changes.push(`nom : ${document.name} → ${item.name}`);
  if (document.sourceDir !== item.path_display) changes.push("emplacement Dropbox modifié");
  if (document.dropboxRev && item.rev && document.dropboxRev !== item.rev) {
    changes.push("version Dropbox différente");
  }
  return changes;
}

export function mergeDropboxDocumentUpdate(existing, refreshed) {
  if (!existing || !refreshed || existing.id !== refreshed.id
    || !existing.dropboxSource || !refreshed.dropboxSource
    || !existing.dropboxAccountFingerprint
    || existing.dropboxAccountFingerprint !== refreshed.dropboxAccountFingerprint
    || !existing.dropboxRev || !refreshed.dropboxRev) {
    throw new TypeError("Remplacement Dropbox invalide ou compte/version d'origine non vérifié.");
  }
  const merged = {
    ...existing,
    ...refreshed,
    ...(existing.photoAnnotations ? { photoAnnotations: existing.photoAnnotations } : {})
  };
  for (const field of [
    "contentProvenance", "dropboxRev", "dropboxIndexIssue", "photoMetadata",
    "sourceDir", "modificationDate", "indexRecord"
  ]) {
    if (!Object.prototype.hasOwnProperty.call(refreshed, field)) delete merged[field];
  }
  return merged;
}

export class DropboxApiError extends Error {
  constructor(response) {
    const retry = response.headers.get("retry-after");
    super(response.status === 429
      ? `Quota Dropbox atteint (HTTP 429)${/^\d+$/.test(retry ?? "") ? ` ; réessayez dans ${retry} secondes` : " ; réessayez plus tard"}.`
      : response.status === 401 ? "Session Dropbox expirée ou révoquée (HTTP 401) : reconnectez Dropbox."
        : response.status === 403 ? "Accès Dropbox refusé (HTTP 403) : vérifiez les permissions."
          : `Lecture Dropbox impossible (HTTP ${response.status}).`);
    this.status = response.status;
  }
}

async function dropboxRequest(endpoint, options, { getToken, signal, fetchImpl }) {
  if (signal?.aborted) throw new DOMException("Indexation Dropbox arrêtée.", "AbortError");
  const token = await getToken();
  if (typeof token !== "string" || !token) throw new Error("Jeton Dropbox indisponible.");
  const response = await fetchImpl(endpoint, {
    ...options, signal, credentials: "omit", redirect: "error",
    headers: { ...options.headers, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new DropboxApiError(response);
  }
  return response;
}

export async function scanDropbox({
  getToken, onItem, onProgress, signal, fetchImpl = fetch,
  cursor: initialCursor = null, onPageComplete = () => {}
}) {
  if ([getToken, onItem, onProgress, fetchImpl].some(value => typeof value !== "function")) {
    throw new TypeError("Paramètres d'indexation Dropbox invalides.");
  }
  if ((initialCursor !== null && (typeof initialCursor !== "string" || !initialCursor))
    || typeof onPageComplete !== "function") {
    throw new TypeError("Paramètres de reprise Dropbox invalides.");
  }
  let cursor = initialCursor;
  const cursors = new Set(initialCursor === null ? [] : [initialCursor]);
  const items = new Set();
  let pages = 0;
  do {
    const response = await dropboxRequest(
      `https://api.dropboxapi.com/2/files/list_folder${cursor === null ? "" : "/continue"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cursor === null
          ? { path: "", recursive: true, include_deleted: false }
          : { cursor })
      }, { getToken, signal, fetchImpl }
    );
    const page = await response.json();
    if (!Array.isArray(page?.entries) || typeof page.has_more !== "boolean" ||
        typeof page.cursor !== "string" || !page.cursor) throw new Error("Page Dropbox invalide.");
    pages++;
    for (const item of page.entries) {
      if (signal?.aborted) throw new DOMException("Indexation Dropbox arrêtée.", "AbortError");
      if (!item || !["file", "folder", "deleted"].includes(item[".tag"])) throw new Error("Élément Dropbox invalide.");
      if (item[".tag"] !== "file") continue;
      if (typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) {
        throw new Error("Fichier Dropbox sans identité ou nom valide.");
      }
      if (items.has(item.id)) continue;
      await onItem(item);
      items.add(item.id);
      onProgress({ files: items.size, pages });
    }
    if (signal?.aborted) throw new DOMException("Indexation Dropbox arrêtée.", "AbortError");
    if (page.has_more && cursors.has(page.cursor)) throw new Error("Pagination Dropbox répétée : parcours interrompu.");
    await onPageComplete({ cursor: page.cursor, hasMore: page.has_more, files: items.size, pages });
    if (!page.has_more) break;
    cursors.add(page.cursor);
    cursor = page.cursor;
  } while (true);
  return { files: items.size, pages };
}

function readDropboxPhotoMetadata(documentId, mediaInfo, includeLocation) {
  if (!mediaInfo || mediaInfo[".tag"] !== "metadata"
    || !mediaInfo.metadata || typeof mediaInfo.metadata !== "object"
    || Array.isArray(mediaInfo.metadata)) return null;
  const values = {};
  const captureDate = parseProviderCaptureDate(
    mediaInfo.metadata.time_taken, "media_info.metadata.time_taken"
  );
  if (captureDate) values.captureDate = captureDate;

  if (includeLocation) {
    const location = mediaInfo.metadata.location;
    if (location && typeof location === "object"
      && Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90
      && Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180) {
      values.location = {
        status: "available",
        latitude: location.latitude,
        longitude: location.longitude,
        altitudeMeters: null,
        source: { kind: "provider", field: "media_info.metadata.location" }
      };
    }
  }
  return captureDate || values.location ? createPhotoMetadata(documentId, values) : null;
}

export async function readDropboxDocument({
  item, accountId, getToken, signal, fetchImpl = fetch, includeLocation = false
}) {
  if (typeof includeLocation !== "boolean") {
    throw new TypeError("Le consentement de localisation Dropbox doit être booléen.");
  }
  const identity = await dropboxIdentity(accountId, item.id);
  const extension = item.name.toLowerCase().split(".").pop();
  const type = extension === "pdf" ? "PDF" : extension === "txt" ? "Texte"
    : extension === "md" ? "Markdown" : /^(jpe?g|png|heic|heif|webp|gif)$/.test(extension) ? "Image" : "Document";
  const modified = typeof item.server_modified === "string" ? new Date(item.server_modified) : null;
  const document = {
    id: identity.id, name: item.name, type, isLocal: true, dropboxSource: true,
    dropboxAccountFingerprint: identity.accountFingerprint,
    ...(typeof item.rev === "string" && item.rev ? { dropboxRev: item.rev } : {}),
    ...(typeof item.path_display === "string" && item.path_display
      ? { sourceDir: item.path_display } : {}),
    ...(modified && !Number.isNaN(modified.getTime()) ? { modificationDate: modified.toISOString() } : {}),
    date: modified && !Number.isNaN(modified.getTime())
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(modified) : "Date inconnue",
    content: "", summary: "", keywords: ""
  };
  const metadataOnly = reason => {
    document.dropboxIndexIssue = reason;
    return { document, coverage: "metadata", reason };
  };
  if (type === "Image") {
    const photoMetadata = readDropboxPhotoMetadata(identity.id, item.media_info, includeLocation);
    if (photoMetadata) document.photoMetadata = photoMetadata;
    return metadataOnly("Photo en métadonnées fournisseur seules ; aucun pixel téléchargé.");
  }
  if (!["PDF", "Texte", "Markdown"].includes(type)) return metadataOnly("Format en métadonnées seules ; aucune analyse de photo.");
  const limit = type === "PDF" ? 10 * 1024 * 1024 : 1024 * 1024;
  if (typeof item.size !== "number" || !Number.isFinite(item.size) || item.size < 0 ||
      typeof item.rev !== "string" || !item.rev) return metadataOnly("Taille ou version inconnue ; contenu non téléchargé.");
  if (item.size > limit) return metadataOnly("Limite de taille dépassée ; contenu non téléchargé.");
  if (item.is_downloadable === false) return metadataOnly("Fichier non téléchargeable.");
  const response = await dropboxRequest("https://content.dropboxapi.com/2/files/download", {
    method: "POST", headers: { "Dropbox-API-Arg": JSON.stringify({ path: item.id }) }
  }, { getToken, signal, fetchImpl });
  let downloaded;
  try { downloaded = JSON.parse(response.headers.get("dropbox-api-result")); }
  catch { throw new Error("Métadonnées de téléchargement Dropbox invalides."); }
  if (!downloaded || typeof downloaded.id !== "string" || typeof downloaded.rev !== "string" ||
      typeof downloaded.name !== "string") {
    await response.body?.cancel();
    throw new Error("Métadonnées de téléchargement Dropbox absentes ou incomplètes ; contenu non conservé.");
  }
  if (downloaded.id !== item.id || downloaded.rev !== item.rev || downloaded.name !== item.name) {
    await response.body?.cancel();
    throw new Error("Fichier Dropbox modifié pendant sa lecture : relancez le parcours.");
  }
  let bytes;
  try { bytes = await readBoundedBytes(response, limit); }
  catch (error) {
    if (error instanceof RangeError) return metadataOnly("Limite de taille dépassée pendant la lecture.");
    throw error;
  }
  let segments;
  if (type === "PDF") {
    const { readPdfFileWithSegments } = await import("./document-reader.js");
    try {
      const parsed = await readPdfFileWithSegments(new Blob([bytes], { type: "application/pdf" }));
      document.content = parsed.content;
      segments = parsed.segments;
    } catch (error) {
      if (signal?.aborted) throw error;
      return metadataOnly("PDF non extrait : illisible, scanné ou au-delà des limites du lecteur Web (20 pages).");
    }
  } else {
    document.content = new TextDecoder().decode(bytes);
    segments = [document.content];
  }
  if (!document.content.trim()) return metadataOnly("Aucun texte exploitable.");
  document.contentProvenance = await createContentProvenance(
    document, segments, type === "PDF" ? "dropbox-pdf-text" : "dropbox-text"
  );
  return { document, segments, coverage: "partial", reason: null };
}
