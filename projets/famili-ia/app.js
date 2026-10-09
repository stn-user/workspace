const documents = [
  {
    id: "piscine-facture",
    name: "Facture - Installation piscine.pdf",
    type: "Facture",
    date: "4 mars 2023",
    keywords: "piscine facture paiement prix payé cout installation montant",
    summary: "La facture d’installation de la piscine indique un montant total de 8 900 € TTC, réglé le 4 mars 2023.",
    content: "AQUA JARDIN — FACTURE N° AJ-2023-0318\nDate : 4 mars 2023\nObjet : Installation d’une piscine familiale\nMontant total : 8 900 € TTC\nStatut : Réglée\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "piscine-garantie",
    name: "Garantie - Pompe piscine.pdf",
    type: "Garantie",
    date: "12 avril 2023",
    keywords: "garantie pompe piscine duree échéance fin expire expiration hayward modèle 2022",
    summary: "La garantie de la pompe Hayward Modèle 2022 est valable jusqu’au 4 mai 2028.",
    content: "CERTIFICAT DE GARANTIE — ÉQUIPEMENT PISCINE\nÉquipement : Pompe Hayward Modèle 2022\nDate de début : 4 mai 2023\nDurée : 5 ans\nFin de garantie : 4 mai 2028\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "bambu-facture",
    name: "Facture - Imprimante Bambu Lab A1.pdf",
    type: "Facture",
    date: "10 février 2025",
    keywords: "bambu lab a1 imprimante facture numéro référence achat prix coût montant",
    summary: "La facture de la Bambu Lab A1 porte le numéro BL-2025-10482. Le montant indiqué est de 449 € TTC.",
    content: "BAMBU STORE — FACTURE N° BL-2025-10482\nDate : 10 février 2025\nArticle : Imprimante Bambu Lab A1\nMontant : 449 € TTC\nStatut : Réglée\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "habitation-contrat",
    name: "Contrat - Assurance habitation.pdf",
    type: "Contrat",
    date: "1 janvier 2025",
    keywords: "contrat assurance habitation échéance termine fin renouvellement date",
    summary: "Le contrat d’assurance habitation arrive à échéance le 31 décembre 2025. La reconduction est prévue à cette date, sauf résiliation.",
    content: "ASSURANCE DEMO — CONTRAT HABITATION N° HAB-2025-7204\nDate d’effet : 1er janvier 2025\nÉchéance annuelle : 31 décembre 2025\nReconduction : tacite, sauf résiliation\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "maison-notice",
    name: "Notice - Filtre de piscine.pdf",
    type: "Notice",
    date: "7 mars 2023",
    keywords: "notice filtre piscine entretien nettoyage cartouche",
    summary: "La notice recommande de rincer la cartouche du filtre toutes les deux semaines en période d’utilisation.",
    content: "NOTICE D’ENTRETIEN — FILTRE DE PISCINE\nFréquence de rinçage recommandée : toutes les deux semaines en période d’utilisation.\nRemplacement de la cartouche : selon l’usure et au minimum une fois par saison.\n\nExemple fictif créé pour le prototype Famili-IA."
  }
];

const stopWords = new Set([
  "a", "ai", "au", "aux", "avec", "ce", "combien", "comment", "dans", "de", "des", "du", "elle",
  "en", "est", "et", "la", "le", "les", "ma", "mes", "mon", "ou", "par", "pour", "que", "quel",
  "quelle", "quand", "qui", "quoi", "se", "son", "sur", "un", "une", "vos", "votre", "y", "a-t-il"
]);

