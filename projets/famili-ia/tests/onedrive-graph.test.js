import test from "node:test";
import assert from "node:assert/strict";
import { scanOneDrive } from "../onedrive-graph.js";

test("parcourt dossiers et pages sans envoyer le jeton à une autre origine", async () => {
  const calls = [];
  const items = [];
  const progress = [];
  const pages = [
    { value: [{ id: "folder", name: "Dossier", folder: {} }, { id: "one", name: "a.txt", file: {} }],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next" },
    { value: [{ id: "two", name: "b.txt", file: {} }] },
    { value: [{ id: "three", name: "c.txt", file: {} }] }
  ];
  const result = await scanOneDrive({
    getToken: async () => "synthetic-token", onItem: async item => items.push(item.id),
    onProgress: state => progress.push(state),
    fetchImpl: async (url, options) => {
      calls.push({ url, authorization: options.headers.Authorization });
      return Response.json(pages.shift());
    }
  });
  assert.deepEqual(items, ["one", "two", "three"]);
  assert.deepEqual(result, { files: 3, pages: 3, foldersRead: 2 });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => new URL(call.url).origin === "https://graph.microsoft.com"));
  assert.ok(progress.some(state => state.files === 3));
});

test("rejette un curseur malveillant, une pagination cyclique et une erreur réseau", async () => {
  const run = fetchImpl => scanOneDrive({ getToken: async () => "token", onItem: async () => {},
    onProgress: () => {}, fetchImpl });
  await assert.rejects(run(async () => Response.json({
    value: [], "@odata.nextLink": "https://example.invalid/v1.0/me/drive/root/children"
  })), /non autorisée/);
  await assert.rejects(run(async () => Response.json({
    value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drive/root/children"
  })), /répétée/);
  await assert.rejects(run(async () => new Response("", { status: 429 })), /HTTP 429/);
});

test("l'arrêt interrompt le parcours et conserve les éléments déjà traités", async () => {
  const controller = new AbortController();
  const items = [];
  await assert.rejects(scanOneDrive({
    getToken: async () => "token",
    onItem: async item => { items.push(item.id); controller.abort(); },
    onProgress: () => {}, signal: controller.signal,
    fetchImpl: async () => Response.json({ value: [
      { id: "one", name: "a", file: {} }, { id: "two", name: "b", file: {} }
    ] })
  }), { name: "AbortError" });
  assert.deepEqual(items, ["one"]);
});
