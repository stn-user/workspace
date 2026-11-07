import { test } from "node:test";
import assert from "node:assert/strict";
import { createIndexRecord, isValidIndexRecord } from "../index-record.js";
import { extractDeadlineFromText } from "../index-text-analysis.js";
import { findDeadlineCandidates } from "../index-deadline-candidates.js";

const base = () => createIndexRecord("src", "id", {
  name: { value: "garantie.pdf", source: "user-input" }, type: "document",
  coverage: "partial", lastCheck: "2024-01-01",
  dates: { achat: { value: "2023-03-15", source: "user-input" } },
  fields: [{ name: "marque", value: "Bosch", source: "extracted", proof: { excerpt: "Bosch" } }]
});

test("extraction exacte d'une échéance et conservation des autres données", () => {
  const original = base();
  const snapshot = structuredClone(original);
  const result = extractDeadlineFromText(original, "Garantie\n  Fin de garantie : 15/03/2025  \nAutre texte");
  assert.equal(result.status, "extracted");
  assert.deepEqual(result.record.dates.echeance, {
    value: "2025-03-15", source: "extracted", estimated: false,
    proof: { excerpt: "  Fin de garantie : 15/03/2025  ", location: null }
  });
  assert.deepEqual(result.record.dates.achat, original.dates.achat);
  for (const key of ["sourceId", "itemId", "type", "name", "coverage", "lastCheck", "fields"]) {
    assert.deepEqual(result.record[key], original[key]);
  }
  assert.equal(isValidIndexRecord(result.record), true);
  result.record.fields[0].proof.excerpt = "modifié";
  assert.deepEqual(original, snapshot);
});

test("dates explicites acceptées et proposition traçable", () => {
  const result = extractDeadlineFromText(base(), "Date d’échéance : 2025-03-15");
  assert.equal(result.status, "extracted");
  assert.deepEqual(findDeadlineCandidates([result.record], "2025-03-14", 1), {
    candidates: [{
      sourceId: "src", itemId: "id", name: "garantie.pdf",
      dueDate: "2025-03-15", source: "extracted",
      proof: { excerpt: "Date d’échéance : 2025-03-15", location: null }, daysUntil: 1
    }], ineligible: []
  });
});

test("abstention sur dates ambiguës, libellés incertains ou date invalide", () => {
  const cases = [
    ["Achat : 15/03/2023\nDurée : 2 ans", "not-found"],
    ["Fin de garantie : 15/03/2025 et 16/03/2025", "ambiguous"],
    ["Fin de garantie : 15/03/2025\nÉchéance : 16/03/2025", "ambiguous"],
    ["Fin de garantie : 15/03/2025\nÉchéance : 15/03/2025", "ambiguous"],
    ["Fin de garantie : 31/02/2025", "not-found"],
    ["Pas d'échéance : 15/03/2025", "ambiguous"],
    ["Fin de garantie : 15/03/2025 (sauf résiliation)", "ambiguous"],
    ["Échéance : 15/03/2025\nRenouvellement : 2026", "ambiguous"],
    ["Texte sans date", "not-found"]
  ];
  for (const [text, status] of cases) {
    const result = extractDeadlineFromText(base(), text);
    assert.equal(result.status, status);
    assert.equal(result.record.dates.echeance, undefined);
    assert.deepEqual(findDeadlineCandidates([result.record], "2025-03-01", 30), { candidates: [], ineligible: [] });
  }
});

test("échéance existante conservée même en présence d'un autre texte", () => {
  const original = createIndexRecord("src", "id", {
    dates: { echeance: { value: "2026-01-01", source: "user-input", proof: { excerpt: "texte choisi" } } }
  });
  const snapshot = structuredClone(original);
  const result = extractDeadlineFromText(original, "Fin de garantie : 15/03/2025");
  assert.equal(result.status, "kept");
  assert.deepEqual(result.record, original);
  result.record.dates.echeance.proof.excerpt = "modifié";
  assert.deepEqual(original, snapshot);
});

test("entrées invalides rejetées et résultat sans extraction indépendant", () => {
  for (const text of ["", "  ", null, 2]) assert.throws(() => extractDeadlineFromText(base(), text), TypeError);
  assert.throws(() => extractDeadlineFromText({}, "texte"), TypeError);
  const record = base();
  const snapshot = structuredClone(record);
  const result = extractDeadlineFromText(record, "Aucun libellé");
  result.record.fields[0].proof.excerpt = "modifié";
  assert.deepEqual(record, snapshot);
});