console.log("App script loaded");
import { buildSearchResponse, rankDocuments } from "./search-utils.js";
import { GoogleDriveClient, prepareDriveDocumentForIndex } from "./google-drive.js";
import { GoogleDriveSource } from "./google-drive-source.js";
import { countInventorySources, filterInventoryDocuments, filterSearchResultsByChips, getInventoryIndexStatus, getInventorySource, getInventoryTypeKey, isInventoryDocumentType, mergeInventoryDocuments } from "./data-inventory.js";
import { Capacitor } from "@capacitor/core";
import { parseDocument } from "./document-parser.js";
import { clearFamilyState, loadFamilyState } from "./family-storage.js";
import { initState, getCurrentUser, getFamilyMembers, getEquipmentByCategory, getEquipmentDetail, getAlerts, getDocuments, addDocument, deleteDocument, calculateAlertType, updateAlert, updateAlertNotificationPreferences, updatePrivacyConsent, updatePhotoLocationConsent, getFullState, addFamilyMember, addEquipment, updateEquipment, deleteEquipment, deleteFamilyMember, updateFamilyMember, updatePhotoAnnotations, resetState } from "./state.js";
import { redactPhotoLocationsForExport } from "./photo-metadata.js";
import { isPhotoDocument, normalizePhotoAnnotations } from "./photo-annotations.js";
import { MAX_PHOTO_FILE_SIZE } from "./photo-exif.js";
import { getPhotoThumbnailDataUrl } from "./photo-thumbnails.js";
import { getPhotoTimelineDateInfo, getTimelineDateLabel, groupPhotosForTimeline } from "./photo-timeline.js";
import { getAlertsToNotify, normalizeAlertNotificationPreferences } from "./alert-engine.js";
import { BackgroundSyncWorker } from "./background-sync.js";
import { IndexSession, INDEX_SOURCES } from "./index-session.js";
import { describeSources } from "./source-status.js";
import { describeExperimentalResult } from "./experimental-result.js";
import { findDocumentDuplicateCandidates } from "./document-deduplication.js";
import { findIndexDeadlines } from "./index-deadline-search.js";
import { createUnifiedIndexQuery, isWithinDateRange, mergeUnifiedIndexFilters } from "./unified-index-query.js";
import { ALERT_CATEGORIES, getAlertLevelForDate } from "./alert-engine.js";
import { OneDriveAuth } from "./onedrive-auth.js";
import { scanOneDrive } from "./onedrive-graph.js";
import {
  canRefreshOneDriveCopy, compareOneDriveCopy, describeOneDriveChanges, mergeOneDriveDocumentUpdate,
  oneDriveDocumentId, readOneDriveDocument
} from "./onedrive-document.js";
import { formatOneDriveAccountFingerprint, getOneDriveAccountFingerprint } from "./onedrive-account.js";

const activeScanWorkers = new Map();
let suspendPhotoThumbnailRendering = () => {};
let resumePhotoThumbnailRendering = () => {};
let renderUnifiedPhotoResults = () => {};
let replayOnboarding = false;

/**
 * Vérifie si l'onboarding est complet et retourne l'état.
 * Gère le cas où localStorage serait indisponible.
 * @returns {boolean} true si l'onboarding est complété, false sinon
 */
function isOnboardingComplete() {
  try {
    return localStorage.getItem(onboardingCompleteKey) === "true";
  } catch (e) {
    // localStorage unavailable - consider onboarding as not completed
    return false;
  }
}

/**
 * Affiche ou masque le wizard d'onboarding en fonction de l'état actuel.
 * Doit être appelé après que l'état de l'utilisateur soit connu.
 * @param {boolean} [show=false] - Forcer l'affichage/masquage (optionnel)
 */
function manageOnboardingWizardVisibility(show = false) {
  const wizard = document.querySelector("#onboarding-wizard");
  if (!wizard) return;

  const onboardingComplete = isOnboardingComplete();
  // Afficher le wizard UNIQUEMENT si :
  // 1. C'est la vue accueil ET
  // 2. L'onboarding n'est pas terminé
  const shouldShow = show || ((!onboardingComplete || replayOnboarding) && activeView === 'accueil');

  console.log('[DEBUG] manageOnboardingWizardVisibility:', {
    show,
    onboardingComplete,
    activeView,
    shouldShow,
    wizardCurrentlyHidden: wizard.hidden
  });

  wizard.hidden = !shouldShow;
}

/**
 * ⚠️ FONCTION CRITIQUE - ONBOARDING
 *
 * Initialise le wizard d'onboarding (Phase 13.1).
 * Configure les écouteurs d'événements et gère l'état initial.
 * Supporte le mode page blanche (.onboarding-page-white) ou incrusté dans l'accueil.
 *
 * ⚠️ DÉPENDANCES CRITIQUES - NE PAS APPELER AVANT :
 * - uploadedDocuments (ligne ~574) : DOIT être déclaré
 * - activeView (ligne ~1348) : DOIT être déclaré
 * - getCurrentUser() (state.js) : DOIT être disponible
 *
 * ⚠️ ORDRE D'APPEL REQUIS :
 * 1. Déclaration de toutes les variables globales
 * 2. await initState() (chargement données depuis IndexedDB)
 * 3. initOnboardingWizard() ← ICI SEULEMENT
 *
 * ⚠️ ERREUR CONNUE À ÉVITER :
 * ReferenceError: Cannot access 'activeView' before initialization
 * → Cause : Appel de cette fonction avant la ligne ~1348
 *
 * Voir documentation : docs/ONBOARDING_ARCHITECTURE.md
 */
function initOnboardingWizard() {
  console.log('[DEBUG] initOnboardingWizard - START');

  const wizard = document.querySelector("#onboarding-wizard");
  const steps = wizard ? wizard.querySelectorAll(".wizard-step") : [];
  const userNameInput = document.querySelector("#wizard-user-name");
  const startScanMode = document.querySelector('#start-scan-mode');
  const startOnboarding = document.querySelector('#start-onboarding');

  console.log('[DEBUG] initOnboardingWizard - wizard found:', !!wizard);
  console.log('[DEBUG] initOnboardingWizard - isOnboardingComplete:', isOnboardingComplete());
  console.log('[DEBUG] initOnboardingWizard - activeView:', activeView);
  console.log('[DEBUG] initOnboardingWizard - window.location.hash:', window.location.hash);
  console.log('[DEBUG] initOnboardingWizard - isMobile:', /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  // Détecter si on utilise le mode page blanche
  const isWhitePageMode = document.querySelector('#onboarding-wizard.onboarding-page-white') !== null;

  // Si l'onboarding est déjà complété, ne rien faire de plus
  if (isOnboardingComplete()) {
    console.log('[DEBUG] initOnboardingWizard - onboarding already complete, exiting');
    if (wizard) wizard.hidden = true;
  }

  // Fonction pour afficher une étape
  function showStep(stepIndex) {
    if (steps.length === 0) return;
    steps.forEach((step, idx) => {
      step.hidden = idx !== stepIndex;
    });
    const heading = steps[stepIndex]?.querySelector("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  // Navigation entre les étapes
  if (wizard) {
    wizard.querySelectorAll('[data-wizard-next]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const targetStep = parseInt(btn.dataset.wizardNext);

        // Sauvegarder les informations utilisateur avant de passer à l'étape 2 (choix du parcours)
        // Étape 1 -> Saisie prénom optionnel
        if (userNameInput && targetStep === 2) {
          const name = userNameInput.value.trim();

          // Le prénom est optionnel, pas de validation bloquante
          const greetingSpan = document.querySelector('#wizard-user-greeting');
          const greeting = document.querySelector('#wizard-greeting');
          greetingSpan.textContent = name;
          greeting.hidden = !name;
        }

        if (targetStep === 3) {
          startDemoGuide();
        }

        showStep(targetStep);
        manageOnboardingWizardVisibility(); // Mise à jour de la visibilité
      });
    });

    wizard.querySelectorAll('[data-wizard-prev]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetStep = parseInt(btn.dataset.wizardPrev);
        showStep(targetStep);
        manageOnboardingWizardVisibility(); // Mise à jour de la visibilité
      });
    });
  }

  // Bouton "Découvrir Famili-IA" - va de l'écran 1 à l'écran 2
  if (startOnboarding) {
    startOnboarding.addEventListener('click', () => {
      showStep(1);
      manageOnboardingWizardVisibility();
    });
  }

  // Entrée dans le champ prénom = « Continuer »
  if (userNameInput) {
    userNameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      wizard.querySelector('#step-1 [data-wizard-next="2"]').click();
    });
  }
  // Bouton "Passer cette étape" - saute directement à l'étape 2
  const skipPersonalization = document.querySelector('#skip-personalization');
  if (skipPersonalization) {
    skipPersonalization.addEventListener('click', () => {
      userNameInput.value = "";
      document.querySelector('#wizard-user-greeting').textContent = "";
      document.querySelector('#wizard-greeting').hidden = true;
      showStep(2);
      manageOnboardingWizardVisibility();
    });
  }

  if (startScanMode) {
    startScanMode.addEventListener('click', async () => {
      // Sauvegarder le prénom s'il a été saisi (facultatif)
      if (userNameInput) {
        const name = userNameInput.value.trim();
        if (name) {
          const user = getCurrentUser();
          if (user) user.name = name;
        }
      }

      await launchIntelligentScan();
    });
  }

  document.querySelector('#finish-onboarding-demo').addEventListener('click', () => {
    if (!isOnboardingComplete()) completeOnboarding();
    replayOnboarding = false;
    manageOnboardingWizardVisibility();
    showView('accueil');
    document.querySelector('#dashboard-title').focus();
  });

  // Écouteurs pour les questions de démo préremplies (Écran 4)
  const demoQuestions = document.querySelectorAll('.demo-question');
  demoQuestions.forEach(button => {
    button.addEventListener('click', (e) => {
      const questionType = e.currentTarget.dataset.demoQuestion;
      handleDemoQuestion(questionType);
      if (demoGuideStep === 1) {
        setDemoGuideStep(2);
        document.querySelector('#demo-result-heading').focus();
      }
    });
  });
  document.querySelector('#demo-guide-next').addEventListener('click', () => {
    if (demoGuideStep === 1) {
      setDemoGuideStep(2);
      document.querySelector('#demo-result-heading').focus();
    } else if (demoGuideStep === 2) {
      setDemoGuideStep(3);
    } else {
      setDemoGuideStep(0);
      document.querySelector('#demo-guide-restart').focus();
    }
  });
  document.querySelector('#demo-guide-prev').addEventListener('click', () => {
    if (demoGuideStep === 3) {
      setDemoGuideStep(2);
      document.querySelector('#demo-result-heading').focus();
      return;
    }
    setDemoGuideStep(1);
    document.querySelector('.demo-question[aria-pressed="true"]').focus();
  });
  document.querySelector('#demo-guide-skip').addEventListener('click', () => {
    setDemoGuideStep(0);
    document.querySelector('#demo-guide-restart').focus();
  });
  document.querySelector('#demo-guide-restart').addEventListener('click', () => {
    setDemoGuideStep(1);
    document.querySelector('#demo-guide-next').focus();
  });

  /**
   * Lance le scan intelligent local (Phase 13.3.a)
   * Utilise le BackgroundSyncWorker pour scanner les dossiersDocuments et Téléchargements
   */
  async function launchIntelligentScan() {
    // Si on est sur le web, demander de choisir un dossier manuellement
    if (!Capacitor.isNativePlatform() && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();

        replayOnboarding = false;
        completeOnboarding();
        manageOnboardingWizardVisibility();
        showView("accueil");

        // S'assurer que la barre de progression est visible DÈS LE DÉPART
        // et restera affichée pendant que le scan tourne en tâche de fond
        const container = document.querySelector("#scan-progress-container");
        const fill = document.querySelector("#scan-progress-fill");
        const text = document.querySelector("#scan-progress-text");
        if (container) {
          container.hidden = false;
          container.style.display = "block";
          container.style.opacity = "1";
          container.style.zIndex = "3000";
        }
        if (fill) fill.style.width = "0%";
        if (text) text.textContent = "Initialisation du scan...";

        if (!startBackgroundScan([dirHandle])) return;
        showDemoNotice("Scan intelligent démarré sur le dossier choisi.");

        // S'assurer que la barre reste visible après le changement de vue
        setTimeout(() => {
          if (container) {
            container.hidden = false;
            container.style.display = "block";
            container.style.opacity = "1";
            container.style.zIndex = "3000";
          }
        }, 100);
        return;
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.error("Impossible d'ouvrir le dossier sélectionné :", err);
          showDemoNotice("Le dossier n'a pas pu être ouvert. Vous pouvez réessayer ou choisir la démo.");
        }
        return;
      }
    }

    if (!localFilesInput) {
      showDemoNotice("Le sélecteur de fichiers n'est pas disponible dans cette version.");
      return;
    }

    replayOnboarding = false;
    completeOnboarding();
    manageOnboardingWizardVisibility();
    showView("accueil");
    showDemoNotice("Choisissez les photos ou documents à analyser sur votre appareil.");
    localFilesInput.click();
  }

  // Initialiser à l'étape 1
  showStep(0);
  manageOnboardingWizardVisibility(); // Rendre le wizard visible
}

// Initialisation asynchrone de l'application
(async () => {
  console.log('[DEBUG] Async init - START');
  console.log('[DEBUG] Async init - About to call initState()');
  try {
    // Ajouter un timeout de 5 secondes sur initState pour éviter le blocage infini
    const initStatePromise = initState();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('initState() timeout after 5s')), 5000)
    );

    const stateResult = await Promise.race([initStatePromise, timeoutPromise]);
    console.log('[DEBUG] Async init - initState done, result:', stateResult);

    console.log('[DEBUG] Async init - About to load documents');
    uploadedDocuments.push(...getDocuments());
    const restored = await Promise.all(uploadedDocuments.map(async doc => {
      try {
        return await experimentalIndex.restoreDocumentContent(doc);
      } catch (error) {
        console.error("Impossible de vérifier la provenance d'un document :", error);
        return "invalid";
      }
    }));
    const invalidCount = restored.filter(status => status === "invalid").length;
    restored.forEach((status, index) => {
      if (status === "invalid") invalidContentProvenance.add(uploadedDocuments[index]);
    });
    if (invalidCount) {
      console.warn(`Recherche : provenance du contenu invalide pour ${invalidCount} document(s) ; noms uniquement.`);
    }
    refreshExperimentalIndex();
    console.log('[DEBUG] Async init - documents loaded, count:', uploadedDocuments.length);
    if (activeView === 'vos-donnees') renderDataInventory(parseHash().params);
    startAlertScheduler();
    if (activeView === 'alertes') initAlertsView(parseHash().params);
    if (activeView === 'maison') initHouseView(parseHash().params);
    if (activeView === 'famille') initFamilyView();
    if (activeView === 'detail') initEquipmentDetailView(parseHash().params.id);
    if (activeView === 'profil') initProfileView();
    if (activeView === 'plus') renderPlusBadges();
    if (activeView === 'accueil') renderAccueilDashboard();
    if (activeView === 'assistant') refreshAssistantContext();

    console.log('[DEBUG] Async init - About to init dialogs');
    initEquipmentDialog();
    initAddMemberDialog();
    initPhotoAnnotationsDialog();
    initPhotoDetailsDialog();
    renderUnifiedPhotoResults = initUnifiedPhotoResults();
    console.log('[DEBUG] Async init - dialogs initialized');

    // Initialiser l'onboarding wizard si ce n'est pas déjà fait
    console.log('[DEBUG] Async init - about to call initOnboardingWizard');
    initOnboardingWizard();
    console.log('[DEBUG] Async init - initOnboardingWizard called');

    // === Mise à jour de l'UI Mode Démo (Phase 13.2.b.3) ===
    console.log('[DEBUG] Async init - Updating demo mode UI');
    updateDemoModeUI();
    updateSuggestionsUI();

    // Rendre la fonction de progression accessible aux callbacks
    window.updateScanProgressUI = updateScanProgressUI;

    // Lancement du scan auto si activé dans les préférences
    const user = getCurrentUser();
    if (user && user.preferences && user.preferences.enableAutoScan) {
      startBackgroundScan(user.preferences.scanDirectories || []);
    }
    console.log('[DEBUG] Async init - COMPLETE');
  } catch (error) {
    console.error('[DEBUG] Async init - ERROR:', error);
    console.error('[DEBUG] Async init - ERROR stack:', error.stack);
    // IMPORTANT: Même en cas d'erreur, initialiser l'onboarding
    console.log('[DEBUG] Async init - Fallback: initializing onboarding despite error');
    try {
      initOnboardingWizard();
      console.log('[DEBUG] Async init - Fallback onboarding init successful');
    } catch (e2) {
      console.error('[DEBUG] Async init - Fallback onboarding init FAILED:', e2);
    }
  }
})();

/**
 * Met à jour l'affichage de l'interface en fonction du mode démo actif (Phase 13.2.b.3)
 */
function updateDemoModeUI() {
  const isDemo = getFullState().isDemoMode;
  const demoBadge = document.querySelector("#demo-badge");
  const demoWelcomeBanner = document.querySelector("#demo-welcome-banner");

  if (demoBadge) demoBadge.hidden = !isDemo;
  if (demoWelcomeBanner) demoWelcomeBanner.hidden = !isDemo;
}

/**
 * Met à jour les suggestions sur l'écran de recherche (Phase 13.2.c).
 * En mode démo, affiche des suggestions liées aux documents fictifs.
 * En mode normal, affiche les suggestions par défaut.
 */
function updateSuggestionsUI() {
  const isDemo = getFullState().isDemoMode;
  const suggestionsList = document.querySelector(".suggestion-list");
  const suggestions = document.querySelectorAll(".suggestion");

  if (!suggestionsList || !suggestions) return;

  if (isDemo) {
    // En mode démo, afficher les suggestions par défaut (qui font référence aux docs fictifs)
    suggestionsList.hidden = false;
    suggestions.forEach((suggestion, idx) => {
      suggestion.hidden = false;
    });
  } else {
    // En mode normal, masquer les suggestions ou les laisser tels quels
    suggestionsList.hidden = true;
    suggestions.forEach((suggestion) => {
      suggestion.hidden = true;
    });
  }
}

/**
 * Met à jour la visibilité des boutons de gestion de fichiers en fonction de la vue actuelle et de la présence de fichiers.
 */
function updateClearFilesButtonsVisibility() {
  const hasFiles = uploadedDocuments.length > 0;
  const isDataView = activeView === 'vos-donnees';

  if (clearFilesButton) clearFilesButton.hidden = !(hasFiles && isDataView);
  if (disconnectGoogleDriveButton) disconnectGoogleDriveButton.hidden = !(isDataView && googleDriveClient?.hasAccessToken);
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

    const existingEquipment = id ? getEquipmentDetail(id) : null;
    const equipment = {
      ...existingEquipment,
      id: id || `eq-${Date.now()}`,
      name,
      category,
      status,
      docs: existingEquipment?.docs || []
    };

    try {
      if (id) {
        if (!existingEquipment) throw new Error("Cet équipement n'existe plus.");
        await updateEquipment(equipment);
        showDemoNotice(`Équipement mis à jour : ${name}`);
      } else {
        await addEquipment(equipment);
        showDemoNotice(`Équipement ajouté : ${name}`);
      }
    } catch (error) {
      console.error("Impossible d'enregistrer l'équipement :", error);
      document.querySelector('#equipment-form-status').textContent = error.message;
      return;
    }

    dialog.close();
    initHouseView(parseHash().params);
    if (activeView === 'detail') {
      initEquipmentDetailView(equipment.id);
      document.querySelector('#edit-equipment').focus();
    } else {
      document.querySelector('#add-equipment-btn').focus();
    }
  });
}

function openEquipmentForm(equipment = null) {
  const dialog = document.querySelector('#equipment-dialog');
  document.querySelector('#equipment-dialog-title').textContent = equipment ? 'Modifier un équipement' : 'Ajouter un équipement';
  document.querySelector('#equipment-form-status').textContent = '';
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
    summary: "La facture d'installation de la piscine indique un montant total de 8 900 euros TTC, réglé le 4 mars 2023.",
    content: "AQUA JARDIN — FACTURE\nNuméro de facture : AJ-2023-0318\nDate : 4 mars 2023\nObjet : Installation d'une piscine familiale\nMontant total : 8 900 euros TTC\nStatut : Réglée\n\nExemple fictif créé pour le prototype Famili-IA."
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
    summary: "La facture de la Bambu Lab A1 porte le numéro BL-2025-10482. Le montant indiqué est de 449 euros TTC.",
    content: "BAMBU STORE — FACTURE\nNuméro de facture : BL-2025-10482\nDate : 10 février 2025\nArticle : Imprimante Bambu Lab A1\nMontant : 449 euros TTC\nStatut : Réglée\n\nExemple fictif créé pour le prototype Famili-IA."
  },
  {
    id: "habitation-contrat",
    name: "Contrat - Assurance habitation.pdf",
    type: "Contrat",
    date: "1 janvier 2025",
    keywords: "contrat assurance habitation échéance termine fin renouvellement date",
    summary: "Le contrat d'assurance habitation arrive à échéance le 31 décembre 2025. La reconduction est prévue à cette date, sauf résiliation.",
    content: "ASSURANCE DEMO — CONTRAT HABITATION\nNuméro de contrat : HAB-2025-7204\nDate d'effet : 1er janvier 2025\nÉchéance annuelle : 31 décembre 2025\nReconduction : tacite, sauf résiliation\n\nExemple fictif créé pour le prototype Famili-IA."
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

const uploadedDocuments = [];
const experimentalIndex = new IndexSession();
const invalidContentProvenance = new WeakSet();
let driveSelectionGeneration = 0;
let driveSelectionSettled = null;
let removingSessionFiles = false;
const form = document.querySelector("#experimental-index-form");
const input = document.querySelector("#experimental-index-query");
const experimentalIndexForm = form;
const experimentalIndexQuery = input;
const experimentalIndexSource = document.querySelector("#experimental-index-source");
const experimentalIndexType = document.querySelector("#experimental-index-type");
const experimentalIndexCoverage = document.querySelector("#experimental-index-coverage");
const experimentalIndexDateType = document.querySelector("#experimental-index-date-type");
const experimentalIndexDateFrom = document.querySelector("#experimental-index-date-from");
const experimentalIndexDateTo = document.querySelector("#experimental-index-date-to");
const experimentalIndexPerson = document.querySelector("#experimental-index-person");
const experimentalIndexPlace = document.querySelector("#experimental-index-place");
const experimentalIndexStatus = document.querySelector("#experimental-index-status");
const experimentalIndexResults = document.querySelector("#experimental-index-results");
const experimentalSourceStatus = document.querySelector("#experimental-source-status");
const deadlineStatus = document.querySelector("#experimental-deadline-status");
const deadlineResults = document.querySelector("#experimental-deadline-results");
const deadlineReview = document.querySelector("#experimental-deadline-review");
const deadlineReviewList = document.querySelector("#experimental-deadline-review-list");
let experimentalQuery = "";
let driveObservation = "unknown";
let localImportFailed = false;
let oneDriveObservation = "unknown";
let oneDriveAccountFingerprint = null;

function updateExperimentalFacet(select, defaultLabel, entries) {
  const selected = select.value;
  const options = [{ value: "", label: defaultLabel }, ...entries];
  select.replaceChildren(...options.map(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }));
  if (options.some(option => option.value === selected)) select.value = selected;
}

