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
  assert.equal(files[0].id, "drive-picker-selected-id");
  assert.equal(files[0].name, selectedDocument.name);
  assert.equal(files[0].content, "Montant total : 42 euros");
  assert.equal(files[0].driveSource, true);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) => url.pathname === "/drive/v3/files/picker-selected-id"));
  assert.equal(requests[0].url.searchParams.get("fields"), "id,name,mimeType,size,modifiedTime");
  assert.equal(requests[1].url.searchParams.get("alt"), "media");
  assert.ok(requests.every(({ authorization }) => authorization === "Bearer memory-only-token"));
});

test("returns an empty selection when Picker is cancelled without reading files", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    google: { accounts: { oauth2: { hasGrantedAllScopes: () => true } } }
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const client = new GoogleDriveClient({ apiKey: "test-api-key", appId: "123456", clientId: "test-client-id" });
  client.tokenClient = {
    requestAccessToken() {
      this.callback({ access_token: "memory-only-token", scope: googleDriveScope });
    }
  };
  client.openPicker = async () => [];
  client.readSelectedFile = () => {
    throw new Error("Un fichier ne doit pas être lu après annulation");
  };

  assert.deepEqual(await client.pickFiles(1), []);
});

test("rejects a missing Drive scope before opening Picker", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    google: { accounts: { oauth2: { hasGrantedAllScopes: () => false } } }
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const client = new GoogleDriveClient({ apiKey: "test-api-key", appId: "123456", clientId: "test-client-id" });
  client.tokenClient = {
    requestAccessToken() {
      this.callback({ access_token: "memory-only-token", scope: "" });
    }
  };
  client.openPicker = () => {
    throw new Error("Picker ne doit pas s'ouvrir sans autorisation");
  };

  await assert.rejects(client.pickFiles(1), /autorisation minimale Google Drive/);
  assert.equal(client.hasAccessToken, false);
});

test("revokes the active token and reports a provider rejection", async (t) => {
  const previousWindow = globalThis.window;
  let response = { successful: true };
  let revokedToken;
  globalThis.window = {
    google: { accounts: { oauth2: {
      revoke(token, callback) {
        revokedToken = token;
        callback(response);
      }
    } } }
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const client = new GoogleDriveClient({ apiKey: "test-api-key", appId: "123456", clientId: "test-client-id" });
  client.accessToken = "memory-only-token";
  await client.revoke();
  assert.equal(revokedToken, "memory-only-token");
  assert.equal(client.hasAccessToken, false);

  response = { successful: false };
  client.accessToken = "memory-only-token";
  await assert.rejects(client.revoke(), /Google n’a pas confirmé la révocation/);
  assert.equal(client.hasAccessToken, false);
});

test("rejects PDF larger than 10MB", async (t) => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const requests = [];
  const oversizedPdf = {
    id: "oversized-pdf-id",
    name: "oversized.pdf",
    mimeType: "application/pdf",
    size: "11000000", // 11 MB > 10 MB limit
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
          docs: [{ id: oversizedPdf.id, name: oversizedPdf.name }]
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
    if (requestUrl.pathname === `/drive/v3/files/${oversizedPdf.id}` &&
        requestUrl.searchParams.get("fields") === "id,name,mimeType,size,modifiedTime") {
      return Response.json(oversizedPdf);
    }
    // If it tries to download the content, we should not reach here because the size check should throw first.
    return new Response("Should not be called", { status: 500 });
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

  await assert.rejects(
    client.pickFiles(1),
    { message: /dépasse la limite de 10 Mo/ }
  );
});

test("rejects unsupported file type", async (t) => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const requests = [];
  const unsupportedFile = {
    id: "unsupported-id",
    name: "image.jpg",
    mimeType: "image/jpeg",
    size: "1000",
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
          docs: [{ id: unsupportedFile.id, name: unsupportedFile.name }]
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
    if (requestUrl.pathname === `/drive/v3/files/${unsupportedFile.id}` &&
        requestUrl.searchParams.get("fields") === "id,name,mimeType,size,modifiedTime") {
      return Response.json(unsupportedFile);
    }
    return new Response("Should not be called", { status: 500 });
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

  await assert.rejects(
    client.pickFiles(1),
    { message: /Le format de « image.jpg » n’est pas pris en charge/ }
  );
});
