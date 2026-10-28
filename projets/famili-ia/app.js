import { detectQuestionIntent, extractExactFact, getIntentKeywords, getQuestionTerms, getSearchMatch, normalizeText } from "./search-utils.js";
import { GoogleDriveClient } from "./google-drive.js";
// Mock Capacitor pour le navigateur web (non disponible en local sans build)
const Capacitor = { isNativePlatform: () => false };
const Filesystem = null;
import { listLocalFiles, readFileContent, requestPermissions } from "./local-files.js";
import { loadFamilyState } from "./family-storage.js";
import { initState, getCurrentUser, getFamilyMembers, getEquipmentByCategory, getEquipmentDetail, getAlerts, getDocuments, addDocument, deleteDocument, calculateAlertType, getFullState, addFamilyMember, addEquipment, updateEquipment, deleteEquipment, deleteFamilyMember, updateFamilyMember } from "./state.js";

// Initialisation asynchrone de l'application
(async () => {
  await initState();
  uploadedDocuments.push(...getDocuments());
  initEquipmentDialog();
  initAddMemberDialog();
  // Reste de l'initialisation...
})();

/**
 * Met à jour la visibilité des boutons de gestion de fichiers en fonction de la vue actuelle et de la présence de fichiers.
 */
function updateClearFilesButtonsVisibility() {
  const hasFiles = uploadedDocuments.length > 0;
  const isDataView = activeView === 'vos-donnees';

  if (clearFilesButton) clearFilesButton.hidden = !(hasFiles && isDataView);
  if (disconnectGoogleDriveButton) disconnectGoogleDriveButton.hidden = !(hasFiles && isDataView && googleDriveClient?.hasAccessToken);
}


/**
 * Initialise la modale d'ajout/modification d'équipement
 */
function initEquipmentDialog() {
  const dialog = document.querySelector('#equipment-dialog');
  const form = document.querySelector('#equipment-form');
  const cancelBtn = document.querySelector('#cancel-equipment-dialog');
  const closeBtn = document.querySelector('#close-equipment-dialog');

  if (!dialog || !form) return;

  if (cancelBtn) cancelBtn.addEventListener('click', () => dialog.close());
  if (closeBtn) closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.querySelector('#eq-id-input').value;
    const name = document.querySelector('#eq-name-input').value;
    const category = document.querySelector('#eq-category-input').value;
    const status = document.querySelector('#eq-status-input').value;

    const equipment = {
      id: id || `eq-${Date.now()}`,
      name,
      category,
      status,
      docs: []
    };

    if (id) {
      await updateEquipment(equipment);
      showDemoNotice(`Équipement mis à jour : ${name}`);
    } else {
      await addEquipment(equipment);
      showDemoNotice(`Équipement ajouté : ${name}`);
    }

    dialog.close();
    renderEquipmentList(); // Refresh list
    if (activeView === 'detail') initEquipmentDetailView(equipment.id);
  });
}

function openEquipmentForm(equipment = null) {
  const dialog = document.querySelector('#equipment-dialog');
  const form = document.querySelector('#equipment-form');
  document.querySelector('#eq-id-input').value = equipment ? equipment.id : '';
  document.querySelector('#eq-name-input').value = equipment ? equipment.name : '';
  document.querySelector('#eq-category-input').value = equipment ? equipment.category : 'pompe';
  document.querySelector('#eq-status-input').value = equipment ? equipment.status : '';
  dialog.showModal();
}

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
    summary: "La facture d'installation de la piscine indique un montant total de 8 900 â‚¬ TTC, réglé le 4 mars 2023.",
    content: "AQUA JARDIN — FACTURE NÂ° AJ-2023-0318\nDate : 4 mars 2023\nObjet : Installation d'une piscine familiale\nMontant total : 8 900 â‚¬ TTC\nStatut : Réglée\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "piscine-garantie",
    name: "Garantie - Pompe piscine.pdf",
    type: "Garantie",
    date: "12 avril 2023",
    keywords: "garantie pompe piscine duree échéance fin expire expiration hayward modèle 2022",
    summary: "La garantie de la pompe Hayward Modèle 2022 est valable jusqu'au 4 mai 2028.",
    content: "CERTIFICAT DE GARANTIE — ÉQUIPEMENT PISCINE\nÉquipement : Pompe Hayward Modèle 2022\nDate de début : 4 mai 2023\nDurée : 5 ans\nFin de garantie : 4 mai 2028\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "bambu-facture",
    name: "Facture - Imprimante Bambu Lab A1.pdf",
    type: "Facture",
    date: "10 février 2025",
    keywords: "bambu lab a1 imprimante facture numéro référence achat prix coût montant",
    summary: "La facture de la Bambu Lab A1 porte le numéro BL-2025-10482. Le montant indiqué est de 449 â‚¬ TTC.",
    content: "BAMBU STORE — FACTURE NÂ° BL-2025-10482\nDate : 10 février 2025\nArticle : Imprimante Bambu Lab A1\nMontant : 449 â‚¬ TTC\nStatut : Réglée\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "habitation-contrat",
    name: "Contrat - Assurance habitation.pdf",
    type: "Contrat",
    date: "1 janvier 2025",
    keywords: "contrat assurance habitation échéance termine fin renouvellement date",
    summary: "Le contrat d'assurance habitation arrive à échéance le 31 décembre 2025. La reconduction est prévue à cette date, sauf résiliation.",
    content: "ASSURANCE DEMO — CONTRAT HABITATION NÂ° HAB-2025-7204\nDate d'effet : 1er janvier 2025\nÉchéance annuelle : 31 décembre 2025\nReconduction : tacite, sauf résiliation\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "maison-notice",
    name: "Notice - Filtre de piscine.pdf",
    type: "Notice",
    date: "7 mars 2023",
    keywords: "notice filtre piscine entretien nettoyage cartouche",
    summary: "La notice recommande de rincer la cartouche du filtre toutes les deux semaines en période d'utilisation.",
    content: "NOTICE D'ENTRETIEN — FILTRE DE PISCINE\nFréquence de rinçage recommandée : toutes les deux semaines en période d'utilisation.\nRemplacement de la cartouche : selon l'usure et au minimum une fois par saison.\n\nExemple fictif créé pour le prototype Famili-IA."
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
const sourceChoiceDialog = document.querySelector("#source-choice-dialog");
const googleDriveChoiceDescription = document.querySelector("#google-drive-choice-description");
const onboardingCompleteKey = "famili-ia-source-choice-complete";
let googleDriveReady = false;
const demoStatusLabel = document.querySelector("#demo-status-label");
const sidebarModeCopy = document.querySelector("#sidebar-mode-copy");

function updateModeBanner() {
  const hasDriveFiles = uploadedDocuments.some((file) => file.driveSource);
  const hasLocalFiles = uploadedDocuments.some((file) => file.isLocal && !file.driveDemo && !file.driveSource);
  if (demoStatusLabel && sidebarModeCopy) {
    if (hasDriveFiles) {
      demoStatusLabel.textContent = "Drive de test — contenu en mémoire locale";
      sidebarModeCopy.textContent = "Fichiers choisis manuellement ; aucune IA ni serveur Famili-IA.";
    } else if (hasLocalFiles) {
      demoStatusLabel.textContent = "Prototype — fichiers locaux";
      sidebarModeCopy.textContent = "Fichiers choisis depuis cet appareil et traités localement.";
    } else if (googleDriveReady) {
      demoStatusLabel.textContent = "Prototype — Drive facultatif";
      sidebarModeCopy.textContent = "Aucun fichier Drive n'est lu sans votre sélection explicite.";
    } else {
      demoStatusLabel.textContent = "Prototype — données fictives";
      sidebarModeCopy.textContent = "Exemples inventés, sans connexion à vos services.";
    }
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
      const content = document.content || "";
      const searchable = normalizeText(`${document.name} ${document.type} ${document.keywords} ${content}`);
      const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

    const iconSpan = document.createElement("span");
    iconSpan.className = "icon icon-bg-blue icon-circle";
    iconSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
    iconSpan.setAttribute("aria-hidden", "true");
    card.append(iconSpan);

    const info = document.createElement("div");
    info.className = "document-info";
    addTextElement(info, "p", "document-name", sourceDocument.name);
    const origin = sourceDocument.driveSource
      ? "Google Drive · copie temporaire locale"
      : sourceDocument.driveDemo
        ? "Sélection Google Drive simulée · fichier fictif"
        : sourceDocument.isLocal
          ? sourceDocument.sourceDir && Capacitor.isNativePlatform()
            ? "Stockage local · non transmis"
            : "Fichier local · non transmis"
          : "Exemple fictif";
    addTextElement(info, "p", "document-meta", `${sourceDocument.type} · ${sourceDocument.date} · ${origin}`);
    card.append(info);

    const button = addTextElement(card, "button", "source-button", "Voir l'extrait");
    button.type = "button";
    button.addEventListener("click", () => openSource(sourceDocument));
    documentList.append(card);
  });
}

