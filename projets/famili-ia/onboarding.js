import sprite from "./assets/prisme/aurore-icones.svg?no-inline";
import orbit from "./assets/prisme/aurore-orbite.svg";

const sources = [
  ["Cet appareil", "Recommandé · copie locale", "phone"],
  ["Google Drive", "Selon la configuration · non vérifié ici", "cloud"],
  ["OneDrive", "Selon la configuration · non vérifié ici", "cloud"],
  ["Dropbox", "Selon la configuration · non vérifié ici", "cloud"]
];
const introduction = ["welcome", "name", "choice"];
const personal = [...introduction, "sources", "ready"];
const example = ["question", "proof", "reminder"];
const demoQuestion = "Quand se termine le contrat habitation ?";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const icon = (id, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="${sprite}#i-${id}"/></svg>`;
const button = (action, label, cls = "btn main") => `<button type="button" class="${cls}" data-action="${action}">${label}</button>`;
const title = text => `<h1 tabindex="-1">${text}</h1>`;
const tip = text => `<div class="tipcard">${icon("shield")}<span>${text}</span></div>`;
const caption = text => `<span class="demochip mono">Exemple fictif</span><p class="stepcap mono">${text}</p>`;
const choice = (action, cls, glyph, label, sub) => button(action,
  `<span class="bub2">${icon(glyph)}</span>${action === "demo" ? '<span class="badge">Sans vos fichiers</span>' : ""}<b>${label}</b><span class="d">${sub}</span><span class="go">${icon("go")}</span>`, `choice ${cls}`);

export function createOnboarding(dialog, { saveName, finish, explore }) {
  const main = dialog.querySelector(".onbmain"), foot = dialog.querySelector(".onbfoot");
  const back = dialog.querySelector('[data-action="back"]'), skip = dialog.querySelector('[data-action="skip"]');
  const dots = dialog.querySelector(".onbdots");
  let flow, index, name, selected, response, mode, busy = false, typingTimer = 0;
  const focus = () => main.querySelector("h1").focus({ preventScroll: true });

  function render() {
    clearInterval(typingTimer);
    const step = flow[index];
    back.hidden = index === 0;
    skip.textContent = mode === "first" ? "Passer" : "Quitter";
    dots.setAttribute("aria-label", `Étape ${index + 1} sur ${flow.length}`);
    dots.innerHTML = flow.map((_, i) => `<i class="${i === index ? "on" : i < index ? "done" : ""}"></i>`).join("");
    foot.innerHTML = button("next", "Continuer");
    switch (step) {
      case "welcome":
        main.innerHTML = `<div class="onbhero"><img class="logo-mark" src="${orbit}" alt=""></div><div class="onbcenter">${title("Bienvenue dans Famili-IA")}<p class="osub">Retrouvez vos documents de famille, avec la preuve à chaque réponse. Tout reste sur cet appareil.</p></div>`;
        foot.innerHTML = button("next", "Commencer");
        break;
      case "choice":
        main.innerHTML = `${title("Comment voulez-vous commencer ?")}<p class="osub">Vous pourrez changer d’avis à tout moment.</p>${choice("personal", "a", "people", "Créer mon espace", "Choisissez où retrouver vos documents.")}${choice("demo", "b", "play", "Découvrir avec un exemple", "Une histoire fictive : question, preuve, rappel.")}`;
        foot.replaceChildren();
        break;
      case "name":
        main.innerHTML = `${title("Comment vous appeler ?")}<p class="osub">Un prénom ou un surnom suffit. Il est facultatif et restera sur cet appareil.</p><label class="field2"><input autocomplete="given-name" maxlength="40" aria-label="Prénom ou surnom" placeholder="Prénom ou surnom"></label><p class="osub">Il personnalisera votre accueil et pourra être modifié plus tard.</p>`;
        main.querySelector("input").value = name;
        break;
      case "sources":
        main.innerHTML = `${title("Où sont vos documents ?")}<p class="osub">Indiquez les sources à explorer ensuite.</p>` + sources.map(([label, sub, glyph], i) =>
          `<button type="button" class="srccard" data-source="${i}" aria-pressed="${selected.has(i)}"><span class="ic ${i ? "lilac" : "mint"}">${icon(glyph)}</span><span><b>${label}</b><small>${sub}</small></span><span class="ck">${icon("check")}</span></button>`
        ).join("") + tip("Ce choix prépare le récapitulatif. Rien n’est connecté ni importé. Vous choisirez les fichiers et les accès depuis Importer.");
        break;
      case "ready":
        main.innerHTML = `${title("Votre espace est prêt")}<p class="osub">${mode === "review" ? "Aperçu de la découverte : votre profil ne sera pas modifié." : "Votre prénom pourra être modifié dans Profil et famille."}</p><div class="recap"><div class="rr"><span class="ic lilac">${icon("people")}</span><div><b data-name></b><small>Nom d’affichage</small></div></div><div class="rr"><span class="ic mint">${icon("folder")}</span><div><b>${sources.filter((_, i) => selected.has(i)).map(([label]) => label).join(" · ") || "Aucune source choisie"}</b><small>Aucun accès accordé · à configurer dans Importer</small></div></div><div class="rr"><span class="ic butter">${icon("shield")}</span><div><b>Traitement local</b><small>Vos documents restent sur cet appareil.</small></div></div></div>`;
        main.querySelector("[data-name]").textContent = name.trim() || "Mon espace";
        foot.innerHTML = button("save", mode === "review" ? "Terminer la découverte" : "Ouvrir mon espace");
        break;
      case "question":
        main.innerHTML = caption("1 · Poser une question") + title("Posez-la comme à un proche") + `<p class="osub">Pas de mots-clés à deviner : une phrase suffit.</p><div class="qbox" aria-label="Question d’exemple">${icon("search")}<span data-question-text></span>${reduceMotion.matches ? "" : '<span class="caret" aria-hidden="true"></span>'}</div>`;
        foot.innerHTML = button("next", "Voir la réponse");
        break;
      case "proof":
        main.innerHTML = caption("2 · Une réponse, avec sa preuve") + title("Chaque réponse cite sa source") + `<article class="res">${icon("rings","rings")}<span class="pill">${icon("file")}Contrat</span><h3>Contrat habitation</h3><span class="meta">Exemple fictif · Texte indexé</span><div class="proof"><small>Extrait correspondant</small><q>Échéance : 12 décembre 2026.</q></div></article>` + tip("Sans preuve, Famili-IA le signale. Une copie ne garantit pas l’accès à l’original.");
        break;
      case "reminder":
        main.innerHTML = caption("3 · Agir, avec votre accord") + title("Un rappel, seulement si vous le voulez") + `<div class="coralmini"><div class="dt"><b>12</b><span>DÉC</span></div><div><h3>Contrat habitation</h3><p>Rappel proposé · exemple fictif</p></div></div><div class="confirmbar">${button("simulate","Simuler le rappel")}${button("decline","Pas maintenant","btn ghost")}</div><p role="status"></p>`;
        if (response) showResponse();
        foot.innerHTML = button("finish", "Terminer la démo") + button("explore", "Explorer la visite détaillée", "btn ghost");
        break;
    }
    main.scrollTop = 0;
    if (step === "question") {
      const question = main.querySelector("[data-question-text]");
      if (reduceMotion.matches) question.textContent = demoQuestion;
      else {
        let length = 0;
        typingTimer = window.setInterval(() => {
          length++;
          question.textContent = demoQuestion.slice(0, length);
          if (length >= demoQuestion.length) {
            clearInterval(typingTimer);
            main.querySelector(".caret")?.remove();
          }
        }, 45);
      }
    }
    if (dialog.open) focus();
  }
  function showResponse() {
    main.querySelector(".confirmbar").hidden = true;
    const status = main.querySelector('[role="status"]');
    status.textContent = response === "simulate" ? "Simulation terminée : aucun rappel ajouté à votre espace." : "Aucun rappel créé.";
    status.tabIndex = -1;
    if (dialog.open) status.focus();
  }
  dialog.addEventListener("input", e => {
    if (flow[index] === "name" && e.target.matches("input")) name = e.target.value;
  });
  dialog.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing && e.target.matches("input")) {
      e.preventDefault(); index++; render();
    }
  });
  dialog.addEventListener("cancel", e => { e.preventDefault(); if (!busy) skip.click(); });
  dialog.addEventListener("click", async e => {
    const el = e.target.closest("button");
    if (!el || busy) return;
    if (el.hasAttribute("data-source")) {
      const i = Number(el.dataset.source);
      if (selected.has(i)) selected.delete(i); else selected.add(i);
      el.setAttribute("aria-pressed", String(selected.has(i)));
      return;
    }
    const action = el.dataset.action;
    if (action === "explore") return explore();
    if (action === "simulate" || action === "decline") { response = action; showResponse(); return; }
    if (["save", "finish", "skip"].includes(action)) {
      clearInterval(typingTimer);
      busy = true;
      dialog.inert = true;
      try {
        if (action === "save" && mode === "first") await saveName(name.trim());
        finish();
      } catch (error) {
        console.error("Fin de la découverte impossible", error);
        let alert = foot.querySelector('[role="alert"]');
        if (!alert) { alert = document.createElement("p"); alert.setAttribute("role","alert"); foot.append(alert); }
        alert.textContent = "Enregistrement impossible sur cet appareil. Réessayez ou passez la découverte.";
      } finally { busy = false; dialog.inert = false; }
      return;
    }
    if (action === "back") index--;
    else {
      if (action === "personal") flow = personal;
      if (action === "demo") flow = [...introduction, ...example];
      index++;
    }
    render();
  });
  return { focus, start(kind) {
    mode = kind; flow = kind === "demo" ? example : personal;
    index = 0; name = ""; response = ""; selected = new Set([0]); render();
  } };
}
