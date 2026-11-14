const params = new URLSearchParams(window.location.search);
const result = {
  type: "famili-dropbox-oauth",
  state: params.get("state"),
  code: params.get("code"),
  error: params.get("error")
};
history.replaceState(null, "", window.location.pathname);
if (window.opener) {
  window.opener.postMessage(result, window.location.origin);
  document.querySelector("#dropbox-redirect-status").textContent = "Retour transmis à Famili-IA. Vous pouvez fermer cette fenêtre.";
} else {
  document.querySelector("#dropbox-redirect-status").textContent = "Fenêtre Famili-IA introuvable. Fermez cette fenêtre puis recommencez la connexion depuis l'application.";
}
