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

test("date de fin de garantie en phrase avec une date d'achat séparée", () => {
  const text = "Date d'achat pergola au 15/11/2025 et date de fin de garantie au 15/11/2026";
  const result = extractDeadlineFromText(base(), text);
  assert.equal(result.status, "extracted");
  assert.deepEqual(result.record.dates.echeance, {
    value: "2026-11-15", source: "extracted", estimated: false,
    proof: { excerpt: text, location: null }
  });
  assert.equal(findDeadlineCandidates([result.record], "2026-11-10", 90).candidates[0].dueDate, "2026-11-15");
});

test("reconnaît « fin de la garantie : date » après une date d'achat sur la même ligne", () => {
  const record = createIndexRecord("src", "id", {});
  const result = extractDeadlineFromText(record,
    "Fichier de garantie pergola\ndate d'achat : 15/11/2025 fin de la garantie : 15/11/2026");
  assert.equal(result.status, "extracted");
  assert.equal(result.record.dates.echeance.value, "2026-11-15");
});

test("estime l'échéance avec les formulations « durée de la garantie » et sans deux-points", () => {
  const record = createIndexRecord("src", "id", {});
  for (const text of [
    "Fichier de garantie téléviseur Sony\ndate d'achat : 15/11/2025\ndurée de la garantie : 1 an",
    "date d'achat le 15/11/2025, durée de garantie 1 an"
  ]) {
    const result = extractDeadlineFromText(record, text);
    assert.equal(result.status, "estimated");
    assert.equal(result.record.dates.echeance.value, "2026-11-15");
  }
});

test("calcule une proposition estimée depuis une date d'achat prouvée et une durée explicite", () => {
  const purchaseExcerpt = "Date d'achat : 15/11/2025";
  const durationExcerpt = "Durée de garantie : 1 an";
  const record = createIndexRecord("src", "id", {
    dates: {
      achat: {
        value: "2025-11-15", source: "extracted",
        proof: { excerpt: purchaseExcerpt, location: "ligne 1" }
      }
    }
  });
  const result = extractDeadlineFromText(record, `${purchaseExcerpt}\n${durationExcerpt}`);
  assert.equal(result.status, "estimated");
  assert.deepEqual(result.record.dates.echeance, {
    value: "2026-11-15", source: "auto-estimate", estimated: true,
    proof: { excerpt: `${purchaseExcerpt}\n${durationExcerpt}`, location: null }
  });
  assert.equal(findDeadlineCandidates([result.record], "2026-11-10", 90).candidates.length, 0);
  const candidates = findDeadlineCandidates([result.record], "2026-11-10", 90, { includeEstimated: true });
  assert.deepEqual(candidates.candidates[0], {
    sourceId: "src", itemId: "id", name: null, dueDate: "2026-11-15", source: "auto-estimate",
    proof: { excerpt: `${purchaseExcerpt}\n${durationExcerpt}`, location: null },
    daysUntil: 5, estimated: true
  });

  const monthEnd = createIndexRecord("src", "month-end", {
    dates: {
      achat: {
        value: "2025-01-31", source: "extracted",
        proof: { excerpt: "Date d'achat : 31/01/2025", location: "ligne 1" }
      }
    }
  });
  assert.equal(
    extractDeadlineFromText(monthEnd, "Date d'achat : 31/01/2025\nDurée de garantie : 1 mois").record.dates.echeance.value,
    "2025-02-28"
  );
});

test("abstention sur dates ambiguës, libellés incertains ou date invalide", () => {
  const cases = [
    ["Achat : 15/03/2023\nDurée : 2 ans", "not-found"],
    ["Date de fin de garantie au 15/03/2025 et échéance au 16/03/2025", "ambiguous"],
    ["Fin de garantie : 15/03/2025 et 16/03/2025", "ambiguous"],
    ["Fin de garantie : 15/03/2025\nÉchéance : 16/03/2025", "ambiguous"],
    ["Fin de garantie : 15/03/2025\nÉchéance : 15/03/2025", "ambiguous"],
    ["Fin de garantie : 31/02/2025", "invalid-date"],
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