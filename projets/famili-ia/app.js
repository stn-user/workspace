import { detectQuestionIntent, extractExactFact, getIntentKeywords, getQuestionTerms, getSearchMatch, normalizeText } from "./search-utils.js";
import { GoogleDriveClient } from "./google-drive.js";
// Mock Capacitor pour le navigateur web (non disponible en local sans build)
const Capacitor = { isNativePlatform: () => false };
const Filesystem = null;
import { listLocalFiles, readFileContent, requestPermissions } from "./local-files.js";
import { getCurrentUser, getFamilyMembers, getEquipmentByCategory, getEquipmentDetail, getAlerts } from "./state.js";
import { loadFamilyState, saveFamilyState } from "./family-storage.js";

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
const sourceChoiceDialog = document.querySelector("#source-choice-dialog");
const googleDriveChoiceDescription = document.querySelector("#google-drive-choice-description");
const onboardingCompleteKey = "famili-ia-source-choice-complete";
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
      ? "☁️ Google Drive · copie temporaire locale"
      : sourceDocument.driveDemo
        ? "Sélection Google Drive simulée · fichier fictif"
        : sourceDocument.isLocal
          ? sourceDocument.sourceDir && Capacitor.isNativePlatform()
            ? "💾 Stockage local · non transmis"
            : "💾 Fichier local · non transmis"
          : "Exemple fictif";
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
    : document.isLocal
      ? document.sourceDir && Capacitor.isNativePlatform()
        ? "💾 FICHIER STOCKAGE LOCAL"
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
  dialogNoticeText.textContent = document.driveSource
    ? "Fichier explicitement choisi dans Google Picker. Le contenu est conservé en mémoire dans ce navigateur et n’est envoyé ni à un serveur Famili-IA ni à une IA."
    : document.driveDemo
      ? "Ceci est un contenu fictif. Aucun compte Google n’est connecté et aucun fichier Drive réel n’a été consulté."
      : document.isLocal
        ? document.sourceDir && Capacitor.isNativePlatform()
          ? "Fichier scanné depuis votre stockage local (Documents/Téléchargements). Le contenu est traité en mémoire et n'est pas transmis à un serveur."
          : "Fichier choisi depuis cet appareil. Le contenu est traité localement et n’est pas transmis."
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

    // Filtre par type de document
    if (typeFilter) {
      let matchesType = false;
      if (typeFilter === 'Facture' && doc.type === 'Facture') matchesType = true;
      else if (typeFilter === 'Garantie' && doc.type === 'Garantie') matchesType = true;
      else if (typeFilter === 'Contrat' && doc.type === 'Contrat') matchesType = true;
      else if (typeFilter === 'Notice' && doc.type === 'Notice') matchesType = true;
      else if (typeFilter === 'PDF' && doc.type === 'PDF') matchesType = true;
      else if (typeFilter === 'Texte' && (doc.type === 'Texte' || doc.type === 'Markdown')) matchesType = true;
      else if (typeFilter === 'Markdown' && doc.type === 'Markdown') matchesType = true;

      if (!matchesType) return false;
    }

    // Filtre par source
    if (sourceFilter) {
      let matchesSource = false;
      if (sourceFilter === 'local' && doc.isLocal && !doc.driveSource && !doc.driveDemo) matchesSource = true;
      else if (sourceFilter === 'drive' && doc.driveSource) matchesSource = true;
      else if (sourceFilter === 'demo' && (doc.driveDemo || !doc.isLocal)) matchesSource = true;

      if (!matchesSource) return false;
    }

    return true;
  });
}

// Event listeners pour les filtres
document.querySelectorAll('#filter-type, #filter-source').forEach(select => {
  select.addEventListener('change', () => {
    // Réexécuter la recherche actuelle si elle existe
    if (input.value.trim()) {
      search(input.value);
      // Afficher le bouton "Effacer les filtres"
      const clearBtn = document.querySelector('#clear-filters');
      if (clearBtn) clearBtn.hidden = false;
    }
  });
});

// Gestion du bouton "Effacer les filtres"
document.querySelector('#clear-filters').addEventListener('click', () => {
  document.querySelector('#filter-type').value = '';
  document.querySelector('#filter-source').value = '';
  document.querySelector('#clear-filters').hidden = true;

  // Réexécuter la recherche sans filtres
  if (input.value.trim()) {
    search(input.value);
  }
});

