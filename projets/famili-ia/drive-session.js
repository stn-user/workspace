import { adaptDriveResults } from "./google-drive-index-adapter.js";
import { isValidIndexRecord } from "./index-record.js";
import { reconcileIndex } from "./index-reconciliation.js";
import { searchIndex } from "./index-search.js";

export class DriveIndexSession {
  #client;
  #sourceId;
  #records;
  #selecting = false;

  constructor({ client, sourceId, records = [] } = {}) {
    if (!client || typeof client.pickFiles !== "function") {
      throw new TypeError("Client Drive invalide");
    }
    adaptDriveResults(sourceId, []);
    const validated = reconcileIndex(records, []);
    if (validated.some(({ record }) => record.sourceId !== sourceId)) {
      throw new TypeError("Fiche d'une autre source");
    }
    this.#client = client;
    this.#sourceId = sourceId;
    this.#records = validated.map(({ record }) => record);
  }

  getRecords() {
    return reconcileIndex(this.#records, []).map(({ record }) => record);
  }

  updateRecord(record) {
    if (this.#selecting) throw new Error("Une sélection est déjà en cours");
    if (!isValidIndexRecord(record) || record.sourceId !== this.#sourceId) {
      throw new TypeError("Fiche de session invalide");
    }
    const index = this.#records.findIndex((entry) => entry.itemId === record.itemId);
    if (index < 0) throw new Error("Fiche de session introuvable");
    const next = this.getRecords();
    next[index] = record;
    this.#records = reconcileIndex(next, []).map(({ record: copy }) => copy);
  }

  async selectFiles(maxItems) {
    if (!Number.isSafeInteger(maxItems) || maxItems < 1) {
      throw new TypeError("La limite de sélection doit être un entier positif");
    }
    if (this.#selecting) throw new Error("Une sélection est déjà en cours");
    this.#selecting = true;
    try {
      const selected = await this.#client.pickFiles(maxItems);
      const discovered = adaptDriveResults(this.#sourceId, selected);
      if (discovered.length > maxItems) throw new Error("La sélection dépasse la limite demandée");
      const next = reconcileIndex(this.#records, discovered);
      this.#records = next.map(({ record }) => record);
      return { selectedCount: discovered.length, records: this.getRecords() };
    } finally {
      this.#selecting = false;
    }
  }

  search(query, options = {}) {
    return searchIndex(this.#records, query, options);
  }
}