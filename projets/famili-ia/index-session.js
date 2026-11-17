import { getInventoryAccountRef, getInventorySource } from "./data-inventory.js";
import { createIndexRecord, isValidIndexRecord } from "./index-record.js";
import { reconcileIndex } from "./index-reconciliation.js";
import { preserveUserValues } from "./document-index.js";
import { matchesIndexFilters, searchIndex } from "./index-search.js";
import { searchContentInDocuments } from "./content-search.js";
import { restoreContentSegments } from "./content-index.js";

export const INDEX_SOURCES = Object.freeze({ local: "local", drive: "drive", onedrive: "onedrive", dropbox: "dropbox" });

function identityKey(sourceId, accountRef, itemId) {
  return JSON.stringify([sourceId, accountRef, itemId]);
}

function copyIndexRecord(record, { coverage = record.coverage, fields = record.fields, dates = record.dates } = {}) {
  return createIndexRecord(record.sourceId, record.itemId, {
    accountRef: record.accountRef,
    type: record.type,
    name: record.name,
    location: record.location,
    dates,
    coverage,
    lastCheck: record.lastCheck,
    fields
  });
}

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
      this.#verified.get(source).set(identityKey(source, getInventoryAccountRef(document), document.id), trusted);
    }
  }

  async restoreDocumentContent(document) {
    this.#trusted.delete(document);
    const source = getInventorySource(document);
    this.#verified.get(source)?.delete(identityKey(source, getInventoryAccountRef(document), document.id));
    const result = await restoreContentSegments(document);
    if (result.status === "verified") this.trustExtractedContent(document, result.segments);
    return result.status;
  }

  syncDocuments(documents) {
    if (!Array.isArray(documents)) throw new TypeError("Les documents doivent être un tableau");
    const sources = new Map();
    const contents = new Map();
    const activeTrust = new WeakMap();
    const recordsByIdentity = new Map(this.#records.map(record => [
      identityKey(record.sourceId, record.accountRef, record.itemId), record
    ]));
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
      const accountRef = getInventoryAccountRef(document);
      const identity = identityKey(INDEX_SOURCES[source], accountRef, document.id);
      const trusted = this.#trusted.get(document) || this.#verified.get(source)?.get(identity);
      const unchanged = trusted && trusted.original === document.content &&
        (!trusted.provenance || trusted.provenance === JSON.stringify(document.contentProvenance));
      if (unchanged) activeTrust.set(document, trusted);
      const segments = unchanged
        ? trusted.segments.filter(segment => segment.trim()) : [];
      contents.get(source).set(identity, segments);
      const sourceId = INDEX_SOURCES[source];
      const discovery = createIndexRecord(sourceId, document.id, {
        accountRef,
        name: { value: document.name, source: "provider" },
        location: typeof document.sourceDir === "string" && document.sourceDir.trim() &&
          !["Saisie manuelle", "Background Sync"].includes(document.sourceDir.trim())
          ? { value: document.sourceDir, source: "provider" }
          : null,
        coverage: "metadata"
      });
      sources.get(source).set(identity, discovery);

      const previous = recordsByIdentity.get(identity) || null;
      if (document.indexRecord !== undefined) {
        if (!isValidIndexRecord(document.indexRecord) ||
            document.indexRecord.sourceId !== sourceId || document.indexRecord.accountRef !== accountRef ||
            document.indexRecord.itemId !== document.id) {
          throw new TypeError("La fiche d'index persistée est invalide ou liée à une autre identité");
        }
        let persisted = copyIndexRecord(document.indexRecord);
        if (!segments.length) {
          persisted = copyIndexRecord(persisted, {
            coverage: "metadata",
            fields: persisted.fields.filter(field =>
              ["coordinates", "caption", "keyword"].includes(field.name) ||
              !["extracted", "auto-estimate"].includes(field.source)),
            dates: Object.fromEntries(Object.entries(persisted.dates)
              .filter(([, value]) => !["extracted", "auto-estimate"].includes(value.source)))
          });
        } else if (persisted.coverage === null || persisted.coverage === "metadata") {
          persisted = copyIndexRecord(persisted, { coverage: "partial" });
        }
        recordsByIdentity.set(identity, preserveUserValues(persisted, previous));
      }
    }

    const discovered = [...sources.values()].flatMap(items => [...items.values()]);
    const next = reconcileIndex([...recordsByIdentity.values()], discovered)
      .filter(({ record }) => sources.get(record.sourceId)?.has(
        identityKey(record.sourceId, record.accountRef, record.itemId)
      ))
      .map(({ record }) => ({ ...record, coverage: contents.get(record.sourceId).get(
        identityKey(record.sourceId, record.accountRef, record.itemId)
      ).length
        ? "partial" : "metadata" }));
    this.#content = next.map(record => ({
      sourceId: record.sourceId, accountRef: record.accountRef, itemId: record.itemId, name: record.name.value,
      segments: contents.get(record.sourceId).get(identityKey(record.sourceId, record.accountRef, record.itemId))
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

  getAllContentDocs() {
    return this.#content.map(({ sourceId, accountRef, itemId, segments }) => ({
      sourceId, accountRef, itemId, segments: [...segments]
    }));
  }

  updateRecord(record) {
    if (!isValidIndexRecord(record)) throw new TypeError("Fiche invalide");
    const index = this.#records.findIndex(entry =>
      entry.sourceId === record.sourceId && entry.accountRef === record.accountRef && entry.itemId === record.itemId);
    if (index < 0) throw new Error("Fiche introuvable");
    const next = this.getAllRecords();
    next[index] = { ...record, coverage: this.#records[index].coverage };
    this.#records = reconcileIndex(next, []).map(({ record: copy }) => copy);
  }

  search(query, options = {}) {
    const matches = searchIndex(this.#records, query, options);
    if (!query.trim()) return matches;
    const eligible = this.#content.filter(doc => {
      const record = this.#records.find(entry => entry.sourceId === doc.sourceId &&
        entry.accountRef === (doc.accountRef ?? null) && entry.itemId === doc.itemId);
      return record && matchesIndexFilters(record, options);
    });
    for (const result of searchContentInDocuments(eligible, query)) {
      let match = matches.find(entry => entry.sourceId === result.sourceId &&
        entry.accountRef === result.accountRef && entry.itemId === result.itemId);
      if (!match) {
        const record = this.#records.find(entry => entry.sourceId === result.sourceId &&
          entry.accountRef === result.accountRef && entry.itemId === result.itemId);
        match = { sourceId: record.sourceId, accountRef: record.accountRef, itemId: record.itemId, name: record.name.value,
          type: record.type, coverage: record.coverage, reasons: [] };
        matches.push(match);
      }
      match.reasons.push(...result.reasons);
    }
    return matches;
  }
}
