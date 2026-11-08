import { test } from "node:test";
import assert from "node:assert/strict";
import { searchContent, searchContentInDocuments } from "../content-search.js";
import { normalizeText } from "../search-utils.js";

const doc = segments => ({ sourceId: "local", itemId: "1", name: "Contrat", segments });

test("les extraits exacts justifient chaque terme même après 200 caractères ou sur plusieurs lignes", () => {
  const text = `${"préfixe ".repeat(50)}Impossible de résilier\navant décembre.`;
  const reasons = searchContent(doc([text]), "résilier décembre");
  assert.equal(reasons.length, 2);
  for (const reason of reasons) {
    assert.ok(text.includes(reason.proof.excerpt));
    assert.ok(normalizeText(reason.proof.excerpt).includes(reason.matchedWords[0]));
    assert.equal(reason.source, "extracted");
  }
});

test("seuls les segments explicitement extraits sont recherchés", () => {
  const input = { ...doc([]), content: "OCR indisponible", summary: "résumé inventé" };
  assert.deepEqual(searchContent(input, "ocr"), []);
  assert.deepEqual(searchContent(input, "inventé"), []);
});

test("les textes HTML restent des extraits littéraux", () => {
  const text = '<img src=x onerror=alert(1)> facture';
  const [reason] = searchContent(doc([text]), "facture");
  assert.equal(reason.proof.excerpt, text);
});

test("validation des requêtes, documents et identités sans collision", () => {
  assert.throws(() => searchContentInDocuments([], ""), TypeError);
  assert.throws(() => searchContentInDocuments([null], "test"), TypeError);
  assert.throws(() => searchContentInDocuments([doc([]), doc([])], "test"), /dupliquée/);
  const first = { sourceId: "a|b", itemId: "c", name: "x", segments: ["test"] };
  const second = { sourceId: "a", itemId: "b|c", name: "x", segments: ["test"] };
  assert.equal(searchContentInDocuments([first, second], "test").length, 2);
});

test("aucune mutation et absence de correspondance", () => {
  const input = doc(["Une preuve exacte"]);
  const before = structuredClone(input);
  const results = searchContent(input, "preuve");
  results[0].proof.excerpt = "modifié";
  assert.deepEqual(input, before);
  assert.deepEqual(searchContent(input, "absent"), []);
});
