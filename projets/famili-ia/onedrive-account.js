import { hashPhotoBytes } from "./photo-metadata.js";

export async function getOneDriveAccountFingerprint(accountId) {
  if (typeof accountId !== "string" || !accountId) {
    throw new TypeError("Identité OneDrive invalide.");
  }
  const hash = await hashPhotoBytes(new TextEncoder().encode(accountId));
  return hash.slice("sha256:".length);
}

export function formatOneDriveAccountFingerprint(fingerprint) {
  return typeof fingerprint === "string" && /^[0-9a-f]{64}$/i.test(fingerprint)
    ? `…${fingerprint.slice(0, 16)}`
    : "compte d’origine non identifié";
}
