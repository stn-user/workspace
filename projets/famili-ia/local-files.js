// Mock Capacitor pour le navigateur web
const Capacitor = { isNativePlatform: () => false };
const Filesystem = null;
const Ocr = { process: async () => ({ results: [] }) };
import { parseDocument } from "./document-parser.js";

// Top-level await pour charger la version appropriée de pdf.js
const pdfjs = typeof window === "undefined"
  ? await import("pdfjs-dist/legacy/build/pdf.mjs")
  : await import("pdfjs-dist");

const maxPdfPages = 20;
const renderScale = 1.5;

// mammoth/xlsx sont chargés à la demande : le bundle principal (et le test
// natif Node) évite ainsi les parser superflus.
const loadMammoth = () => import("mammoth");
const loadXLSX = () => import("xlsx");

// Sur Vite, pdfWorkerUrl est résolu à l'build ; sur Node (tests), on laisse
// pdf.js déléguer sa gestion côté thread principal.
if (typeof window !== "undefined") {
  import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((mod) => {
    pdfjs.GlobalWorkerOptions.workerSrc = mod.default;
  }).catch(() => {});
}

function getEmbeddedPageText(items) {
  return items
    .filter((item) => "str" in item)
    .map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`)
    .join("")
    .trim();
}

async function recognizePage(page) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("OCR is not available in web demo. Use native mobile app for scanned PDF OCR.");
  }

  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) throw new Error("Impossible de préparer une page PDF pour l'OCR.");

  try {
    await page.render({ canvas, canvasContext, viewport }).promise;
    const { results } = await Ocr.process({ image: canvas.toDataURL("image/jpeg", 0.85) });
    return results.map(({ text }) => text.trim()).filter(Boolean).join("\n");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function readPdfFile(fileBlob) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await fileBlob.arrayBuffer()) });
  let pdf;

  try {
    pdf = await loadingTask.promise;
    if (pdf.numPages > maxPdfPages) {
      throw new Error(`Ce PDF contient ${pdf.numPages} pages. La limite actuelle est de ${maxPdfPages} pages.`);
    }

    const pageContents = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const embeddedText = getEmbeddedPageText(textContent.items);
      const pageText = embeddedText || await recognizePage(page);
      if (pageText) pageContents.push(`Page ${pageNumber}\n${pageText}`);
    }
    return pageContents.join("\n\n");
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Reads a DOCX file and extracts text content
 */
async function readDocxFile(fileBlob) {
  const arrayBuffer = await fileBlob.arrayBuffer();
  const mammoth = await loadMammoth();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * Reads an Excel file (XLSX) and extracts text content
 */
async function readExcelFile(fileBlob) {
  const arrayBuffer = await fileBlob.arrayBuffer();
  const XLSX = await loadXLSX();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  let text = "";
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetText = XLSX.utils.sheet_to_csv(worksheet);
    text += `\n--- Feuille : ${sheetName} ---\n${sheetText}`;
  });

  return text.trim();
}

/**
 * Reads a text file (TXT/MD) from blob
 */
async function readTextFile(fileBlob) {
  return await fileBlob.text();
}

/**
 * Get file extension
 */
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Read a file based on its extension
 */
async function readFileContent(fileBlob, filename) {
  const extension = getFileExtension(filename);
  let textContent;

  switch (extension) {
    case 'pdf':
      textContent = await readPdfFile(fileBlob);
      break;
    case 'docx':
    case 'doc':
      textContent = await readDocxFile(fileBlob).catch(() => "Fichier Word au format ancien (.doc). Veuillez l'enregistrer au format .docx pour une lecture optimale.");
      break;
    case 'xlsx':
    case 'xls':
      textContent = await readExcelFile(fileBlob);
      break;
    case 'txt':
    case 'md':
      textContent = await readTextFile(fileBlob);
      break;
    case 'jpg':
    case 'jpeg':
    case 'png':
      textContent = await readImageFile(fileBlob);
      break;
    default:
      throw new Error(`Format de fichier non supporté : .${extension}`);
  }

  // Intégration du parser pour classification intelligente
  const documentContext = parseDocument(textContent, filename);

  // Retourner à la fois le texte brut et le contexte structuré
  return {
    rawText: textContent,
    context: documentContext
  };
}

/**
 * Read an image file and extract text via OCR (canvas-based).
 * Note: On the web (non-native platform), OCR is intentionally limited to encourage
 * using the native mobile app for full scanning/OCR capabilities.
 */
async function readImageFile(fileBlob) {
  if (!Capacitor.isNativePlatform()) {
    // In web demo, OCR is not available without native platform.
    // Return a placeholder indicating the image was selected but OCR not available.
    return `Image ${fileBlob.name} sélectionnée. L'extraction de texte par OCR n'est disponible que sur l'application mobile native.`;
  }

  // Use the existing OCR pipeline adapted for images
  // We'll render the image to a canvas and use the Ocr service
  const img = new Image();
  const url = URL.createObjectURL(fileBlob);

  return new Promise((resolve, reject) => {
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          throw new Error('Impossible de préparer le canvas pour l\'OCR.');
        }

        // Set canvas to image dimensions
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0);

        // Use the OCR service to process the canvas image
        const { results } = await Ocr.process({ image: canvas.toDataURL('image/jpeg', 0.85) });
        const extractedText = results.map(({ text }) => text.trim()).filter(Boolean).join('\n');

        URL.revokeObjectURL(url);
        resolve(extractedText || 'Aucun texte détecté sur cette image.');
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de charger l\'image.'));
    };

    img.src = url;
  });
}

