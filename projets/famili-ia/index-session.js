import { getInventorySource } from "./data-inventory.js";
import { createIndexRecord, isValidIndexRecord } from "./index-record.js";
import { reconcileIndex } from "./index-reconciliation.js";
import { searchIndex } from "./index-search.js";

export const INDEX_SOURCES = Object.freeze({ local: "local", drive: "drive" });

export class IndexSession {
  #records = [];

  syncDocuments(documents) {
    if (!Array.isArray(documents)) throw new TypeError("Les documents doivent être un tableau");
    const sources = new Map();
    for (const document of documents) {
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        throw new TypeError("Document invalide");
      }
      const source = getInventorySource(document);
      if (source === "demo") continue;
      if (typeof document.id !== "string" || !document.id.trim() ||
          typeof document.name !== "string" || !document.name.trim()) {
        throw new TypeError("Identité ou nom de document invalide");
      }
      if (!sources.has(source)) sources.set(source, new Map());
      sources.get(source).set(document.id, createIndexRecord(INDEX_SOURCES[source], document.id, {
        name: { value: document.name, source: "provider" },
        coverage: "metadata"
      }));
    }

    const discovered = [...sources.values()].flatMap(items => [...items.values()]);
    const next = reconcileIndex(this.#records, discovered)
      .filter(({ record }) => sources.get(record.sourceId)?.has(record.itemId))
      .map(({ record }) => record);
    this.#records = next;
  }

  getAllRecords() {
    return reconcileIndex(this.#records, []).map(({ record }) => record);
  }

  getRecordsBySource(sourceId) {
    if (!Object.values(INDEX_SOURCES).includes(sourceId)) throw new TypeError("Source inconnue");
    return this.getAllRecords().filter(record => record.sourceId === sourceId);
  }

  updateRecord(record) {
    if (!isValidIndexRecord(record)) throw new TypeError("Fiche invalide");
    const index = this.#records.findIndex(entry =>
      entry.sourceId === record.sourceId && entry.itemId === record.itemId);
    if (index < 0) throw new Error("Fiche introuvable");
    const next = this.getAllRecords();
    next[index] = record;
    this.#records = reconcileIndex(next, []).map(({ record: copy }) => copy);
  }

  search(query, options = {}) {
    return searchIndex(this.#records, query, options);
  }
}