function setFileStatus(message, state) {
  fileStatus.textContent = message;
  if (state) fileStatus.dataset.state = state;
  else delete fileStatus.dataset.state;
}

function setDriveConnectionStatus(message, state) {
  if (!driveConnectionStatus) return;
  driveConnectionStatus.textContent = message;
  if (state) driveConnectionStatus.dataset.state = state;
  else delete driveConnectionStatus.dataset.state;
}

function updateDriveConnectionActions() {
  disconnectGoogleDriveButton.hidden = !googleDriveClient?.hasAccessToken;
}

function updateGoogleDriveButton() {
  connectGoogleDriveButton.disabled = !googleDriveReady || uploadedDocuments.length >= maxFiles;
  if (isNativePlatform) {
    googleDriveChoiceDescription.textContent = "La connexion Google native n’est pas encore disponible dans l’application mobile.";
  } else if (!hasGoogleDriveConfig) {
    googleDriveChoiceDescription.textContent = "La connexion n’est pas configurée dans cette version web.";
  } else if (!googleDriveReady) {
    googleDriveChoiceDescription.textContent = "Connexion en cours de préparation…";
  } else if (uploadedDocuments.length >= maxFiles) {
    googleDriveChoiceDescription.textContent = "Limite de fichiers atteinte. Retirez-en pour en ajouter d’autres.";
  } else {
    googleDriveChoiceDescription.textContent = "Connecter votre compte puis choisir les fichiers à consulter.";
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

  const invalidFile = selectedFiles.find((file) => !/\.(txt|md|pdf)$/i.test(file.name));
  if (invalidFile) {
    setFileStatus(`« ${invalidFile.name} » n'est pas un fichier TXT, MD ou PDF. Aucun fichier de cette sélection n'a été ajouté.`, "error");
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
    completeOnboarding();
    const count = uploadedDocuments.length;
    setFileStatus(`${loaded.length} fichier${loaded.length === 1 ? "" : "s"} ajouté${loaded.length === 1 ? "" : "s"} localement. ${count} fichier${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"} dans cette session ; rien n'est envoyé ni conservé après fermeture.`, "success");
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
    clearFilesButton.hidden = false;
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
  setDriveConnectionStatus("Chargement des bibliothèques Google. Aucun accès aux fichiers n’est demandé avant votre action.", "success");
  googleDriveClient.initialize().then(() => {
    googleDriveReady = true;
    updateGoogleDriveButton();
    updateModeBanner();
    setDriveConnectionStatus("Prêt. Choisissez Google Drive pour demander l’accès drive.file et sélectionner vos fichiers dans le sélecteur officiel.", "success");
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
    completeOnboarding();
    sourceChoiceDialog.close();
    showView("recherche");
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
  sourceChoiceDialog.close();
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
  completeOnboarding();
  setFileStatus(
    `${selectedDocuments.length} fichier${selectedDocuments.length === 1 ? "" : "s"} fictif${selectedDocuments.length === 1 ? "" : "s"} ajouté${selectedDocuments.length === 1 ? "" : "s"} à la session. Aucun compte Google n’est connecté et aucun fichier Drive n’a été consulté.`,
    "success"
  );
  drivePickerDialog.close();
  showView("recherche");
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
  alertes: "Alertes",
  detail: "Détail équipement",
  assistant: "Assistant IA",
  importer: "Importer",
  profil: "Profil",
  "vos-donnees": "Vos données"
};
const toast = document.querySelector("#toast-message");
let toastTimeout;
let activeView = "accueil";

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
      break;

    case 'maison':
      initHouseView();
      break;

    case 'accueil':
      renderAccueilDashboard();
      break;

    default:
      break;
  }
}

function showView(name, { addHistory = true, params = {} } = {}) {
  console.log("showView called for:", name);
  if (!Object.hasOwn(pageTitles, name)) return;

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
    view.hidden = view.dataset.view !== name;
  });

  navigationButtons.forEach((button) => {
    const isActive = button.dataset.nav === name;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  // Update bottom nav active state
  document.querySelectorAll(".bottom-nav .nav-item").forEach((button) => {
    const isActive = button.dataset.nav === name;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  document.title = `${pageTitles[name]} | Famili-IA`;
  window.scrollTo({ top: 0, behavior: "smooth" });

  initializeViewWithParams(name, params);
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

document.querySelectorAll("[data-demo-action]").forEach((button) => {
  button.addEventListener("click", () => showDemoNotice());
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
    const roleEl = document.querySelector("#profile-role");
    if (avatar && nameInput) {
      avatar.textContent = user.avatar || 'S';
      nameInput.value = user.name || 'Steve';
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
      const roleEl = document.querySelector("#profile-role");

      if (avatar && nameInput) {
        avatar.textContent = user.avatar || 'S';
        nameInput.value = user.name || 'Steve';
      }
      if (roleEl) {
        roleEl.textContent = user.role || 'Administrateur';
      }

      // Set checkboxes based on preferences
      const localAccessCheckbox = document.querySelector('.privacy-option:nth-child(1) input[type="checkbox"]');
      const driveConnectionCheckbox = document.querySelector('.privacy-option:nth-child(2) input[type="checkbox"]');

      if (localAccessCheckbox && user.preferences) {
        localAccessCheckbox.checked = user.preferences.localAccess ?? true;
      }
      if (driveConnectionCheckbox && user.preferences) {
        driveConnectionCheckbox.checked = user.preferences.driveConnection ?? false;
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
    // Determine icon based on category or name
    let icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y9="9"/></svg>`;
    let iconClass = 'blue';
    if (eq.category === 'pompe') { icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`; iconClass = 'green'; }
    else if (eq.category === 'piscine') { icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/></svg>`; iconClass = 'violet'; }
    else if (eq.category === 'imprimante') { icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`; iconClass = 'cyan'; }
    else if (eq.category === 'assurance') { icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`; iconClass = 'amber'; }

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
    greetingName.innerHTML = `Bonjour ${user.name} <span aria-hidden="true">👋</span>`;
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

  // Update "À vérifier" section with event delegation
  const verifyPanel = document.querySelector('#view-accueil .verify-panel');
  if (verifyPanel) {
    verifyPanel.innerHTML = `
      <div class="section-heading">
        <h2 id="verify-title">À vérifier</h2>
        <button class="text-button" type="button" data-open-view="alertes">Voir tout</button>
      </div>
      ${alerts.map(alert => `
        <button class="verify-row" type="button" data-open-view="alertes" data-alert-type="${alert.type}">
          <span class="verify-icon ${alert.type}" aria-hidden="true">${getAlertIcon(alert.type)}</span>
          <div class="verify-info">
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
    detailContent.innerHTML = '<p class="error-state">Désolé, cet équipement n’existe pas ou a été supprimé.</p>';
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
                    <span class="doc-icon">📄</span>
                    <span class="doc-name">${docName}</span>
                    <span class="doc-arrow">›</span>
                  </button>
                `;
              }).join('')
            : '<p class="empty-docs">Aucun document lié pour cet équipement.</p>'}
        </div>
      </div>

      <div class="equipment-actions">
        <button class="context-action-button" type="button" data-demo-action>
          <span>✎</span> Modifier
        </button>
        <button class="context-action-button" type="button" data-demo-action>
          <span>＋</span> Lier un document
        </button>
        <button class="context-action-button" type="button" data-demo-action>
          <span>↻</span> Historique
        </button>
      </div>
    </div>
  `;

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
const firstRun = localStorage.getItem(onboardingCompleteKey) !== "true";
document.querySelector("#welcome-panel").hidden = !firstRun;
document.querySelector("#dashboard-content").hidden = firstRun;
document.querySelector("#view-accueil").setAttribute("aria-labelledby", firstRun ? "welcome-title" : "dashboard-title");
showView(Object.hasOwn(pageTitles, initialView) ? initialView : "accueil", { addHistory: false });
window.history.replaceState({ view: activeView }, "", `#${activeView}`);

// Render dashboard on load
if (!firstRun) {
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
function initAlertsView() {
  const alertList = document.querySelector('#alert-list');
  if (!alertList) return;

  // Add event listeners for filter tabs
  const tabs = document.querySelectorAll('.alert-filter-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-selected'));
      tab.classList.add('is-selected');
      renderAlerts(tab.dataset.filter);
    });
  });

  // Render initial alerts (default: à-traiter)
  renderAlerts('à-traiter');
}

/**
 * Render alerts based on filter
 */
function renderAlerts(filter) {
  const alertList = document.querySelector('#alert-list');
  if (!alertList) return;

  const alerts = getAlerts();

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
const savedFamily = loadFamilyState();
if (savedFamily && savedFamily.length > 0) {
  // Update the family state with saved data
  // Note: in a real module, we would handle this in state.js
  // This is a temporary fix for the demo prototype
  try {
    const stateModule = await import('./state.js');
    stateModule.default.family = savedFamily;
  } catch (e) {
    console.warn('Error loading family state:', e);
  }
}

// The house view must be initialized on page load
// Note: These calls are now moved to the end of the file to avoid ReferenceErrors

/**
 * Initialize house view
 */
function initHouseView() {
  renderEquipmentList();
  initCategoryTabs();
}

/**
 * Render family members list from state data
 */
function renderFamilyMembers() {
  const memberList = document.querySelector('#member-list');
  if (!memberList) return;

  const members = getFamilyMembers();
  const currentUser = getCurrentUser();

  if (members.length === 0) {
    memberList.innerHTML = '<p class="empty-state">Aucun membre de famille.</p>';
    return;
  }

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
  }).join('') + `
    <button class="member-card add-member" type="button" data-demo-action>
      <span class="add-member-icon">＋</span>
      <strong>Ajouter</strong>
      <span>Un proche</span>
    </button>
  `;
}

// Add event listener to the add-member button after rendering
function attachAddMemberListener() {
  const addBtn = document.querySelector('#member-list .add-member');
  if (!addBtn) return;
  addBtn.addEventListener('click', () => {
    // For now just alert; in real app would open a dialog to add a family member
    alert('Ajouter un nouveau membre (fonctionnalité en cours)');
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
 * Initialize import view (drag & drop and file selection)
 */
function initImportView() {
  const dropZone = document.querySelector('#drop-zone');
  const importInput = document.querySelector('#import-input');
  if (!dropZone || !importInput) return;

  dropZone.addEventListener('click', () => importInput.click());

  // Drag and drop handling
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // In a real app, files would be processed
      showDemoNotice(`Fichiers déposés : ${files.length}`);
      // Trigger file processing logic
    }
  });

  importInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      showDemoNotice(`Fichiers sélectionnés : ${files.length}`);
      // Trigger file processing logic
    }
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
    let sourceBadge = '✦';
    let sourceText = 'Démonstration';
    if (doc.driveSource) {
      sourceBadge = '☁️';
      sourceText = 'Google Drive';
    } else if (doc.driveDemo) {
      sourceBadge = '✦';
      sourceText = 'Démo';
    } else if (doc.isLocal) {
      sourceBadge = '💾';
      sourceText = doc.sourceDir && Capacitor.isNativePlatform() ? 'Stockage local' : 'Fichier local';
    }

    return `
      <div class="data-file-row">
        <div class="data-file-info">
          <span class="data-file-icon">${sourceBadge}</span>
          <div>
            <div class="data-file-name">${doc.name}</div>
            <div class="data-file-meta">${doc.type} · ${sourceText}</div>
          </div>
        </div>
        <div class="data-file-size">—</div>
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
      const dataToExport = uploadedDocuments.map(doc => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        date: doc.date,
        source: doc.driveSource ? 'google-drive' : (doc.driveDemo ? 'demo' : (doc.isLocal ? 'local' : 'unknown'))
      }));
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
    <div class="chat-avatar">✦</div>
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
          new Notification('📅 Famili-IA - Alerte', {
            body: `${alert.title} : ${alert.detail}`,
            icon: '/favicon.ico'
          });
        });
      }
    });
  } else if (Notification.permission === 'granted') {
    alerts.forEach(alert => {
      new Notification('📅 Famili-IA - Alerte', {
        body: `${alert.title} : ${alert.detail}`,
        icon: '/favicon.ico'
      });
    });
  }
}

// Démarrage du scheduler au chargement
startAlertScheduler();
