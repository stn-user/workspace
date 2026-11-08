import { getInventorySource } from "./data-inventory.js";
import { createIndexRecord, isValidIndexRecord } from "./index-record.js";
import { reconcileIndex } from "./index-reconciliation.js";
import { searchIndex } from "./index-search.js";
import { searchContentInDocuments } from "./content-search.js";
import { restoreContentSegments } from "./content-index.js";

export const INDEX_SOURCES = Object.freeze({ local: "local", drive: "drive" });

export class IndexSession {
  #records = [];
  #trusted = new WeakMap();
  #verified = new Map();
  #content = [];

  trustExtractedContent(document, segments) {
    if (!document || typeof document !== "object" || Array.isArray(document) ||
        typeof document.content !== "string" || !Array.isArray(segments) ||
        segments.some(segment => typeof segment !== "string" || !document.content.includes(segment))) {
      throw new TypeError("Texte extrait invalide");
    }
    const trusted = { original: document.content, segments: [...segments],
      provenance: document.contentProvenance ? JSON.stringify(document.contentProvenance) : null };
    this.#trusted.set(document, trusted);
    if (trusted.provenance) {
      const source = getInventorySource(document);
      if (!this.#verified.has(source)) this.#verified.set(source, new Map());
      this.#verified.get(source).set(document.id, trusted);
    }
  }

  async restoreDocumentContent(document) {
    this.#trusted.delete(document);
    this.#verified.get(getInventorySource(document))?.delete(document.id);
    const result = await restoreContentSegments(document);
    if (result.status === "verified") this.trustExtractedContent(document, result.segments);
    return result.status;
  }

  syncDocuments(documents) {
    if (!Array.isArray(documents)) throw new TypeError("Les documents doivent être un tableau");
    const sources = new Map();
    const contents = new Map();
    const activeTrust = new WeakMap();
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
      if (!contents.has(source)) contents.set(source, new Map());
      const trusted = this.#trusted.get(document) || this.#verified.get(source)?.get(document.id);
      const unchanged = trusted && trusted.original === document.content &&
        (!trusted.provenance || trusted.provenance === JSON.stringify(document.contentProvenance));
      if (unchanged) activeTrust.set(document, trusted);
      const segments = unchanged
        ? trusted.segments.filter(segment => segment.trim()) : [];
      contents.get(source).set(document.id, segments);
      sources.get(source).set(document.id, createIndexRecord(INDEX_SOURCES[source], document.id, {
        name: { value: document.name, source: "provider" },
        coverage: "metadata"
      }));
    }

    const discovered = [...sources.values()].flatMap(items => [...items.values()]);
    const next = reconcileIndex(this.#records, discovered)
      .filter(({ record }) => sources.get(record.sourceId)?.has(record.itemId))
      .map(({ record }) => ({ ...record, coverage: contents.get(record.sourceId).get(record.itemId).length
        ? "partial" : "metadata" }));
    this.#content = next.map(record => ({
      sourceId: record.sourceId, itemId: record.itemId, name: record.name.value,
      segments: contents.get(record.sourceId).get(record.itemId)
    }));
    this.#records = next;
    this.#trusted = activeTrust;
    for (const [source, entries] of this.#verified) {
      for (const id of entries.keys()) {
        if (!sources.get(source)?.has(id)) entries.delete(id);
      }
      if (!entries.size) this.#verified.delete(source);
    }
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
    next[index] = { ...record, coverage: this.#records[index].coverage };
    this.#records = reconcileIndex(next, []).map(({ record: copy }) => copy);
  }

  search(query, options = {}) {
    const matches = searchIndex(this.#records, query, options);
    const eligible = this.#content.filter(doc => {
      const record = this.#records.find(entry => entry.sourceId === doc.sourceId && entry.itemId === doc.itemId);
      return (options.sourceId === undefined || options.sourceId === doc.sourceId) &&
        (options.type === undefined || options.type === record.type) &&
        (options.coverage === undefined || options.coverage === record.coverage);
    });
    for (const result of searchContentInDocuments(eligible, query)) {
      let match = matches.find(entry => entry.sourceId === result.sourceId && entry.itemId === result.itemId);
      if (!match) {
        const record = this.#records.find(entry => entry.sourceId === result.sourceId && entry.itemId === result.itemId);
        match = { sourceId: record.sourceId, itemId: record.itemId, name: record.name.value,
          type: record.type, coverage: record.coverage, reasons: [] };
        matches.push(match);
      }
      match.reasons.push(...result.reasons);
    }
    return matches;
  }
}