function refreshExperimentalFacets(records) {
  const membersById = new Map(getFamilyMembers().map(member => [member.id, member]));
  const people = new Map();
  const places = new Set();
  for (const record of records) {
    for (const field of record.fields) {
      if (field.name === "personIds") {
        for (const id of field.value.split(",").map(value => value.trim()).filter(Boolean)) {
          people.set(id, membersById.get(id)?.name || "Membre associé");
        }
      } else if (field.name === "place") {
        places.add(field.value);
      }
    }
  }
  updateExperimentalFacet(experimentalIndexPerson, "Toutes les personnes",
    [...people].sort((a, b) => a[1].localeCompare(b[1], "fr"))
      .map(([value, label]) => ({ value, label })));
  updateExperimentalFacet(experimentalIndexPlace, "Tous les lieux",
    [...places].sort((a, b) => a.localeCompare(b, "fr"))
      .map(value => ({ value, label: value })));
}

function getExperimentalIndexFilters() {
  return Object.fromEntries([
    ["sourceId", experimentalIndexSource.value],
    ["type", experimentalIndexType.value],
    ["coverage", experimentalIndexCoverage.value],
    ["dateType", experimentalIndexDateType.value],
    ["dateFrom", experimentalIndexDateFrom.value],
    ["dateTo", experimentalIndexDateTo.value],
    ["personId", experimentalIndexPerson.value],
    ["place", experimentalIndexPlace.value]
  ].filter(([, value]) => value));
}

function getUnifiedIndexSearchRequest(query) {
  const photos = mergeInventoryDocuments(uploadedDocuments, getDocuments()).filter(isPhotoDocument);
  return createUnifiedIndexQuery(query, { members: getFamilyMembers(), photos });
}

function getPhotoQueryClarification(reason) {
  const messages = {
    "person-required": "Précisez le membre de la famille concerné.",
    "person-ambiguous": "Plusieurs personnes correspondent. Précisez le prénom ou vérifiez les profils.",
    "birth-date-required": "La date de naissance de cette personne manque dans les profils ; renseignez-la pour rechercher par âge.",
    "year-required": "Précisez l'année pour compléter cette période.",
    "invalid-date": "La date indiquée n'est pas valide.",
    "invalid-birth-date": "La date de naissance indiquée n'est pas valide.",
    "age-out-of-range": "L'âge demandé dépasse la plage de dates prise en charge.",
    "place-ambiguous": "Plusieurs lieux correspondent. Précisez le lieu ou vérifiez les annotations.",
    "event-ambiguous": "Plusieurs événements correspondent. Précisez l'événement ou vérifiez les annotations.",
    "season-ambiguous": "Précisez une seule saison."
  };
  return messages[reason] || "Une précision est nécessaire pour interpréter cette recherche photo.";
}

let oneDriveScanController = null;
let oneDriveScanSettled = null;

function sourceName(sourceId) {
  return sourceId === "drive" ? "Google Drive" : sourceId === "onedrive" ? "OneDrive" : "Local";
}

function renderExperimentalSources() {
  const statuses = describeSources(experimentalIndex.getAllRecords(), {
    driveConfigured: Boolean(googleDriveClient),
    driveToken: Boolean(googleDriveClient?.hasAccessToken),
    driveState: driveObservation,
    localState: activeScanWorkers.size ? "working" : localImportFailed ? "error" : "unknown",
    oneDriveState: oneDriveObservation
  });
  experimentalSourceStatus.replaceChildren();
  for (const status of statuses) {
    const item = document.createElement("li");
    const name = sourceName(status.sourceId);
    const accountContext = status.sourceId === "onedrive" && oneDriveAccountFingerprint
      ? ` Compte actuellement connecté (empreinte locale) : ${formatOneDriveAccountFingerprint(oneDriveAccountFingerprint)}.`
      : "";
    item.textContent = `${name} : ${status.message} ${status.access} ${status.scope}${accountContext} Le périmètre total et la fraîcheur sont inconnus.`;
    experimentalSourceStatus.appendChild(item);
  }
  deadlineResults.querySelectorAll("[data-deadline-source]").forEach(element => {
    const source = statuses.find(status => status.sourceId === element.dataset.deadlineSource);
    element.textContent = source?.access || "Accès actuel à l'original inconnu.";
  });
  return statuses;
}

function findExperimentalDocument(sourceId, itemId) {
  for (let i = uploadedDocuments.length - 1; i >= 0; i -= 1) {
    const doc = uploadedDocuments[i];
    if (doc.id === itemId && getInventorySource(doc) === sourceId) return doc;
  }
  return undefined;
}

function addDeadlineCopyAction(item, sourceId, itemId) {
  const sourceDocument = findExperimentalDocument(sourceId, itemId);
  if (!sourceDocument || typeof sourceDocument.content !== "string" || !sourceDocument.content.trim()) {
    addTextElement(item, "p", "", "Copie textuelle indisponible dans Famili-IA.");
    return;
  }
  const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", "Voir la copie dans Famili-IA");
  button.type = "button";
  button.addEventListener("click", () => {
    const current = findExperimentalDocument(sourceId, itemId);
    if (!current || typeof current.content !== "string" || !current.content.trim()) {
      refreshExperimentalIndex();
      deadlineStatus.textContent = "Cette copie n'est plus disponible dans Famili-IA.";
      return;
    }
    openSource(current);
  });
}

function renderExperimentalDeadlines(sourceStatuses) {
  const now = new Date();
  const referenceDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const result = findIndexDeadlines(experimentalIndex, referenceDate, 90);
  deadlineResults.replaceChildren();
  deadlineReviewList.replaceChildren();
  for (const candidate of result.candidates) {
    const item = document.createElement("li");
    item.className = "experimental-result";
    addTextElement(item, "h3", "experimental-result-name", candidate.name || "Nom inconnu");
    addTextElement(item, "p", "", `Source : ${sourceName(candidate.sourceId)}`);
    const deadlineLabel = candidate.estimated ? "Échéance estimée" : "Échéance proposée";
    addTextElement(item, "p", "", `${deadlineLabel} : ${candidate.dueDate} · dans ${candidate.daysUntil} jour(s) · à confirmer`);
    addTextElement(item, "p", "search-evidence", `Extrait : « ${candidate.proof.excerpt} »${candidate.proof.location ? ` (${candidate.proof.location})` : ""}`);
    const access = sourceStatuses.find(status => status.sourceId === candidate.sourceId);
    const accessElement = addTextElement(item, "p", "", access?.access || "Accès actuel à l'original inconnu.");
    accessElement.dataset.deadlineSource = candidate.sourceId;
    addTextElement(item, "p", "", "Couverture : texte partiellement recherché ; fraîcheur inconnue.");
    addDeadlineCopyAction(item, candidate.sourceId, candidate.itemId);
    addDeadlineAlertAction(item, candidate);
    deadlineResults.appendChild(item);
  }
  for (const entry of result.needReview) {
    const item = document.createElement("li");
    item.className = "experimental-result";
    addTextElement(item, "p", "", `${entry.name || "Nom inconnu"} · ${sourceName(entry.sourceId)} · ${entry.reason}`);
    addDeadlineCopyAction(item, entry.sourceId, entry.itemId);
    deadlineReviewList.appendChild(item);
  }
  deadlineReview.hidden = result.needReview.length === 0;
  deadlineStatus.textContent = `${result.candidates.length} proposition(s) à vérifier ; ${result.outsidePeriod} échéance(s) détectée(s) hors période ; ${result.needReview.length} document(s) à vérifier.`;
  if (result.ineligible.length) deadlineStatus.textContent += ` ${result.ineligible.length} échéance(s) non admissible(s).`;
}

function addDeadlineAlertAction(item, candidate) {
  const document = findExperimentalDocument(candidate.sourceId, candidate.itemId);
  const matchingStoredDocuments = getDocuments().filter(entry => entry.id === candidate.itemId);
  const proofLines = candidate.proof.excerpt.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean);
  if (!document || matchingStoredDocuments.length !== 1 ||
      getInventorySource(matchingStoredDocuments[0]) !== candidate.sourceId ||
      typeof document.content !== "string" ||
      !proofLines.length ||
      !proofLines.every(proofLine => document.content.split(/\r\n|\n|\r/).some(line => line.trim() === proofLine))) {
    addTextElement(item, "p", "", "Alerte non disponible : copie persistée ou preuve inchangée introuvable.");
    return;
  }

  const storedDocument = matchingStoredDocuments[0];
  const parsedType = parseDocument(storedDocument.content, storedDocument.name || storedDocument.originalName || "").type;
  const documentType = ALERT_CATEGORIES.includes(storedDocument.alertType)
    ? storedDocument.alertType
    : ALERT_CATEGORIES.includes(parsedType) ? parsedType : null;
  if (!documentType) {
    addTextElement(item, "p", "", "Alerte non disponible : catégorie prise en charge non déterminée.");
    return;
  }
  const level = getAlertLevelForDate(candidate.dueDate, documentType);
  if (level !== "amber" && level !== "red") {
    addTextElement(item, "p", "", `Alerte non encore admissible pour cette échéance de type ${documentType}.`);
    return;
  }

  const buttonLabel = candidate.estimated
    ? "Confirmer l’estimation et créer l’alerte"
    : "Confirmer la date et créer l’alerte";
  const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", buttonLabel);
  button.type = "button";
  button.addEventListener("click", async () => {
    const currentDocuments = getDocuments().filter(entry => entry.id === candidate.itemId);
    const current = currentDocuments[0];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const currentProposal = findIndexDeadlines(experimentalIndex, today, 90).candidates
      .find(entry => entry.sourceId === candidate.sourceId && entry.itemId === candidate.itemId);
    if (currentDocuments.length !== 1 || !current ||
        getInventorySource(current) !== candidate.sourceId ||
        current.content !== document.content ||
        !current.content ||
        !proofLines.every(proofLine => current.content.split(/\r\n|\n|\r/).some(line => line.trim() === proofLine)) ||
        !currentProposal || currentProposal.dueDate !== candidate.dueDate ||
        currentProposal.estimated !== candidate.estimated ||
        currentProposal.proof.excerpt !== candidate.proof.excerpt) {
      deadlineStatus.textContent = "Cette proposition a changé ou sa copie n’est plus disponible ; actualisez et vérifiez-la à nouveau.";
      refreshExperimentalIndex();
      return;
    }

    const confirmedType = ALERT_CATEGORIES.includes(current.alertType)
      ? current.alertType
      : parseDocument(current.content, current.name || current.originalName || "").type;
    const confirmedLevel = getAlertLevelForDate(candidate.dueDate, confirmedType, now);
    if (!ALERT_CATEGORIES.includes(confirmedType) || (confirmedLevel !== "amber" && confirmedLevel !== "red")) {
      deadlineStatus.textContent = "Cette date ne remplit plus les conditions du moteur d’alertes ; aucune alerte n’a été créée.";
      refreshExperimentalIndex();
      return;
    }
    if (!window.confirm(
      `${candidate.estimated
        ? `Confirmer l’estimation calculée de l’échéance au ${candidate.dueDate} (${confirmedType}) ?\n\n` +
          "Cette date est calculée à partir de la date d’achat et de la durée de garantie. Vérifiez les deux preuves avant de confirmer.\n\n"
        : `Confirmer l’échéance du ${candidate.dueDate} (${confirmedType}) ?\n\n`}` +
      `Preuve : « ${candidate.proof.excerpt} »\n` +
      `Source : ${sourceName(candidate.sourceId)}\n\n` +
      "Cela enregistre votre confirmation dans Famili-IA et crée une alerte, selon vos préférences de notification. L’original dans la source ne sera pas modifié."
    )) {
      deadlineStatus.textContent = "Échéance laissée en proposition ; aucune alerte ni notification n’a été créée.";
      return;
    }

    try {
      const confirmedDocument = {
        ...current,
        alertType: confirmedType,
        expiryDate: candidate.dueDate,
        expiryDateEvidence: candidate.proof.excerpt,
        expiryDateSource: "user",
        alertSourceId: candidate.sourceId
      };
      await addDocument(confirmedDocument);
      const uploadedIndex = uploadedDocuments.findIndex(entry =>
        entry.id === candidate.itemId && getInventorySource(entry) === candidate.sourceId);
      if (uploadedIndex !== -1) uploadedDocuments[uploadedIndex] = confirmedDocument;
      const restoreStatus = await experimentalIndex.restoreDocumentContent(confirmedDocument);
      if (restoreStatus !== "verified") {
        throw new Error("La provenance du contenu n’a pas pu être revérifiée après l’enregistrement.");
      }
      refreshExperimentalIndex();
      deadlineStatus.textContent = "Échéance confirmée et alerte créée dans Famili-IA ; la preuve et la source sont conservées.";
    } catch (error) {
      console.error("Impossible de confirmer l'échéance et de créer l'alerte.", error);
      deadlineStatus.textContent = `Échec de l'enregistrement de l'alerte : ${error instanceof Error ? error.message : "erreur non détaillée"}`;
    }
  });
}

function refreshExperimentalIndex() {
  document.querySelector('#reset-empty-search').hidden = true;
  try {
    experimentalIndex.syncDocuments(uploadedDocuments);
    const sourceStatuses = renderExperimentalSources();
    try {
      renderExperimentalDeadlines(sourceStatuses);
    } catch (error) {
      console.error("Impossible de calculer les propositions d'échéances :", error);
      deadlineResults.replaceChildren();
      deadlineReviewList.replaceChildren();
      deadlineReview.hidden = true;
      deadlineStatus.textContent = `Propositions d'échéances indisponibles : ${error instanceof Error ? error.message : "Erreur non détaillée"}`;
    }
    experimentalIndexResults.replaceChildren();
    const records = experimentalIndex.getAllRecords();
    refreshExperimentalFacets(records);
    const selectedFilters = getExperimentalIndexFilters();
    const selectedFilterCount = Object.keys(selectedFilters).length;
    document.querySelector('#search-filter-count').textContent = selectedFilterCount ? `(${selectedFilterCount})` : '';
    document.querySelector('#search-start').hidden = Boolean(experimentalQuery.trim() || selectedFilterCount);
    if (!experimentalQuery.trim() && Object.keys(selectedFilters).length === 0) {
      renderUnifiedPhotoResults([], { kind: "empty" });
      experimentalIndexStatus.textContent = "";
      return;
    }
    const request = getUnifiedIndexSearchRequest(experimentalQuery);
    if (request.kind === "clarification") {
      renderUnifiedPhotoResults([], request);
      experimentalIndexStatus.textContent = getPhotoQueryClarification(request.clarificationReason);
      return;
    }
    if (request.profileMismatch) {
      renderUnifiedPhotoResults([], { kind: "clarification" });
      experimentalIndexStatus.textContent = "L'année de naissance indiquée ne correspond pas au profil enregistré. Vérifiez le profil familial ou reformulez la recherche par âge.";
      return;
    }
    const filters = mergeUnifiedIndexFilters(request.filters, selectedFilters);
    if (!filters) {
      renderUnifiedPhotoResults([], { kind: "clarification" });
      experimentalIndexStatus.textContent = "Les filtres interprétés et les filtres choisis se contredisent. Modifiez l'un d'eux puis relancez la recherche.";
      return;
    }
    let matches = experimentalIndex.search(request.query, filters);
    const matchKey = ({ sourceId, itemId }) => JSON.stringify([sourceId, itemId]);
    const documentsByMatch = new Map(matches.map(match =>
      [matchKey(match), findExperimentalDocument(match.sourceId, match.itemId)]
    ));
    if (request.importDateRange) {
      matches = matches.filter(match => isWithinDateRange(
        documentsByMatch.get(matchKey(match))?.importedAt,
        request.importDateRange
      ));
    }
    const photoMatches = matches.filter(match =>
      isPhotoDocument(documentsByMatch.get(matchKey(match)))
    );
    const documentMatches = matches.filter(match =>
      !isPhotoDocument(documentsByMatch.get(matchKey(match)))
    );
    renderUnifiedPhotoResults(photoMatches, request, documentsByMatch);
    const matchedKeys = new Set(documentMatches.map(matchKey));
    const duplicateDocuments = uploadedDocuments
      .map(document => ({ ...document, sourceId: INDEX_SOURCES[getInventorySource(document)] }))
      .filter(document => document.sourceId);
    const duplicateCandidates = findDocumentDuplicateCandidates(duplicateDocuments);
    const duplicatePairs = [...duplicateCandidates.exactDuplicates, ...duplicateCandidates.possibleDuplicates]
      .filter(pair => matchedKeys.has(matchKey(pair.first)) && matchedKeys.has(matchKey(pair.second)));
    const renderedKeys = new Set();
    const renderMatch = (match, tagName = "li") => {
      const item = document.createElement(tagName);
      const sourceDocument = documentsByMatch.get(matchKey(match));
      const record = records.find(entry => entry.sourceId === match.sourceId && entry.itemId === match.itemId);
      const sourceAccess = sourceStatuses.find(status => status.sourceId === match.sourceId)?.access;
      const result = describeExperimentalResult(match, record, sourceDocument, sourceAccess);
      item.className = "experimental-result";
      addTextElement(item, "h3", "experimental-result-name", result.name);
      for (const detail of result.details) addTextElement(item, "p", "", detail);
      for (const reason of result.reasons) addTextElement(item, "p", "search-evidence", reason);
      if (result.canViewCopy) {
        const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", "Voir la copie dans Famili-IA");
        button.type = "button";
        button.addEventListener("click", () => {
          const current = findExperimentalDocument(match.sourceId, match.itemId);
          if (!current || typeof current.content !== "string" || !current.content.trim()) {
            refreshExperimentalIndex();
            experimentalIndexStatus.textContent = "Cette copie n'est plus disponible dans Famili-IA.";
            return;
          }
          openSource(current);
        });
      } else {
        addTextElement(item, "p", "", "Copie textuelle indisponible dans Famili-IA.");
      }
      if (sourceDocument && isPhotoDocument(sourceDocument)) {
        const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", "Voir le détail de la photo");
        button.type = "button";
        button.addEventListener("click", () => {
          const current = findExperimentalDocument(match.sourceId, match.itemId);
          if (!current || !isPhotoDocument(current)) {
            refreshExperimentalIndex();
            experimentalIndexStatus.textContent = "Cette photo n'est plus disponible dans Famili-IA.";
            return;
          }
          openPhotoDetailsDialog(current);
        });
      }
      return item;
    };
    for (const match of documentMatches) {
      const key = matchKey(match);
      if (renderedKeys.has(key)) continue;
      const duplicatePair = duplicatePairs.find(pair => {
        const firstKey = matchKey(pair.first);
        const secondKey = matchKey(pair.second);
        return (firstKey === key && !renderedKeys.has(secondKey)) ||
          (secondKey === key && !renderedKeys.has(firstKey));
      });
      if (!duplicatePair) {
        experimentalIndexResults.appendChild(renderMatch(match));
        renderedKeys.add(key);
        continue;
      }

      const group = document.createElement("li");
      group.className = "experimental-result-duplicate-group";
      const exact = duplicatePair.match === "content-hash";
      addTextElement(group, "h3", "", exact
        ? "Doublon probable — empreinte identique"
        : "Rapprochement à vérifier — nom normalisé identique");
      addTextElement(group, "p", "", "Copies et sources conservées séparément ; aucune fusion n'a été effectuée.");
      for (const identity of [duplicatePair.first, duplicatePair.second]) {
        const pairedMatch = documentMatches.find(candidate => matchKey(candidate) === matchKey(identity));
        if (!pairedMatch) continue;
        group.appendChild(renderMatch(pairedMatch, "div"));
        renderedKeys.add(matchKey(pairedMatch));
      }
      experimentalIndexResults.appendChild(group);
    }
    experimentalIndexStatus.textContent = matches.length
      ? `${matches.length} résultat${matches.length === 1 ? "" : "s"} dans les fichiers présents dans Famili-IA.`
      : "Aucun résultat dans les données recherchées ; certains textes ne sont pas disponibles et d'autres fichiers peuvent exister dans les sources.";
    document.querySelector('#reset-empty-search').hidden = matches.length > 0;
    if (request.kind === "photo" && request.explanations?.length) {
      const criteria = request.explanations.map(item => item.phrase).filter(Boolean).join(", ");
      experimentalIndexStatus.textContent += ` Critères photo explicites : ${criteria}.`;
    }
    if (request.kind === "photo" && request.importDateRange) {
      experimentalIndexStatus.textContent += " La période porte sur la date d'import enregistrée dans Famili-IA.";
    }
    const invalidCount = uploadedDocuments.filter(doc => invalidContentProvenance.has(doc)).length;
    if (invalidCount) experimentalIndexStatus.textContent += ` Provenance de ${invalidCount} document${invalidCount === 1 ? "" : "s"} invalide : recherche par nom uniquement.`;
  } catch (error) {
    experimentalIndexResults.replaceChildren();
    renderUnifiedPhotoResults([], { kind: "error" });
    experimentalSourceStatus.textContent = "État des sources indisponible : l'index n'a pas pu être actualisé.";
    const reason = error instanceof Error ? error.message : "Erreur non détaillée";
    experimentalIndexStatus.textContent = `Recherche expérimentale indisponible : ${reason}`;
    deadlineResults.replaceChildren();
    deadlineReviewList.replaceChildren();
    deadlineReview.hidden = true;
    deadlineStatus.textContent = `Propositions d'échéances indisponibles : ${reason}`;
  }
}

document.querySelector("#experimental-deadline-refresh").addEventListener("click", refreshExperimentalIndex);

function resetSearchFilters(clearQuery = false) {
  for (const control of document.querySelectorAll('#search-filters-panel select, #search-filters-panel input')) {
    control.value = '';
  }
  if (clearQuery) {
    experimentalQuery = '';
    experimentalIndexQuery.value = '';
  }
  refreshExperimentalIndex();
  experimentalIndexQuery.focus();
}

document.querySelector('#reset-search-filters').addEventListener('click', () => resetSearchFilters());
document.querySelector('#reset-empty-search').addEventListener('click', () => resetSearchFilters(true));

