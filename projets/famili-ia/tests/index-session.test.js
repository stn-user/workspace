import { test } from "node:test";
import assert from "node:assert/strict";
import { IndexSession } from "../index-session.js";
import { createIndexRecord } from "../index-record.js";
import { createContentProvenance } from "../content-index.js";
import { createDocumentIndexRecord } from "../document-index.js";
import { GoogleDriveClient, googleDriveScope, prepareDriveDocumentForIndex } from "../google-drive.js";
import { GoogleDriveSource } from "../google-drive-source.js";

const local = { id: "1", name: "Facture locale.txt", isLocal: true, content: "secret local" };
const drive = { id: "1", name: "Facture Drive.txt", isLocal: true, driveSource: true, content: "secret drive" };

test("recherche des documents locaux et Drive sans lecture, avec identités distinctes", () => {
  const session = new IndexSession();
  const documents = [local, drive, { id: "demo", name: "Facture démo", driveDemo: true }];
  const original = structuredClone(documents);
  session.syncDocuments(documents);
  const matches = session.search("facture");
  assert.deepEqual(matches.map(({ sourceId, itemId, coverage }) => [sourceId, itemId, coverage]), [
    ["local", "1", "metadata"], ["drive", "1", "metadata"]
  ]);
  assert.deepEqual(session.getRecordsBySource("drive").map(({ name }) => name.value), ["Facture Drive.txt"]);
  assert.deepEqual(session.search("secret"), []);
  assert.deepEqual(documents, original);
  assert.throws(() => session.getRecordsBySource("unknown"), TypeError);
});

test("rapprochement, correction, doublons et suppressions explicites par instantané", () => {
  const session = new IndexSession();
  session.syncDocuments([local, drive]);
  const corrected = createIndexRecord("local", "1", {
    name: { value: "Mon contrat", source: "user-input" }, coverage: "metadata"
  });
  session.updateRecord(corrected);
  corrected.name.value = "mutation extérieure";
  session.syncDocuments([{ ...local, name: "Renommé.txt" }, local, drive]);
  assert.equal(session.search("mon contrat")[0].name, "Mon contrat");
  const records = session.getAllRecords();
  records[0].name.value = "autre mutation";
  assert.equal(session.search("mon contrat").length, 1);
  session.syncDocuments([drive]);
  assert.deepEqual(session.search("facture").map(({ sourceId }) => sourceId), ["drive"]);
  session.syncDocuments([]);
  assert.deepEqual(session.getAllRecords(), []);
  assert.throws(() => session.updateRecord(corrected), /introuvable/);
});

test("validation atomique et refus des fiches invalides", () => {
  const session = new IndexSession();
  session.syncDocuments([local]);
  for (const input of [null, [{} , { isLocal: true, id: "x", name: "" }], [null]]) {
    assert.throws(() => session.syncDocuments(input), TypeError);
    assert.equal(session.search("facture").length, 1);
  }
  assert.throws(() => session.updateRecord({}), TypeError);
  assert.throws(() => session.search("!!!"), TypeError);
});