const uploadedDocuments = [];
const maxFiles = 5;
const maxFileSize = 1024 * 1024;
const form = document.querySelector("#search-form");
const input = document.querySelector("#question");
const results = document.querySelector("#results");
const noResults = document.querySelector("#no-results");
const answerText = document.querySelector("#answer-text");
const answerLabel = document.querySelector("#answer-label");
const resultCount = document.querySelector("#result-count");
const documentList = document.querySelector("#document-list");
const sourceDialog = document.querySelector("#source-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogMeta = document.querySelector("#dialog-meta");
const dialogContent = document.querySelector("#dialog-content");
const localFilesInput = document.querySelector("#local-files-input");
const clearFilesButton = document.querySelector("#clear-files");
const fileStatus = document.querySelector("#file-status");

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getQueryTerms(question) {
  return [...new Set(normalize(question).split(/\s+/).filter((term) => term.length > 1 && !stopWords.has(term)))];
}

function findDocuments(question) {
  const terms = getQueryTerms(question);
  if (terms.length === 0) return [];

  const searchableDocuments = uploadedDocuments.length > 0 ? uploadedDocuments : documents;
  return searchableDocuments
    .map((document) => {
      const searchable = normalize(`${document.name} ${document.type} ${document.keywords} ${document.content}`);
      const matchedTerms = terms.filter((term) => searchable.includes(term));
      const lines = document.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const excerpt = lines
        .map((line) => ({ line, matches: terms.filter((term) => normalize(line).includes(term)).length }))
        .filter((line) => line.matches > 0)
        .sort((a, b) => b.matches - a.matches || a.line.length - b.line.length)
        .slice(0, 3)
        .map(({ line }) => line.length > 280 ? `${line.slice(0, 277)}...` : line)
        .join(" … ");
      return { document, score: matchedTerms.length / terms.length, matchedTerms: matchedTerms.length, excerpt };
    })
    .filter((result) => result.matchedTerms > 0 && result.score >= 0.6)
    .sort((a, b) => b.score - a.score || b.matchedTerms - a.matchedTerms)
    .slice(0, 3);
}

function addTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderDocuments(matches) {
  documentList.replaceChildren();
  matches.forEach(({ document: sourceDocument }) => {
    const card = document.createElement("article");
    card.className = "document-card";

    const icon = addTextElement(card, "span", "file-icon", "▤");
    icon.setAttribute("aria-hidden", "true");

    const info = document.createElement("div");
    info.className = "document-info";
    addTextElement(info, "p", "document-name", sourceDocument.name);
    const origin = sourceDocument.isLocal ? "Fichier local · non transmis" : "Exemple fictif";
    addTextElement(info, "p", "document-meta", `${sourceDocument.type} · ${sourceDocument.date} · ${origin}`);
    card.append(info);

    const button = addTextElement(card, "button", "source-button", "Voir l’extrait");
    button.type = "button";
    button.addEventListener("click", () => openSource(sourceDocument));
    documentList.append(card);
  });
}

function openSource(document) {
  dialogTitle.textContent = document.name;
  dialogMeta.textContent = document.isLocal
    ? `${document.type} · chargé localement pour cette session`
    : `${document.type} · ${document.date} · Source de démonstration`;
  dialogContent.textContent = document.content;
  sourceDialog.showModal();
}

function search(question) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    input.focus();
    return;
  }

  const matches = findDocuments(trimmedQuestion);
  results.hidden = matches.length === 0;
  noResults.hidden = matches.length !== 0;
  if (matches.length === 0) return;

  const bestMatch = matches[0];
  answerLabel.textContent = bestMatch.document.isLocal
    ? "EXTRAIT CORRESPONDANT AU MOT-CLÉ — SANS IA"
    : "RÉPONSE SIMULÉE À PARTIR DES DOCUMENTS FICTIFS";
  answerText.textContent = bestMatch.document.isLocal
    ? `Extrait du fichier « ${bestMatch.document.name} » : « ${bestMatch.excerpt} »`
    : bestMatch.document.summary;
  resultCount.textContent = `${matches.length} ${matches.length === 1 ? "document trouvé" : "documents trouvés"}`;
  renderDocuments(matches);
  results.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setFileStatus(message, state) {
  fileStatus.textContent = message;
  if (state) fileStatus.dataset.state = state;
  else delete fileStatus.dataset.state;
}