experimentalIndexForm.addEventListener("submit", (event) => {
  event.preventDefault();
  experimentalQuery = experimentalIndexQuery.value;
  refreshExperimentalIndex();
});
const maxDriveFiles = 50;
const maxTextFileSize = 1024 * 1024;
const maxPdfFileSize = 10 * 1024 * 1024;
const maxPdfPages = 20;
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
const connectGoogleDriveButton = document.querySelector("#connect-google-drive");
const disconnectGoogleDriveButton = document.querySelector("#disconnect-google-drive");
const driveConnectionStatus = document.querySelector("#drive-connection-status");
const googleDriveClient = hasGoogleDriveConfig && !isNativePlatform ? new GoogleDriveClient(googleDriveConfig) : null;
const googleDriveSource = googleDriveClient ? new GoogleDriveSource({ client: googleDriveClient, sourceId: INDEX_SOURCES.drive }) : null;
const sourceChoiceDialog = document.querySelector("#source-choice-dialog");
const googleDriveChoiceDescription = document.querySelector("#google-drive-choice-description");
const onboardingCompleteKey = "famili-ia-source-choice-complete";
let googleDriveReady = false;
const demoStatusLabel = document.querySelector("#demo-status-label");
const sidebarModeCopy = document.querySelector("#sidebar-mode-copy");

function updateModeBanner() {
  const hasDriveFiles = uploadedDocuments.some((file) => file.driveSource);
  const hasOneDriveFiles = uploadedDocuments.some((file) => file.oneDriveSource);
  const hasLocalFiles = uploadedDocuments.some((file) => file.isLocal && !file.driveDemo && !file.driveSource && !file.oneDriveSource);
  if (demoStatusLabel && sidebarModeCopy) {
    if (hasOneDriveFiles) {
      demoStatusLabel.textContent = "Prototype — copies OneDrive locales";
      sidebarModeCopy.textContent = "Les copies enregistrées ne sont pas synchronisées automatiquement.";
    } else if (hasDriveFiles) {
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

function findDocuments(question) {
  const searchableDocuments = uploadedDocuments.length > 0 ? uploadedDocuments : documents;
  return rankDocuments(question, searchableDocuments);
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
  matches.forEach(({ document: sourceDocument, evidence, confidence }) => {
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
    const origin = sourceDocument.oneDriveSource
      ? "OneDrive · copie enregistrée localement"
      : sourceDocument.driveSource
      ? "Google Drive · copie temporaire locale"
      : sourceDocument.driveDemo
        ? "Sélection Google Drive simulée · fichier fictif"
        : sourceDocument.isLocal
          ? sourceDocument.sourceDir && Capacitor.isNativePlatform()
            ? "Stockage local · non transmis"
            : "Fichier local · non transmis"
          : "Exemple fictif";
    addTextElement(info, "p", "document-meta", `${sourceDocument.type} · ${sourceDocument.date} · ${origin}`);
    if (evidence) {
      const shortEvidence = evidence.length > 280 ? `${evidence.slice(0, 277)}...` : evidence;
      addTextElement(info, "p", "search-evidence", `Extrait : « ${shortEvidence} »`);
    }
    const confidenceClass = confidence === "élevé" ? "high" : confidence === "moyen" ? "medium" : "low";
    addTextElement(info, "p", `search-confidence search-confidence--${confidenceClass}`, `Correspondance ${confidence}`);
    card.append(info);

    const button = addTextElement(card, "button", "source-button", isPhotoDocument(sourceDocument) ? "Détail photo" : "Voir l'extrait");
    button.type = "button";
    button.addEventListener("click", () => openDocumentPreview(sourceDocument));
    documentList.append(card);
  });
}

function openSource(document) {
  dialogEyebrow.textContent = document.oneDriveSource
    ? "FICHIER ONEDRIVE"
    : document.driveSource
    ? "FICHIER CHOISI DANS GOOGLE DRIVE"
    : document.isLocal
      ? document.sourceDir && Capacitor.isNativePlatform()
        ? "FICHIER STOCKAGE LOCAL"
        : "FICHIER DE CETTE SESSION"
      : "DOCUMENT DE DÉMONSTRATION";
  dialogTitle.textContent = document.name;
  dialogMeta.textContent = document.isLocal
    ? document.oneDriveSource
      ? `${document.type} · copie locale issue de OneDrive${document.date && document.date !== "Date inconnue" ? ` · modifié le ${document.date}` : ""}`
      : document.driveSource
      ? `${document.type} · copie textuelle locale issue de Google Drive${document.date && document.date !== "Date inconnue" ? ` · modifié le ${document.date}` : ""}`
      : document.driveDemo
        ? `${document.type} · exemple fictif copié dans cette session`
        : document.sourceDir && Capacitor.isNativePlatform()
          ? `${document.type} · ${document.sourceDir} · copie textuelle locale`
          : `${document.type} · copie textuelle locale`
    : `${document.type} · ${document.date} · Source de démonstration`;
  if (dialogNoticeText) {
    dialogNoticeText.textContent = document.oneDriveSource
      ? "Copie conservée dans Famili-IA, non synchronisée automatiquement. L'accès actuel à l'original n'est pas vérifié ; ce fichier peut être ancien ou ne contenir que ses métadonnées."
      : document.driveSource
      ? "Copie textuelle d'un fichier choisi dans Google Picker, conservée dans Famili-IA. Ce n'est pas l'original ; son accès actuel n'est pas vérifié et la copie peut être ancienne ou contenir du texte non vérifié."
      : document.driveDemo
        ? "Ceci est un contenu fictif. Aucun compte Google n'est connecté et aucun fichier Drive réel n'a été consulté."
        : document.isLocal
          ? document.sourceDir && Capacitor.isNativePlatform()
            ? "Copie textuelle issue de votre stockage local, conservée dans Famili-IA. Ce n'est pas l'original ; son accès actuel n'est pas vérifié et la copie peut être ancienne ou contenir du texte non vérifié."
            : "Copie textuelle d'un fichier choisi sur cet appareil, conservée dans Famili-IA. Ce n'est pas l'original ; son accès actuel n'est pas vérifié et la copie peut être ancienne ou contenir du texte non vérifié."
          : "Ceci est un contenu d'exemple inventé pour le prototype.";
  }
  dialogContent.textContent = document.content;
  sourceDialog.showModal();
}

function openDocumentPreview(document) {
  if (isPhotoDocument(document)) openPhotoDetailsDialog(document);
  else openSource(document);
}

let currentPhotoDetail = null;

function openPhotoDetailsDialog(photo) {
  const dialog = document.querySelector('#photo-detail-dialog');
  const image = document.querySelector('#photo-detail-image');
  const noPreview = document.querySelector('#photo-detail-no-preview');
  const title = document.querySelector('#photo-detail-title');
  const metadata = document.querySelector('#photo-detail-metadata');
  if (!dialog || !image || !noPreview || !title || !metadata) return;

  currentPhotoDetail = photo;
  title.textContent = photo.name || photo.originalName || 'Photo sans nom';
  metadata.replaceChildren();

  const thumbnailDataUrl = getPhotoThumbnailDataUrl(photo.photoThumbnail);
  image.hidden = !thumbnailDataUrl;
  noPreview.hidden = Boolean(thumbnailDataUrl);
  if (thumbnailDataUrl) {
    image.alt = `Aperçu de ${photo.name || photo.originalName || 'la photo'}`;
    image.src = thumbnailDataUrl;
  } else {
    image.removeAttribute('src');
    image.alt = '';
  }

  const dateInfo = getPhotoTimelineDateInfo(photo);
  const annotations = photo.photoAnnotations;
  const memberNames = getFamilyMembers()
    .filter(member => annotations?.personIds?.includes(member.id))
    .map(member => member.name);
  const eventTags = annotations?.eventTags ?? photo.eventTags ?? [];
  const details = [
    ['Prise de vue', getTimelineDateLabel(dateInfo)],
    ['Importée dans Famili-IA', photo.importedAt?.slice(0, 10) || 'Date indisponible'],
    ['Personnes associées', memberNames.length ? memberNames.join(', ') : 'Aucune association manuelle'],
    ['Événements', Array.isArray(eventTags) && eventTags.length
      ? eventTags.filter(tag => typeof tag === 'string').join(', ')
      : 'Aucun événement associé'],
    ['Lieu', annotations?.placeSource === 'user' && annotations.placeLabel
      ? `${annotations.placeLabel} (saisi manuellement)`
      : 'Aucun lieu saisi']
  ];
  for (const [label, value] of details) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    metadata.append(term, description);
  }
  dialog.showModal();
}

function closePhotoDetailsDialog() {
  const dialog = document.querySelector('#photo-detail-dialog');
  const image = document.querySelector('#photo-detail-image');
  if (dialog?.open) dialog.close();
  image?.removeAttribute('src');
  if (image) image.alt = '';
  currentPhotoDetail = null;
}

function initPhotoDetailsDialog() {
  const dialog = document.querySelector('#photo-detail-dialog');
  document.querySelector('#close-photo-detail')?.addEventListener('click', closePhotoDetailsDialog);
  document.querySelector('#photo-detail-close-action')?.addEventListener('click', closePhotoDetailsDialog);
  dialog?.addEventListener('close', () => {
    const image = document.querySelector('#photo-detail-image');
    image?.removeAttribute('src');
    if (image) image.alt = '';
    currentPhotoDetail = null;
  });
  document.querySelector('#photo-detail-edit-annotations')?.addEventListener('click', () => {
    if (!currentPhotoDetail) return;
    const photo = currentPhotoDetail;
    closePhotoDetailsDialog();
    openPhotoAnnotationsDialog(photo);
  });
}

function search(question) {
  input.value = question;
  experimentalQuery = question;
  refreshExperimentalIndex();
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

  return filterSearchResultsByChips(matches, { type: typeFilter, source: sourceFilter });
}

document.querySelectorAll('#filter-type-group .chip, #filter-source-group .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const group = chip.closest('#filter-type-group, #filter-source-group');
    group.querySelectorAll('.chip').forEach((option) => {
      const selected = option === chip;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });

    if (input.value.trim()) search(input.value);
  });
});

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

function setDriveConnectionStatus(message, state, notify = true) {
  if (!driveConnectionStatus) return;
  driveConnectionStatus.textContent = message;
  if (state) driveConnectionStatus.dataset.state = state;
  else delete driveConnectionStatus.dataset.state;
  if (notify) showDemoNotice(message);
}

/**
 * Met à jour l'interface de progression du scan proactif (Phase 11.4.c.5.a)
 */
function updateScanProgressUI(progressInfo) {
  if (progressInfo?.status === "error" || progressInfo?.failed > 0) localImportFailed = true;
  const container = document.querySelector("#scan-progress-container");
  const fill = document.querySelector("#scan-progress-fill");
  const text = document.querySelector("#scan-progress-text");

  if (!container || !fill || !text) return;

  if (!progressInfo || progressInfo.status === 'idle') {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  clearTimeout(scanProgressTimeout);

  if (progressInfo.status === 'scanning') {
    fill.style.width = "0%";
    text.textContent = `Exploration de ${progressInfo.directory || 'dossiers'}...`;
  } else if (progressInfo.status === 'indexing') {
    fill.style.width = `${progressInfo.progress || 0}%`;
    const imported = progressInfo.imported ?? progressInfo.processed;
    const failures = progressInfo.failed ? ` · ${progressInfo.failed} échec${progressInfo.failed === 1 ? "" : "s"}` : "";
    text.textContent = `Indexation : ${progressInfo.processed}/${progressInfo.total} traités · ${imported} indexés${failures}`;
  } else if (progressInfo.status === 'completed') {
    fill.style.width = "100%";
    const failures = progressInfo.failed ? ` · ${progressInfo.failed} échec${progressInfo.failed === 1 ? "" : "s"}` : "";
    const thumbnailWarnings = progressInfo.thumbnailWarnings
      ? ` · ${progressInfo.thumbnailWarnings} vignette${progressInfo.thumbnailWarnings === 1 ? "" : "s"} indisponible${progressInfo.thumbnailWarnings === 1 ? "" : "s"}`
      : "";
    text.textContent = `Indexation terminée : ${progressInfo.imported ?? progressInfo.processed}/${progressInfo.total} fichiers indexés${failures}${thumbnailWarnings}`;
    scanProgressTimeout = setTimeout(() => {
      container.hidden = true;
      if (activeView === 'vos-donnees') renderDataInventory(parseHash().params);
      if (activeView === 'accueil') renderAccueilDashboard();
    }, 5000);
  } else if (progressInfo.status === 'stopped') {
    fill.style.width = `${progressInfo.progress || 0}%`;
    text.textContent = `Indexation interrompue : ${progressInfo.processed}/${progressInfo.total} fichiers traités.`;
    scanProgressTimeout = setTimeout(() => { container.hidden = true; }, 5000);
  } else if (progressInfo.status === 'error') {
    text.textContent = `L'indexation a échoué : ${progressInfo.message}`;
    scanProgressTimeout = setTimeout(() => { container.hidden = true; }, 7000);
  }
}

let scanProgressTimeout;

function trackBackgroundWorker(worker) {
  localImportFailed = false;
  const scan = worker.start();
  activeScanWorkers.set(worker, scan);
  renderExperimentalSources();
  scan.then(
    (result) => {
      if (result?.failed > 0 || result?.status === "error") localImportFailed = true;
      activeScanWorkers.delete(worker);
      renderExperimentalSources();
    },
    (error) => {
      localImportFailed = true;
      activeScanWorkers.delete(worker);
      renderExperimentalSources();
      console.error("Le traitement local s’est terminé avec une erreur :", error);
    }
  );
  return scan;
}

function startBackgroundScan(directories) {
  if (removingSessionFiles) {
    setFileStatus("La suppression est en cours ; réessayez ensuite.", "error");
    return null;
  }
  const worker = new BackgroundSyncWorker(directories, updateScanProgressUI, {
    onDocument: (document, extractedSegments) => {
      experimentalIndex.trustExtractedContent(document, extractedSegments);
      uploadedDocuments.push(document);
      refreshExperimentalIndex();
    }
  });
  trackBackgroundWorker(worker);
  return worker;
}

function startBackgroundImport(files) {
  const worker = new BackgroundSyncWorker([], updateScanProgressUI, {
    files,
    onDocument: (document, extractedSegments) => {
      experimentalIndex.trustExtractedContent(document, extractedSegments);
      uploadedDocuments.push(document);
      refreshExperimentalIndex();
    }
  });
  const task = trackBackgroundWorker(worker);

  completeOnboarding();
  manageOnboardingWizardVisibility();
  if (sourceChoiceDialog.open) sourceChoiceDialog.close();
  showView("recherche", { params: { q: importReturnContext?.view === "recherche" ? input.value : "" } });
  setFileStatus(`${files.length} fichier${files.length === 1 ? "" : "s"} sélectionné${files.length === 1 ? "" : "s"}. Indexation locale démarrée en arrière-plan.`);

  task.then((result) => {
    updateClearFilesButtonsVisibility();
    updateGoogleDriveButton();
    updateModeBanner();
    const count = uploadedDocuments.length;
    const failedNotice = result.failed
      ? ` ${result.failed} fichier${result.failed === 1 ? "" : "s"} n'ont pas pu être indexés.`
      : "";
    const stoppedNotice = result.status === "stopped" ? " L'indexation a été interrompue avant la fin." : "";
    const metadataNotice = result.metadataWarnings
      ? ` ${result.metadataWarnings} avertissement${result.metadataWarnings === 1 ? "" : "s"} sur les métadonnées photo.`
      : "";
    const thumbnailNotice = result.thumbnailWarnings
      ? ` ${result.thumbnailWarnings} vignette${result.thumbnailWarnings === 1 ? "" : "s"} photo non générée${result.thumbnailWarnings === 1 ? "" : "s"}.`
      : "";
    setFileStatus(
      `${result.imported} fichier${result.imported === 1 ? "" : "s"} indexé${result.imported === 1 ? "" : "s"} en local. ${count} fichier${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"} dans cette session.${failedNotice}${metadataNotice}${thumbnailNotice}${stoppedNotice}`,
      result.failed || result.metadataWarnings || result.thumbnailWarnings || result.status === "stopped" ? "warning" : "success"
    );
  }).catch((error) => {
    const reason = error instanceof Error ? error.message : "Erreur d'indexation non détaillée.";
    setFileStatus(`L'indexation locale a échoué : ${reason}`, "error");
  });
  return worker;
}

async function stopBackgroundScans() {
  const scans = [...activeScanWorkers.entries()];
  scans.forEach(([worker]) => worker.stop());
  await Promise.all(scans.map(([, scan]) => scan));
}

function updateDriveConnectionActions() {
  updateClearFilesButtonsVisibility();
}

function updateGoogleDriveButton() {
  const driveFileCount = uploadedDocuments.filter((file) => file.driveSource).length;
  if (connectGoogleDriveButton) {
    connectGoogleDriveButton.disabled = !googleDriveReady || driveFileCount >= maxDriveFiles;
  }
  if (googleDriveChoiceDescription) {
    if (isNativePlatform) {
      googleDriveChoiceDescription.textContent = "La connexion Google native n'est pas encore disponible dans l'application mobile.";
    } else if (!hasGoogleDriveConfig) {
      googleDriveChoiceDescription.textContent = "La connexion n'est pas configurée dans cette version web.";
    } else if (!googleDriveReady) {
      googleDriveChoiceDescription.textContent = "Connexion en cours de préparation…";
    } else if (driveFileCount >= maxDriveFiles) {
      googleDriveChoiceDescription.textContent = `Limite de ${maxDriveFiles} fichiers Google Drive atteinte.`;
    } else {
      googleDriveChoiceDescription.textContent = "Connecter votre compte puis choisir les fichiers à consulter.";
    }
    document.querySelector("#import-google-availability").textContent = googleDriveChoiceDescription.textContent;
  }
}

function completeOnboarding() {
  localStorage.setItem(onboardingCompleteKey, "true");
  document.querySelector("#dashboard-content").hidden = false;
}

function openSourceChoices(source) {
  const providerButton = source === "drive" ? "connect-google-drive" : source === "onedrive" ? "connect-onedrive" : null;
  document.querySelector("#source-choice-title").textContent = source === "drive"
    ? "Google Drive — accès aux fichiers"
    : source === "onedrive" ? "OneDrive — accès aux fichiers" : "Où se trouvent vos documents ?";
  document.querySelector("#source-choice-intro").textContent = providerButton
    ? "Vérifiez les permissions avant de continuer. Ouvrir ces options ne connecte aucun compte."
    : "Choisissez uniquement les fichiers que vous souhaitez rechercher.";
  sourceChoiceDialog.querySelectorAll(".source-choice").forEach(button => {
    button.hidden = Boolean(providerButton) && button.id !== providerButton;
  });
  document.querySelector("#onedrive-options").hidden = source === "drive";
  document.querySelector("#source-choice-permissions").textContent = source === "drive"
    ? "Google Drive ne donne accès qu'aux fichiers sélectionnés."
    : source === "onedrive"
      ? "OneDrive peut autoriser l'accès à tous les fichiers du compte personnel. La connexion ne lance pas l'indexation."
      : "Google Drive ne donne accès qu'aux fichiers sélectionnés. OneDrive peut autoriser l'accès à tous les fichiers du compte personnel.";
  sourceChoiceDialog.showModal();
}

async function loadLocalFiles(files, sourceInput = localFilesInput) {
  if (removingSessionFiles) {
    setFileStatus("La suppression est en cours ; réessayez ensuite.", "error");
    if (sourceInput) sourceInput.value = "";
    return;
  }
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) return;

  const invalidFile = selectedFiles.find((file) => !/\.(txt|md|pdf|jpg|jpeg|png|docx|doc|xlsx|xls)$/i.test(file.name));
  if (invalidFile) {
    setFileStatus(`« ${invalidFile.name} » n'est pas dans un format pris en charge. Aucun fichier de cette sélection n'a été ajouté.`, "error");
    if (sourceInput) sourceInput.value = "";
    return;
  }

  const oversizedFile = selectedFiles.find((file) => {
    const lowerName = file.name.toLocaleLowerCase("fr");
    const maxFileSize = lowerName.endsWith(".pdf")
      ? maxPdfFileSize
      : /\.(jpg|jpeg|png)$/i.test(lowerName) ? MAX_PHOTO_FILE_SIZE : maxTextFileSize;
    return file.size > maxFileSize;
  });
  if (oversizedFile) {
    const lowerName = oversizedFile.name.toLocaleLowerCase("fr");
    const hasLargeFileLimit = lowerName.endsWith(".pdf") || /\.(jpg|jpeg|png)$/i.test(lowerName);
    const limit = hasLargeFileLimit ? "10 Mo" : "1 Mo";
    setFileStatus(`« ${oversizedFile.name} » dépasse la limite de ${limit}. Aucun fichier de cette sélection n'a été ajouté.`, "error");
    if (sourceInput) sourceInput.value = "";
    return;
  }

  startBackgroundImport(selectedFiles);
  if (sourceInput) sourceInput.value = "";
}

if (googleDriveClient) {
  setDriveConnectionStatus("Chargement des bibliothèques Google. Aucun accès aux fichiers n'est demandé avant votre action.", "success", false);
  googleDriveClient.initialize().then(() => {
    googleDriveReady = true;
    updateGoogleDriveButton();
    updateModeBanner();
    setDriveConnectionStatus("Prêt. Choisissez Google Drive pour demander l'accès drive.file et sélectionner vos fichiers dans le sélecteur officiel.", "success", false);
  }).catch((error) => {
    driveObservation = "error";
    renderExperimentalSources();
    setDriveConnectionStatus(`Connexion Google indisponible : ${error.message}`, "error");
  });
} else {
  connectGoogleDriveButton.disabled = true;
  if (isNativePlatform) {
    setDriveConnectionStatus("Le flux OAuth/Picker configuré ici est réservé au navigateur web ; il ne doit pas être lancé dans la WebView mobile.", "error");
  }
}
updateGoogleDriveButton();

const oneDriveClientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
const oneDriveAuth = oneDriveClientId && !isNativePlatform ? new OneDriveAuth(oneDriveClientId) : null;
const oneDriveConnectButton = document.querySelector("#connect-onedrive");
const oneDriveStartButton = document.querySelector("#start-onedrive");
const oneDriveStopButton = document.querySelector("#stop-onedrive");
const oneDriveDisconnectButton = document.querySelector("#disconnect-onedrive");
const oneDriveStatus = document.querySelector("#onedrive-status");
const oneDriveReviewPanel = document.querySelector("#onedrive-review-panel");
const oneDriveReviewList = document.querySelector("#onedrive-review-list");
const oneDriveReviewStatus = document.querySelector("#onedrive-review-status");
const oneDriveApplyUpdatesButton = document.querySelector("#apply-onedrive-updates");
const oneDriveKeepCopiesButton = document.querySelector("#keep-onedrive-copies");
let pendingOneDriveChanges = [];
let oneDriveReady = false;
let oneDriveConnecting = false;

