import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidCoverageLevel,
  getCoverageLabel,
  summarizeCoverage
} from "../index-coverage.js";

test("valide les quatre niveaux de couverture valides", () => {
  assert.equal(isValidCoverageLevel("unavailable"), true);
  assert.equal(isValidCoverageLevel("metadata"), true);
  assert.equal(isValidCoverageLevel("partial"), true);
  assert.equal(isValidCoverageLevel("analyzed"), true);
});

test("rejette les valeurs invalides", () => {
  assert.equal(isValidCoverageLevel("UnAccessible"), false);
  assert.equal(isValidCoverageLevel("metadata-only"), false);
  assert.equal(isValidCoverageLevel("analyzed!"), false);
  assert.equal(isValidCoverageLevel(""), false);
  assert.equal(isValidCoverageLevel(null), false);
  assert.equal(isValidCoverageLevel(undefined), false);
  assert.equal(isValidCoverageLevel(123), false);
  assert.equal(isValidCoverageLevel(Symbol("metadata")), false);
  assert.equal(isValidCoverageLevel({}), false);
});

test("retourne les libellés corrects pour chaque niveau", () => {
  assert.equal(getCoverageLabel("unavailable"), "Non accessible");
  assert.equal(getCoverageLabel("metadata"), "Métadonnées seules");
  assert.equal(getCoverageLabel("partial"), "Contenu partiel");
  assert.equal(getCoverageLabel("analyzed"), "Contenu analysé");
});

test("lance une TypeError pour une valeur invalide", () => {
  assert.throws(
    () => getCoverageLabel("invalid"),
    { name: "TypeError", message: /Niveau de couverture invalide/ }
  );
  assert.throws(
    () => getCoverageLabel(null),
    { name: "TypeError", message: /Niveau de couverture invalide/ }
  );
  assert.throws(() => getCoverageLabel(Symbol("metadata")), { name: "TypeError", message: /Niveau de couverture invalide/ });
});

test("renvoie un objet avec tous les comptes à zéro pour un tableau vide", () => {
  const result = summarizeCoverage([]);
  assert.deepEqual(result, {
    total: 0,
    unavailable: 0,
    metadata: 0,
    partial: 0,
    analyzed: 0
  });
});

test("compte correctement les occurrences de chaque niveau", () => {
  const levels = ["unavailable", "metadata", "analyzed", "partial", "analyzed", "analyzed"];
  const result = summarizeCoverage(levels);
  assert.deepEqual(result, {
    total: 6,
    unavailable: 1,
    metadata: 1,
    partial: 1,
    analyzed: 3
  });
});

test("compte plusieurs occurrences du même niveau", () => {
  const levels = ["analyzed", "analyzed", "analyzed", "metadata", "metadata"];
  const result = summarizeCoverage(levels);
  assert.deepEqual(result, {
    total: 5,
    unavailable: 0,
    metadata: 2,
    partial: 0,
    analyzed: 3
  });
});

test("lance une TypeError pour une entrée non-tableau", () => {
  assert.throws(
    () => summarizeCoverage(null),
    { name: "TypeError", message: /levels doit être un tableau/ }
  );
  assert.throws(
    () => summarizeCoverage("analyzed"),
    { name: "TypeError", message: /levels doit être un tableau/ }
  );
  assert.throws(
    () => summarizeCoverage({}),
    { name: "TypeError", message: /levels doit être un tableau/ }
  );
});

test("lance une TypeError pour une valeur invalide dans le tableau", () => {
  const levels = ["analyzed", "invalid", "metadata"];
  assert.throws(
    () => summarizeCoverage(levels),
    { name: "TypeError", message: /Valeur invalide dans le tableau/ }
  );
  assert.throws(() => summarizeCoverage([Symbol("metadata")]), { name: "TypeError", message: /Valeur invalide dans le tableau/ });
  assert.throws(() => summarizeCoverage(new Array(1)), { name: "TypeError", message: /Valeur invalide dans le tableau/ });
});

test("ne modifie pas le tableau fourni", () => {
  const levels = ["analyzed", "metadata", "partial"];
  const levelsCopy = [...levels];
  summarizeCoverage(levels);
  assert.deepEqual(levels, levelsCopy);
});