export const PHOTO_THUMBNAIL_SCHEMA_VERSION = 1;
export const PHOTO_THUMBNAIL_MAX_DIMENSION = 320;
export const PHOTO_THUMBNAIL_MAX_BYTES = 48 * 1024;

const DATA_URL_MAX_LENGTH = Math.ceil(PHOTO_THUMBNAIL_MAX_BYTES / 3) * 4 + 64;
const OUTPUT_FORMATS = [
  { type: "image/webp", qualities: [0.76, 0.58] },
  { type: "image/jpeg", qualities: [0.72, 0.5] }
];
const MAX_CONCURRENT_THUMBNAIL_JOBS = 2;
let activeThumbnailJobs = 0;
const thumbnailJobQueue = [];

function createHtmlCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function decodeImage(file) {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      };
    } catch (orientationError) {
      try {
        const bitmap = await globalThis.createImageBitmap(file);
        return {
          image: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close()
        };
      } catch {
        throw orientationError;
      }
    }
  }

  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
    throw new Error("Le décodage local des images n'est pas disponible dans cet environnement.");
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = objectUrl;
    await image.decode();
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => {
        image.src = "";
        URL.revokeObjectURL(objectUrl);
      }
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") return createHtmlCanvas(width, height);
  throw new Error("La création locale de vignettes nécessite Canvas.");
}

async function encodeCanvas(canvas, type, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type, quality });
  }
  if (typeof canvas.toBlob === "function") {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Le navigateur n'a pas pu encoder la vignette."));
      }, type, quality);
    });
  }
  throw new Error("L'encodage local des vignettes n'est pas disponible.");
}

async function toDataUrl(blob) {
  if (typeof globalThis.btoa !== "function") {
    throw new Error("L'encodage local de la vignette n'est pas disponible.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type};base64,${globalThis.btoa(binary)}`;
}

export function getPhotoThumbnailDataUrl(thumbnail) {
  if (!thumbnail || typeof thumbnail !== "object"
    || thumbnail.schemaVersion !== PHOTO_THUMBNAIL_SCHEMA_VERSION
    || !["image/webp", "image/jpeg"].includes(thumbnail.mimeType)
    || !Number.isInteger(thumbnail.width) || thumbnail.width < 1 || thumbnail.width > PHOTO_THUMBNAIL_MAX_DIMENSION
    || !Number.isInteger(thumbnail.height) || thumbnail.height < 1 || thumbnail.height > PHOTO_THUMBNAIL_MAX_DIMENSION
    || !Number.isInteger(thumbnail.byteLength) || thumbnail.byteLength < 1 || thumbnail.byteLength > PHOTO_THUMBNAIL_MAX_BYTES
    || typeof thumbnail.dataUrl !== "string"
    || thumbnail.dataUrl.length > DATA_URL_MAX_LENGTH
    || !thumbnail.dataUrl.startsWith(`data:${thumbnail.mimeType};base64,`)
    || !/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(thumbnail.dataUrl)) {
    return null;
  }
  return thumbnail.dataUrl;
}

async function createPhotoThumbnail(file) {
  if (!file || typeof file.size !== "number" || file.size <= 0
    || typeof file.arrayBuffer !== "function") {
    throw new TypeError("La génération d'une vignette nécessite un fichier image local.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new RangeError("L'image dépasse la limite de 10 Mio pour la génération de vignette.");
  }

  const decoded = await decodeImage(file);
  if (!Number.isFinite(decoded.width) || decoded.width < 1
    || !Number.isFinite(decoded.height) || decoded.height < 1) {
    decoded.release();
    throw new Error("Les dimensions de l'image sont invalides.");
  }

  let canvas;
  try {
    const contextDimensions = [PHOTO_THUMBNAIL_MAX_DIMENSION, 240, 160];
    for (const maxDimension of contextDimensions) {
      const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      canvas = createCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Impossible de préparer le rendu local de la vignette.");

      context.drawImage(decoded.image, 0, 0, width, height);
      for (const format of OUTPUT_FORMATS) {
        for (const quality of format.qualities) {
          const blob = await encodeCanvas(canvas, format.type, quality);
          if (blob.type !== format.type || blob.size < 1 || blob.size > PHOTO_THUMBNAIL_MAX_BYTES) continue;

          return {
            schemaVersion: PHOTO_THUMBNAIL_SCHEMA_VERSION,
            mimeType: blob.type,
            width,
            height,
            byteLength: blob.size,
            dataUrl: await toDataUrl(blob)
          };
        }
      }
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
  } finally {
    decoded.release();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  throw new RangeError("Impossible de produire une vignette dans la limite de 48 Kio.");
}

export async function generatePhotoThumbnail(file) {
  if (activeThumbnailJobs >= MAX_CONCURRENT_THUMBNAIL_JOBS) {
    await new Promise(resolve => thumbnailJobQueue.push(resolve));
  } else {
    activeThumbnailJobs += 1;
  }

  try {
    return await createPhotoThumbnail(file);
  } finally {
    const nextJob = thumbnailJobQueue.shift();
    if (nextJob) nextJob();
    else activeThumbnailJobs -= 1;
  }
}