function openSource(document) {
  dialogEyebrow.textContent = document.driveSource
    ? "FICHIER CHOISI DANS GOOGLE DRIVE"
    : document.isLocal
      ? document.sourceDir && Capacitor.isNativePlatform()
        ? "FICHIER STOCKAGE LOCAL"
        : "FICHIER DE CETTE SESSION"
      : "DOCUMENT DE DÉMONSTRATION";
  dialogTitle.textContent = document.name;
  dialogMeta.textContent = document.isLocal
    ? document.driveSource
      ? `${document.type} · téléchargé directement depuis Google et conservé en mémoire locale${document.date ? ` · modifié le ${document.date}` : ""}`
      : document.driveDemo
        ? `${document.type} · exemple fictif copié dans cette session`
        : document.sourceDir && Capacitor.isNativePlatform()
          ? `${document.type} · ${document.sourceDir} · chargé depuis le stockage local natif`
          : `${document.type} · chargé localement pour cette session`
    : `${document.type} · ${document.date} · Source de démonstration`;
  if (dialogNoticeText) {
    dialogNoticeText.textContent = document.driveSource
      ? "Fichier explicitement choisi dans Google Picker. Le contenu est conservé en mémoire dans ce navigateur et n'est envoyé ni à un serveur Famili-IA ni à une IA."
      : document.driveDemo
        ? "Ceci est un contenu fictif. Aucun compte Google n'est connecté et aucun fichier Drive réel n'a été consulté."
        : document.isLocal
          ? document.sourceDir && Capacitor.isNativePlatform()
            ? "Fichier scanné depuis votre stockage local (Documents/Téléchargements). Le contenu est traité en mémoire et n'est pas transmis à un serveur."
            : "Fichier choisi depuis cet appareil. Le contenu est traité localement et n'est pas transmis."
          : "Ceci est un contenu d'exemple inventé pour le prototype.";
  }
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

  // Apply filters if any
  const filteredMatches = applyFilters(matches);

  results.hidden = filteredMatches.length === 0;
  noResults.hidden = filteredMatches.length !== 0;
  if (filteredMatches.length === 0) return;

  const bestMatch = filteredMatches[0];
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
  resultCount.textContent = `${filteredMatches.length} ${filteredMatches.length === 1 ? "document trouvé" : "documents trouvés"}`;
  renderDocuments(filteredMatches);
  results.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Applique les filtres sélectionnés par l'utilisateur
 * @param {Array} matches - Résultats de recherche bruts
 * @returns {Array} Résultats filtrés
 */
// Filtres de configuration - centralisation des règles de filtrage
const documentTypeFilters = {
  Facture: doc => doc.type === 'Facture',
  Garantie: doc => doc.type === 'Garantie',
  Contrat: doc => doc.type === 'Contrat',
  Notice: doc => doc.type === 'Notice',
  PDF: doc => doc.type === 'PDF',
  Texte: doc => doc.type === 'Texte' || doc.type === 'Markdown',
  Markdown: doc => doc.type === 'Markdown'
};

const sourceFilters = {
  local: doc => doc.isLocal && !doc.driveSource && !doc.driveDemo,
  drive: doc => doc.driveSource,
  demo: doc => doc.driveDemo || !doc.isLocal
};

function applyFilters(matches) {
  // Read active filter chips instead of select values
  const typeChip = document.querySelector('#filter-type-group .chip.is-selected');
  const sourceChip = document.querySelector('#filter-source-group .chip.is-selected');

  const typeFilter = typeChip?.dataset.filterType || '';
  const sourceFilter = sourceChip?.dataset.filterSource || '';

  // Si aucun filtre actif, retourner les résultats tels quels
  if (!typeFilter && !sourceFilter) {
    return matches;
  }

  return matches.filter(result => {
    const doc = result.document;

    // Filtre par type de document - lookup dans l'objet de configuration
    if (typeFilter && !(typeFilter in documentTypeFilters)) return false;
    if (typeFilter && !documentTypeFilters[typeFilter](doc)) return false;

    // Filtre par source - lookup dans l'objet de configuration
    if (sourceFilter && !(sourceFilter in sourceFilters)) return false;
    if (sourceFilter && !sourceFilters[sourceFilter](doc)) return false;

    return true;
  });
}

// Gestion des filtres par chips (implémentation actuelle)
// Les listeners directs sur #filter-type/#filter-source sont redondants
// car les filtres sont des .chip dans des groupes .chip-group.
// Voir applyFilters() qui lit .chip.is-selected dans les groupes dédiés.

// Gestion du bouton "Effacer les filtres" (Obsolète)
const clearFiltersBtn = document.querySelector('#clear-filters');
if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    document.querySelector('#filter-type').value = '';
    document.querySelector('#filter-source').value = '';
    clearFiltersBtn.hidden = true;

    // Réexécuter la recherche sans filtres
    if (input.value.trim()) {
      search(input.value);
    }
  });
}

function setFileStatus(message, state) {
  if (fileStatus) {
    fileStatus.textContent = message;
    if (state) fileStatus.dataset.state = state;
    else delete fileStatus.dataset.state;
  }
  // Afficher également un toast pour une meilleure visibilité utilisateur
  if (typeof showDemoNotice === "function") {
    showDemoNotice(message);
  }
}

function setDriveConnectionStatus(message, state) {
  if (!driveConnectionStatus) return;
  driveConnectionStatus.textContent = message;
  if (state) driveConnectionStatus.dataset.state = state;
  else delete driveConnectionStatus.dataset.state;
}

function updateDriveConnectionActions() {
  updateClearFilesButtonsVisibility();
}

function updateGoogleDriveButton() {
  if (connectGoogleDriveButton) {
    connectGoogleDriveButton.disabled = !googleDriveReady || uploadedDocuments.length >= maxFiles;
  }
  if (googleDriveChoiceDescription) {
    if (isNativePlatform) {
      googleDriveChoiceDescription.textContent = "La connexion Google native n'est pas encore disponible dans l'application mobile.";
    } else if (!hasGoogleDriveConfig) {
      googleDriveChoiceDescription.textContent = "La connexion n'est pas configurée dans cette version web.";
    } else if (!googleDriveReady) {
      googleDriveChoiceDescription.textContent = "Connexion en cours de préparation…";
    } else if (uploadedDocuments.length >= maxFiles) {
      googleDriveChoiceDescription.textContent = "Limite de fichiers atteinte. Retirez-en pour en ajouter d'autres.";
    } else {
      googleDriveChoiceDescription.textContent = "Connecter votre compte puis choisir les fichiers à consulter.";
    }
  }
}

function completeOnboarding() {
  localStorage.setItem(onboardingCompleteKey, "true");
  document.querySelector("#welcome-panel").hidden = true;
  document.querySelector("#dashboard-content").hidden = false;
  document.querySelector("#view-accueil").setAttribute("aria-labelledby", "dashboard-title");
}

function openSourceChoices() {
  sourceChoiceDialog.showModal();
}

async function loadLocalFiles(files) {
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) return;

  const invalidFile = selectedFiles.find((file) => !/\.(txt|md|pdf|jpg|jpeg|png|docx|doc|xlsx|xls)$/i.test(file.name));
  if (invalidFile) {
    setFileStatus(`« ${invalidFile.name} » n'est pas un fichier TXT, MD, PDF, JPG ou PNG. Aucun fichier de cette sélection n'a été ajouté.`, "error");
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
    setFileStatus(`« ${oversizedFile.name} » dépasse la limite de ${limit}. Aucun fichier de cette sélection n'a été ajouté.`, "error");
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
        : file.name.toLocaleLowerCase("fr").endsWith(".md") ? "Markdown"
        : file.name.toLocaleLowerCase("fr").endsWith(".jpg") || file.name.toLocaleLowerCase("fr").endsWith(".jpeg") || file.name.toLocaleLowerCase("fr").endsWith(".png")
          ? "Image"
          : "Texte",
      date: "Session locale",
      keywords: "",
      summary: "",
      content: file.name.toLocaleLowerCase("fr").endsWith(".pdf")
        ? await (await import("./document-reader.js")).readPdfFile(file)
        : file.name.toLocaleLowerCase("fr").endsWith(".md")
          ? await file.text()
          : file.name.toLocaleLowerCase("fr").endsWith(".jpg") || file.name.toLocaleLowerCase("fr").endsWith(".jpeg") || file.name.toLocaleLowerCase("fr").endsWith(".png")
            ? await (await import("./local-files.js")).readImageFile(file)
            : await file.text(),
      isLocal: true
    })));

    uploadedDocuments.push(...loaded);
    for (const doc of loaded) {
      await addDocument(doc);
    }
    updateClearFilesButtonsVisibility();
    updateGoogleDriveButton();
    updateModeBanner();
    completeOnboarding();
    const count = uploadedDocuments.length;
    setFileStatus(`${loaded.length} fichier${loaded.length === 1 ? "" : "s"} ajouté${loaded.length === 1 ? "" : "s"} localement. ${count} fichier${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"} dans cette session.`, "success");
    sourceChoiceDialog.close();
    showView("recherche", { params: { q: "" } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erreur de lecture non détaillée.";
    setFileStatus(`La sélection n'a pas pu être lue : ${reason} Aucun fichier de cette sélection n'a été ajouté.`, "error");
  } finally {
    localFilesInput.value = "";
  }
}

/**
 * Load local files from native filesystem (Capacitor) - for mobile
 */
