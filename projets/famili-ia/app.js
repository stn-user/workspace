import { detectQuestionIntent, extractExactFact, getIntentKeywords, getQuestionTerms, getSearchMatch, normalizeText } from "./search-utils.js";
import { GoogleDriveClient } from "./google-drive.js";
import { Capacitor } from "@capacitor/core";

const googleDriveConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  appId: import.meta.env.VITE_GOOGLE_APP_ID
};
const hasGoogleDriveConfig = Object.values(googleDriveConfig).every((value) => typeof value === "string" && value.trim());
const isNativePlatform = Capacitor.isNativePlatform();

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

const driveDemoDocuments = documents.slice(0, 3);
const uploadedDocuments = [];
const maxFiles = 5;
const maxTextFileSize = 1024 * 1024;
const maxPdfFileSize = 10 * 1024 * 1024;
const maxPdfPages = 20;
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
const dialogEyebrow = document.querySelector("#dialog-eyebrow");
const dialogNoticeText = document.querySelector("#dialog-notice-text");
const localFilesInput = document.querySelector("#local-files-input");
const clearFilesButton = document.querySelector("#clear-files");
const fileStatus = document.querySelector("#file-status");
const drivePickerDialog = document.querySelector("#drive-picker-dialog");
const drivePickerList = document.querySelector("#drive-picker-list");
const drivePickerStatus = document.querySelector("#drive-picker-status");
const confirmDrivePickerButton = document.querySelector("#confirm-drive-picker");
const connectGoogleDriveButton = document.querySelector("#connect-google-drive");
const disconnectGoogleDriveButton = document.querySelector("#disconnect-google-drive");
const driveConnectionStatus = document.querySelector("#drive-connection-status");
const googleDriveClient = hasGoogleDriveConfig && !isNativePlatform ? new GoogleDriveClient(googleDriveConfig) : null;
let googleDriveReady = false;
const demoStatusLabel = document.querySelector("#demo-status-label");
const sidebarModeCopy = document.querySelector("#sidebar-mode-copy");

function updateModeBanner() {
  const hasDriveFiles = uploadedDocuments.some((file) => file.driveSource);
  const hasLocalFiles = uploadedDocuments.some((file) => file.isLocal && !file.driveDemo && !file.driveSource);
  if (hasDriveFiles) {
    demoStatusLabel.textContent = "Drive de test — contenu en mémoire locale";
    sidebarModeCopy.textContent = "Fichiers choisis manuellement ; aucune IA ni serveur Famili-IA.";
  } else if (hasLocalFiles) {
    demoStatusLabel.textContent = "Prototype — fichiers locaux";
    sidebarModeCopy.textContent = "Fichiers choisis depuis cet appareil et traités localement.";
  } else if (googleDriveReady) {
    demoStatusLabel.textContent = "Prototype — Drive facultatif";
    sidebarModeCopy.textContent = "Aucun fichier Drive n’est lu sans votre sélection explicite.";
  } else {
    demoStatusLabel.textContent = "Prototype — données fictives";
    sidebarModeCopy.textContent = "Exemples inventés, sans connexion à vos services.";
  }
}

function getQueryTerms(question) {
  return getQuestionTerms(question);
}

function findDocuments(question) {
  const terms = getQueryTerms(question);
  if (terms.length === 0) return [];

  const searchableDocuments = uploadedDocuments.length > 0 ? uploadedDocuments : documents;
  return searchableDocuments
    .map((document) => {
      const searchable = normalizeText(`${document.name} ${document.type} ${document.keywords} ${document.content}`);
      const lines = document.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const exactFact = document.isLocal ? extractExactFact(question, lines) : null;
      const factKeywords = exactFact ? getIntentKeywords(detectQuestionIntent(question)).join(" ") : "";
      const searchableWithIntent = `${searchable} ${factKeywords}`;
      const match = getSearchMatch(question, searchableWithIntent);
      const excerpt = lines
        .map((line) => ({ line, matches: terms.filter((term) => normalizeText(line).includes(term)).length }))
        .filter((line) => line.matches > 0)
        .sort((a, b) => b.matches - a.matches || a.line.length - b.line.length)
        .slice(0, 3)
        .map(({ line }) => line.length > 280 ? `${line.slice(0, 277)}...` : line)
        .join(" … ");
      return { document, score: match.score, matchedTerms: match.matchedTerms.length, excerpt, exactFact };
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
    const origin = sourceDocument.driveSource
      ? "Google Drive · copie temporaire locale"
      : sourceDocument.driveDemo
        ? "Sélection Google Drive simulée · fichier fictif"
        : sourceDocument.isLocal ? "Fichier local · non transmis" : "Exemple fictif";
    addTextElement(info, "p", "document-meta", `${sourceDocument.type} · ${sourceDocument.date} · ${origin}`);
    card.append(info);

    const button = addTextElement(card, "button", "source-button", "Voir l’extrait");
    button.type = "button";
    button.addEventListener("click", () => openSource(sourceDocument));
    documentList.append(card);
  });
}

