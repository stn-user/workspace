/**
 * crypto.js - Service de chiffrement pour les données locales
 * Utilise Web Crypto API
 */

// Utilisation d'une clé fictive pour le prototype (à remplacer par une dérivation réelle)
const KEY_MATERIAL = new TextEncoder().encode("famili-ia-secret-key-12345678");

async function getMasterKey() {
  return await crypto.subtle.importKey(
    "raw",
    KEY_MATERIAL,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
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