/**
 * List files in a directory recursively (limited to supported extensions)
 */
async function listLocalFiles(directoryPath = "") {
  try {
    // On web, we can't access filesystem directly without user interaction
    // This is primarily for native mobile apps
    if (!Capacitor.isNativePlatform()) {
      // Return empty array on web - users must use file picker
      return [];
    }

    const { files } = await Filesystem.readdir({
      path: directoryPath,
      directory: Filesystem.Directory.Documents // or Data depending on what we need
    });

    const supportedExtensions = new Set(['txt', 'md', 'pdf', 'docx', 'xlsx', 'xls']);
    const allFiles = [];

    async function scanDirectory(dirPath) {
      const { files } = await Filesystem.readdir({
        path: dirPath,
        directory: Filesystem.Directory.Documents
      });

      for (const file of files) {
        if (file.name.startsWith('.')) continue; // Skip hidden

        const fullPath = dirPath ? `${dirPath}/${file.name}` : file.name;

        if (file.type === 'directory') {
          // Récursion
          await scanDirectory(fullPath);
        } else if (supportedExtensions.has(getFileExtension(file.name))) {
          allFiles.push({ name: file.name, path: fullPath });
        }
      }
    }

    await scanDirectory(directoryPath);

    // Traitement par lots pour ne pas saturer la mémoire
    const batchSize = 5;
    const results = [];
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async file => {
        try {
          const { data } = await Filesystem.readFile({
            path: file.path,
            directory: Filesystem.Directory.Documents
          });

          // Convert base64 back to blob
          const binaryString = atob(data);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);

          // On retourne le blob "brut" sans extraction immédiate (évite les erreurs OCR sur PDF scannés en lot)
          // L'extractiontexte se fera au moment de l'affichage ou via un bouton dédié
          return {
            name: file.name,
            extension: getFileExtension(file.name),
            blob: new Blob([bytes], { type: `application/octet-stream` }),
            path: file.path,
            content: null // Contenu non extrait pour l'instant
          };
        } catch (error) {
          console.warn(`Erreur lors du stockage du fichier ${file.name}:`, error);
          return null;
        }
      }));
      results.push(...batchResults.filter(r => r !== null));
    }
    return results;
  } catch (error) {
    console.error("Error listing local files:", error);
    throw error;
  }
}

/**
 * Request permissions for file system access (Android/iOS)
 */
async function requestPermissions() {
  if (!Capacitor.isNativePlatform()) {
    // On web, permissions are handled by the browser via file input
    return { granted: true };
  }

  try {
    // Utilisation du plugin @capacitor/filesystem pour demander les permissions
    // Note: nécessite une configuration native côté Android (AndroidManifest.xml) et iOS (Info.plist)
    const status = await Filesystem.requestPermissions();
    return { granted: status.publicStorage === 'granted' || status.storage === 'granted' };
  } catch (error) {
    console.error("Error requesting permissions:", error);
    return { granted: false };
  }
}

/**
 * Get accessible directories (Documents, Downloads)
 */
async function getAccessibleDirectories() {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }

  try {
    // List common directories we want to access
    const directories = ['Documents', 'Download'];
    const accessible = [];

    for (const dir of directories) {
      try {
        await Filesystem.stat({
          path: dir,
          directory: Filesystem.Directory.Documents
        });
        accessible.push(dir);
      } catch (error) {
        // Directory doesn't exist or not accessible
        console.warn(`Directory ${dir} not accessible:`, error);
      }
    }

    return accessible;
  } catch (error) {
    console.error("Error getting accessible directories:", error);
    return [];
  }
}

export {
  listLocalFiles,
  readFileContent,
  readImageFile,
  requestPermissions,
  getAccessibleDirectories
};