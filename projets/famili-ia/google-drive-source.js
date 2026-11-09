import { adaptDriveResult, adaptDriveResults } from "./google-drive-index-adapter.js";

export class GoogleDriveSource {
  #client;
  #sourceId;
  #selecting = false;
  #revoking = false;
  #selectionState = "unknown";
  #revocationState = "not-requested";

  constructor({ client, sourceId } = {}) {
    if (!client || typeof client.pickFilesDetailed !== "function" || typeof client.revoke !== "function") {
      throw new TypeError("Client Google Drive invalide");
    }
    adaptDriveResults(sourceId, []);
    this.#client = client;
    this.#sourceId = sourceId;
  }

  describe() {
    return {
      sourceId: this.#sourceId,
      provider: "google-drive",
      platform: "web",
      account: "unknown",
      scope: "drive.file",
      selection: "explicit-one-time",
      selectionState: this.#selectionState,
      revocationState: this.#revocationState,
      authorization: this.#client.hasAccessToken ? "token-present" : "unknown",
      availability: "unknown",
      lastCheck: null,
      capabilities: {
        select: true, authorize: false, discover: false, readMetadata: false, readContent: false,
        openOriginal: false, getChanges: false, disconnect: false, revoke: true
      }
    };
  }

  async selectFiles(maxItems) {
    if (!Number.isSafeInteger(maxItems) || maxItems < 1) {
      throw new TypeError("La limite de sélection doit être un entier positif");
    }
    if (this.#selecting || this.#revoking) throw new Error("Une opération Drive est déjà en cours");
    this.#selecting = true;
    this.#revocationState = "not-requested";
    try {
      const selection = await this.#client.pickFilesDetailed(maxItems);
      if (!selection || !["cancelled", "empty", "selected"].includes(selection.status)) {
        throw new TypeError("État de sélection Drive invalide");
      }
      const { documents } = selection;
      if (!Array.isArray(documents)) throw new TypeError("Sélection Drive invalide");
      if ((selection.status === "selected") !== (documents.length > 0)) {
        throw new TypeError("État et documents de sélection Drive incohérents");
      }
      if (documents.length > maxItems) throw new Error("La sélection dépasse la limite demandée");
      const seen = new Set();
      const records = [];
      for (const document of documents) {
        const record = adaptDriveResult(this.#sourceId, document);
        if (!seen.has(record.itemId)) {
          seen.add(record.itemId);
          records.push(record);
        }
      }
      this.#selectionState = selection.status;
      return { status: this.#selectionState, documents, records };
    } catch (error) {
      this.#selectionState = "error";
      throw error;
    } finally {
      this.#selecting = false;
    }
  }

  async revoke() {
    if (this.#selecting || this.#revoking) throw new Error("Une opération Drive est déjà en cours");
    if (!this.#client.hasAccessToken) {
      throw new Error("Aucun jeton de session à révoquer ; la révocation fournisseur ne peut pas être confirmée.");
    }
    this.#revoking = true;
    try {
      await this.#client.revoke();
      this.#selectionState = "unknown";
      this.#revocationState = "confirmed";
    } catch (error) {
      this.#revocationState = "failed";
      throw error;
    } finally {
      this.#revoking = false;
    }
  }

  authorize() { throw new Error("Autorisation séparée non prise en charge : utilisez la sélection explicite."); }
  discover() { throw new Error("Découverte Drive non prise en charge : utilisez la sélection explicite."); }
  readMetadata() { throw new Error("Lecture séparée des métadonnées Drive non prise en charge."); }
  readContent() { throw new Error("Lecture séparée du contenu Drive non prise en charge."); }
  openOriginal() { throw new Error("Ouverture de l'original Drive non prise en charge."); }
  getChanges() { throw new Error("Suivi des changements Drive non pris en charge."); }
  disconnect() { throw new Error("Déconnexion locale indépendante non prise en charge."); }
}
