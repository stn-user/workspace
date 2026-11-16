const SOURCE_RUN_SCOPES = new Set([
  "account",
  "selected-files",
  "selected-directories",
  "photo-library-selection",
  "unknown"
]);

const SOURCE_RUN_STATES = new Set(["running", "complete", "partial", "interrupted", "error"]);
const COVERAGE_LEVELS = ["unavailable", "metadata", "partial", "analyzed"];

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

export function sourceRunStatusId(sourceId, accountRef = null) {
  if (typeof sourceId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(sourceId)
    || (accountRef !== null && (typeof accountRef !== "string" || !/^[a-f0-9]{64}$/.test(accountRef)))) {
    throw new TypeError("Identité de parcours de source invalide");
  }
  return `source-run:v1:${sourceId}:${accountRef || "unattributed"}`;
}

export function createSourceRunStatus({
  sourceId,
  accountRef = null,
  scopeKind = "unknown",
  state,
  startedAt,
  finishedAt = null,
  lastSuccessfulAt = null,
  discoveredCount = null,
  processedCount = 0,
  failedCount = 0
}) {
  const id = sourceRunStatusId(sourceId, accountRef);
  if (!SOURCE_RUN_SCOPES.has(scopeKind) || !SOURCE_RUN_STATES.has(state)
    || !isIsoTimestamp(startedAt)
    || (finishedAt !== null && !isIsoTimestamp(finishedAt))
    || (lastSuccessfulAt !== null && !isIsoTimestamp(lastSuccessfulAt))
    || (discoveredCount !== null && !isCount(discoveredCount))
    || !isCount(processedCount) || !isCount(failedCount)
    || (discoveredCount !== null && processedCount + failedCount > discoveredCount)
    || (state === "running" && finishedAt !== null)
    || (state !== "running" && (finishedAt === null || finishedAt < startedAt))
    || (lastSuccessfulAt !== null && finishedAt !== null && lastSuccessfulAt > finishedAt)
    || (state === "complete" && (discoveredCount === null || processedCount !== discoveredCount || failedCount !== 0))) {
    throw new TypeError("État de parcours de source invalide");
  }
  return {
    id,
    kind: "source-run-status",
    schemaVersion: 1,
    sourceId,
    accountRef,
    scopeKind,
    state,
    startedAt,
    finishedAt,
    lastSuccessfulAt,
    discoveredCount,
    processedCount,
    failedCount
  };
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function describeRun(run) {
  if (!run) return "Aucun parcours enregistré ; périmètre total et fraîcheur inconnus.";
  if (run.state === "running") {
    return `Parcours en cours depuis le ${formatDate(run.startedAt)} ; résultats potentiellement incomplets.`;
  }
  if (run.state === "complete") {
    return `Parcours terminé pour le périmètre choisi le ${formatDate(run.finishedAt)} ; cela ne confirme pas la relecture du contenu des copies existantes.`;
  }
  const outcome = run.state === "partial" ? "partiel"
    : run.state === "interrupted" ? "interrompu" : "en erreur";
  const failures = run.failedCount ? ` ${run.failedCount} échec(s) enregistré(s).` : "";
  const lastSuccess = run.lastSuccessfulAt
    ? ` Dernier parcours complet : ${formatDate(run.lastSuccessfulAt)}.`
    : " Aucun parcours complet antérieur n'est enregistré.";
  return `Dernier parcours ${outcome} le ${formatDate(run.finishedAt)}.${failures}${lastSuccess}`;
}

function coverageSummary(records, sourceId) {
  const items = records.filter(record => record.sourceId === sourceId);
  const coverageCounts = Object.fromEntries(COVERAGE_LEVELS.map(level => [
    level,
    items.filter(record => record.coverage === level).length
  ]));
  const unknownCount = items.length - Object.values(coverageCounts).reduce((sum, count) => sum + count, 0);
  const contentCount = coverageCounts.partial + coverageCounts.analyzed;
  return {
    count: items.length,
    contentCount,
    coverageCounts: { ...coverageCounts, unknown: unknownCount },
    message: `${items.length} fichier${items.length === 1 ? "" : "s"} présent${items.length === 1 ? "" : "s"} dans Famili-IA ; ${contentCount} avec du contenu recherché (${coverageCounts.partial} partiel${coverageCounts.partial === 1 ? "" : "s"}, ${coverageCounts.analyzed} analysé${coverageCounts.analyzed === 1 ? "" : "s"}), ${coverageCounts.metadata} en métadonnées seules et ${coverageCounts.unavailable} indisponible${coverageCounts.unavailable === 1 ? "" : "s"}.`
  };
}

export function describeSources(records, {
  driveConfigured,
  driveToken,
  driveState,
  localState,
  oneDriveState = "unknown",
  dropboxState,
  sourceRuns = [],
  accountRefs = {}
}) {
  if (!Array.isArray(records) || typeof driveConfigured !== "boolean" ||
      typeof driveToken !== "boolean" ||
      !["unknown", "disconnected", "error"].includes(driveState) ||
      !["unknown", "working", "error"].includes(localState) ||
      !["unknown", "connected", "working", "error", "disconnected"].includes(oneDriveState) ||
      (dropboxState !== undefined && !["unknown", "connected", "working", "error", "disconnected"].includes(dropboxState)) ||
      !Array.isArray(sourceRuns) ||
      !sourceRuns.every(run => run?.kind === "source-run-status" && sourceRunStatusId(run.sourceId, run.accountRef) === run.id) ||
      typeof accountRefs !== "object" || accountRefs === null || Array.isArray(accountRefs)) {
    throw new TypeError("État des sources invalide");
  }
  const getRun = sourceId => {
    const accountRef = accountRefs[sourceId];
    if (accountRef) return sourceRuns.find(run => run.sourceId === sourceId && run.accountRef === accountRef) || null;
    return sourceRuns
      .filter(run => run.sourceId === sourceId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] || null;
  };
  const describeSource = sourceId => ({
    ...coverageSummary(records, sourceId),
    freshness: describeRun(getRun(sourceId)),
    run: getRun(sourceId)
  });
  const local = describeSource("local");
  const drive = describeSource("drive");
  const localAccess = localState === "error" ? "Dernière importation locale en erreur ; accès aux originaux inconnu."
    : localState === "working" ? "Importation locale en cours ; résultats incomplets et accès aux originaux inconnu."
    : "Accès actuel aux originaux locaux inconnu.";
  let driveAccess;
  if (driveState === "error") driveAccess = "Une opération Google Drive a échoué ; accès actuel inconnu.";
  else if (!driveConfigured) driveAccess = "Connexion Google Drive non configurée ou indisponible sur cette plateforme ; accès actuel inconnu.";
  else if (driveState === "disconnected") driveAccess = "Session Google Drive déconnectée ; révocation confirmée pour cette session.";
  else if (driveToken) driveAccess = "Jeton Google présent pour cette session ; accès actuel aux fichiers non vérifié.";
  else driveAccess = "Aucun jeton Google dans cette session ; accès actuel aux fichiers inconnu.";
  const statuses = [
    {
      sourceId: "local", ...local, access: localAccess,
      scope: "Fichiers importés explicitement ; une nouvelle sélection peut créer une nouvelle copie. Aucun suivi automatique des originaux."
    },
    {
      sourceId: "drive", ...drive, access: driveAccess,
      scope: "Fichiers sélectionnés avec Google Picker ; compte d'origine non identifié par Famili-IA. Pas de parcours complet ni d'actualisation automatique."
    },
    {
      sourceId: "onedrive", ...describeSource("onedrive"), access:
        oneDriveState === "working" ? "Indexation OneDrive en cours ; résultats incomplets."
          : oneDriveState === "connected" ? "Session OneDrive active ; accès actuel aux originaux non vérifié."
            : oneDriveState === "error" ? "Une opération OneDrive a échoué ; accès actuel inconnu."
              : oneDriveState === "disconnected" ? "Session OneDrive locale déconnectée ; révocation Microsoft non vérifiée."
                : "Accès actuel à OneDrive inconnu.",
      scope: "OneDrive personnel : parcours déclenché séparément, permission de lecture large. Les copies existantes ne sont pas actualisées automatiquement."
    }
  ];
  if (dropboxState !== undefined || records.some(record => record.sourceId === "dropbox")) statuses.push({
    sourceId: "dropbox", ...describeSource("dropbox"),
    access: dropboxState === "working" ? "Indexation Dropbox en cours ; résultats incomplets."
      : dropboxState === "connected" ? "Session Dropbox active ; accès actuel aux originaux non vérifié."
        : dropboxState === "error" ? "Une opération Dropbox a échoué ; accès actuel inconnu."
          : dropboxState === "disconnected" ? "Session Dropbox locale déconnectée ; révocation fournisseur non vérifiée."
            : "Accès actuel à Dropbox inconnu.",
    scope: "Full Dropbox en lecture seule selon la configuration de l'application ; indexation déclenchée séparément. Les copies existantes ne sont pas remplacées ; aucun suivi des suppressions."
  });
  return statuses;
}
