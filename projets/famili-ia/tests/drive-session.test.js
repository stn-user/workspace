import { test } from "node:test";
import assert from "node:assert/strict";
import { DriveIndexSession } from "../drive-session.js";
import { GoogleDriveClient, googleDriveScope } from "../google-drive.js";
import { createIndexRecord } from "../index-record.js";

const driveFile = (id = "drive-1", name = "Facture.txt") => ({
  id, name, type: "Texte", date: "Date inconnue", keywords: "", summary: "",
  content: "Contenu fictif", isLocal: true, driveSource: true
});

test("parcours GoogleDriveClient simulé : sélection, recherche, correction, nouvelle sélection et annulation", async (t) => {
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
  let pickerResult = [{ id: "1", name: "Facture.txt" }];
  let providerName = "Facture.txt";
  let requests = 0;
  client.openPicker = async () => pickerResult;
  client.driveRequest = async (url) => {
    requests++;
    return url.searchParams.get("alt") === "media"
      ? new Response("Texte fictif confidentiel")
      : Response.json({ id: "1", name: providerName, mimeType: "text/plain", size: "20" });
  };
  const session = new DriveIndexSession({ client, sourceId: "drive-instance" });
  const first = await session.selectFiles(2);
  assert.equal(first.selectedCount, 1);
  assert.deepEqual(first.records.map(({ sourceId, itemId }) => [sourceId, itemId]), [["drive-instance", "drive-1"]]);
  assert.equal(requests, 2);
  assert.equal(session.search("facture")[0].itemId, "drive-1");
  assert.deepEqual(session.search("confidentiel"), []);
  session.updateRecord(createIndexRecord("drive-instance", "drive-1", {
    name: { value: "Ma facture.txt", source: "user-input" }, coverage: "metadata",
    fields: [{ name: "tag", value: "maison", source: "user-input" }]
  }));
  providerName = "Renommé.txt";
  await session.selectFiles(2);
  assert.equal(requests, 4);
  assert.equal(session.search("ma facture")[0].name, "Ma facture.txt");
  assert.equal(session.search("maison")[0].reasons[0].source, "user-input");
  pickerResult = [];
  const empty = await session.selectFiles(2);
  assert.equal(empty.selectedCount, 0);
  assert.equal(empty.records.length, 1);
  assert.equal(requests, 4);
});

test("échecs d'autorisation, lecture et adaptation préservent l'index et propagent l'erreur", async () => {
  const errors = [new Error("refus fictif"), new Error("lecture fictive")];
  let selection = [driveFile()];
  const client = { async pickFiles() {
    if (selection instanceof Error) throw selection;
    return selection;
  } };
  const session = new DriveIndexSession({ client, sourceId: "s" });
  await session.selectFiles(1);
  const before = session.getRecords();
  for (const error of errors) {
    selection = error;
    await assert.rejects(session.selectFiles(1), (actual) => actual === error);
    assert.deepEqual(session.getRecords(), before);
  }
  selection = [driveFile(), driveFile()];
  await assert.rejects(session.selectFiles(2), /dupliqué/);
  assert.deepEqual(session.getRecords(), before);
  selection = [driveFile("drive-2"), driveFile("drive-3")];
  await assert.rejects(session.selectFiles(1), /limite/);
  assert.deepEqual(session.getRecords(), before);
});

test("validation, isolation des copies et erreurs de recherche", async () => {
  let calls = 0;
  const client = { pickFiles: async () => { calls++; return [driveFile()]; } };
  assert.throws(() => new DriveIndexSession({ client, sourceId: " " }), TypeError);
  assert.throws(() => new DriveIndexSession({ client: {}, sourceId: "s" }), TypeError);
  const other = createIndexRecord("other", "x");
  assert.throws(() => new DriveIndexSession({ client, sourceId: "s", records: [other] }), TypeError);
  const session = new DriveIndexSession({ client, sourceId: "s" });
  await assert.rejects(session.selectFiles(0), TypeError);
  assert.equal(calls, 0);
  const selected = await session.selectFiles(1);
  selected.records[0].name.value = "modifié";
  assert.equal(session.getRecords()[0].name.value, "Facture.txt");
  const exposed = session.getRecords();
  exposed[0].name.value = "modifié";
  assert.equal(session.getRecords()[0].name.value, "Facture.txt");
  assert.throws(() => session.updateRecord(other), TypeError);
  assert.throws(() => session.updateRecord(createIndexRecord("s", "absent")), /introuvable/);
  assert.throws(() => session.search("!!!"), TypeError);
  assert.throws(() => session.search("facture", { invalid: true }), TypeError);
});

test("refuse simultanément deux sélections ou une correction pendant la sélection", async () => {
  let finish;
  const client = { pickFiles: () => new Promise((resolve) => { finish = resolve; }) };
  const session = new DriveIndexSession({ client, sourceId: "s", records: [
    createIndexRecord("s", "drive-1", { name: { value: "Initial", source: "provider" } })
  ] });
  const selection = session.selectFiles(1);
  await assert.rejects(session.selectFiles(1), /déjà en cours/);
  assert.throws(() => session.updateRecord(session.getRecords()[0]), /déjà en cours/);
  assert.equal(session.search("initial").length, 1);
  finish([driveFile()]);
  await selection;
  assert.equal(session.search("facture").length, 1);
});