async function loadLocalFiles(files) {
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) return;

  const invalidFile = selectedFiles.find((file) => !/\.(txt|md)$/i.test(file.name));
  if (invalidFile) {
    setFileStatus(`« ${invalidFile.name} » n’est pas un fichier TXT ou MD. Aucun fichier de cette sélection n’a été ajouté.`, "error");
    localFilesInput.value = "";
    return;
  }

  const oversizedFile = selectedFiles.find((file) => file.size > maxFileSize);
  if (oversizedFile) {
    setFileStatus(`« ${oversizedFile.name} » dépasse la limite de 1 Mo. Aucun fichier de cette sélection n’a été ajouté.`, "error");
    localFilesInput.value = "";
    return;
  }

  if (uploadedDocuments.length + selectedFiles.length > maxFiles) {
    setFileStatus(`La limite est de ${maxFiles} fichiers locaux à la fois. Retirez les fichiers ajoutés ou choisissez une sélection plus petite.`, "error");
    localFilesInput.value = "";
    return;
  }

  try {
    const loaded = await Promise.all(selectedFiles.map(async (file) => ({
      id: `local-${Date.now()}-${file.name}`,
      name: file.name,
      type: file.name.toLocaleLowerCase("fr").endsWith(".md") ? "Markdown" : "Texte",
      date: "Session locale",
      keywords: "",
      summary: "",
      content: await file.text(),
      isLocal: true
    })));

    uploadedDocuments.push(...loaded);
    clearFilesButton.hidden = false;
    const count = uploadedDocuments.length;
    setFileStatus(`${loaded.length} fichier${loaded.length === 1 ? "" : "s"} ajouté${loaded.length === 1 ? "" : "s"} localement. ${count} fichier${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"} dans cette session ; rien n’est envoyé ni conservé après fermeture.`, "success");
  } catch {
    setFileStatus("La lecture d’un fichier a échoué. Vérifiez le fichier, puis réessayez ; aucun fichier de cette sélection n’a été ajouté.", "error");
  } finally {
    localFilesInput.value = "";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search(input.value);
});

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.question;
    search(input.value);
    input.focus();
  });
});

localFilesInput.addEventListener("change", () => {
  loadLocalFiles(localFilesInput.files);
});

clearFilesButton.addEventListener("click", () => {
  uploadedDocuments.length = 0;
  clearFilesButton.hidden = true;
  documentList.replaceChildren();
  results.hidden = true;
  noResults.hidden = true;
  setFileStatus("Fichiers locaux retirés de cette page.", "success");
});

document.querySelector("#close-dialog").addEventListener("click", () => sourceDialog.close());
sourceDialog.addEventListener("click", (event) => {
  if (event.target === sourceDialog) sourceDialog.close();
});

const views = [...document.querySelectorAll("[data-view]")];
const navigationButtons = [...document.querySelectorAll("[data-nav]")];
const pageTitles = {
  accueil: "Accueil",
  recherche: "Recherche",
  maison: "Maison",
  famille: "Famille",
  alertes: "Alertes"
};
const toast = document.querySelector("#toast-message");
let toastTimeout;

function showView(name) {
  if (!Object.hasOwn(pageTitles, name)) return;

  views.forEach((view) => {
    view.hidden = view.dataset.view !== name;
  });
  navigationButtons.forEach((button) => {
    const isActive = button.dataset.nav === name;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.title = `${pageTitles[name]} | Famili-IA`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDemoNotice(message = "Cette fonction est illustrée par des données fictives ; aucun compte réel n’est connecté.") {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

navigationButtons.forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.nav));
});

document.querySelectorAll("[data-open-view]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.openView));
});

document.querySelectorAll("[data-demo-action]").forEach((button) => {
  button.addEventListener("click", () => showDemoNotice());
});

document.querySelector("#quick-search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const question = document.querySelector("#quick-question").value.trim();
  showView("recherche");
  input.value = question;
  input.focus();
  if (question) search(question);
});

document.querySelectorAll("[data-house-category]").forEach((button) => {
  button.addEventListener("click", () => {
    const category = button.dataset.houseCategory;
    document.querySelectorAll("[data-house-category]").forEach((tab) => {
      const isSelected = tab === button;
      tab.classList.toggle("is-selected", isSelected);
      tab.setAttribute("aria-pressed", String(isSelected));
    });

    let visibleCount = 0;
    document.querySelectorAll("[data-equipment]").forEach((row) => {
      const isVisible = category === "tout" || row.dataset.equipment === category;
      row.hidden = !isVisible;
      if (isVisible) visibleCount += 1;
    });
    document.querySelector("#equipment-empty").hidden = visibleCount !== 0;
    document.querySelector(".pool-illustration").hidden = category !== "tout" && category !== "piscine";
  });
  button.setAttribute("aria-pressed", String(button.classList.contains("is-selected")));
});

document.querySelectorAll("[data-alert-card]").forEach((card) => {
  card.addEventListener("click", () => {
    card.classList.toggle("is-read");
  });
});

document.querySelector("#mark-alerts-read").addEventListener("click", (event) => {
  document.querySelectorAll("[data-alert-card]").forEach((card) => card.classList.add("is-read"));
  event.currentTarget.textContent = "Toutes les alertes sont lues";
  event.currentTarget.disabled = true;
});

showView("accueil");