function updateOneDriveActions() {
  oneDriveConnectButton.disabled = !oneDriveReady || oneDriveConnecting || Boolean(oneDriveScanSettled);
  oneDriveStartButton.disabled = !oneDriveAuth?.connected || oneDriveConnecting || Boolean(oneDriveScanSettled) || removingSessionFiles;
  oneDriveStopButton.hidden = !oneDriveScanSettled;
  oneDriveDisconnectButton.hidden = !oneDriveAuth?.connected;
  oneDriveDisconnectButton.disabled = oneDriveConnecting || Boolean(oneDriveScanSettled) || removingSessionFiles;
  oneDriveReviewList.querySelectorAll("input").forEach(input => { input.disabled = Boolean(oneDriveScanSettled) || removingSessionFiles; });
  oneDriveApplyUpdatesButton.disabled = Boolean(oneDriveScanSettled) || removingSessionFiles;
  oneDriveKeepCopiesButton.disabled = Boolean(oneDriveScanSettled) || removingSessionFiles;
  document.querySelector("#import-onedrive-availability").textContent = !oneDriveReady
    ? "Connexion indisponible dans cette version."
    : oneDriveConnecting ? "Connexion en cours…"
      : oneDriveScanSettled ? "Indexation en cours, consultable dans les options."
        : oneDriveAuth?.connected ? "Session connectée. Indexation sur demande."
          : "Connexion facultative disponible, sur demande.";
}

function renderOneDriveReview(candidates) {
  pendingOneDriveChanges = candidates;
  oneDriveReviewList.replaceChildren();
  candidates.forEach((candidate, index) => {
    const item = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `onedrive-update-${index}`;
    checkbox.value = String(index);
    checkbox.disabled = Boolean(oneDriveScanSettled) || removingSessionFiles;
    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    const changes = candidate.changes.length
      ? candidate.changes.join(" ; ")
      : "version fournisseur différente";
    label.textContent = `${candidate.existing.name} → ${candidate.item.name} (${changes})`;
    item.append(checkbox, label);
    oneDriveReviewList.appendChild(item);
  });
  oneDriveReviewPanel.hidden = candidates.length === 0;
  oneDriveApplyUpdatesButton.disabled = Boolean(oneDriveScanSettled) || removingSessionFiles;
  oneDriveKeepCopiesButton.disabled = Boolean(oneDriveScanSettled) || removingSessionFiles;
}

function clearOneDriveReview() {
  renderOneDriveReview([]);
  oneDriveReviewStatus.textContent = "";
}

async function applyOneDriveUpdates(candidates) {
  if (!candidates.length || !oneDriveAuth?.connected || oneDriveScanSettled || removingSessionFiles) return;
  const controller = new AbortController();
  oneDriveScanController = controller;
  oneDriveObservation = "working";
  oneDriveReviewStatus.textContent = `Actualisation en cours : 0/${candidates.length}. Les copies précédentes restent disponibles en cas d'erreur.`;

  const remaining = new Set(pendingOneDriveChanges);
  oneDriveScanSettled = (async () => {
    let updated = 0;
    const failures = [];
    const metadataOnly = [];
    for (const candidate of candidates) {
      if (controller.signal.aborted) break;
      try {
        const result = await readOneDriveDocument({
          item: candidate.item,
          accountId: oneDriveAuth.accountId,
          accountFingerprint: oneDriveAccountFingerprint,
          getToken: () => oneDriveAuth.getToken(),
          signal: controller.signal
        });
        if (controller.signal.aborted) break;
        const replacement = mergeOneDriveDocumentUpdate(candidate.existing, result.document);
        await addDocument(replacement);
        const index = uploadedDocuments.findIndex(document => document.id === replacement.id);
        if (index === -1) throw new Error("La copie OneDrive à actualiser n'est plus présente.");
        uploadedDocuments[index] = replacement;
        if (result.segments) experimentalIndex.trustExtractedContent(replacement, result.segments);
        if (result.coverage === "metadata") {
          metadataOnly.push(`${candidate.item.name} (${result.reason || "contenu non disponible"})`);
        }
        invalidContentProvenance.delete(candidate.existing);
        remaining.delete(candidate);
        updated += 1;
        oneDriveReviewStatus.textContent = `Actualisation en cours : ${updated}/${candidates.length}.`;
      } catch (error) {
        if (controller.signal.aborted) break;
        failures.push(`${candidate.item.name} : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
      }
    }

    pendingOneDriveChanges = [...remaining];
    oneDriveObservation = failures.length ? "error" : "connected";
    const interrupted = controller.signal.aborted;
    oneDriveStatus.textContent = interrupted
      ? `Actualisation arrêtée. ${updated} copie(s) actualisée(s) ; les autres copies restent inchangées.`
      : `Actualisation terminée : ${updated} copie(s) remplacée(s)${failures.length ? ` ; ${failures.length} échec(s)` : ""}${metadataOnly.length ? ` ; métadonnées seules : ${metadataOnly.join(", ")}` : ""}.`;
    oneDriveReviewStatus.textContent = [
      interrupted ? "Action arrêtée ; les éléments non terminés restent à examiner." : "",
      pendingOneDriveChanges.length && !interrupted ? `${pendingOneDriveChanges.length} élément(s) non actualisé(s) restent à examiner.` : "",
      ...failures
    ].filter(Boolean).join(" ");
    renderOneDriveReview(pendingOneDriveChanges);
    if (!pendingOneDriveChanges.length) oneDriveReviewStatus.textContent = failures.join(" ");
  })().finally(() => {
    oneDriveScanController = null;
    oneDriveScanSettled = null;
    refreshExperimentalIndex();
    renderDataInventory(parseHash().params);
    updateOneDriveActions();
    renderExperimentalSources();
  });
  updateOneDriveActions();
  renderExperimentalSources();
}

if (oneDriveAuth) {
  oneDriveStatus.textContent = "Préparation de OneDrive, sans demande d'autorisation.";
  oneDriveAuth.initialize().then(() => {
    oneDriveReady = true;
    oneDriveStatus.textContent = "OneDrive prêt à être connecté. Aucune indexation n'a démarré.";
    updateOneDriveActions();
  }).catch(error => {
    oneDriveObservation = "error";
    oneDriveStatus.textContent = `Initialisation Microsoft impossible : ${error.message}`;
    renderExperimentalSources();
  });
} else if (isNativePlatform) {
  oneDriveStatus.textContent = "OneDrive est disponible uniquement dans le navigateur web configuré.";
} else {
  oneDriveStatus.textContent = "OneDrive n'est pas configuré : ajoutez VITE_MICROSOFT_CLIENT_ID à .env.local, puis redémarrez Vite.";
}

oneDriveConnectButton.addEventListener("click", async () => {
  if (!oneDriveAuth || oneDriveConnecting || oneDriveScanSettled || removingSessionFiles) return;
  oneDriveConnecting = true;
  updateOneDriveActions();
  try {
    await oneDriveAuth.connect();
    oneDriveAccountFingerprint = await getOneDriveAccountFingerprint(oneDriveAuth.accountId);
    oneDriveObservation = "connected";
    oneDriveStatus.textContent = `Compte connecté (${formatOneDriveAccountFingerprint(oneDriveAccountFingerprint)}). L'indexation nécessite une action distincte.`;
  } catch (error) {
    oneDriveObservation = "error";
    oneDriveStatus.textContent = `Connexion Microsoft impossible : ${error.message}`;
  } finally {
    oneDriveConnecting = false;
    updateOneDriveActions();
    renderExperimentalSources();
  }
});

oneDriveStartButton.addEventListener("click", () => {
  if (!oneDriveAuth?.connected || oneDriveScanSettled || removingSessionFiles) return;
  clearOneDriveReview();
  const controller = new AbortController();
  oneDriveScanController = controller;
  const existing = new Map(uploadedDocuments.map(doc => [doc.id, doc]));
  const accountId = oneDriveAuth.accountId;
  const accountFingerprint = oneDriveAccountFingerprint;
  let added = 0;
  let metadataOnly = 0;
  const compared = { unchanged: 0, changed: 0, unknown: 0 };
  const candidates = [];
  let scanComplete = false;
  let progress = { files: 0, pages: 0, foldersRead: 0 };
  const summary = () => `${progress.files} fichier(s) parcouru(s), ${progress.pages} page(s), ${progress.foldersRead} dossier(s) ; ${added} copie(s) ajoutée(s), dont ${metadataOnly} en métadonnées seules ; copies existantes : ${compared.unchanged} même version observée, ${compared.changed} changement détecté, ${compared.unknown} version inconnue.`;
  oneDriveObservation = "working";
  oneDriveScanSettled = (async () => {
    try {
      await scanOneDrive({
        signal: controller.signal,
        getToken: () => oneDriveAuth.getToken(),
        onProgress: value => { progress = value; oneDriveStatus.textContent = `Indexation en cours : ${summary()}`; },
        onItem: async item => {
          const id = await oneDriveDocumentId(accountId, item.id);
          if (existing.has(id)) {
            const previous = existing.get(id);
            const comparison = compareOneDriveCopy(previous, item);
            if (comparison === "changed" && canRefreshOneDriveCopy(previous, accountFingerprint)) {
              compared.changed += 1;
              candidates.push({ existing: previous, item, changes: describeOneDriveChanges(previous, item) });
            } else {
              compared[comparison === "changed" ? "unknown" : comparison] += 1;
            }
            return;
          }
          const result = await readOneDriveDocument({
            item, accountId, accountFingerprint,
            getToken: () => oneDriveAuth.getToken(), signal: controller.signal
          });
          if (controller.signal.aborted) throw new DOMException("Indexation arrêtée.", "AbortError");
          await addDocument(result.document);
          uploadedDocuments.push(result.document);
          existing.set(id, result.document);
          if (result.segments) experimentalIndex.trustExtractedContent(result.document, result.segments);
          added += 1;
          if (result.coverage === "metadata") metadataOnly += 1;
          if (added % 10 === 0) refreshExperimentalIndex();
        }
      });
      scanComplete = true;
      oneDriveObservation = "connected";
      oneDriveStatus.textContent = `Parcours terminé. ${summary()} Les éléments absents ne sont pas déclarés supprimés.`;
    } catch (error) {
      oneDriveObservation = error.name === "AbortError" ? "connected" : "error";
      oneDriveStatus.textContent = `${error.name === "AbortError" ? "Indexation arrêtée" : `Indexation interrompue : ${error.message}`}. ${summary()} Les copies déjà enregistrées sont conservées.`;
    } finally {
      oneDriveScanController = null;
      oneDriveScanSettled = null;
      if (scanComplete && candidates.length) {
        renderOneDriveReview(candidates);
        oneDriveReviewStatus.textContent = `${candidates.length} changement(s) détecté(s). Sélectionnez les copies à actualiser ; rien ne sera remplacé sans confirmation.`;
      }
      refreshExperimentalIndex();
      updateClearFilesButtonsVisibility();
      updateModeBanner();
      renderDataInventory(parseHash().params);
      updateOneDriveActions();
    }
  })();
  updateOneDriveActions();
  renderExperimentalSources();
});

oneDriveStopButton.addEventListener("click", () => oneDriveScanController?.abort());
oneDriveApplyUpdatesButton.addEventListener("click", () => {
  const selected = [...oneDriveReviewList.querySelectorAll("input:checked")]
    .map(input => pendingOneDriveChanges[Number(input.value)])
    .filter(Boolean);
  if (!selected.length) {
    oneDriveReviewStatus.textContent = "Sélectionnez au moins un élément à actualiser, ou conservez les copies actuelles.";
    return;
  }
  void applyOneDriveUpdates(selected);
});
oneDriveKeepCopiesButton.addEventListener("click", () => {
  clearOneDriveReview();
  oneDriveStatus.textContent = "Copies OneDrive actuelles conservées ; aucun remplacement effectué.";
});
sourceChoiceDialog.addEventListener("close", () => {
  if (oneDriveScanSettled) oneDriveScanController?.abort();
  clearOneDriveReview();
});
oneDriveDisconnectButton.addEventListener("click", async () => {
  if (!oneDriveAuth?.connected || oneDriveScanSettled || oneDriveConnecting) return;
  oneDriveConnecting = true;
  updateOneDriveActions();
  try {
    await oneDriveAuth.disconnect();
    oneDriveAccountFingerprint = null;
    oneDriveObservation = "disconnected";
    oneDriveStatus.textContent = "Session locale déconnectée. Les copies restent enregistrées et l'autorisation Microsoft n'est pas révoquée.";
  } catch (error) {
    oneDriveObservation = "error";
    oneDriveStatus.textContent = `Déconnexion locale impossible : ${error.message}`;
  } finally {
    oneDriveConnecting = false;
    updateOneDriveActions();
    renderExperimentalSources();
  }
});
document.querySelectorAll("[data-open-source-dialog]").forEach((button) => {
  button.addEventListener("click", () => openSourceChoices());
});
document.querySelectorAll("[data-import-source]").forEach(button => {
  button.addEventListener("click", () => openSourceChoices(button.dataset.importSource));
});
document.querySelectorAll("[data-open-import]").forEach(button => {
  button.addEventListener("click", () => {
    importReturnContext = { ...parseHash(), trigger: button };
    if (importReturnContext.view === "recherche") importReturnContext.params.q = input.value;
    const back = document.querySelector("#return-from-import");
    back.textContent = `Retour — ${pageTitles[importReturnContext.view]}`;
    back.hidden = false;
    showView("importer");
    document.querySelector("#import-title").focus();
  });
});
document.querySelector("#return-from-import").addEventListener("click", () => {
  const target = importReturnContext;
  if (!target) return;
  showView(target.view, { params: target.params });
  target.trigger.focus();
});
document.querySelector("#close-source-choice").addEventListener("click", () => sourceChoiceDialog.close());
sourceChoiceDialog.addEventListener("click", (event) => {
  if (event.target === sourceChoiceDialog) sourceChoiceDialog.close();
});
document.querySelector("#choose-local-files").addEventListener("click", () => {
  sourceChoiceDialog.close();
  localFilesInput.click();
});

document.querySelector("#choose-local-files-native").addEventListener("click", () => {
  sourceChoiceDialog.close();
  localFilesInput.click();
});

connectGoogleDriveButton.addEventListener("click", async () => {
  sourceChoiceDialog.close();
  if (removingSessionFiles || driveSelectionSettled) {
    setDriveConnectionStatus("Une sélection ou une suppression est déjà en cours.", "error");
    return;
  }
  const driveFileCount = uploadedDocuments.filter((file) => file.driveSource).length;
  const remainingCount = maxDriveFiles - driveFileCount;
  if (!googleDriveClient) {
    setDriveConnectionStatus("La connexion Google Drive n'est pas disponible dans cette version.", "error");
    return;
  }
  if (remainingCount < 1) {
    setDriveConnectionStatus(`La limite de ${maxDriveFiles} fichiers Google Drive est atteinte.`, "error");
    return;
  }

  connectGoogleDriveButton.disabled = true;
  const selectionGeneration = driveSelectionGeneration;
  let finishSelection;
  driveSelectionSettled = new Promise((resolve) => { finishSelection = resolve; });
  setDriveConnectionStatus("Ouverture de l'autorisation Google. Vous pouvez annuler avant de choisir des fichiers.", "success");
  try {
    const selection = await googleDriveSource.selectFiles(remainingCount);
    const loadedFiles = selection.documents;
    driveObservation = "unknown";
    if (selectionGeneration !== driveSelectionGeneration) {
      setDriveConnectionStatus("La sélection a été ignorée car les fichiers ont été retirés pendant son exécution.", "error");
      return;
    }
    if (loadedFiles.length === 0) {
      setDriveConnectionStatus(selection.status === "cancelled"
        ? "Sélection Google Drive annulée. Aucun fichier n'a été lu."
        : "Aucun fichier Google Drive sélectionné.", "success");
      return;
    }

    const existingDriveIds = new Set(uploadedDocuments.filter((document) => document.driveSource).map((document) => document.id));
    const newFiles = loadedFiles.filter((file) => {
      if (existingDriveIds.has(file.id)) return false;
      existingDriveIds.add(file.id);
      return true;
    });
    if (newFiles.length === 0) {
      setDriveConnectionStatus("Ces fichiers Drive sont déjà présents dans cette session.", "success");
      return;
    }

    for (const doc of newFiles) {
      await prepareDriveDocumentForIndex(doc, experimentalIndex);
      await addDocument(doc);
      uploadedDocuments.push(doc);
    }
    refreshExperimentalIndex();
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
    setDriveConnectionStatus("Fichiers choisis enregistrés localement. La révocation et la suppression des copies sont disponibles dans Vos données.", "success");
  } catch (error) {
    driveObservation = "error";
    refreshExperimentalIndex();
    const reason = error instanceof Error ? error.message : "Erreur Google non détaillée.";
    setDriveConnectionStatus(`La sélection Drive a échoué : ${reason}`, "error");
  } finally {
    driveSelectionSettled = null;
    finishSelection();
    renderExperimentalSources();
    updateGoogleDriveButton();
    updateDriveConnectionActions();
  }
});

const openSourceDemoButton = document.querySelector("#open-drive-picker");
if (openSourceDemoButton) {
  openSourceDemoButton.addEventListener("click", () => {
    sourceChoiceDialog.close();
    startOnboardingReplay(3);
  });
}

if (localFilesInput) {
  localFilesInput.addEventListener("change", () => {
    loadLocalFiles(localFilesInput.files);
  });
}

async function clearSessionFiles() {
  if (removingSessionFiles) return;
  removingSessionFiles = true;
  driveSelectionGeneration += 1;
  try {
    if (driveSelectionSettled) await driveSelectionSettled;
    oneDriveScanController?.abort();
    if (oneDriveScanSettled) await oneDriveScanSettled;
    await stopBackgroundScans();
    const shouldRevokeGoogleAccess = Boolean(googleDriveClient?.hasAccessToken);
    for (const doc of [...uploadedDocuments]) {
      await deleteDocument(doc.id);
      const index = uploadedDocuments.indexOf(doc);
      if (index !== -1) uploadedDocuments.splice(index, 1);
      refreshExperimentalIndex();
    }
    if (sourceDialog.open) sourceDialog.close();
    dialogTitle.textContent = "";
    dialogMeta.textContent = "";
    dialogContent.textContent = "";
    updateClearFilesButtonsVisibility();
    documentList?.replaceChildren();
    if (answerText) answerText.textContent = "";
    if (resultCount) resultCount.textContent = "";
    if (results) results.hidden = true;
    if (noResults) noResults.hidden = true;
    setFileStatus("Fichiers locaux retirés de cette page.", "success");
    if (localFilesInput) localFilesInput.value = "";
    updateGoogleDriveButton();
    updateModeBanner();
    if (shouldRevokeGoogleAccess) {
      try {
        await googleDriveSource.revoke();
        driveObservation = "disconnected";
        renderExperimentalSources();
        setDriveConnectionStatus("Fichiers retirés de la mémoire locale et autorisation Google révoquée.", "success");
      } catch (error) {
        driveObservation = "error";
        renderExperimentalSources();
        setDriveConnectionStatus(`Fichiers retirés localement, mais révocation Google non confirmée : ${error.message}`, "error");
      }
    } else {
      setDriveConnectionStatus("Fichiers retirés de la mémoire locale. Aucun jeton Google n'était actif.", "success");
    }
    updateDriveConnectionActions();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erreur non détaillée";
    setFileStatus(`La suppression des fichiers a échoué : ${reason}`, "error");
  } finally {
    removingSessionFiles = false;
    updateOneDriveActions();
  }
}

if (clearFilesButton) {
  clearFilesButton.addEventListener("click", clearSessionFiles);
}
if (disconnectGoogleDriveButton) {
  disconnectGoogleDriveButton.addEventListener("click", async () => {
    if (removingSessionFiles || driveSelectionSettled) {
      setDriveConnectionStatus("Une sélection ou une suppression est déjà en cours.", "error");
      return;
    }
    disconnectGoogleDriveButton.disabled = true;
    let finishRevocation;
    driveSelectionSettled = new Promise((resolve) => { finishRevocation = resolve; });
    try {
      await googleDriveSource.revoke();
      driveObservation = "disconnected";
      setDriveConnectionStatus("Autorisation Google révoquée. Les copies enregistrées dans Famili-IA sont conservées.", "success");
    } catch (error) {
      driveObservation = "error";
      setDriveConnectionStatus(`Révocation Google non confirmée : ${error.message}`, "error");
    } finally {
      driveSelectionSettled = null;
      finishRevocation();
      disconnectGoogleDriveButton.disabled = false;
      renderExperimentalSources();
      updateDriveConnectionActions();
    }
  });
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
// Initialiser activeView dès le départ en parsant le hash
let importReturnContext = null;
let activeView = (() => {
  const hash = window.location.hash.substring(1);
  if (!hash || hash === '' || hash === '#') return 'accueil';
  // Extraire la vue depuis le format #/view ou #view?params
  const viewMatch = hash.match(/^\/?([^?]+)/);
  return viewMatch ? viewMatch[1] : 'accueil';
})();

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

const VIEW_TOUR_STEPS = [
  {
    view: "recherche",
    headingId: "page-title",
    title: "Recherche",
    description: "La recherche locale porte sur les contenus indexés disponibles. Sa couverture dépend des sources et des éléments effectivement indexés."
  },
  {
    view: "maison",
    headingId: "house-title",
    title: "Maison",
    description: "Retrouvez ici les biens et équipements du foyer. La visite ne modifie aucun élément."
  },
  {
    view: "famille",
    headingId: "family-title",
    title: "Famille",
    description: "Cette vue présente l’espace privé et partagé. Les informations affichées peuvent provenir des données déjà présentes sur cet appareil."
  },
  {
    view: "alertes",
    headingId: "alerts-title",
    title: "Alertes",
    description: "Consultez les rappels et échéances. Aucune alerte n’est créée ni modifiée pendant la visite."
  },
  {
    view: "vos-donnees",
    headingId: "data-title",
    title: "Vos données",
    description: "L’inventaire indique les fichiers visibles et leur provenance. Cette vue peut afficher des données locales déjà présentes."
  },
  {
    view: "importer",
    headingId: "import-title",
    title: "Importer",
    description: "Les commandes d’ajout ne sont pas utilisées pendant la visite : aucun fichier n’est sélectionné ni importé."
  }
];
let viewTourActive = false;
let viewTourNavigating = false;
let viewTourStepIndex = 0;
let viewTourReturnView = "accueil";
let viewTourReturnFocus = null;

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

  const [path, queryString = ""] = hash.split('?');
  const view = path.replace(/^\/+/, '').split('/')[0];
  const params = Object.fromEntries(new URLSearchParams(queryString));
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
      setTimeout(() => openDocumentPreview(doc), 150);
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
      const searchQuery = params.q;
      if (searchQuery !== undefined) {
        input.value = searchQuery;
        if (searchQuery.trim()) form.requestSubmit();
      } else input.focus({ preventScroll: true });
      break;

    case 'famille':
      initFamilyView();
      break;

    case 'profil':
      initProfileView();
      break;

    case 'importer':
      updateGoogleDriveButton();
      updateOneDriveActions();
      break;

    case 'assistant':
      refreshAssistantContext();
      break;

    case 'alertes':
      initAlertsView(params);
      break;

    case 'maison':
      initHouseView(params);
      break;

    case 'accueil':
      renderAccueilDashboard();
      break;

    case 'vos-donnees':
      // Extraire les paramètres de filtrage depuis le hash (ex: ?type=document&category=Facture)
      const hashFilters = params;
      initDataView(hashFilters);
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
      .filter(a => !a.status || a.status === "active")
      .map(a => ({ ...a, type: calculateAlertType(a.dueDate, a.type, a.documentType) }))
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
  const currentTourStep = VIEW_TOUR_STEPS[viewTourStepIndex];
  if (viewTourActive && !viewTourNavigating && name !== currentTourStep?.view) {
    finishViewTour({ restoreView: false, restoreFocus: false });
  }
  suspendPhotoThumbnailRendering();

  // Gestion spéciale : Si un document est demandé, l'ouvrir dans le sourceDialog
  if (params.docId) {
    const document = [...documents, ...uploadedDocuments].find(d => d.id === params.docId);
    if (document) {
      // Construire un événement ou appeler la logique d'ouverture directement
      // On ouvre le dialog source avec ce document
      openDocumentPreview(document);
      // Si on voulait aussi naviguer vers la vue recherche, on pourrait le faire ici
      // mais pour l'instant on se concentre sur l'ouverture du document
      return; // Arrêter le chargement normal de la vue
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
  if (name !== "importer") {
    importReturnContext = null;
    document.querySelector("#return-from-import").hidden = true;
  }
  document.body.classList.toggle('ui-theme', ['accueil', 'recherche', 'alertes', 'vos-donnees', 'maison', 'detail', 'famille', 'assistant', 'importer', 'profil', 'plus'].includes(name));
  if (name !== 'alertes') document.querySelector('#alert-preferences-dialog')?.close();

  views.forEach((view) => {
    view.removeAttribute('hidden');
    if (view.dataset.view !== name) {
      view.setAttribute('hidden', 'true');
    }
  });
  resumePhotoThumbnailRendering();

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

  initializeViewWithParams(name, params);

  // Mettre à jour la visibilité des boutons de gestion de fichiers
  updateClearFilesButtonsVisibility();
}

function showViewTourStep(stepIndex) {
  viewTourStepIndex = stepIndex;
  const step = VIEW_TOUR_STEPS[stepIndex];
  const panel = document.querySelector("#view-tour");
  panel.hidden = false;
  document.querySelector("#view-tour-progress").textContent =
    `Étape ${stepIndex + 1} sur ${VIEW_TOUR_STEPS.length} · ${step.title}`;
  document.querySelector("#view-tour-description").textContent = step.description;
  document.querySelector("#view-tour-prev").hidden = stepIndex === 0;
  document.querySelector("#view-tour-next").textContent =
    stepIndex === VIEW_TOUR_STEPS.length - 1 ? "Terminer la visite" : "Suivant";
  document.querySelectorAll(".view-tour-highlight").forEach((heading) => {
    heading.classList.remove("view-tour-highlight");
  });

  viewTourNavigating = true;
  try {
    showView(step.view, { addHistory: false });
  } finally {
    viewTourNavigating = false;
  }

  const heading = document.getElementById(step.headingId);
  heading.classList.add("view-tour-highlight");
  heading.tabIndex = -1;
  heading.focus();
}

function startViewTour(returnFocus = document.activeElement) {
  viewTourReturnView = Object.hasOwn(pageTitles, activeView) ? activeView : "accueil";
  viewTourReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : null;
  viewTourActive = true;
  document.body.classList.add("view-tour-active");
  showViewTourStep(0);
}

function finishViewTour({ restoreView = true, restoreFocus = true } = {}) {
  if (!viewTourActive) return;

  const returnView = viewTourReturnView;
  const returnFocus = viewTourReturnFocus;
  viewTourActive = false;
  document.body.classList.remove("view-tour-active");
  document.querySelector("#view-tour").hidden = true;
  document.querySelectorAll(".view-tour-highlight").forEach((heading) => {
    heading.classList.remove("view-tour-highlight");
  });
  viewTourReturnFocus = null;

  if (restoreView && activeView !== returnView) showView(returnView, { addHistory: false });
  if (restoreFocus && returnFocus?.isConnected && !returnFocus.closest("[hidden]")) {
    returnFocus.focus();
  } else if (restoreFocus) {
    const headingId = VIEW_TOUR_STEPS.find(step => step.view === activeView)?.headingId;
    if (headingId) document.getElementById(headingId)?.focus();
  }
}

function initViewTour() {
  document.querySelector("#start-view-tour-profile").addEventListener("click", (event) => {
    startViewTour(event.currentTarget);
  });
  document.querySelector("#start-view-tour-demo").addEventListener("click", (event) => {
    startViewTour(event.currentTarget);
  });
  document.querySelector("#view-tour-prev").addEventListener("click", () => {
    if (viewTourStepIndex > 0) showViewTourStep(viewTourStepIndex - 1);
  });
  document.querySelector("#view-tour-next").addEventListener("click", () => {
    if (viewTourStepIndex < VIEW_TOUR_STEPS.length - 1) {
      showViewTourStep(viewTourStepIndex + 1);
    } else {
      finishViewTour();
    }
  });
  document.querySelector("#view-tour-exit").addEventListener("click", () => finishViewTour());
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
    // This handles cases where hash-based navigation is used without pushState
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

// DÉLÉGATION D'ÉVÉNEMENTS pour data-open-view
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-open-view]');
  if (button) {
    console.log("Clicked data-open-view:", button.dataset.openView);
    if (button instanceof HTMLAnchorElement) event.preventDefault();

    // Extraction eventuelle de paramètres dans l'attribut (ex: "recherche?docId=xxx")
    const viewData = button.dataset.openView || '';
    const viewName = viewData.split('?')[0]; // Partie avant le '?'
    const paramsString = viewData.split('?')[1] || ''; // Partie après le '?'
    const params = {};

    // Parsing simple des paramètres key=value
    if (paramsString) {
      paramsString.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key) params[key] = value ? decodeURIComponent(value) : '';
      });
    }

    showView(viewName, { addHistory: true, params });
  }
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
  const profileForm = document.querySelector("#profile-form");
  if (!profileForm) return;

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newName = document.querySelector("#edit-name").value.trim();
    const status = document.querySelector("#profile-save-status");
    status.textContent = '';
    if (!newName) {
      status.textContent = "Saisissez un nom d'affichage.";
      document.querySelector("#edit-name").focus();
      return;
    }
    if (newName) {
      // Update current user in state
      const user = getCurrentUser();
      user.privacy ??= {};
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
      const photoLocationConsent = document.querySelector("#consent-photo-gps").checked;

      // Update avatar display in profile
      const avatar = document.querySelector("#profile-avatar");
      if (avatar) {
        avatar.textContent = user.avatar;
      }

      // Trigger a re-render of the dashboard if it's visible
      if (activeView === 'accueil') {
        renderAccueilDashboard();
      }

      try {
        await updatePhotoLocationConsent(photoLocationConsent);
        await updatePrivacyConsent({
          telemetryEnabled: user.privacy.telemetryEnabled,
          dataSharingConsent: user.privacy.dataSharingConsent
        });
        initProfileView();
        if (status) status.textContent = "Préférences enregistrées.";
        showDemoNotice(`Profil mis à jour : ${newName}`);
      } catch (error) {
        console.error("Impossible d'enregistrer les préférences de confidentialité :", error);
        const savedPrivacy = getCurrentUser().privacy || {};
        document.querySelector("#consent-photo-gps").checked = savedPrivacy.photoLocationConsent === true;
        document.querySelector("#consent-telemetry").checked = savedPrivacy.telemetryEnabled === true;
        document.querySelector("#consent-sharing").checked = savedPrivacy.dataSharingConsent === true;
        if (status) status.textContent = "Les préférences n'ont pas pu être enregistrées. Réessayez.";
        showDemoNotice("Impossible d'enregistrer les préférences de confidentialité.");
      }
    }
  });

}