function openSource(document) {
  dialogEyebrow.textContent = document.driveSource
    ? "FICHIER CHOISI DANS GOOGLE DRIVE"
    : document.isLocal ? "FICHIER DE CETTE SESSION" : "DOCUMENT DE DÉMONSTRATION";
  dialogTitle.textContent = document.name;
  dialogMeta.textContent = document.isLocal
    ? document.driveSource
      ? `${document.type} · téléchargé directement depuis Google et conservé en mémoire locale${document.date ? ` · modifié le ${document.date}` : ""}`
      : document.driveDemo
        ? `${document.type} · exemple fictif copié dans cette session`
        : `${document.type} · chargé localement pour cette session`
    : `${document.type} · ${document.date} · Source de démonstration`;
  dialogNoticeText.textContent = document.driveSource
    ? "Fichier explicitement choisi dans Google Picker. Le contenu est conservé en mémoire dans ce navigateur et n’est envoyé ni à un serveur Famili-IA ni à une IA."
    : document.driveDemo
      ? "Ceci est un contenu fictif. Aucun compte Google n’est connecté et aucun fichier Drive réel n’a été consulté."
      : document.isLocal
        ? "Fichier choisi depuis cet appareil. Le contenu est traité localement et n’est pas transmis."
        : "Ceci est un contenu d’exemple inventé pour le prototype.";
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
    ? bestMatch.exactFact
      ? "INFORMATION EXTRAITE DU FICHIER — SANS IA"
      : "EXTRAIT CORRESPONDANT AU MOT-CLÉ — SANS IA"
    : "RÉPONSE SIMULÉE À PARTIR DES DOCUMENTS FICTIFS";
  answerText.textContent = bestMatch.document.isLocal
    ? bestMatch.exactFact
      ? `Dans « ${bestMatch.document.name} », ${bestMatch.exactFact}`
      : `Extrait du fichier « ${bestMatch.document.name} » : « ${bestMatch.excerpt} »`
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

function setDriveConnectionStatus(message, state) {
  driveConnectionStatus.textContent = message;
  if (state) driveConnectionStatus.dataset.state = state;
  else delete driveConnectionStatus.dataset.state;
}

function updateDriveConnectionActions() {
  disconnectGoogleDriveButton.hidden = !googleDriveClient?.hasAccessToken;
}

function updateGoogleDriveButton() {
  connectGoogleDriveButton.disabled = !googleDriveReady || uploadedDocuments.length >= maxFiles;
}

async function loadLocalFiles(files) {
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) return;

  const invalidFile = selectedFiles.find((file) => !/\.(txt|md|pdf)$/i.test(file.name));
  if (invalidFile) {
    setFileStatus(`« ${invalidFile.name} » n’est pas un fichier TXT, MD ou PDF. Aucun fichier de cette sélection n’a été ajouté.`, "error");
    localFilesInput.value = "";
    return;
  }

  const oversizedFile = selectedFiles.find((file) => {
    const maxFileSize = file.name.toLocaleLowerCase("fr").endsWith(".pdf") ? maxPdfFileSize : maxTextFileSize;
    return file.size > maxFileSize;
  });
  if (oversizedFile) {
    const isPdf = oversizedFile.name.toLocaleLowerCase("fr").endsWith(".pdf");
    const limit = isPdf ? "10 Mo" : "1 Mo";
    setFileStatus(`« ${oversizedFile.name} » dépasse la limite de ${limit}. Aucun fichier de cette sélection n’a été ajouté.`, "error");
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
      type: file.name.toLocaleLowerCase("fr").endsWith(".pdf")
        ? "PDF"
        : file.name.toLocaleLowerCase("fr").endsWith(".md") ? "Markdown" : "Texte",
      date: "Session locale",
      keywords: "",
      summary: "",
      content: file.name.toLocaleLowerCase("fr").endsWith(".pdf")
        ? await (await import("./document-reader.js")).readPdfFile(file)
        : await file.text(),
      isLocal: true
    })));

    uploadedDocuments.push(...loaded);
    clearFilesButton.hidden = false;
    updateGoogleDriveButton();
    updateModeBanner();
    const count = uploadedDocuments.length;
    setFileStatus(`${loaded.length} fichier${loaded.length === 1 ? "" : "s"} ajouté${loaded.length === 1 ? "" : "s"} localement. ${count} fichier${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"} dans cette session ; rien n’est envoyé ni conservé après fermeture.`, "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erreur de lecture non détaillée.";
    setFileStatus(`La sélection n’a pas pu être lue : ${reason} Aucun fichier de cette sélection n’a été ajouté.`, "error");
  } finally {
    localFilesInput.value = "";
  }
}

