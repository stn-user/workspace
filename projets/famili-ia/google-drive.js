import { createContentProvenance } from "./content-index.js";
import { createPhotoMetadata, parseProviderExifCaptureDate, providerPhotoLocation } from "./photo-metadata.js";

export const googleDriveScope = "https://www.googleapis.com/auth/drive.file";
const extractedPdfSegments = new WeakMap();

export async function prepareDriveDocumentForIndex(document, index) {
  if (document.type === "Image" && document.content === "") return;
  let segments;
  let method;
  if (["Texte", "Markdown", "Document Google"].includes(document.type)) {
    segments = [document.content];
    method = "drive-text";
  } else if (document.type === "PDF") {
    const extracted = extractedPdfSegments.get(document);
    if (!extracted || extracted.content !== document.content) {
      throw new Error("Segments PDF Drive indisponibles ou contenu modifié.");
    }
    segments = extracted.segments;
    method = "drive-pdf-text";
  } else {
    throw new TypeError("Type Drive non pris en charge pour l'indexation.");
  }
  const provenance = await createContentProvenance(document, segments, method);
  if (provenance) document.contentProvenance = provenance;
  index.trustExtractedContent(document, segments);
}
const googleIdentityScript = "https://accounts.google.com/gsi/client";
const googleApiScript = "https://apis.google.com/js/api.js";
const supportedMimeTypes = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.google-apps.document",
  "image/jpeg",
  "image/png"
];
const maxTextFileSize = 1024 * 1024;
const maxPdfFileSize = 10 * 1024 * 1024;

let googleLibrariesPromise;

function loadScript(src, isReady) {
  if (isReady()) return Promise.resolve();

  const existingScript = document.querySelector(`script[src="${src}"]`);
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Impossible de charger les bibliothèques Google.")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Impossible de charger les bibliothèques Google."));
    document.head.append(script);
  });
}

function loadGoogleLibraries() {
  if (!googleLibrariesPromise) {
    googleLibrariesPromise = Promise.all([
      loadScript(googleIdentityScript, () => Boolean(window.google?.accounts?.oauth2)),
      loadScript(googleApiScript, () => Boolean(window.gapi))
    ]).then(() => new Promise((resolve, reject) => {
      window.gapi.load("picker", {
        callback: resolve,
        onerror: () => reject(new Error("La bibliothèque Google Picker n’a pas pu être chargée.")),
        timeout: 10000,
        ontimeout: () => reject(new Error("Le chargement de Google Picker a expiré."))
      });
    })).catch((error) => {
      googleLibrariesPromise = undefined;
      throw error;
    });
  }
  return googleLibrariesPromise;
}

export function getGoogleDriveFileType(mimeType) {
  if (mimeType === "application/pdf") return { extension: "pdf", type: "PDF", maxSize: maxPdfFileSize };
  if (mimeType === "text/plain") return { extension: "txt", type: "Texte", maxSize: maxTextFileSize };
  if (mimeType === "text/markdown") return { extension: "md", type: "Markdown", maxSize: maxTextFileSize };
  if (mimeType === "application/vnd.google-apps.document") {
    return { extension: "txt", type: "Document Google", maxSize: maxTextFileSize };
  }
  if (mimeType === "image/jpeg" || mimeType === "image/png") {
    return { extension: mimeType === "image/jpeg" ? "jpg" : "png", type: "Image" };
  }
  return null;
}

function readDrivePhotoMetadata(documentId, image, includeLocation) {
  if (!image || typeof image !== "object" || Array.isArray(image)) return null;
  const values = {};
  const captureDate = parseProviderExifCaptureDate(image.time, "imageMediaMetadata.time");
  if (captureDate) values.captureDate = captureDate;
  if (Number.isSafeInteger(image.width) && image.width > 0
    && Number.isSafeInteger(image.height) && image.height > 0) {
    values.dimensions = {
      width: image.width, height: image.height,
      source: { kind: "provider", field: "imageMediaMetadata.width/height" }
    };
  }
  const make = typeof image.cameraMake === "string" && image.cameraMake.trim().length <= 120
    ? image.cameraMake.trim() : "";
  const model = typeof image.cameraModel === "string" && image.cameraModel.trim().length <= 120
    ? image.cameraModel.trim() : "";
  if (make || model) {
    values.device = {
      make: make || null, model: model || null,
      source: { kind: "provider", field: "imageMediaMetadata.cameraMake/cameraModel" }
    };
  }
  if (includeLocation) {
    const location = providerPhotoLocation(image.location, "imageMediaMetadata.location");
    if (location) values.location = location;
  }
  return Object.keys(values).length ? createPhotoMetadata(documentId, values) : null;
}

