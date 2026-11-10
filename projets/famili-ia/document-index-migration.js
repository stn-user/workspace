import { createDocumentIndexRecord } from "./document-index.js";
import { getInventorySource } from "./data-inventory.js";
import { INDEX_RECORD_SCHEMA_VERSION, migrateIndexRecord } from "./index-record.js";

export async function migrateDocumentIndexes(documents, persist) {
  if (!Array.isArray(documents) || typeof persist !== "function") {
    throw new TypeError("Documents et fonction de persistance requis");
  }

  const migrated = [];
  for (const document of documents) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new TypeError("Document persistant invalide");
    }
    if (document.iv instanceof Uint8Array && document.data instanceof Uint8Array) {
      throw new Error(`Impossible de migrer le document ${document.id ?? "inconnu"} : données chiffrées illisibles`);
    }
    if (Object.hasOwn(document, "indexRecord")) {
      const indexRecord = migrateIndexRecord(document.indexRecord);
      if (indexRecord.itemId !== document.id ||
          indexRecord.sourceId !== getInventorySource(document)) {
        throw new TypeError(`Fiche d'index invalide pour le document ${document.id ?? "inconnu"}`);
      }
      if (document.indexRecord.schema === INDEX_RECORD_SCHEMA_VERSION) {
        migrated.push(document);
      } else {
        const updated = { ...document, indexRecord };
        await persist(updated);
        migrated.push(updated);
      }
      continue;
    }

    const updated = {
      ...document,
      indexRecord: await createDocumentIndexRecord(document, { previous: null })
    };
    await persist(updated);
    migrated.push(updated);
  }
  return migrated;
}

export async function rollbackDocumentIndexes(documents, persist) {
  if (!Array.isArray(documents) || typeof persist !== "function") {
    throw new TypeError("Documents et fonction de persistance requis");
  }

  const rolledBack = [];
  for (const document of documents) {
    if (!document || typeof document !== "object" || Array.isArray(document) ||
        typeof document.id !== "string" || !document.id.trim()) {
      throw new TypeError("Document persistant invalide");
    }
    if (document.iv instanceof Uint8Array && document.data instanceof Uint8Array) {
      throw new Error(`Impossible de restaurer le document ${document.id} : données chiffrées illisibles`);
    }
    if (!Object.hasOwn(document, "indexRecord")) {
      rolledBack.push(document);
      continue;
    }

    const indexRecord = migrateIndexRecord(document.indexRecord);
    if (indexRecord.itemId !== document.id || indexRecord.sourceId !== getInventorySource(document)) {
      throw new TypeError(`Fiche d'index invalide pour le document ${document.id}`);
    }
    const { indexRecord: removed, ...restored } = document;
    await persist(restored);
    rolledBack.push(restored);
  }
  return rolledBack;
}