async function loadLocalFilesNative() {
  if (!Capacitor.isNativePlatform()) {
    setFileStatus("Cette fonctionnalité n'est disponible que sur l'application mobile native.", "error");
    return;
  }

  try {
    // Request permissions first
    const permResult = await requestPermissions();
    if (!permResult.granted) {
      setFileStatus("Permission refusée pour accéder aux fichiers locaux.", "error");
      return;
    }

    setFileStatus("Recherche des fichiers locaux...", "success");

    // Get accessible directories
    const { getAccessibleDirectories } = await import("./local-files.js");
    const directories = await getAccessibleDirectories();

    if (directories.length === 0) {
      setFileStatus("Aucun dossier accessible trouvé (Documents, Téléchargements).", "error");
      return;
    }

    let allFiles = [];
    for (const dir of directories) {
      try {
        const files = await listLocalFiles(dir);
        allFiles.push(...files.map(f => ({ ...f, sourceDir: dir })));
      } catch (error) {
        console.warn(`Could not read directory ${dir}:`, error);
      }
    }

    if (allFiles.length === 0) {
      setFileStatus("Aucun fichier TXT, MD ou PDF trouvé dans les dossiers accessibles.", "error");
      return;
    }

    // Limit to maxFiles
    if (allFiles.length > maxFiles) {
      allFiles = allFiles.slice(0, maxFiles);
      setFileStatus(`Plus de ${maxFiles} fichiers trouvés. Seuls les ${maxFiles} premiers seront chargés.`, "warning");
    }

    // Process files
    const loaded = await Promise.all(allFiles.map(async (file) => {
      try {
        const content = await readFileContent(file.blob, file.name);
        return {
          id: `local-native-${Date.now()}-${file.name}`,
          name: file.name,
          type: file.extension === "pdf" ? "PDF" : file.extension === "md" ? "Markdown" : "Texte",
          date: "Session locale",
          keywords: "",
          summary: "",
          content,
          isLocal: true,
          sourceDir: file.sourceDir
        };
      } catch (error) {
        console.warn(`Failed to process ${file.name}:`, error);
        return null;
      }
    }));

    const validFiles = loaded.filter(f => f !== null);

    if (validFiles.length === 0) {
      setFileStatus("Aucun fichier n'a pu être lu correctement.", "error");
      return;
    }

    uploadedDocuments.push(...validFiles);
    for (const doc of validFiles) {
      await addDocument(doc);
    }
    updateClearFilesButtonsVisibility();
    updateGoogleDriveButton();
    updateModeBanner();
    completeOnboarding();
    const count = uploadedDocuments.length;
    setFileStatus(`${validFiles.length} fichier${validFiles.length === 1 ? "" : "s"} chargé${validFiles.length === 1 ? "" : "s"} depuis le stockage local. ${count} fichier${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"} dans cette session.`, "success");
    sourceChoiceDialog.close();
    showView("recherche", { params: { q: "" } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erreur de lecture non détaillée.";
    setFileStatus(`Erreur lors du chargement des fichiers locaux : ${reason}`, "error");
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
  setDriveConnectionStatus("Chargement des bibliothèques Google. Aucun accès aux fichiers n'est demandé avant votre action.", "success");
  googleDriveClient.initialize().then(() => {
    googleDriveReady = true;
    updateGoogleDriveButton();
    updateModeBanner();
    setDriveConnectionStatus("Prêt. Choisissez Google Drive pour demander l'accès drive.file et sélectionner vos fichiers dans le sélecteur officiel.", "success");
  }).catch((error) => {
    setDriveConnectionStatus(`Connexion Google indisponible : ${error.message}`, "error");
  });
} else {
  connectGoogleDriveButton.disabled = true;
  if (isNativePlatform) {
    setDriveConnectionStatus("Le flux OAuth/Picker configuré ici est réservé au navigateur web ; il ne doit pas être lancé dans la WebView mobile.", "error");
  }
}
updateGoogleDriveButton();

document.querySelectorAll("[data-open-source-dialog]").forEach((button) => {
  button.addEventListener("click", openSourceChoices);
});
document.querySelector("#close-source-choice").addEventListener("click", () => sourceChoiceDialog.close());
sourceChoiceDialog.addEventListener("click", (event) => {
  if (event.target === sourceChoiceDialog) sourceChoiceDialog.close();
});
document.querySelector("#choose-local-files").addEventListener("click", () => {
  sourceChoiceDialog.close();
  localFilesInput.click();
});

document.querySelector("#choose-local-files-native").addEventListener("click", async () => {
  sourceChoiceDialog.close();
  await loadLocalFilesNative();
});
document.querySelector("#explore-demo").addEventListener("click", () => {
  completeOnboarding();
  showView("recherche");
});

connectGoogleDriveButton.addEventListener("click", async () => {
  sourceChoiceDialog.close();
  const remainingCount = maxFiles - uploadedDocuments.length;
  if (!googleDriveClient || remainingCount < 1) {
    setDriveConnectionStatus("La limite de cinq fichiers par session est atteinte. Retirez des fichiers avant d'en choisir d'autres.", "error");
    return;
  }

  connectGoogleDriveButton.disabled = true;
  setDriveConnectionStatus("Ouverture de l'autorisation Google. Vous pouvez annuler avant de choisir des fichiers.", "success");
  try {
    const loadedFiles = await googleDriveClient.pickFiles(remainingCount);
    if (loadedFiles.length === 0) {
      setDriveConnectionStatus("Sélection annulée. Aucun fichier n'a été lu.", "success");
      return;
    }

    const existingDriveIds = new Set(uploadedDocuments.filter((document) => document.driveSource).map((document) => document.id));
    const newFiles = loadedFiles.filter((file) => !existingDriveIds.has(file.id));
    if (newFiles.length === 0) {
      setDriveConnectionStatus("Ces fichiers Drive sont déjà présents dans cette session.", "success");
      return;
    }

    uploadedDocuments.push(...newFiles);
    for (const doc of newFiles) {
      await addDocument(doc);
    }
    updateClearFilesButtonsVisibility();
    updateGoogleDriveButton();
    updateModeBanner();
    completeOnboarding();
    sourceChoiceDialog.close();
    showView("recherche");
    setFileStatus(
      `${newFiles.length} fichier${newFiles.length === 1 ? "" : "s"} Drive chargé${newFiles.length === 1 ? "" : "s"} en mémoire locale. Aucun serveur Famili-IA ni IA n'a reçu leur contenu.`,
      "success"
    );
    setDriveConnectionStatus("Fichiers choisis et chargés en mémoire pour cette session. « Retirer mes fichiers » effacera le contenu et révoquera l'autorisation.", "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erreur Google non détaillée.";
    setDriveConnectionStatus(`La sélection Drive a échoué : ${reason}`, "error");
  } finally {
    updateGoogleDriveButton();
    updateDriveConnectionActions();
  }
});

const openDrivePickerBtn = document.querySelector("#open-drive-picker");
if (openDrivePickerBtn && drivePickerDialog) {
  openDrivePickerBtn.addEventListener("click", () => {
    sourceChoiceDialog.close();
    renderDrivePickerOptions();
    drivePickerDialog.showModal();
  });
}

if (drivePickerDialog) {
  document.querySelector("#close-drive-picker").addEventListener("click", () => drivePickerDialog.close());
  document.querySelector("#cancel-drive-picker").addEventListener("click", () => drivePickerDialog.close());
  drivePickerDialog.addEventListener("click", (event) => {
    if (event.target === drivePickerDialog) drivePickerDialog.close();
  });
}
if (drivePickerList) {
  drivePickerList.addEventListener("change", updateDrivePickerCount);
}
if (confirmDrivePickerButton && drivePickerList) {
  confirmDrivePickerButton.addEventListener("click", async () => {
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
    for (const doc of selectedDocuments) {
      await addDocument(doc);
    }
    updateClearFilesButtonsVisibility();
    updateGoogleDriveButton();
    updateModeBanner();
    completeOnboarding();
    setFileStatus(
      `${selectedDocuments.length} fichier${selectedDocuments.length === 1 ? "" : "s"} fictif${selectedDocuments.length === 1 ? "" : "s"} ajouté${selectedDocuments.length === 1 ? "" : "s"} à la session. Aucun compte Google n'est connecté et aucun fichier Drive n'a été consulté.`,
      "success"
    );
    drivePickerDialog.close();
    showView("recherche");
  });
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

if (localFilesInput) {
  localFilesInput.addEventListener("change", () => {
    loadLocalFiles(localFilesInput.files);
  });
}

async function clearSessionFiles() {
  const shouldRevokeGoogleAccess = Boolean(googleDriveClient?.hasAccessToken);
  for (const doc of [...uploadedDocuments]) {
    await deleteDocument(doc.id);
  }
  uploadedDocuments.length = 0;
  if (sourceDialog.open) sourceDialog.close();
  dialogTitle.textContent = "";
  dialogMeta.textContent = "";
  dialogContent.textContent = "";
  updateClearFilesButtonsVisibility();
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
    setDriveConnectionStatus("Fichiers retirés de la mémoire locale. Aucun jeton Google n'était actif.", "success");
  }
  updateDriveConnectionActions();
}

if (clearFilesButton) {
  clearFilesButton.addEventListener("click", clearSessionFiles);
}
if (disconnectGoogleDriveButton) {
  disconnectGoogleDriveButton.addEventListener("click", clearSessionFiles);
}

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
  alertes: "Alertes",
  detail: "Détail équipement",
  assistant: "Assistant IA",
  importer: "Importer",
  profil: "Profil",
  "vos-donnees": "Vos données",
  plus: "Plus"
};
let toastTimeout;
let activeView = "accueil";

/**
 * Section de la barre basse (mobile) pour chaque vue.
 * Les sous-vues restent rattachées à leur section d'origine :
 * - detail → maison (le fil d'Ariane ramène vers Maison)
 * - vues secondaires (alertes, famille, assistant, profil, vos-donnees) → plus
 */
const NAV_SECTION_OF = {
  detail: "maison",
  famille: "plus",
  alertes: "plus",
  assistant: "plus",
  profil: "plus",
  "vos-donnees": "plus"
};

/**
 * Parses the URL hash into a view and parameters.
 * Supports formats:
 *   #/view
 *   #/view?param=value&param2=value2
 *   #view (legacy format for backward compatibility)
 * @returns {{view: string, params: Object}} An object with the view name and parameters
 */
function parseHash() {
  const hash = window.location.hash.substring(1); // Remove leading '#'
  if (!hash) return { view: 'accueil', params: {} };

  // Handle legacy format without slash (e.g., #accueil)
  if (!hash.includes('/') && !hash.includes('?')) {
    return { view: hash, params: {} };
  }

  let [path, queryString] = hash.split('?');
  // Ensure path starts with a slash for consistency
  if (!path.startsWith('/')) path = '/' + path;
  const view = path.substring(1).split('/')[0]; // Get first segment as view

  const params = {};
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }
  return { view, params };
}

/**
 * Initializes a view based on the provided parameters.
 * This is called after the view is displayed.
 * @param {string} viewName - The name of the view being shown
 * @param {Object} params - The parameters parsed from the URL
 */
function initializeViewWithParams(viewName, params) {
  // Gestion globale de l'ouverture d'un document via son ID (ex: ?docId=piscine-facture)
  if (params && params.docId) {
    const docId = params.docId;
    const doc = [...documents, ...uploadedDocuments].find(d => d.id === docId);
    if (doc) {
      // Petit délai pour laisser la vue s'afficher proprement avant d'ouvrir la modale
      setTimeout(() => openSource(doc), 150);
    }
  }

  switch (viewName) {
    case 'detail':
      const eqId = params.id;
      if (eqId) {
        initEquipmentDetailView(eqId);
      }
      break;

    case 'recherche':
      // Initialize search view with query from params
      const searchQuery = params.q;
      if (searchQuery !== undefined) {
        const searchInput = document.querySelector("#question");
        if (searchInput) {
          searchInput.value = searchQuery;
          // Trigger search if there's a query
          if (searchQuery.trim()) {
            search(searchQuery);
          }
        }
      }
      break;

    case 'famille':
      initFamilyView();
      break;

    case 'alertes':
      initAlertsView();
      // Apply filter from URL params if present
      const hashFilter = params?.filter;
      if (hashFilter) {
        const matchingTab = document.querySelector(`.alert-filter-tab[data-filter="${hashFilter}"]`);
        if (matchingTab) {
          const tabs = document.querySelectorAll('.alert-filter-tab');
          tabs.forEach(t => t.classList.remove('is-selected'));
          matchingTab.classList.add('is-selected');
          renderAlerts(hashFilter);
        }
      }
      break;

    case 'maison':
      initHouseView();
      // Apply filter from URL params if present
      const categoryFilter = params?.filter;
      if (categoryFilter) {
        const matchingTab = document.querySelector(`[data-house-category="${categoryFilter}"]`);
        if (matchingTab) {
          const tabs = document.querySelectorAll('[data-house-category]');
          tabs.forEach(t => {
            t.classList.toggle('is-selected', t === matchingTab);
            t.setAttribute('aria-pressed', String(t === matchingTab));
          });
          renderEquipmentList(categoryFilter);
          // Update pool illustration visibility
          const poolIllustration = document.querySelector('.pool-illustration');
          if (poolIllustration) {
            poolIllustration.hidden = categoryFilter !== 'tout' && categoryFilter !== 'piscine';
          }
        }
      }
      break;

    case 'accueil':
      renderAccueilDashboard();
      break;

    case 'vos-donnees':
      initDataView();
      break;

    case 'plus':
      renderPlusBadges();
      break;

    default:
      break;
  }
}

/**
 * Met à jour les badges de compteur de la vue « Plus » :
 * alertes à traiter/anticiper, membres de la famille, documents indexés.
 */
function renderPlusBadges() {
  const counts = {
    alertes: getAlerts()
      .map(a => ({ ...a, type: calculateAlertType(a.dueDate, a.type) }))
      .filter(a => a.type === 'red' || a.type === 'amber').length,
    famille: getFamilyMembers().length,
    documents: getDocuments().length
  };
  document.querySelectorAll('[data-count-el]').forEach(badge => {
    const count = counts[badge.dataset.countEl] || 0;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? '99+' : String(count);
    } else {
      badge.hidden = true;
    }
  });
}

function showView(name, { addHistory = true, params = {} } = {}) {
  console.log("showView called for:", name);
  if (!Object.hasOwn(pageTitles, name)) return;

  // Gestion spéciale : Si un document est demandé, l'ouvrir dans le sourceDialog
  if (params.docId) {
    const document = [...documents, ...uploadedDocuments].find(d => d.id === params.docId);
    if (document) {
      // Construire un événement ou appeler la logique d'ouverture directement
      // On ouvre le dialog source avec ce document
      openSource(document);
      // Si on voulait aussi naviguer vers la vue recherche, on pourrait le faire ici
      // mais pour l'instant on se concentre sur l'ouverture du document
      return; // Arrêter le chargement normal de la vue
    }
  }

  // Cacher le welcome panel lorsqu'on navigue hors de la vue accueil
  const welcomePanel = document.querySelector("#welcome-panel");
  // Si l'onboarding est terminé, le welcome panel doit rester caché
  const onboardingDone = localStorage.getItem(onboardingCompleteKey) === "true";
  if (welcomePanel) {
    if (name === 'accueil' && !onboardingDone) {
      // S'assurer que le welcome panel est visible uniquement si c'est la vue actuelle ET si onboarding n'est pas terminé
      welcomePanel.hidden = false;
    } else {
      welcomePanel.hidden = true;
    }
  }

  // Build the new URL hash
  let hash = `#/${name}`;
  if (params && Object.keys(params).length > 0) {
    const queryString = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');
    hash += `?${queryString}`;
  }

  // Only update history if the URL is actually changing
  if (addHistory && window.location.hash !== hash) {
    window.history.pushState({ view: name, params }, "", hash);
  } else if (!addHistory) {
    window.history.replaceState({ view: name, params }, "", hash);
  }

  activeView = name;

  views.forEach((view) => {
    view.removeAttribute('hidden');
    if (view.dataset.view !== name) {
      view.setAttribute('hidden', 'true');
    }
  });

  navigationButtons.forEach((button) => {
    const isActive = button.dataset.nav === name;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  // Update bottom nav active state (section de la vue : les sous-vues renvoient vers leur item d'origine)
  const bottomNavSection = name in NAV_SECTION_OF ? NAV_SECTION_OF[name] : name;
  document.querySelectorAll(".bottom-nav .nav-item").forEach((button) => {
    const isActive = button.dataset.nav === bottomNavSection;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  document.title = `${pageTitles[name]} | Famili-IA`;
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Show FAB only on Accueil and Recherche views
  const fab = document.querySelector('.fab-add-document');
  if (fab) {
    const showFab = name === 'accueil' || name === 'recherche';
    fab.hidden = !showFab;
  }

  initializeViewWithParams(name, params);

  // Mettre à jour la visibilité des boutons de gestion de fichiers
  updateClearFilesButtonsVisibility();
}


window.addEventListener("popstate", (event) => {
  // If state is available from pushState/replaceState, use it
  if (event.state && event.state.view) {
    showView(event.state.view, {
      addHistory: false,
      params: event.state.params || {}
    });
  } else {
    // Fallback to parsing the hash (for backward compatibility)
    const { view, params } = parseHash();
    showView(view, { addHistory: false, params });
  }
});

function showDemoNotice(message = "Cette fonction est illustrée par des données fictives ; aucun compte réel n'est connecté.") {
  let toastEl = document.querySelector("#toast-message");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "toast-message";
    toastEl.style.position = "fixed";
    toastEl.style.bottom = "24px";
    toastEl.style.left = "50%";
    toastEl.style.transform = "translateX(-50%)";
    toastEl.style.backgroundColor = "var(--color-text, #0f172a)";
    toastEl.style.color = "white";
    toastEl.style.padding = "10px 18px";
    toastEl.style.borderRadius = "8px";
    toastEl.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    toastEl.style.fontSize = "0.9rem";
    toastEl.style.fontWeight = "500";
    toastEl.style.zIndex = "9999";
    toastEl.style.transition = "opacity 0.2s ease-in-out";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.style.opacity = "1";
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 3500);
}

navigationButtons.forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.nav));
});

