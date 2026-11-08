import { test } from "node:test";
import assert from "node:assert/strict";
import { IndexSession } from "../index-session.js";
import { createContentProvenance } from "../content-index.js";
import { GoogleDriveClient, googleDriveScope, prepareDriveDocumentForIndex } from "../google-drive.js";
import { readPdfFile } from "../document-reader.js";
import { readFile } from "node:fs/promises";

function makePdf(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 2 * i} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ];
  pages.forEach((text, i) => {
    const stream = text ? `BT /F1 12 Tf 20 100 Td (${text}) Tj ET` : "";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${4 + 2 * i} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function mockClient(t, bytes, mimeType = "application/pdf") {
  const previousWindow = globalThis.window;
  globalThis.window = { google: { accounts: { oauth2: { hasGrantedAllScopes: () => true } } } };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const client = new GoogleDriveClient({ apiKey: "fake", appId: "fake", clientId: "fake" });
  client.tokenClient = { requestAccessToken() { this.callback({ access_token: "fake", scope: googleDriveScope }); } };
  let pickerCalls = 0;
  let requests = 0;
  client.openPicker = async () => { pickerCalls++; return [{ id: "pdf", name: "selection.pdf" }]; };
  client.driveRequest = async url => {
    requests++;
    return url.searchParams.get("alt") === "media"
      ? new Response(bytes)
      : Response.json({ id: "pdf", name: "selection.pdf", mimeType, size: String(bytes.length) });
  };
  return { client, counts: () => [pickerCalls, requests] };
}

test("vrai PDF Drive simulé : extraction, indexation et restauration sans nouvelle requête", async (t) => {
  const bytes = await readFile(new URL("../samples/facture-piscine.pdf", import.meta.url));
  const { client, counts } = mockClient(t, bytes);
  const [document] = await client.pickFiles(1);
  assert.equal(typeof document.content, "string");
  assert.match(document.content, /^Page 1\n/);
  const originalContent = document.content;
  const index = new IndexSession();
  await prepareDriveDocumentForIndex(document, index);
  assert.equal(document.contentProvenance.method, "drive-pdf-text");
  assert.equal(document.content, originalContent);
  assert.equal(Object.hasOwn(document, "segments"), false);
  index.syncDocuments([document]);
  const match = index.search("piscine")[0];
  assert.equal(match.sourceId, "drive");
  assert.equal(match.coverage, "partial");
  const excerpt = match.reasons.find(reason => reason.location === "content").proof.excerpt;
  assert.ok(originalContent.includes(excerpt));
  assert.match(excerpt.toLowerCase(), /piscine/);
  assert.equal(index.search("page").length, 0);

  const stored = JSON.parse(JSON.stringify(document));
  const restarted = new IndexSession();
  assert.equal(await restarted.restoreDocumentContent(stored), "verified");
  restarted.syncDocuments([stored]);
  assert.equal(restarted.search("piscine").length, 1);
  const changed = { ...stored, content: `${stored.content} changé` };
  const legacy = { ...stored };
  delete legacy.contentProvenance;
  assert.equal(await restarted.restoreDocumentContent(changed), "invalid");
  restarted.syncDocuments([changed]);
  assert.equal(restarted.search("piscine").length, 0);
  assert.equal(await restarted.restoreDocumentContent(legacy), "legacy");
  restarted.syncDocuments([legacy]);
  assert.equal(restarted.search("piscine").length, 0);
  restarted.syncDocuments([]);
  assert.equal(restarted.getAllRecords().length, 0);
  assert.deepEqual(counts(), [1, 2]);
});

test("contrat lecteur PDF et refus Web des pages sans texte, même mixtes", async (t) => {
  const content = await readPdfFile(new Blob([makePdf(["Preuve unique"])]));
  assert.equal(content, "Page 1\nPreuve unique");
  for (const pages of [[""], ["Texte incorpore", ""]]) {
    const { client } = mockClient(t, makePdf(pages));
    await assert.rejects(client.pickFiles(1), /OCR.*pas disponible/);
  }
});

test("fichiers Drive vides, PDF invalides et limite de pages rejetés", async (t) => {
  for (const [bytes, type, error] of [
    [new TextEncoder().encode("   "), "text/plain", /aucun texte exploitable/],
    [new TextEncoder().encode("non PDF"), "application/pdf", /PDF/i],
    [makePdf(Array(21).fill("texte")), "application/pdf", /21 pages/]
  ]) {
    const { client } = mockClient(t, bytes, type);
    await assert.rejects(client.pickFiles(1), error);
  }
});

/**
 * Test: PDF Google Drive avec texte incorporé
 * Référence: 15.5bis.9 - recherche du texte incorporé
 */

test("PDF Drive fictif: création provenance drive-pdf-text et recherche", async () => {
  const pdfContent = "Contrat de location\nDate de fin de garantie: 15/03/2025\nGarantie: 24 mois";
  
  const pdfDoc = {
    id: "drive-pdf-1",
    name: "Facture PDF Drive.pdf",
    type: "PDF",
    isLocal: true,
    driveSource: true,
    content: pdfContent,
  };
  
  const segments = ["Contrat de location", "Date de fin de garantie: 15/03/2025", "Garantie: 24 mois"];
  pdfDoc.contentProvenance = await createContentProvenance(pdfDoc, segments, "drive-pdf-text");
  
  assert.ok(pdfDoc.contentProvenance, "La provenance doit être créée");
  assert.equal(pdfDoc.contentProvenance.method, "drive-pdf-text");
  
  const session = new IndexSession();
  session.trustExtractedContent(pdfDoc, segments);
  session.syncDocuments([pdfDoc]);
  
  const matches = session.search("garantie");
  assert.equal(matches.length, 1, "Doit trouver un document avec garantie");
  assert.equal(matches[0].sourceId, "drive");
  assert.equal(matches[0].itemId, "drive-pdf-1");
  assert.equal(matches[0].coverage, "partial");
});

test("PDF scanné: segments vides, pas de candidature par contenu", async () => {
  const pdfScanned = {
    id: "scanned-1",
    name: "Contrat.pdf",
    type: "PDF",
    isLocal: true,
    driveSource: true,
    content: "[Texte extrait impossible sans OCR mobile - PDF scanné]",
  };
  
  const session = new IndexSession();
  // Aucun segment fiable pour un PDF scanné
  session.trustExtractedContent(pdfScanned, []);
  session.syncDocuments([pdfScanned]);
  
  // Recherche par le message d'erreur ne doit pas trouver car pas indexé
  const matches = session.search("impossible");
  assert.equal(matches.length, 0, "PDF scanné ne doit pas être indexé par son message d'erreur");
  
  // La recherche par nom fonctionne si le mot est dans le nom
  const byName = session.search("Contrat");
  assert.equal(byName.length, 1, "Doit trouver par nom");
});

test("Redémarrage PDF Drive: provenance vérifiée", async () => {
  const pdfContent = "Texte à vérifier après redémarrage";
  const pdfDoc = {
    id: "restart-pdf-1",
    name: "Redémarrage.pdf",
    type: "PDF",
    isLocal: true,
    driveSource: true,
    content: pdfContent,
  };
  
  pdfDoc.contentProvenance = await createContentProvenance(pdfDoc, [pdfContent], "drive-pdf-text");
  
  const session1 = new IndexSession();
  session1.trustExtractedContent(pdfDoc, [pdfContent]);
  session1.syncDocuments([pdfDoc]);
  
  // Simuler redémarrage
  const serialized = JSON.parse(JSON.stringify(pdfDoc));
  const session2 = new IndexSession();
  const status = await session2.restoreDocumentContent(serialized);
  
  assert.equal(status, "verified", "La provenance doit être vérifiée après redémarrage");
  session2.syncDocuments([serialized]);
  
  const matches = session2.search("redémarrage");
  assert.equal(matches.length, 1, "Doit retrouver le PDF après redémarrage");
});

test("Texte modifié sans nouvelle provenance: fallback métadonnées", async () => {
  const pdfContent = "Texte original";
  const pdfDoc = {
    id: "modified-pdf-1",
    name: "Modifié.pdf",
    type: "PDF",
    isLocal: true,
    driveSource: true,
    content: pdfContent,
  };
  
  pdfDoc.contentProvenance = await createContentProvenance(pdfDoc, [pdfContent], "drive-pdf-text");
  
  const session = new IndexSession();
  session.trustExtractedContent(pdfDoc, [pdfContent]);
  session.syncDocuments([pdfDoc]);
  
  // Changement de contenu sans nouvelle provenance
  const modified = JSON.parse(JSON.stringify(pdfDoc));
  modified.content = "Texte modifié sans nouvelle provenance";
  
  const session2 = new IndexSession();
  const status = await session2.restoreDocumentContent(modified);
  
  assert.equal(status, "invalid", "Provenance doit être invalide");
  session2.syncDocuments([modified]);
  
  const textMatches = session2.search("original");
  assert.equal(textMatches.length, 0, "Texte modifié ne doit pas être trouvé");
});

test("PDF local vs PDF Drive: provenance distincte", async () => {
  const localPdf = {
    id: "local-pdf-1",
    name: "Local.pdf",
    type: "PDF",
    isLocal: true,
    content: "Texte commun",
  };
  localPdf.contentProvenance = await createContentProvenance(localPdf, ["Texte commun"], "local-pdf");
  
  const drivePdf = {
    id: "drive-pdf-1",
    name: "Drive.pdf",
    type: "PDF",
    isLocal: true,
    driveSource: true,
    content: "Texte commun",
  };
  drivePdf.contentProvenance = await createContentProvenance(drivePdf, ["Texte commun"], "drive-pdf-text");
  
  const session = new IndexSession();
  session.trustExtractedContent(localPdf, ["Texte commun"]);
  session.trustExtractedContent(drivePdf, ["Texte commun"]);
  session.syncDocuments([localPdf, drivePdf]);
  
  const matches = session.search("commun");
  assert.equal(matches.length, 2, "Les deux PDFs doivent être trouvés");
  
  const sources = matches.map(m => m.sourceId);
  assert.ok(sources.includes("local"), "Doit inclure la source locale");
  assert.ok(sources.includes("drive"), "Doit inclure la source Drive");
});
