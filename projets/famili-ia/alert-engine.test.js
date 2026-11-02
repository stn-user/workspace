import assert from "node:assert/strict";
import test from "node:test";
import {
  generateAlertForDoc,
  getAlertLevelForDate,
  getAlertsToNotify,
  normalizeAlertDate,
  normalizeAlertNotificationPreferences,
  refreshAlerts
} from "./alert-engine.js";
import { parseDocument } from "./document-parser.js";

const today = new Date(2027, 0, 1, 12);

const documentCase = (type, expiryDate, overrides = {}) => ({
  id: `${type}-${expiryDate}`,
  type,
  originalName: "document-fictif.txt",
  expiryDate,
  expiryDateEvidence: `Échéance : ${expiryDate}`,
  ...overrides
});

test("normalizes explicit French, numeric and ISO dates and rejects invalid calendar dates", () => {
  assert.equal(normalizeAlertDate("4 mai 2028"), "2028-05-04");
  assert.equal(normalizeAlertDate("04/05/2028"), "2028-05-04");
  assert.equal(normalizeAlertDate("2028-05-04"), "2028-05-04");
  assert.equal(normalizeAlertDate("2027-02-29"), null);
  assert.equal(normalizeAlertDate("32/01/2027"), null);
  assert.equal(normalizeAlertDate("demain"), null);
});

test("applies document-specific thresholds without timezone or expired-date ambiguity", () => {
  assert.equal(getAlertLevelForDate("2027-01-16", "garantie", today), "red");
  assert.equal(getAlertLevelForDate("2027-01-17", "garantie", today), "amber");
  assert.equal(getAlertLevelForDate("2027-01-31", "assurance", today), "amber");
  assert.equal(getAlertLevelForDate("2027-02-01", "assurance", today), "blue");
  assert.equal(getAlertLevelForDate("2027-01-08", "facture", today), "red");
  assert.equal(getAlertLevelForDate("2027-01-09", "facture", today), "amber");
  assert.equal(getAlertLevelForDate("2026-12-31", "assurance", today), "red");
  assert.equal(getAlertLevelForDate("invalid", "garantie", today), null);
});

test("only creates source-backed alerts for supported dates and document types", () => {
  const alert = generateAlertForDoc(documentCase("garantie", "2027-01-16"), today);
  assert.equal(alert.type, "red");
  assert.equal(alert.sourceExcerpt, "Échéance : 2027-01-16");
  assert.equal(alert.confidence, "high");
  assert.equal(generateAlertForDoc(documentCase("garantie", "2027-03-15"), today), null);
  assert.equal(generateAlertForDoc(documentCase("garantie", "2027-02-30"), today), null);
  assert.equal(generateAlertForDoc(documentCase("garantie", "2027-01-16", { expiryDateEvidence: null }), today), null);
  assert.equal(generateAlertForDoc(documentCase("autre", "2027-01-16"), today), null);
  assert.equal(
    generateAlertForDoc(documentCase("assurance", "2027-01-16", { expiryDateEvidence: null, expiryDateSource: "user" }), today).confidence,
    "confirmed"
  );
});

test("document parsing only promotes explicitly labeled due dates to alert candidates", () => {
  const parsed = parseDocument(
    "CERTIFICAT DE GARANTIE\nDate de début : 4 mai 2023\nDurée de garantie : 5 ans\nFin de garantie : 4 mai 2028",
    "garantie.txt"
  );
  assert.equal(parsed.type, "garantie");
  assert.equal(parsed.expiryDate, "2028-05-04");
  assert.equal(parsed.expiryDateEvidence, "Fin de garantie : 4 mai 2028");

  const ambiguous = parseDocument(
    "CERTIFICAT DE GARANTIE\nDate d'achat : 4 mai 2023\nDurée de garantie : 5 ans",
    "garantie-sans-echeance.txt"
  );
  assert.equal(ambiguous.expiryDate, null);
  assert.equal(ambiguous.expiryDateEvidence, null);

  const insurance = parseDocument(
    "CONTRAT ASSURANCE HABITATION\nDate d'échéance : 15/01/2027",
    "assurance.txt"
  );
  assert.equal(insurance.type, "assurance");
  assert.equal(insurance.expiryDate, "2027-01-15");

  const genericContract = parseDocument(
    "CONTRAT DE PRESTATION\nDate d'échéance : 15/01/2027",
    "contrat.txt"
  );
  assert.equal(genericContract.type, "autre");
  assert.equal(generateAlertForDoc({
    id: "generic-contract",
    alertType: genericContract.type,
    expiryDate: genericContract.expiryDate,
    expiryDateEvidence: genericContract.expiryDateEvidence
  }, today), null);

  const maintenance = parseDocument(
    "CONTRÔLE TECHNIQUE\nÉchéance : 15/01/2027",
    "controle-technique.txt"
  );
  assert.equal(maintenance.type, "entretien");
});

