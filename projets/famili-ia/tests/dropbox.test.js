import { test } from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  canRefreshDropboxCopy, compareDropboxCopy, createDropboxAuthorization, describeDropboxChanges,
  DROPBOX_SCOPES, DropboxApiError, dropboxIdentity, mergeDropboxDocumentUpdate, readDropboxDocument, scanDropbox
} from "../dropbox.js";
import { createDocumentIndexRecord } from "../document-index.js";
import { restoreContentSegments } from "../content-index.js";
import { IndexSession } from "../index-session.js";
import { getInventorySource, countInventorySources } from "../data-inventory.js";
import { describeSources } from "../source-status.js";
import { readBoundedBytes } from "../read-bounded-bytes.js";

const file = { ".tag": "file", id: "id:fictif", name: "facture-piscine.txt", rev: "revision-fictive", size: 40,
  path_display: "/Maison/facture-piscine.txt", server_modified: "2026-01-03T10:00:00Z" };
const getToken = () => "jeton-de-test";
const page = (entries, cursor = "curseur", has_more = false) => Response.json({ entries, cursor, has_more });
const download = (text, metadata = file) => new Response(text, {
  headers: { "Dropbox-API-Result": JSON.stringify(metadata) }
});

test("OAuth Dropbox : PKCE S256, états aléatoires et uniquement les scopes de lecture", async () => {
  const first = await createDropboxAuthorization("cle-publique-fictive", "http://127.0.0.1:5192/dropbox-redirect.html");
  const second = await createDropboxAuthorization("cle-publique-fictive", "http://127.0.0.1:5192/dropbox-redirect.html");
  const url = new URL(first.url);
  assert.equal(url.origin, "https://www.dropbox.com");
  assert.equal(url.searchParams.get("scope"), DROPBOX_SCOPES.join(" "));
  assert.equal(url.searchParams.get("token_access_type"), "online");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(first.verifier))).toString("base64url");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.equal(url.searchParams.has("code_verifier"), false);
  await assert.rejects(createDropboxAuthorization("test", "http://non-local.invalid/retour"), /HTTPS/);
  await assert.rejects(createDropboxAuthorization("test", "https://user:pass@example.invalid/retour"), /invalide/);
});

test("Dropbox : pagination récursive et déduplication des identifiants sans suivre une URL fournie", async () => {
  const seen = [];
  const calls = [];
  const result = await scanDropbox({
    getToken, onItem: item => { seen.push(item.id); }, onProgress: () => {},
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
      return calls.length === 1 ? page([file], "suite", true)
        : page([file, { ...file, id: "id:autre", name: "autre.txt" }], "fin");
    }
  });
  assert.deepEqual(seen, ["id:fictif", "id:autre"]);
  assert.deepEqual(result, { files: 2, pages: 2 });
  assert.deepEqual(calls[0].body, { path: "", recursive: true, include_deleted: false });
  assert.deepEqual(calls[1].body, { cursor: "suite" });
  assert.equal(calls[1].url, "https://api.dropboxapi.com/2/files/list_folder/continue");
  assert.equal(calls[0].headers.Authorization, "Bearer jeton-de-test");
});

test("Dropbox : reprise depuis le curseur et sauvegarde après chaque page traitée", async () => {
  const calls = [];
  const events = [];
  const result = await scanDropbox({
    getToken, cursor: "curseur-persisté",
    onItem: item => { events.push(`item:${item.id}`); },
    onProgress: () => {},
    onPageComplete: page => { events.push(`page:${page.cursor}:${page.hasMore}`); },
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return calls.length === 1 ? page([file], "curseur-suivant", true) : page([], "terminé");
    }
  });
  assert.deepEqual(calls, [
    { url: "https://api.dropboxapi.com/2/files/list_folder/continue", body: { cursor: "curseur-persisté" } },
    { url: "https://api.dropboxapi.com/2/files/list_folder/continue", body: { cursor: "curseur-suivant" } }
  ]);
  assert.deepEqual(events, [
    "item:id:fictif", "page:curseur-suivant:true", "page:terminé:false"
  ]);
  assert.deepEqual(result, { files: 1, pages: 2 });
  await assert.rejects(scanDropbox({
    getToken, onItem: () => {}, onProgress: () => {}, cursor: "",
    fetchImpl: () => { throw new Error("Aucun appel avec un curseur vide"); }
  }), /reprise Dropbox invalide/);
});

