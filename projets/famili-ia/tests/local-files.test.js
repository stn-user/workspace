import { listLocalFiles, readFileContent } from "../local-files.js";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createContentProvenance } from "../content-index.js";
import { createDocumentIndexRecord } from "../document-index.js";
import { createDocxBuffer } from "./fixtures/docx-buffer.js";

test("local-files module", async (t) => {
  await t.test("readFileContent reads PDF and returns object with context", async () => {
    const pdfPath = path.resolve("samples/facture-piscine.pdf");
    const pdfBuffer = fs.readFileSync(pdfPath);
    const sampleBlob = new Blob([pdfBuffer], { type: "application/pdf" });

    const result = await readFileContent(sampleBlob, "facture-piscine.pdf");

    assert.ok(typeof result === "object");
    assert.ok("rawText" in result);
    assert.ok("context" in result);
    assert.ok(result.rawText.length > 0);
    assert.ok(result.extractedSegments.length > 0);
    assert.ok(result.extractedSegments.every(segment => result.rawText.includes(segment)));
  });

  await t.test("OCR placeholder is not returned as extracted evidence", async () => {
    const image = new Blob(["fictif"], { type: "image/png" });
    Object.defineProperty(image, "name", { value: "image.png" });
    const result = await readFileContent(image, "image.png");
    assert.match(result.rawText, /OCR/);
    assert.deepEqual(result.extractedSegments, []);
  });

  await t.test("DOCX valide : lecture réelle, provenance et faits indexables", async () => {
    const docx = createDocxBuffer([
      "Facture EDF",
      "Total TTC : 61,00 EUR",
      "À payer avant : 01/01/2027"
    ]);
    const result = await readFileContent(new Blob([docx]), "facture.docx");
    assert.match(result.rawText, /Facture EDF/);
    assert.deepEqual(result.extractedSegments, [result.rawText]);

    const document = { id: "docx-invoice", name: "facture.docx", isLocal: true, content: result.rawText };
    document.contentProvenance = await createContentProvenance(
      document, result.extractedSegments, "local-word"
    );
    const record = await createDocumentIndexRecord(document);
    assert.equal(record.coverage, "partial");
    assert.equal(record.fields.find(field => field.name === "provider")?.value, "EDF");
    assert.equal(record.fields.find(field => field.name === "amount")?.value, "61.00 EUR");
    assert.equal(record.dates.echeance.value, "2027-01-01");
  });

  await t.test("format .doc ancien : message explicite sans segment indexable", async () => {
    const result = await readFileContent(new Blob(["fichier fictif"]), "ancien.doc");
    assert.match(result.rawText, /non pris en charge/);
    assert.deepEqual(result.extractedSegments, []);
  });

  await t.test("erreur de lecture DOCX propagée au lieu d'être indexée comme contenu", async () => {
    await assert.rejects(
      readFileContent(new Blob(["fichier invalide"]), "invalide.docx"),
      /docx|zip|central directory|end of data|main document/i
    );
  });
});
