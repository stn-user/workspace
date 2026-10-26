/**
 * crypto.js - Service de chiffrement pour les données locales
 * Utilise Web Crypto API
 */

const KEY_STORE_NAME = 'CryptoKeyStore';
const KEY_NAME = 'masterKey';

// Initialise ou récupère la clé depuis IndexedDB
async function getMasterKey() {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KEY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(KEY_STORE_NAME);
    const request = store.get(KEY_NAME);

    request.onsuccess = async () => {
      if (request.result) {
        // La clé existe, l'importer
        const key = await crypto.subtle.importKey(
          "jwk",
          request.result,
          { name: "AES-GCM" },
          false,
          ["encrypt", "decrypt"]
        );
        resolve(key);
      } else {
        // Générer une nouvelle clé
        const newKey = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
        );

        // Exporter pour stockage
        const exported = await crypto.subtle.exportKey("jwk", newKey);
        store.put(exported, KEY_NAME);
        resolve(newKey);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

function openKeyDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("CryptoDB", 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(KEY_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function encryptData(data) {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );

  return { iv, data: new Uint8Array(encrypted) };
}

export async function decryptData(encryptedObj) {
  const key = await getMasterKey();

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encryptedObj.iv },
    key,
    encryptedObj.data
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}