function initProfileView() {
  const user = getCurrentUser();
  document.querySelector('#profile-save-status').textContent = '';
  document.querySelector('#profile-avatar').textContent = user.avatar || user.name?.charAt(0).toUpperCase() || '?';
  document.querySelector('#profile-name').textContent = user.name || '';
  document.querySelector('#edit-name').value = user.name || '';
  document.querySelector('#edit-profile-address').value = user.address || '';
  document.querySelector('#edit-profile-postal').value = user.postalCode || '';
  document.querySelector('#edit-profile-city').value = user.city || '';
  const role = user.role === 'Admin' ? 'Administrateur' : user.role === 'Member' ? 'Membre' : user.role || 'Non renseigné';
  document.querySelector('#profile-role').textContent = role;
  document.querySelector('#profile-role-readonly').textContent = role;
  document.querySelector('#consent-telemetry').checked = user.privacy?.telemetryEnabled === true;
  document.querySelector('#consent-sharing').checked = user.privacy?.dataSharingConsent === true;
  document.querySelector('#consent-photo-gps').checked = user.privacy?.photoLocationConsent === true;
}

document.querySelectorAll("[data-nav~='vos-donnees']").forEach((button) => {
  button.addEventListener("click", () => {
    showView("vos-donnees");
    initDataView();
  });
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function getEquipmentIcon(category) {
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
  document.querySelectorAll('[data-house-category]').forEach(tab => {
    const selected = tab.dataset.houseCategory === category;
    tab.classList.toggle('is-selected', selected);
    tab.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('#equipment-list-status').textContent =
    `${equipment.length} équipement${equipment.length > 1 ? 's' : ''}`;

  if (equipment.length === 0) {
    equipmentList.innerHTML = '';
    equipmentEmpty.hidden = false;
    return;
  }

  const illustrations = {
    pompe: new URL('./assets/pompe/pompe-photo.jpg', import.meta.url).href,
    piscine: new URL('./assets/piscine/piscine-photo.jpg', import.meta.url).href,
    pergola: new URL('./assets/pergola/pergola-photo.jpg', import.meta.url).href,
    volets: new URL('./assets/store/store-photo.jpg', import.meta.url).href,
    chauffage: new URL('./assets/chaudiere/chaudiere-photo.jpg', import.meta.url).href
  };
  equipmentList.innerHTML = equipment.map(eq => {
    const illustration = Object.hasOwn(illustrations, eq.category) ? illustrations[eq.category] : null;
    const icon = illustration
      ? `<img src="${illustration}" alt="" loading="lazy" decoding="async">`
      : getEquipmentIcon(eq.category);
    let iconClass = 'blue';
    if (eq.category === 'pompe') { iconClass = 'green'; }
    else if (eq.category === 'piscine') { iconClass = 'violet'; }
    else if (eq.category === 'imprimante') { iconClass = 'cyan'; }
    else if (eq.category === 'assurance') { iconClass = 'amber'; }

    return `
      <button class="ui-button ui-button--secondary equipment-row" type="button" data-equipment="${escapeHtml(eq.id)}" data-open-view="detail?id=${escapeHtml(encodeURIComponent(eq.id))}">
        <span class="ui-icon row-icon ${iconClass}${illustration ? ' equipment-visual' : ''}" aria-hidden="true">${icon}</span>
        <span class="row-copy"><strong>${escapeHtml(eq.name)}</strong><small>${escapeHtml(eq.status)}</small></span>
        <span class="stat-arrow" aria-hidden="true">›</span>
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
    tab.onclick = () => {
      const category = tab.dataset.houseCategory;
      renderEquipmentList(category);
      const hash = `#/maison?filter=${encodeURIComponent(category)}`;
      if (window.location.hash !== hash) {
        window.history.pushState({ view: 'maison', params: { filter: category } }, "", hash);
      }
    };
  });
}

document.querySelector('[data-replay-demo]').addEventListener('click', () => startOnboardingReplay(3));

// The house category filtering is now handled by initCategoryTabs() and renderEquipmentList()
// This duplicate event listener is removed to avoid conflicts

document.querySelector("#mark-alerts-read").addEventListener("click", (event) => {
  document.querySelectorAll("[data-alert-card]").forEach((card) => {
    card.classList.add("is-read");
    const readButton = card.querySelector('[data-toggle-alert-read]');
    readButton.setAttribute('aria-pressed', 'true');
    readButton.textContent = "Marquer comme non lue";
  });
  event.currentTarget.textContent = "Toutes les alertes sont lues";
  event.currentTarget.disabled = true;
});


/**
 * Initialization - Render Accueil dashboard with state data
 */
function renderAccueilDashboard() {
  const user = getCurrentUser();
  const alerts = getAlerts().filter(alert => !alert.status || alert.status === 'active');
  const inventory = mergeInventoryDocuments(uploadedDocuments.length === 0 ? documents : [], uploadedDocuments);

  document.querySelector('#dashboard-user-name').textContent = user.name || '';
  document.querySelector('#home-file-count').textContent = inventory.length;
  document.querySelector('#home-warranty-count').textContent = filterInventoryDocuments(inventory, { type: 'Garantie' }).length;
  document.querySelector('#home-contract-count').textContent = filterInventoryDocuments(inventory, { type: 'Contrat' }).length;
  const exampleCount = countInventorySources(inventory).demo;
  document.querySelector('#dashboard-data-note').textContent = exampleCount
    ? `${exampleCount} exemple${exampleCount > 1 ? 's' : ''} fictif${exampleCount > 1 ? 's' : ''} inclus. Les exemples ne sont pas vos fichiers personnels et ne sont pas recherchés dans l'index.`
    : `${inventory.length} fichier${inventory.length > 1 ? 's' : ''} enregistré${inventory.length > 1 ? 's' : ''} dans Famili-IA. Ces compteurs ne garantissent pas la validité des contrats ou garanties.`;

  // Update "Vos prochaines échéances" section with event delegation
  const verifyPanel = document.querySelector('#view-accueil .verify-panel');
  if (verifyPanel) {
    verifyPanel.innerHTML = `
      <div class="section-heading">
        <h2 id="verify-title">Vos rappels</h2>
        <button class="ui-button ui-button--text" type="button" data-open-view="alertes">Toutes les alertes</button>
      </div>
      <p class="household-note">${alerts.length ? 'Aperçu des rappels actifs, y compris ceux reportés. Consultez Alertes pour leurs dates et leurs sources.' : 'Aucun rappel actif enregistré. Cela ne garantit pas que toutes vos échéances sont couvertes.'}</p>
      ${alerts.slice(0, 3).map(alert => `
        <button class="verify-row" type="button" data-open-view="alertes">
          <span class="ui-icon row-icon" aria-hidden="true">${getAlertIcon(calculateAlertType(alert.dueDate, alert.type, alert.documentType))}</span>
          <span class="row-copy">
            <strong>${escapeHtml(alert.title)}</strong>
            <small>${escapeHtml(alert.detail)}</small>
            ${alert.source !== 'document' ? `<small>${documents.some(document => document.id === alert.docId) ? 'Exemple fictif' : 'Source non renseignée'}</small>` : ''}
          </span>
          <span class="stat-arrow" aria-hidden="true">›</span>
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
    <div class="ui-card equipment-specs">
      <div class="spec-header">
        <span class="spec-icon ${colorClass}">${categoryIcon}</span>
        <h3>${escapeHtml(eqDetail.name)}</h3>
      </div>
      <div class="spec-grid">
        <div class="spec-item"><span class="spec-label">Catégorie</span><span>${escapeHtml(eqDetail.category.charAt(0).toUpperCase() + eqDetail.category.slice(1))}</span></div>
        <div class="spec-item"><span class="spec-label">Statut</span><span class="status-pill">${escapeHtml(eqDetail.status)}</span></div>
        <div class="spec-item"><span class="spec-label">Installation</span><span>Non renseignée</span></div>
        <div class="spec-item"><span class="spec-label">Référence</span><span>#${escapeHtml(eqId.split('-').pop().toUpperCase())}</span></div>
      </div>

      <div class="spec-docs">
        <h4>Documents associés</h4>
        <div class="doc-grid">
          ${eqDetail.docs && eqDetail.docs.length > 0
            ? eqDetail.docs.map(docId => {
                const doc = [...documents, ...uploadedDocuments].find(d => d.id === docId);
                const docName = doc ? doc.name : docId;
                return `
                  <button class="ui-button ui-button--secondary doc-link-card" type="button" data-doc-id="${escapeHtml(docId)}">
                    <span class="ui-icon doc-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6v20h12V6zM14 2v5h5M8 12h8m-8 4h6"/></svg></span>
                    <span class="doc-name">${escapeHtml(docName)}</span>
                    <span class="doc-arrow" aria-hidden="true">›</span>
                  </button>
                `;
              }).join('')
            : '<p class="empty-docs">Aucun document lié pour cet équipement.</p>'}
        </div>
      </div>

      <div class="equipment-actions">
        <button class="ui-button ui-button--primary" type="button" id="edit-equipment">
          Modifier
        </button>
        <button class="ui-button ui-button--danger" type="button" id="delete-equipment">
          Supprimer
        </button>
        <button class="ui-button ui-button--secondary" type="button" data-demo-action>
          Lier un document (démo)
        </button>
        <button class="ui-button ui-button--secondary" type="button" data-demo-action>
          Historique (démo)
        </button>
      </div>
    </div>
  `;

  document.querySelector('#edit-equipment').addEventListener('click', () => {
    openEquipmentForm(eqDetail);
  });

  document.querySelector('#delete-equipment').addEventListener('click', async () => {
    if (confirm(`Voulez-vous vraiment supprimer "${eqDetail.name}" ?`)) {
      try {
        await deleteEquipment(eqId);
        showDemoNotice(`Équipement supprimé : ${eqDetail.name}`);
        showView("maison");
      } catch (error) {
        console.error("Impossible de supprimer l'équipement :", error);
        showDemoNotice(`Suppression impossible : ${error.message}`);
      }
    }
  });

  detailContent.querySelectorAll('.doc-link-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      const doc = [...documents, ...uploadedDocuments].find(d => d.id === docId);
      if (doc) openDocumentPreview(doc);
      else showDemoNotice("Ce document n'est pas disponible sur cet appareil.");
    });
  });

  detailContent.querySelectorAll('[data-demo-action]').forEach(btn => {
    btn.addEventListener('click', () => showDemoNotice());
  });
}

const { view: initialView, params: initialParams } = parseHash();
// Amélioration : détecter firstRun de manière robuste
// Si localStorage n'est pas disponible (ex: mode debug/incognito), on considère ce n'est pas le first run
let firstRun = false;
try {
  firstRun = localStorage.getItem(onboardingCompleteKey) !== "true";
} catch (e) {
  // localStorage unavailable - not first run by default
}
document.querySelector("#dashboard-content").hidden = firstRun;
showView(Object.hasOwn(pageTitles, initialView) ? initialView : "accueil", {
  addHistory: false,
  params: initialParams
});

// Render dashboard on load (uniquement si ce n'est pas le premier RUN OU si on est déjà sur accueil)
if (!firstRun || initialView === 'accueil') {
  renderAccueilDashboard();
}

function getAlertIcon(type) {
  const paths = type === 'red'
    ? '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="M12 8v5m0 3h.01"/>'
    : type === 'amber'
      ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
      : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/**
 * Initialize alerts view
 */
function initAlertsView(params = {}) {
  const alertList = document.querySelector('#alert-list');
  if (!alertList) return;
  const preferencesDialog = document.querySelector('#alert-preferences-dialog');
  document.querySelector('#open-alert-preferences').onclick = () => preferencesDialog.showModal();
  document.querySelector('#close-alert-preferences').onclick = () => preferencesDialog.close();
  preferencesDialog.onclick = event => {
    if (event.target === preferencesDialog) {
      const bounds = preferencesDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) preferencesDialog.close();
    }
  };
  const preferencesForm = document.querySelector("#alert-notification-preferences");
  if (preferencesForm) {
    const preferences = normalizeAlertNotificationPreferences(getCurrentUser().preferences?.alertNotifications);
    preferencesForm.querySelectorAll("[data-disabled-category]").forEach(input => {
      input.checked = preferences.disabledCategories.includes(input.dataset.disabledCategory);
    });
    preferencesForm.elements.namedItem("maxPerDay").value = String(preferences.maxPerDay);
    preferencesForm.elements.namedItem("quietHoursEnabled").checked = preferences.quietHours.enabled;
    preferencesForm.elements.namedItem("quietStart").value = preferences.quietHours.start;
    preferencesForm.elements.namedItem("quietEnd").value = preferences.quietHours.end;
    preferencesForm.onsubmit = async event => {
      event.preventDefault();
      const status = document.querySelector("#alert-preferences-status");
      try {
        await updateAlertNotificationPreferences({
          disabledCategories: [...preferencesForm.querySelectorAll("[data-disabled-category]:checked")]
            .map(input => input.dataset.disabledCategory),
          maxPerDay: preferencesForm.elements.namedItem("maxPerDay").value,
          quietHours: {
            enabled: preferencesForm.elements.namedItem("quietHoursEnabled").checked,
            start: preferencesForm.elements.namedItem("quietStart").value,
            end: preferencesForm.elements.namedItem("quietEnd").value
          }
        });
        if (status) status.textContent = "Préférences enregistrées sur cet appareil.";
      } catch (error) {
        console.error("Impossible d'enregistrer les préférences de notification.", error);
        if (status) status.textContent = "Les préférences n'ont pas pu être enregistrées.";
      }
    };
  }

  const notificationButton = document.querySelector("#enable-alert-notifications");
  if (notificationButton) {
    const updateNotificationButton = () => {
      if (!("Notification" in window)) {
        notificationButton.textContent = "Notifications indisponibles";
        notificationButton.disabled = true;
      } else if (Notification.permission === "granted") {
        notificationButton.textContent = "Notifications activées";
        notificationButton.disabled = true;
      } else if (Notification.permission === "denied") {
        notificationButton.textContent = "Notifications bloquées dans le navigateur";
        notificationButton.disabled = true;
      } else {
        notificationButton.textContent = "Activer les notifications";
        notificationButton.disabled = false;
      }
    };

    notificationButton.onclick = async () => {
      if (!("Notification" in window) || Notification.permission !== "default") return;
      try {
        const permission = await Notification.requestPermission();
        updateNotificationButton();
        if (permission === "granted") await checkAlertsForExpiry();
      } catch (error) {
        console.error("Impossible d'activer les notifications d'échéance.", error);
        showDemoNotice("L'activation des notifications a échoué. Vérifiez les permissions de votre navigateur.");
      }
    };
    updateNotificationButton();
  }

  // Add event listeners for filter tabs
  const tabs = document.querySelectorAll('.alert-filter-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      renderAlerts(tab.dataset.filter);

      // Update URL hash to preserve filter state
      const hash = `#/alertes?filter=${encodeURIComponent(tab.dataset.filter)}`;
      if (window.location.hash !== hash) {
        window.history.pushState({ view: 'alertes', filter: tab.dataset.filter }, "", hash);
      }
    };
  });

  const initialFilter = [...tabs].some(tab => tab.dataset.filter === params?.filter)
    ? params.filter : 'à-traiter';
  renderAlerts(initialFilter);
}

/**
 * Render alerts based on filter
 */
function renderAlerts(filter, restoreFocus = false) {
  const alertList = document.querySelector('#alert-list');
  if (!alertList) return;

  const alerts = getAlerts().map(alert => ({
    ...alert,
    status: alert.status || "active",
    type: calculateAlertType(alert.dueDate, alert.type, alert.documentType)
  }));
  const activeAlerts = alerts.filter(alert => alert.status === "active");
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const snoozedAlerts = activeAlerts.filter(alert => alert.snoozedUntil && alert.snoozedUntil > todayIso);
  const actionableAlerts = activeAlerts.filter(alert => !snoozedAlerts.includes(alert));
  const filteredAlerts = filter === "historique"
    ? alerts.filter(alert => alert.status !== "active")
    : filter === "reportées"
      ? snoozedAlerts
      : actionableAlerts.filter(alert => {
      if (filter === 'à-traiter') return alert.type === 'red';
      if (filter === 'à-anticiper') return alert.type === 'amber';
      if (filter === 'à-surveiller') return alert.type === 'blue' || alert.type === 'muted';
      return true;
    });

  // Update badges
  document.querySelectorAll('.alert-filter-tab').forEach(tab => {
    const f = tab.dataset.filter;
    tab.classList.toggle('is-selected', f === filter);
    tab.setAttribute('aria-pressed', String(f === filter));
    const count = (f === "historique"
      ? alerts.filter(a => a.status !== "active")
      : f === "reportées"
        ? snoozedAlerts
        : actionableAlerts.filter(a => {
        if (f === 'à-traiter') return a.type === 'red';
        if (f === 'à-anticiper') return a.type === 'amber';
        if (f === 'à-surveiller') return a.type === 'blue' || a.type === 'muted';
        return false;
      })).length;
    tab.querySelector('.alert-badge').textContent = count.toString();
  });

  const selectedTab = document.querySelector('.alert-filter-tab[aria-pressed="true"]');
  const filterLabel = selectedTab.firstChild.textContent.trim().toLocaleLowerCase('fr');
  document.querySelector('#alert-list-status').textContent =
    `${filteredAlerts.length} alerte${filteredAlerts.length > 1 ? 's' : ''} · ${filterLabel}`;
  const markReadButton = document.querySelector('#mark-alerts-read');
  markReadButton.disabled = filteredAlerts.length === 0;
  markReadButton.textContent = "Tout marquer comme lu";
  if (restoreFocus) selectedTab.focus({ preventScroll: true });

  if (filteredAlerts.length === 0) {
    alertList.innerHTML = `<section class="ui-card alerts-empty">
      <span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
      <h2>Aucune alerte dans cette catégorie</h2>
      <p>Vous pouvez consulter les autres catégories à tout moment.</p>
    </section>`;
    return;
  }

  alertList.innerHTML = filteredAlerts.map(alert => {
    const iconSvg = getAlertIcon(alert.type);
    const isSnoozed = alert.snoozedUntil && alert.snoozedUntil > todayIso;
    const statusAction = alert.status !== "active"
      ? '<button class="ui-button ui-button--secondary alert-status-action" type="button" data-alert-status="active">Réactiver</button>'
      : isSnoozed
        ? '<button class="ui-button ui-button--secondary alert-status-action" type="button" data-unsnooze>Réactiver maintenant</button>'
        : '<button class="ui-button ui-button--secondary alert-status-action" type="button" data-alert-status="ignored">Ignorer</button><button class="ui-button ui-button--secondary alert-status-action" type="button" data-alert-status="resolved">Terminée</button><button class="ui-button ui-button--secondary alert-status-action" type="button" data-snooze-days="1">Reporter 1 jour</button><button class="ui-button ui-button--secondary alert-status-action" type="button" data-snooze-days="7">Reporter 7 jours</button>';
    const dueDate = alert.dueDate
      ? new Date(`${alert.dueDate}T00:00:00`).toLocaleDateString("fr-FR")
      : "";
    const alertSource = alert.sourceId ? sourceName(alert.sourceId) : "Document";
    const sourceExcerpt = alert.sourceExcerpt
      ? `<p class="alert-evidence"><strong>Source — ${escapeHtml(alertSource)} :</strong> ${escapeHtml(alert.sourceExcerpt)}</p>`
      : "";
    const snoozeNotice = isSnoozed
      ? `<p class="alert-snooze-note">Reportée jusqu'au ${escapeHtml(new Date(`${alert.snoozedUntil}T00:00:00`).toLocaleDateString("fr-FR"))}.</p>`
      : "";
    const correctionForm = alert.source === "document" && alert.docId
      ? `<details class="alert-date-correction"><summary>Corriger la date</summary><form data-alert-date-form><label class="ui-label">Date d'échéance confirmée<input class="ui-input" type="date" name="dueDate" value="${escapeHtml(alert.dueDate)}" required></label><button class="ui-button ui-button--primary alert-status-action" type="submit">Enregistrer la date</button></form></details>`
      : "";
    const stateLabel = alert.status === 'resolved' ? 'Terminée'
      : alert.status === 'ignored' ? 'Ignorée'
        : isSnoozed ? 'Reportée'
          : alert.type === 'red' ? 'À traiter'
            : alert.type === 'amber' ? 'À anticiper' : 'À surveiller';
    const isExample = alert.source !== 'document' && documents.some(document => document.id === alert.docId);

    return `
      <article class="ui-card alert-card ${escapeHtml(alert.type)}${isSnoozed ? " is-snoozed" : ""}" data-alert-card data-alert-id="${escapeHtml(alert.id)}">
        <div class="ui-icon alert-icon" aria-hidden="true">
          ${iconSvg}
        </div>
        <div class="alert-content">
          <div class="alert-header">
            <strong>${escapeHtml(alert.title)}</strong>
          </div>
          <div class="alert-meta">
            <span class="alert-state">${stateLabel}</span>
            ${dueDate ? `<span class="alert-date">Échéance : ${escapeHtml(dueDate)}</span>` : ''}
            ${alert.source !== 'document' ? `<span class="alert-demo-label">${isExample ? 'Exemple fictif' : 'Source non renseignée'}</span>` : ''}
          </div>
          <p>${escapeHtml(alert.detail)}</p>
          ${sourceExcerpt}
          ${snoozeNotice}
        </div>
        <button class="ui-button ui-button--secondary alert-action" type="button" data-open-view="vos-donnees?docId=${escapeHtml(encodeURIComponent(alert.docId || ""))}" aria-label="Voir le détail de ${escapeHtml(alert.title)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        <details class="alert-management">
          <summary>Gérer cette alerte<span class="visually-hidden"> : ${escapeHtml(alert.title)}</span></summary>
          <div class="alert-status-actions">
            ${statusAction}
            <button class="ui-button ui-button--secondary alert-status-action" type="button" data-toggle-alert-read aria-pressed="false">Marquer comme lue</button>
          </div>
          ${correctionForm}
        </details>
      </article>
    `;
  }).join('');

  alertList.querySelectorAll('[data-toggle-alert-read]').forEach(button => {
    button.addEventListener('click', () => {
      const isRead = button.closest('[data-alert-card]').classList.toggle('is-read');
      button.setAttribute('aria-pressed', String(isRead));
      button.textContent = isRead ? "Marquer comme non lue" : "Marquer comme lue";
      markReadButton.disabled = false;
      markReadButton.textContent = "Tout marquer comme lu";
    });
  });

  // Handle alert action button navigation explicitly
  alertList.querySelectorAll(".alert-action").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Clicked alert action explicitly:", button.dataset.openView);
      const viewData = button.dataset.openView || '';
      const viewName = viewData.split('?')[0];
      const paramsString = viewData.split('?')[1] || '';
      const params = {};

      if (paramsString) {
        paramsString.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key) params[key] = value ? decodeURIComponent(value) : '';
        });

      }

      showView(viewName, { addHistory: true, params });
    });
  });

  alertList.querySelectorAll("[data-alert-status]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const card = button.closest("[data-alert-card]");
      const alert = getAlerts().find(item => item.id === card?.dataset.alertId);
      if (!alert) return;

      try {
        const updatedAlert = { ...alert, status: button.dataset.alertStatus };
        if (updatedAlert.status !== "active") delete updatedAlert.snoozedUntil;
        await updateAlert(updatedAlert);
        renderAlerts(filter, true);
      } catch (error) {
        console.error("Impossible de mettre à jour le statut de l'alerte.", error);
        showDemoNotice("Le statut de cette alerte n'a pas pu être enregistré.");
      }
    });
  });

  alertList.querySelectorAll("[data-snooze-days], [data-unsnooze]").forEach(button => {
    button.addEventListener("click", async event => {
      event.stopPropagation();
      const card = button.closest("[data-alert-card]");
      const alert = getAlerts().find(item => item.id === card?.dataset.alertId);
      if (!alert) return;
      const updatedAlert = { ...alert };
      if (button.hasAttribute("data-unsnooze")) {
        delete updatedAlert.snoozedUntil;
      } else {
        const resumeDate = new Date();
        resumeDate.setHours(0, 0, 0, 0);
        resumeDate.setDate(resumeDate.getDate() + Number(button.dataset.snoozeDays));
        updatedAlert.snoozedUntil = `${resumeDate.getFullYear()}-${String(resumeDate.getMonth() + 1).padStart(2, "0")}-${String(resumeDate.getDate()).padStart(2, "0")}`;
      }
      try {
        await updateAlert(updatedAlert);
        renderAlerts(filter, true);
      } catch (error) {
        console.error("Impossible de reporter cette alerte.", error);
        showDemoNotice("Le report de cette alerte n'a pas pu être enregistré.");
      }
    });
  });

  alertList.querySelectorAll("[data-alert-date-form]").forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      event.stopPropagation();
      const card = form.closest("[data-alert-card]");
      const alert = getAlerts().find(item => item.id === card?.dataset.alertId);
      const document = getDocuments().find(item => item.id === alert?.docId);
      const dueDate = form.elements.namedItem("dueDate").value;
      if (!alert || !document || !dueDate) {
        showDemoNotice("Le document source de cette alerte est introuvable.");
        return;
      }

      try {
        const correctedDate = new Date(`${dueDate}T00:00:00`).toLocaleDateString("fr-FR");
        await addDocument({
          ...document,
          alertType: alert.documentType || document.alertType || document.type,
          expiryDate: dueDate,
          expiryDateEvidence: `Échéance corrigée manuellement : ${correctedDate}`,
          expiryDateSource: "user"
        });
        renderAlerts(filter, true);
      } catch (error) {
        console.error("Impossible d'enregistrer la correction de date.", error);
        showDemoNotice("La date corrigée n'a pas pu être enregistrée.");
      }
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
function initHouseView(params = {}) {
  const category = [...document.querySelectorAll('[data-house-category]')]
    .some(tab => tab.dataset.houseCategory === params.filter) ? params.filter : 'tout';
  renderEquipmentList(category);
  initCategoryTabs();

  const addBtn = document.querySelector('#add-equipment-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      openEquipmentForm();
    };
  }
  document.querySelector('#show-all-equipment').onclick = () => {
    showView('maison');
    document.querySelector('[data-house-category="tout"]').focus();
  };

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
  document.querySelector('#family-members-count').textContent =
    `${members.length} membre${members.length > 1 ? 's' : ''}`;

  if (members.length === 0) {
    memberList.innerHTML = '<p class="empty-state">Aucun membre de famille.</p>';
  } else {
    memberList.innerHTML = members.map(member => {
      const isCurrentUser = member.id === currentUser.id;
      const avatarText = member.avatar || (member.name ? member.name.charAt(0).toUpperCase() : '?');
      const accessText = member.access === 'full' ? 'Accès complet' : 'Accès limité';

      return `
        <article class="ui-card member-card">
          <div class="member-avatar" aria-hidden="true">${escapeHtml(avatarText)}</div>
          <strong>${escapeHtml(member.name)}</strong>
          <span>${accessText}</span>
          ${isCurrentUser ? '<span class="member-you">Vous</span>' : ''}
        </article>
      `;
    }).join('');
  }

}

