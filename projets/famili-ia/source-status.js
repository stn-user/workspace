export function describeSources(records, { driveConfigured, driveToken, driveState, localState, oneDriveState = "unknown" }) {
  if (!Array.isArray(records) || typeof driveConfigured !== "boolean" ||
      typeof driveToken !== "boolean" ||
      !["unknown", "disconnected", "error"].includes(driveState) ||
      !["unknown", "working", "error"].includes(localState) ||
      !["unknown", "connected", "working", "error", "disconnected"].includes(oneDriveState)) {
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
    { sourceId: "local", ...local, access: localAccess,
      scope: "Fichiers importés explicitement ; une nouvelle sélection peut créer une nouvelle copie. Aucun suivi automatique des originaux." },
    { sourceId: "drive", ...drive, access: driveAccess,
      scope: "Fichiers sélectionnés avec Google Picker ; compte d'origine non identifié par Famili-IA. Pas de parcours complet ni d'actualisation automatique." },
    { sourceId: "onedrive", ...describeCoverage("onedrive"), access:
      oneDriveState === "working" ? "Indexation OneDrive en cours ; résultats incomplets."
      : oneDriveState === "connected" ? "Session OneDrive active ; accès actuel aux originaux non vérifié."
      : oneDriveState === "error" ? "Une opération OneDrive a échoué ; accès actuel inconnu."
      : oneDriveState === "disconnected" ? "Session OneDrive locale déconnectée ; révocation Microsoft non vérifiée."
      : "Accès actuel à OneDrive inconnu.",
      scope: "OneDrive personnel : parcours déclenché séparément, permission de lecture large. Les copies existantes ne sont pas actualisées automatiquement." }
  ];
}
