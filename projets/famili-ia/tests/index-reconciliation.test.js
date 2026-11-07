import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileIndex, removeIndexRecord } from "../index-reconciliation.js";
import { createIndexRecord, fakeConnectorAdapter, isValidIndexRecord } from "../index-record.js";
import { collectSourcePages } from "../source-orchestrator.js";
import { FakeSourceConnector } from "./fixtures/fake-source-connector.js";

const discovered = (sourceId, itemId, name = "Document.pdf") =>
  fakeConnectorAdapter({ items: [{ id: itemId, name }] }, sourceId)[0];

const withOptions = (sourceId, itemId, options) => createIndexRecord(sourceId, itemId, options);

test("découverte fictive, corrections, renommage et indisponibilité", async () => {
  const connector = new FakeSourceConnector({
    sourceId: "source", pageSize: 1,
    items: [
      { id: "a", name: "ancienne.pdf", content: "contenu fictif" },
      { id: "b", name: "autre.pdf", content: "contenu fictif" }
    ]
  });
  connector.authorize("allow");
  connector.readContent = () => { throw new Error("lecture de contenu interdite"); };
  const first = await collectSourcePages(connector);
  assert.equal(first.pagesRead, 2);
  const initial = reconcileIndex([], fakeConnectorAdapter({ items: first.items }, "source"));
  assert.deepEqual(initial.map((entry) => entry.verificationState), ["not-analyzed", "not-analyzed"]);
  const existing = initial.map(({ record }) => record);
  existing[0] = withOptions("source", "a", {
    name: existing[0].name, coverage: "analyzed", lastCheck: "2024-01-01",
    fields: [{ name: "montant", value: "42 EUR", source: "extracted",
      proof: { excerpt: "Total : 42 EUR", location: "page 1" } }]
  });
  existing[1] = withOptions("source", "b", {
    name: { value: "mon nom.pdf", source: "user-input" }, coverage: "partial",
    dates: { achat: { value: "2024-01-01", source: "user-input" } }
  });
  connector.updateItem("a", { name: "nouvelle.pdf", content: "contenu fictif" });
  connector.updateItem("b", { name: "renommé.pdf", content: "contenu fictif" });
  const next = await collectSourcePages(connector);
  const result = reconcileIndex(existing, fakeConnectorAdapter({ items: next.items }, "source"));
  assert.equal(result[0].record.name.value, "nouvelle.pdf");
  assert.equal(result[1].record.name.value, "mon nom.pdf");
  assert.equal(result[1].record.name.source, "user-input");
  assert.deepEqual(result.map((entry) => entry.verificationState), ["needs-review", "needs-review"]);
  assert.equal(result[0].record.coverage, "analyzed");
  assert.equal(result[0].record.lastCheck, "2024-01-01");
  assert.deepEqual(result[0].record.fields, existing[0].fields);
  assert.deepEqual(result[1].record.dates, existing[1].dates);
  assert.equal(result.every(({ record }) => isValidIndexRecord(record)), true);
  const snapshot = structuredClone(result);
  connector.setAvailable(false);
  await assert.rejects(collectSourcePages(connector), (error) => error.code === "unavailable");
  assert.deepEqual(result, snapshot);
});

test("identités exactes, séparateurs ambigus et idempotence", () => {
  const items = [discovered("a|b", "c"), discovered("a", "b|c"), discovered("z", "c")];
  const first = reconcileIndex([], items);
  assert.deepEqual(first.map(({ record }) => [record.sourceId, record.itemId]), [
    ["a|b", "c"], ["a", "b|c"], ["z", "c"]
  ]);
  const again = reconcileIndex(first.map(({ record }) => record), items);
  assert.deepEqual(again, first);
});

