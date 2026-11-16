import { Camera, MediaTypeSelection } from "@capacitor/camera";

const maxSelectedPhotos = 5;
const supportedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"]
]);

export async function selectNativePhotoFiles({
  camera = Camera,
  fetchImpl = fetch,
  now = Date.now
} = {}) {
  if (!camera || typeof camera.chooseFromGallery !== "function") {
    throw new TypeError("Sélecteur photo natif indisponible.");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("Lecteur de photo invalide.");

  const selection = await camera.chooseFromGallery({
    mediaType: MediaTypeSelection.Photo,
    allowMultipleSelection: true,
    limit: maxSelectedPhotos,
    includeMetadata: false
  });
  if (!selection || !Array.isArray(selection.results)) {
    throw new TypeError("Réponse du sélecteur photo invalide.");
  }
  if (selection.results.length > maxSelectedPhotos) {
    throw new Error(`Le sélecteur a renvoyé plus de ${maxSelectedPhotos} photos.`);
  }

  const selectedAt = now();
  const files = [];
  for (const [index, photo] of selection.results.entries()) {
    if (typeof photo?.webPath !== "string" || !photo.webPath) {
      throw new Error("Le sélecteur n'a pas fourni le chemin d'une photo.");
    }
    const response = await fetchImpl(photo.webPath);
    if (!response.ok) throw new Error(`Impossible de lire la photo sélectionnée (HTTP ${response.status}).`);
    const blob = await response.blob();
    const mimeType = blob.type.toLowerCase().split(";")[0];
    const extension = supportedImageTypes.get(mimeType);
    if (!extension) {
      throw new Error("Le format de la photo sélectionnée n'est pas pris en charge. Formats acceptés : JPEG et PNG.");
    }
    if (blob.size === 0) throw new Error("La photo sélectionnée est vide.");
    files.push(new File([blob], `photo-mobile-${selectedAt}-${index + 1}.${extension}`, {
      type: mimeType,
      lastModified: selectedAt
    }));
  }
  return files;
}
