/**
 * crypto.js - Service de chiffrement pour les données locales
 * Utilise Web Crypto API (disponible uniquement en HTTPS ou localhost)
 */

const KEY_STORE_NAME = 'CryptoKeyStore';
const KEY_NAME = 'masterKey';

// Vérifier si crypto.subtle est disponible (nécessite HTTPS sauf sur localhost)
const isCryptoAvailable = typeof crypto !== 'undefined' &&
                          typeof crypto.subtle !== 'undefined' &&
                          crypto.subtle !== null;

console.log('[CRYPTO] crypto.subtle available:', isCryptoAvailable);

// Initialise ou récupère la clé depuis IndexedDB
async function getMasterKey() {
  if (!isCryptoAvailable) {
    console.warn('[CRYPTO] crypto.subtle not available - encryption disabled (requires HTTPS)');
    return null;
  }

  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(KEY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(KEY_STORE_NAME);
    const request = store.get(KEY_NAME);

    request.onsuccess = async () => {
      try {
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
      } catch (e) {
        console.error('[CRYPTO] Error in getMasterKey:', e);
        reject(e);
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
  // Si crypto.subtle n'est pas disponible, retourner les données en clair
  if (!isCryptoAvailable) {
    console.warn('[CRYPTO] Encryption skipped - crypto.subtle not available');
    return data; // Retourner directement les données sans chiffrement
  }

  try {
    const key = await getMasterKey();
    if (!key) return data;

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(JSON.stringify(data));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encodedData
    );

    return { iv, data: new Uint8Array(encrypted) };
  } catch (e) {
    console.error('[CRYPTO] Encryption failed, storing plaintext:', e);
    return data; // Fallback : stockage en clair
  }
}

export async function decryptData(encryptedObj) {
  // Si crypto.subtle n'est pas disponible ou si les données ne sont pas chiffrées
  if (!isCryptoAvailable || !encryptedObj.iv || !encryptedObj.data) {
    return encryptedObj; // Retourner directement les données
  }

  try {
    const key = await getMasterKey();
    if (!key) return encryptedObj;

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encryptedObj.iv },
      key,
      encryptedObj.data
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.error('[CRYPTO] Decryption failed, returning plaintext:', e);
    return encryptedObj; // Fallback : retour des données brutes
  }
}
