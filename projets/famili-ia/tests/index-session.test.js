import { test } from "node:test";
import assert from "node:assert/strict";
import { IndexSession } from "../index-session.js";
import { createIndexRecord } from "../index-record.js";
import { GoogleDriveClient, googleDriveScope } from "../google-drive.js";

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
  const selected = await client.pickFiles(1);
  const session = new IndexSession();
  session.syncDocuments([local, ...selected]);
  assert.deepEqual(session.search("facture").map(({ sourceId }) => sourceId), ["local", "drive"]);
  session.syncDocuments([local, ...selected]);
  assert.equal(pickerCalls, 1);
  assert.equal(requests, 2);
  assert.deepEqual(session.search("privé"), []);
});
