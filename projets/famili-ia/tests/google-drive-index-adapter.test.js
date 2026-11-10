import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptDriveResult, adaptDriveResults, isValidDriveResult } from "../google-drive-index-adapter.js";
import { GoogleDriveClient } from "../google-drive.js";
import { createIndexRecord, isValidIndexRecord } from "../index-record.js";
import { reconcileIndex } from "../index-reconciliation.js";

const result = (id = "drive-123", name = "facture.pdf", date = "15 janv. 2024") => ({
  id, name, type: "PDF", date, keywords: "mots privés", summary: "résumé privé",
  content: "contenu privé", isLocal: true, driveSource: true
});

test("conversion exacte, sans contenu ni date inventée", () => {
  for (const date of ["15 janv. 2024", "Date inconnue"]) {
    const record = adaptDriveResult("source", result("drive-123", "facture.pdf", date));
    assert.deepEqual(record, {
      schema: "1.1.0", sourceId: "source", itemId: "drive-123", type: null,
      name: { value: "facture.pdf", source: "provider", estimated: false, proof: null },
      location: null, dates: {}, coverage: "metadata", lastCheck: null, fields: []
    });
    assert.equal(isValidIndexRecord(record), true);
    assert.equal(JSON.stringify(record).includes("privé"), false);
  }
});

test("ordre des résultats et séparation des instances de source", () => {
  const input = [result("drive-1", "a.txt"), result("drive-2", "b.txt")];
  const first = adaptDriveResults("source-a", input);
  const second = adaptDriveResults("source-b", input);
  assert.deepEqual(first.map((item) => item.itemId), ["drive-1", "drive-2"]);
  assert.deepEqual(second.map((item) => item.itemId), ["drive-1", "drive-2"]);
  assert.deepEqual(first.map((item) => item.sourceId), ["source-a", "source-a"]);
  assert.deepEqual(second.map((item) => item.sourceId), ["source-b", "source-b"]);
});

test("validation explicite y compris pour une sélection vide", () => {
  assert.deepEqual(adaptDriveResults("source", []), []);
  for (const sourceId of ["", "  ", null, 2]) {
    assert.throws(() => adaptDriveResults(sourceId, []), TypeError);
    assert.throws(() => adaptDriveResult(sourceId, result()), TypeError);
  }
  for (const invalid of [
    null, [], {}, { ...result(), id: "" }, { ...result(), id: "123" },
    { ...result(), id: "drive-" }, { ...result(), name: " " },
    { ...result(), type: "image" }, { ...result(), date: null },
    { ...result(), content: "" }, { ...result(), summary: null },
    { ...result(), keywords: null }, { ...result(), driveSource: false },
    { ...result(), isLocal: false }
  ]) {
    assert.equal(isValidDriveResult(invalid), false);
    assert.throws(() => adaptDriveResult("source", invalid), TypeError);
    assert.throws(() => adaptDriveResults("source", [invalid]), TypeError);
  }
  assert.throws(() => adaptDriveResults("source", null), TypeError);
  assert.throws(() => adaptDriveResults("source", Array(1)), TypeError);
  assert.throws(() => adaptDriveResults("source", [result(), result()]), /dupliqué/);
  assert.equal(isValidDriveResult(result()), true);
});

test("aucune mutation ou dépendance de référence après conversion", () => {
  const input = [result()];
  const snapshot = structuredClone(input);
  const adapted = adaptDriveResults("source", input);
  adapted[0].name.value = "nouveau";
  adapted[0].fields.push({ name: "exemple" });
  assert.deepEqual(input, snapshot);
});

test("rapprochement conserve les corrections et les faits existants", () => {
  const existing = createIndexRecord("source", "drive-123", {
    name: { value: "corrigé.pdf", source: "user-input" },
    coverage: "analyzed",
    fields: [{ name: "montant", value: "42 EUR", source: "extracted",
      proof: { excerpt: "Total : 42 EUR", location: "page 1" } }]
  });
  const [entry] = reconcileIndex([existing], adaptDriveResults("source", [result()]));
  assert.deepEqual(entry.record, existing);
  assert.equal(entry.verificationState, "needs-review");
});

test("sortie réelle du client Drive simulé sans appel réseau supplémentaire", async () => {
  const client = new GoogleDriveClient({ apiKey: "test", appId: "test", clientId: "test" });
  const calls = [];
  client.driveRequest = async (url) => {
    calls.push(url.toString());
    if (url.searchParams.get("alt") === "media") return new Response("Montant fictif : 42 euros");
    return Response.json({
      id: "picker-id", name: "facture.txt", mimeType: "text/plain",
      size: "25", modifiedTime: "2026-10-09T12:00:00.000Z"
    });
  };
  const loaded = await client.readSelectedFile({ id: "picker-id", name: "facture.txt" });
  assert.equal(calls.length, 2);
  assert.equal(loaded.id, "drive-picker-id");
  assert.equal(loaded.content, "Montant fictif : 42 euros");
  const [record] = adaptDriveResults("instance", [loaded]);
  assert.equal(calls.length, 2);
  assert.deepEqual(record, {
    schema: "1.1.0", sourceId: "instance", itemId: "drive-picker-id", type: null,
    name: { value: "facture.txt", source: "provider", estimated: false, proof: null },
    location: null, dates: {}, coverage: "metadata", lastCheck: null, fields: []
  });
});