function refreshUploadedDocumentsFromState() {
  const storedDocuments = getDocuments();
  for (let index = 0; index < uploadedDocuments.length; index += 1) {
    const storedDocument = storedDocuments.find(document => document.id === uploadedDocuments[index].id);
    if (storedDocument) uploadedDocuments[index] = storedDocument;
  }
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
        try {
          await deleteFamilyMember(id);
          refreshUploadedDocumentsFromState();
          showDemoNotice('Membre supprimé');
          dialog.close();
          form.reset();
          renderFamilyMembers();
          attachAddMemberListener();
          if (document.querySelector('#manage-members-dialog')?.open) updateManageMembersList(id);
          if (activeView === 'vos-donnees') renderDataInventory(parseHash().params);
        } catch (error) {
          console.error("Impossible de supprimer le membre :", error);
          document.querySelector('#member-form-status').textContent = error.message;
        }
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.querySelector('#member-id-input').value;
    const name = document.querySelector('#member-name-input').value;
    const access = document.querySelector('#member-access-input').value;
    const birthDate = document.querySelector('#member-birth-date-input').value || null;
    const status = document.querySelector('#member-form-status');
    status.textContent = '';

    try {
      if (id) {
        const existingMember = getFamilyMembers().find(member => member.id === id);
        if (!existingMember) throw new Error("Ce membre n'existe plus.");
        await updateFamilyMember({
          ...existingMember,
          name,
          avatar: name.charAt(0).toUpperCase(),
          access,
          birthDate
        });
        showDemoNotice(`Membre modifié : ${name}`);
      } else {
        await addFamilyMember({
          id: `u-${Date.now()}`,
          name,
          role: 'Member',
          avatar: name.charAt(0).toUpperCase(),
          access,
          birthDate
        });
        showDemoNotice(`Membre ajouté : ${name}`);
      }
    } catch (error) {
      console.error("Impossible d'enregistrer le membre :", error);
      status.textContent = error.message;
      return;
    }

    dialog.close();
    form.reset();
    renderFamilyMembers(); // Refresh list
    attachAddMemberListener(); // Re-attach listener
    if (document.querySelector('#manage-members-dialog')?.open) {
      updateManageMembersList(id);
    }
  });

  const birthDateInput = document.querySelector('#member-birth-date-input');
  if (birthDateInput) {
    const today = new Date();
    birthDateInput.max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
}

// Add event listener to the add-member button after rendering
function attachAddMemberListener() {
  const addBtn = document.querySelector('#manage-family-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      openManageMembersModal();
    };
  }
}

function openManageMembersModal() {
  let modal = document.querySelector('#manage-members-dialog');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'manage-members-dialog';
    modal.className = 'ui-dialog';
    modal.setAttribute('aria-labelledby', 'manage-members-title');
    modal.innerHTML = `
      <div class="ui-dialog__header">
        <div><p class="eyebrow">FAMILLE</p><h2 id="manage-members-title">Gérer les membres et accès</h2></div>
        <button class="ui-dialog__close" id="close-manage-members" type="button" aria-label="Fermer les membres" autofocus>×</button>
      </div>
      <p class="household-note">Ces niveaux sont déclaratifs et locaux ; ils ne configurent pas de droits sur les fichiers originaux.</p>
      <div class="household-form">
        <div id="manage-members-list"></div>
        <button class="ui-button ui-button--primary" id="open-add-member-from-manager" type="button">Ajouter un membre</button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#close-manage-members').addEventListener('click', () => modal.close());
    modal.querySelector('#open-add-member-from-manager').addEventListener('click', () => {
      document.querySelector('#add-member-form').reset();
      document.querySelector('#member-id-input').value = '';
      document.querySelector('#delete-member-btn').hidden = true;
      document.querySelector('#member-form-status').textContent = '';
      document.querySelector('#add-member-title').textContent = 'Ajouter un membre';
      document.querySelector('#add-member-dialog').showModal();
    });
  }

  updateManageMembersList();
  modal.showModal();
}

function updateManageMembersList(restoreFocusId = null) {
  const listContainer = document.querySelector('#manage-members-list');
  if (!listContainer) return;

  const members = getFamilyMembers();
  const currentUser = getCurrentUser();

  listContainer.innerHTML = members.map(member => {
    const isCurrentUser = member.id === currentUser.id;
    return `
      <div class="managed-member" data-member-id="${escapeHtml(member.id)}">
        <div class="managed-member-info">
          <div class="member-avatar" aria-hidden="true">${escapeHtml(member.avatar || member.name.charAt(0))}</div>
          <div class="managed-member-copy">
            <strong>${escapeHtml(member.name)}</strong> ${isCurrentUser ? '<span class="member-you">Vous</span>' : ''}
            <div class="household-note">${member.access === 'full' ? 'Accès complet' : 'Accès limité'}</div>
          </div>
        </div>
        <div class="managed-member-actions">
          <button type="button" class="edit-member-item ui-button ui-button--secondary" data-id="${escapeHtml(member.id)}" aria-label="Modifier ${escapeHtml(member.name)}">Modifier</button>
          ${!isCurrentUser ? `<button type="button" class="delete-member-item ui-button ui-button--danger" data-id="${escapeHtml(member.id)}" aria-label="Supprimer ${escapeHtml(member.name)}">Supprimer</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  if (restoreFocusId !== null) {
    const focusTarget = listContainer.querySelector(`.edit-member-item[data-id="${CSS.escape(restoreFocusId)}"]`)
      || document.querySelector('#open-add-member-from-manager');
    focusTarget.focus();
  }

  listContainer.querySelectorAll('.edit-member-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const member = getFamilyMembers().find(m => m.id === id);
      if (member) {
        document.querySelector('#member-id-input').value = member.id;
        document.querySelector('#member-name-input').value = member.name;
        document.querySelector('#member-birth-date-input').value = member.birthDate || '';
        document.querySelector('#member-access-input').value = member.access;
        document.querySelector('#member-form-status').textContent = '';
        document.querySelector('#add-member-title').textContent = 'Modifier un membre';
        document.querySelector('#delete-member-btn').hidden = false;
        document.querySelector('#add-member-dialog').showModal();
      }
    });
  });

  listContainer.querySelectorAll('.delete-member-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Voulez-vous vraiment supprimer ce membre ?')) {
        try {
          await deleteFamilyMember(id);
          refreshUploadedDocumentsFromState();
          showDemoNotice('Membre supprimé');
          updateManageMembersList(id);
          renderFamilyMembers();
          if (activeView === 'vos-donnees') renderDataInventory(parseHash().params);
        } catch (error) {
          console.error("Impossible de supprimer le membre :", error);
          showDemoNotice(`Suppression impossible : ${error.message}`);
        }
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
 * Initialize import view (drag & drop and file selection)
 */
function initImportView() {
  const dropZone = document.querySelector('#drop-zone');
  const importInput = document.querySelector('#import-input');
  const folderInput = document.querySelector('#folder-input');
  const cameraInput = document.querySelector('#camera-input');
  const folderSelectionHelp = document.querySelector('#folder-selection-help');
  const importOptions = document.querySelectorAll('.import-option');
  if (!dropZone || !importInput || !folderInput || !cameraInput || !importOptions) return;

  const isMobileDevice = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (folderSelectionHelp) folderSelectionHelp.hidden = !isMobileDevice;

  document.querySelector('#choose-import-files').addEventListener('click', () => importInput.click());
  dropZone.addEventListener('click', (event) => {
    if (event.target === importInput || event.target.closest('button')) return;
    importInput.click();
  });

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
      loadLocalFiles(files, importInput);
    }
  });

  importInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadLocalFiles(files, importInput);
    }
  });

  folderInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadLocalFiles(files, folderInput);
    }
  });

  cameraInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadLocalFiles(files, cameraInput);
    }
  });

  // Gestion des boutons d'options d'import
  importOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      const action = option.dataset.action;
      e.preventDefault();

      switch (action) {
        case 'camera':
          cameraInput.click();
          if (!isMobileDevice) {
            showDemoNotice("La capture directe est disponible depuis un appareil mobile.");
          }
          break;

        case 'folder':
          if (isMobileDevice || !('webkitdirectory' in folderInput)) {
            showDemoNotice("Sélectionnez plusieurs fichiers dans le dossier de votre choix.");
            importInput.click();
          } else {
            folderInput.click();
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
  const returnFocus = document.activeElement;
  const documentId = `manual-${Date.now()}`;
  const dialog = document.createElement('dialog');
  dialog.id = 'manual-entry-dialog';
  dialog.className = 'ui-dialog';
  dialog.setAttribute('aria-labelledby', 'manual-entry-title');
  dialog.innerHTML = `
      <div class="ui-dialog__header">
        <div><p class="eyebrow">AJOUT LOCAL</p><h2 id="manual-entry-title">Saisie manuelle</h2></div>
        <button class="ui-dialog__close" type="button" data-close-manual aria-label="Fermer la saisie manuelle">×</button>
      </div>
      <p class="household-note">Une fiche texte sera enregistrée sur cet appareil, sans fichier PDF original.</p>
      <form id="manual-form" class="household-form">
        <div class="field">
          <label class="ui-label" for="manual-title">Titre du document</label>
          <input class="ui-input" type="text" id="manual-title" placeholder="Ex. : Facture électricité janvier" required autofocus>
        </div>
        <div class="field">
          <label class="ui-label" for="manual-type">Type de document</label>
          <select class="ui-input" id="manual-type">
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
        <div class="field">
          <label class="ui-label" for="manual-content">Contenu principal (facultatif)</label>
          <textarea class="ui-input" id="manual-content" rows="3"></textarea>
        </div>
        <p id="manual-form-status" role="status" aria-live="polite"></p>
        <div class="household-form-actions">
          <button type="button" class="ui-button ui-button--secondary" data-close-manual>Annuler</button>
          <button type="submit" class="ui-button ui-button--primary">Enregistrer</button>
        </div>
      </form>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
  }, { once: true });
  dialog.querySelectorAll('[data-close-manual]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });

  // Gestion de la soumission
  dialog.querySelector('#manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = dialog.querySelector('#manual-title').value.trim();
    const type = document.querySelector('#manual-type').value;
    const content = document.querySelector('#manual-content').value;

    if (!title) {
      dialog.querySelector('#manual-form-status').textContent = "Veuillez entrer un titre pour le document.";
      dialog.querySelector('#manual-title').focus();
      return;
    }

    const context = parseDocument(content || `Document saisi manuellement : ${title}`, `${title}.pdf`);
    // Créer un document factice mais complet
    const newDoc = {
      id: documentId,
      name: `${title}.pdf`,
      type: type,
      date: new Date().toLocaleDateString('fr-FR'),
      keywords: title.toLowerCase(),
      summary: content || "Document saisi manuellement",
      content: content || `Document saisi manuellement : ${title}`,
      alertType: context.type,
      expiryDate: context.expiryDate,
      expiryDateEvidence: context.expiryDateEvidence,
      provider: context.provider,
      isLocal: true,
      sourceDir: "Saisie manuelle"
    };

    const submit = dialog.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await addDocument(newDoc);
    } catch (error) {
      console.error("Impossible d'enregistrer la saisie manuelle :", error);
      dialog.querySelector('#manual-form-status').textContent = "L'enregistrement n'a pas pu être terminé. Réessayez.";
      submit.disabled = false;
      return;
    }
    uploadedDocuments.push(newDoc);
    refreshExperimentalIndex();

    dialog.close();
    showDemoNotice(`Document "${title}" créé avec succès (saisie manuelle).`);
  });
}