async function readResponse(response, description) {
  if (!response.ok) {
    throw new Error(`${description} (HTTP ${response.status}). Vérifiez l’autorisation Google et le type de fichier.`);
  }
  return response;
}

async function readBoundedBytes(response, maxSize, fileName) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxSize) {
    throw new Error(`« ${fileName} » dépasse la limite autorisée.`);
  }
  if (!response.body) {
    const content = new Uint8Array(await response.arrayBuffer());
    if (content.byteLength > maxSize) throw new Error(`« ${fileName} » dépasse la limite autorisée.`);
    return content;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxSize) {
        await reader.cancel();
        throw new Error(`« ${fileName} » dépasse la limite autorisée.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const content = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return content;
}

export class GoogleDriveClient {
  constructor({ apiKey, appId, clientId, nativeAuth = null, getPhotoLocationConsent = () => false }) {
    if (typeof getPhotoLocationConsent !== "function") {
      throw new TypeError("Le contrôle du consentement GPS doit être une fonction.");
    }
    this.apiKey = apiKey;
    this.appId = appId;
    this.clientId = clientId;
    this.nativeAuth = nativeAuth;
    this.getPhotoLocationConsent = getPhotoLocationConsent;
    this.accessToken = null;
    this.tokenClient = null;
  }

  async initialize() {
    await loadGoogleLibraries();
    if (this.nativeAuth) return;
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: googleDriveScope,
      callback: () => {},
      error_callback: () => {}
    });
  }

  async pickFiles(maxItems) {
    const result = await this.pickFilesDetailed(maxItems);
    return result.documents;
  }

  async selectAndReadFiles(maxItems) {
    const selectedFiles = await this.openPicker(maxItems);
    if (selectedFiles === null) return { status: "cancelled", documents: [] };
    if (!Array.isArray(selectedFiles)) throw new Error("Réponse Google Picker invalide.");
    if (selectedFiles.length > maxItems) {
      throw new Error(`Sélectionnez au plus ${maxItems} fichier${maxItems === 1 ? "" : "s"} pour respecter la limite de la session.`);
    }
    const loadedFiles = await Promise.all(selectedFiles.map((file) => this.readSelectedFile(file)));
    return { status: loadedFiles.length ? "selected" : "empty", documents: loadedFiles };
  }

  async pickFilesNative(maxItems) {
    const authorization = await this.nativeAuth.authorize(googleDriveScope);
    if (authorization.status === "cancelled") return { status: "cancelled", documents: [] };
    if (authorization.status !== "granted") {
      throw new Error("L’autorisation minimale Google Drive n’a pas été accordée. Aucun fichier n’a été lu.");
    }
    this.accessToken = authorization.accessToken;
    return this.selectAndReadFiles(maxItems);
  }

  pickFilesDetailed(maxItems) {
    if ((!this.tokenClient && !this.nativeAuth) || maxItems < 1) {
      return Promise.reject(new Error("La connexion Google Drive n’est pas prête ou la limite de fichiers est atteinte."));
    }
    if (this.nativeAuth) return this.pickFilesNative(maxItems);

    return new Promise((resolve, reject) => {
      this.tokenClient.callback = async (tokenResponse) => {
        if (tokenResponse.error) {
          reject(new Error(`Autorisation Google refusée : ${tokenResponse.error_description || tokenResponse.error}`));
          return;
        }
        if (!tokenResponse.access_token || !window.google.accounts.oauth2.hasGrantedAllScopes(tokenResponse, googleDriveScope)) {
          reject(new Error("L’autorisation minimale Google Drive n’a pas été accordée. Aucun fichier n’a été lu."));
          return;
        }

        this.accessToken = tokenResponse.access_token;
        try {
          resolve(await this.selectAndReadFiles(maxItems));
        } catch (error) {
          reject(error);
        }
      };
      this.tokenClient.error_callback = (error) => {
        if (error?.type === "popup_closed") {
          resolve({ status: "cancelled", documents: [] });
          return;
        }
        reject(new Error(error?.message || "La fenêtre d’autorisation Google n’a pas pu être ouverte."));
      };
      this.tokenClient.requestAccessToken();
    });
  }

  openPicker(maxItems) {
    return new Promise((resolve, reject) => {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setMimeTypes(supportedMimeTypes.join(","));
      const picker = new window.google.picker.PickerBuilder()
        .setAppId(this.appId)
        .setDeveloperKey(this.apiKey)
        .setOAuthToken(this.accessToken)
        .setOrigin(window.location.origin)
        .setMaxItems(maxItems)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .addView(view)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          } else if (data.action === window.google.picker.Action.PICKED) {
            resolve(data.docs);
          } else if (data.action === window.google.picker.Action.ERROR) {
            reject(new Error("Google Drive Picker a rencontré une erreur. Aucun fichier n’a été lu."));
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  async driveRequest(url, description) {
    if (!this.accessToken) throw new Error("Aucune autorisation Drive active dans cette session.");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    return readResponse(response, description);
  }

  async readSelectedFile(selectedFile) {
    const includeLocation = this.getPhotoLocationConsent() === true;
    const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(selectedFile.id)}`);
    const photoFields = `time,width,height,cameraMake,cameraModel${includeLocation ? ",location(latitude,longitude)" : ""}`;
    metadataUrl.searchParams.set("fields", `id,name,mimeType,size,modifiedTime,imageMediaMetadata(${photoFields})`);
    metadataUrl.searchParams.set("supportsAllDrives", "true");
    const metadataResponse = await this.driveRequest(metadataUrl, `Impossible de vérifier « ${selectedFile.name} »`);
    const metadata = await metadataResponse.json();
    if (metadata.id !== selectedFile.id) throw new Error("Identité du fichier Google Drive incohérente.");
    const fileType = getGoogleDriveFileType(metadata.mimeType);
    if (!fileType) {
      throw new Error(`Le format de « ${metadata.name} » n’est pas pris en charge. Formats acceptés : PDF, TXT, Markdown, Google Docs, JPEG et PNG.`);
    }

    const modified = typeof metadata.modifiedTime === "string" ? new Date(metadata.modifiedTime) : null;
    const validModified = modified && !Number.isNaN(modified.getTime());
    const document = {
      id: `drive-${metadata.id}`,
      name: metadata.name,
      type: fileType.type,
      date: validModified ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(modified) : "Date inconnue",
      ...(validModified ? { modificationDate: modified.toISOString() } : {}),
      keywords: "",
      summary: "",
      content: "",
      isLocal: true,
      driveSource: true
    };
    if (fileType.type === "Image") {
      const photoMetadata = readDrivePhotoMetadata(document.id, metadata.imageMediaMetadata,
        includeLocation && this.getPhotoLocationConsent() === true);
      if (photoMetadata) document.photoMetadata = photoMetadata;
      return document;
    }

    const declaredSize = Number(metadata.size ?? 0);
    if (declaredSize > fileType.maxSize) {
      const limit = fileType.type === "PDF" ? "10 Mo" : "1 Mo";
      throw new Error(`« ${metadata.name} » dépasse la limite de ${limit}. Aucun contenu de ce fichier n’a été conservé.`);
    }

    const contentUrl = metadata.mimeType === "application/vnd.google-apps.document"
      ? new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(metadata.id)}/export`)
      : new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(metadata.id)}`);
    if (metadata.mimeType === "application/vnd.google-apps.document") {
      contentUrl.searchParams.set("mimeType", "text/plain");
    } else {
      contentUrl.searchParams.set("alt", "media");
      contentUrl.searchParams.set("supportsAllDrives", "true");
    }

    const contentResponse = await this.driveRequest(contentUrl, `Impossible de lire « ${metadata.name} »`);
    const bytes = await readBoundedBytes(contentResponse, fileType.maxSize, metadata.name);
    let content;
    let segments;
    if (fileType.type === "PDF") {
      const { readPdfFileWithSegments } = await import("./document-reader.js");
      const pdfResult = await readPdfFileWithSegments(new File([bytes], metadata.name, { type: "application/pdf" }));
      content = pdfResult.content;
      segments = pdfResult.segments;
    } else {
      content = new TextDecoder().decode(bytes);
    }
    if (!content.trim()) throw new Error(`« ${metadata.name} » ne contient aucun texte exploitable.`);

    document.content = content;
    if (segments) extractedPdfSegments.set(document, { content, segments });
    return document;
  }

  revoke() {
    const token = this.accessToken;
    this.accessToken = null;
    if (!token) return Promise.resolve();
    if (this.nativeAuth) {
      return this.nativeAuth.revoke(token).catch(() => {
        throw new Error("Google n’a pas confirmé la révocation. Vous pouvez également retirer Famili-IA depuis les paramètres de sécurité de votre compte Google.");
      });
    }
    if (!window.google?.accounts?.oauth2?.revoke) {
      return Promise.reject(new Error("Révocation Google indisponible : la révocation fournisseur n'a pas été confirmée."));
    }

    return new Promise((resolve, reject) => {
      window.google.accounts.oauth2.revoke(token, (response) => {
        if (response?.error || response?.successful !== true) {
          reject(new Error(response?.error_description || response?.error || "Google n’a pas confirmé la révocation. Vous pouvez également retirer Famili-IA depuis les paramètres de sécurité de votre compte Google."));
          return;
        }
        resolve();
      });
    });
  }

  get hasAccessToken() {
    return Boolean(this.accessToken);
  }
}
