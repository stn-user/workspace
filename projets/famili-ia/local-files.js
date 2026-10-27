// Mock Capacitor pour le navigateur web
const Capacitor = { isNativePlatform: () => false };
const Filesystem = null;
const Ocr = { process: async () => ({ results: [] }) };
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const maxPdfPages = 20;
const renderScale = 1.5;

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * Reads an Excel file (XLSX) and extracts text content
 */
async function readExcelFile(fileBlob) {
  const arrayBuffer = await fileBlob.arrayBuffer();
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

  switch (extension) {
    case 'pdf':
      return await readPdfFile(fileBlob);
    case 'docx':
      return await readDocxFile(fileBlob);
    case 'xlsx':
    case 'xls':
      return await readExcelFile(fileBlob);
    case 'txt':
    case 'md':
      return await readTextFile(fileBlob);
    case 'jpg':
    case 'jpeg':
    case 'png':
      return await readImageFile(fileBlob);
    default:
      throw new Error(`Format de fichier non supporté : .${extension}`);
  }
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
    const filePromises = files
      .filter(file =>
        !file.name.startsWith('.') &&  // Skip hidden files
        supportedExtensions.has(getFileExtension(file.name))
      )
      .map(async file => {
        try {
          const { data } = await Filesystem.readFile({
            path: `${directoryPath}/${file.name}`,
            directory: Filesystem.Directory.Documents
          });

          // Convert base64 back to blob for processing
          const binaryString = atob(data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          return {
            name: file.name,
            extension: getFileExtension(file.name),
            blob: new Blob([bytes], { type: `text/plain` }),
            path: `${directoryPath}/${file.name}`
          };
        } catch (error) {
          console.warn(`Could not read file ${file.name}:`, error);
          return null;
        }
      });

    const results = await Promise.all(filePromises);
    return results.filter(file => file !== null);
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
    // For Android, we might need to request READ_EXTERNAL_STORAGE
    // This would typically be done via Capacitor plugins or native code
    // For now, we'll assume permissions are handled at app level
    return { granted: true };
  } catch (error) {
    console.error("Error requesting permissions:", error);
    throw error;
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