function renderDrivePickerOptions() {
  drivePickerList.replaceChildren();
  drivePickerStatus.textContent = "";
  const selectedDemoIds = new Set(uploadedDocuments.filter((document) => document.driveDemo).map((document) => document.driveDemoId));

  driveDemoDocuments.forEach((sampleDocument) => {
    const label = document.createElement("label");
    label.className = "drive-picker-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "drive-demo-file";
    checkbox.value = sampleDocument.id;
    checkbox.disabled = selectedDemoIds.has(sampleDocument.id);
    checkbox.checked = checkbox.disabled;

    const copy = document.createElement("span");
    copy.className = "drive-picker-copy";
    addTextElement(copy, "strong", "", sampleDocument.name);
    addTextElement(copy, "small", "", `${sampleDocument.type} · ${sampleDocument.date}${checkbox.disabled ? " · déjà ajouté" : ""}`);
    label.append(checkbox, copy);
    drivePickerList.append(label);
  });

  updateDrivePickerCount();
}

function updateDrivePickerCount() {
  const selectedCount = drivePickerList.querySelectorAll('input[name="drive-demo-file"]:checked:not(:disabled)').length;
  const remainingCount = maxFiles - uploadedDocuments.length;
  drivePickerStatus.textContent = `${selectedCount} sélectionné${selectedCount === 1 ? "" : "s"} · ${remainingCount} emplacement${remainingCount === 1 ? "" : "s"} disponible${remainingCount === 1 ? "" : "s"} dans cette session.`;
  confirmDrivePickerButton.disabled = remainingCount === 0 || selectedCount === 0;
}

if (googleDriveClient) {
  setDriveConnectionStatus("Chargement des bibliothèques Google. Aucun accès aux fichiers n’est demandé avant votre action.", "success");
  googleDriveClient.initialize().then(() => {
    googleDriveReady = true;
    updateGoogleDriveButton();
    updateModeBanner();
    setDriveConnectionStatus("Prêt. « Connecter Google Drive » demandera uniquement l’accès drive.file et ouvrira le sélecteur officiel.", "success");
  }).catch((error) => {
    setDriveConnectionStatus(`Connexion Google indisponible : ${error.message}`, "error");
  });
} else {
  connectGoogleDriveButton.disabled = true;
  if (isNativePlatform) {
    setDriveConnectionStatus("Le flux OAuth/Picker configuré ici est réservé au navigateur web ; il ne doit pas être lancé dans la WebView mobile.", "error");
  }
}

