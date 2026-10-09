import { Capacitor } from "@capacitor/core";
import { Ocr } from "@jcesarmobile/capacitor-ocr";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
    throw new Error("Ce PDF semble être scanné. L’OCR est expérimental et en cours de validation dans l’application mobile ; il n’est pas disponible dans la démo web.");
  }

  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) throw new Error("Impossible de préparer une page PDF pour l’OCR.");

  try {
    await page.render({ canvas, canvasContext, viewport }).promise;
    const { results } = await Ocr.process({ image: canvas.toDataURL("image/jpeg", 0.85) });
    return results.map(({ text }) => text.trim()).filter(Boolean).join("\n");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function readPdfFile(file) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf;

  try {
    pdf = await loadingTask.promise;
    if (pdf.numPages > maxPdfPages) {
      throw new Error(`Ce PDF contient ${pdf.numPages} pages. La limite actuelle de la démonstration est de ${maxPdfPages} pages.`);
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
