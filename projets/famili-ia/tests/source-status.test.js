import { test } from "node:test";
import assert from "node:assert/strict";
import { createSourceRunStatus, describeSources } from "../source-status.js";

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

test("les capacités décrivent le périmètre et les limites sans supposer de compte ou synchronisation", () => {
  const [local, drive, onedrive] = describeSources(records, initial);
  assert.match(local.scope, /nouvelle copie/);
  assert.match(drive.scope, /compte d'origine non identifié/);
  assert.match(drive.scope, /Pas de parcours complet/);
  assert.match(onedrive.scope, /permission de lecture large/);
  assert.match(onedrive.scope, /pas actualisées automatiquement/);
});

test("états observés de connexion, erreur, import et suppression", () => {
  assert.match(describeSources(records, { ...initial, driveConfigured: false })[1].access, /non configurée/);
  assert.match(describeSources(records, { ...initial, driveState: "error", driveToken: true })[1].access, /échoué/);
  const disconnected = describeSources(records, { ...initial, driveState: "disconnected" })[1];
  assert.match(disconnected.access, /déconnectée/);
  assert.equal(disconnected.count, 1);
  assert.match(describeSources(records, { ...initial, localState: "working" })[0].access, /en cours/);
  assert.match(describeSources(records, { ...initial, localState: "error" })[0].access, /erreur/);
  assert.deepEqual(describeSources([], initial).map(source => source.count), [0, 0, 0]);
});

test("entrées invalides explicitement rejetées", () => {
  assert.throws(() => describeSources(null, initial), TypeError);
  assert.throws(() => describeSources([], { ...initial, driveState: "complete" }), TypeError);
  assert.throws(() => describeSources([], { ...initial, localState: "accessible" }), TypeError);
});

test("la couverture distingue métadonnées, texte partiel, analyse et indisponibilité", () => {
  const statuses = describeSources([
    ...records,
    { sourceId: "local", itemId: "3", coverage: "analyzed" },
    { sourceId: "local", itemId: "4", coverage: "unavailable" }
  ], initial);
  const local = statuses[0];
  assert.equal(local.contentCount, 2);
  assert.deepEqual(local.coverageCounts, {
    unavailable: 1, metadata: 1, partial: 1, analyzed: 1, unknown: 0
  });
  assert.match(local.message, /contenu recherché/);
});

test("un parcours complet reste borné au périmètre et ne prouve pas la fraîcheur des copies", () => {
  const run = createSourceRunStatus({
    sourceId: "onedrive",
    accountRef: "a".repeat(64),
    scopeKind: "account",
    state: "complete",
    startedAt: "2026-03-19T10:00:00.000Z",
    finishedAt: "2026-03-19T10:02:00.000Z",
    lastSuccessfulAt: "2026-03-19T10:02:00.000Z",
    discoveredCount: 3,
    processedCount: 3,
    failedCount: 0
  });
  const [onedrive] = describeSources(records, {
    ...initial,
    sourceRuns: [run],
    accountRefs: { onedrive: "a".repeat(64) }
  }).filter(source => source.sourceId === "onedrive");
  assert.match(onedrive.freshness, /Parcours terminé pour le périmètre choisi/);
  assert.match(onedrive.freshness, /ne confirme pas la relecture du contenu/);
  assert.equal(onedrive.run.discoveredCount, 3);
});

test("un parcours incomplet conserve distinctement la date du dernier parcours complet", () => {
  const run = createSourceRunStatus({
    sourceId: "local",
    scopeKind: "selected-files",
    state: "interrupted",
    startedAt: "2026-03-19T10:00:00.000Z",
    finishedAt: "2026-03-19T10:01:00.000Z",
    lastSuccessfulAt: "2026-03-18T10:00:00.000Z",
    discoveredCount: 4,
    processedCount: 2,
    failedCount: 0
  });
  const local = describeSources(records, { ...initial, sourceRuns: [run] })[0];
  assert.match(local.freshness, /interrompu/);
  assert.match(local.freshness, /Dernier parcours complet/);
});

test("les états complets incohérents et les identités non pseudonymisées sont rejetés", () => {
  assert.throws(() => createSourceRunStatus({
    sourceId: "drive",
    state: "complete",
    startedAt: "2026-03-19T10:00:00.000Z",
    finishedAt: "2026-03-19T10:01:00.000Z",
    discoveredCount: 2,
    processedCount: 1,
    failedCount: 1
  }), TypeError);
  assert.throws(() => createSourceRunStatus({
    sourceId: "drive",
    accountRef: "compte-en-clair",
    state: "running",
    startedAt: "2026-03-19T10:00:00.000Z"
  }), TypeError);
});
