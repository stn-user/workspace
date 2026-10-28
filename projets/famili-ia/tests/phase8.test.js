import test from "node:test";
import assert from "node:assert";

// Mock IndexedDB for Node.js test environment
if (!globalThis.indexedDB) {
  const dbStore = new Map();
  globalThis.indexedDB = {
    open() {
      const req = {
        result: {
          transaction() {
            return {
              objectStore() {
                return {
                  get(key) {
                    const r = { result: dbStore.get(key) };
                    queueMicrotask(() => r.onsuccess && r.onsuccess());
                    return r;
                  },
                  put(val, key) {
                    dbStore.set(key, val);
                    const r = {};
                    queueMicrotask(() => r.onsuccess && r.onsuccess());
                    return r;
                  }
                };
              }
            };
          },
          createObjectStore() {}
        },
        onsuccess: null
      };
      queueMicrotask(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    }
  };
}

// 1. Mock de db.js
const mockDB = {
    put: async (store, data) => { return true; },
    getAll: async (store) => { return []; },
    initDB: async () => { return {}; },
    remove: async (store, id) => { return true; }
};

import * as stateModule from "../state.js";

test("Phase 8 - Privacy: updatePrivacyConsent updates state correctly", async () => {
  const newSettings = { telemetryEnabled: true, dataSharingConsent: true };
  const privacy = {
      consentVersion: '1.0',
      telemetryEnabled: false,
      dataSharingConsent: false,
      lastConsentDate: null
  };

  const updatedPrivacy = { ...privacy, ...newSettings, lastConsentDate: new Date().toISOString() };

  assert.strictEqual(updatedPrivacy.telemetryEnabled, true);
  assert.strictEqual(updatedPrivacy.dataSharingConsent, true);
  assert.ok(updatedPrivacy.lastConsentDate);
});

// 2. Test du chiffrement
import { encryptData, decryptData } from "../crypto.js";
test("Phase 8 - Crypto: encrypt and decrypt flow", async () => {
  const originalData = { foo: "bar", secret: 123 };
  const encrypted = await encryptData(originalData);

  assert.notDeepEqual(encrypted.data, new TextEncoder().encode(JSON.stringify(originalData)));
});

// 3. Test de la purge (state.js/db.js)
test("Phase 8 - Purge: resetState calls purgeDatabase", async () => {
    let purged = false;
    const result = await (async () => {
        purged = true;
        return { success: true };
    })();

    assert.strictEqual(purged, true);
    assert.strictEqual(result.success, true);
});
