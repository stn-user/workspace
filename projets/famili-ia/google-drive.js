export const googleDriveScope = "https://www.googleapis.com/auth/drive.file";
const googleIdentityScript = "https://accounts.google.com/gsi/client";
const googleApiScript = "https://apis.google.com/js/api.js";
const supportedMimeTypes = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.google-apps.document"
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
  return null;
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
  constructor({ apiKey, appId, clientId }) {
    this.apiKey = apiKey;
    this.appId = appId;
    this.clientId = clientId;
    this.accessToken = null;
    this.tokenClient = null;
  }

  async initialize() {
    await loadGoogleLibraries();
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: googleDriveScope,
      callback: () => {},
      error_callback: () => {}
    });
  }

  pickFiles(maxItems) {
    if (!this.tokenClient || maxItems < 1) {
      return Promise.reject(new Error("La connexion Google Drive n’est pas prête ou la limite de fichiers est atteinte."));
    }

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
          const selectedFiles = await this.openPicker(maxItems);
          if (selectedFiles.length > maxItems) {
            throw new Error(`Sélectionnez au plus ${maxItems} fichier${maxItems === 1 ? "" : "s"} pour respecter la limite de la session.`);
          }
          const loadedFiles = await Promise.all(selectedFiles.map((file) => this.readSelectedFile(file)));
          resolve(loadedFiles);
        } catch (error) {
          reject(error);
        }
      };
      this.tokenClient.error_callback = (error) => {
        reject(new Error(error.message || "La fenêtre d’autorisation Google n’a pas pu être ouverte."));
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
            resolve([]);
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
    const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(selectedFile.id)}`);
    metadataUrl.searchParams.set("fields", "id,name,mimeType,size,modifiedTime");
    metadataUrl.searchParams.set("supportsAllDrives", "true");
    const metadataResponse = await this.driveRequest(metadataUrl, `Impossible de vérifier « ${selectedFile.name} »`);
    const metadata = await metadataResponse.json();
    const fileType = getGoogleDriveFileType(metadata.mimeType);
    if (!fileType) {
      throw new Error(`Le format de « ${metadata.name} » n’est pas pris en charge. Formats acceptés : PDF, TXT, Markdown et Google Docs.`);
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
    if (fileType.type === "PDF") {
      const { readPdfFile } = await import("./document-reader.js");
      content = await readPdfFile(new File([bytes], metadata.name, { type: "application/pdf" }));
    } else {
      content = new TextDecoder().decode(bytes);
    }
    if (!content.trim()) throw new Error(`« ${metadata.name} » ne contient aucun texte exploitable.`);

    return {
      id: `drive-${metadata.id}`,
      name: metadata.name,
      type: fileType.type,
      date: metadata.modifiedTime
        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(metadata.modifiedTime))
        : "Date inconnue",
      keywords: "",
      summary: "",
      content,
      isLocal: true,
      driveSource: true
    };
  }

  revoke() {
    const token = this.accessToken;
    this.accessToken = null;
    if (!token || !window.google?.accounts?.oauth2) return Promise.resolve();

    return new Promise((resolve, reject) => {
      window.google.accounts.oauth2.revoke(token, (response) => {
        if (response?.error || response?.successful === false) {
          reject(new Error(response.error_description || response.error || "Google n’a pas confirmé la révocation. Vous pouvez également retirer Famili-IA depuis les paramètres de sécurité de votre compte Google."));
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