// Initialize the application
initHouseView();
initFamilyView();
initProfileHandlers();
initImportView();
initAssistantView();

/**
 * Render data inventory for Vos données view
 * @param {Object} filters - Optional filters: { type, category }
 */
function renderDataInventory(filters = {}) {
  const dataList = document.querySelector('#data-inventory-list');
  if (!dataList) return;

  const demoFallback = uploadedDocuments.length === 0 ? documents : [];
  const allDocuments = mergeInventoryDocuments(demoFallback, uploadedDocuments);
  const counts = countInventorySources(allDocuments);
  document.querySelector('#summary-total').textContent = String(counts.total);
  document.querySelector('#summary-local').textContent = String(counts.local);
  document.querySelector('#summary-drive').textContent = String(counts.drive);
  document.querySelector('#summary-onedrive').textContent = String(counts.onedrive);
  document.querySelector('#summary-demo').textContent = String(counts.demo);

  const docs = filterInventoryDocuments(allDocuments, filters);
  document.querySelector('#data-inventory-status').textContent =
    `${docs.length} fichier${docs.length > 1 ? 's' : ''} affiché${docs.length > 1 ? 's' : ''} sur ${counts.total}`;

  if (docs.length === 0) {
    dataList.replaceChildren();
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    const message = document.createElement('p');
    message.textContent = 'Aucun document trouvé pour ces critères.';
    const clearButton = document.createElement('button');
    clearButton.className = 'ui-button ui-button--secondary';
    clearButton.type = 'button';
    clearButton.dataset.filterClear = '';
    clearButton.textContent = 'Afficher tous les fichiers';
    emptyState.append(message, clearButton);
    dataList.append(emptyState);
    return;
  }

  dataList.replaceChildren();
  docs.forEach((doc) => {
    const source = getInventorySource(doc);
    const sourceText = source === 'onedrive'
      ? `OneDrive · ${formatOneDriveAccountFingerprint(doc.oneDriveAccountFingerprint)}`
      : source === 'drive'
      ? 'Google Drive'
      : source === 'local'
        ? doc.sourceDir && Capacitor.isNativePlatform() ? 'Stockage local' : 'Fichier local'
        : doc.driveDemo ? 'Drive simulé' : 'Démonstration';
    const row = document.createElement('div');
    row.className = 'data-file-row';
    row.dataset.documentId = doc.id;

    const info = document.createElement('div');
    info.className = 'data-file-info';
    const icon = document.createElement('span');
    icon.className = 'ui-icon data-file-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';

    const details = document.createElement('div');
    details.className = 'data-file-details';
    const name = document.createElement('div');
    name.className = 'data-file-name';
    name.textContent = doc.name;
    const meta = document.createElement('div');
    meta.className = 'data-file-meta';
    const typeBadge = document.createElement('span');
    typeBadge.className = `data-badge data-badge--type data-type-${getInventoryTypeKey(doc)}`;
    typeBadge.textContent = doc.type || 'Document';
    const sourceBadge = document.createElement('span');
    sourceBadge.className = `data-badge data-badge--source data-source-${source}`;
    sourceBadge.textContent = sourceText;
    const indexStatus = getInventoryIndexStatus(doc);
    const indexBadge = document.createElement('span');
    indexBadge.className = `data-badge data-badge--index data-index-${indexStatus}`;
    indexBadge.textContent = indexStatus === 'text' ? 'Texte indexé' : 'Métadonnées seules';
    const date = document.createElement('span');
    date.className = 'data-file-date';
    date.textContent = doc.date || 'Session';
    meta.append(typeBadge, sourceBadge, indexBadge, date);
    if (isPhotoDocument(doc)) {
      const currentAnnotations = doc.photoAnnotations;
      const memberIds = Array.isArray(currentAnnotations?.personIds) ? currentAnnotations.personIds : [];
      const eventTags = Array.isArray(currentAnnotations?.eventTags) ? currentAnnotations.eventTags : [];
      const memberNames = getFamilyMembers()
        .filter(member => memberIds.includes(member.id))
        .map(member => member.name);
      const annotationSummary = document.createElement('p');
      annotationSummary.className = 'data-file-annotations';
      annotationSummary.textContent = [
        memberNames.length ? `Membres : ${memberNames.join(', ')}` : '',
        eventTags.length ? `Événements : ${eventTags.join(', ')}` : '',
        currentAnnotations?.placeSource === 'user' && currentAnnotations.placeLabel
          ? `Lieu : ${currentAnnotations.placeLabel}`
          : ''
      ].filter(Boolean).join(' · ') || 'Aucune association manuelle';
      details.append(name, meta, annotationSummary);
    } else {
      details.append(name, meta);
    }
    info.append(icon, details);

    const size = document.createElement('div');
    size.className = 'data-file-size';
    size.textContent = doc.content ? `${Math.round(doc.content.length / 1024)} Ko` : '—';

    const actions = document.createElement('div');
    actions.className = 'data-file-actions';
    const isPhoto = isPhotoDocument(doc);
    const previewButton = document.createElement('button');
    previewButton.className = 'ui-button ui-button--secondary data-file-open';
    previewButton.type = 'button';
    previewButton.textContent = isPhoto ? 'Détail' : 'Aperçu';
    previewButton.setAttribute('aria-label', isPhoto ? `Voir le détail de ${doc.name}` : `Consulter ${doc.name}`);
    previewButton.addEventListener('click', () => {
      openDocumentPreview(doc);
    });
    actions.append(previewButton);

    if (isPhoto) {
      const associateButton = document.createElement('button');
      associateButton.className = 'ui-button ui-button--secondary data-file-open';
      associateButton.type = 'button';
      associateButton.textContent = 'Associer';
      associateButton.dataset.photoAnnotations = '';
      associateButton.setAttribute('aria-label', `Associer des membres ou événements à ${doc.name}`);
      associateButton.addEventListener('click', () => {
        try {
          openPhotoAnnotationsDialog(doc);
        } catch (error) {
          console.error("Impossible d'ouvrir les associations de la photo :", error);
          showDemoNotice(error.message);
        }
      });
      actions.prepend(associateButton);
    }
    row.append(info, size, actions);
    dataList.append(row);
  });
}

function initUnifiedPhotoResults() {
  const status = document.querySelector('#moments-life-search-status');
  const results = document.querySelector('#moments-life-search-results');
  const pagination = document.querySelector('#moments-life-pagination');
  const groupingControls = document.querySelector('#moments-life-grouping-controls');
  const groupingSelect = document.querySelector('#moments-life-grouping');
  const previousPageButton = document.querySelector('#moments-life-previous-page');
  const nextPageButton = document.querySelector('#moments-life-next-page');
  const pageStatus = document.querySelector('#moments-life-page-status');
  const actions = document.querySelector('#moments-life-search-actions');
  const correctAnnotationsButton = document.querySelector('#moments-life-correct-annotations');
  const selectionToolbar = document.querySelector('#moments-life-selection-toolbar');
  const selectPageCheckbox = document.querySelector('#moments-life-select-page');
  const selectionStatus = document.querySelector('#moments-life-selection-status');
  const deleteSelectedButton = document.querySelector('#moments-life-delete-selected');
  const deleteDialog = document.querySelector('#photo-delete-confirmation');
  const deleteDescription = document.querySelector('#photo-delete-description');
  const deleteStatus = document.querySelector('#photo-delete-status');
  const confirmDeleteButton = document.querySelector('#confirm-photo-delete');
  const selectedPhotoIds = new Set();
  if (!status || !results) return () => {};

  const pageSize = 24;
  let photoResults = [];
  let currentPage = 0;
  let thumbnailObserver = null;

  function getCurrentPageResults() {
    const start = currentPage * pageSize;
    return photoResults.slice(start, start + pageSize);
  }

  function updateSelectionUI() {
    const currentPageIds = getCurrentPageResults().map(item => item.photo.id);
    const selectedOnPage = currentPageIds.filter(id => selectedPhotoIds.has(id)).length;
    if (selectionToolbar) selectionToolbar.hidden = photoResults.length === 0;
    if (selectPageCheckbox) {
      selectPageCheckbox.checked = currentPageIds.length > 0 && selectedOnPage === currentPageIds.length;
      selectPageCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < currentPageIds.length;
      selectPageCheckbox.disabled = currentPageIds.length === 0;
    }
    if (selectionStatus) {
      const count = selectedPhotoIds.size;
      selectionStatus.textContent = count === 0
        ? 'Aucune photo sélectionnée'
        : `${count} photo${count === 1 ? '' : 's'} sélectionnée${count === 1 ? '' : 's'}`;
    }
    if (deleteSelectedButton) deleteSelectedButton.disabled = selectedPhotoIds.size === 0;
    results.querySelectorAll('[data-photo-select]').forEach(checkbox => {
      checkbox.checked = selectedPhotoIds.has(checkbox.value);
    });
  }

  function observeThumbnail(image) {
    if (image.hasAttribute('src') || !image.dataset.thumbnail) return;
    if (thumbnailObserver) thumbnailObserver.observe(image);
    else image.src = image.dataset.thumbnail;
  }

  function suspendThumbnails() {
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    results.querySelectorAll('img[data-thumbnail]').forEach(image => image.removeAttribute('src'));
  }

  function resumeThumbnails() {
    if (results.closest('[data-view]')?.hidden) return;
    thumbnailObserver?.disconnect();
    thumbnailObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.src = entry.target.dataset.thumbnail;
          thumbnailObserver.unobserve(entry.target);
        }
      }, { rootMargin: '160px' })
      : null;
    results.querySelectorAll('img[data-thumbnail]').forEach(observeThumbnail);
  }

  function clearResults() {
    suspendThumbnails();
    results.replaceChildren();
    results.hidden = true;
    photoResults = [];
    currentPage = 0;
    if (previousPageButton) previousPageButton.hidden = true;
    if (nextPageButton) nextPageButton.hidden = true;
    if (pageStatus) pageStatus.textContent = '';
    if (pagination) pagination.hidden = true;
    if (groupingControls) groupingControls.hidden = true;
    if (actions) actions.hidden = true;
    selectedPhotoIds.clear();
    if (selectPageCheckbox) {
      selectPageCheckbox.checked = false;
      selectPageCheckbox.indeterminate = false;
    }
    updateSelectionUI();
  }

  function openPhotoDeleteConfirmation() {
    if (!deleteDialog || !deleteDescription || !deleteStatus || selectedPhotoIds.size === 0) return;
    deleteDescription.textContent = `${selectedPhotoIds.size} photo${selectedPhotoIds.size === 1 ? '' : 's'} et leurs vignettes, métadonnées et annotations seront supprimées de Famili-IA.`;
    deleteStatus.hidden = true;
    deleteStatus.textContent = '';
    deleteStatus.removeAttribute('data-state');
    deleteDialog.showModal();
  }

  function renderPhotoResult(item) {
    const row = document.createElement('li');
    row.className = 'ui-card moments-life-result';
    const selectionLabel = document.createElement('label');
    selectionLabel.className = 'moments-life-photo-select';
    const selectionCheckbox = document.createElement('input');
    selectionCheckbox.type = 'checkbox';
    selectionCheckbox.value = item.photo.id;
    selectionCheckbox.dataset.photoSelect = '';
    selectionCheckbox.checked = selectedPhotoIds.has(item.photo.id);
    selectionCheckbox.setAttribute('aria-label', `Sélectionner ${item.photo.name || item.photo.originalName || 'la photo'} pour suppression`);
    const selectionCopy = document.createElement('span');
    selectionCopy.textContent = 'Sélectionner';
    selectionLabel.append(selectionCheckbox, selectionCopy);
    row.append(selectionLabel);

    const thumbnailDataUrl = getPhotoThumbnailDataUrl(item.photo.photoThumbnail);
    if (thumbnailDataUrl) {
      row.classList.add('moments-life-result--with-thumbnail');
      const thumbnail = document.createElement('img');
      thumbnail.className = 'moments-life-thumbnail';
      thumbnail.alt = `Aperçu de ${item.photo.name || item.photo.originalName || 'la photo'}`;
      thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      thumbnail.dataset.thumbnail = thumbnailDataUrl;
      row.append(thumbnail);
    }

    const title = document.createElement('strong');
    title.textContent = `${item.rank}. ${item.photo.name || item.photo.originalName || 'Photo sans nom'}`;
    row.append(title);

    const dateInfo = getPhotoTimelineDateInfo(item.photo);
    const details = [getTimelineDateLabel(dateInfo)];
    const importedAt = item.photo.importedAt;
    details.push(importedAt ? `Importée dans Famili-IA : ${importedAt.slice(0, 10)}` : "Date d'import : indisponible");
    const annotation = item.photo.photoAnnotations;
    const memberNames = getFamilyMembers()
      .filter(member => annotation?.personIds?.includes(member.id))
      .map(member => member.name);
    details.push(memberNames.length ? `Membres associés (saisie manuelle) : ${memberNames.join(', ')}` : 'Aucun membre associé manuellement');
    if (annotation?.placeSource === 'user' && annotation.placeLabel) {
      details.push(`Lieu saisi manuellement : ${annotation.placeLabel}`);
    }
    const eventTags = annotation?.eventTags ?? item.photo.eventTags ?? [];
    if (Array.isArray(eventTags) && eventTags.length > 0) {
      details.push(`Événements saisis : ${eventTags.filter(tag => typeof tag === 'string').join(', ')}`);
    }
    for (const detailText of details) {
      const detail = document.createElement('span');
      detail.textContent = detailText;
      row.append(detail);
    }

    const criteria = item.reasons.map(reason => reason.phrase).filter(Boolean).join(', ');
    const metadata = document.createElement('span');
    metadata.className = 'moments-life-confidence';
    metadata.textContent = criteria
      ? `Critères interprétés : ${criteria}`
      : 'Métadonnées et annotations explicites indexées dans Famili-IA.';
    row.append(metadata);

    const actions = document.createElement('div');
    actions.className = 'moments-life-result-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'ui-button ui-button--secondary';
    openButton.textContent = 'Détail';
    openButton.setAttribute('aria-label', `Voir le détail de ${item.photo.name || item.photo.originalName || 'la photo'}`);
    openButton.addEventListener('click', () => openPhotoDetailsDialog(item.photo));
    const correctButton = document.createElement('button');
    correctButton.type = 'button';
    correctButton.className = 'ui-button ui-button--secondary';
    correctButton.textContent = 'Corriger les annotations';
    correctButton.addEventListener('click', () => openPhotoAnnotationsDialog(item.photo));
    actions.append(openButton, correctButton);
    row.append(actions);
    return row;
  }

  function renderResultsPage() {
    suspendThumbnails();
    results.replaceChildren();
    const start = currentPage * pageSize;
    const pageResults = photoResults.slice(start, start + pageSize);
    const groups = groupPhotosForTimeline(pageResults, groupingSelect?.value || "day");
    for (const group of groups) {
      const groupItem = document.createElement('li');
      groupItem.className = `moments-life-timeline-group moments-life-timeline-group--${group.kind}`;
      const heading = document.createElement('h3');
      heading.textContent = group.label;
      groupItem.append(heading);
      const entries = document.createElement('ol');
      entries.className = 'moments-life-timeline-entries';
      for (const entry of group.entries) {
        entries.append(renderPhotoResult(entry.result));
      }
      groupItem.append(entries);
      results.append(groupItem);
    }

    const pageCount = Math.ceil(photoResults.length / pageSize);
    results.hidden = pageResults.length === 0;
    if (previousPageButton) previousPageButton.hidden = currentPage === 0;
    if (nextPageButton) nextPageButton.hidden = currentPage >= pageCount - 1;
    if (pageStatus) pageStatus.textContent = pageCount > 1 ? `Page ${currentPage + 1} sur ${pageCount}` : '';
    if (pagination) pagination.hidden = pageCount <= 1;
    if (groupingControls) groupingControls.hidden = photoResults.length === 0;
    updateSelectionUI();
    resumeThumbnails();
  }

  suspendPhotoThumbnailRendering = suspendThumbnails;
  resumePhotoThumbnailRendering = resumeThumbnails;

  previousPageButton?.addEventListener('click', () => {
    if (currentPage === 0) return;
    currentPage -= 1;
    renderResultsPage();
  });
  nextPageButton?.addEventListener('click', () => {
    if ((currentPage + 1) * pageSize >= photoResults.length) return;
    currentPage += 1;
    renderResultsPage();
  });
  selectPageCheckbox?.addEventListener('change', () => {
    for (const item of getCurrentPageResults()) {
      if (selectPageCheckbox.checked) selectedPhotoIds.add(item.photo.id);
      else selectedPhotoIds.delete(item.photo.id);
    }
    updateSelectionUI();
  });
  results.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-photo-select]');
    if (!checkbox) return;
    if (checkbox.checked) selectedPhotoIds.add(checkbox.value);
    else selectedPhotoIds.delete(checkbox.value);
    updateSelectionUI();
  });
  deleteSelectedButton?.addEventListener('click', openPhotoDeleteConfirmation);

  const closeDeleteDialog = () => {
    if (confirmDeleteButton?.disabled) return;
    if (deleteDialog?.open) deleteDialog.close();
  };
  document.querySelector('#close-photo-delete')?.addEventListener('click', closeDeleteDialog);
  document.querySelector('#cancel-photo-delete')?.addEventListener('click', closeDeleteDialog);
  deleteDialog?.addEventListener('cancel', event => {
    if (confirmDeleteButton?.disabled) event.preventDefault();
  });
  confirmDeleteButton?.addEventListener('click', async () => {
    if (selectedPhotoIds.size === 0 || !deleteStatus || !confirmDeleteButton) return;
    confirmDeleteButton.disabled = true;
    const cancelButton = document.querySelector('#cancel-photo-delete');
    const closeButton = document.querySelector('#close-photo-delete');
    if (cancelButton) cancelButton.disabled = true;
    if (closeButton) closeButton.disabled = true;
    deleteStatus.hidden = true;

    let deletedCount = 0;
    const failed = [];
    for (const id of [...selectedPhotoIds]) {
      const photo = photoResults.find(item => item.photo.id === id)?.photo;
      if (!photo || !isPhotoDocument(photo)) {
        selectedPhotoIds.delete(id);
        continue;
      }
      try {
        await deleteDocument(id);
        for (let index = uploadedDocuments.length - 1; index >= 0; index -= 1) {
          if (uploadedDocuments[index].id === id) uploadedDocuments.splice(index, 1);
        }
        selectedPhotoIds.delete(id);
        photoResults = photoResults.filter(item => item.photo.id !== id);
        deletedCount += 1;
      } catch (error) {
        console.error(`Impossible de supprimer la photo ${id} des données Famili-IA :`, error);
        failed.push(error instanceof Error ? error.message : 'Erreur inattendue');
      }
    }

    currentPage = Math.min(currentPage, Math.max(0, Math.ceil(photoResults.length / pageSize) - 1));
    renderResultsPage();
    refreshExperimentalIndex();
    if (deletedCount > 0) {
      status.textContent = `${deletedCount} photo${deletedCount === 1 ? '' : 's'} supprimée${deletedCount === 1 ? '' : 's'} de Famili-IA. Les fichiers originaux sont préservés.`;
    }
    if (failed.length > 0) {
      deleteStatus.textContent = `${deletedCount} photo${deletedCount === 1 ? '' : 's'} supprimée${deletedCount === 1 ? '' : 's'} ; ${failed.length} suppression${failed.length === 1 ? '' : 's'} a échoué. ${failed.join(' ')}`;
      deleteStatus.dataset.state = 'error';
      deleteStatus.hidden = false;
      confirmDeleteButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      if (closeButton) closeButton.disabled = false;
      updateSelectionUI();
      return;
    }

    deleteDialog.close();
    confirmDeleteButton.disabled = false;
    if (cancelButton) cancelButton.disabled = false;
    if (closeButton) closeButton.disabled = false;
  });

  groupingSelect?.addEventListener('change', () => {
    currentPage = 0;
    renderResultsPage();
  });

  correctAnnotationsButton?.addEventListener('click', () => {
    showView('vos-donnees', { params: { category: 'Images' } });
  });

  return (matches, request = {}, documentsByMatch = new Map()) => {
    clearResults();
    const photos = matches
      .map(match => documentsByMatch.get(JSON.stringify([match.sourceId, match.itemId])))
      .filter(isPhotoDocument)
      .map((photo, index) => ({
        photo,
        rank: index + 1,
        reasons: request.explanations ?? [],
        confidence: { level: 'high', label: 'index local', reasons: [] }
      }));
    document.querySelector('#moments-life-search').hidden = !photos.length && request.kind !== 'photo';
    if (!photos.length) {
      status.textContent = request.kind === 'photo'
        ? "Aucune photo ne correspond à ces critères parmi les photos indexées dans Famili-IA."
        : "";
      return;
    }
    photoResults = photos;
    const criteria = request.explanations?.map(item => item.phrase).filter(Boolean).join(', ');
    status.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'} trouvée${photos.length === 1 ? '' : 's'} dans les résultats multi-sources${criteria ? `. Critères : ${criteria}` : ''}.`;
    if (actions) actions.hidden = false;
    renderResultsPage();
  };
}

function openPhotoAnnotationsDialog(photo) {
  const dialog = document.querySelector('#photo-annotations-dialog');
  const form = document.querySelector('#photo-annotations-form');
  const membersContainer = document.querySelector('#photo-annotations-members');
  const annotations = normalizePhotoAnnotations(
    photo.photoAnnotations,
    getFamilyMembers().map(member => member.id)
  );
  document.querySelector('#photo-annotations-document-id').value = photo.id;
  document.querySelector('#photo-annotations-file-name').textContent = photo.name;
  document.querySelector('#photo-event-tags-input').value = annotations.eventTags.join('\n');
  document.querySelector('#photo-place-input').value = annotations.placeLabel || '';
  document.querySelector('#photo-capture-date-override').value = annotations.captureDateOverride?.localDateTime || '';
  document.querySelector('#photo-annotations-status').textContent = '';
  membersContainer.replaceChildren();

  const members = getFamilyMembers();
  if (members.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.textContent = "Ajoutez d'abord un membre dans l'espace Famille, ou associez seulement un événement.";
    membersContainer.append(emptyState);
  }
  for (const member of members) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'personIds';
    checkbox.value = member.id;
    checkbox.checked = annotations.personIds.includes(member.id);
    label.append(checkbox, document.createTextNode(` ${member.name}`));
    membersContainer.append(label);
  }

  form.dataset.documentName = photo.name;
  dialog.showModal();
}