test("Dropbox : revue exige une version et un compte vérifiables et conserve les annotations", () => {
  const fingerprint = "a".repeat(64);
  const existing = {
    id: "dropbox-fictif", name: file.name, sourceDir: file.path_display, dropboxSource: true,
    dropboxAccountFingerprint: fingerprint, dropboxRev: "version-1",
    photoAnnotations: [{ id: "annotation-fictive", text: "Repère personnel" }],
    contentProvenance: { method: "ancienne-preuve" }, indexRecord: { stale: true }
  };
  assert.equal(canRefreshDropboxCopy(existing, fingerprint), true);
  assert.equal(canRefreshDropboxCopy(existing, "b".repeat(64)), false);
  assert.equal(compareDropboxCopy(existing, file), "changed");
  assert.deepEqual(describeDropboxChanges(existing, {
    ...file, name: "facture-renommee.txt", path_display: "/Archives/facture-renommee.txt"
  }), [
    "nom : facture-piscine.txt → facture-renommee.txt",
    "emplacement Dropbox modifié",
    "version Dropbox différente"
  ]);
  assert.equal(compareDropboxCopy(existing, { ...file, rev: undefined }), "unknown");

  const refreshed = {
    ...existing, name: file.name, dropboxRev: "version-2", content: "Contenu actualisé"
  };
  delete refreshed.photoAnnotations;
  delete refreshed.contentProvenance;
  delete refreshed.indexRecord;
  delete refreshed.sourceDir;
  delete refreshed.modificationDate;
  const merged = mergeDropboxDocumentUpdate(existing, refreshed);
  assert.deepEqual(merged.photoAnnotations, existing.photoAnnotations);
  assert.equal(merged.content, "Contenu actualisé");
  assert.equal(merged.contentProvenance, undefined);
  assert.equal(merged.sourceDir, undefined);
  assert.equal(merged.modificationDate, undefined);
  assert.equal(merged.indexRecord, undefined);
  assert.throws(() => mergeDropboxDocumentUpdate(existing, {
    ...refreshed, dropboxAccountFingerprint: "b".repeat(64)
  }), /compte\/version d'origine non vérifié/);
  assert.throws(() => mergeDropboxDocumentUpdate(existing, { ...refreshed, dropboxRev: undefined }),
    /compte\/version d'origine non vérifié/);
});

test("Dropbox : pages invalides, curseur répété, arrêt et quotas sont signalés", async () => {
  const run = fetchImpl => scanDropbox({ getToken, onItem: () => {}, onProgress: () => {}, fetchImpl });
  await assert.rejects(run(async () => page([], "boucle", true)), /répétée/);
  await assert.rejects(run(async () => Response.json({ entries: [], has_more: true })), /invalide/);
  await assert.rejects(run(async () => new Response("", { status: 429, headers: { "Retry-After": "12" } })), error =>
    error instanceof DropboxApiError && error.status === 429 && /12 secondes/.test(error.message));
  await assert.rejects(run(async () => new Response("", { status: 401 })), /reconnectez/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scanDropbox({
    getToken, onItem: () => {}, onProgress: () => {}, signal: controller.signal,
    fetchImpl: () => { throw new Error("Aucun appel après arrêt"); }
  }), { name: "AbortError" });
});

test("Dropbox : copie sourcée, compte distinct, faits et recherche restaurés sans nouveau réseau", async () => {
  const text = "Facture piscine\nMontant : 120 euros\nÉchéance : 04/05/2028";
  const result = await readDropboxDocument({ item: file, accountId: "compte-fictif-a", getToken,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://content.dropboxapi.com/2/files/download");
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(options.headers["Dropbox-API-Arg"]), { path: file.id });
      return download(text);
    } });
  assert.equal(getInventorySource(result.document), "dropbox");
  assert.equal(result.coverage, "partial");
  assert.equal(result.document.sourceDir, file.path_display);
  assert.equal(result.document.modificationDate, "2026-01-03T10:00:00.000Z");
  assert.notEqual(result.document.id, (await dropboxIdentity("compte-fictif-b", file.id)).id);
  assert.doesNotMatch(JSON.stringify(result.document), /compte-fictif-a|jeton-de-test/);
  result.document.indexRecord = await createDocumentIndexRecord(result.document);
  const restored = structuredClone(result.document);
  const session = new IndexSession();
  assert.equal(await session.restoreDocumentContent(restored), "verified");
  session.syncDocuments([restored]);
  assert.equal(session.search("piscine", { sourceId: "dropbox" }).length, 1);
  assert.equal(countInventorySources([restored]).dropbox, 1);
  const statuses = describeSources(session.getAllRecords(), {
    driveConfigured: false, driveToken: false, driveState: "unknown", localState: "unknown", dropboxState: "disconnected"
  });
  assert.match(statuses.find(source => source.sourceId === "dropbox").access, /non vérifiée/);
  restored.content += " altération";
  assert.equal((await restoreContentSegments(restored)).status, "invalid");
});

