import assert from "node:assert/strict";
import test from "node:test";
import { reconcileDocumentAlerts } from "../state.js";

test("reconciles document alerts idempotently and preserves status for unchanged due dates", () => {
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
  assert.deepEqual(reconciled.alerts.map(({ id }) => id), ["demo-alert", "alert-doc-1"]);
  assert.equal(reconciled.alerts[1].status, "ignored");
  assert.equal(reconciled.alerts[1].notificationSentFor, "2027-01-15");
  assert.equal(reconciled.alerts[1].notificationSentAt, "2027-01-12T10:00:00.000Z");
  assert.equal(reconciled.alerts[1].snoozedUntil, "2027-01-13");
  assert.deepEqual(reconciled.alertsToRemove.map(({ id }) => id), ["alert-deleted-doc"]);
  assert.deepEqual(reconcileDocumentAlerts(reconciled.alerts, generatedAlerts).alerts, reconciled.alerts);
});

test("resets alert status and notification marker when its due date changes", () => {
  const existing = [{
    id: "alert-doc-1",
    docId: "doc-1",
    dueDate: "2027-01-15",
    status: "ignored",
    notificationSentFor: "2027-01-15",
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
  assert.equal(reconciled.alerts[0].status, "active");
  assert.equal(reconciled.alerts[0].notificationSentFor, undefined);
  assert.equal(reconciled.alerts[0].notificationSentAt, undefined);
  assert.equal(reconciled.alerts[0].snoozedUntil, undefined);
});