test("fiche absente conservée et analyse jamais présentée comme vérifiée", () => {
  const original = [
    withOptions("s", "a", { coverage: "partial" }),
    withOptions("s", "b", { coverage: "analyzed" }),
    withOptions("s", "c", { coverage: "unavailable" }),
    withOptions("s", "d", {})
  ];
  const result = reconcileIndex(original, []);
  assert.deepEqual(result.map(({ record }) => record), original);
  assert.deepEqual(result.map(({ verificationState }) => verificationState), [
    "needs-review", "needs-review", "not-analyzed", "unknown"
  ]);
});

test("mise à jour exacte du nom fournisseur et conservation de toute autre provenance", () => {
  const names = [
    { value: "A.pdf", source: "provider" },
    { value: "mon titre", source: "user-input" },
    { value: "extrait", source: "extracted" },
    { value: "estimation", source: "auto-estimate" },
    null
  ];
  const input = names.map((name, i) => withOptions("s", String(i), { name, coverage: "metadata" }));
  const result = reconcileIndex(input, names.map((_, i) => discovered("s", String(i), "a.pdf")));
  assert.deepEqual(result.map(({ record }) => record.name.value), [
    "a.pdf", "mon titre", "extrait", "estimation", "a.pdf"
  ]);
});

test("validation globale et rejet des découvertes hors périmètre", () => {
  const base = discovered("s", "id");
  const invalidDiscoveries = [
    { ...base, type: "document" },
    { ...base, coverage: "analyzed" },
    { ...base, lastCheck: "2024-01-01" },
    { ...base, name: null },
    { ...base, name: { ...base.name, source: "user-input" } },
    { ...base, name: { ...base.name, estimated: true } },
    { ...base, name: { ...base.name, proof: { excerpt: "preuve", location: null } } },
    { ...base, dates: { achat: { value: "2024-01-01", source: "provider" } } },
    { ...base, fields: [{ name: "text", value: "texte", source: "extracted" }] }
  ];
  for (const invalid of invalidDiscoveries) {
    assert.throws(() => reconcileIndex([], [invalid]), TypeError);
  }
  assert.throws(() => reconcileIndex(null, []), TypeError);
  assert.throws(() => reconcileIndex([base, base], []), /dupliquées/);
  assert.throws(() => reconcileIndex([], [base, base]), /dupliquées/);
  assert.throws(() => reconcileIndex([{}], []), TypeError);
  assert.throws(() => reconcileIndex([], Array(1)), TypeError);
});

test("entrées et sorties ne partagent pas leurs structures imbriquées", () => {
  const existing = [withOptions("s", "id", {
    name: { value: "titre", source: "user-input", proof: { excerpt: "preuve" } },
    dates: { achat: { value: "2024-01-01", source: "extracted", proof: { excerpt: "achat" } } },
    fields: [{ name: "tag", value: "facture", source: "user-input" }]
  })];
  const incoming = [discovered("s", "id", "nouveau.pdf")];
  const snapshot = structuredClone({ existing, incoming });
  const result = reconcileIndex(existing, incoming);
  result[0].record.dates.achat.proof.excerpt = "modifié";
  result[0].record.fields[0].value = "modifié";
  result[0].record.name.proof.excerpt = "modifié";
  assert.deepEqual({ existing, incoming }, snapshot);
  const added = reconcileIndex([], incoming);
  added[0].record.name.value = "modifié";
  assert.deepEqual(incoming, snapshot.incoming);
});

test("suppression explicite de l'index uniquement et erreurs signalées", () => {
  const records = [discovered("a", "same"), discovered("b", "same")];
  const result = removeIndexRecord(records, "a", "same");
  assert.equal(result.removed, true);
  assert.deepEqual(result.records, [records[1]]);
  result.records[0].name.value = "changé";
  assert.equal(records[1].name.value, "Document.pdf");
  assert.equal(records.length, 2);
  assert.throws(() => removeIndexRecord(records, "c", "same"), /non trouvée/);
  assert.throws(() => removeIndexRecord(records, " ", "same"), TypeError);
  assert.throws(() => removeIndexRecord([records[0], records[0]], "a", "same"), /dupliquées/);
});
