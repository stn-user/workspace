import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { detectQuestionIntent, extractExactFact, getQuestionTerms } from "./search-utils.js";

const invoice = await readFile(new URL("./samples/facture-piscine.txt", import.meta.url), "utf8");
const warranty = await readFile(new URL("./samples/garantie-pompe.txt", import.meta.url), "utf8");
const maintenance = await readFile(new URL("./samples/notice-filtre.txt", import.meta.url), "utf8");
const invoiceLines = invoice.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const warrantyLines = warranty.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const maintenanceLines = maintenance.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

test("detects factual question intents without a remote AI", () => {
  assert.equal(detectQuestionIntent("Combien a coûté la piscine ?"), "amount");
  assert.equal(detectQuestionIntent("Quand expire la garantie de la pompe ?"), "date");
  assert.equal(detectQuestionIntent("Quel est le numéro de facture ?"), "identifier");
  assert.equal(detectQuestionIntent("Combien de temps dure la garantie ?"), "duration");
  assert.equal(detectQuestionIntent("À quelle fréquence rincer le filtre ?"), "frequency");
  assert.equal(detectQuestionIntent("Quel est le nom du vendeur ?"), null);
});

test("normalizes accented search terms for deterministic matching", () => {
  assert.deepEqual(getQuestionTerms("Combien a coûté la piscine ?"), ["coute", "piscine"]);
});

test("extracts and quotes the amount line from the selected text file", () => {
  assert.equal(
    extractExactFact("Quel est le montant total de la facture de piscine ?", invoiceLines),
    "Montant total : 8 900 euros TTC"
  );
});

test("selects the warranty end date when the question concerns expiry", () => {
  assert.equal(
    extractExactFact("Quand se termine la garantie de la pompe ?", warrantyLines),
    "Fin de garantie : 4 mai 2028"
  );
});

test("extracts invoice identifiers, warranty durations, and maintenance frequencies", () => {
  assert.equal(
    extractExactFact("Quel est le numéro de la facture ?", invoiceLines),
    "Numero : AJ-2023-0318"
  );
  assert.equal(
    extractExactFact("Combien d'années dure la garantie ?", warrantyLines),
    "Duree de garantie : 5 ans"
  );
  assert.equal(
    extractExactFact("À quelle fréquence faut-il rincer le filtre ?", maintenanceLines),
    "Frequence de rincage recommandee : toutes les deux semaines en periode d'utilisation."
  );
});

test("extracts the same fact from common alternative question formulations", () => {
  assert.equal(extractExactFact("Quel prix pour l'installation de la piscine ?", invoiceLines), "Montant total : 8 900 euros TTC");
  assert.equal(extractExactFact("À quelle date finit la garantie Hayward ?", warrantyLines), "Fin de garantie : 4 mai 2028");
  assert.equal(extractExactFact("Combien d'années vaut la garantie de la pompe ?", warrantyLines), "Duree de garantie : 5 ans");
});

test("returns no extracted answer when the requested fact is absent", () => {
  assert.equal(extractExactFact("Quel est le montant total ?", ["Facture fictive", "Statut : réglée"]), null);
});