// Événements globaux avec délégation
document.addEventListener('click', (event) => {
  // Gestion actions démo
  if (event.target.closest('[data-demo-action]')) {
    showDemoNotice();
  }
});

// Bottom navigation (mobile) - switches views
document.querySelectorAll(".bottom-nav .nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    console.log("Clicked nav:", button.dataset.nav);
    const nav = button.dataset.nav;
    showView(nav);
    // Close sidebar on mobile when selecting a nav item
    if (!Capacitor.isNativePlatform() && window.innerWidth < 1025) {
      document.querySelector(".sidebar").style.display = "none";
    }
  });
});

document.querySelectorAll("[data-open-view]").forEach((button) => {
  button.addEventListener("click", (event) => {
    console.log("Clicked data-open-view:", button.dataset.openView);
    if (button instanceof HTMLAnchorElement) event.preventDefault();
    showView(button.dataset.openView);
  });
});


// Gestion des nouvelles vues
document.querySelectorAll("[data-nav~='detail']").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    const eqId = button.dataset.equipment;
    if (eqId) {
      showView("detail", { params: { id: eqId } });
    }
  });
});

document.querySelectorAll("[data-nav~='assistant']").forEach((button) => {
  button.addEventListener("click", () => {
    showView("assistant");
  });
});

document.querySelectorAll("[data-nav~='importer']").forEach((button) => {
  button.addEventListener("click", () => {
    showView("importer");
  });
});

document.querySelectorAll("[data-nav~='profil']").forEach((button) => {
  button.addEventListener("click", () => {
    showView("profil");
    // Populate profile data from state
    const user = getCurrentUser();
    const avatar = document.querySelector("#profile-avatar");
    const nameInput = document.querySelector("#edit-name");
    const addressInput = document.querySelector("#edit-profile-address");
    const postalInput = document.querySelector("#edit-profile-postal");
    const cityInput = document.querySelector("#edit-profile-city");
    const roleEl = document.querySelector("#profile-role");
    if (avatar && nameInput) {
      avatar.textContent = user.avatar || 'S';
      nameInput.value = user.name || 'Steve';
    }
    if (addressInput && user.address) {
      addressInput.value = user.address;
    }
    if (postalInput && user.postalCode) {
      postalInput.value = user.postalCode;
    }
    if (cityInput && user.city) {
      cityInput.value = user.city;
    }
    if (roleEl) {
      roleEl.textContent = user.role || 'Administrateur';
    }
  });
});

/**
 * Handle profile updates
 */
