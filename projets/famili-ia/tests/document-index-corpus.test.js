import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { createContentProvenance } from "../content-index.js";
import { createDocumentIndexRecord } from "../document-index.js";
import { readFileContent } from "../local-files.js";
import { documentIndexCorpus } from "./fixtures/document-index-corpus.js";

function sourceFlags(source) {
  if (source === "drive") return { isLocal: true, driveSource: true };
  if (source === "onedrive") return { isLocal: true, oneDriveSource: true };
  return { isLocal: true };
}

test("corpus fictif : couverture, extraction et classification mesurées", async () => {
  const startedAt = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
  const results = [];

  for (const fixture of documentIndexCorpus) {
    const document = {
      id: fixture.id,
      name: fixture.name,
      content: fixture.text,
      ...sourceFlags(fixture.source)
    };
    if (fixture.method) {
      document.contentProvenance = await createContentProvenance(document, [fixture.text], fixture.method);
    }
    const record = await createDocumentIndexRecord(document);
    const fields = Object.fromEntries(record.fields.map(field => [field.name, field.value]));
    const dates = Object.fromEntries(Object.entries(record.dates).map(([key, value]) => [key, value.value]));
    const expectedCoverage = fixture.expected.coverage ?? "partial";
    assert.equal(record.coverage, expectedCoverage, `${fixture.id}: coverage`);

    for (const [name, expected] of Object.entries(fixture.expected.fields)) {
      if (expected === null) {
        assert.equal(fields[name], undefined, `${fixture.id}: abstention for ${name}`);
      } else {
        assert.equal(fields[name], expected, `${fixture.id}: field ${name}`);
        const sourcedField = record.fields.find(field => field.name === name);
        assert.ok(sourcedField?.proof, `${fixture.id}: evidence for ${name}`);
        assert.ok(fixture.text.includes(sourcedField.proof.excerpt), `${fixture.id}: literal evidence for ${name}`);
        if (name === "classification" || name === "category") {
          assert.equal(sourcedField.source, "auto-estimate", `${fixture.id}: uncertainty for ${name}`);
          assert.equal(sourcedField.estimated, true, `${fixture.id}: estimated ${name}`);
        }
      }
    }
    for (const [name, expected] of Object.entries(fixture.expected.dates)) {
      assert.equal(dates[name], expected, `${fixture.id}: date ${name}`);
      const sourcedDate = record.dates[name];
      assert.equal(sourcedDate.source, "extracted");
      assert.ok(sourcedDate.proof);
      assert.ok(fixture.text.includes(sourcedDate.proof.excerpt));
    }

    const expectedFields = Object.fromEntries(Object.entries(fixture.expected.fields).filter(([, value]) => value !== null));
    const predictedCount = record.fields.length + Object.keys(record.dates).length;
    const expectedCount = Object.keys(expectedFields).length + Object.keys(fixture.expected.dates).length;
    results.push({ fixture, expectedCount, predictedCount });
  }

  const expectedFacts = results.reduce((sum, item) => sum + item.expectedCount, 0);
  const predictedFacts = results.reduce((sum, item) => sum + item.predictedCount, 0);
  const truePositives = expectedFacts;
  const falsePositives = predictedFacts - truePositives;
  const falseNegatives = expectedFacts - truePositives;
  const precision = truePositives / predictedFacts;
  const recall = truePositives / expectedFacts;
  const durationMs = performance.now() - startedAt;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  const summary = {
    cases: results.length,
    verifiedContentCases: results.filter(({ fixture }) => fixture.method).length,
    metadataOnlyCases: results.filter(({ fixture }) => !fixture.method).length,
    expectedFacts,
    predictedFacts,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    durationMs: Number(durationMs.toFixed(2)),
    heapDeltaBytes
  };
  console.log(`document-index-corpus ${JSON.stringify(summary)}`);

  assert.equal(falsePositives, 0);
  assert.equal(falseNegatives, 0);
  assert.equal(precision, 1);
  assert.equal(recall, 1);
  assert.ok(Number.isFinite(heapDeltaBytes));
  assert.ok(durationMs < 10_000, "synthetic corpus processing must complete under 10 seconds");
});

test("classeur XLSX local : le texte extrait entre dans l'index avec preuve", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Facture EDF"],
    ["Total TTC : 61,00 EUR"],
    ["À payer avant : 01/01/2027"]
  ]), "Facture");
  const file = new Blob([XLSX.write(workbook, { bookType: "xlsx", type: "array" })]);
  const extracted = await readFileContent(file, "facture.xlsx");
  assert.ok(extracted.extractedSegments.length);
  assert.ok(extracted.extractedSegments.every(segment => extracted.rawText.includes(segment)));

  const document = {
    id: "xlsx-invoice",
    name: "facture.xlsx",
    isLocal: true,
    content: extracted.rawText
  };
  document.contentProvenance = await createContentProvenance(
    document,
    extracted.extractedSegments,
    "local-text"
  );
  const record = await createDocumentIndexRecord(document);
  assert.equal(record.coverage, "partial");
  assert.equal(record.fields.find(field => field.name === "amount")?.value, "61.00 EUR");
  assert.equal(record.dates.echeance.value, "2027-01-01");
});
