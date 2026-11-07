import { test } from "node:test";
import assert from "node:assert/strict";
import { searchIndex } from "../index-search.js";
import { createIndexRecord, fakeConnectorAdapter } from "../index-record.js";
import { adaptDriveResults } from "../google-drive-index-adapter.js";
import { FakeSourceConnector } from "./fixtures/fake-source-connector.js";
import { collectSourcePages } from "../source-orchestrator.js";

const make = (sourceId, itemId, options = {}) => createIndexRecord(sourceId, itemId, options);
const name = (value) => ({ value, source: "provider" });

test("recherche multisource normalisée par sous-chaînes, dans l'ordre", () => {
  const records = [
    make("local", "1", { name: name("Facture Électricité.pdf"), type: "document", coverage: "metadata" }),
    make("drive", "1", { name: name("FACTURE---ELECTRICITÉ.txt"), type: "document", coverage: "metadata" })
  ];
  const results = searchIndex(records, "ÉLEC, Factur!");
  assert.deepEqual(results.map(({ sourceId, itemId }) => [sourceId, itemId]), [["local", "1"], ["drive", "1"]]);
  assert.deepEqual(results[0].reasons, [{
    location: "name", value: "Facture Électricité.pdf", source: "provider",
    estimated: false, proof: null, matchedWords: ["elec", "factur"]
  }]);
  assert.deepEqual(searchIndex(records, "elec inconnu"), []);
});

test("mots répartis entre nom, date et champ : raisons et preuve exactes", () => {
  const record = make("s", "id", {
    name: name("Garantie aspirateur"), coverage: "partial",
    dates: { echeance: { value: "2025-03-15", source: "extracted",
      proof: { excerpt: "Fin : 15/03/2025", location: "page 1" } } },
    fields: [{ name: "marque", value: "Bosch", source: "auto-estimate" }]
  });
  const [result] = searchIndex([record], "garantie 2025 bosch");
  assert.deepEqual(result.reasons, [
    { location: "name", value: "Garantie aspirateur", source: "provider", estimated: false, proof: null, matchedWords: ["garantie"] },
    { location: "date.echeance", value: "2025-03-15", source: "extracted", estimated: false, proof: { excerpt: "Fin : 15/03/2025", location: "page 1" }, matchedWords: ["2025"] },
    { location: "field.marque", value: "Bosch", source: "auto-estimate", estimated: true, proof: null, matchedWords: ["bosch"] }
  ]);
  assert.deepEqual(searchIndex([make("s", "no-date", { name: name("Garantie aspirateur") })], "garantie 2025"), []);
});

test("filtres exacts combinés, valeurs inconnues et sans filtre", () => {
  const records = [
    make("a", "1", { name: name("photo fete"), type: "photo", coverage: "metadata" }),
    make("a", "2", { name: name("photo fete"), type: "document", coverage: "partial" }),
    make("b", "1", { name: name("photo fete"), type: "photo", coverage: "partial" }),
    make("b", "2", { name: name("photo fete") })
  ];
  const ids = (options) => searchIndex(records, "fete", options).map((r) => `${r.sourceId}:${r.itemId}`);
  assert.deepEqual(ids({}), ["a:1", "a:2", "b:1", "b:2"]);
  assert.deepEqual(ids({ sourceId: "a" }), ["a:1", "a:2"]);
  assert.deepEqual(ids({ type: "photo" }), ["a:1", "b:1"]);
  assert.deepEqual(ids({ coverage: "partial" }), ["a:2", "b:1"]);
  assert.deepEqual(ids({ sourceId: "b", type: "photo", coverage: "partial" }), ["b:1"]);
});

test("rejette requêtes, options, fiches et identités invalides sans collisions de paires", () => {
  const record = make("a|b", "c", { name: name("test") });
  const other = make("a", "b|c", { name: name("test") });
  assert.equal(searchIndex([record, other], "test").length, 2);
  for (const query of ["", "!!!", "   ", null, 42]) assert.throws(() => searchIndex([], query), TypeError);
  for (const options of [null, [], 42, { unknown: true }, { type: undefined }, { type: "video" },
    { coverage: "bad" }, { sourceId: "" }, { [Symbol("inconnu")]: true }]) {
    assert.throws(() => searchIndex([], "test", options), TypeError);
  }
  assert.throws(() => searchIndex(null, "test"), TypeError);
  assert.throws(() => searchIndex([{}], "test"), TypeError);
  assert.throws(() => searchIndex([record, record], "test"), /dupliquées/);
  assert.throws(() => searchIndex(Array(1), "test"), TypeError);
});

test("identifiants, noms techniques et preuves ne sont pas recherchables", () => {
  const record = make("source-secrete", "id-secret", {
    name: name("facture"),
    fields: [{ name: "nomtechnique", value: "valeur",
      source: "extracted", proof: { excerpt: "extraitconfidentiel", location: "lieucache" } }]
  });
  for (const word of ["secret", "nomtechnique", "extraitconfidentiel", "lieucache"]) {
    assert.deepEqual(searchIndex([record], word), []);
  }
});

test("ne partage ni preuve ni listes et ne modifie pas les entrées", () => {
  const record = make("s", "id", { fields: [{
    name: "fait", value: "preuve test", source: "extracted",
    proof: { excerpt: "preuve authentique", location: "page 1" }
  }] });
  const options = Object.freeze({ sourceId: "s" });
  const snapshot = structuredClone(record);
  const [result] = searchIndex([record], "preuve test", options);
  result.reasons[0].proof.excerpt = "modifié";
  result.reasons[0].matchedWords.push("modifié");
  assert.deepEqual(record, snapshot);
  assert.deepEqual(options, { sourceId: "s" });
});

test("fiches provenant de Drive simulé et de la fixture fictive", async () => {
  const drive = adaptDriveResults("drive", [{
    id: "drive-1", name: "Facture.pdf", type: "PDF", date: "Date inconnue",
    content: "confidentiel", keywords: "", summary: "", isLocal: true, driveSource: true
  }]);
  const connector = new FakeSourceConnector({
    sourceId: "local", pageSize: 1,
    items: [{ id: "1", name: "Facture.txt", content: "confidentiel" }]
  });
  connector.authorize("allow");
  const page = await collectSourcePages(connector);
  const local = fakeConnectorAdapter({ items: page.items }, "local");
  assert.deepEqual(searchIndex([...drive, ...local], "facture").map((r) => r.sourceId), ["drive", "local"]);
  assert.deepEqual(searchIndex([...drive, ...local], "confidentiel"), []);
});
