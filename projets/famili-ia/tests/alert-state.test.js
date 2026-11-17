import assert from "node:assert/strict";
import test from "node:test";
import {
  hashLegacyRecord,
  reconcileDocumentAlerts,
  removeUnmodifiedLegacyRecords
} from "../state.js";

test("removes only exact legacy-state matches and preserves edited records", async () => {
  const unchanged = { id: "legacy-user", name: "Synthetic example", preferences: { localAccess: true } };
  const edited = { ...unchanged, name: "User-edited value" };
  const unrelated = { id: "custom-user", name: "Custom value" };
  const removed = [];
  const expectedHash = await hashLegacyRecord(unchanged);

  const retained = await removeUnmodifiedLegacyRecords({
    users: [unchanged, edited, unrelated],
    family: []
  }, {
    users: { "legacy-user": expectedHash }
  }, async (storeName, id) => removed.push({ storeName, id }));

  assert.deepEqual(removed, [{ storeName: "users", id: "legacy-user" }]);
  assert.deepEqual(retained.users, [edited, unrelated]);
  assert.deepEqual(retained.family, []);
});

test("preserves legacy candidates when SHA-256 is unavailable", async () => {
  const candidate = { id: "legacy-user", name: "Synthetic example" };
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const originalWarn = console.warn;
  const warnings = [];
  delete globalThis.crypto;
  console.warn = message => warnings.push(message);
  try {
    const retained = await removeUnmodifiedLegacyRecords({
      users: [candidate]
    }, {
      users: { "legacy-user": "known-hash" }
    }, async () => assert.fail("must not delete without a verifiable hash"));

    assert.deepEqual(retained.users, [candidate]);
    assert.match(warnings[0], /SHA-256 indisponible.*données préservées/);
  } finally {
    Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    console.warn = originalWarn;
  }
});

test("reconciles document alerts idempotently and preserves choices and missing-copy alerts", () => {
  const existingAlerts = [
    { id: "demo-alert", title: "Exemple", type: "amber" },
    {
      id: "alert-doc-1",
      docId: "doc-1",
      dueDate: "2027-01-15",
      status: "ignored",
      notificationSentFor: "2027-01-15",
      notificationSentAt: "2027-01-12T10:00:00.000Z",
      snoozedUntil: "2027-01-13"
    },
    { id: "alert-deleted-doc", docId: "deleted-doc", source: "document", status: "resolved" }
  ];
  const generatedAlerts = [
    { id: "alert-doc-1", docId: "doc-1", dueDate: "2027-01-15", status: "active", source: "document" }
  ];

  const reconciled = reconcileDocumentAlerts(existingAlerts, generatedAlerts);
  assert.deepEqual(reconciled.alerts.map(({ id }) => id), ["demo-alert", "alert-doc-1", "alert-deleted-doc"]);
  assert.equal(reconciled.alerts[1].status, "ignored");
  assert.equal(reconciled.alerts[1].notificationSentFor, "2027-01-15");
  assert.equal(reconciled.alerts[1].notificationSentAt, "2027-01-12T10:00:00.000Z");
  assert.equal(reconciled.alerts[1].snoozedUntil, "2027-01-13");
  assert.equal(reconciled.alerts[2].status, "resolved");
  assert.equal(reconciled.alerts[2].sourceReview, "proof-unavailable");
  assert.deepEqual(reconciled.alertsToRemove, []);
  assert.deepEqual(reconcileDocumentAlerts(reconciled.alerts, generatedAlerts).alerts, reconciled.alerts);
});

test("keeps the previous due date and choices when a source proposes another date", () => {
  const existing = [{
    id: "alert-doc-1",
    docId: "doc-1",
    dueDate: "2027-01-15",
    status: "ignored",
    notificationSentFor: "2027-01-15",
    snoozedUntil: "2027-01-14",
    source: "document"
  }];
  const generated = [{
    id: "alert-doc-1",
    docId: "doc-1",
    dueDate: "2027-02-15",
    status: "active",
    source: "document"
  }];

  const reconciled = reconcileDocumentAlerts(existing, generated);
  assert.equal(reconciled.alerts[0].status, "ignored");
  assert.equal(reconciled.alerts[0].dueDate, "2027-01-15");
  assert.equal(reconciled.alerts[0].notificationSentFor, "2027-01-15");
  assert.equal(reconciled.alerts[0].notificationSentAt, undefined);
  assert.equal(reconciled.alerts[0].snoozedUntil, "2027-01-14");
  assert.equal(reconciled.alerts[0].sourceReview, "source-changed");
});

test("distinguishes missing copies, ambiguous identities and changed proofs without deleting reminders", () => {
  const alert = {
    id: "alert-doc", docId: "doc", source: "document", sourceId: "local",
    documentType: "assurance", dueDate: "2027-02-15", sourceExcerpt: "Fin : 15/02/2027",
    status: "resolved", sourceContentHash: "old-hash", sourceAccountFingerprint: "old-account"
  };
  const document = {
    id: "doc", isLocal: true, type: "assurance", expiryDate: alert.dueDate,
    expiryDateEvidence: alert.sourceExcerpt, contentProvenance: { hash: "old-hash" },
    oneDriveAccountFingerprint: "old-account"
  };
  assert.equal(reconcileDocumentAlerts([alert], [], []).alerts[0].sourceReview, "source-missing");
  assert.equal(reconcileDocumentAlerts([alert], [], [document, document]).alerts[0].sourceReview, "source-ambiguous");
  assert.equal(reconcileDocumentAlerts([alert], [], [{ ...document, expiryDate: null }]).alerts[0].sourceReview, "proof-unavailable");
  for (const change of [
    { contentProvenance: { hash: "new-hash" } }, { oneDriveAccountFingerprint: "new-account" },
    { driveSource: true }, { expiryDateEvidence: "Autre preuve" }
  ]) {
    const result = reconcileDocumentAlerts([alert], [], [{ ...document, ...change }]).alerts[0];
    assert.equal(result.sourceReview, "source-changed");
    assert.equal(result.status, "resolved");
    assert.equal(result.dueDate, alert.dueDate);
  }
  assert.equal(reconcileDocumentAlerts([alert], [], [document]).alerts[0].sourceReview, null);
});
