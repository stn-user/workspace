import assert from "node:assert/strict";
import test from "node:test";
import { GoogleDriveClient, googleDriveScope } from "../google-drive.js";
import { GoogleDriveSource } from "../google-drive-source.js";
import { collectMultipleSources } from "../source-orchestrator.js";

const document = (id = "one") => ({
  id: `drive-${id}`, name: `${id}.txt`, type: "Texte", date: "Date inconnue",
  content: "Contenu fictif", keywords: "", summary: "", isLocal: true, driveSource: true
});

function fakeClient(pickFiles = async () => [document()]) {
  return {
    async pickFilesDetailed() {
      const documents = await pickFiles();
      return { status: documents.length ? "selected" : "empty", documents };
    },
    hasAccessToken: true,
    async revoke() { this.hasAccessToken = false; }
  };
}

test("décrit les limites sans exposer de jeton et retourne des fiches de la sélection", async () => {
  const input = document();
  const source = new GoogleDriveSource({ client: fakeClient(async () => [input]), sourceId: "source-a" });
  const before = source.describe();
  assert.equal(before.authorization, "token-present");
  assert.equal(before.availability, "unknown");
  assert.equal(before.account, "unknown");
  assert.equal(before.capabilities.discover, false);
  assert.equal(before.capabilities.select, true);
  before.capabilities.select = false;
  assert.equal(source.describe().capabilities.select, true);
  const result = await source.selectFiles(1);
  assert.equal(result.status, "selected");
  assert.equal(result.documents[0], input);
  assert.equal(result.records[0].sourceId, "source-a");
  assert.equal(result.records[0].itemId, input.id);
  assert.equal(result.records[0].coverage, "metadata");
  assert.equal(source.describe().selectionState, "selected");
  assert.equal(JSON.stringify(source.describe()).includes("Contenu fictif"), false);
});

test("sélection vide, erreurs propagées et entrées vérifiées", async () => {
  let action = async () => [];
  const source = new GoogleDriveSource({ client: fakeClient(() => action()), sourceId: "source" });
  assert.deepEqual(await source.selectFiles(2), { status: "empty", documents: [], records: [] });
  const error = new Error("Autorisation refusée");
  action = async () => { throw error; };
  await assert.rejects(source.selectFiles(1), (actual) => actual === error);
  assert.equal(source.describe().selectionState, "error");
  action = async () => [document(), document("two")];
  await assert.rejects(source.selectFiles(1), /limite/);
  action = async () => [document(), document()];
  const duplicates = await source.selectFiles(2);
  assert.equal(duplicates.documents.length, 2);
  assert.equal(duplicates.records.length, 1);
  action = async () => [document(), { ...document(), content: "" }];
  await assert.rejects(source.selectFiles(2), /Résultat Drive invalide/);
  for (const limit of [0, -1, 1.5, Infinity, "1"]) {
    await assert.rejects(source.selectFiles(limit), TypeError);
  }
  assert.throws(() => new GoogleDriveSource({ client: fakeClient(), sourceId: "" }), TypeError);
  assert.throws(() => new GoogleDriveSource({ client: {}, sourceId: "source" }), TypeError);
});

test("annulation distincte d'une sélection vide et état invalide rejeté", async () => {
  const client = fakeClient();
  client.pickFilesDetailed = async () => ({ status: "cancelled", documents: [] });
  const source = new GoogleDriveSource({ client, sourceId: "source" });
  assert.deepEqual(await source.selectFiles(1), { status: "cancelled", documents: [], records: [] });
  assert.equal(source.describe().selectionState, "cancelled");
  client.pickFilesDetailed = async () => ({ status: "cancelled", documents: [document()] });
  await assert.rejects(source.selectFiles(1), /incohérents/);
  client.pickFilesDetailed = async () => ({ status: "unknown", documents: [] });
  await assert.rejects(source.selectFiles(1), /invalide/);
});

test("opérations non disponibles rejetées et isolées par l'orchestrateur", async () => {
  const source = new GoogleDriveSource({ client: fakeClient(), sourceId: "source" });
  for (const method of ["authorize", "discover", "readMetadata", "readContent", "openOriginal", "getChanges", "disconnect"]) {
    assert.throws(() => source[method](), /non pris(?:e)? en charge/);
  }
  const result = await collectMultipleSources([{ sourceId: "source", connector: source }]);
  assert.equal(result[0].status, "error");
  assert.match(result[0].error.message, /Découverte Drive non prise en charge/);
});

test("sélection et révocation ne se chevauchent pas, échec de révocation visible", async () => {
  let finish;
  const client = fakeClient(() => new Promise((resolve) => { finish = resolve; }));
  const source = new GoogleDriveSource({ client, sourceId: "source" });
  const pending = source.selectFiles(1);
  await assert.rejects(source.selectFiles(1), /déjà en cours/);
  await assert.rejects(source.revoke(), /déjà en cours/);
  finish([document()]);
  await pending;
  const error = new Error("Refus fournisseur");
  client.revoke = async () => { client.hasAccessToken = false; throw error; };
  await assert.rejects(source.revoke(), (actual) => actual === error);
  assert.equal(source.describe().revocationState, "failed");
  assert.equal(source.describe().authorization, "unknown");
  await assert.rejects(source.revoke(), /ne peut pas être confirmée/);
  client.hasAccessToken = true;
  client.revoke = async () => { client.hasAccessToken = false; };
  await source.revoke();
  assert.equal(source.describe().revocationState, "confirmed");
  assert.equal(source.describe().selectionState, "unknown");
});

test("utilise le client Drive réel simulé sans appel réseau supplémentaire", async (t) => {
  const oldWindow = globalThis.window;
  globalThis.window = { google: { accounts: { oauth2: { hasGrantedAllScopes: () => true } } } };
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  });
  const client = new GoogleDriveClient({ apiKey: "test", appId: "test", clientId: "test" });
  client.tokenClient = {
    requestAccessToken() { this.callback({ access_token: "test-token", scope: googleDriveScope }); }
  };
  client.openPicker = async () => [{ id: "one", name: "one.txt" }];
  const calls = [];
  client.driveRequest = async (url) => {
    calls.push(url.toString());
    if (url.searchParams.get("alt") === "media") return new Response("Contenu fictif");
    return Response.json({ id: "one", name: "one.txt", mimeType: "text/plain", size: "15" });
  };
  const source = new GoogleDriveSource({ client, sourceId: "drive" });
  const result = await source.selectFiles(1);
  assert.equal(result.documents[0].content, "Contenu fictif");
  assert.equal(result.records[0].itemId, "drive-one");
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(source.describe()).includes("test-token"), false);
});