test("résultats du client Drive simulé réutilisés sans deuxième sélection ni lecture", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { google: { accounts: { oauth2: { hasGrantedAllScopes: () => true } } } };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const client = new GoogleDriveClient({ apiKey: "fake", appId: "fake", clientId: "fake" });
  client.tokenClient = {
    requestAccessToken() { this.callback({ access_token: "fake", scope: googleDriveScope }); }
  };
  let pickerCalls = 0;
  let requests = 0;
  client.openPicker = async () => { pickerCalls++; return [{ id: "1", name: "Facture Drive.txt" }]; };
  client.driveRequest = async url => {
    requests++;
    return url.searchParams.get("alt") === "media"
      ? new Response("Texte privé fictif")
      : Response.json({ id: "1", name: "Facture Drive.txt", mimeType: "text/plain", size: "20" });
  };
  const source = new GoogleDriveSource({ client, sourceId: "drive" });
  const { documents: selected, status } = await source.selectFiles(1);
  assert.equal(status, "selected");
  const session = new IndexSession();
  session.trustExtractedContent(local, [local.content]);
  await prepareDriveDocumentForIndex(selected[0], session);
  session.syncDocuments([local, ...selected]);
  assert.deepEqual(session.search("facture").map(({ sourceId }) => sourceId), ["local", "drive"]);
  session.syncDocuments([local, ...selected]);
  assert.equal(pickerCalls, 1);
  assert.equal(requests, 2);
  assert.equal(session.search("privé")[0].sourceId, "drive");
  const restarted = new IndexSession();
  const stored = JSON.parse(JSON.stringify(selected[0]));
  assert.equal(await restarted.restoreDocumentContent(stored), "verified");
  restarted.syncDocuments([stored]);
  assert.equal(restarted.search("privé")[0].sourceId, "drive");
  assert.equal(pickerCalls, 1);
  assert.equal(requests, 2);
});

test("contenus vérifiés, anciens documents, corrections et suppression", () => {
  const session = new IndexSession();
  const localDoc = { ...local, content: "Impossible de résilier avant décembre" };
  const driveDoc = { ...drive, content: "Impossible de résilier avant janvier" };
  const legacy = { id: "ancien", name: "Ancien", isLocal: true, content: "résilier ancien" };
  session.trustExtractedContent(localDoc, [localDoc.content]);
  session.trustExtractedContent(driveDoc, [driveDoc.content]);
  session.syncDocuments([localDoc, driveDoc, legacy]);
  const matches = session.search("résilier");
  assert.deepEqual(matches.map(item => [item.sourceId, item.coverage]), [["local", "partial"], ["drive", "partial"]]);
  assert.ok(matches[0].reasons[0].proof.excerpt.includes("résilier"));
  const correction = session.getRecordsBySource("local")[0];
  correction.name = { value: "Titre corrigé", source: "user-input", estimated: false, proof: null };
  correction.coverage = "metadata";
  session.updateRecord(correction);
  assert.equal(session.search("résilier", { coverage: "partial" })[0].name, "Titre corrigé");
  session.syncDocuments([localDoc, driveDoc, legacy]);
  assert.equal(session.search("résilier")[0].name, "Titre corrigé");
  localDoc.content = "texte modifié sans provenance";
  session.syncDocuments([localDoc, driveDoc, legacy]);
  assert.deepEqual(session.search("résilier").map(item => item.sourceId), ["drive"]);
  session.syncDocuments([]);
  assert.deepEqual(session.search("résilier"), []);
  assert.throws(() => session.trustExtractedContent(driveDoc, ["extrait inventé"]), TypeError);
});

test("les faits persistés sont restaurés après redémarrage seulement si le contenu reste vérifié", async () => {
  const document = {
    id: "persistent-invoice",
    name: "facture.txt",
    isLocal: true,
    content: "Facture EDF\nTotal TTC : 123,45 EUR"
  };
  document.contentProvenance = await createContentProvenance(
    document, [document.content], "local-text"
  );
  document.indexRecord = await createDocumentIndexRecord(document);

  const restored = JSON.parse(JSON.stringify(document));
  const restarted = new IndexSession();
  assert.equal(await restarted.restoreDocumentContent(restored), "verified");
  restarted.syncDocuments([restored]);
  assert.equal(restarted.search("edf")[0].coverage, "partial");
  assert.ok(restarted.search("edf")[0].reasons.some(reason =>
    reason.location === "field.provider" && reason.proof.excerpt === "Facture EDF"));

  const altered = { ...restored, content: `${restored.content}\nTexte ajouté` };
  const unverified = new IndexSession();
  assert.equal(await unverified.restoreDocumentContent(altered), "invalid");
  unverified.syncDocuments([altered]);
  assert.deepEqual(unverified.search("edf"), []);
  assert.equal(unverified.search("facture")[0].coverage, "metadata");
});
