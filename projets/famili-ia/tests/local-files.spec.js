import { test, expect } from "@playwright/test";
import { createDocxBuffer } from "./fixtures/docx-buffer.js";

test("DOCX local : le lecteur navigateur extrait un fait sourcé", async ({ page }) => {
  await page.goto("http://localhost:5179/styles.css");
  const docxBase64 = createDocxBuffer([
    "Facture EDF",
    "Total TTC : 61,00 EUR",
    "À payer avant : 01/01/2027"
  ]).toString("base64");

  const result = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const { readFileContent } = await import("/local-files.js");
    const { createContentProvenance } = await import("/content-index.js");
    const { createDocumentIndexRecord } = await import("/document-index.js");
    const extracted = await readFileContent(new Blob([bytes]), "facture.docx");
    const document = {
      id: "browser-docx",
      name: "facture.docx",
      isLocal: true,
      content: extracted.rawText
    };
    document.contentProvenance = await createContentProvenance(
      document, extracted.extractedSegments, "local-word"
    );
    const record = await createDocumentIndexRecord(document);
    return {
      text: extracted.rawText,
      segments: extracted.extractedSegments,
      provider: record.fields.find(field => field.name === "provider")?.value,
      amount: record.fields.find(field => field.name === "amount")?.value,
      dueDate: record.dates.echeance?.value
    };
  }, docxBase64);

  expect(result.text).toContain("Facture EDF");
  expect(result.segments).toEqual([result.text]);
  expect(result.provider).toBe("EDF");
  expect(result.amount).toBe("61.00 EUR");
  expect(result.dueDate).toBe("2027-01-01");
});
