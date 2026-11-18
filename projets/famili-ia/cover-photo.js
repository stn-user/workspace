import { decodeImage, encodeCanvas, toDataUrl } from "./photo-thumbnails.js";

export const COVER_PHOTO_MAX_BYTES = 256 * 1024;
export const COVER_PHOTO_MAX_DIMENSION = 1280;

export function validateCoverPhoto(photo) {
  if (!photo || photo.schemaVersion !== 1 || photo.mimeType !== "image/jpeg"
    || !Number.isInteger(photo.width) || photo.width < 1 || photo.width > COVER_PHOTO_MAX_DIMENSION
    || !Number.isInteger(photo.height) || photo.height < 1 || photo.height > COVER_PHOTO_MAX_DIMENSION
    || !Number.isInteger(photo.byteLength) || photo.byteLength < 4 || photo.byteLength > COVER_PHOTO_MAX_BYTES
    || !Number.isFinite(photo.positionX) || photo.positionX < 0 || photo.positionX > 100
    || !Number.isFinite(photo.positionY) || photo.positionY < 0 || photo.positionY > 100
    || typeof photo.dataUrl !== "string"
    || photo.dataUrl.length > Math.ceil(COVER_PHOTO_MAX_BYTES / 3) * 4 + 32
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.dataUrl)) {
    throw new TypeError("La copie de la photo est invalide.");
  }
  const bytes = atob(photo.dataUrl.slice("data:image/jpeg;base64,".length));
  if (bytes.length !== photo.byteLength || !bytes.startsWith("\xff\xd8") || !bytes.endsWith("\xff\xd9")) {
    throw new TypeError("Le contenu de la photo est invalide.");
  }
  return {
    schemaVersion: photo.schemaVersion, mimeType: photo.mimeType,
    width: photo.width, height: photo.height, byteLength: photo.byteLength,
    dataUrl: photo.dataUrl, positionX: photo.positionX, positionY: photo.positionY
  };
}

export async function prepareCoverPhoto(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new TypeError("Choisissez une photo JPEG, PNG ou WebP.");
  }
  if (file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new RangeError("Choisissez une photo non vide de 10 Mio maximum.");
  }
  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch (cause) {
    throw new Error("Cette photo est illisible. Choisissez un autre fichier.", { cause });
  }
  const canvas = document.createElement("canvas");
  try {
    if (!Number.isInteger(decoded.width) || !Number.isInteger(decoded.height)
      || decoded.width < 1 || decoded.height < 1 || decoded.width * decoded.height > 40_000_000) {
      throw new RangeError("Choisissez une image de dimensions valides, de 40 mégapixels maximum.");
    }
    for (const limit of [COVER_PHOTO_MAX_DIMENSION, 1024, 800]) {
      const scale = Math.min(1, limit / Math.max(decoded.width, decoded.height));
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Le rendu local de la photo est indisponible.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await encodeCanvas(canvas, "image/jpeg", quality);
        if (blob.type !== "image/jpeg" || blob.size > COVER_PHOTO_MAX_BYTES) continue;
        return validateCoverPhoto({
          schemaVersion: 1, mimeType: blob.type, width: canvas.width, height: canvas.height,
          byteLength: blob.size, dataUrl: await toDataUrl(blob), positionX: 50, positionY: 50
        });
      }
    }
    throw new RangeError("Impossible de préparer une copie de 256 Kio maximum.");
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}
