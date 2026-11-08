import { listLocalFiles, readFileContent } from "../local-files.js";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

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
});