function initProfileHandlers() {
  const saveBtn = document.querySelector("#save-profile");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", () => {
    const newName = document.querySelector("#edit-name").value.trim();
    if (newName) {
      // Update current user in state
      const user = getCurrentUser();
      user.name = newName;
      user.avatar = newName.charAt(0).toUpperCase();

      // Update address, postal code, city
      const addressInput = document.querySelector("#edit-profile-address");
      const postalInput = document.querySelector("#edit-profile-postal");
      const cityInput = document.querySelector("#edit-profile-city");
      if (addressInput) {
        user.address = addressInput.value.trim();
      }
      if (postalInput) {
        user.postalCode = postalInput.value.trim();
      }
      if (cityInput) {
        user.city = cityInput.value.trim();
      }
      user.privacy.telemetryEnabled = document.querySelector('#consent-telemetry').checked;
      user.privacy.dataSharingConsent = document.querySelector('#consent-sharing').checked;

      // Update avatar display in profile
      const avatar = document.querySelector("#profile-avatar");
      if (avatar) {
        avatar.textContent = user.avatar;
      }

      // Trigger a re-render of the dashboard if it's visible
      if (activeView === 'accueil') {
        renderAccueilDashboard();
      }

      showDemoNotice(`Profil mis à jour : ${newName}`);
    }
  });

  // Initialize profile view with data from state
  document.querySelectorAll("[data-nav~='profil']").forEach((button) => {
    button.addEventListener("click", () => {
      showView("profil");
      // Populate profile data from state
      const user = getCurrentUser();
      const avatar = document.querySelector("#profile-avatar");
      const nameInput = document.querySelector("#edit-name");
      const addressInput = document.querySelector("#edit-profile-address");
      const postalInput = document.querySelector("#edit-profile-postal");
      const cityInput = document.querySelector("#edit-profile-city");
      const roleEl = document.querySelector("#profile-role");

      if (avatar && nameInput) {
        avatar.textContent = user.avatar || (user.name ? user.name.charAt(0).toUpperCase() : 'S');
        nameInput.value = user.name || 'Steve';
      }
      if (addressInput && user.address) {
        addressInput.value = user.address;
      }
      if (postalInput && user.postalCode) {
        postalInput.value = user.postalCode;
      }
      if (cityInput && user.city) {
        cityInput.value = user.city;
      }
      if (roleEl) {
        roleEl.textContent = user.role || 'Administrateur';
      }

      // Set checkboxes based on consent
      const telemetryCheckbox = document.querySelector('#consent-telemetry');
      const sharingCheckbox = document.querySelector('#consent-sharing');

      if (telemetryCheckbox && user.privacy) {
        telemetryCheckbox.checked = user.privacy.telemetryEnabled ?? false;
      }
      if (sharingCheckbox && user.privacy) {
        sharingCheckbox.checked = user.privacy.dataSharingConsent ?? false;
      }
    });
  });
}

document.querySelectorAll("[data-nav~='vos-donnees']").forEach((button) => {
  button.addEventListener("click", () => {
    showView("vos-donnees");
    initDataView();
  });
});

/**
 * Get equipment icon - checks for asset image first, falls back to SVG
 * @param {string} category - Equipment category
 * @param {string} eqId - Equipment ID (to potentially look up specific image)
 * @returns {string} HTML img tag or SVG icon
 */
function getEquipmentIcon(category, eqId) {
  const svgFallbacks = {
    'pompe': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    'piscine': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/></svg>`,
    'imprimante': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    'assurance': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    'tout': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`
  };

  return svgFallbacks[category] || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`;
}

/**
 * Render equipment list based on category filter
 */
function renderEquipmentList(category = 'tout') {
  const equipmentList = document.querySelector('#equipment-list');
  const equipmentEmpty = document.querySelector('#equipment-empty');
  if (!equipmentList || !equipmentEmpty) return;

  const equipment = getEquipmentByCategory(category);

  if (equipment.length === 0) {
    equipmentList.innerHTML = '';
    equipmentEmpty.hidden = false;
    return;
  }

  equipmentList.innerHTML = equipment.map(eq => {
    // Determine icon based on category - check for asset image first
    let icon = getEquipmentIcon(eq.category, eq.id);
    let iconClass = 'blue';
    if (eq.category === 'pompe') { iconClass = 'green'; }
    else if (eq.category === 'piscine') { iconClass = 'violet'; }
    else if (eq.category === 'imprimante') { iconClass = 'cyan'; }
    else if (eq.category === 'assurance') { iconClass = 'amber'; }

    return `
      <button class="equipment-row" type="button" data-equipment="${eq.id}" data-open-view="detail">
        <span class="row-icon ${iconClass}">${icon}</span>
        <span class="row-copy"><strong>${eq.name}</strong><small>${eq.status}</small></span>
        <span class="stat-arrow">›</span>
      </button>
    `;
  }).join('');

  equipmentEmpty.hidden = true;
}

/**
 * Initialize category tab filtering
 */
function initCategoryTabs() {
  const tabs = document.querySelectorAll('[data-house-category]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('[data-house-category]').forEach(t => {
        const isSelected = t === tab;
        t.classList.toggle('is-selected', isSelected);
        t.setAttribute('aria-pressed', String(isSelected));
      });

      // Get category and render equipment list
      const category = tab.dataset.houseCategory;
      renderEquipmentList(category);

      // Update pool illustration visibility
      const poolIllustration = document.querySelector('.pool-illustration');
      if (poolIllustration) {
        poolIllustration.hidden = category !== 'tout' && category !== 'piscine';
      }

      // Update equipment empty state (handled by renderEquipmentList)
      // Update URL hash to preserve filter state
      const hash = `#/maison?filter=${encodeURIComponent(category)}`;
      if (window.location.hash !== hash) {
        window.history.pushState({ view: 'maison', filter: category }, "", hash);
      }
    });
  });
}

document.querySelector("#quick-search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const question = document.querySelector("#quick-question").value.trim();
  showView("recherche", { params: { q: question } });
  input.value = question;
  input.focus();
  if (question) search(question);
});

// The house category filtering is now handled by initCategoryTabs() and renderEquipmentList()
// This duplicate event listener is removed to avoid conflicts

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


/**
 * Initialization - Render Accueil dashboard with state data
 */
function renderAccueilDashboard() {
  const user = getCurrentUser();
  const members = getFamilyMembers();
  const equipment = getEquipmentByCategory('tout');
  const alerts = getAlerts();

  // Update dashboard greeting
  const greetingName = document.querySelector('#dashboard-title strong, #dashboard-title');
  if (greetingName && greetingName.textContent?.includes('Bonjour')) {
    // Icône d'étincelles ✨ pour marquer l'accueil
    greetingName.innerHTML = `Bonjour ${user.name} <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" style="display:inline-block; vertical-align:-3px; margin-left:6px; color: var(--color-primary, #0f7173);"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>`;
  }

  // Update stats grid with real data (preserving SVG icons)
  const statCards = document.querySelectorAll('.stat-card');
  if (statCards[0]) {
    statCards[0].querySelector('strong').textContent = `${equipment.length + 5}`;
  }
  if (statCards[1]) {
    const activeWarranties = alerts.filter(a => a.type === 'amber' || a.type === 'red').length;
    statCards[1].querySelector('strong').textContent = activeWarranties.toString();
  }
  if (statCards[2]) {
    statCards[2].querySelector('strong').textContent = '2';
  }
  if (statCards[3]) {
    statCards[3].querySelector('strong').textContent = '1';
  }
  if (statCards[4]) {
    statCards[4].querySelector('strong').textContent = '18 642';
  }
  if (statCards[5]) {
    statCards[5].querySelector('strong').textContent = '31';
  }

  // Update "Vos prochaines échéances" section with event delegation
  const verifyPanel = document.querySelector('#view-accueil .verify-panel');
  if (verifyPanel) {
    verifyPanel.innerHTML = `
      <div class="section-heading">
        <h2 id="verify-title">Vos prochaines échéances</h2>
        <button class="text-button" type="button" data-open-view="alertes">Voir tout</button>
      </div>
      ${alerts.map(alert => `
        <button class="verify-row" type="button" data-open-view="alertes" data-alert-type="${alert.type}">
          <span class="row-icon ${alert.type}" aria-hidden="true">${getAlertIcon(alert.type)}</span>
          <div class="row-copy">
            <strong>${alert.title}</strong>
            <small>${alert.detail}</small>
          </div>
          <span class="stat-arrow">›</span>
        </button>
      `).join('')}
    `;
  }

  // Update member avatars in sidebar
  const sidebarNav = document.querySelector('.sidebar .avatar-small');
  if (sidebarNav && user.avatar) {
    sidebarNav.textContent = user.avatar;
  }
}

/**
 * Retourne l'icône SVG pour une catégorie donnée
 */
function getCategorySvgIcon(category) {
  switch (category) {
    case 'pompe':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    case 'piscine':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/></svg>`;
    case 'imprimante':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
    case 'assurance':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`;
  }
}

/**
 * Retourne la classe de couleur pour une catégorie donnée
 */
function getCategoryColorClass(category) {
  switch (category) {
    case 'pompe': return 'green';
    case 'piscine': return 'violet';
    case 'imprimante': return 'cyan';
    case 'assurance': return 'amber';
    default: return 'blue';
  }
}

/**
 * Initialise la vue de détail d'un équipement
 */
