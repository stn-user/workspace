export function describeSources(records, { driveConfigured, driveToken, driveState, localState }) {
  if (!Array.isArray(records) || typeof driveConfigured !== "boolean" ||
      typeof driveToken !== "boolean" ||
      !["unknown", "disconnected", "error"].includes(driveState) ||
      !["unknown", "working", "error"].includes(localState)) {
    throw new TypeError("État des sources invalide");
  }
  const describeCoverage = source => {
    const items = records.filter(record => record.sourceId === source);
    const contentCount = items.filter(record => record.coverage === "partial").length;
    return {
      count: items.length,
      contentCount,
      message: `${items.length} fichier${items.length === 1 ? "" : "s"} présent${items.length === 1 ? "" : "s"} dans Famili-IA, dont ${contentCount} avec texte partiellement recherché.`
    };
  };
  const local = describeCoverage("local");
  const drive = describeCoverage("drive");
  const localAccess = localState === "error" ? "Dernière importation locale en erreur ; accès aux originaux inconnu."
    : localState === "working" ? "Importation locale en cours ; résultats incomplets et accès aux originaux inconnu."
    : "Accès actuel aux originaux locaux inconnu.";
  let driveAccess;
  if (driveState === "error") driveAccess = "Une opération Google Drive a échoué ; accès actuel inconnu.";
  else if (!driveConfigured) driveAccess = "Connexion Google Drive non configurée ou indisponible sur cette plateforme ; accès actuel inconnu.";
  else if (driveState === "disconnected") driveAccess = "Session Google Drive déconnectée ; révocation confirmée pour cette session.";
  else if (driveToken) driveAccess = "Jeton Google présent pour cette session ; accès actuel aux fichiers non vérifié.";
  else driveAccess = "Aucun jeton Google dans cette session ; accès actuel aux fichiers inconnu.";
  return [
    { sourceId: "local", ...local, access: localAccess },
    { sourceId: "drive", ...drive, access: driveAccess }
  ];
}