test("Dropbox : photos, formats non lus, versions absentes et tailles dépassées restent explicitement partiels", async () => {
  for (const item of [
    { ...file, name: "souvenir.jpg" }, { ...file, name: "tableur.xlsx" },
    { ...file, size: 1024 * 1024 + 1 }, { ...file, rev: undefined }
  ]) {
    const result = await readDropboxDocument({
      item, accountId: "compte", getToken,
      fetchImpl: () => { throw new Error("Contenu non nécessaire"); }
    });
    assert.equal(result.coverage, "metadata");
    assert.ok(result.document.dropboxIndexIssue);
    assert.equal(result.document.photoMetadata, undefined);
    assert.equal(result.document.contentProvenance, undefined);
  }
  await assert.rejects(readDropboxDocument({
    item: file, accountId: "compte", getToken,
    fetchImpl: async () => download("texte", { ...file, rev: "autre-version" })
  }), /modifié pendant/);
});

test("lecture bornée partagée : dépassement en flux ou en en-tête arrête la lecture", async () => {
  let cancelled = 0;
  const stream = () => new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled++; }
  });
  await assert.rejects(readBoundedBytes(new Response(stream()), 4), RangeError);
  await assert.rejects(readBoundedBytes(new Response(stream(), { headers: { "content-length": "8" } }), 4), RangeError);
  assert.equal(cancelled, 2);
});

test("Dropbox : PDF texte fictif extrait et PDF illisible signalé sans fausse preuve", async () => {
  const bytes = await readFile(new URL("../samples/facture-piscine.pdf", import.meta.url));
  const item = { ...file, name: "facture-piscine.pdf", size: bytes.length };
  const result = await readDropboxDocument({
    item, accountId: "compte", getToken, fetchImpl: async () => download(bytes, item)
  });
  assert.equal(result.coverage, "partial");
  assert.match(result.document.content, /piscine/i);
  assert.equal(result.document.contentProvenance.method, "dropbox-pdf-text");
  assert.equal((await restoreContentSegments(result.document)).status, "verified");
  const invalid = await readDropboxDocument({
    item, accountId: "compte", getToken, fetchImpl: async () => download("pas un PDF", item)
  });
  assert.equal(invalid.coverage, "metadata");
  assert.match(invalid.reason, /PDF non extrait/);
  assert.equal(invalid.document.contentProvenance, undefined);
});
