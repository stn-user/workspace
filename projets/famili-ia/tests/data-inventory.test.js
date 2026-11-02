import test from "node:test";
import assert from "node:assert/strict";
import {
  countInventorySources,
  filterInventoryDocuments,
  filterSearchResultsByChips,
  getInventoryIndexStatus,
  getInventorySource,
  getInventoryTypeKey,
  mergeInventoryDocuments
} from "../data-inventory.js";

test("merges demonstration and stored documents without duplicate IDs", () => {
  const demonstrationDocuments = [
    { id: "sample-1", name: "Original fictif" },
    { id: "sample-2", name: "Second fictif" }
  ];
  const storedDocuments = [
    { id: "sample-1", name: "Document stocké", isLocal: true },
    { id: "local-1", name: "Fichier local", isLocal: true }
  ];

  const documents = mergeInventoryDocuments(demonstrationDocuments, storedDocuments);

  assert.equal(documents.length, 3);
  assert.equal(documents.find((document) => document.id === "sample-1").name, "Document stocké");
  assert.deepEqual(countInventorySources(documents), { total: 3, local: 2, drive: 0, demo: 1 });
});

test("classifies real Drive, simulated Drive, and demonstration sources distinctly", () => {
  assert.equal(getInventorySource({ driveSource: true, isLocal: true }), "drive");
  assert.equal(getInventorySource({ driveDemo: true, isLocal: true }), "demo");
  assert.equal(getInventorySource({ isLocal: true }), "local");
  assert.equal(getInventorySource({}), "demo");
});

test("provides safe document type classes and accurate indexing status", () => {
  assert.equal(getInventoryTypeKey({ type: "Facture" }), "facture");
  assert.equal(getInventoryTypeKey({ type: "Vidéo" }), "video");
  assert.equal(getInventoryTypeKey({ type: "Type personnalisé" }), "other");
  assert.equal(getInventoryIndexStatus({ content: "Texte extrait" }), "text");
  assert.equal(getInventoryIndexStatus({ content: " \n " }), "metadata");
  assert.equal(getInventoryIndexStatus({}), "metadata");
});

test("applies legacy type and provenance chips consistently to unified search results", () => {
  const results = [
    { document: { type: "Facture", isLocal: true } },
    { document: { type: "Markdown", isLocal: true } },
    { document: { type: "Facture", driveSource: true, isLocal: true } },
    { document: { type: "Facture", driveDemo: true, isLocal: true } }
  ];

  assert.deepEqual(filterSearchResultsByChips(results, { type: "Facture" }), [results[0], results[2], results[3]]);
  assert.deepEqual(filterSearchResultsByChips(results, { type: "Texte" }), [results[1]]);
  assert.deepEqual(filterSearchResultsByChips(results, { source: "local" }), [results[0], results[1]]);
  assert.deepEqual(filterSearchResultsByChips(results, { type: "Facture", source: "drive" }), [results[2]]);
  assert.deepEqual(filterSearchResultsByChips(results, { type: "inconnu" }), []);
});

test("filters inventory by document type and preserves legacy type/category links", () => {
  const documents = [
    { id: "invoice", type: "Facture", name: "facture.pdf" },
    { id: "warranty", type: "Garantie", name: "garantie.pdf" },
    { id: "photo", type: "Image", name: "photo.jpg" }
  ];

  assert.deepEqual(filterInventoryDocuments(documents, { type: "Facture" }).map(({ id }) => id), ["invoice"]);
  assert.deepEqual(filterInventoryDocuments(documents, { type: "document", category: "Facture" }).map(({ id }) => id), ["invoice"]);
});

test("filters inventory by file category and document metadata", () => {
  const documents = [
    { id: "invoice", type: "Facture", name: "facture.pdf", category: "maison" },
    { id: "photo", type: "Image", name: "photo.jpg" },
    { id: "movie", type: "Vidéo", name: "film.mp4" }
  ];

  assert.deepEqual(filterInventoryDocuments(documents, { category: "Documents" }).map(({ id }) => id), ["invoice"]);
  assert.deepEqual(filterInventoryDocuments(documents, { category: "Images" }).map(({ id }) => id), ["photo"]);
  assert.deepEqual(filterInventoryDocuments(documents, { category: "Médias" }).map(({ id }) => id), ["movie"]);
  assert.deepEqual(filterInventoryDocuments(documents, { category: "maison" }).map(({ id }) => id), ["invoice"]);
});

test("combines type and category filters", () => {
  const documents = [
    { id: "invoice-pdf", type: "Facture", name: "facture.pdf" },
    { id: "invoice-photo", type: "Facture", name: "facture.jpg" },
    { id: "warranty-pdf", type: "Garantie", name: "garantie.pdf" }
  ];

  assert.deepEqual(
    filterInventoryDocuments(documents, { type: "Facture", category: "Documents" }).map(({ id }) => id),
    ["invoice-pdf"]
  );
});