function initEquipmentDetailView(eqId) {
  const eqDetail = getEquipmentDetail(eqId);
  const detailTitle = document.querySelector("#detail-title");
  const detailContent = document.querySelector("#detail-content");
  const detailBreadcrumb = document.querySelector("#detail-breadcrumb");

  if (!detailTitle || !detailContent) return;

  if (!eqDetail) {
    detailTitle.textContent = "Équipement non trouvé";
    detailContent.innerHTML = '<p class="error-state">Désolé, cet équipement n\'existe pas ou a été supprimé.</p>';
    return;
  }

  const name = eqDetail.name;
  detailTitle.textContent = name;
  if (detailBreadcrumb) detailBreadcrumb.textContent = name;

  const categoryIcon = getCategorySvgIcon(eqDetail.category);
  const colorClass = getCategoryColorClass(eqDetail.category);

  detailContent.innerHTML = `
    <div class="equipment-specs">
      <div class="spec-header">
        <span class="spec-icon ${colorClass}">${categoryIcon}</span>
        <h3>${eqDetail.name}</h3>
      </div>
      <div class="spec-grid">
        <div class="spec-item"><label>Catégorie</label><span>${eqDetail.category.charAt(0).toUpperCase() + eqDetail.category.slice(1)}</span></div>
        <div class="spec-item"><label>Statut</label><span class="status-pill">${eqDetail.status}</span></div>
        <div class="spec-item"><label>Installation</label><span>Janvier 2023</span></div>
        <div class="spec-item"><label>Référence</label><span>#${eqId.split('-').pop().toUpperCase()}</span></div>
      </div>

      <div class="spec-docs">
        <h4>Documents associés</h4>
        <div class="doc-grid">
          ${eqDetail.docs && eqDetail.docs.length > 0
            ? eqDetail.docs.map(docId => {
                const doc = [...documents, ...uploadedDocuments].find(d => d.id === docId);
                const docName = doc ? doc.name : docId;
                return `
                  <button class="doc-link-card" type="button" data-doc-id="${docId}">
                    <span class="doc-icon">ðŸ“„</span>
                    <span class="doc-name">${docName}</span>
                    <span class="doc-arrow">›</span>
                  </button>
                `;
              }).join('')
            : '<p class="empty-docs">Aucun document lié pour cet équipement.</p>'}
        </div>
      </div>

      <div class="equipment-actions">
        <button class="context-action-button" type="button" id="edit-equipment">
          <span>âœŽ</span> Modifier
        </button>
        <button class="context-action-button" type="button" id="delete-equipment" style="color: var(--color-danger, #ef4444);">
          <span>ðŸ—‘</span> Supprimer
        </button>
        <button class="context-action-button" type="button" data-demo-action>
          <span>+</span> Lier un document
        </button>
        <button class="context-action-button" type="button" data-demo-action>
          <span>â†»</span> Historique
        </button>
      </div>
    </div>
  `;

  document.querySelector('#edit-equipment').addEventListener('click', () => {
    openEquipmentForm(eqDetail);
  });

  document.querySelector('#delete-equipment').addEventListener('click', async () => {
    if (confirm(`Voulez-vous vraiment supprimer "${eqDetail.name}" ?`)) {
      await deleteEquipment(eqId);
      showDemoNotice(`Équipement supprimé : ${eqDetail.name}`);
      showView("maison");
      renderEquipmentList();
    }
  });

  detailContent.querySelectorAll('.doc-link-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      const doc = [...documents, ...uploadedDocuments].find(d => d.id === docId);
      if (doc) openSource(doc);
    });
  });

  detailContent.querySelectorAll('[data-demo-action]').forEach(btn => {
    btn.addEventListener('click', () => showDemoNotice());
  });
}

const initialView = window.location.hash.slice(1);
// Amélioration : détecter firstRun de manière robuste
// Si localStorage n'est pas disponible (ex: mode debug/incognito), on considère ce n'est pas le first run
let firstRun = false;
try {
  firstRun = localStorage.getItem(onboardingCompleteKey) !== "true";
} catch (e) {
  // localStorage unavailable - not first run by default
}
document.querySelector("#welcome-panel").hidden = true; // Caché par défaut

// Montrer le welcome panel UNIQUEMENT sur la vue accueil AU CHARGEMENT INITIAL
if (firstRun && initialView === 'accueil') {
  document.querySelector("#welcome-panel").hidden = false;
}
document.querySelector("#dashboard-content").hidden = firstRun;
document.querySelector("#view-accueil").setAttribute("aria-labelledby", firstRun ? "welcome-title" : "dashboard-title");
showView(Object.hasOwn(pageTitles, initialView) ? initialView : "accueil", { addHistory: false });
window.history.replaceState({ view: activeView }, "", `#${activeView}`);

// Render dashboard on load (uniquement si ce n'est pas le premier RUN OU si on est déjà sur accueil)
if (!firstRun || initialView === 'accueil') {
  renderAccueilDashboard();
}

function getAlertIcon(type) {
  let iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  if (type === 'red') {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }
  return iconSvg;
}

/**
 * Initialize alerts view
 */
function initAlertsView(params = {}) {
  const alertList = document.querySelector('#alert-list');
  if (!alertList) return;

  // Add event listeners for filter tabs
  const tabs = document.querySelectorAll('.alert-filter-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-selected'));
      tab.classList.add('is-selected');
      renderAlerts(tab.dataset.filter);

      // Update URL hash to preserve filter state
      const hash = `#/alertes?filter=${encodeURIComponent(tab.dataset.filter)}`;
      if (window.location.hash !== hash) {
        window.history.pushState({ view: 'alertes', filter: tab.dataset.filter }, "", hash);
      }
    });
  });

  // Render initial alerts (default: à-traiter)
  renderAlerts('à-traiter');

  // Apply filter from URL hash if present
  const hashFilter = params?.filter;
  if (hashFilter) {
    const matchingTab = document.querySelector(`.alert-filter-tab[data-filter="${hashFilter}"]`);
    if (matchingTab) {
      tabs.forEach(t => t.classList.remove('is-selected'));
      matchingTab.classList.add('is-selected');
      renderAlerts(hashFilter);
    }
  }
}

/**
 * Render alerts based on filter
 */
function renderAlerts(filter) {
  const alertList = document.querySelector('#alert-list');
  if (!alertList) return;

  const rawAlerts = getAlerts();
  const alerts = rawAlerts.map(alert => ({ ...alert, type: calculateAlertType(alert.dueDate, alert.type) }));

  // Logic mapping based on alert type/data
  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'à-traiter') return alert.type === 'red';
    if (filter === 'à-anticiper') return alert.type === 'amber';
    if (filter === 'à-surveiller') return alert.type === 'blue' || alert.type === 'muted';
    return true;
  });

  // Update badges
  document.querySelectorAll('.alert-filter-tab').forEach(tab => {
    const f = tab.dataset.filter;
    const count = alerts.filter(a => {
      if (f === 'à-traiter') return a.type === 'red';
      if (f === 'à-anticiper') return a.type === 'amber';
      if (f === 'à-surveiller') return a.type === 'blue' || a.type === 'muted';
      return false;
    }).length;
    tab.querySelector('.alert-badge').textContent = count.toString();
  });

  if (filteredAlerts.length === 0) {
    alertList.innerHTML = '<p class="empty-state">Aucune alerte dans cette catégorie.</p>';
    return;
  }

  alertList.innerHTML = filteredAlerts.map(alert => {
    const iconSvg = getAlertIcon(alert.type);

    return `
      <article class="alert-card ${alert.type}" data-alert-card data-alert-id="${alert.id}">
        <div class="alert-icon ${alert.type}">
          ${iconSvg}
        </div>
        <div class="alert-content">
          <div class="alert-header">
            <strong>${alert.title}</strong>
            ${alert.dueDate ? `<span class="alert-date">Échéance : ${alert.dueDate}</span>` : ''}
          </div>
          <p>${alert.detail}</p>
        </div>
        <button class="alert-action" type="button" data-open-view="recherche" aria-label="Voir le détail">›</button>
      </article>
    `;
  }).join('');

  // Re-bind alert card click listeners for read toggle
  document.querySelectorAll("[data-alert-card]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest('.alert-action')) return;
      card.classList.toggle("is-read");
    });
  });

  // Handle alert action button navigation
  document.querySelectorAll(".alert-card [data-open-view]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      showView(button.dataset.openView);
    });
  });
}

// Initialize family state from localStorage (if available)
let familyInitialized = false;

async function loadSavedFamilyState() {
  if (familyInitialized) return;

  const savedFamily = loadFamilyState();
  if (savedFamily && savedFamily.length > 0) {
    try {
      const stateModule = await import('./state.js');
      stateModule.initFamilyFromSaved(savedFamily);
      familyInitialized = true;
    } catch (e) {
      console.warn('Error loading family state:', e);
    }
  }
}

// Appeler au chargement
loadSavedFamilyState();

// The house view must be initialized on page load
// Note: These calls are now moved to the end of the file to avoid ReferenceErrors

/**
 * Initialize house view
 */
function initHouseView() {
  renderEquipmentList();
  initCategoryTabs();

  const addBtn = document.querySelector('#add-equipment-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openEquipmentForm();
    });
  }

  // Synchroniser l'adresse, le code postal et la ville avec l'état global de l'utilisateur
  const user = getCurrentUser();
  const displayAddress = document.querySelector('#display-address');
  const displayCity = document.querySelector('#display-city');

  if (displayAddress && user.address) {
    displayAddress.textContent = user.address;
  }
  if (displayCity) {
    const postal = user.postalCode || '';
    const city = user.city || '';
    displayCity.textContent = `${postal} ${city}`.trim();
  }
}

/**
 * Render family members list from state data
 */
function renderFamilyMembers() {
  const memberList = document.querySelector('#member-list');
  if (!memberList) return;

  const members = getFamilyMembers();
  const currentUser = getCurrentUser();

  // Always show empty state or member list, then always show add-member button
  if (members.length === 0) {
    memberList.innerHTML = '<p class="empty-state">Aucun membre de famille.</p>';
  } else {
    memberList.innerHTML = members.map(member => {
      const isCurrentUser = member.id === currentUser.id;
      const avatarText = member.avatar || (member.name ? member.name.charAt(0).toUpperCase() : '?');
      const accessText = member.access === 'full' ? 'Accès complet' : 'Accès limité';

      return `
        <article class="member-card">
          <div class="member-avatar">${avatarText}</div>
          <strong>${member.name}</strong>
          <span>${accessText}</span>
          ${isCurrentUser ? '<span class="member-you">Vous</span>' : ''}
        </article>
      `;
    }).join('');
  }

  // Always show the add-member button, even when list is empty
  memberList.innerHTML += `
    <button class="member-card add-member" type="button">
      <span class="add-member-icon">+</span>
      <strong>Gérer les accès</strong>
      <span>Famille et invités</span>
    </button>
  `;
}

