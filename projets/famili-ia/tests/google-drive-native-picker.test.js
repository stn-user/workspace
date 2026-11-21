import assert from "node:assert/strict";
import test from "node:test";
import { GoogleDriveClient, googleDriveNativeScope } from "../google-drive.js";

test("parcourt uniquement les métadonnées Drive nécessaires en lecture seule", async (t) => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(url), init });
    return new Response(JSON.stringify({
      files: [{ id: "folder-1", name: "Factures", mimeType: "application/vnd.google-apps.folder" }],
      nextPageToken: "page-2"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const client = new GoogleDriveClient({
    apiKey: "",
    appId: "",
    clientId: "",
    nativeAuth: { authorize: async (scope) => assert.equal(scope, googleDriveNativeScope) }
  });
  client.accessToken = "token";
  const result = await client.listNativeFiles({ folderId: "root", searchTerm: "", pageToken: null });
  assert.equal(result.files[0].id, "folder-1");
  assert.equal(result.nextPageToken, "page-2");
  assert.match(requests[0].url.searchParams.get("q"), /'root' in parents/);
  assert.equal(requests[0].url.searchParams.get("pageSize"), "100");
  assert.equal(requests[0].init.headers.Authorization, "Bearer token");
  assert.equal(requests[0].url.searchParams.get("fields"), "nextPageToken,files(id,name,mimeType,size,modifiedTime)");
});

test("recherche dans tout Drive échappe les caractères de requête", async (t) => {
  const previousFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    return new Response(JSON.stringify({ files: [] }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const client = new GoogleDriveClient({ apiKey: "", appId: "", clientId: "", nativeAuth: {} });
  client.accessToken = "token";
  await client.listNativeFiles({ folderId: "root", searchTerm: "l'été", pageToken: "page-2" });
  assert.equal(requestUrl.searchParams.get("q"), "name contains 'l\\'été' and trashed = false");
  assert.equal(requestUrl.searchParams.get("pageToken"), "page-2");
});
