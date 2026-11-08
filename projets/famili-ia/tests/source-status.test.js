import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSources } from "../source-status.js";

const initial = { driveConfigured: true, driveToken: false, driveState: "unknown", localState: "unknown" };
const records = [
  { sourceId: "local", itemId: "1", coverage: "partial" },
  { sourceId: "local", itemId: "2", coverage: "metadata" },
  { sourceId: "drive", itemId: "1", coverage: "metadata" }
];

test("couverture des documents présents distincte de l'accès à leur source", () => {
  const [local, drive] = describeSources(records, initial);
  assert.equal(local.count, 2);
  assert.equal(local.contentCount, 1);
  assert.match(local.access, /inconnu/);
  assert.equal(drive.count, 1);
  assert.equal(drive.contentCount, 0);
  assert.match(drive.access, /Aucun jeton.*inconnu/);
});

test("un jeton et des fichiers stockés ne garantissent ni accès ni exhaustivité", () => {
  const [, drive] = describeSources(records, { ...initial, driveToken: true });
  assert.match(drive.access, /non vérifié/);
  assert.doesNotMatch(drive.access, /accessible|complet/);
});

test("états observés de connexion, erreur, import et suppression", () => {
  assert.match(describeSources(records, { ...initial, driveConfigured: false })[1].access, /non configurée/);
  assert.match(describeSources(records, { ...initial, driveState: "error", driveToken: true })[1].access, /échoué/);
  const disconnected = describeSources(records, { ...initial, driveState: "disconnected" })[1];
  assert.match(disconnected.access, /déconnectée/);
  assert.equal(disconnected.count, 1);
  assert.match(describeSources(records, { ...initial, localState: "working" })[0].access, /en cours/);
  assert.match(describeSources(records, { ...initial, localState: "error" })[0].access, /erreur/);
  assert.deepEqual(describeSources([], initial).map(source => source.count), [0, 0]);
});

test("entrées invalides explicitement rejetées", () => {
  assert.throws(() => describeSources(null, initial), TypeError);
  assert.throws(() => describeSources([], { ...initial, driveState: "complete" }), TypeError);
  assert.throws(() => describeSources([], { ...initial, localState: "accessible" }), TypeError);
});
