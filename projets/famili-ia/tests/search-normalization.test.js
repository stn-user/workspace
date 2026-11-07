import assert from "node:assert/strict";
import test from "node:test";
import { normalizeText } from "../search-utils.js";

test("normalizes text with accents and special characters - Électricité, MAISON ! → electricite maison", () => {
  const input = "Électricité, MAISON !";
  const expected = "electricite maison";
  assert.equal(normalizeText(input), expected);
});

test("normalizes text with multiple spaces and hyphens - '  Facture---Piscine  ' → 'facture piscine'", () => {
  const input = "  Facture---Piscine  ";
  const expected = "facture piscine";
  assert.equal(normalizeText(input), expected);
});

test("normalizes text with accented e and apostrophes - CAFÉ déjà payé → cafe deja paye", () => {
  const input = "CAFÉ déjà payé";
  const expected = "cafe deja paye";
  assert.equal(normalizeText(input), expected);
});

test("normalizes text with underscores and dots - ABC_123.pdf → abc 123 pdf", () => {
  const input = "ABC_123.pdf";
  const expected = "abc 123 pdf";
  assert.equal(normalizeText(input), expected);
});

test("normalizes text with only special characters - '!!!' → empty string", () => {
  const input = "!!!";
  const expected = "";
  assert.equal(normalizeText(input), expected);
});

test("normalizes an empty string - '' → ''", () => {
  const input = "";
  const expected = "";
  assert.equal(normalizeText(input), expected);
});