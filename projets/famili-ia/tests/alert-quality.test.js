import assert from "node:assert/strict";
import test from "node:test";
import { getAlertsToNotify, refreshAlerts } from "../alert-engine.js";

const referenceDate = new Date(2027, 0, 1, 12);
const corpus = [
  { id: "warranty-soon", type: "garantie", expiryDate: "2027-01-10", expiryDateEvidence: "Fin de garantie : 10/01/2027", expected: true },
  { id: "insurance-soon", type: "assurance", expiryDate: "2027-01-20", expiryDateEvidence: "Échéance : 20/01/2027", expected: true },
  { id: "invoice-soon", type: "facture", expiryDate: "2027-01-04", expiryDateEvidence: "À payer avant : 04/01/2027", expected: true },
  { id: "maintenance-far", type: "entretien", expiryDate: "2027-02-20", expiryDateEvidence: "Prochain contrôle : 20/02/2027", expected: false },
  { id: "warranty-unproven", type: "garantie", expiryDate: "2027-01-10", expected: false },
  { id: "warranty-invalid", type: "garantie", expiryDate: "2027-02-30", expiryDateEvidence: "Échéance : 30/02/2027", expected: false },
  { id: "unsupported-type", type: "autre", expiryDate: "2027-01-10", expiryDateEvidence: "Échéance : 10/01/2027", expected: false },
  { id: "insurance-expired", type: "assurance", expiryDate: "2026-12-29", expiryDateEvidence: "Fin de contrat : 29/12/2026", expected: true }
].map(({ expected, ...document }) => ({ ...document, expected }));

test("annotated fictional alert corpus meets baseline quality checks", () => {
  const generated = refreshAlerts(corpus, referenceDate);
  const expectedIds = new Set(corpus.filter(document => document.expected).map(document => `alert-${document.id}`));
  const generatedIds = new Set(generated.map(alert => alert.id));
  const truePositives = [...generatedIds].filter(id => expectedIds.has(id)).length;
  const falsePositives = [...generatedIds].filter(id => !expectedIds.has(id)).length;
  const falseNegatives = [...expectedIds].filter(id => !generatedIds.has(id)).length;
  const duplicateCount = generated.length - generatedIds.size;
  const missingEvidence = generated.filter(alert => !alert.sourceExcerpt).length;

  assert.equal(truePositives / generated.length, 1, "alert precision");
  assert.equal(truePositives / expectedIds.size, 1, "alert recall / missed deadlines");
  assert.equal(missingEvidence, 0, "source evidence coverage");
  assert.equal(duplicateCount, 0, "duplicate alert count");
  assert.equal(falsePositives, 0);
  assert.equal(falseNegatives, 0);

  const notifications = getAlertsToNotify(generated, referenceDate);
  const afterFirstDelivery = generated.map(alert => notifications.some(item => item.id === alert.id)
    ? { ...alert, notificationSentFor: alert.dueDate, notificationSentAt: referenceDate.toISOString() }
    : alert);
  assert.deepEqual(getAlertsToNotify(afterFirstDelivery, referenceDate), [], "notifications do not repeat for the same due date");
});
