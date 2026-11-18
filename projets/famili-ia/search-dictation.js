export function initSearchDictation() {
  const input = document.querySelector("#experimental-index-query");
  const button = document.querySelector("#search-dictation");
  const status = document.querySelector("#search-dictation-status");
  const dialog = document.querySelector("#search-dictation-dialog");
  const start = document.querySelector("#start-search-dictation");
  const cancel = document.querySelector("#cancel-search-dictation");
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const available = window.isSecureContext && typeof Recognition === "function";
  let informed = false;
  let active = null;
  let writing = false;
  let stopping = false;

  function announce(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function resetButton() {
    button.disabled = false;
    stopping = false;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Dicter la recherche");
    button.title = "Dicter la recherche";
  }

  function cancelDictation() {
    if (dialog.open) dialog.close();
    const current = active;
    if (!current) return;
    active = null;
    resetButton();
    announce("Dictée interrompue.");
    try {
      current.abort();
      return true;
    } catch (error) {
      console.error("Impossible d'interrompre la dictée :", error);
      announce("Le navigateur n'a pas confirmé l'arrêt de la dictée. Vérifiez son indicateur de microphone.");
      return false;
    }
  }

  function begin() {
    const base = input.value.trimEnd();
    const transcripts = new Map();
    let failed = false;
    try {
      const current = new Recognition();
      current.lang = "fr-FR";
      current.continuous = false;
      current.interimResults = false;
      current.maxAlternatives = 1;
      active = current;
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("aria-label", "Arrêter la dictée");
      button.title = "Arrêter la dictée";
      announce("Démarrage du micro…");
      current.onstart = () => {
        if (active === current) announce("Écoute en cours. Parlez, puis utilisez le bouton pour arrêter.");
      };
      current.onresult = event => {
        if (active !== current || failed) return;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0].transcript.trim();
          if (result.isFinal && text) transcripts.set(index, text);
        }
        const text = [...transcripts.values()].filter(Boolean).join(" ");
        if (!text) return;
        writing = true;
        input.value = [base, text].filter(Boolean).join(" ");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        writing = false;
        announce("Texte ajouté. Vous pouvez le corriger avant de lancer la recherche.");
      };
      current.onerror = event => {
        if (active !== current) return;
        failed = true;
        const messages = {
          "not-allowed": "Accès au micro refusé. Vérifiez les permissions du navigateur ou saisissez votre recherche.",
          "service-not-allowed": "Le service de dictée est refusé par ce navigateur. Saisissez votre recherche.",
          "audio-capture": "Aucun microphone utilisable. Vérifiez son branchement et ses permissions.",
          "no-speech": "Aucune parole reconnue. Vous pouvez réessayer ou saisir votre recherche.",
          network: "Le service de dictée est indisponible ou hors connexion. Saisissez votre recherche.",
          aborted: "Dictée interrompue. Le texte déjà ajouté est conservé."
        };
        console.warn("Échec de la dictée :", event.error);
        announce(messages[event.error] || "La dictée a échoué. Vous pouvez réessayer ou saisir votre recherche.");
        active = null;
        resetButton();
        try {
          current.abort();
        } catch (error) {
          console.error("Impossible de libérer la dictée après son échec :", error);
          announce("La dictée a échoué et son arrêt n'est pas confirmé. Vérifiez l'indicateur de microphone du navigateur.");
        }
      };
      current.onend = () => {
        if (active !== current) return;
        active = null;
        resetButton();
        if (!failed) announce(transcripts.size
          ? "Texte ajouté. Vous pouvez le corriger avant de lancer la recherche."
          : "Aucune parole reconnue. Vous pouvez réessayer ou saisir votre recherche.");
        input.focus({ preventScroll: true });
      };
      current.start();
    } catch (error) {
      console.error("Impossible de démarrer la dictée :", error);
      if (cancelDictation() !== false) {
        announce("Impossible de démarrer la dictée dans ce navigateur. Vous pouvez saisir votre recherche.");
      }
    }
  }

  button.addEventListener("click", () => {
    if (active) {
      if (stopping) {
        cancelDictation();
        return;
      }
      stopping = true;
      announce("Arrêt de la dictée…");
      button.setAttribute("aria-label", "Annuler la dictée");
      button.title = "Annuler la dictée";
      try {
        active.stop();
      } catch (error) {
        console.error("Impossible de terminer la dictée :", error);
        cancelDictation();
      }
    } else if (available && informed) begin();
    else {
      document.querySelector("#search-dictation-availability").textContent = available
        ? "La permission du microphone sera demandée par votre navigateur si nécessaire."
        : window.isSecureContext
          ? "La dictée n'est pas disponible dans ce navigateur ou cet aperçu. Essayez un navigateur compatible ; la saisie au clavier reste disponible."
          : "La dictée nécessite une connexion HTTPS ou un accès local sécurisé.";
      start.hidden = !available;
      cancel.textContent = available ? "Annuler" : "Fermer";
      dialog.showModal();
    }
  });
  start.addEventListener("click", () => {
    if (!available) return;
    informed = true;
    dialog.close();
    begin();
  });
  cancel.addEventListener("click", () => dialog.close());
  document.querySelector("#close-search-dictation").addEventListener("click", () => dialog.close());
  input.addEventListener("input", () => {
    if (writing) return;
    if (cancelDictation() !== false) announce("");
  });
  document.querySelector("#experimental-index-form").addEventListener("submit", cancelDictation, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelDictation(); });
  window.addEventListener("pagehide", cancelDictation);
  return cancelDictation;
}