function initAddMemberDialog() {
  const dialog = document.querySelector('#add-member-dialog');
  const form = document.querySelector('#add-member-form');
  const cancelBtn = document.querySelector('#cancel-add-member-dialog');
  const closeBtn = document.querySelector('#close-add-member-dialog');

  if (!dialog || !form) return;

  cancelBtn.addEventListener('click', () => dialog.close());
  closeBtn.addEventListener('click', () => dialog.close());

  const deleteBtn = document.querySelector('#delete-member-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const id = document.querySelector('#member-id-input').value;
      if (id && confirm('Voulez-vous vraiment supprimer ce membre ?')) {
        await deleteFamilyMember(id);
        showDemoNotice('Membre supprimé');
        dialog.close();
        form.reset();
        renderFamilyMembers();
        attachAddMemberListener();
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.querySelector('#member-id-input').value;
    const name = document.querySelector('#member-name-input').value;
    const access = document.querySelector('#member-access-input').value;

    if (id) {
        // Edit existing
        const member = { id, name, role: 'Member', avatar: name.charAt(0).toUpperCase(), access };
        await updateFamilyMember(member);
        showDemoNotice(`Membre modifié : ${name}`);
    } else {
        // Add new
        const newMember = {
          id: `u-${Date.now()}`,
          name,
          role: 'Member',
          avatar: name.charAt(0).toUpperCase(),
          access
        };
        await addFamilyMember(newMember);
        showDemoNotice(`Membre ajouté : ${name}`);
    }

    dialog.close();
    form.reset();
    renderFamilyMembers(); // Refresh list
    attachAddMemberListener(); // Re-attach listener
    if (document.querySelector('#manage-members-dialog')?.open) {
      updateManageMembersList();
    }
  });
}

// Add event listener to the add-member button after rendering
function attachAddMemberListener() {
  const addBtn = document.querySelector('#member-list .add-member');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openManageMembersModal();
    });
  }
}

function openManageMembersModal() {
  let modal = document.querySelector('#manage-members-dialog');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'manage-members-dialog';
    modal.className = 'source-dialog';
    modal.setAttribute('aria-labelledby', 'manage-members-title');
    modal.innerHTML = `
      <div class="dialog-header">
        <div><p class="eyebrow">FAMILLE</p><h2 id="manage-members-title">Gérer les membres et accès</h2></div>
        <button class="close-button" id="close-manage-members" type="button" aria-label="Fermer">Ã—</button>
      </div>
      <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 1rem;">
        <div id="manage-members-list" style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 300px; overflow-y: auto;"></div>
        <button class="primary-button" id="open-add-member-from-manager" type="button" style="background: var(--color-primary, #0f7173); color: white; padding: 0.75rem; border-radius: 8px; border: none; cursor: pointer; font-weight: 600;">+ Ajouter un membre</button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#close-manage-members').addEventListener('click', () => modal.close());
    modal.querySelector('#open-add-member-from-manager').addEventListener('click', () => {
      document.querySelector('#member-id-input').value = '';
      document.querySelector('#delete-member-btn').hidden = true;
      document.querySelector('#add-member-form').reset();
      document.querySelector('#add-member-dialog').showModal();
    });
  }

  updateManageMembersList();
  modal.showModal();
}

function updateManageMembersList() {
  const listContainer = document.querySelector('#manage-members-list');
  if (!listContainer) return;

  const members = getFamilyMembers();
  const currentUser = getCurrentUser();

  listContainer.innerHTML = members.map(member => {
    const isCurrentUser = member.id === currentUser.id;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: var(--color-surface-hover, #f8fafc); border: 1px solid var(--color-border, #e2e8f0); border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--color-primary-light, #e6f4f4); color: var(--color-primary, #0f7173); display: flex; align-items: center; justify-content: center; font-weight: 600;">${member.avatar}</div>
          <div>
            <strong>${member.name}</strong> ${isCurrentUser ? '<span style="font-size: 0.75rem; background: #e2e8f0; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.5rem;">Vous</span>' : ''}
            <div style="font-size: 0.8rem; color: var(--color-text-secondary, #64748b);">${member.access === 'full' ? 'Accès complet' : 'Accès limité'}</div>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="edit-member-item secondary-button" data-id="${member.id}" style="padding: 0.4rem 0.75rem; font-size: 0.85rem; border-radius: 6px;">Modifier</button>
          ${!isCurrentUser ? `<button type="button" class="delete-member-item text-button" data-id="${member.id}" style="color: var(--color-danger, #dc2626); padding: 0.4rem 0.75rem; font-size: 0.85rem;">Supprimer</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll('.edit-member-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const member = getFamilyMembers().find(m => m.id === id);
      if (member) {
        document.querySelector('#member-id-input').value = member.id;
        document.querySelector('#member-name-input').value = member.name;
        document.querySelector('#member-access-input').value = member.access;
        document.querySelector('#delete-member-btn').hidden = false;
        document.querySelector('#add-member-dialog').showModal();
      }
    });
  });

  listContainer.querySelectorAll('.delete-member-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Voulez-vous vraiment supprimer ce membre ?')) {
        await deleteFamilyMember(id);
        showDemoNotice('Membre supprimé');
        updateManageMembersList();
        renderFamilyMembers();
      }
    });
  });
}

/**
 * Initialize family view
 */
function initFamilyView() {
  renderFamilyMembers();
  attachAddMemberListener();
}

/**
 /**
 * Render the list of imported files in the import view
 */