function initPhotoAnnotationsDialog() {
  const dialog = document.querySelector('#photo-annotations-dialog');
  const form = document.querySelector('#photo-annotations-form');
  const cancelButton = document.querySelector('#cancel-photo-annotations-dialog');
  const closeButton = document.querySelector('#close-photo-annotations-dialog');
  if (!dialog || !form) return;

  cancelButton.addEventListener('click', () => dialog.close());
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const status = document.querySelector('#photo-annotations-status');
    const documentId = document.querySelector('#photo-annotations-document-id').value;
    const personIds = [...form.querySelectorAll('input[name="personIds"]:checked')]
      .map(checkbox => checkbox.value);
    const eventTags = document.querySelector('#photo-event-tags-input').value
      .split(/\r?\n/)
      .map(tag => tag.trim())
      .filter(Boolean);
    const placeLabel = document.querySelector('#photo-place-input').value.trim();
    const captureDateOverride = document.querySelector('#photo-capture-date-override').value;

    status.textContent = '';
    try {
      const updatedDocument = await updatePhotoAnnotations(documentId, {
        personIds,
        eventTags,
        placeLabel,
        placeSource: placeLabel ? 'user' : null,
        captureDateOverride: captureDateOverride || null
      });
      const uploadedIndex = uploadedDocuments.findIndex(document => document.id === documentId);
      if (uploadedIndex !== -1) uploadedDocuments[uploadedIndex] = updatedDocument;
      else uploadedDocuments.push(updatedDocument);
      dialog.close();
      renderDataInventory(parseHash().params);
      if (activeView === 'vos-donnees') {
        document.querySelector(`[data-document-id="${CSS.escape(documentId)}"] [data-photo-annotations]`)?.focus();
      }
      refreshExperimentalIndex();
      showDemoNotice(`Associations enregistrées pour ${updatedDocument.name}.`);
    } catch (error) {
      console.error("Impossible d'enregistrer les associations de la photo :", error);
      status.textContent = error.message;
    }
  });
}

/**
 * Initialize Vos données view
 * @param {Object} filters - Optional filters passed from URL
 */
function initDataView(filters = {}) {
  renderDataInventory(filters);

  const dataView = document.querySelector('#view-vos-donnees');
  if (dataView && !dataView.dataset.filtersInitialized) {
    dataView.dataset.filtersInitialized = 'true';
    dataView.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter-type], [data-filter-category], [data-filter-clear]');
      if (!chip) return;

      const { params: currentFilters } = parseHash();
      const nextFilters = { ...currentFilters };

      if (chip.hasAttribute('data-filter-clear')) {
        delete nextFilters.type;
        delete nextFilters.category;
      } else if (chip.dataset.filterType) {
        const selectedType = chip.dataset.filterType;
        if (selectedType === 'document') {
          delete nextFilters.type;
          delete nextFilters.category;
        } else {
          nextFilters.type = selectedType;
        }
        if (isInventoryDocumentType(nextFilters.category)) delete nextFilters.category;
      } else if (chip.dataset.filterCategory) {
        const selectedCategory = chip.dataset.filterCategory;
        if (nextFilters.category?.toLocaleLowerCase('fr') === selectedCategory.toLocaleLowerCase('fr')) {
          delete nextFilters.category;
        } else {
          nextFilters.category = selectedCategory;
        }
      }

      showView('vos-donnees', { params: nextFilters });
      if (chip.hasAttribute('data-filter-clear')) {
        dataView.querySelector('[data-filter-type="document"]').focus();
      }
    });
  }

  const currentFilters = filters;
  const selectedType = String(currentFilters.type || '').toLocaleLowerCase('fr');
  const selectedCategory = String(currentFilters.category || '').toLocaleLowerCase('fr');
  const legacyDocumentType = isInventoryDocumentType(currentFilters.category);
  dataView?.querySelectorAll('[data-filter-type]').forEach((chip) => {
    const chipType = chip.dataset.filterType.toLocaleLowerCase('fr');
    const selected = chipType === 'document'
      ? (!selectedType || selectedType === 'document') && !currentFilters.category
      : selectedType === chipType || (legacyDocumentType && selectedCategory === chipType);
    chip.classList.toggle('is-selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  dataView?.querySelectorAll('[data-filter-category]').forEach((chip) => {
    const selected = selectedCategory === chip.dataset.filterCategory.toLocaleLowerCase('fr');
    chip.classList.toggle('is-selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });

  if (dataView?.dataset.actionsInitialized) return;
  if (dataView) dataView.dataset.actionsInitialized = 'true';

  const exportBtn = document.querySelector('#export-all-data');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataToExport = redactPhotoLocationsForExport(getFullState());
      const dataStr = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'famili-ia-data.json';
      a.click();
      URL.revokeObjectURL(url);
      showDemoNotice('Données exportées vers famili-ia-data.json. Les coordonnées GPS des photos sont exclues par défaut.');
    });
  }

  // PDF Export - Génère un rapport PDF des données exportées
  const pdfExportBtn = document.querySelector('#export-pdf-data');
  if (pdfExportBtn) {
    pdfExportBtn.addEventListener('click', () => {
      const dataToExport = redactPhotoLocationsForExport(getFullState());
      dataToExport.documents = dataToExport.documents.map(document => {
        const exportedDocument = { ...document };
        delete exportedDocument.photoThumbnail;
        return exportedDocument;
      });
      const dataStr = JSON.stringify(dataToExport, null, 2);
      const pdfContent = generatePDF(dataStr);
      const blob = new Blob([pdfContent], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'famili-ia-data.pdf';
      a.click();
      URL.revokeObjectURL(url);
      showDemoNotice('Rapport PDF généré : famili-ia-data.pdf. Les coordonnées GPS des photos sont exclues par défaut.');
    });
  }

  const purgeBtn = document.querySelector('#purge-all-data');
  const purgeDialog = document.querySelector('#purge-confirmation');
  const purgeStatus = document.querySelector('#purge-status');
  const confirmPurgeBtn = document.querySelector('#confirm-purge');
  const cancelPurgeBtn = document.querySelector('#cancel-purge');
  const closePurgeBtn = document.querySelector('#close-purge-confirmation');
  const closePurgeDialog = () => {
    if (purgeDialog?.open) purgeDialog.close();
  };

  closePurgeBtn?.addEventListener('click', closePurgeDialog);
  cancelPurgeBtn?.addEventListener('click', closePurgeDialog);
  purgeDialog?.addEventListener('cancel', (event) => {
    if (confirmPurgeBtn?.disabled) event.preventDefault();
  });

  if (purgeBtn) {
    purgeBtn.addEventListener('click', () => {
      if (purgeStatus) {
        purgeStatus.hidden = true;
        purgeStatus.textContent = '';
        purgeStatus.removeAttribute('data-state');
      }
      purgeDialog?.showModal();
    });
  }

  confirmPurgeBtn?.addEventListener('click', async () => {
    if (!purgeStatus || !confirmPurgeBtn) return;
    if (removingSessionFiles) {
      purgeStatus.textContent = "Une suppression est déjà en cours.";
      purgeStatus.dataset.state = 'error';
      purgeStatus.hidden = false;
      return;
    }

    confirmPurgeBtn.disabled = true;
    if (cancelPurgeBtn) cancelPurgeBtn.disabled = true;
    if (closePurgeBtn) closePurgeBtn.disabled = true;
    purgeStatus.hidden = true;
    try {
      driveSelectionGeneration += 1;
      removingSessionFiles = true;
      if (driveSelectionSettled) await driveSelectionSettled;
      oneDriveScanController?.abort();
      if (oneDriveScanSettled) await oneDriveScanSettled;
      await stopBackgroundScans();
      const shouldRevokeGoogleAccess = Boolean(googleDriveClient?.hasAccessToken);
      await resetState();
      uploadedDocuments.length = 0;
      refreshExperimentalIndex();
      if (!clearFamilyState()) {
        throw new Error('Les données IndexedDB ont été supprimées, mais les données de famille dans le stockage du navigateur n’ont pas pu être effacées.');
      }

      if (sourceDialog.open) sourceDialog.close();
      if (localFilesInput) localFilesInput.value = '';
      documentList?.replaceChildren();
      if (answerText) answerText.textContent = '';
      if (resultCount) resultCount.textContent = '';
      if (results) results.hidden = true;
      if (noResults) noResults.hidden = true;
      updateClearFilesButtonsVisibility();
      updateGoogleDriveButton();
      updateModeBanner();
      updateDemoModeUI();
      renderDataInventory(parseHash().params);

      let successMessage = 'Les données enregistrées par Famili-IA ont été supprimées.';
      let googleRevocationFailed = false;
      if (shouldRevokeGoogleAccess) {
        try {
          await googleDriveSource.revoke();
          driveObservation = "disconnected";
          renderExperimentalSources();
        } catch (error) {
          driveObservation = "error";
          renderExperimentalSources();
          googleRevocationFailed = true;
          successMessage += ` La révocation de l’autorisation Google n’a pas été confirmée : ${error.message}`;
        }
      }

      purgeStatus.textContent = successMessage;
      purgeStatus.dataset.state = googleRevocationFailed ? 'error' : 'success';
      purgeStatus.hidden = false;
      confirmPurgeBtn.textContent = 'Suppression terminée';
      if (googleRevocationFailed) {
        if (cancelPurgeBtn) cancelPurgeBtn.disabled = false;
        if (closePurgeBtn) closePurgeBtn.disabled = false;
      } else {
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (error) {
      purgeStatus.textContent = `La suppression n’a pas pu être terminée : ${error.message}`;
      purgeStatus.dataset.state = 'error';
      purgeStatus.hidden = false;
      confirmPurgeBtn.disabled = false;
      if (cancelPurgeBtn) cancelPurgeBtn.disabled = false;
      if (closePurgeBtn) closePurgeBtn.disabled = false;
    } finally {
      removingSessionFiles = false;
      updateOneDriveActions();
    }
  });
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
  refreshAssistantContext();

  // Handle suggestion chips
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const question = chip.dataset.question;
      input.value = question;
      document.querySelector('.assistant-ideas').open = false;
      document.querySelector('#assistant-status').textContent = 'Question préparée. Vous pouvez la modifier avant de l’envoyer.';
      input.focus();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const question = input.value.trim();
    const status = document.querySelector('#assistant-status');
    if (!question) {
      status.textContent = 'Saisissez une question avant de l’envoyer.';
      input.focus();
      return;
    }

    try {
      refreshAssistantContext();
      const aiResponse = getAssistantResponse(question);
      addUserMessage(question, chatContainer);
      addAIMessage(aiResponse, chatContainer);
      input.value = '';
      status.textContent = 'Réponse affichée dans la conversation.';
    } catch (error) {
      console.error("Impossible de préparer la réponse de l'assistant :", error);
      status.textContent = 'La réponse n’a pas pu être préparée. Votre question est conservée ; vous pouvez réessayer.';
    }
    input.focus({ preventScroll: true });
  });
}

function refreshAssistantContext() {
  const context = document.querySelector('#assistant-context');
  if (!uploadedDocuments.length) {
    context.textContent = 'Mode exemples fictifs : aucun fichier personnel chargé. Les réponses utilisent uniquement les documents de démonstration.';
  } else {
    const counts = countInventorySources(uploadedDocuments);
    context.textContent = `${counts.total} fichier${counts.total > 1 ? 's' : ''} chargé${counts.total > 1 ? 's' : ''} dans Famili-IA. Recherche documentaire locale limitée aux informations disponibles, pas à tout l'appareil ni au cloud.${counts.demo ? ' Certains fichiers sont des exemples fictifs ; consultez la provenance de chaque source.' : ''}`;
  }
}

/**
 * Add a user message to the chat container
 */
function addUserMessage(text, container) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message user';
  const avatar = addTextElement(msgDiv, "div", "chat-avatar", getCurrentUser().name?.trim().charAt(0).toUpperCase() || 'V');
  avatar.setAttribute("aria-hidden", "true");
  const bubble = addTextElement(msgDiv, "div", "chat-bubble", "");
  addTextElement(bubble, "p", "chat-speaker", "Vous");
  addTextElement(bubble, "p", "assistant-answer", text);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Add an AI message to the chat container
 */
function addAIMessage(response, container) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message ai';
  const avatar = addTextElement(msgDiv, "div", "ui-icon chat-avatar", "");
  avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/></svg>';
  avatar.setAttribute("aria-hidden", "true");
  const bubble = addTextElement(msgDiv, "div", "chat-bubble", "");
  addTextElement(bubble, "p", "chat-speaker", "Famili-IA");
  addTextElement(bubble, "p", "assistant-response-label", response.label);
  addTextElement(bubble, "p", "assistant-answer", response.answer);
  for (const match of response.matches) {
    const source = addTextElement(bubble, "div", "assistant-source", "");
    addTextElement(source, "p", "assistant-source-name", `Source : ${match.document.name}`);
    addTextElement(source, "p", "household-note", match.provenance);
    if (match.evidence) addTextElement(source, "p", "assistant-answer", `« ${match.evidence} »`);
    if (typeof match.document.content === 'string' && match.document.content.trim()) {
      const button = addTextElement(source, "button", "ui-button ui-button--secondary", "Voir la copie");
      button.type = 'button';
      button.setAttribute('aria-label', `Voir la copie de ${match.document.name}`);
      button.addEventListener('click', () => {
        const available = uploadedDocuments.length ? uploadedDocuments : documents;
        const current = available.find(document =>
          document.id === match.document.id && getInventorySource(document) === getInventorySource(match.document));
        if (!current || typeof current.content !== 'string' || !current.content.trim()) {
          document.querySelector('#assistant-status').textContent = 'Cette copie n’est plus disponible. Relancez une question pour actualiser les sources.';
          return;
        }
        openSource(current);
      });
    }
  }
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Get a response from the assistant based on the question
 * Uses document ranking; the unified photo index remains in Recherche.
 */
function getAssistantResponse(question) {
  const trimmed = question.trim();
  const matches = findDocuments(trimmed);
  const response = buildSearchResponse(matches);
  return { ...response, matches: matches.slice(0, 2) };
}

/**
 * Initialise la vérification des échéances pendant que l'application est ouverte.
 */
let notificationCheckInProgress = false;

function startAlertScheduler() {
  void checkAlertsForExpiry();
  setInterval(() => void checkAlertsForExpiry(), 15 * 60 * 1000);
}

/**
 * Vérifie régulièrement les alertes pendant que la page reste active.
 */
async function checkAlertsForExpiry() {
  if (!('Notification' in window)) {
    console.warn('Ce navigateur ne prend pas en charge les notifications.');
    return;
  }
  if (Notification.permission !== "granted" || notificationCheckInProgress) return;

  notificationCheckInProgress = true;
  try {
    for (const alert of getAlertsToNotify(
      getAlerts(),
      new Date(),
      getCurrentUser().preferences?.alertNotifications
    )) {
      try {
        new Notification("Famili-IA — échéance proche", {
          body: "Une échéance approche. Ouvrez Famili-IA pour consulter les détails.",
          icon: "/favicon.ico"
        });
        await updateAlert({
          ...alert,
          notificationSentFor: alert.dueDate,
          notificationSentAt: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Impossible d'envoyer la notification de l'alerte ${alert.id}.`, error);
      }
    }
  } finally {
    notificationCheckInProgress = false;
  }
}

/**
 * Réinitialise l'onboarding avec confirmation
 */
function startOnboardingReplay(stepIndex = 0) {
  replayOnboarding = true;
  document.querySelector('#wizard-user-name').value = "";
  document.querySelector('#wizard-greeting').hidden = true;
  document.querySelector('#wizard-user-greeting').textContent = "";
  document.querySelectorAll('#onboarding-wizard .wizard-step').forEach((step, index) => {
    step.hidden = index !== stepIndex;
  });
  if (stepIndex === 3) startDemoGuide();
  showView('accueil');
  manageOnboardingWizardVisibility();
  document.querySelector(`#step-${stepIndex}-title`).focus();
}

/**
 * Gère les questions de démo préremplies (Écran 4)
 * Affiche les résultats avec les badges de provenance appropriés
 * @param {string} questionType - Le type de question ('facture-piscine', 'garantie-pompe', 'photos-aaron')
 */
let demoGuideStep = 0;

const DEMO_GUIDE_STEPS = {
  1: { instruction: 'Choisissez une question fictive ci-dessous, ou découvrez le résultat déjà affiché.', next: 'Voir le résultat' },
  2: { instruction: 'Ce résultat fictif montre une source, une date et un extrait. Choisissez une autre question pour comparer.', next: 'Voir la suite' },
  3: { instruction: 'Dans votre espace, une échéance trouvée ne devient une alerte qu’après votre confirmation. Ici, aucune alerte n’est créée. Terminez quand vous êtes prêt : rien n’est connecté ni enregistré.', next: 'Explorer librement' }
};

function setDemoGuideStep(step) {
  demoGuideStep = step;
  const guide = document.querySelector('#demo-guide');
  guide.hidden = step === 0;
  document.querySelector('#demo-guide-restart').hidden = step !== 0;
  document.querySelector('.demo-questions').classList.toggle('demo-guide-highlight', step === 1);
  document.querySelector('#demo-results').classList.toggle('demo-guide-highlight', step === 2);
  document.querySelector('#finish-onboarding-demo').classList.toggle('demo-guide-highlight', step === 3);
  if (step === 0) return;
  document.querySelector('#demo-guide-progress').textContent = `Guide · étape ${step} sur 3`;
  document.querySelector('#demo-guide-instruction').textContent = DEMO_GUIDE_STEPS[step].instruction;
  document.querySelector('#demo-guide-prev').hidden = step === 1;
  document.querySelector('#demo-guide-next').textContent = DEMO_GUIDE_STEPS[step].next;
}

function startDemoGuide() {
  handleDemoQuestion('facture-piscine');
  setDemoGuideStep(1);
}

function handleDemoQuestion(questionType) {
  const documentList = document.querySelector('#demo-document-list');
  let results;
  let headingText;
  
  switch (questionType) {
    case 'facture-piscine':
      results = getDemoResultsFacturePiscine();
      headingText = 'Facture de piscine';
      break;
    case 'contrat-habitation':
      results = getDemoResultsContratHabitation();
      headingText = 'Contrat d’assurance habitation';
      break;
    case 'garantie-pompe':
      results = getDemoResultsGarantiePompe();
      headingText = 'Échéance garantie pompe';
      break;
    case 'photos-aaron':
      results = getDemoResultsPhotosAaron();
      headingText = 'Photos familiales';
      break;
    default:
      throw new TypeError(`Exemple de démo inconnu : ${questionType}`);
  }
  document.querySelector('#demo-result-heading').textContent =
    `${headingText} · ${results.length} ${results.length === 1 ? 'résultat fictif' : 'résultats fictifs'}`;
  documentList.replaceChildren(...results.map(createResultElement));
  document.querySelectorAll('.demo-question').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.demoQuestion === questionType));
  });
}

/**
 * Crée un élément de résultat HTML pour les données de démo
 * @param {Object} result - Les données du résultat
 * @returns {HTMLElement}
 */
function createResultElement(result) {
  const div = document.createElement('div');
  div.className = 'ui-card onboarding-demo-result';
  
  // Badge de provenance
  const badge = document.createElement('span');
  badge.className = `provenance-badge ${result.source === 'Drive' ? 'drive' : 'local'}`;
  badge.textContent = `${result.source === 'Drive' ? 'Google Drive' : 'Local'} · exemple fictif`;
  
  // Titre
  const title = document.createElement('h3');
  title.className = 'result-title';
  title.textContent = result.title;
  
  // Contenu
  const content = document.createElement('p');
  content.className = 'result-content';
  content.textContent = result.content;
  
  // Footer avec date
  const dateEl = document.createElement('small');
  dateEl.textContent = result.date;
  
  div.appendChild(badge);
  div.appendChild(title);
  div.appendChild(content);
  div.appendChild(dateEl);
  
  return div;
}

/**
 * Résultats démo pour la question "Retrouve la facture de ma piscine"
 */
function getDemoResultsFacturePiscine() {
  return [{
    id: 'facture-piscine',
    title: 'Facture - Installation piscine.pdf',
    content: 'Facture d\'installation d\'une piscine familiale. Le montant total indiqué est de 8 900 euros TTC, réglé le 4 mars 2023.',
    date: '4 mars 2023',
    source: 'Drive',
    provenance: 'Démo'
  }];
}

/**
 * Résultat fictif de démonstration d'un contrat, sans création d'alerte.
 */
function getDemoResultsContratHabitation() {
  return [{
    id: 'contrat-habitation',
    title: 'Contrat - Assurance habitation.pdf',
    content: 'Le contrat prend effet le 1er janvier 2027 et arrive à échéance le 31 décembre 2027, sauf résiliation. Cette échéance est un exemple fictif ; aucune alerte n’est créée.',
    date: '1 janvier 2027',
    source: 'Drive',
    provenance: 'Démo'
  }];
}

/**
 * Résultats démo pour la question "Quand est-ce que je dois payer la garantie du pompe ?"
 */
function getDemoResultsGarantiePompe() {
  return [{
    id: 'garantie-pompe',
    title: 'Garantie - Pompe piscine.pdf',
    content: 'La garantie de la pompe Hayward Modèle 2022 est valide jusqu\'au 4 mai 2028. Échéance : 4 mai 2028.',
    date: '12 avril 2023',
    source: 'Drive',
    provenance: 'Démo'
  }];
}

/**
 * Résultats démo pour la question "Montre-moi les photos de Aaron"
 */
function getDemoResultsPhotosAaron() {
  return [
    {
      id: 'photo-aaron-1',
      title: 'Aaron - Vacances d\'été 2023',
      content: 'Photo de famille prise pendant les vacances. Filtre appliqué : couleurs vives.',
      date: '15 juillet 2023',
      source: 'Local',
      provenance: 'Démo'
    },
    {
      id: 'photo-aaron-2',
      title: 'Aaron - À l\'école',
      content: 'Photo scolaire d\'Aaron avec son nouvel uniforme.',
      date: '3 octobre 2023',
      source: 'Local',
      provenance: 'Démo'
    }
  ];
}

/**
 * Attache le gestionnaire d'événement au bouton de réinitialisation de l'onboarding
 */
function initResetOnboardingButton() {
  const resetBtn = document.querySelector('#reset-onboarding-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => startOnboardingReplay());
  }
}

// Initialiser le bouton de réinitialisation de l'onboarding
initResetOnboardingButton();
initViewTour();
