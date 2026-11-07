import { test } from "node:test";
import assert from "node:assert/strict";
import { searchIndexWithContext, isValidSourceDescriptor } from "../index-search-context.js";
import { searchIndex } from "../index-search.js";
import { createIndexRecord } from "../index-record.js";

const descriptor = (sourceId, overrides = {}) => ({
  sourceId, scope: null, availability: "unknown", indexing: "unknown", lastCheck: null, ...overrides
});
const record = (sourceId, itemId, value) => createIndexRecord(sourceId, itemId, {
  name: { value, source: "provider" }, coverage: "metadata"
});

test("résultats multi-sources et états explicites sans déduction de complétude", () => {
  const records = [record("drive", "1", "Facture.pdf"), record("local", "2", "Facture.txt")];
  const sources = [
    descriptor("drive", { scope: "Sélection Picker", availability: "available", indexing: "complete", lastCheck: "2024-02-29" }),
    descriptor("local", { scope: "Dossier choisi", availability: "available", indexing: "in-progress" }),
    descriptor("offline", { availability: "unavailable", indexing: "partial" })
  ];
  assert.deepEqual(searchIndexWithContext(records, "facture", sources), {
    results: searchIndex(records, "facture"),
    sources: [
      { ...sources[0], resultCount: 1 },
      { ...sources[1], resultCount: 1 },
      { ...sources[2], resultCount: 0 }
    ]
  });
  assert.deepEqual(searchIndexWithContext(records, "introuvable", sources), {
    results: [], sources: sources.map((source) => ({ ...source, resultCount: 0 }))
  });
});

test("filtre une source déclarée sans ignorer les fiches non déclarées", () => {
  const sources = [descriptor("a"), descriptor("b", { indexing: "partial" })];
  const records = [record("a", "1", "facture"), record("b", "1", "facture")];
  const response = searchIndexWithContext(records, "facture", sources, { sourceId: "b" });
  assert.deepEqual(response, {
    results: searchIndex(records, "facture", { sourceId: "b" }),
    sources: [{ ...sources[1], resultCount: 1 }]
  });
  assert.throws(() => searchIndexWithContext(records, "facture", sources, { sourceId: "missing" }), /non déclarée/);
  assert.throws(() => searchIndexWithContext([...records, record("missing", "x", "autre")], "facture", sources, { sourceId: "a" }), /non déclarée/);
  assert.deepEqual(searchIndexWithContext([], "facture", sources, { sourceId: "a" }), {
    results: [], sources: [{ ...sources[0], resultCount: 0 }]
  });
});

test("validations des sources, dates et champs obligatoires", () => {
  const valid = descriptor("s", { lastCheck: "2024-02-29T13:00:00Z", scope: "périmètre" });
  assert.equal(isValidSourceDescriptor(valid), true);
  const invalid = [
    null, [], {}, descriptor(" "), { ...valid, scope: "" },
    { ...valid, availability: null }, { ...valid, availability: "offline" },
    { ...valid, indexing: null }, { ...valid, indexing: "finished" },
    { ...valid, lastCheck: "2023-02-29" }, { ...valid, lastCheck: "2024-01-01junk" },
    { ...valid, lastCheck: "2024-01-01T12:00:00+01:00" },
    { ...valid, extra: true }, { ...valid, [Symbol("extra")]: true }
  ];
  for (const value of invalid) {
    assert.equal(isValidSourceDescriptor(value), false);
    assert.throws(() => searchIndexWithContext([], "facture", [value]), TypeError);
  }
  assert.throws(() => searchIndexWithContext([], "facture", null), TypeError);
  assert.throws(() => searchIndexWithContext([], "facture", [valid, valid]), /dupliquée/);
  assert.throws(() => searchIndexWithContext([], "facture", Array(1)), TypeError);
});

test("préserve les sources nommées comme des propriétés de prototype", () => {
  const sources = [descriptor("__proto__"), descriptor("constructor")];
  const records = [record("__proto__", "1", "facture"), record("constructor", "2", "facture")];
  const result = searchIndexWithContext(records, "facture", sources);
  assert.deepEqual(result.sources, sources.map((source) => ({ ...source, resultCount: 1 })));
});

test("erreurs du moteur propagées et entrées indépendantes des sorties", () => {
  const records = [createIndexRecord("s", "1", {
    fields: [{ name: "fact", value: "facture", source: "extracted",
      proof: { excerpt: "facture", location: "page 1" } }]
  })];
  const sources = [descriptor("s")];
  const options = { sourceId: "s" };
  const snapshot = structuredClone({ records, sources, options });
  const output = searchIndexWithContext(records, "facture", sources, options);
  output.sources[0].scope = "modifié";
  output.results[0].reasons[0].proof.excerpt = "modifié";
  output.results[0].reasons[0].matchedWords.push("modifié");
  assert.deepEqual({ records, sources, options }, snapshot);
  assert.throws(() => searchIndexWithContext(records, "!!!", sources), /Requête vide/);
  assert.throws(() => searchIndexWithContext(records, "facture", sources, { unsupported: true }), /Option inconnue/);
  assert.throws(() => searchIndexWithContext([records[0], records[0]], "facture", sources), /dupliquées/);
  assert.throws(() => searchIndexWithContext([{}], "facture", sources), /invalide/);
});
