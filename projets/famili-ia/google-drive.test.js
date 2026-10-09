import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleDriveFileType, GoogleDriveClient, googleDriveScope } from "./google-drive.js";

test("requests only the per-file Drive scope for Picker-selected files", () => {
  assert.equal(googleDriveScope, "https://www.googleapis.com/auth/drive.file");
});

test("accepts only supported file types within the existing local limits", () => {
  assert.deepEqual(getGoogleDriveFileType("application/pdf"), {
    extension: "pdf",
    type: "PDF",
    maxSize: 10 * 1024 * 1024
  });
  assert.equal(getGoogleDriveFileType("text/plain").maxSize, 1024 * 1024);
  assert.equal(getGoogleDriveFileType("text/markdown").extension, "md");
  assert.equal(getGoogleDriveFileType("application/vnd.google-apps.document").type, "Document Google");
  assert.equal(getGoogleDriveFileType("application/vnd.google-apps.spreadsheet"), null);
  assert.equal(getGoogleDriveFileType("image/jpeg"), null);
});

test("reads only the file returned by Picker and keeps its text in the session result", async (t) => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const requests = [];
  const selectedDocument = {
    id: "picker-selected-id",
    name: "facture-test.txt",
    mimeType: "text/plain",
    size: "30",
    modifiedTime: "2026-10-09T12:00:00.000Z"
  };

  class MockPickerBuilder {
    setAppId() { return this; }
    setDeveloperKey() { return this; }
    setOAuthToken() { return this; }
    setOrigin() { return this; }
    setMaxItems() { return this; }
    enableFeature() { return this; }
    addView() { return this; }
    setCallback(callback) {
      this.callback = callback;
      return this;
    }
    build() {
      return {
        setVisible: () => queueMicrotask(() => this.callback({
          action: "picked",
          docs: [{ id: selectedDocument.id, name: selectedDocument.name }]
        }))
      };
    }
  }

  globalThis.window = {
    location: { origin: "http://localhost:5173" },
    google: {
      accounts: {
        oauth2: {
          hasGrantedAllScopes: () => true,
          revoke: (_token, callback) => callback({ successful: true })
        }
      },
      picker: {
        DocsView: class {
          setIncludeFolders() { return this; }
          setMimeTypes() { return this; }
        },
        PickerBuilder: MockPickerBuilder,
        ViewId: { DOCS: "docs" },
        Feature: { MULTISELECT_ENABLED: "multi" },
        Action: { PICKED: "picked", CANCEL: "cancel", ERROR: "error" }
      }
    }
  };
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url);
    requests.push({ url: requestUrl, authorization: options.headers.Authorization });
    if (requestUrl.searchParams.get("alt") === "media") {
      return new Response("Montant total : 42 euros", { status: 200 });
    }
    return Response.json(selectedDocument);
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  });

  const client = new GoogleDriveClient({ apiKey: "test-api-key", appId: "123456", clientId: "test-client-id" });
  client.tokenClient = {
    callback: null,
    requestAccessToken() {
      this.callback({ access_token: "memory-only-token", scope: googleDriveScope });
    }
  };

  const files = await client.pickFiles(1);
  assert.equal(files.length, 1);
  assert.equal(files[0].content, "Montant total : 42 euros");
  assert.equal(files[0].driveSource, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.pathname, `/drive/v3/files/${selectedDocument.id}`);
  assert.equal(requests[1].url.pathname, `/drive/v3/files/${selectedDocument.id}`);
  assert.ok(requests.every((request) => request.authorization === "Bearer memory-only-token"));
});
