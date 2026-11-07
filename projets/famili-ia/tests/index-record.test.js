import { test } from "node:test";
import assert from "node:assert/strict";
import { createIndexRecord, isValidIndexRecord, fakeConnectorAdapter } from "../index-record.js";
import { collectSourcePages } from "../source-orchestrator.js";
import { FakeSourceConnector } from "./fixtures/fake-source-connector.js";

test("fiche document complète : dates, provenance, preuve et estimation distinctes", () => {
  const options = {
    type: "document",
    name: { value: "facture.pdf", source: "provider" },
    dates: {
      creation: { value: "2024-01-01", source: "provider" },
      modification: { value: "2024-01-02T13:00:00Z", source: "provider" },
      achat: { value: "2024-01-03", source: "extracted", proof: { excerpt: "Achat : 03/01/2024", location: "page 1" } },
      echeance: { value: "2025-01-03", source: "auto-estimate" }
    },
    coverage: "analyzed",
    lastCheck: "2024-02-01T10:00:00.000Z",
    fields: [{ name: "category", value: "garantie", source: "user-input" }]
  };
  const inputCopy = structuredClone(options);
  const record = createIndexRecord("src", "id", options);
  assert.deepEqual(options, inputCopy);
  assert.deepEqual(record, {
    schema: "1.0.0", sourceId: "src", itemId: "id", type: "document",
    name: { value: "facture.pdf", source: "provider", estimated: false, proof: null },
    dates: {
      creation: { value: "2024-01-01", source: "provider", estimated: false, proof: null },
      modification: { value: "2024-01-02T13:00:00Z", source: "provider", estimated: false, proof: null },
      achat: { value: "2024-01-03", source: "extracted", estimated: false, proof: { excerpt: "Achat : 03/01/2024", location: "page 1" } },
      echeance: { value: "2025-01-03", source: "auto-estimate", estimated: true, proof: null }
    },
    coverage: "analyzed", lastCheck: "2024-02-01T10:00:00.000Z",
    fields: [{ name: "category", value: "garantie", source: "user-input", estimated: false, proof: null }]
  });
  options.dates.achat.proof.excerpt = "modifié";
  options.fields[0].value = "modifié";
  assert.equal(record.dates.achat.proof.excerpt, "Achat : 03/01/2024");
  assert.equal(record.fields[0].value, "garantie");
  assert.equal(isValidIndexRecord(record), true);
});

test("photo et informations inconnues : aucune date ni preuve inventée", () => {
  const photo = createIndexRecord("local", "photo", {
    type: "photo",
    dates: { priseDeVue: { value: "2024-07-14", source: "provider", estimated: true } }
  });
  assert.deepEqual(photo.dates, { priseDeVue: {
    value: "2024-07-14", source: "provider", estimated: true, proof: null
  } });
  assert.equal(photo.name, null);
  assert.equal(photo.coverage, null);
  assert.equal(photo.lastCheck, null);
  assert.deepEqual(photo.fields, []);
  assert.deepEqual(createIndexRecord("local", "empty").dates, {});
});

test("identités composites et niveaux de couverture valides", () => {
  for (const coverage of ["unavailable", "metadata", "partial", "analyzed"]) {
    const first = createIndexRecord("source-a", "same", { coverage });
    const second = createIndexRecord("source-b", "same", { coverage });
    assert.equal(first.coverage, coverage);
    assert.equal(isValidIndexRecord(first), true);
    assert.notEqual(first.sourceId, second.sourceId);
    assert.equal(first.itemId, second.itemId);
  }
});

test("refuse identités, champs, preuves, options et dates incohérents", () => {
  for (const [source, item] of [["", "id"], ["  ", "id"], ["src", ""], ["src", 42]]) {
    assert.throws(() => createIndexRecord(source, item), TypeError);
  }
  const invalidOptions = [
    null, [], { type: "video" }, { coverage: "invalid" }, { name: 42 },
    { name: { value: "x", source: "bogus" } }, { dates: [] },
    { dates: { achat: { value: "2024-02-30", source: "provider" } } },
    { dates: { achat: { value: "2024-01-01junk", source: "provider" } } },
    { dates: { achat: { value: "2024-01-01", source: "provider", extra: true } } },
    { dates: { vue: { value: "2024-01-01", source: "provider" } } },
    { lastCheck: "demain" }, { fields: "texte" }, { fields: Array(1) },
    { fields: [{ name: "", value: "x", source: "provider" }] },
    { fields: [{ name: "x", value: "x", source: "auto-estimate", estimated: false }] },
    { fields: [{ name: "x", value: "x", source: "provider", estimated: "false" }] },
    { fields: [{ name: "x", value: "x", source: "extracted", proof: { location: "page 1" } }] },
    { fields: [{ name: "x", value: "x", source: "extracted", proof: { excerpt: "x", location: 42 } }] },
    { proof: { excerpt: "preuve non liée" } }
  ];
  for (const options of invalidOptions) assert.throws(() => createIndexRecord("src", "id", options), TypeError);
});

test("le validateur refuse aussi une fiche modifiée ou incomplète", () => {
  const record = createIndexRecord("src", "id");
  const invalid = [
    null, [], {}, { ...record, schema: "0" }, { ...record, name: 15 },
    { ...record, dates: { creation: { value: "invalide", source: "provider" } } },
    { ...record, lastCheck: "impossible" }, { ...record, fields: [null] },
    { ...record, type: undefined }, { ...record, extra: true }
  ];
  for (const value of invalid) assert.equal(isValidIndexRecord(value), false);
});

test("conversion de plusieurs pages fictives sans lire le contenu ni déduire le type", async () => {
  const connector = new FakeSourceConnector({
    sourceId: "source-a", pageSize: 1,
    items: [
      { id: "1", name: "facture.pdf", content: "privé" },
      { id: "2", name: "photo.jpg", content: "privé" }
    ]
  });
  connector.authorize("allow");
  connector.readContent = () => { throw new Error("lecture interdite"); };
  const discovered = await collectSourcePages(connector);
  assert.equal(discovered.pagesRead, 2);
  const records = fakeConnectorAdapter({ items: discovered.items }, "source-a");
  assert.deepEqual(records, ["facture.pdf", "photo.jpg"].map((name, index) => ({
    schema: "1.0.0", sourceId: "source-a", itemId: String(index + 1), type: null,
    name: { value: name, source: "provider", estimated: false, proof: null },
    dates: {}, coverage: "metadata", lastCheck: null, fields: []
  })));
  assert.equal(records.every(isValidIndexRecord), true);
  assert.throws(() => fakeConnectorAdapter({ items: [{ id: "x" }] }, "source-a"), TypeError);
  assert.throws(() => fakeConnectorAdapter({ items: Array(1) }, "source-a"), TypeError);
  assert.throws(() => fakeConnectorAdapter({ items: [] }, " "), TypeError);
});
