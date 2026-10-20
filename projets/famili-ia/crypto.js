/**
 * crypto.js - Service de chiffrement pour les données locales
 * Utilise Web Crypto API
 */

// Clé fixe de 256 bits (32 octets) pour le prototype
const KEY_MATERIAL = new Uint8Array([
  0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87,
  0x78, 0x69, 0x5a, 0x4b, 0x3c, 0x2d, 0x1e, 0x0f,
  0x0f, 0x1e, 0x2d, 0x3c, 0x4b, 0x5a, 0x69, 0x78,
  0x87, 0x96, 0xa5, 0xb4, 0xc3, 0xd2, 0xe1, 0xf0
]);

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
