import test from "node:test";
import assert from "node:assert/strict";
import { compareOneDriveCopy, oneDriveDocumentId, readOneDriveDocument } from "../onedrive-document.js";
import { IndexSession } from "../index-session.js";
import { getInventorySource, filterSearchResultsByChips } from "../data-inventory.js";

const item = { id: "file!1", name: "test.txt", size: 12, lastModifiedDateTime: "2025-01-02T00:00:00Z" };
const options = { item, accountId: "account-a", getToken: async () => "synthetic-token" };

test("texte OneDrive recherché et provenance restaurée, isolé par compte", async () => {
  const calls = [];
  const result = await readOneDriveDocument({ ...options, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://a.files.1drv.com/synthetic" });
    return new Response("facture rare");
  } });
  assert.equal(calls[0].init.headers.Authorization, "Bearer synthetic-token");
  assert.equal(calls[1].init.headers, undefined);
  assert.equal(result.coverage, "partial");
  assert.equal(result.document.contentProvenance.method, "onedrive-text");
  assert.equal(getInventorySource(result.document), "onedrive");
  assert.notEqual(await oneDriveDocumentId("account-b", item.id), result.document.id);
  assert.equal(filterSearchResultsByChips([{ document: result.document }], { source: "onedrive" }).length, 1);
  const session = new IndexSession();
  assert.equal(await session.restoreDocumentContent(structuredClone(result.document)), "verified");
  const restored = structuredClone(result.document);
  await session.restoreDocumentContent(restored);
  session.syncDocuments([restored]);
  assert.equal(session.search("rare")[0].sourceId, "onedrive");
  restored.content += " altéré";
  assert.equal(await session.restoreDocumentContent(restored), "invalid");
});

test("métadonnées seules pour format non pris en charge, taille et PDF non lisible", async () => {
  const never = async () => { throw new Error("appel inattendu"); };
  assert.equal((await readOneDriveDocument({ ...options, item: { ...item, name: "photo.jpg" }, fetchImpl: never })).coverage, "metadata");
  assert.equal((await readOneDriveDocument({ ...options, item: { ...item, size: 1048577 }, fetchImpl: never })).reason, "taille dépassée");
  let calls = 0;
  const invalidPdf = await readOneDriveDocument({ ...options, item: { ...item, name: "f.pdf" }, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://files.1drv.com/synthetic" }) : new Response("pas un PDF");
  } });
  assert.equal(invalidPdf.coverage, "metadata");
  assert.match(invalidPdf.reason, /PDF/);
});

test("refuse lien malveillant et erreur Graph sans divulguer l'URL de téléchargement", async () => {
  await assert.rejects(readOneDriveDocument({ ...options, fetchImpl: async () =>
    Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://evil.invalid/secret" })
  }), /non autorisé/);
  await assert.rejects(readOneDriveDocument({ ...options, fetchImpl: async () => new Response("", { status: 429 }) }), /HTTP 429/);
  let calls = 0;
  await assert.rejects(readOneDriveDocument({ ...options, fetchImpl: async () => {
    calls += 1;
    if (calls === 1) return Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://files.1drv.com/secret" });
    throw new Error("secret");
  } }), error => !error.message.includes("secret"));
});

test("contrôle la taille réelle même si les métadonnées sont fausses", async () => {
  let calls = 0;
  const result = await readOneDriveDocument({ ...options, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://files.1drv.com/synthetic" })
      : new Response(new Uint8Array(1048577));
  } });
  assert.equal(result.coverage, "metadata");
  assert.equal(result.reason, "taille dépassée");
});

test("compare les copies par nom et version fournisseur sans présumer les anciennes versions", async () => {
  const current = { name: "test.txt", eTag: '"v1"' };
  const copy = { name: "test.txt", oneDriveETag: '"v1"', content: "correction locale" };
  assert.equal(compareOneDriveCopy(copy, current), "unchanged");
  assert.equal(compareOneDriveCopy(copy, { ...current, eTag: '"v2"' }), "changed");
  assert.equal(compareOneDriveCopy(copy, { ...current, name: "renommé.txt" }), "changed");
  assert.equal(compareOneDriveCopy({ name: "test.txt" }, current), "unknown");
  assert.equal(compareOneDriveCopy(copy, { name: "test.txt" }), "unknown");
  assert.equal(copy.content, "correction locale");
  assert.throws(() => compareOneDriveCopy(null, current), /invalide/);
});

test("conserve la version fournisseur pour les nouvelles copies seulement si disponible", async () => {
  const never = async () => { throw new Error("appel inattendu"); };
  const withVersion = await readOneDriveDocument({
    ...options, item: { ...item, name: "photo.jpg", eTag: '"v1"' }, fetchImpl: never
  });
  const withoutVersion = await readOneDriveDocument({
    ...options, item: { ...item, name: "photo.jpg" }, fetchImpl: never
  });
  assert.equal(withVersion.document.oneDriveETag, '"v1"');
  assert.equal(withoutVersion.document.oneDriveETag, undefined);
});