test("refreshAlerts is deterministic and ignores invalid or unsupported source dates", () => {
  const documents = [
    documentCase("garantie", "2027-01-16"),
    documentCase("facture", "2027-01-08"),
    documentCase("entretien", "2027-01-31"),
    documentCase("assurance", "2027-02-01"),
    documentCase("assurance", "not-a-date")
  ];

  assert.deepEqual(
    refreshAlerts(documents, today).map(({ id, type }) => [id, type]),
    [["alert-garantie-2027-01-16", "red"], ["alert-facture-2027-01-08", "red"], ["alert-entretien-2027-01-31", "amber"]]
  );
});

test("notifications select only active future alerts within three days and only once per due date", () => {
  const alerts = [
    { id: "due-today", dueDate: "2027-01-01", status: "active", source: "document" },
    { id: "due-soon", dueDate: "2027-01-04", status: "active", source: "document" },
    { id: "too-early", dueDate: "2027-01-05", status: "active", source: "document" },
    { id: "already-notified", dueDate: "2027-01-02", notificationSentFor: "2027-01-02", source: "document" },
    { id: "ignored", dueDate: "2027-01-02", status: "ignored", source: "document" },
    { id: "expired", dueDate: "2026-12-31", status: "active", source: "document" },
    { id: "demo", dueDate: "2027-01-02", status: "active" }
  ];

  assert.deepEqual(getAlertsToNotify(alerts, today).map(({ id }) => id), ["due-today", "due-soon"]);
});

test("notification preferences validate categories, daily caps, quiet hours, and snoozes", () => {
  const alerts = [
    { id: "one", dueDate: "2027-01-02", documentType: "garantie", status: "active", source: "document" },
    { id: "two", dueDate: "2027-01-03", documentType: "assurance", status: "active", source: "document" },
    { id: "three", dueDate: "2027-01-04", documentType: "facture", status: "active", source: "document" },
    { id: "snoozed", dueDate: "2027-01-02", documentType: "garantie", status: "active", source: "document", snoozedUntil: "2027-01-02" }
  ];

  assert.deepEqual(
    getAlertsToNotify(alerts, today, { maxPerDay: 1 }).map(({ id }) => id),
    ["one"]
  );
  assert.deepEqual(
    getAlertsToNotify([
      { ...alerts[0], notificationSentAt: today.toISOString() },
      ...alerts.slice(1)
    ], today, { maxPerDay: 1 }),
    []
  );
  assert.deepEqual(
    getAlertsToNotify(alerts, today, { disabledCategories: ["garantie"] }).map(({ id }) => id),
    ["two", "three"]
  );
  assert.deepEqual(
    getAlertsToNotify(alerts, new Date(2027, 0, 1, 23), {
      quietHours: { enabled: true, start: "22:00", end: "08:00" }
    }),
    []
  );
  assert.deepEqual(
    normalizeAlertNotificationPreferences({
      disabledCategories: ["garantie", "unknown", "garantie"],
      maxPerDay: 99,
      quietHours: { enabled: true, start: "25:61", end: "08:00" }
    }),
    {
      disabledCategories: ["garantie"],
      maxPerDay: 3,
      quietHours: { enabled: true, start: "22:00", end: "08:00" }
    }
  );
});