function renderImportFileList() {
  const container = document.querySelector('#import-file-list');
  if (!container) return;

  if (uploadedDocuments.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 0.5rem;">Fichiers importés (${uploadedDocuments.length}) :</div>
    <ul style="list-style-type: disc; padding-left: 1.5rem; margin: 0;">
      ${uploadedDocuments.map(doc => `<li>${doc.name} (${doc.type})</li>`).join('')}
    </ul>
  `;
}

/**
 * Initialize import view (drag & drop and file selection)
 */
function initImportView() {
  const dropZone = document.querySelector('#drop-zone');
  const importInput = document.querySelector('#import-input');
  const importOptions = document.querySelectorAll('.import-option');
  const importFileList = document.querySelector('#import-file-list');
  if (!dropZone || !importInput || !importOptions) return;

  dropZone.addEventListener('click', () => importInput.click());

  // Drag and drop handling
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('is-dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      loadLocalFiles(files).then(() => {
        renderImportFileList();
      });
    }
  });

  importInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadLocalFiles(files).then(() => {
        renderImportFileList();
      });
    }
  });

  // Gestion des boutons d'options d'import
  importOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      const action = option.dataset.action;
      e.preventDefault();

      switch (action) {
        case 'drag-drop':
          // Already handled - just focus the drop zone
          dropZone.click();
          break;

        case 'camera':
          // Ouvrir le sélecteur de fichiers avec capture de la caméra arrière/env
          if (Capacitor.isNativePlatform()) {
            importInput.accept = 'image/*';
            importInput.capture = 'environment';
            importInput.click();
          } else {
            // Fallback web : autoriser les images
            importInput.accept = 'image/*';
            importInput.click();
            showDemoNotice("La prise de photo/scan depuis l'appareil est disponible sur l'application mobile.");
          }
          break;

        case 'manual':
          // Ouvrir un formulaire de saisie manuelle
          openManualEntryDialog();
          break;
      }
    });
  });
}

/**
 * Ouvre un dialoge de saisie manuelle de texte
 */
function openManualEntryDialog() {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <div class="panel" style="max-width: 90%; padding: 1.5rem;">
      <div class="section-heading" style="margin-bottom: 1rem;">
        <h2 style="margin: 0; font-size: 1.25rem;">Saisie manuelle de document</h2>
      </div>
      <form id="manual-form">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Titre du document</label>
          <input type="text" id="manual-title" placeholder="Ex: Facture EDF janvier" style="width: 100%; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
        </div>
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Type de document</label>
          <select id="manual-type" style="width: 100%; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
            <option value="Facture">Facture</option>
            <option value="Garantie">Garantie</option>
            <option value="Contrat">Contrat</option>
            <option value="Notice">Notice</option>
            <option value="Quittance">Quittance</option>
            <option value="Attestation">Attestation</option>
            <option value="Ordonnance">Ordonnance</option>
            <option value="Courrier">Courrier</option>
            <option value="Certificat">Certificat</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Contenu principal (optionnel)</label>
          <textarea id="manual-content" rows="3" style="width: 100%; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: inherit;"></textarea>
        </div>
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
          <button type="button" class="text-button" style="flex: 1;">Annuler</button>
          <button type="submit" class="primary-button" style="flex: 1;">Enregistrer</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  // Gestion du bouton Annuler - retour à l'écran précédent
  const cancelBtn = dialog.querySelector('button.text-button');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      dialog.close();
      document.body.removeChild(dialog);
    });
  }

  // Gestion de la soumission
  dialog.querySelector('#manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.querySelector('#manual-title').value;
    const type = document.querySelector('#manual-type').value;
    const content = document.querySelector('#manual-content').value;

    if (!title) {
      showDemoNotice("Veuillez entrer un titre pour le document.");
      return;
    }

    // Créer un document factice mais complet
    const newDoc = {
      id: `manual-${Date.now()}`,
      name: `${title}.pdf`,
      type: type,
      date: new Date().toLocaleDateString('fr-FR'),
      keywords: title.toLowerCase(),
      summary: content || "Document saisi manuellement",
      content: content || `Document saisi manuellement : ${title}`,
      isLocal: true,
      sourceDir: "Saisie manuelle"
    };

    // Ajouter à la liste des documents locaux
    uploadedDocuments.push(newDoc);
    await addDocument(newDoc);
    renderImportFileList();

    dialog.close();
    document.body.removeChild(dialog);
    showDemoNotice(`Document "${title}" créé avec succès (saisie manuelle).`);
  });
}

// Initialize the application
initHouseView();
initAlertsView();
initFamilyView();
initProfileHandlers();
initImportView();
initDataView();
initAssistantView();

/**
 * Render data inventory for Vos données view
 */
function renderDataInventory() {
  const dataList = document.querySelector('#data-inventory-list');
  if (!dataList) return;

  const docs = uploadedDocuments.length > 0 ? uploadedDocuments : documents;

  if (docs.length === 0) {
    dataList.innerHTML = '<p class="empty-state">Aucun document indexé.</p>';
    return;
  }

  dataList.innerHTML = docs.map(doc => {
    let sourceIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
    let sourceText = 'Démonstration';

    if (doc.driveSource) {
      sourceIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
      sourceText = 'Google Drive';
    } else if (doc.driveDemo) {
      sourceText = 'Démo';
    } else if (doc.isLocal) {
      sourceIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
      sourceText = doc.sourceDir && Capacitor.isNativePlatform() ? 'Stockage local' : 'Fichier local';
    }

    return `
      <div class="data-file-row">
        <div class="data-file-info">
          <span class="icon icon-bg-blue icon-circle" style="--icon-size: 40px;">${sourceIcon}</span>
          <div>
            <div class="data-file-name">${doc.name}</div>
            <div class="data-file-meta">${doc.type} · ${sourceText} · ${doc.date || 'Session'}</div>
          </div>
        </div>
        <div class="data-file-size">${doc.content ? Math.round(doc.content.length / 1024) + ' Ko' : '—'}</div>
      </div>
    `;
  }).join('');
}

/**
 * Initialize Vos données view
 */
function initDataView() {
  renderDataInventory();

  const exportBtn = document.querySelector('#export-all-data');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataToExport = getFullState();
      const dataStr = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'famili-ia-data.json';
      a.click();
      URL.revokeObjectURL(url);
      showDemoNotice('Données exportées vers famili-ia-data.json');
    });
  }

  // PDF Export - Génère un rapport PDF des données exportées
  const pdfExportBtn = document.querySelector('#export-pdf-data');
  if (pdfExportBtn) {
    pdfExportBtn.addEventListener('click', () => {
      const dataToExport = getFullState();
      const dataStr = JSON.stringify(dataToExport, null, 2);
      const pdfContent = generatePDF(dataStr);
      const blob = new Blob([pdfContent], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'famili-ia-data.pdf';
      a.click();
      URL.revokeObjectURL(url);
      showDemoNotice('Rapport PDF généré : famili-ia-data.pdf');
    });
  }

  const purgeBtn = document.querySelector('#purge-all-data');
  if (purgeBtn) {
    purgeBtn.addEventListener('click', () => {
      clearSessionFiles();
      renderDataInventory();
      showDemoNotice('Toutes les données de la session ont été supprimées');
    });
  }
}

/**
 * Génère un rapport PDF basique contenant les données exportées
 * Utilise une approche légère sans bibliothèque externe
 * @param {string} dataStr - Chaîne JSON des données à exporter
 * @returns {Uint8Array} Tableau d'octets représentant le fichier PDF
 */
function generatePDF(dataStr) {
  const data = JSON.parse(dataStr);

  // Construction du contenu PDF minimal
  let pdf = '%PDF-1.4\n';

  // Objet 1 : Document root
  pdf += '1 0 obj\n';
  pdf += '<< /Type /Catalog /Pages 2 0 R >>\n';
  pdf += 'endobj\n';

  // Objet 2 : Pages (vide pour l'instant)
  pdf += '2 0 obj\n';
  pdf += '<< /Type /Pages /Kids [] /Count 0 >>\n';
  pdf += 'endobj\n';

  // Objet 3 : Police Helvetica
  pdf += '3 0 obj\n';
  pdf += '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n';
  pdf += 'endobj\n';

  // Préparation du texte à inclure
  const username = data.currentUser ? data.currentUser.name : 'Inconnu';
  const eqCount = data.homeEquipment ? data.homeEquipment.length : 0;
  const alertCount = data.alerts ? data.alerts.length : 0;

  // Texte au format PDF (encodage simple)
  const text = 'FAMILI-IA - Rapport d\'export\n';
  const text2 = 'Utilisateur : ' + username + '\n';
  const text3 = 'Résumé :\n';
  const text4 = '- Équipements : ' + eqCount + '\n';
  const text5 = '- Alertes : ' + alertCount + '\n';

  // Objet 4 : Contenu textuel compressé
  pdf += '4 0 obj\n';
  const content = text + text2 + text3 + text4 + text5;
  const contentLength = Buffer ? Buffer.from(content).length : new Blob([content]).size;
  pdf += '<< /Length ' + content.length + ' >>\n';
  pdf += 'stream\n';
  pdf += content;
  pdf += '\nendstream\n';
  pdf += 'endobj\n';

  // Table des matières (xref)
  const objOffsets = [0, 10, 10 + 12, 10 + 12 + 14, 10 + 12 + 14 + 18];
  pdf += 'xref\n';
  pdf += '0 5\n';
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i <= 4; i++) {
    const offset = objOffsets[i];
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  }

  pdf += 'trailer\n';
  pdf += '<< /Size 5 /Root 1 0 R >>\n';
  pdf += 'startxref\n';
  pdf += (10 + 12 + 14 + 18).toString().padStart(10, '0') + '\n';
  pdf += '%%EOF\n';

  // Conversion en Uint8Array compatible Vite
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    bytes[i] = pdf.charCodeAt(i);
  }
  return bytes;
}

/**
 * Initialize Assistant IA view
 */
function initAssistantView() {
  const form = document.querySelector('#assistant-form');
  const input = document.querySelector('#assistant-input');
  const chatContainer = document.querySelector('#assistant-chat');
  const suggestionChips = document.querySelectorAll('.assistant-suggestion-chip');

  if (!form || !input || !chatContainer) return;

  // Handle suggestion chips
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const question = chip.dataset.question;
      input.value = question;
      input.focus();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    // Add user message
    addUserMessage(question, chatContainer);
    input.value = '';

    // Get AI response
    const aiResponse = getAssistantResponse(question);
    // Simulate a small delay for realism
    setTimeout(() => {
      addAIMessage(aiResponse, chatContainer);
    }, 500);
  });
}

/**
 * Add a user message to the chat container
 */
function addUserMessage(text, container) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message user';
  msgDiv.innerHTML = `
    <div class="chat-avatar">S</div>
    <div class="chat-bubble">${text}</div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Add an AI message to the chat container
 */
function addAIMessage(text, container) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message ai';
  msgDiv.innerHTML = `
    <div class="chat-avatar">âœ¦</div>
    <div class="chat-bubble">${text}</div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Get a response from the assistant based on the question
 * Uses the same search logic as the main search view
 */
function getAssistantResponse(question) {
  const trimmed = question.trim();
  if (!trimmed) return "Posez une question pour obtenir une réponse.";

  const matches = findDocuments(trimmed);
  if (matches.length === 0) {
    return "Je n'ai pas trouvé de document correspondant à votre question. Essayez de reformuler ou d'ajouter des documents.";
  }

  const bestMatch = matches[0];
  const doc = bestMatch.document;

  let answerText;
  if (doc.isLocal) {
    if (bestMatch.exactFact) {
      answerText = `Dans « ${doc.name} », ${bestMatch.exactFact}`;
    } else {
      answerText = `Extrait du fichier « ${doc.name} » : « ${bestMatch.excerpt} »`;
    }
  } else {
    answerText = doc.summary;
  }

  let sourceInfo = '';
  if (doc.driveSource) {
    sourceInfo = ' (Source : Google Drive)';
  } else if (doc.driveDemo) {
    sourceInfo = ' (Source : Démonstration)';
  } else if (doc.isLocal) {
    sourceInfo = doc.sourceDir && Capacitor.isNativePlatform() ? ' (Source : Stockage local)' : ' (Source : Fichier local)';
  } else {
    sourceInfo = ' (Source : Démonstration)';
  }

  return answerText + sourceInfo;
}

/**
 * Initialise le système de vérification d'alertes automatisé
 * Vérifie si des alertes arrivent à échéance (< 3 jours) et notifie l'utilisateur
 */
function startAlertScheduler() {
  // Vérification immédiate au chargement
  checkAlertsForExpiry();

  // Puis toutes les 24 heures (86400000 ms)
  setInterval(checkAlertsForExpiry, 86400000);
}

/**
 * Parcourt les alertes et vérifie lesquelles arrivent à moins de 3 jours
 */
function checkAlertsForExpiry() {
  const today = new Date();
  const alerts = getAlerts();
  const alertsToNotify = [];

  alerts.forEach(alert => {
    if (!alert.dueDate) return; // Sans date précise, on ne peut pas vérifier automatiquement

    const dueDate = new Date(alert.dueDate);
    const diffTime = Math.abs(dueDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Si l'échéance est dans moins de 3 jours (ou déjà dépassée)
    if (diffDays <= 3 && diffDays >= 0) {
      alertsToNotify.push(alert);
    }
  });

  if (alertsToNotify.length > 0) {
    showAlertNotifications(alertsToNotify);
  }
}

/**
 * Affiche les notifications pour les alertes en cours
 * @param {Array} alerts - Array d'alertes à notifier
 */
function showAlertNotifications(alerts) {
  // Demander la permission si nécessaire
  if (!('Notification' in window)) {
    console.warn('Cette navigateur ne supporte pas les notifications');
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        alerts.forEach(alert => {
          new Notification('ðŸ“… Famili-IA - Alerte', {
            body: `${alert.title} : ${alert.detail}`,
            icon: '/favicon.ico'
          });
        });
      }
    });
  } else if (Notification.permission === 'granted') {
    alerts.forEach(alert => {
      new Notification('ðŸ“… Famili-IA - Alerte', {
        body: `${alert.title} : ${alert.detail}`,
        icon: '/favicon.ico'
      });
    });
  }
}

// Démarrage du scheduler au chargement
startAlertScheduler();
