import { test } from "node:test";
import assert from "node:assert/strict";
import { searchContent, searchContentInDocuments } from "../content-search.js";
import { createIndexRecord } from "../index-record.js";

test("recherche par nom dans un document local", async (t) => {
  const doc = {
    sourceId: "local",
    itemId: "doc-1",
    name: "Contrat d'assurance",
    content: "Texte complet du contrat...",
    summary: ""
  };
  
  const results = searchContent(doc, "assurance");
  assert.equal(results.length, 1);
  assert.equal(results[0].location, "name");
  assert.equal(results[0].excerpt, "Contrat d'assurance");
  assert.equal(results[0].matchedWords.length, 1);
  assert.equal(results[0].matchedWords[0], "assurance");
});

test("recherche par contenu extrait", async (t) => {
  const doc = {
    sourceId: "drive",
    itemId: "drive-1",
    name: "Facture.pdf",
    content: "Date d'echeance: 15/03/2025\nMontant total: 150 euros\nRef: FA-2025-001"
  };
  
  const results = searchContent(doc, "echeance 2025");
  assert.equal(results.length, 1);
  assert.equal(results[0].location, "content");
  assert.equal(results[0].source, "extracted");
  assert.ok(results[0].excerpt.includes("echeance"));
});

test("aucune correspondance", async (t) => {
  const doc = {
    sourceId: "local",
    itemId: "doc-1",
    name: "Document test",
    content: "Texte de base"
  };
  
  const results = searchContent(doc, "motabsent");
  assert.equal(results.length, 0);
});

test("requete vide rejee", async (t) => {
  const doc = { sourceId: "local", itemId: "doc-1", name: "Test" };
  assert.throws(() => searchContent(doc, ""), TypeError);
  assert.throws(() => searchContent(doc, "   "), TypeError);
});

test("document avec message derreur ignore", async (t) => {
  const doc = {
    sourceId: "local",
    itemId: "doc-1",
    name: "Fichier",
    content: "Impossible de lire le contenu"
  };
  
  const results = searchContent(doc, "impossible");
  assert.equal(results.length, 0);
});

test("recherche dans plusieurs documents", async (t) => {
  const docs = [
    { sourceId: "local", itemId: "d1", name: "Facture A", content: "Total: 100 euros" },
    { sourceId: "drive", itemId: "d2", name: "Facture B", content: "Total: 200 euros" }
  ];
  
  const results = searchContentInDocuments(docs, "facture");
  assert.equal(results.length, 2);
  assert.equal(results[0].sourceId, "local");
  assert.equal(results[1].sourceId, "drive");
});

test("deux sources avec meme itemId", async (t) => {
  const docs = [
    { sourceId: "local", itemId: "same-id", name: "Local Doc", content: "Texte local" },
    { sourceId: "drive", itemId: "same-id", name: "Drive Doc", content: "Texte drive" }
  ];
  
  const results = searchContentInDocuments(docs, "texte");
  assert.equal(results.length, 2);
  assert.equal(results[0].sourceId, "local");
  assert.equal(results[1].sourceId, "drive");
});

test("mutations externes ignorees", async (t) => {
  const doc = {
    sourceId: "local",
    itemId: "doc-1",
    name: "Original",
    content: "Contenu"
  };
  
  const results = searchContent(doc, "original");
  assert.equal(results[0].name, "Original");
});

test("recherche par plusieurs mots", async (t) => {
  const doc = {
    sourceId: "local",
    itemId: "doc-1",
    name: "Contrat de location",
    content: "Type: location\nAdresse: 12 rue test"
  };
  
  const results = searchContent(doc, "contrat location");
  assert.equal(results.length, 1);
  assert.equal(results[0].location, "name");
});

test("entree invalide rejetee", async (t) => {
  // Recherche avec null
  assert.throws(() => searchContent(null, "test"), TypeError);
  // Recherche avec undefined
  assert.throws(() => searchContent(undefined, "test"), TypeError);
});

test("pas de recherche dans les erreurs", async (t) => {
  const docs = [
    { sourceId: "local", itemId: "d1", name: "FichierA", content: "Erreur de lecture" },
    { sourceId: "local", itemId: "d2", name: "FichierB", content: "Texte valide avec mot" }
  ];
  
  // Rechercher un mot qui n'existe nulle part
  const results = searchContentInDocuments(docs, "inexistant");
  assert.equal(results.length, 0);
  
  // Vérifier que les messages d'erreur ne sont pas recherchés
  const results2 = searchContentInDocuments(docs, "lecture");
  // "lecture" est dans "Erreur de lecture" mais ce contenu est ignoré
  assert.equal(results2.length, 0);
});

test("extraits retornes correctement", async (t) => {
  const doc = {
    sourceId: "local",
    itemId: "doc-1",
    name: "Doc test",
    content: "Voici une phrase longue avec plusieurs mots cherches une correspondance exacte dans ce texte pour verifier que l'extrait est retourne correctement."
  };
  
  const results = searchContent(doc, "cherches correspondance");
  assert.equal(results.length, 1);
  assert.ok(typeof results[0].excerpt === "string");
  assert.ok(results[0].excerpt.length > 0);
});