connectGoogleDriveButton.addEventListener("click", async () => {
  const remainingCount = maxFiles - uploadedDocuments.length;
  if (!googleDriveClient || remainingCount < 1) {
    setDriveConnectionStatus("La limite de cinq fichiers par session est atteinte. Retirez des fichiers avant d’en choisir d’autres.", "error");
    return;
  }

  connectGoogleDriveButton.disabled = true;
  setDriveConnectionStatus("Ouverture de l’autorisation Google. Vous pouvez annuler avant de choisir des fichiers.", "success");
  try {
    const loadedFiles = await googleDriveClient.pickFiles(remainingCount);
    if (loadedFiles.length === 0) {
      setDriveConnectionStatus("Sélection annulée. Aucun fichier n’a été lu.", "success");
      return;
    }

    const existingDriveIds = new Set(uploadedDocuments.filter((document) => document.driveSource).map((document) => document.id));
    const newFiles = loadedFiles.filter((file) => !existingDriveIds.has(file.id));
    if (newFiles.length === 0) {
      setDriveConnectionStatus("Ces fichiers Drive sont déjà présents dans cette session.", "success");
      return;
    }

    uploadedDocuments.push(...newFiles);
    clearFilesButton.hidden = false;
    updateGoogleDriveButton();
    updateModeBanner();
    setFileStatus(
      `${newFiles.length} fichier${newFiles.length === 1 ? "" : "s"} Drive chargé${newFiles.length === 1 ? "" : "s"} en mémoire locale. Aucun serveur Famili-IA ni IA n’a reçu leur contenu.`,
      "success"
    );
    setDriveConnectionStatus("Fichiers choisis et chargés en mémoire pour cette session. « Retirer mes fichiers » effacera le contenu et révoquera l’autorisation.", "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erreur Google non détaillée.";
    setDriveConnectionStatus(`La sélection Drive a échoué : ${reason}`, "error");
  } finally {
    updateGoogleDriveButton();
    updateDriveConnectionActions();
  }
});

document.querySelector("#open-drive-picker").addEventListener("click", () => {
  renderDrivePickerOptions();
  drivePickerDialog.showModal();
});

drivePickerList.addEventListener("change", updateDrivePickerCount);
document.querySelector("#close-drive-picker").addEventListener("click", () => drivePickerDialog.close());
document.querySelector("#cancel-drive-picker").addEventListener("click", () => drivePickerDialog.close());
drivePickerDialog.addEventListener("click", (event) => {
  if (event.target === drivePickerDialog) drivePickerDialog.close();
});
confirmDrivePickerButton.addEventListener("click", () => {
  const selectedIds = new Set(
    [...drivePickerList.querySelectorAll('input[name="drive-demo-file"]:checked:not(:disabled)')].map((checkbox) => checkbox.value)
  );
  if (selectedIds.size === 0) {
    drivePickerStatus.textContent = "Sélectionnez au moins un fichier fictif.";
    return;
  }

  if (uploadedDocuments.length + selectedIds.size > maxFiles) {
    drivePickerStatus.textContent = `La limite de ${maxFiles} fichiers par session serait dépassée.`;
    return;
  }

  const selectedDocuments = driveDemoDocuments
    .filter((document) => selectedIds.has(document.id))
    .map((document) => ({
      ...document,
      id: `drive-demo-${document.id}`,
      driveDemo: true,
      driveDemoId: document.id,
      isLocal: true
    }));
  uploadedDocuments.push(...selectedDocuments);
  clearFilesButton.hidden = false;
  updateGoogleDriveButton();
  updateModeBanner();
  setFileStatus(
    `${selectedDocuments.length} fichier${selectedDocuments.length === 1 ? "" : "s"} fictif${selectedDocuments.length === 1 ? "" : "s"} ajouté${selectedDocuments.length === 1 ? "" : "s"} à la session. Aucun compte Google n’est connecté et aucun fichier Drive n’a été consulté.`,
    "success"
  );
  drivePickerDialog.close();
});

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

async function clearSessionFiles() {
  const shouldRevokeGoogleAccess = Boolean(googleDriveClient?.hasAccessToken);
  uploadedDocuments.length = 0;
  if (sourceDialog.open) sourceDialog.close();
  dialogTitle.textContent = "";
  dialogMeta.textContent = "";
  dialogContent.textContent = "";
  clearFilesButton.hidden = true;
  documentList.replaceChildren();
  answerText.textContent = "";
  resultCount.textContent = "";
  results.hidden = true;
  noResults.hidden = true;
  setFileStatus("Fichiers locaux retirés de cette page.", "success");
  if (localFilesInput) localFilesInput.value = "";
  updateGoogleDriveButton();
  updateModeBanner();
  if (shouldRevokeGoogleAccess) {
    try {
      await googleDriveClient.revoke();
      setDriveConnectionStatus("Fichiers retirés de la mémoire locale et autorisation Google révoquée.", "success");
    } catch (error) {
      setDriveConnectionStatus(`Fichiers retirés localement, mais révocation Google non confirmée : ${error.message}`, "error");
    }
  } else {
    setDriveConnectionStatus("Fichiers retirés de la mémoire locale. Aucun jeton Google n’était actif.", "success");
  }
  updateDriveConnectionActions();
}

clearFilesButton.addEventListener("click", clearSessionFiles);
disconnectGoogleDriveButton.addEventListener("click", clearSessionFiles);

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
let activeView = "accueil";

function showView(name, { addHistory = true } = {}) {
  if (!Object.hasOwn(pageTitles, name)) return;
  if (addHistory && activeView !== name) {
    window.history.pushState({ view: name }, "", `#${name}`);
  }
  activeView = name;

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

window.addEventListener("popstate", (event) => {
  const view = event.state?.view ?? window.location.hash.slice(1);
  showView(Object.hasOwn(pageTitles, view) ? view : "accueil", { addHistory: false });
});

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
  button.addEventListener("click", (event) => {
    if (button instanceof HTMLAnchorElement) event.preventDefault();
    showView(button.dataset.openView);
  });
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

const initialView = window.location.hash.slice(1);
showView(Object.hasOwn(pageTitles, initialView) ? initialView : "accueil", { addHistory: false });
window.history.replaceState({ view: activeView }, "", `#${activeView}`);
