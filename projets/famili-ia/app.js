console.log("App script loaded");
import { buildSearchResponse, rankDocuments } from "./search-utils.js";
import { GoogleDriveClient, prepareDriveDocumentForIndex } from "./google-drive.js";
import { GoogleDriveSource } from "./google-drive-source.js";
import { countInventorySources, filterInventoryDocuments, filterSearchResultsByChips, getInventoryAccountRef, getInventoryIndexStatus, getInventorySource, getInventoryTypeKey, isInventoryDocumentType, mergeInventoryDocuments } from "./data-inventory.js";
import { Capacitor } from "@capacitor/core";
import { selectNativePhotoFiles } from "./native-photo-picker.js";
import { parseDocument } from "./document-parser.js";
import { clearFamilyState, loadFamilyState } from "./family-storage.js";
import {
  initState, getCurrentUser, getFamilyMembers, getEquipmentByCategory, getEquipmentDetail, getAlerts,
  getDocuments, addDocument, confirmDocumentAlert, confirmDocumentDeadline, deleteDocument, calculateAlertType, updateAlert,
  updateAlertNotificationPreferences, updateUserProfile, updateHousePhoto, getFullState,
  addFamilyMember, addEquipment, updateEquipment, updateEquipmentPhoto, deleteEquipment, deleteFamilyMember, updateFamilyMember,
  updatePhotoAnnotations, resetState, getDropboxIndexCheckpoint, saveDropboxIndexCheckpoint,
  clearDropboxIndexCheckpoint, clearDropboxIndexCheckpoints
} from "./state.js";
import { redactPhotoLocationsForExport } from "./photo-metadata.js";
import { redactPhotoFactLocationsForExport } from "./photo-facts.js";
import { isPhotoDocument, normalizePhotoAnnotations } from "./photo-annotations.js";
import { MAX_PHOTO_FILE_SIZE } from "./photo-exif.js";
import { getPhotoThumbnailDataUrl } from "./photo-thumbnails.js";
import { prepareCoverPhoto, validateCoverPhoto } from "./cover-photo.js";
import { getPhotoTimelineDateInfo, getTimelineDateLabel, groupPhotosForTimeline } from "./photo-timeline.js";
import { getAlertsToNotify, getDaysUntilDate, normalizeAlertDate, normalizeAlertNotificationPreferences } from "./alert-engine.js";
import { BackgroundSyncWorker } from "./background-sync.js";
import { IndexSession, INDEX_SOURCES } from "./index-session.js";
import { isAssistantMatchCurrent, prepareAssistantContext } from "./assistant-context.js";
import { assertDocumentAlertSource, matchesDocumentAlertIdentity, prepareDocumentAlertAction } from "./document-alert-action.js";
import { createSourceRunStatus, describeSources, sourceRunStatusId } from "./source-status.js";
import { loadSourceRunStatuses, saveSourceRunStatus } from "./source-status-storage.js";
import { describeExperimentalResult, summarizePhotoSources } from "./experimental-result.js";
import { findDocumentDuplicateCandidates } from "./document-deduplication.js";
import { findIndexDeadlines } from "./index-deadline-search.js";
import { createUnifiedIndexQuery, isWithinDateRange, mergeUnifiedIndexFilters } from "./unified-index-query.js";
import { OneDriveAuth } from "./onedrive-auth.js";
import { scanOneDrive } from "./onedrive-graph.js";
import {
  canRefreshOneDriveCopy, compareOneDriveCopy, describeOneDriveChanges, mergeOneDriveDocumentUpdate,
  oneDriveDocumentId, readOneDriveDocument, resolveOneDriveOriginalUrl
} from "./onedrive-document.js";
import { formatOneDriveAccountFingerprint, getOneDriveAccountFingerprint } from "./onedrive-account.js";
import {
  canRefreshDropboxCopy, compareDropboxCopy, describeDropboxChanges, DropboxAuth, DropboxApiError,
  dropboxIdentity, mergeDropboxDocumentUpdate, readDropboxDocument, scanDropbox
} from "./dropbox.js";

const activeScanWorkers = new Map();
let suspendPhotoThumbnailRendering = () => {};
let resumePhotoThumbnailRendering = () => {};
let renderUnifiedPhotoResults = () => {};
let replayOnboarding = false;
let demoReturnContext = null;

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
    const returnContext = demoReturnContext;
    demoReturnContext = null;
    replayOnboarding = false;
    manageOnboardingWizardVisibility();
    showView(returnContext?.view || 'accueil', {
      addHistory: !returnContext,
      params: returnContext?.params || {}
    });
    if (returnContext?.focus?.isConnected && !returnContext.focus.closest('[hidden], dialog:not([open])')) {
      returnContext.focus.focus();
    } else {
      document.querySelector(`[data-view="${activeView}"] h1`)?.focus();
    }
  });

  // Écouteurs pour les questions de démo préremplies (Écran 4)
  const demoQuestions = document.querySelectorAll('.demo-question');
  demoQuestions.forEach(button => {
    button.addEventListener('click', (e) => {
      const questionType = e.currentTarget.dataset.demoQuestion;
      handleDemoQuestion(questionType, { showResults: false });
      if (demoGuideStep > 0) setDemoGuideStep(1);
      document.querySelector('#demo-query').focus();
    });
  });
  document.querySelector('#demo-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    handleDemoQuestion(document.querySelector('.demo-question[aria-pressed="true"]').dataset.demoQuestion);
    if (demoGuideStep > 0) setDemoGuideStep(2);
    document.querySelector('#demo-result-heading').focus();
  });
  document.querySelector('#demo-start-guided').addEventListener('click', startGuidedDemo);
  document.querySelector('#demo-start-free').addEventListener('click', startDemoExploration);
  document.querySelectorAll('[data-demo-screen]').forEach(button => {
    button.addEventListener('click', () => {
      setDemoGuideStep(0);
      showDemoScreen(button.dataset.demoScreen);
      document.querySelector('#demo-screen-title').focus();
    });
  });
  document.querySelector('#demo-confirm-alert').addEventListener('click', () => {
    document.querySelector('#demo-alert-status').textContent =
      'Le rappel est prêt à être créé. Rien n’a été ajouté à votre espace.';
  });
  document.querySelector('#demo-open-warranty').addEventListener('click', () => {
    setDemoGuideStep(0);
    handleDemoQuestion('garantie-pompe');
    showDemoScreen('recherche');
    document.querySelector('#demo-result-heading').focus();
  });
  document.querySelector('#demo-guide-next').addEventListener('click', () => {
    if (demoGuideStep === DEMO_GUIDE_STEPS.length) {
      setDemoGuideStep(0);
      document.querySelector('#demo-guide-restart').focus();
    } else {
      setDemoGuideStep(demoGuideStep + 1);
      focusDemoGuideStep();
    }
  });
  document.querySelector('#demo-guide-prev').addEventListener('click', () => {
    setDemoGuideStep(demoGuideStep - 1);
    focusDemoGuideStep();
  });
  document.querySelector('#demo-guide-skip').addEventListener('click', () => {
    setDemoGuideStep(0);
    document.querySelector('#demo-guide-restart').focus();
  });
  document.querySelector('#demo-guide-restart').addEventListener('click', () => {
    startGuidedDemo();
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
    await restoreSourceRunStatuses();
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
    name: "Fictif - facture piscine.pdf",
    type: "Facture",
    date: "Date fictive : 1 janvier 2099",
    keywords: "piscine facture paiement prix payé cout installation montant",
    summary: "Exemple fictif : le montant total de l'installation du bassin est de 8 900 euros TTC.",
    content: "EXEMPLE FICTIF — FACTURE\nRéférence fictive : EXEMPLE-FACTURE-001\nDate fictive : 1 janvier 2099\nObjet : Installation d'un bassin (scénario fictif)\nMontant total : 8 900 euros TTC\nStatut fictif : réglée\n\nToutes les données de ce document sont inventées."
  },
  {
    id: "piscine-garantie",
    name: "Fictif - garantie pompe piscine.pdf",
    type: "Garantie",
    date: "Date fictive : 1 janvier 2099",
    keywords: "garantie pompe piscine durée échéance fin expire expiration modèle fictif",
    summary: "Exemple fictif : la garantie de l'équipement de piscine expire le 1 janvier 2104.",
    content: "EXEMPLE FICTIF — GARANTIE D'ÉQUIPEMENT\nÉquipement : pompe de piscine, modèle fictif\nDate de début fictive : 1 janvier 2099\nDurée fictive : 5 ans\nFin de garantie fictive : 1 janvier 2104\n\nToutes les données de ce document sont inventées."
  },
  {
    id: "imprimante-facture",
    name: "Fictif - facture imprimante.pdf",
    type: "Facture",
    date: "Date fictive : 1 janvier 2099",
    keywords: "imprimante facture numéro référence achat prix coût montant",
    summary: "Exemple fictif : le montant de l'imprimante est de 449 euros TTC.",
    content: "EXEMPLE FICTIF — FACTURE\nRéférence fictive : EXEMPLE-FACTURE-002\nDate fictive : 1 janvier 2099\nArticle : imprimante, modèle fictif\nMontant fictif : 449 euros TTC\nStatut fictif : réglée\n\nToutes les données de ce document sont inventées."
  },
  {
    id: "habitation-contrat",
    name: "Fictif - contrat habitation.pdf",
    type: "Contrat",
    date: "Date fictive : 1 janvier 2099",
    keywords: "contrat assurance habitation échéance termine fin renouvellement date",
    summary: "Exemple fictif : le contrat habitation arrive à échéance le 31 décembre 2099.",
    content: "EXEMPLE FICTIF — CONTRAT HABITATION\nRéférence fictive : EXEMPLE-CONTRAT-001\nDate d'effet fictive : 1 janvier 2099\nÉchéance fictive : 31 décembre 2099\nReconduction : donnée fictive\n\nToutes les données de ce document sont inventées."
  },
  {
    id: "maison-notice",
    name: "Fictif - notice filtre piscine.pdf",
    type: "Notice",
    date: "Date fictive",
    keywords: "notice filtre piscine entretien nettoyage cartouche",
    summary: "Exemple fictif : le filtre doit être rincé toutes les deux semaines en période d'utilisation.",
    content: "EXEMPLE FICTIF — NOTICE D'ENTRETIEN\nÉquipement : filtre de piscine, modèle fictif\nFréquence fictive de rinçage : toutes les deux semaines en période d'utilisation.\nRemplacement fictif : selon l'usure et au minimum une fois par saison.\n\nToutes les données de ce document sont inventées."
  }
];

const uploadedDocuments = [];
function storedDocument(id) {
  const document = getDocuments().find(entry => entry.id === id);
  if (!document) throw new Error("La copie enregistrée n'est plus présente.");
  return document;
}

function synchronizeStoredPhotoDocuments() {
  for (let index = 0; index < uploadedDocuments.length; index += 1) {
    if (!isPhotoDocument(uploadedDocuments[index])) continue;
    const current = getDocuments().find(document => document.id === uploadedDocuments[index].id);
    if (current) uploadedDocuments[index] = current;
  }
}
const experimentalIndex = new IndexSession();
const assistantResponseContexts = new Map();
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
let dropboxObservation = "unknown";
let oneDriveAccountFingerprint = null;
let dropboxAccountFingerprint = null;
const sourceRunStatuses = new Map();
const sourceRunStorageErrors = new Map();

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
    "invalid-coordinates": "Les coordonnées doivent former une paire latitude/longitude valide.",
    "event-ambiguous": "Plusieurs événements correspondent. Précisez l'événement ou vérifiez les annotations.",
    "season-ambiguous": "Précisez une seule saison."
  };
  return messages[reason] || "Une précision est nécessaire pour interpréter cette recherche photo.";
}

let oneDriveScanController = null;
let oneDriveScanSettled = null;
let dropboxScanController = null;
let dropboxScanSettled = null;

function sourceName(sourceId) {
  return sourceId === "drive" ? "Google Drive" : sourceId === "onedrive" ? "OneDrive" : sourceId === "dropbox" ? "Dropbox" : "Local";
}

function getSourceStatuses() {
  return describeSources(experimentalIndex.getAllRecords(), {
    driveConfigured: Boolean(googleDriveClient),
    driveToken: Boolean(googleDriveClient?.hasAccessToken),
    driveState: driveObservation,
    localState: activeScanWorkers.size ? "working" : localImportFailed ? "error" : "unknown",
    oneDriveState: oneDriveObservation,
    dropboxState: dropboxObservation,
    sourceRuns: [...sourceRunStatuses.values()],
    accountRefs: {
      ...(oneDriveAccountFingerprint ? { onedrive: oneDriveAccountFingerprint } : {}),
      ...(dropboxAccountFingerprint ? { dropbox: dropboxAccountFingerprint } : {})
    }
  });
}

function renderExperimentalSources() {
  const statuses = getSourceStatuses();
  experimentalSourceStatus.replaceChildren();
  if (sourceRunStorageErrors.size) {
    const warning = document.createElement("li");
    warning.textContent = "Les états de couverture et de fraîcheur n'ont pas pu être lus ou enregistrés sur cet appareil.";
    experimentalSourceStatus.appendChild(warning);
  }
  for (const status of statuses) {
    const item = document.createElement("li");
    const name = sourceName(status.sourceId);
    const accountContext = status.sourceId === "onedrive" && oneDriveAccountFingerprint
      ? ` Compte actuellement connecté (empreinte locale) : ${formatOneDriveAccountFingerprint(oneDriveAccountFingerprint)}.`
      : "";
    const indexedAccount = status.run?.accountRef
      ? ` Le dernier parcours concerne l'empreinte de compte …${status.run.accountRef.slice(0, 16)}.`
      : "";
    item.textContent = `${name} : ${status.message} ${status.access} ${status.scope}${accountContext}${indexedAccount} ${status.freshness}`;
    experimentalSourceStatus.appendChild(item);
  }
  deadlineResults.querySelectorAll("[data-deadline-source]").forEach(element => {
    const source = statuses.find(status => status.sourceId === element.dataset.deadlineSource);
    element.textContent = source?.access || "Accès actuel à l'original inconnu.";
  });
  if (activeView === 'vos-donnees') renderInventorySourceStatus();
  return statuses;
}

async function persistSourceRun({
  sourceId,
  accountRef = null,
  scopeKind,
  state,
  startedAt,
  finishedAt = null,
  discoveredCount = null,
  processedCount = 0,
  failedCount = 0,
  failureReason = null
}) {
  const id = sourceRunStatusId(sourceId, accountRef);
  const previous = sourceRunStatuses.get(id);
  const record = createSourceRunStatus({
    sourceId,
    accountRef,
    scopeKind,
    state,
    startedAt,
    finishedAt,
    lastSuccessfulAt: state === "complete" ? finishedAt : previous?.lastSuccessfulAt || null,
    discoveredCount,
    processedCount,
    failedCount,
    failureReason
  });
  sourceRunStatuses.set(record.id, record);
  renderExperimentalSources();
  try {
    const persisted = await saveSourceRunStatus(record);
    sourceRunStatuses.set(persisted.id, persisted);
    sourceRunStorageErrors.delete(record.id);
  } catch (error) {
    sourceRunStorageErrors.set(record.id, error instanceof Error ? error.message : "Erreur de stockage non détaillée.");
    console.error("Impossible de persister l'état de parcours d'une source :", error);
  }
  renderExperimentalSources();
}

function sourceRunFailureReason(error) {
  const message = error instanceof Error ? error.message : "Erreur non détaillée.";
  return message.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240)
    || "Erreur non détaillée.";
}

async function restoreSourceRunStatuses() {
  try {
    const statuses = await loadSourceRunStatuses();
    sourceRunStorageErrors.clear();
    statuses.forEach(status => sourceRunStatuses.set(status.id, status));
    for (const status of statuses.filter(item => item.state === "running")) {
      await persistSourceRun({
        ...status,
        state: "interrupted",
        finishedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    sourceRunStorageErrors.set("load", error instanceof Error ? error.message : "Erreur de stockage non détaillée.");
    console.error("Impossible de restaurer les états de parcours des sources :", error);
  }
  renderExperimentalSources();
}

function findExperimentalDocument(sourceId, itemId, accountRef) {
  for (let i = uploadedDocuments.length - 1; i >= 0; i -= 1) {
    const doc = uploadedDocuments[i];
    if (doc.id === itemId && getInventorySource(doc) === sourceId &&
        (accountRef === undefined || getInventoryAccountRef(doc) === accountRef)) return doc;
  }
  return undefined;
}

function addDeadlineCopyAction(item, sourceId, itemId, accountRef) {
  const sourceDocument = findExperimentalDocument(sourceId, itemId, accountRef);
  if (!sourceDocument || typeof sourceDocument.content !== "string" || !sourceDocument.content.trim()) {
    addTextElement(item, "p", "", "Copie textuelle indisponible dans Famili-IA.");
    return;
  }
  const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", "Voir la copie dans Famili-IA");
  button.type = "button";
  button.addEventListener("click", () => {
    const current = findExperimentalDocument(sourceId, itemId, accountRef);
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
    addDeadlineCopyAction(item, candidate.sourceId, candidate.itemId, candidate.accountRef);
    addDeadlineAlertAction(item, candidate);
    deadlineResults.appendChild(item);
  }
  for (const entry of result.needReview) {
    const item = document.createElement("li");
    item.className = "experimental-result";
    addTextElement(item, "p", "", `${entry.name || "Nom inconnu"} · ${sourceName(entry.sourceId)} · ${entry.reason}`);
    addDeadlineCopyAction(item, entry.sourceId, entry.itemId, entry.accountRef);
    deadlineReviewList.appendChild(item);
  }
  deadlineReview.hidden = result.needReview.length === 0;
  deadlineStatus.textContent = `${result.candidates.length} proposition(s) à vérifier ; ${result.outsidePeriod} échéance(s) détectée(s) hors période ; ${result.needReview.length} document(s) à vérifier.`;
  if (result.ineligible.length) deadlineStatus.textContent += ` ${result.ineligible.length} échéance(s) non admissible(s).`;
}

function addDeadlineAlertAction(item, candidate) {
  const status = item.closest('.assistant-source')
    ? document.querySelector('#assistant-status') : deadlineStatus;
  let proposal;
  try {
    const copies = getDocuments().filter(entry => entry.id === candidate.itemId);
    if (copies.length !== 1) throw new Error("Alerte non disponible : copie persistée absente ou ambiguë.");
    const record = experimentalIndex.getAllRecords().find(entry =>
      entry.sourceId === candidate.sourceId && entry.accountRef === candidate.accountRef && entry.itemId === candidate.itemId);
    const content = experimentalIndex.getAllContentDocs().find(entry =>
      entry.sourceId === candidate.sourceId && entry.accountRef === candidate.accountRef && entry.itemId === candidate.itemId);
    proposal = prepareDocumentAlertAction(candidate, copies[0], record, content);
  } catch (error) {
    addTextElement(item, "p", "household-note", error instanceof Error ? error.message : "Alerte non disponible : préparation impossible.");
    return;
  }
  const buttonLabel = candidate.estimated
    ? "Confirmer l’estimation et créer l’alerte"
    : "Confirmer la date et créer l’alerte";
  const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", buttonLabel);
  button.type = "button";
  let pending = false;
  button.addEventListener("click", async () => {
    if (pending) return;
    pending = true;
    button.disabled = true;
    let saved = false;
    try {
      const current = getDocuments().filter(entry => entry.id === proposal.itemId);
      if (current.length !== 1) throw new Error("La copie source est absente ou ambiguë.");
      assertDocumentAlertSource(current[0], proposal);
      if (!window.confirm(
        `${candidate.estimated
        ? `Confirmer l’estimation calculée de l’échéance au ${candidate.dueDate} (${proposal.documentType}) ?\n\n` +
          "Cette date est calculée à partir de la date d’achat et de la durée de garantie. Vérifiez les deux preuves avant de confirmer.\n\n"
        : `Confirmer l’échéance du ${candidate.dueDate} (${proposal.documentType}) ?\n\n`}` +
      `Preuve : « ${candidate.proof.excerpt} »\n` +
      `Source : ${sourceName(candidate.sourceId)}\n\n` +
      "Cela enregistre votre confirmation dans Famili-IA et crée une alerte, selon vos préférences de notification. L’original dans la source ne sera pas modifié."
      )) {
        status.textContent = "Échéance laissée en proposition ; aucune alerte ni notification n’a été créée.";
        return;
      }
      const { document: confirmedDocument, alreadyConfirmed } = await confirmDocumentDeadline(proposal);
      saved = true;
      const uploadedIndex = uploadedDocuments.findIndex(entry =>
        matchesDocumentAlertIdentity(entry, proposal));
      if (uploadedIndex !== -1) uploadedDocuments[uploadedIndex] = confirmedDocument;
      const restoreStatus = await experimentalIndex.restoreDocumentContent(confirmedDocument);
      if (restoreStatus !== "verified") {
        throw new Error("La provenance du contenu n’a pas pu être revérifiée après l’enregistrement.");
      }
      refreshExperimentalIndex();
      status.textContent = alreadyConfirmed
        ? "Cette échéance est déjà confirmée ; aucune alerte en double n’a été créée."
        : "Échéance confirmée et alerte créée ou actualisée dans Famili-IA ; preuve, source et choix utilisateur conservés.";
    } catch (error) {
      console.error("Impossible de confirmer l'échéance et de créer l'alerte.", error);
      if (saved) invalidateAssistantResponses(true);
      status.textContent = saved
        ? "Le rappel est enregistré, mais les sources affichées n’ont pas pu être actualisées. Rechargez la page pour les vérifier."
        : `Échec de l'enregistrement de l'alerte : ${error instanceof Error ? error.message : "erreur non détaillée"}. Vérifiez la proposition avant de réessayer.`;
    } finally {
      pending = false;
      button.disabled = false;
    }
  });
}

function refreshExperimentalIndex() {
  document.querySelector('#reset-empty-search').hidden = true;
  try {
    experimentalIndex.syncDocuments(uploadedDocuments);
    invalidateAssistantResponses();
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
    const matchKey = ({ sourceId, accountRef, itemId }) => JSON.stringify([sourceId, accountRef ?? null, itemId]);
    const documentsByMatch = new Map(matches.map(match =>
      [matchKey(match), findExperimentalDocument(match.sourceId, match.itemId, match.accountRef)]
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
      .map(document => ({
        ...document,
        sourceId: INDEX_SOURCES[getInventorySource(document)],
        accountRef: getInventoryAccountRef(document)
      }))
      .filter(document => document.sourceId);
    const duplicateCandidates = findDocumentDuplicateCandidates(duplicateDocuments);
    const duplicatePairs = [...duplicateCandidates.exactDuplicates, ...duplicateCandidates.possibleDuplicates]
      .filter(pair => matchedKeys.has(matchKey(pair.first)) && matchedKeys.has(matchKey(pair.second)));
    const renderedKeys = new Set();
    const renderMatch = (match, tagName = "li") => {
      const item = document.createElement(tagName);
      const sourceDocument = documentsByMatch.get(matchKey(match));
      const record = records.find(entry => entry.sourceId === match.sourceId &&
        entry.accountRef === (match.accountRef ?? null) && entry.itemId === match.itemId);
      const sourceAccess = sourceStatuses.find(status => status.sourceId === match.sourceId)?.access;
      const result = describeExperimentalResult(match, record, sourceDocument, sourceAccess);
      item.className = "experimental-result";
      addTextElement(item, "h3", "experimental-result-name", result.name);
      addTextElement(item, "p", "search-result-origin", `${result.sourceLabel} · ${result.coverageLabel} · accès à l'original non garanti`);
      const evidence = match.reasons.find(reason => reason.location === "content") ?? match.reasons[0];
      if (evidence) {
        const proof = addTextElement(item, "blockquote", "search-result-proof", "");
        const label = evidence.location === "content" ? "Extrait correspondant"
          : evidence.location === "name" ? "Nom correspondant" : "Indice correspondant";
        addTextElement(proof, "p", "search-proof-label", label);
        addTextElement(proof, "mark", "", evidence.value);
        if (evidence.estimated) addTextElement(proof, "p", "", "Estimation non confirmée.");
        if (evidence.approximateMatches?.length) {
          addTextElement(proof, "p", "", "Correspondance approchée ; le texte de la preuve est conservé.");
        }
      }
      const provenance = addTextElement(item, "details", "search-result-details", "");
      addTextElement(provenance, "summary", "", "Provenance et détails");
      for (const detail of result.details) addTextElement(provenance, "p", "", detail);
      for (const reason of result.reasons) addTextElement(provenance, "p", "search-evidence", reason);
      if (result.canViewCopy) {
        const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", "Voir la copie dans Famili-IA");
        button.type = "button";
        button.addEventListener("click", () => {
          const current = findExperimentalDocument(match.sourceId, match.itemId, match.accountRef);
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
      if (match.sourceId === "onedrive") addOneDriveOriginalAction(item, sourceDocument);
      if (sourceDocument && isPhotoDocument(sourceDocument)) {
        const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", "Voir le détail de la photo");
        button.type = "button";
        button.addEventListener("click", () => {
          const current = findExperimentalDocument(match.sourceId, match.itemId, match.accountRef);
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
      : "Aucun résultat pour le moment. Essayez d'autres mots ou ajoutez un fichier ; certains textes ne sont pas disponibles et d'autres fichiers peuvent exister dans les sources.";
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
    invalidateAssistantResponses(true);
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
const googleDriveClient = hasGoogleDriveConfig && !isNativePlatform ? new GoogleDriveClient({
  ...googleDriveConfig, getPhotoLocationConsent: () => getCurrentUser().privacy?.photoLocationConsent === true
}) : null;
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
  const hasDropboxFiles = uploadedDocuments.some(file => file.dropboxSource);
  const hasLocalFiles = uploadedDocuments.some((file) => file.isLocal && !file.driveDemo && !file.driveSource && !file.oneDriveSource && !file.dropboxSource);
  if (demoStatusLabel && sidebarModeCopy) {
    if (hasDropboxFiles) {
      demoStatusLabel.textContent = "Prototype — copies cloud locales";
      sidebarModeCopy.textContent = "Copies enregistrées, dont Dropbox ; aucune synchronisation automatique.";
    } else if (hasOneDriveFiles) {
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
    const origin = sourceDocument.dropboxSource
      ? "Dropbox · copie enregistrée localement"
      : sourceDocument.oneDriveSource
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
  dialogEyebrow.textContent = document.dropboxSource
    ? "FICHIER DROPBOX"
    : document.oneDriveSource
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
    ? document.dropboxSource
      ? `${document.type} · copie locale issue de Dropbox · ${document.date}`
      : document.oneDriveSource
      ? `${document.type} · copie locale issue de OneDrive${document.date && document.date !== "Date inconnue" ? ` · modifié le ${document.date}` : ""}`
      : document.driveSource
      ? `${document.type} · ${document.type === "Image" ? "métadonnées locales issues" : "copie textuelle locale issue"} de Google Drive${document.date && document.date !== "Date inconnue" ? ` · modifié le ${document.date}` : ""}`
      : document.driveDemo
        ? `${document.type} · exemple fictif copié dans cette session`
        : document.sourceDir && Capacitor.isNativePlatform()
          ? `${document.type} · ${document.sourceDir} · copie textuelle locale`
          : `${document.type} · copie textuelle locale`
    : `${document.type} · ${document.date} · Source de démonstration`;
  if (dialogNoticeText) {
    dialogNoticeText.textContent = document.dropboxSource
      ? `Copie Dropbox conservée dans Famili-IA, non synchronisée. Accès actuel à l'original non vérifié.${document.dropboxIndexIssue ? ` ${document.dropboxIndexIssue}` : ""}`
      : document.oneDriveSource
      ? "Copie conservée dans Famili-IA, non synchronisée automatiquement. L'accès actuel à l'original n'est pas vérifié ; ce fichier peut être ancien ou ne contenir que ses métadonnées."
      : document.driveSource
      ? document.type === "Image"
        ? "Métadonnées d'une photo choisie dans Google Picker, conservées dans Famili-IA sans télécharger l'image. Ce n'est pas l'original ; son accès actuel n'est pas vérifié et les métadonnées peuvent être anciennes."
        : "Copie textuelle d'un fichier choisi dans Google Picker, conservée dans Famili-IA. Ce n'est pas l'original ; son accès actuel n'est pas vérifié et la copie peut être ancienne ou contenir du texte non vérifié."
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

function setImportFeedback(message, state, title) {
  const feedback = document.querySelector('#import-feedback');
  feedback.hidden = false;
  feedback.dataset.state = state;
  document.querySelector('#import-feedback-intro').hidden = true;
  document.querySelector('#import-feedback-title').textContent = title;
  document.querySelector('#import-feedback-status').textContent = message;
  document.querySelector('#import-feedback-warnings').textContent = '';
  document.querySelector('#import-progress').hidden = true;
}

function setFileStatus(message, state, importIssue = false) {
  if (importIssue) setImportFeedback(message, 'error', 'Votre sélection est à vérifier');
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
    text.textContent = `Indexation interrompue : ${progressInfo.processed}/${progressInfo.total} fichiers traités · ${progressInfo.imported ?? progressInfo.processed} indexés${progressInfo.failed ? ` · ${progressInfo.failed} échec(s)` : ""}.`;
    scanProgressTimeout = setTimeout(() => { container.hidden = true; }, 5000);
  } else if (progressInfo.status === 'error') {
    text.textContent = `L'indexation a échoué : ${progressInfo.message}`;
    scanProgressTimeout = setTimeout(() => { container.hidden = true; }, 7000);
  }

  if (['scanning', 'indexing', 'completed', 'stopped', 'error'].includes(progressInfo.status)) {
    const running = progressInfo.status === 'scanning' || progressInfo.status === 'indexing';
    const state = progressInfo.status === 'error' ? 'error'
      : progressInfo.status === 'stopped' || progressInfo.failed > 0 ||
        progressInfo.metadataWarnings > 0 || progressInfo.thumbnailWarnings > 0 ? 'warning'
        : running ? 'running' : 'success';
    setImportFeedback(text.textContent, state, running ? 'Votre ajout local est en cours' : 'Le bilan de votre ajout local');
    const progress = document.querySelector('#import-progress');
    if (progressInfo.status === 'scanning') {
      progress.removeAttribute('value');
      progress.hidden = false;
    } else if (progressInfo.status !== 'error' && Number.isInteger(progressInfo.processed) &&
        Number.isInteger(progressInfo.total) && progressInfo.total > 0) {
      progress.max = progressInfo.total;
      progress.value = progressInfo.processed;
      progress.hidden = false;
    }
    const warnings = [];
    if (progressInfo.metadataWarnings) warnings.push(`${progressInfo.metadataWarnings} avertissement${progressInfo.metadataWarnings === 1 ? "" : "s"} sur les métadonnées photo`);
    if (progressInfo.thumbnailWarnings && progressInfo.status !== 'completed') warnings.push(`${progressInfo.thumbnailWarnings} vignette${progressInfo.thumbnailWarnings === 1 ? "" : "s"} indisponible${progressInfo.thumbnailWarnings === 1 ? "" : "s"}`);
    document.querySelector('#import-feedback-warnings').textContent = warnings.join(' · ');
  }
}

let scanProgressTimeout;

function trackBackgroundWorker(worker, scopeKind) {
  localImportFailed = false;
  const startedAt = new Date().toISOString();
  const scan = (async () => {
    await persistSourceRun({
      sourceId: "local",
      scopeKind,
      state: "running",
      startedAt
    });
    return worker.start();
  })();
  activeScanWorkers.set(worker, scan);
  renderExperimentalSources();
  scan.then(
    async (result) => {
      if (result?.failed > 0 || result?.status === "error") localImportFailed = true;
      const discoveredCount = Number.isInteger(result?.total) && result.total >= 0 ? result.total : null;
      const failedCount = Number.isInteger(result?.failed) && result.failed >= 0 ? result.failed : 0;
      const processedCount = Number.isInteger(result?.processed) && result.processed >= 0
        ? Math.max(0, result.processed - failedCount)
        : Number.isInteger(result?.imported) && result.imported >= 0 ? result.imported : 0;
      const state = result?.status === "stopped" ? "interrupted"
        : result?.status === "error" ? "error"
          : failedCount ? "partial"
            : result?.status === "completed" && discoveredCount !== null && processedCount === discoveredCount
              ? "complete" : "partial";
      await persistSourceRun({
        sourceId: "local",
        scopeKind,
        state,
        startedAt,
        finishedAt: new Date().toISOString(),
        discoveredCount,
        processedCount,
        failedCount
      });
      activeScanWorkers.delete(worker);
      renderExperimentalSources();
    },
    async (error) => {
      localImportFailed = true;
      await persistSourceRun({
        sourceId: "local",
        scopeKind,
        state: "error",
        startedAt,
        finishedAt: new Date().toISOString()
      });
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
  trackBackgroundWorker(worker, "selected-directories");
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
  const task = trackBackgroundWorker(worker, "selected-files");

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
    const message = `L'indexation locale a échoué : ${reason}`;
    setFileStatus(message, "error");
    setImportFeedback(message, 'error', "L'ajout local n'a pas pu être terminé");
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
  const providerButton = source === "drive" ? "connect-google-drive" : source === "onedrive" ? "connect-onedrive" : source === "dropbox" ? "connect-dropbox" : null;
  document.querySelector("#source-choice-title").textContent = source === "drive"
    ? "Google Drive — accès aux fichiers"
    : source === "onedrive" ? "OneDrive — accès aux fichiers" : source === "dropbox" ? "Dropbox — accès aux fichiers" : "Où se trouvent vos documents ?";
  document.querySelector("#source-choice-intro").textContent = providerButton
    ? "Vérifiez les permissions avant de continuer. Ouvrir ces options ne connecte aucun compte."
    : "Choisissez uniquement les fichiers que vous souhaitez rechercher.";
  sourceChoiceDialog.querySelectorAll(".source-choice").forEach(button => {
    button.hidden = Boolean(providerButton) && button.id !== providerButton;
  });
  document.querySelector("#onedrive-options").hidden = source === "drive" || source === "dropbox";
  document.querySelector("#dropbox-options").hidden = source !== "dropbox" && Boolean(providerButton);
  document.querySelector("#source-choice-permissions").textContent = source === "drive"
    ? "Google Drive ne donne accès qu'aux fichiers sélectionnés. Les photos JPEG/PNG sont enregistrées en métadonnées sans télécharger l'image ; le GPS n'est demandé qu'avec votre consentement."
    : source === "dropbox"
      ? "Full Dropbox peut autoriser la lecture de tous les fichiers existants du compte. Aucun droit d'écriture ou de suppression Dropbox n'est demandé. La connexion ne lance pas l'indexation."
      : source === "onedrive"
      ? "OneDrive peut autoriser l'accès à tous les fichiers du compte personnel. La connexion ne lance pas l'indexation."
      : "Google Drive ne donne accès qu'aux fichiers sélectionnés. OneDrive et Dropbox peuvent autoriser la lecture de tous les fichiers du compte.";
  sourceChoiceDialog.showModal();
}

async function loadLocalFiles(files, sourceInput = localFilesInput) {
  if (removingSessionFiles) {
    setFileStatus("La suppression est en cours ; réessayez ensuite.", "error", true);
    if (sourceInput) sourceInput.value = "";
    return;
  }
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) return;

  const invalidFile = selectedFiles.find((file) => !/\.(txt|md|pdf|jpg|jpeg|png|docx|doc|xlsx|xls)$/i.test(file.name));
  if (invalidFile) {
    setFileStatus(`« ${invalidFile.name} » n'est pas dans un format pris en charge. Aucun fichier de cette sélection n'a été ajouté.`, "error", true);
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
    setFileStatus(`« ${oversizedFile.name} » dépasse la limite de ${limit}. Aucun fichier de cette sélection n'a été ajouté.`, "error", true);
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

function addOneDriveOriginalAction(item, sourceDocument) {
  if (!sourceDocument?.oneDriveItemId) {
    addTextElement(item, "p", "", "Réouverture directe indisponible pour cette copie historique ; recherchez l'original par son nom dans OneDrive.");
    return;
  }
  const button = addTextElement(item, "button", "source-button ui-button ui-button--secondary", "Vérifier et ouvrir l’original OneDrive");
  button.type = "button";
  const status = addTextElement(item, "p", "", "");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  button.addEventListener("click", async () => {
    if (!oneDriveAuth?.connected || !oneDriveAccountFingerprint) {
      status.textContent = "Reconnectez OneDrive au compte d'origine avant de vérifier l'accès.";
      return;
    }
    const requestAccountRef = oneDriveAccountFingerprint;
    if (getInventoryAccountRef(sourceDocument) !== requestAccountRef) {
      status.textContent = "Connectez le compte OneDrive d'origine de cette copie avant de continuer.";
      return;
    }
    const currentCopy = getDocuments().find(entry =>
      entry.id === sourceDocument.id && getInventorySource(entry) === "onedrive" &&
      getInventoryAccountRef(entry) === requestAccountRef &&
      entry.oneDriveItemId === sourceDocument.oneDriveItemId);
    if (!currentCopy) {
      status.textContent = "Cette copie ou son identifiant fournisseur n'est plus disponible dans Famili-IA.";
      return;
    }
    const target = window.open("about:blank", "_blank");
    if (!target) {
      status.textContent = "La fenêtre d'ouverture a été bloquée ; autorisez une nouvelle fenêtre puis réessayez.";
      return;
    }
    try {
      target.opener = null;
      status.textContent = "Vérification de l'accès à l'original en cours…";
      const originalUrl = await resolveOneDriveOriginalUrl({
        itemId: currentCopy.oneDriveItemId,
        accountFingerprint: currentCopy.oneDriveAccountFingerprint,
        activeAccountFingerprint: requestAccountRef,
        getToken: () => oneDriveAuth.getToken()
      });
      if (target.closed) throw new Error("La fenêtre d'ouverture a été fermée avant la fin de la vérification.");
      const stillCurrent = getDocuments().some(entry =>
        entry.id === currentCopy.id && getInventorySource(entry) === "onedrive" &&
        getInventoryAccountRef(entry) === requestAccountRef &&
        entry.oneDriveItemId === currentCopy.oneDriveItemId);
      if (!oneDriveAuth.connected || oneDriveAccountFingerprint !== requestAccountRef || !stillCurrent) {
        throw new Error("La session ou la copie a changé pendant la vérification ; recommencez depuis le résultat.");
      }
      target.location.replace(originalUrl);
      status.textContent = "Accès vérifié à l'instant ; l'original s'ouvre dans un nouvel onglet. Cela ne garantit pas les accès ultérieurs.";
    } catch (error) {
      target.close();
      status.textContent = `Ouverture de l'original impossible : ${error instanceof Error ? error.message : "erreur non détaillée"}`;
    }
  });
}

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
          getPhotoLocationConsent: () => getCurrentUser().privacy?.photoLocationConsent === true,
          signal: controller.signal
        });
        if (controller.signal.aborted) break;
        const replacement = mergeOneDriveDocumentUpdate(candidate.existing, result.document);
        await addDocument(replacement);
        const index = uploadedDocuments.findIndex(document => document.id === replacement.id);
        if (index === -1) throw new Error("La copie OneDrive à actualiser n'est plus présente.");
        uploadedDocuments[index] = storedDocument(replacement.id);
        if (result.segments) experimentalIndex.trustExtractedContent(uploadedDocuments[index], result.segments);
        if (result.coverage === "metadata") {
          metadataOnly.push(`${candidate.item.name} (${result.reason || "contenu non disponible"})`);
        }
        invalidContentProvenance.delete(candidate.existing);
        remaining.delete(candidate);
        updated += 1;
        oneDriveReviewStatus.textContent = `Actualisation en cours : ${updated}/${candidates.length}.`;
      } catch (error) {
        if (controller.signal.aborted) break;
        if (error instanceof DropboxApiError && error.status === 401) dropboxAuth.disconnect();
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
  const runStartedAt = new Date().toISOString();
  const runAccountRef = oneDriveAccountFingerprint;
  let runState = "error";
  let failureReason = null;
  let discoveredCount = null;
  let processedCount = 0;
  const summary = () => `${progress.files} fichier(s) parcouru(s), ${progress.pages} page(s), ${progress.foldersRead} dossier(s) ; ${added} copie(s) ajoutée(s), dont ${metadataOnly} en métadonnées seules ; copies existantes : ${compared.unchanged} même version observée, ${compared.changed} changement détecté, ${compared.unknown} version inconnue.`;
  oneDriveObservation = "working";
  oneDriveScanSettled = (async () => {
    await persistSourceRun({
      sourceId: "onedrive",
      accountRef: runAccountRef,
      scopeKind: "account",
      state: "running",
      startedAt: runStartedAt
    });
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
            getToken: () => oneDriveAuth.getToken(), signal: controller.signal,
            getPhotoLocationConsent: () => getCurrentUser().privacy?.photoLocationConsent === true
          });
          if (controller.signal.aborted) throw new DOMException("Indexation arrêtée.", "AbortError");
          await addDocument(result.document);
          const stored = storedDocument(result.document.id);
          uploadedDocuments.push(stored);
          existing.set(id, stored);
          if (result.segments) experimentalIndex.trustExtractedContent(stored, result.segments);
          added += 1;
          if (result.coverage === "metadata") metadataOnly += 1;
          if (added % 10 === 0) refreshExperimentalIndex();
        }
      });
      scanComplete = true;
      runState = "complete";
      discoveredCount = progress.files;
      processedCount = progress.files;
      oneDriveObservation = "connected";
      oneDriveStatus.textContent = `Parcours terminé. ${summary()} Les éléments absents ne sont pas déclarés supprimés.`;
    } catch (error) {
      runState = error.name === "AbortError" ? "interrupted" : "error";
      discoveredCount = null;
      processedCount = progress.files;
      failureReason = sourceRunFailureReason(error);
      oneDriveObservation = error.name === "AbortError" ? "connected" : "error";
      oneDriveStatus.textContent = `${error.name === "AbortError" ? "Indexation arrêtée" : `Indexation interrompue : ${error.message}`}. ${summary()} Les copies déjà enregistrées sont conservées.`;
    } finally {
      await persistSourceRun({
        sourceId: "onedrive",
        accountRef: runAccountRef,
        scopeKind: "account",
        state: runState,
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        discoveredCount,
        processedCount,
        failureReason
      });
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

const dropboxAppKey = import.meta.env.VITE_DROPBOX_APP_KEY?.trim();
const dropboxAuth = dropboxAppKey && !isNativePlatform
  ? new DropboxAuth(dropboxAppKey, new URL("dropbox-redirect.html", document.baseURI).href) : null;
const dropboxConnectButton = document.querySelector("#connect-dropbox");
const dropboxStartButton = document.querySelector("#start-dropbox");
const dropboxResumeButton = document.querySelector("#resume-dropbox");
const dropboxStopButton = document.querySelector("#stop-dropbox");
const dropboxDisconnectButton = document.querySelector("#disconnect-dropbox");
const dropboxStatus = document.querySelector("#dropbox-status");
const dropboxReviewPanel = document.querySelector("#dropbox-review-panel");
const dropboxReviewList = document.querySelector("#dropbox-review-list");
const dropboxReviewStatus = document.querySelector("#dropbox-review-status");
const dropboxApplyUpdatesButton = document.querySelector("#apply-dropbox-updates");
const dropboxKeepCopiesButton = document.querySelector("#keep-dropbox-copies");
let pendingDropboxChanges = [];
let dropboxResumeCheckpoint = null;
let dropboxConnecting = false;

function updateDropboxActions() {
  const busy = dropboxConnecting || Boolean(dropboxScanSettled) || removingSessionFiles;
  dropboxConnectButton.disabled = !dropboxAuth || busy;
  dropboxStartButton.disabled = !dropboxAuth?.connected || busy;
  dropboxStartButton.textContent = dropboxResumeCheckpoint
    ? "Recommencer l'indexation Dropbox" : "Indexer Dropbox";
  dropboxResumeButton.hidden = !dropboxResumeCheckpoint;
  dropboxResumeButton.disabled = !dropboxAuth?.connected || busy;
  dropboxStopButton.hidden = !dropboxScanSettled;
  dropboxDisconnectButton.hidden = !dropboxAuth?.connected;
  dropboxDisconnectButton.disabled = busy;
  dropboxReviewList.querySelectorAll("input").forEach(input => { input.disabled = busy; });
  dropboxApplyUpdatesButton.disabled = busy || !dropboxAuth?.connected || pendingDropboxChanges.length === 0;
  dropboxKeepCopiesButton.disabled = busy || pendingDropboxChanges.length === 0;
  document.querySelector("#import-dropbox-availability").textContent = !dropboxAuth
    ? "Non configuré ou indisponible sur cette plateforme."
    : dropboxConnecting ? "Connexion en cours…"
      : dropboxScanSettled ? "Indexation en cours, consultable dans les options."
        : dropboxAuth.connected ? "Session connectée. Indexation sur demande." : "Connexion facultative, sans indexation automatique.";
}

function renderDropboxReview(candidates) {
  pendingDropboxChanges = candidates;
  dropboxReviewList.replaceChildren();
  candidates.forEach((candidate, index) => {
    const item = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `dropbox-update-${index}`;
    checkbox.value = String(index);
    checkbox.disabled = Boolean(dropboxScanSettled) || !dropboxAuth?.connected || removingSessionFiles;
    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = `${candidate.existing.name} → ${candidate.item.name} (${candidate.changes.join(" ; ") || "version Dropbox différente"})`;
    item.append(checkbox, label);
    dropboxReviewList.appendChild(item);
  });
  dropboxReviewPanel.hidden = candidates.length === 0;
  dropboxApplyUpdatesButton.disabled = Boolean(dropboxScanSettled) || !dropboxAuth?.connected
    || removingSessionFiles || candidates.length === 0;
  dropboxKeepCopiesButton.disabled = Boolean(dropboxScanSettled) || removingSessionFiles || candidates.length === 0;
}

function clearDropboxReview() {
  renderDropboxReview([]);
  dropboxReviewStatus.textContent = "";
}

async function applyDropboxUpdates(candidates) {
  if (!candidates.length || !dropboxAuth?.connected || dropboxScanSettled || removingSessionFiles) return;
  const accountId = dropboxAuth.accountId;
  const controller = new AbortController();
  dropboxScanController = controller;
  dropboxObservation = "working";
  dropboxReviewStatus.textContent = `Actualisation en cours : 0/${candidates.length}. Les copies précédentes restent disponibles en cas d'erreur.`;

  const remaining = new Set(pendingDropboxChanges);
  dropboxScanSettled = (async () => {
    let updated = 0;
    const failures = [];
    const metadataOnly = [];
    for (const candidate of candidates) {
      if (controller.signal.aborted) break;
      try {
        const identity = await dropboxIdentity(accountId, "session");
        const existing = uploadedDocuments.find(document => document.id === candidate.existing.id);
        if (!existing || !canRefreshDropboxCopy(existing, identity.accountFingerprint)
          || existing.dropboxRev !== candidate.existing.dropboxRev
          || compareDropboxCopy(existing, candidate.item) !== "changed") {
          throw new Error("La copie ou sa version a changé depuis la revue ; relancez l'indexation.");
        }
        const result = await readDropboxDocument({
          item: candidate.item, accountId, getToken: () => dropboxAuth.getToken(), signal: controller.signal,
          includeLocation: getCurrentUser().privacy?.photoLocationConsent === true
        });
        if (controller.signal.aborted) break;
        if (!dropboxAuth.connected || dropboxAuth.accountId !== accountId) {
          throw new Error("La session Dropbox a changé pendant l'actualisation.");
        }
        const replacement = mergeDropboxDocumentUpdate(existing, result.document);
        const index = uploadedDocuments.findIndex(document => document.id === replacement.id);
        if (index === -1) throw new Error("La copie Dropbox à actualiser n'est plus présente.");
        await addDocument(replacement);
        uploadedDocuments[index] = storedDocument(replacement.id);
        remaining.delete(candidate);
        updated += 1;
        if (result.segments) experimentalIndex.trustExtractedContent(uploadedDocuments[index], result.segments);
        invalidContentProvenance.delete(existing);
        if (result.coverage === "metadata") {
          metadataOnly.push(`${candidate.item.name} (${result.reason || "contenu non disponible"})`);
        }
        dropboxReviewStatus.textContent = `Actualisation en cours : ${updated}/${candidates.length}.`;
      } catch (error) {
        if (controller.signal.aborted) break;
        if (error instanceof DropboxApiError && error.status === 401) dropboxAuth.disconnect();
        failures.push(`${candidate.item.name} : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
      }
    }

    pendingDropboxChanges = [...remaining];
    const interrupted = controller.signal.aborted;
    dropboxObservation = !dropboxAuth.connected ? "disconnected" : failures.length ? "error" : "connected";
    dropboxStatus.textContent = interrupted
      ? `Actualisation Dropbox arrêtée. ${updated} copie(s) remplacée(s) ; les autres restent à examiner.`
      : `Actualisation Dropbox terminée : ${updated} copie(s) remplacée(s)${failures.length ? ` ; ${failures.length} échec(s)` : ""}${metadataOnly.length ? ` ; métadonnées seules : ${metadataOnly.join(", ")}` : ""}.`;
    dropboxReviewStatus.textContent = [
      interrupted ? "Action arrêtée ; les éléments non terminés restent à examiner." : "",
      pendingDropboxChanges.length && !interrupted ? `${pendingDropboxChanges.length} élément(s) non actualisé(s) restent à examiner.` : "",
      ...failures
    ].filter(Boolean).join(" ");
    renderDropboxReview(pendingDropboxChanges);
    if (!pendingDropboxChanges.length && failures.length) dropboxReviewStatus.textContent = failures.join(" ");
  })().finally(() => {
    dropboxScanController = null;
    dropboxScanSettled = null;
    refreshExperimentalIndex();
    renderDataInventory(parseHash().params);
    updateDropboxActions();
    renderExperimentalSources();
  });
  updateDropboxActions();
  renderExperimentalSources();
}

dropboxStatus.textContent = dropboxAuth
  ? "Dropbox prêt à être connecté. Aucune indexation n'a démarré."
  : isNativePlatform ? "Dropbox est disponible uniquement dans le navigateur Web configuré."
    : "Dropbox n'est pas configuré : ajoutez VITE_DROPBOX_APP_KEY à .env.local, puis redémarrez Vite. Aucun secret client.";
updateDropboxActions();
dropboxConnectButton.addEventListener("click", async () => {
  if (!dropboxAuth || dropboxConnecting || dropboxScanSettled || removingSessionFiles) return;
  dropboxConnecting = true;
  dropboxResumeCheckpoint = null;
  updateDropboxActions();
  try {
    await dropboxAuth.connect();
    const connectedAccount = dropboxAuth.accountId;
    const identity = await dropboxIdentity(connectedAccount, "session");
    if (!dropboxAuth.connected || dropboxAuth.accountId !== connectedAccount) throw new Error("Session Dropbox interrompue.");
    dropboxAccountFingerprint = identity.accountFingerprint;
    dropboxObservation = "connected";
    try {
      dropboxResumeCheckpoint = await getDropboxIndexCheckpoint(identity.accountFingerprint);
    } catch (error) {
      dropboxStatus.textContent = `Dropbox connecté (compte …${identity.accountFingerprint.slice(0, 16)}), mais le point de reprise local n'a pas pu être lu : ${error.message}.`;
      return;
    }
    dropboxStatus.textContent = `Dropbox connecté (compte …${identity.accountFingerprint.slice(0, 16)}). Aucun fichier lu : lancez séparément l'indexation si vous le souhaitez.${dropboxResumeCheckpoint ? " Un point de reprise local est disponible ; choisissez Reprendre ou Recommencer." : ""}`;
  } catch (error) {
    dropboxResumeCheckpoint = null;
    dropboxObservation = "error";
    dropboxStatus.textContent = `Connexion Dropbox non aboutie : ${error.message}`;
  } finally {
    dropboxConnecting = false;
    updateDropboxActions();
    renderExperimentalSources();
  }
});
function startDropboxIndex({ resume = false } = {}) {
  if (dropboxConnecting || dropboxScanSettled || removingSessionFiles) return;
  if (!dropboxAuth?.connected) {
    dropboxStatus.textContent = "Session Dropbox absente ou expirée : reconnectez Dropbox avant d'indexer.";
    updateDropboxActions();
    return;
  }
  clearDropboxReview();
  const controller = new AbortController();
  dropboxScanController = controller;
  const accountId = dropboxAuth.accountId;
  const existing = new Map(uploadedDocuments.map(doc => [doc.id, doc]));
  const candidates = [];
  let accountFingerprint = null;
  let added = 0;
  let metadata = 0;
  let changed = 0;
  let unchanged = 0;
  let unknown = 0;
  let progress = { files: 0, pages: 0 };
  const runStartedAt = new Date().toISOString();
  let runState = "error";
  let failureReason = null;
  let discoveredCount = null;
  let processedCount = 0;
  const summary = () => `${progress.files} fichier(s) parcouru(s), ${progress.pages} page(s), ${added} copie(s) ajoutée(s), dont ${metadata} en métadonnées seules ; ${changed} changement(s), ${unchanged} même(s) version(s), ${unknown} version(s) inconnue(s).`;
  dropboxObservation = "working";
  dropboxScanSettled = (async () => {
    let resumeCursor = null;
    let resumeExpired = false;
    let checkpointCleanupError = null;
    try {
      const identity = await dropboxIdentity(accountId, "session");
      accountFingerprint = identity.accountFingerprint;
      dropboxAccountFingerprint = accountFingerprint;
      await persistSourceRun({
        sourceId: "dropbox",
        accountRef: accountFingerprint,
        scopeKind: "account",
        state: "running",
        startedAt: runStartedAt
      });
      if (resume) {
        dropboxResumeCheckpoint = await getDropboxIndexCheckpoint(accountFingerprint);
        if (!dropboxResumeCheckpoint) throw new Error("Aucun point de reprise Dropbox n'est enregistré pour ce compte.");
        resumeCursor = dropboxResumeCheckpoint.cursor;
      } else {
        await clearDropboxIndexCheckpoint(accountFingerprint);
        dropboxResumeCheckpoint = null;
      }
      await scanDropbox({
        getToken: () => dropboxAuth.getToken(), signal: controller.signal,
        cursor: resumeCursor,
        onPageComplete: async page => {
          if (page.hasMore) {
            dropboxResumeCheckpoint = await saveDropboxIndexCheckpoint({
              accountFingerprint, cursor: page.cursor
            });
          } else {
            await clearDropboxIndexCheckpoint(accountFingerprint);
            dropboxResumeCheckpoint = null;
          }
          updateDropboxActions();
        },
        onProgress: value => {
          progress = value;
          dropboxStatus.textContent = `${resume ? "Reprise" : "Indexation"} Dropbox en cours : ${summary()}`;
        },
        onItem: async item => {
          const identity = await dropboxIdentity(accountId, item.id);
          const previous = existing.get(identity.id);
          if (previous) {
            if (!canRefreshDropboxCopy(previous, identity.accountFingerprint)
              || compareDropboxCopy(previous, item) === "unknown") {
              unknown++;
            } else if (compareDropboxCopy(previous, item) === "unchanged") {
              unchanged++;
            } else {
              changed++;
              candidates.push({
                existing: { ...previous },
                item,
                changes: describeDropboxChanges(previous, item)
              });
            }
            return;
          }
          const result = await readDropboxDocument({
            item, accountId, getToken: () => dropboxAuth.getToken(), signal: controller.signal,
            includeLocation: getCurrentUser().privacy?.photoLocationConsent === true
          });
          if (controller.signal.aborted) throw new DOMException("Indexation Dropbox arrêtée.", "AbortError");
          await addDocument(result.document);
          const stored = storedDocument(result.document.id);
          uploadedDocuments.push(stored);
          existing.set(identity.id, stored);
          if (result.segments) experimentalIndex.trustExtractedContent(stored, result.segments);
          added++;
          if (result.coverage === "metadata") metadata++;
          if (added % 10 === 0) refreshExperimentalIndex();
        }
      });
      runState = "complete";
      discoveredCount = progress.files;
      processedCount = progress.files;
      dropboxObservation = "connected";
      renderDropboxReview(candidates);
      dropboxReviewStatus.textContent = candidates.length
        ? "Aucune copie n'a été remplacée. Cochez uniquement les éléments à actualiser, puis confirmez ; les autres copies resteront inchangées."
        : "";
      dropboxStatus.textContent = `${resume ? "Reprise" : "Parcours"} Dropbox terminée. ${summary()} Les absences ne prouvent pas une suppression.${candidates.length ? " Examinez et confirmez les changements ci-dessous." : ""}`;
    } catch (error) {
      runState = error.name === "AbortError" ? "interrupted" : "error";
      discoveredCount = null;
      processedCount = progress.files;
      failureReason = sourceRunFailureReason(error);
      clearDropboxReview();
      if (resume && error instanceof DropboxApiError && error.status === 409 && accountFingerprint) {
        try {
          await clearDropboxIndexCheckpoint(accountFingerprint);
          dropboxResumeCheckpoint = null;
          resumeExpired = true;
        } catch (clearError) {
          checkpointCleanupError = clearError;
        }
      }
      if (error instanceof DropboxApiError && error.status === 401) dropboxAuth.disconnect();
      dropboxObservation = error.name === "AbortError" ? "connected" : "error";
      dropboxStatus.textContent = resumeExpired
        ? `Le point de reprise Dropbox n'est plus valide (HTTP 409) et a été effacé. Recommencez l'indexation depuis le début. ${summary()} Les copies enregistrées sont conservées.`
        : `${error.name === "AbortError" ? "Indexation Dropbox arrêtée" : `${resume ? "Reprise" : "Indexation"} Dropbox interrompue : ${error.message}`}. ${summary()} Les copies enregistrées sont conservées.${checkpointCleanupError ? ` Le point de reprise n'a pas pu être effacé : ${checkpointCleanupError.message}` : ""}`;
    } finally {
      await persistSourceRun({
        sourceId: "dropbox",
        accountRef: accountFingerprint,
        scopeKind: "account",
        state: runState,
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        discoveredCount,
        processedCount,
        failureReason
      });
      dropboxScanController = null;
      dropboxScanSettled = null;
      refreshExperimentalIndex();
      updateClearFilesButtonsVisibility();
      updateModeBanner();
      renderDataInventory(parseHash().params);
      updateDropboxActions();
    }
  })();
  updateDropboxActions();
  renderExperimentalSources();
}
dropboxStartButton.addEventListener("click", () => startDropboxIndex());
dropboxResumeButton.addEventListener("click", () => startDropboxIndex({ resume: true }));
dropboxStopButton.addEventListener("click", () => dropboxScanController?.abort());
sourceChoiceDialog.addEventListener("close", () => {
  dropboxScanController?.abort();
  dropboxAuth?.cancelConnection();
});
dropboxApplyUpdatesButton.addEventListener("click", () => {
  const selected = [...dropboxReviewList.querySelectorAll("input:checked")]
    .map(input => pendingDropboxChanges[Number(input.value)])
    .filter(Boolean);
  if (!selected.length) {
    dropboxReviewStatus.textContent = "Sélectionnez au moins un élément à actualiser.";
    return;
  }
  void applyDropboxUpdates(selected);
});
dropboxKeepCopiesButton.addEventListener("click", () => {
  if (dropboxScanSettled || removingSessionFiles) return;
  clearDropboxReview();
  dropboxReviewStatus.textContent = "Les copies actuelles sont conservées ; aucun contenu Dropbox n'a été relu.";
  dropboxStatus.textContent = "Les copies Dropbox actuelles sont conservées ; aucun contenu Dropbox n'a été relu.";
});
dropboxDisconnectButton.addEventListener("click", () => {
  if (!dropboxAuth || dropboxConnecting || dropboxScanSettled || removingSessionFiles) return;
  dropboxAuth.disconnect();
  clearDropboxReview();
  dropboxResumeCheckpoint = null;
  dropboxAccountFingerprint = null;
  dropboxObservation = "disconnected";
  dropboxStatus.textContent = "Session Dropbox locale déconnectée. Les copies restent conservées ; l'autorisation Dropbox n'est pas révoquée. Retirez-la dans les applications connectées Dropbox si souhaité.";
  updateDropboxActions();
  renderExperimentalSources();
});
function openImportFrom(button) {
  importReturnContext = { ...parseHash(), trigger: button };
  if (importReturnContext.view === "recherche") importReturnContext.params.q = input.value;
  const back = document.querySelector("#return-from-import");
  back.textContent = `Retour — ${pageTitles[importReturnContext.view]}`;
  back.hidden = false;
  showView("importer");
  document.querySelector("#import-title").focus();
}
document.querySelectorAll("[data-open-import]").forEach(button => {
  button.addEventListener("click", () => openImportFrom(button));
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

const chooseNativePhotosButton = document.querySelector("#choose-native-photos");
if (chooseNativePhotosButton) {
  chooseNativePhotosButton.hidden = Capacitor.getPlatform() !== "android";
  chooseNativePhotosButton.addEventListener("click", async () => {
    sourceChoiceDialog.close();
    if (removingSessionFiles) {
      setFileStatus("La suppression est en cours ; réessayez ensuite.", "error");
      return;
    }
    chooseNativePhotosButton.disabled = true;
    try {
      const files = await selectNativePhotoFiles();
      if (files.length === 0) {
        setFileStatus("Aucune photo sélectionnée.", "success");
        return;
      }
      await loadLocalFiles(files, null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erreur non détaillée.";
      setFileStatus(`La sélection de photos a échoué : ${reason}`, "error");
    } finally {
      chooseNativePhotosButton.disabled = false;
    }
  });
}

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
  const runStartedAt = new Date().toISOString();
  let runState = "error";
  let discoveredCount = null;
  let processedCount = 0;
  let failedCount = 0;
  setDriveConnectionStatus("Ouverture de l'autorisation Google. Vous pouvez annuler avant de choisir des fichiers.", "success");
  try {
    await persistSourceRun({
      sourceId: "drive",
      scopeKind: "selected-files",
      state: "running",
      startedAt: runStartedAt
    });
    const selection = await googleDriveSource.selectFiles(remainingCount);
    const loadedFiles = selection.documents;
    driveObservation = "unknown";
    if (selectionGeneration !== driveSelectionGeneration) {
      runState = "interrupted";
      setDriveConnectionStatus("La sélection a été ignorée car les fichiers ont été retirés pendant son exécution.", "error");
      return;
    }
    if (loadedFiles.length === 0) {
      runState = "interrupted";
      discoveredCount = 0;
      setDriveConnectionStatus(selection.status === "cancelled"
        ? "Sélection Google Drive annulée. Aucun fichier n'a été lu."
        : "Aucun fichier Google Drive sélectionné.", "success");
      return;
    }
    discoveredCount = loadedFiles.length;
    processedCount = loadedFiles.length;
    runState = "complete";

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
      uploadedDocuments.push(storedDocument(doc.id));
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
    runState = "error";
    discoveredCount = null;
    processedCount = 0;
    failedCount = 0;
    driveObservation = "error";
    refreshExperimentalIndex();
    const reason = error instanceof Error ? error.message : "Erreur Google non détaillée.";
    setDriveConnectionStatus(`La sélection Drive a échoué : ${reason}`, "error");
  } finally {
    await persistSourceRun({
      sourceId: "drive",
      scopeKind: "selected-files",
      state: runState,
      startedAt: runStartedAt,
      finishedAt: new Date().toISOString(),
      discoveredCount,
      processedCount,
      failedCount
    });
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
    dropboxScanController?.abort();
    if (dropboxScanSettled) await dropboxScanSettled;
    await stopBackgroundScans();
    await clearDropboxIndexCheckpoints();
    dropboxResumeCheckpoint = null;
    const shouldRevokeGoogleAccess = Boolean(googleDriveClient?.hasAccessToken);
    for (const doc of [...uploadedDocuments]) {
      await deleteDocument(doc.id, { invalidateDropboxCheckpoint: false });
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
    updateDropboxActions();
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
    description: "Cette vue présente les fiches locales de votre cercle familial. Elles ne créent aucun compte ni partage."
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
      initEquipmentDetailView(params.id);
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
      updateDropboxActions();
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
  document.body.classList.toggle('ui-warm', ['accueil', 'recherche', 'maison', 'detail', 'importer', 'alertes', 'famille', 'vos-donnees', 'profil', 'plus', 'assistant'].includes(name));
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
  const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  if (mainContent) {
    mainContent.scrollTo({ top: 0, behavior: scrollBehavior });
  } else {
    window.scrollTo({ top: 0, behavior: scrollBehavior });
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
    const user = getCurrentUser();
    const changes = {
      name: newName,
      avatar: !user.avatar || user.avatar === getNameInitial(user.name || '')
        ? getNameInitial(newName) : user.avatar,
      address: document.querySelector("#edit-profile-address").value.trim(),
      postalCode: document.querySelector("#edit-profile-postal").value.trim(),
      city: document.querySelector("#edit-profile-city").value.trim(),
      photoLocationConsent: document.querySelector("#consent-photo-gps").checked
    };
    const saveButton = document.querySelector('#save-profile');
    saveButton.disabled = true;
    try {
      await updateUserProfile(changes);
      synchronizeStoredPhotoDocuments();
      refreshExperimentalIndex();
      initProfileView();
      status.textContent = "Préférences enregistrées.";
      showDemoNotice(`Profil mis à jour : ${newName}`);
    } catch (error) {
      console.error("Impossible d'enregistrer le profil :", error);
      synchronizeStoredPhotoDocuments();
      refreshExperimentalIndex();
      document.querySelector("#consent-photo-gps").checked = getCurrentUser().privacy?.photoLocationConsent === true;
      status.textContent = "Les préférences n'ont pas pu être enregistrées. Réessayez. Le choix GPS affiché reflète l'état conservé ; les coordonnées déjà effacées ne sont pas restaurées.";
      showDemoNotice("Impossible d'enregistrer le profil.");
    } finally {
      saveButton.disabled = false;
    }
  });

}

function initProfileView() {
  const user = getCurrentUser();
  document.querySelector('#profile-save-status').textContent = '';
  document.querySelector('#profile-avatar').textContent = user.avatar || getNameInitial(user.name || '');
  document.querySelector('#profile-name').textContent = user.name || '';
  document.querySelector('#edit-name').value = user.name || '';
  document.querySelector('#edit-profile-address').value = user.address || '';
  document.querySelector('#edit-profile-postal').value = user.postalCode || '';
  document.querySelector('#edit-profile-city').value = user.city || '';
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

function getEquipmentIllustration(category) {
  const illustrations = {
    pompe: new URL('./assets/pompe/pompe-photo.jpg', import.meta.url).href,
    piscine: new URL('./assets/piscine/piscine-photo.jpg', import.meta.url).href,
    pergola: new URL('./assets/pergola/pergola-photo.jpg', import.meta.url).href,
    volets: new URL('./assets/store/store-photo.jpg', import.meta.url).href,
    chauffage: new URL('./assets/chaudiere/chaudiere-photo.jpg', import.meta.url).href
  };
  return Object.hasOwn(illustrations, category) ? illustrations[category] : null;
}

function getEquipmentCover(equipment) {
  let photo = null;
  let error = '';
  try {
    if (equipment.coverPhoto) photo = validateCoverPhoto(equipment.coverPhoto);
  } catch (cause) {
    console.error("Photo personnelle d'équipement invalide :", cause);
    error = 'Votre photo ne peut pas être affichée. Le visuel par défaut est utilisé.';
  }
  const illustration = getEquipmentIllustration(equipment.category);
  const source = photo?.dataUrl || illustration;
  const visual = source
    ? `<img src="${escapeHtml(source)}" alt="" loading="lazy" decoding="async" data-equipment-cover="${escapeHtml(equipment.id)}" data-personal-photo="${Boolean(photo)}" style="object-position: ${photo?.positionX ?? 50}% ${photo?.positionY ?? 50}%">`
    : getEquipmentIcon(equipment.category);
  return {
    photo, illustration, visual, error,
    origin: photo ? 'Photo personnelle · cet appareil' : illustration ? 'Illustration IA' : 'Repère de catégorie'
  };
}

function bindEquipmentPhotoErrors(root) {
  root.querySelectorAll('img[data-equipment-cover]').forEach(image => {
    image.addEventListener('error', () => {
      const equipment = getEquipmentDetail(image.dataset.equipmentCover);
      if (!equipment) return;
      const scope = image.closest('.equipment-row, .equipment-cover');
      const personal = image.dataset.personalPhoto === 'true';
      const illustration = getEquipmentIllustration(equipment.category);
      console.error(personal ? "Photo personnelle d'équipement illisible." : "Illustration d'équipement indisponible.");
      const fallbackImage = personal && illustration;
      if (fallbackImage) {
        image.dataset.personalPhoto = 'false';
        image.style.objectPosition = '50% 50%';
        image.src = illustration;
      } else image.outerHTML = getEquipmentIcon(equipment.category);
      scope.querySelector('.equipment-photo-origin').textContent = fallbackImage ? 'Illustration IA' : 'Repère de catégorie';
      const notice = scope.querySelector('.equipment-photo-error');
      notice.hidden = false;
      notice.textContent = personal
        ? 'Votre photo est illisible. Le visuel par défaut est utilisé ; vous pouvez remplacer ou retirer votre photo.'
        : "L'illustration est indisponible. Le repère de catégorie est utilisé.";
    });
  });
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
    const hasEquipment = getEquipmentByCategory().length > 0;
    equipmentList.innerHTML = '';
    document.querySelector('#equipment-empty-title').textContent = hasEquipment
      ? 'Encore aucun équipement dans cette catégorie' : 'Votre carnet commence ici';
    document.querySelector('#equipment-empty-description').textContent = hasEquipment
      ? 'Vos autres équipements vous attendent dans le carnet.'
      : 'Ajoutez votre premier équipement pour retrouver ses informations ici.';
    document.querySelector('#show-all-equipment').hidden = !hasEquipment;
    document.querySelector('#add-first-equipment').hidden = hasEquipment;
    equipmentEmpty.hidden = false;
    return;
  }

  equipmentList.innerHTML = equipment.map(eq => {
    const cover = getEquipmentCover(eq);
    const documentCount = new Set(eq.docs || []).size;
    let iconClass = 'blue';
    if (eq.category === 'pompe') { iconClass = 'green'; }
    else if (eq.category === 'piscine') { iconClass = 'violet'; }
    else if (eq.category === 'imprimante') { iconClass = 'cyan'; }
    else if (eq.category === 'assurance') { iconClass = 'amber'; }

    return `
      <button class="ui-button ui-button--secondary equipment-row" type="button" data-equipment="${escapeHtml(eq.id)}" data-open-view="detail?id=${escapeHtml(encodeURIComponent(eq.id))}">
        <span class="ui-icon row-icon ${iconClass} equipment-visual" aria-hidden="true">${cover.visual}</span>
        <span class="row-copy"><strong>${escapeHtml(eq.name)}</strong><small class="equipment-photo-origin">${cover.origin}</small><small class="equipment-photo-error" ${cover.error ? '' : 'hidden'}>${cover.error}</small><small>Statut saisi : ${escapeHtml(eq.status || 'non renseigné')}</small><small>${documentCount} document${documentCount > 1 ? 's' : ''} associé${documentCount > 1 ? 's' : ''}</small></span>
        <span class="stat-arrow" aria-hidden="true">›</span>
      </button>
    `;
  }).join('');

  equipmentEmpty.hidden = true;
  bindEquipmentPhotoErrors(equipmentList);
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

  const hasPersonalName = Boolean(user.name && user.name !== 'Mon espace');
  document.querySelector('#dashboard-greeting').textContent = hasPersonalName ? 'Bonjour ' : 'Bienvenue chez vous';
  document.querySelector('#dashboard-user-name').textContent = hasPersonalName ? user.name : '';
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
      ${alerts.length ? '' : `<div class="home-reminders-empty">
        <span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v4m8-4v4M4 10h16"/><rect x="4" y="5" width="16" height="16" rx="3"/><path d="m9 15 2 2 4-4"/></svg></span>
        <div><h3>Un peu de place pour souffler</h3><p>Aucun rappel actif enregistré pour le moment.</p></div>
      </div>`}
      <p class="household-note">${alerts.length ? 'Vos rappels enregistrés, y compris ceux reportés. Leurs dates et leurs sources sont consultables dans Alertes.' : 'Seuls les rappels enregistrés sont affichés ici ; toutes vos échéances ne sont pas forcément couvertes.'}</p>
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
    if (detailBreadcrumb) detailBreadcrumb.textContent = 'Équipement';
    document.querySelector('#detail-description').textContent = 'Retrouvez vos autres équipements dans le carnet Maison.';
    detailContent.innerHTML = `<section class="ui-card equipment-missing"><p class="error-state">Désolé, cet équipement n'existe pas ou a été supprimé.</p><button class="ui-button ui-button--secondary" type="button" data-open-view="maison">Retour à la maison</button></section>`;
    return;
  }

  const name = eqDetail.name;
  detailTitle.textContent = name;
  document.querySelector('#detail-description').textContent = 'Ses repères, ses papiers et ce qui mérite votre attention.';
  if (detailBreadcrumb) detailBreadcrumb.textContent = name;

  const cover = getEquipmentCover(eqDetail);
  const documentIds = new Set(eqDetail.docs || []);
  const availableDocuments = [...uploadedDocuments, ...documents];
  const reminders = getAlerts().filter(alert =>
    (!alert.status || alert.status === 'active') && documentIds.has(alert.docId));

  detailContent.innerHTML = `
    <section class="ui-card equipment-overview">
      <div class="equipment-cover">
        <div class="equipment-cover-frame">
          ${cover.visual}
          <button class="ui-button ui-button--secondary equipment-photo-edit" type="button" data-edit-equipment-photo="${escapeHtml(eqDetail.id)}" aria-haspopup="dialog">Modifier la photo</button>
        </div>
        <small class="equipment-photo-origin">${cover.photo || !cover.illustration ? cover.origin : "Visuel d'illustration IA, pas une photo de votre équipement."}</small>
        <small class="equipment-photo-error" role="status" ${cover.error ? '' : 'hidden'}>${cover.error}</small>
      </div>
      <div class="equipment-specs">
      <h2>Ses repères</h2>
      <div class="spec-grid">
        <div class="spec-item"><span class="spec-label">Catégorie</span><span>${escapeHtml(eqDetail.category.charAt(0).toUpperCase() + eqDetail.category.slice(1))}</span></div>
        <div class="spec-item"><span class="spec-label">Statut saisi</span><span>${escapeHtml(eqDetail.status || 'Non renseigné')}</span></div>
      </div>
      <p class="household-note">Ces informations sont celles enregistrées pour cet équipement, pas un diagnostic ni une confirmation de garantie.</p>
      <button class="ui-button ui-button--secondary" type="button" id="edit-equipment">Modifier ses informations</button>
      </div>
    </section>

      <section class="ui-card equipment-documents" aria-labelledby="equipment-documents-title">
        <div class="section-heading"><h2 id="equipment-documents-title">Ses papiers</h2><span>${documentIds.size} document${documentIds.size > 1 ? 's' : ''} associé${documentIds.size > 1 ? 's' : ''}</span></div>
        <p class="household-note">Documents associés à cette fiche. L'accès aux originaux n'est pas garanti.</p>
        <div class="doc-grid">
          ${documentIds.size > 0
            ? [...documentIds].map(docId => {
                const doc = availableDocuments.find(d => d.id === docId);
                const docName = doc ? doc.name : `Document indisponible · ${docId}`;
                const origin = doc ? getInventorySource(doc) : null;
                const provenance = doc ? (origin === 'demo' ? 'Exemple fictif' : `${sourceName(origin)} · copie dans Famili-IA`) : 'Copie absente de cet appareil';
                return `
                  <button class="ui-button ui-button--secondary doc-link-card" type="button" data-doc-id="${escapeHtml(docId)}">
                    <span class="ui-icon doc-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6v20h12V6zM14 2v5h5M8 12h8m-8 4h6"/></svg></span>
                    <span class="doc-name">${escapeHtml(docName)}<small>${escapeHtml(provenance)}</small></span>
                    <span class="doc-arrow" aria-hidden="true">›</span>
                  </button>
                `;
              }).join('')
            : '<p class="empty-docs">Les documents associés à cet équipement apparaîtront ici. Vous pouvez déjà rechercher ses papiers dans vos fichiers.</p>'}
        </div>
        <p class="household-note">L'ajout de nouvelles associations n'est pas disponible dans cette version.</p>
        <button class="ui-button ui-button--primary" type="button" data-open-view="recherche?q=${escapeHtml(encodeURIComponent(name))}">Rechercher ses documents</button>
      </section>
      <section class="ui-card equipment-attention" aria-labelledby="equipment-attention-title">
        <h2 id="equipment-attention-title">Ce qui mérite votre attention</h2>
        <p class="household-note">Rappels enregistrés pour les documents associés, y compris les reports. Ils ne couvrent pas forcément toutes les échéances.</p>
        ${reminders.length ? reminders.map(alert => {
          const date = normalizeAlertDate(alert.dueDate);
          const type = calculateAlertType(alert.dueDate, alert.type, alert.documentType);
          const filter = getDaysUntilDate(alert.snoozedUntil) > 0 ? 'reportées'
            : type === 'red' ? 'à-traiter' : type === 'amber' ? 'à-anticiper' : 'à-surveiller';
          const doc = availableDocuments.find(doc => doc.id === alert.docId);
          return `<article class="equipment-reminder">
            <h3>${escapeHtml(alert.title)}</h3>
            ${alert.detail ? `<p>${escapeHtml(alert.detail)}</p>` : ''}
            <p>Échéance enregistrée : ${date ? escapeHtml(new Date(date + 'T12:00:00').toLocaleDateString('fr-FR')) : 'date à vérifier'}</p>
            <p>Document associé : ${escapeHtml(doc?.name || 'copie indisponible')}</p>
            ${alert.sourceExcerpt ? `<blockquote>${escapeHtml(alert.sourceExcerpt)}</blockquote>` : '<p class="household-note">Extrait de preuve non renseigné.</p>'}
            ${alert.source !== 'document' ? '<p class="household-note">Source du rappel non vérifiée.</p>' : ''}
            ${alert.sourceReview ? '<p class="household-note"><strong>Source à vérifier.</strong> La date enregistrée doit être réexaminée dans Alertes.</p>' : ''}
            ${filter === 'reportées' ? '<p class="household-note">Rappel reporté : consultez le report dans Alertes.</p>' : ''}
            <button class="ui-button ui-button--secondary" type="button" data-open-view="alertes?filter=${escapeHtml(encodeURIComponent(filter))}">Voir le rappel dans Alertes</button>
          </article>`;
        }).join('') : '<p class="equipment-attention-empty">Aucun rappel actif enregistré pour ces documents. Rien de plus à afficher pour le moment.</p>'}
      </section>
      <div class="equipment-actions"><button class="ui-button ui-button--danger" type="button" id="delete-equipment">Supprimer cet équipement</button></div>
  `;

  bindEquipmentPhotoErrors(detailContent);
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
      const doc = [...uploadedDocuments, ...documents].find(d => d.id === docId);
      if (doc) openDocumentPreview(doc);
      else showDemoNotice("Ce document n'est pas disponible sur cet appareil.");
    });
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

  filteredAlerts.sort((first, second) => {
    const firstDate = normalizeAlertDate(filter === 'reportées' ? first.snoozedUntil : first.dueDate);
    const secondDate = normalizeAlertDate(filter === 'reportées' ? second.snoozedUntil : second.dueDate);
    if (!firstDate) return secondDate ? 1 : 0;
    if (!secondDate) return -1;
    return firstDate.localeCompare(secondDate);
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
  const periodTitles = {
    'à-traiter': 'À traiter en premier',
    'à-anticiper': 'À anticiper sereinement',
    'à-surveiller': 'Pour garder le fil',
    'reportées': 'À reprendre plus tard',
    'historique': 'Les rappels classés'
  };
  document.querySelector('#alert-period-title').textContent = periodTitles[filter];
  document.querySelector('#alert-list-status').textContent =
    `${filteredAlerts.length} alerte${filteredAlerts.length > 1 ? 's' : ''} · ${filterLabel}`;
  const markReadButton = document.querySelector('#mark-alerts-read');
  markReadButton.disabled = filteredAlerts.length === 0;
  markReadButton.textContent = "Tout marquer comme lu";
  if (restoreFocus) selectedTab.focus({ preventScroll: true });

  if (filteredAlerts.length === 0) {
    const nextTab = [...document.querySelectorAll('.alert-filter-tab')].find(tab =>
      tab !== selectedTab && Number(tab.querySelector('.alert-badge').textContent) > 0);
    const hasDocuments = getDocuments().length > 0;
    const emptyTitle = alerts.length === 0 ? 'Vos prochains rappels commencent ici' : 'Aucun rappel dans cette catégorie';
    const emptyMessage = alerts.length === 0
      ? 'Confirmez une échéance proposée dans Recherche pour la retrouver ici. Seuls les rappels enregistrés apparaissent dans cette liste.'
      : 'Les autres catégories restent disponibles. Cette liste ne couvre que vos rappels enregistrés.';
    const emptyDestination = nextTab ? `alertes?filter=${encodeURIComponent(nextTab.dataset.filter)}`
      : hasDocuments ? 'recherche' : 'importer';
    const emptyAction = nextTab ? `Voir « ${nextTab.firstChild.textContent.trim()} »`
      : hasDocuments ? 'Rechercher une échéance' : 'Ajouter un document';
    alertList.innerHTML = `<section class="ui-card alerts-empty">
      <span class="ui-icon" aria-hidden="true">${getAlertIcon('blue')}</span>
      <h3>${emptyTitle}</h3>
      <p>${emptyMessage}</p>
      <button class="ui-button ui-button--primary" type="button" data-open-view="${escapeHtml(emptyDestination)}">${escapeHtml(emptyAction)}</button>
    </section>`;
    return;
  }

  alertList.innerHTML = '<ol class="alert-timeline" aria-labelledby="alert-period-title">' + filteredAlerts.map(alert => {
    const iconSvg = getAlertIcon(alert.type);
    const isSnoozed = alert.snoozedUntil && alert.snoozedUntil > todayIso;
    const showsResume = isSnoozed && alert.status === 'active';
    const statusAction = alert.status !== "active"
      ? '<button class="ui-button ui-button--secondary alert-status-action" type="button" data-alert-status="active">Réactiver</button>'
      : isSnoozed
        ? '<button class="ui-button ui-button--secondary alert-status-action" type="button" data-unsnooze>Réactiver maintenant</button>'
        : '<button class="ui-button ui-button--secondary alert-status-action" type="button" data-alert-status="ignored">Ignorer</button><button class="ui-button ui-button--secondary alert-status-action" type="button" data-alert-status="resolved">Terminée</button><button class="ui-button ui-button--secondary alert-status-action" type="button" data-snooze-days="1">Reporter 1 jour</button><button class="ui-button ui-button--secondary alert-status-action" type="button" data-snooze-days="7">Reporter 7 jours</button>';
    const dueDateIso = normalizeAlertDate(alert.dueDate);
    const dueDate = dueDateIso
      ? new Date(`${dueDateIso}T00:00:00`).toLocaleDateString("fr-FR")
      : "";
    const daysUntil = getDaysUntilDate(showsResume ? alert.snoozedUntil : dueDateIso, today);
    const timingLabel = daysUntil === null ? ''
      : daysUntil === 0 ? "Aujourd'hui"
        : daysUntil === 1 ? 'Demain'
          : daysUntil === -1 ? 'Hier'
            : daysUntil < 0 ? `Il y a ${-daysUntil} jours` : `Dans ${daysUntil} jours`;
    const resumeDate = normalizeAlertDate(alert.snoozedUntil);
    const alertSource = alert.sourceId ? sourceName(alert.sourceId) : "Document";
    const sourceExcerpt = alert.sourceExcerpt
      ? `<p class="alert-evidence"><strong>Source — ${escapeHtml(alertSource)} :</strong> <mark>${escapeHtml(alert.sourceExcerpt)}</mark></p>`
      : alert.source === 'document' ? '<p class="alert-provenance">Extrait de l\'échéance non renseigné.</p>' : "";
    const snoozeNotice = isSnoozed
      ? `<p class="alert-snooze-note">${resumeDate ? `Reportée jusqu'au ${escapeHtml(new Date(`${resumeDate}T00:00:00`).toLocaleDateString("fr-FR"))}.` : 'Date de reprise à vérifier.'}</p>`
      : "";
    const correctionForm = alert.source === "document" && alert.docId
      ? `<details class="alert-date-correction"><summary>Corriger la date</summary><form data-alert-date-form><label class="ui-label">Date d'échéance confirmée<input class="ui-input" type="date" name="dueDate" value="${dueDateIso || ''}" required></label><button class="ui-button ui-button--primary alert-status-action" type="submit">Enregistrer la date</button></form></details>`
      : "";
    const reviewMessages = {
      "source-missing": "Copie source absente de Famili-IA. L'alerte, sa date et vos choix sont conservés.",
      "source-ambiguous": "Plusieurs copies correspondent à cette alerte. Sa date reste inchangée.",
      "proof-unavailable": "La preuve de l'échéance n'est plus vérifiable dans la copie disponible. Sa date reste inchangée.",
      "source-changed": "La copie ou sa preuve a changé depuis cette alerte. Sa date reste inchangée."
    };
    const reviewMessage = alert.sourceReview
      ? reviewMessages[alert.sourceReview] || "La source de cette alerte doit être réexaminée."
      : "";
    const stateLabel = alert.status === 'resolved' ? 'Terminée'
      : alert.status === 'ignored' ? 'Ignorée'
        : isSnoozed ? 'Reportée'
          : alert.type === 'red' ? 'À traiter'
            : alert.type === 'amber' ? 'À anticiper' : 'À surveiller';
    const isExample = alert.source !== 'document' && documents.some(document => document.id === alert.docId);
    const sourceDocument = getDocuments().find(document => document.id === alert.docId)
      || (isExample ? documents.find(document => document.id === alert.docId) : null);
    const sourceAction = sourceDocument ? 'Voir la copie' : 'Voir mes fichiers';
    const sourceDestination = sourceDocument ? `vos-donnees?docId=${encodeURIComponent(alert.docId)}` : 'vos-donnees';

    return `
      <li class="alert-timeline-item">
      <article class="ui-card alert-card ${escapeHtml(alert.type)}${isSnoozed ? " is-snoozed" : ""}" data-alert-card data-alert-id="${escapeHtml(alert.id)}">
        <div class="ui-icon alert-icon" aria-hidden="true">
          ${iconSvg}
        </div>
        <div class="alert-content">
          <div class="alert-header">
            <h3>${escapeHtml(alert.title)}</h3>
          </div>
          ${timingLabel ? `<p class="alert-time-hint">${showsResume ? 'Reprise · ' : ''}${timingLabel}</p>` : ''}
          <div class="alert-meta">
            <span class="alert-state">${stateLabel}</span>
            <span class="alert-date">${dueDate ? `Échéance : <time datetime="${dueDateIso}">${escapeHtml(dueDate)}</time>` : alert.dueDate ? 'Date à vérifier' : 'Date non renseignée'}</span>
            ${alert.source !== 'document' ? `<span class="alert-demo-label">${isExample ? 'Exemple fictif' : 'Source non renseignée'}</span>` : ''}
          </div>
          <p>${escapeHtml(alert.detail)}</p>
          ${snoozeNotice}
          ${sourceExcerpt}
          ${alert.source === "document" ? `<p class="alert-provenance">Copie locale · accès à l'original non garanti.</p>` : ''}
          ${sourceDocument?.expiryDateEstimated ? '<p class="household-note">Date estimée à partir de la date d’achat et de la durée de garantie, puis confirmée par vous.</p>' : ''}
          ${reviewMessage ? `<p class="alert-source-review"><strong>Source à vérifier.</strong> ${escapeHtml(reviewMessage)} Notifications suspendues pour cette alerte jusqu'à confirmation.</p>` : ''}
        </div>
        <button class="ui-button ui-button--secondary alert-action" type="button" data-open-view="${escapeHtml(sourceDestination)}" aria-label="${sourceAction} : ${escapeHtml(alert.title)}">${sourceAction}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        <details class="alert-management">
          <summary>Gérer cette alerte<span class="visually-hidden"> : ${escapeHtml(alert.title)}</span></summary>
          <div class="alert-status-actions">
            ${statusAction}
            <button class="ui-button ui-button--secondary alert-status-action" type="button" data-toggle-alert-read aria-pressed="false">Marquer comme lue</button>
          </div>
          ${correctionForm}
          ${alert.source === "document" ? `<button class="ui-button ui-button--secondary" type="button" data-open-view="recherche">Réexaminer les preuves dans Recherche</button>` : ''}
        </details>
      </article>
      </li>
    `;
  }).join('') + '</ol>';

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
          expiryDateSource: "user",
          expiryDateEstimated: false
        });
        await confirmDocumentAlert(document.id);
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
  renderHousePhoto();
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
  document.querySelector('#add-first-equipment').onclick = () => openEquipmentForm();
  document.querySelector('#show-all-equipment').onclick = () => {
    showView('maison');
    document.querySelector('[data-house-category="tout"]').focus();
  };

  // Synchroniser l'adresse, le code postal et la ville avec l'état global de l'utilisateur
  const user = getCurrentUser();
  const displayAddress = document.querySelector('#display-address');
  const displayCity = document.querySelector('#display-city');

  if (displayAddress) {
    displayAddress.textContent = user.address || '';
    displayAddress.hidden = !user.address;
  }
  if (displayCity) {
    const postal = user.postalCode || '';
    const city = user.city || '';
    displayCity.textContent = `${postal} ${city}`.trim();
    displayCity.hidden = !displayCity.textContent;
  }
}

function setHousePhotoVisual(photo) {
  const image = document.querySelector('#house-photo');
  const source = photo?.dataUrl || new URL('./assets/maison/maison-photo.jpg', import.meta.url).href;
  if (image.src !== source) image.src = source;
  image.alt = photo ? 'Photo personnelle choisie pour Maison' : "Illustration d'une maison";
  image.style.objectPosition = `${photo?.positionX ?? 50}% ${photo?.positionY ?? 50}%`;
  document.querySelector('#house-photo-origin').textContent =
    photo ? 'Photo personnelle · cet appareil' : "Visuel d'illustration · IA";
}

function renderHousePhoto(message = '') {
  let photo = null;
  try {
    if (getCurrentUser().housePhoto) photo = validateCoverPhoto(getCurrentUser().housePhoto);
  } catch (error) {
    console.error('Photo personnelle de Maison invalide :', error);
    message = "Votre photo ne peut pas être affichée. L'illustration IA est utilisée ; vous pouvez remplacer ou retirer votre photo.";
  }
  setHousePhotoVisual(photo);
  const status = document.querySelector('#house-photo-status');
  status.textContent = message;
  status.hidden = !message;
  return photo;
}

function initCoverPhotoDialog() {
  const dialog = document.querySelector('#house-photo-dialog');
  const input = document.querySelector('#house-photo-input');
  const choose = document.querySelector('#choose-house-photo');
  const save = document.querySelector('#save-house-photo');
  const remove = document.querySelector('#remove-house-photo');
  const cancel = document.querySelector('#cancel-house-photo');
  const close = document.querySelector('#close-house-photo');
  const preview = document.querySelector('#house-photo-preview');
  const status = document.querySelector('#house-photo-dialog-status');
  const x = document.querySelector('#house-photo-x');
  const y = document.querySelector('#house-photo-y');
  let draft = null;
  let expectedUser = null;
  let equipmentTarget = null;
  let generation = 0;
  let preparing = false;
  let saving = false;

  function updateControls() {
    choose.disabled = remove.disabled = x.disabled = y.disabled = saving || preparing;
    cancel.disabled = close.disabled = saving;
    save.disabled = saving || preparing || !draft;
    document.querySelector('#house-photo-framing').hidden = !draft;
    if (draft) {
      if (preview.src !== draft.dataUrl) preview.src = draft.dataUrl;
      preview.style.objectPosition = `${draft.positionX}% ${draft.positionY}%`;
      x.value = draft.positionX;
      y.value = draft.positionY;
    }
  }

  function open(equipment = null) {
    equipmentTarget = equipment;
    draft = equipment ? getEquipmentCover(equipment).photo : renderHousePhoto();
    expectedUser = getCurrentUser();
    remove.hidden = !(equipment ? equipment.coverPhoto : expectedUser.housePhoto);
    document.querySelector('#house-photo-title').textContent = equipment ? "Photo de l'équipement" : 'Photo de la maison';
    input.setAttribute('aria-label', equipment ? "Photo personnelle pour cet équipement" : 'Photo personnelle pour Maison');
    status.textContent = '';
    const frame = document.querySelector(equipment ? '.equipment-cover-frame' : '.property-illustration').getBoundingClientRect();
    preview.parentElement.style.aspectRatio = `${frame.width} / ${frame.height}`;
    preview.parentElement.style.width = `${Math.min(480, 240 * frame.width / frame.height)}px`;
    updateControls();
    dialog.showModal();
  }
  document.querySelector('#edit-house-photo').addEventListener('click', () => open());
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-equipment-photo]');
    if (!button) return;
    const equipment = getEquipmentDetail(button.dataset.editEquipmentPhoto);
    if (!equipment) {
      console.error("L'équipement à personnaliser n'existe plus.");
      showDemoNotice("Cet équipement n'existe plus.");
      return;
    }
    open(equipment);
  });
  choose.addEventListener('click', () => input.click());
  close.addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    generation += 1;
    draft = expectedUser = equipmentTarget = null;
    preparing = false;
    input.value = '';
    preview.removeAttribute('src');
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const current = ++generation;
    preparing = true;
    draft = null;
    status.textContent = 'Préparation locale de la photo…';
    updateControls();
    try {
      const photo = await prepareCoverPhoto(file);
      if (current !== generation || !dialog.open) return;
      draft = photo;
      status.textContent = 'Ajustez le cadrage si besoin, puis enregistrez.';
    } catch (error) {
      if (current !== generation || !dialog.open) return;
      console.error('Impossible de préparer la photo de couverture :', error);
      status.textContent = error.message;
    } finally {
      if (current === generation) {
        preparing = false;
        input.value = '';
        updateControls();
      }
    }
  });
  for (const slider of [x, y]) slider.addEventListener('input', () => {
    if (!draft || saving || preparing) return;
    draft = { ...draft, positionX: Number(x.value), positionY: Number(y.value) };
    updateControls();
  });
  preview.addEventListener('error', () => {
    if (!dialog.open || !draft) return;
    console.error("L'aperçu de la photo de couverture est illisible.");
    draft = null;
    status.textContent = 'Cette copie est illisible. Choisissez une autre photo ou retirez la copie enregistrée.';
    updateControls();
  });
  document.querySelector('#house-photo').addEventListener('error', event => {
    const personal = event.currentTarget.src.startsWith('data:');
    console.error(personal ? 'Photo personnelle de Maison illisible.' : 'Illustration de Maison indisponible.');
    if (personal) setHousePhotoVisual(null);
    const notice = document.querySelector('#house-photo-status');
    notice.hidden = false;
    notice.textContent = personal
      ? "Votre photo est illisible. L'illustration IA est affichée ; vous pouvez remplacer ou retirer votre photo."
      : "L'illustration de Maison est indisponible.";
  });
  async function persist(photo, message) {
    const target = equipmentTarget;
    saving = true;
    status.textContent = 'Enregistrement sur cet appareil…';
    updateControls();
    try {
      if (target) await updateEquipmentPhoto(photo, target, expectedUser);
      else await updateHousePhoto(photo, expectedUser);
    } catch (error) {
      console.error('Impossible de modifier la photo de couverture :', error);
      status.textContent = `La modification n'a pas pu être enregistrée : ${error.message}`;
      return;
    } finally {
      saving = false;
      updateControls();
    }
    dialog.close();
    if (target) {
      initHouseView(parseHash().params);
      if (activeView === 'detail') {
        initEquipmentDetailView(parseHash().params.id);
        document.querySelector('[data-edit-equipment-photo]')?.focus();
      }
      showDemoNotice(message);
    } else renderHousePhoto(message);
  }
  save.addEventListener('click', () => { if (draft && !saving && !preparing) void persist(draft, 'Photo enregistrée sur cet appareil.'); });
  remove.addEventListener('click', () => {
    const fallback = equipmentTarget ? 'le visuel par défaut' : "l'illustration IA";
    if (saving || preparing || !confirm(`Retirer votre photo de cet appareil et réafficher ${fallback} ? L'original reste inchangé.`)) return;
    void persist(null, equipmentTarget ? 'Photo retirée. Le visuel par défaut est réaffiché.' : "Photo retirée. L'illustration IA est réaffichée.");
  });
}

function getNameInitial(name) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase('fr') || '?';
}

function renderFamilyMembers() {
  const memberList = document.querySelector('#member-list');
  if (!memberList) return;

  const members = getFamilyMembers();
  const currentUser = getCurrentUser();
  document.querySelector('#family-members-count').textContent =
    `${members.length} membre${members.length > 1 ? 's' : ''}`;

  if (members.length === 0) {
    memberList.innerHTML = `<li class="family-empty">
      <span class="member-avatar" aria-hidden="true">+</span>
      <h3>Votre cercle commence avec les noms que vous choisissez</h3>
      <p>Ajoutez un premier proche pour le retrouver ici, puis l'associer vous-même à vos photos.</p>
      <button class="ui-button ui-button--primary" id="add-first-family-member" type="button">Ajouter un proche</button>
    </li>`;
    document.querySelector('#add-first-family-member').onclick = () => openMemberForm();
  } else {
    memberList.innerHTML = members.map(member => {
      const isCurrentUser = member.id === currentUser.id;
      const avatarText = member.avatar || getNameInitial(member.name || '');

      return `
        <li class="ui-card member-card" data-family-member="${escapeHtml(member.id)}">
          <div class="member-avatar" aria-hidden="true">${escapeHtml(avatarText)}</div>
          <h3>${escapeHtml(member.name)}</h3>
          ${isCurrentUser ? '<span class="member-you">Vous</span>' : ''}
        </li>
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
    const nameInput = document.querySelector('#member-name-input');
    const name = nameInput.value.trim();
    const birthDate = document.querySelector('#member-birth-date-input').value || null;
    const status = document.querySelector('#member-form-status');
    status.textContent = '';
    if (!name) {
      status.textContent = 'Indiquez le nom à afficher pour ce proche.';
      nameInput.focus();
      return;
    }

    try {
      if (id) {
        const existingMember = getFamilyMembers().find(member => member.id === id);
        if (!existingMember) throw new Error("Ce membre n'existe plus.");
        await updateFamilyMember({
          ...existingMember,
          name,
          avatar: !existingMember.avatar || existingMember.avatar === getNameInitial(existingMember.name || '')
            ? getNameInitial(name) : existingMember.avatar,
          birthDate
        });
        showDemoNotice(`Membre modifié : ${name}`);
      } else {
        await addFamilyMember({
          id: `u-${Date.now()}`,
          name,
          role: 'Member',
          avatar: getNameInitial(name),
          access: 'limited',
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
    } else {
      document.querySelector('#manage-family-btn').focus();
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

function openMemberForm(member = null) {
  document.querySelector('#add-member-form').reset();
  document.querySelector('#member-id-input').value = member?.id || '';
  document.querySelector('#member-name-input').value = member?.name || '';
  document.querySelector('#member-birth-date-input').value = member?.birthDate || '';
  document.querySelector('#delete-member-btn').hidden = !member;
  document.querySelector('#member-form-status').textContent = '';
  document.querySelector('#add-member-title').textContent = member ? 'Modifier un membre' : 'Ajouter un membre';
  document.querySelector('#add-member-dialog').showModal();
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
        <div><p class="eyebrow">FAMILLE</p><h2 id="manage-members-title">Votre cercle familial</h2></div>
        <button class="ui-dialog__close" id="close-manage-members" type="button" aria-label="Fermer les membres" autofocus>×</button>
      </div>
      <p class="household-note">Ajoutez ou renommez les proches qui composent votre cercle.</p>
      <div class="household-form">
        <div id="manage-members-list"></div>
        <button class="ui-button ui-button--primary" id="open-add-member-from-manager" type="button">Ajouter un membre</button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#close-manage-members').addEventListener('click', () => modal.close());
    modal.querySelector('#open-add-member-from-manager').addEventListener('click', () => {
      openMemberForm();
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
          <div class="member-avatar" aria-hidden="true">${escapeHtml(member.avatar || getNameInitial(member.name || ''))}</div>
          <div class="managed-member-copy">
            <strong>${escapeHtml(member.name)}</strong> ${isCurrentUser ? '<span class="member-you">Vous</span>' : ''}
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
        openMemberForm(member);
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
    setImportFeedback(`La fiche « ${title} » est enregistrée sur cet appareil. Retrouvez-la dans vos fichiers ou dans Recherche.`, 'success', 'Votre fiche a été ajoutée');
    showDemoNotice(`Document "${title}" créé avec succès (saisie manuelle).`);
  });
}

// Initialize the application
initHouseView();
initFamilyView();
initProfileHandlers();
initImportView();
initAssistantView();

function renderInventorySourceStatus() {
  const statuses = getSourceStatuses();
  const latest = statuses.filter(status => status.run).sort((left, right) =>
    Date.parse(right.run.finishedAt || right.run.startedAt) - Date.parse(left.run.finishedAt || left.run.startedAt))[0];
  const warning = document.querySelector('#data-source-warning');
  warning.hidden = sourceRunStorageErrors.size === 0;
  warning.textContent = warning.hidden ? '' : "Les états de source n'ont pas pu être lus ou enregistrés sur cet appareil ; leur fraîcheur n'est pas garantie.";
  document.querySelector('#data-last-check').textContent = latest
    ? `Dernier parcours connu · ${sourceName(latest.sourceId)} : ${latest.freshness}`
    : sourceRunStorageErrors.size
      ? 'Dernier contrôle indisponible.'
      : 'Dernier contrôle : aucun parcours de source enregistré.';
  for (const status of statuses) {
    const account = status.run?.accountRef ? ` Parcours du compte …${status.run.accountRef.slice(0, 16)}.` : '';
    document.querySelector(`#data-source-${status.sourceId}`).textContent =
      `${status.freshness}${account} ${status.access} ${status.scope}`;
  }
}

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
  document.querySelector('#summary-dropbox').textContent = String(counts.dropbox);
  document.querySelector('#summary-demo').textContent = String(counts.demo);
  const personalCount = counts.total - counts.demo;
  document.querySelector('#data-trust-status').textContent = personalCount
    ? `${personalCount} fichier${personalCount > 1 ? 's' : ''} enregistré${personalCount > 1 ? 's' : ''} dans Famili-IA.${counts.demo ? ` Les ${counts.demo} exemples intégrés restent distincts de vos fichiers.` : ''}`
    : counts.demo
      ? `Les ${counts.demo} éléments ci-dessous sont des exemples, pas vos fichiers.`
      : 'Ajoutez votre premier fichier pour le retrouver ici.';
  renderInventorySourceStatus();

  const docs = filterInventoryDocuments(allDocuments, filters);
  document.querySelector('#data-inventory-status').textContent =
    `${docs.length} fichier${docs.length > 1 ? 's' : ''} affiché${docs.length > 1 ? 's' : ''} sur ${counts.total}`;

  if (docs.length === 0) {
    dataList.replaceChildren();
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    const message = document.createElement('p');
    message.textContent = counts.total
      ? 'Aucun fichier ne correspond à ces filtres. Vos autres fichiers restent disponibles.'
      : 'Ajoutez votre premier fichier pour le retrouver ici.';
    const clearButton = document.createElement('button');
    clearButton.className = 'ui-button ui-button--secondary';
    clearButton.type = 'button';
    if (counts.total) {
      clearButton.dataset.filterClear = '';
      clearButton.textContent = 'Afficher tous les fichiers';
    } else {
      clearButton.dataset.openView = 'importer';
      clearButton.textContent = 'Ajouter un fichier';
    }
    emptyState.append(message, clearButton);
    dataList.append(emptyState);
    return;
  }

  dataList.replaceChildren();
  docs.forEach((doc) => {
    const source = getInventorySource(doc);
    const sourceText = source === 'dropbox'
      ? `Dropbox · compte …${doc.dropboxAccountFingerprint?.slice(0, 16) || "inconnu"}`
      : source === 'onedrive'
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
    date.textContent = doc.date || 'Date non renseignée';
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
  const sourceSummary = document.querySelector('#moments-life-source-summary');
  const sourceList = document.querySelector('#moments-life-source-list');
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
    sourceSummary.hidden = true;
    sourceList.replaceChildren();
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
    addTextElement(row, 'span', 'search-photo-date', getTimelineDateLabel(dateInfo));
    addTextElement(row, 'span', 'search-result-origin', `Source de la copie : ${item.sourceLabel} · accès à l'original non garanti`);
    const provenance = addTextElement(row, 'details', 'search-result-details', '');
    addTextElement(provenance, 'summary', '', 'Provenance et annotations');
    const details = [getTimelineDateLabel(dateInfo)];
    details.push(`Source de la copie : ${item.sourceLabel}`);
    details.push(`Emplacement enregistré : ${typeof item.photo.sourceDir === 'string' && item.photo.sourceDir.trim() ? item.photo.sourceDir : 'non disponible'}`);
    details.push(`Dernière vérification de la copie : ${item.lastCheck || 'inconnue'}. Accès actuel à l'original non vérifié.`);
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
      addTextElement(provenance, 'p', '', detailText);
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
    if (getInventorySource(item.photo) === "onedrive") addOneDriveOriginalAction(actions, item.photo);
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
        if (photo.dropboxSource
          && photo.dropboxAccountFingerprint === dropboxResumeCheckpoint?.accountFingerprint) {
          dropboxResumeCheckpoint = null;
          updateDropboxActions();
        }
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
    const sourceGroups = summarizePhotoSources(matches);
    const groupByIdentity = new Map(sourceGroups.map(group =>
      [JSON.stringify([group.sourceId, group.accountRef]), group]));
    const recordsByIdentity = new Map(experimentalIndex.getAllRecords().map(record =>
      [JSON.stringify([record.sourceId, record.accountRef, record.itemId]), record]));
    const photos = matches
      .map(match => ({ match, photo: documentsByMatch.get(JSON.stringify([match.sourceId, match.accountRef ?? null, match.itemId])) }))
      .filter(({ photo }) => isPhotoDocument(photo))
      .map(({ match, photo }, index) => ({
        photo,
        rank: index + 1,
        reasons: request.explanations ?? [],
        sourceLabel: groupByIdentity.get(JSON.stringify([match.sourceId, match.accountRef ?? null])).label,
        lastCheck: recordsByIdentity.get(JSON.stringify([match.sourceId, match.accountRef ?? null, match.itemId]))?.lastCheck,
        confidence: { level: 'high', label: 'index local', reasons: [] }
      }));
    document.querySelector('#moments-life-search').hidden = !photos.length && request.kind !== 'photo';
    if (!photos.length) {
      status.textContent = request.kind === 'photo'
        ? request.filters?.coordinates
          ? "Aucune photo ne correspond à ces coordonnées. La recherche GPS ne couvre que les coordonnées présentes dans les métadonnées des photos indexées avec le consentement actif."
          : "Aucune photo ne correspond à ces critères parmi les photos indexées dans Famili-IA. Les sources non indexées ne sont pas couvertes."
        : "";
      return;
    }
    if (request.sourceIntent) {
      for (const group of sourceGroups) {
        const item = document.createElement('li');
        item.textContent = `${group.label} : ${group.count} copie${group.count === 1 ? '' : 's'} indexée${group.count === 1 ? '' : 's'}`;
        sourceList.append(item);
      }
      sourceSummary.hidden = false;
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
      const dataToExport = redactPhotoFactLocationsForExport(redactPhotoLocationsForExport(getFullState()));
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

  const pdfExportBtn = document.querySelector('#export-pdf-data');
  if (pdfExportBtn) {
    pdfExportBtn.addEventListener('click', async () => {
      const status = document.querySelector('#data-export-status');
      pdfExportBtn.disabled = true;
      status.textContent = 'Préparation du rapport PDF…';
      status.removeAttribute('data-state');
      try {
        const dataToExport = redactPhotoFactLocationsForExport(redactPhotoLocationsForExport(getFullState()));
        const pdfContent = await generatePDF(dataToExport);
        const blob = new Blob([pdfContent], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'famili-ia-data.pdf';
        a.click();
        URL.revokeObjectURL(url);
        status.textContent = 'Rapport PDF généré. Pour les données détaillées, utilisez l’export JSON.';
        showDemoNotice(status.textContent);
      } catch (error) {
        console.error('Impossible de générer le rapport PDF :', error);
        status.dataset.state = 'error';
        status.textContent = `Impossible de générer le rapport PDF : ${error.message}. Vous pouvez utiliser l’export JSON.`;
      } finally {
        pdfExportBtn.disabled = false;
      }
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
      dropboxScanController?.abort();
      if (dropboxScanSettled) await dropboxScanSettled;
      await stopBackgroundScans();
      const shouldRevokeGoogleAccess = Boolean(googleDriveClient?.hasAccessToken);
      await resetState();
      dropboxResumeCheckpoint = null;
      dropboxAuth?.disconnect();
      dropboxObservation = "disconnected";
      dropboxStatus.textContent = "Données applicatives supprimées et session Dropbox locale déconnectée. Les originaux et l'autorisation chez Dropbox restent inchangés.";
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
      updateDropboxActions();
    }
  });
}

async function generatePDF(data) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle('Famili-IA - Bilan des données locales');
  pdf.setCreator('Famili-IA');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const headingFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  const ink = rgb(0.14, 0.24, 0.23);
  page.drawText('Famili-IA - Bilan des données locales', {
    x: 48, y: 785, size: 18, font: headingFont, color: ink
  });
  const counts = countInventorySources(data.documents);
  const lines = [
    `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
    '',
    `Fichiers enregistrés : ${counts.total}`,
    `Appareil : ${counts.local}`,
    `Google Drive : ${counts.drive}`,
    `OneDrive : ${counts.onedrive}`,
    `Dropbox : ${counts.dropbox}`,
    `Exemples enregistrés : ${counts.demo}`,
    '',
    `Membres du cercle : ${data.family.length}`,
    `Équipements : ${data.homeEquipment.length}`,
    `Rappels enregistrés : ${data.alerts.length}`,
    '',
    'Ce bilan porte uniquement sur les données présentes dans Famili-IA.',
    'Les exemples intégrés non enregistrés ne sont pas comptés.',
    "Il ne confirme ni la couverture des comptes, ni l'accès aux originaux.",
    'Les fichiers originaux ne sont pas inclus.',
    'Les coordonnées GPS et les noms personnels ne sont pas inclus.',
    "Pour les données détaillées, utilisez l'export JSON."
  ];
  lines.forEach((line, index) => {
    if (line) page.drawText(line, { x: 48, y: 750 - index * 24, size: 11, font, color: ink });
  });
  return pdf.save();
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
      invalidateAssistantResponses(true);
      console.error("Impossible de préparer la réponse de l'assistant :", error);
      status.textContent = 'La réponse n’a pas pu être préparée. Votre question est conservée ; vous pouvez réessayer.';
    }
    input.focus({ preventScroll: true });
  });
}

function refreshAssistantContext() {
  invalidateAssistantResponses();
  const context = document.querySelector('#assistant-context');
  if (!uploadedDocuments.length) {
    context.textContent = 'Mode exemples fictifs : aucun fichier personnel chargé. Les réponses utilisent uniquement les documents de démonstration.';
  } else {
    const counts = countInventorySources(uploadedDocuments);
    context.textContent = `${counts.total} fichier${counts.total > 1 ? 's' : ''} chargé${counts.total > 1 ? 's' : ''} dans Famili-IA. Même index local que Recherche ; réponses limitées au texte vérifié des documents, pas à tout l'appareil ni au cloud. Les filtres de Recherche ne s'appliquent pas ici.${counts.demo ? ' Les exemples fictifs sont exclus des réponses personnelles.' : ''}`;
  }
}

function invalidateAssistantResponses(force = false) {
  for (const [node, response] of assistantResponseContexts) {
    if (!force && (response.context
      ? response.context.scope.corpusRevision === experimentalIndex.getRevision() &&
        response.context.matches.every(match => isAssistantMatchCurrent(match, uploadedDocuments, experimentalIndex))
      : !uploadedDocuments.length)) continue;
    node.querySelector('.assistant-response-label').textContent = 'SOURCES À ACTUALISER';
    node.querySelector('.assistant-answer').textContent = 'Une source a changé ou n’est plus disponible. Posez à nouveau votre question pour actualiser la réponse.';
    node.querySelectorAll('.assistant-source, .assistant-query').forEach(element => element.remove());
    assistantResponseContexts.delete(node);
  }
}

/**
 * Add a user message to the chat container
 */
function addUserMessage(text, container) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message user';
  const avatar = addTextElement(msgDiv, "div", "chat-avatar", getNameInitial(getCurrentUser().name || ''));
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
  if (response.context?.query) {
    addTextElement(bubble, "p", "household-note assistant-query",
      `Sujet recherché : ${response.context.query}. Périmètre : documents enregistrés, sans les filtres de Recherche.`);
  }
  const answer = response.status === 'supported' && response.matches[0]?.exactFact
    ? response.matches[0].exactFact : response.answer;
  addTextElement(bubble, "p", "assistant-answer", answer);
  for (const match of response.matches) {
    const source = addTextElement(bubble, "div", "assistant-source", "");
    if (match.evidence) {
      addTextElement(source, "p", "assistant-proof-label", match.exactFact ? "Passage du document" : "Passage rapproché · à vérifier");
      const evidence = addTextElement(source, "blockquote", "assistant-evidence", "");
      addTextElement(evidence, "mark", "", match.evidence);
    } else {
      const unverified = response.context && typeof match.document.content === 'string' && match.document.content.trim();
      addTextElement(source, "p", "household-note assistant-proof-missing", match.segments?.length
        ? "Aucun passage correspondant à la question n'a été repéré dans le texte vérifié."
        : unverified
        ? "Le texte de cette copie n'est pas vérifié ; il n'est pas utilisé comme preuve."
        : "Aucun extrait textuel disponible pour cette source.");
    }
    addTextElement(source, "p", "assistant-source-name", `Source : ${match.document.name}`);
    addTextElement(source, "p", "household-note", match.provenance);
    if (typeof match.document.content === 'string' && match.document.content.trim()) {
      const button = addTextElement(source, "button", "ui-button ui-button--secondary", "Voir la copie");
      button.type = 'button';
      button.setAttribute('aria-label', `Voir la copie de ${match.document.name}`);
      button.addEventListener('click', () => {
        if (response.context && !isAssistantMatchCurrent(match, uploadedDocuments, experimentalIndex)) {
          invalidateAssistantResponses();
          document.querySelector('#assistant-status').textContent = 'Cette copie n’est plus disponible ou a changé. Relancez une question pour actualiser les sources.';
          return;
        }
        const available = uploadedDocuments.length ? uploadedDocuments : documents;
        const current = available.find(document =>
          document.id === match.document.id && getInventorySource(document) === getInventorySource(match.document) &&
          getInventoryAccountRef(document) === getInventoryAccountRef(match.document));
        if (!current || typeof current.content !== 'string' || !current.content.trim()) {
          document.querySelector('#assistant-status').textContent = 'Cette copie n’est plus disponible. Relancez une question pour actualiser les sources.';
          return;
        }
        openSource(current);
      });
    } else {
      const button = addTextElement(source, "button", "ui-button ui-button--secondary", "Explorer dans Recherche");
      button.type = 'button';
      button.dataset.openView = 'recherche';
    }
    if (['supported', 'excerpt', 'fact-not-found'].includes(response.status) &&
        response.context && response.matches.length === 1 && !match.ambiguous && match.segments.length) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const candidate = findIndexDeadlines(experimentalIndex, today, 90).candidates
        .find(entry => matchesDocumentAlertIdentity(match.document, entry));
      if (candidate) {
        const action = addTextElement(source, "div", "assistant-alert-action", "");
        addTextElement(action, "p", "household-note",
          `${candidate.estimated ? "Échéance estimée" : "Échéance proposée"} : ${candidate.dueDate} · à confirmer.`);
        addTextElement(action, "blockquote", "assistant-evidence", candidate.proof.excerpt);
        addDeadlineAlertAction(action, candidate);
      }
    }
  }
  if (!response.matches.length) {
    const button = addTextElement(bubble, "button", "ui-button ui-button--secondary assistant-search-action", "Explorer dans Recherche");
    button.type = 'button';
    button.dataset.openView = 'recherche';
  }
  const nextQuestion = addTextElement(bubble, "button", "ui-button ui-button--text assistant-next-question", "Poser une autre question");
  nextQuestion.type = 'button';
  nextQuestion.addEventListener('click', () => document.querySelector('#assistant-input').focus());
  container.appendChild(msgDiv);
  if (response.matches.length) assistantResponseContexts.set(msgDiv, response);
  msgDiv.scrollIntoView({ block: 'nearest' });
}

/**
 * Get a response from the assistant based on the question
 * Personal answers reuse the shared index; fictional fallback remains isolated.
 */
function getAssistantResponse(question) {
  const trimmed = question.trim();
  if (!uploadedDocuments.length) {
    const matches = rankDocuments(trimmed, documents);
    return { ...buildSearchResponse(matches), matches: matches.slice(0, 2) };
  }
  const context = prepareAssistantContext({
    session: experimentalIndex, question: trimmed, documents: uploadedDocuments
  });
  context.scope.sourceStatuses = getSourceStatuses();
  invalidateAssistantResponses();
  if (context.status === "clarification" || context.status === "stale") {
    return { status: context.status, label: 'UNE PRÉCISION EST NÉCESSAIRE',
      answer: context.clarification, matches: [], context };
  }
  return { ...buildSearchResponse(context.matches), matches: context.matches.slice(0, 2), context };
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
  demoReturnContext = { view: activeView, params: parseHash().params, focus: document.activeElement };
  replayOnboarding = true;
  document.querySelector('#wizard-user-name').value = "";
  document.querySelector('#wizard-greeting').hidden = true;
  document.querySelector('#wizard-user-greeting').textContent = "";
  document.querySelectorAll('#onboarding-wizard .wizard-step').forEach((step, index) => {
    step.hidden = index !== stepIndex;
  });
  if (stepIndex === 3) startDemoGuide();
  showView('accueil', { addHistory: false });
  manageOnboardingWizardVisibility();
  document.querySelector(`#step-${stepIndex}-title`).focus();
}

let demoGuideStep = 0;
let demoTypingTimer = 0;
let demoSpotlightFrame = 0;

const DEMO_IMAGES = {
  home: new URL('./assets/maison/maison-photo.jpg', import.meta.url).href,
  pool: new URL('./assets/demo/am-piscine.jpg', import.meta.url).href,
  pergola: new URL('./assets/demo/gouter-pergola.jpg', import.meta.url).href
};

const DEMO_EXAMPLES = {
  'facture-piscine': {
    question: 'Tu me retrouves la facture de la piscine ?',
    heading: 'Facture de la piscine',
    results: [{
      title: 'Facture piscine.pdf',
      content: 'Réfection du bassin et mise en service.',
      evidence: 'Total TTC : 8 900 €',
      date: '12 juin 2024',
      source: 'OneDrive · Maison',
      sourceKind: 'drive',
      location: 'Dossier Maison'
    }]
  },
  'contrat-habitation': {
    question: 'Quand faut-il renouveler l’assurance de la maison ?',
    heading: 'Contrat habitation',
    results: [{
      title: 'Contrat habitation.pdf',
      content: 'Contrat multirisque de la maison.',
      evidence: 'Échéance annuelle : 31 décembre 2026',
      date: '30 novembre 2025',
      source: 'Google Drive · Documents maison',
      sourceKind: 'drive',
      location: 'Dossier Assurances'
    }]
  },
  'garantie-pompe': {
    question: 'Jusqu’à quand la pompe est-elle garantie ?',
    heading: 'Garantie de la pompe',
    results: [{
      title: 'Garantie pompe piscine.pdf',
      content: 'Garantie de l’équipement installé à la maison.',
      evidence: 'Valable jusqu’au 12 juin 2027',
      deadline: '12 juin 2027',
      date: '12 juin 2024',
      source: 'OneDrive · Maison',
      sourceKind: 'drive',
      location: 'Dossier Maison'
    }]
  },
  'photos-ete': {
    question: 'Montre-moi nos souvenirs de l’été',
    heading: 'Un été à la maison',
    results: [{
      title: 'Après-midi à la piscine',
      content: 'Camille, Alex et Léa · été 2025',
      evidence: 'Repères ajoutés : vacances · piscine · famille',
      evidenceLabel: 'Annotations',
      date: '10 août 2025',
      source: 'Photos locales',
      sourceKind: 'local',
      location: 'Album Été 2025',
      image: DEMO_IMAGES.pool,
      imageAlt: 'Piscine de la maison au soleil'
    }, {
      title: 'Le goûter sous la pergola',
      content: 'Une pause au jardin avec toute la famille.',
      evidence: 'Repères ajoutés : jardin · après-midi · famille',
      evidenceLabel: 'Annotations',
      date: '23 août 2025',
      source: 'Photos locales',
      sourceKind: 'local',
      location: 'Album Été 2025',
      image: DEMO_IMAGES.pergola,
      imageAlt: 'Pergola dans le jardin de la maison'
    }]
  }
};

const DEMO_SCREENS = {
  recherche: { title: 'Recherche', benefit: 'Une question du quotidien devient une recherche ciblée.' },
  alertes: { title: 'Échéance', benefit: 'Vérifier la preuve avant de préparer un rappel.' },
  maison: { title: 'Maison', benefit: 'Relier un équipement aux documents qui le concernent.' },
  photos: { title: 'Souvenirs', benefit: 'Retrouver des moments grâce aux annotations choisies.' },
  donnees: { title: 'Provenance', benefit: 'Voir quelle copie et quelle source sont utilisées.' }
};

const DEMO_GUIDE_STEPS = [
  { title: 'La question', screen: 'recherche', target: '#demo-search-form', focus: '#demo-query',
    instruction: 'Camille cherche la facture de la piscine. Regardez sa question se composer, puis ouvrez la réponse.', next: 'Voir la réponse' },
  { title: 'La preuve', screen: 'recherche', target: '#demo-results', focus: '#demo-result-heading',
    instruction: 'Le montant est surligné dans l’extrait. La date et la source aident à vérifier le résultat.', next: 'Vérifier une échéance' },
  { title: 'Le rappel', screen: 'alertes', target: '#demo-alert-preview', focus: '#demo-alert-title',
    instruction: 'La garantie approche. Un rappel n’est créé qu’après confirmation ; ici, vous pouvez en voir l’aperçu.', next: 'Voir la maison' },
  { title: 'La maison', screen: 'maison', target: '#demo-house-preview', focus: '#demo-house-title',
    instruction: 'La pompe et ses documents restent liés à la maison. Plus besoin de se souvenir dans quel dossier chercher.', next: 'Retrouver un souvenir' },
  { title: 'Les souvenirs', screen: 'photos', target: '#demo-photo-list', focus: '#demo-photos-title',
    instruction: 'Les mots-clés ajoutés par la famille font remonter ces moments. Aucun visage n’est reconnu.', next: 'Voir les sources' },
  { title: 'La provenance', screen: 'donnees', target: '#demo-data-list', focus: '#demo-data-title',
    instruction: 'Chaque résultat indique sa copie et son origine. Vos originaux restent chez leur fournisseur.', next: 'Explorer librement' }
];

function showDemoScreen(screen) {
  const definition = DEMO_SCREENS[screen];
  if (!definition) throw new TypeError(`Vue de démo inconnue : ${screen}`);
  document.querySelectorAll('[data-demo-panel]').forEach(panel => {
    panel.hidden = panel.dataset.demoPanel !== screen;
  });
  document.querySelectorAll('[data-demo-screen]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.demoScreen === screen));
  });
  document.querySelector('#demo-screen-title').textContent = definition.title;
  document.querySelector('#demo-screen-benefit').textContent = definition.benefit;
  document.querySelector('#demo-screen-kicker').textContent = screen === 'photos'
    ? 'Camille, Alex & Léa · été 2025'
    : 'Chez Camille & Alex';
}

function clearDemoQueryAnimation() {
  window.clearTimeout(demoTypingTimer);
  demoTypingTimer = 0;
}

function animateDemoQuery(question) {
  clearDemoQueryAnimation();
  const query = document.querySelector('#demo-query');
  const next = document.querySelector('#demo-guide-next');
  const status = document.querySelector('#demo-typing-status');
  query.value = '';
  next.disabled = true;
  next.textContent = 'La question s’écrit…';
  status.textContent = 'La question se compose à l’écran.';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    query.value = question;
    next.disabled = false;
    next.textContent = 'Voir la réponse';
    status.textContent = 'La question est prête.';
    return;
  }

  let character = 0;
  const typeNextCharacter = () => {
    character += 1;
    query.value = question.slice(0, character);
    if (character >= question.length) {
      demoTypingTimer = 0;
      next.disabled = false;
      next.textContent = 'Voir la réponse';
      status.textContent = 'La question est prête.';
      return;
    }
    demoTypingTimer = window.setTimeout(typeNextCharacter, 32);
  };
  demoTypingTimer = window.setTimeout(typeNextCharacter, 360);
}

function updateDemoGuideSpotlight() {
  const spotlight = document.querySelector('#demo-guide-spotlight');
  const target = document.querySelector('#step-3 .demo-guide-highlight');
  if (!spotlight || spotlight.hidden || !target) return;

  const rect = target.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  const inset = 10;
  const left = Math.max(0, rect.left - inset);
  const top = Math.max(0, rect.top - inset);
  const right = Math.min(width, rect.right + inset);
  const bottom = Math.min(height, rect.bottom + inset);
  const regions = {
    top: { left: 0, top: 0, width, height: top },
    left: { left: 0, top, width: left, height: bottom - top },
    right: { left: right, top, width: width - right, height: bottom - top },
    bottom: { left: 0, top: bottom, width, height: height - bottom }
  };

  spotlight.querySelectorAll('[data-spotlight-region]').forEach(region => {
    const bounds = regions[region.dataset.spotlightRegion];
    region.style.left = `${bounds.left}px`;
    region.style.top = `${bounds.top}px`;
    region.style.width = `${Math.max(0, bounds.width)}px`;
    region.style.height = `${Math.max(0, bounds.height)}px`;
  });
  const frame = spotlight.querySelector('[data-spotlight-frame]');
  frame.style.left = `${left}px`;
  frame.style.top = `${top}px`;
  frame.style.width = `${Math.max(0, right - left)}px`;
  frame.style.height = `${Math.max(0, bottom - top)}px`;
}

function scheduleDemoSpotlightUpdate() {
  window.cancelAnimationFrame(demoSpotlightFrame);
  demoSpotlightFrame = window.requestAnimationFrame(updateDemoGuideSpotlight);
}

window.addEventListener('resize', scheduleDemoSpotlightUpdate, { passive: true });
window.addEventListener('scroll', scheduleDemoSpotlightUpdate, { capture: true, passive: true });

function setDemoGuideStep(step) {
  if (!Number.isInteger(step) || step < 0 || step > DEMO_GUIDE_STEPS.length) {
    throw new RangeError(`Étape de démo inconnue : ${step}`);
  }
  clearDemoQueryAnimation();
  demoGuideStep = step;
  const guide = document.querySelector('#demo-guide');
  guide.hidden = step === 0;
  document.querySelector('#demo-guide-restart').hidden = step !== 0;
  if (step > 0) document.querySelector('#demo-intro').hidden = true;
  document.querySelector('#demo-workspace').hidden = false;
  document.querySelector('#demo-screen-nav').hidden = step !== 0;
  document.querySelector('.demo-examples').hidden = step !== 0;
  document.querySelector('#demo-guide-spotlight').hidden = step === 0;
  document.querySelectorAll('#step-3 .demo-guide-highlight').forEach(target => {
    target.classList.remove('demo-guide-highlight');
    target.removeAttribute('aria-describedby');
  });
  if (step === 0) return;
  const definition = DEMO_GUIDE_STEPS[step - 1];
  showDemoScreen(definition.screen);
  document.querySelectorAll('[data-demo-panel]').forEach(panel => {
    if (!panel.hidden) {
      panel.classList.remove('demo-panel-enter');
      void panel.offsetWidth;
      panel.classList.add('demo-panel-enter');
    }
  });
  document.querySelector('#demo-guide-counter').textContent = `${String(step).padStart(2, '0')} / 06`;
  const target = document.querySelector(definition.target);
  target.classList.add('demo-guide-highlight');
  target.setAttribute('aria-describedby', 'demo-guide-instruction');
  document.querySelector('#demo-guide-progress').textContent = `Étape ${step} sur ${DEMO_GUIDE_STEPS.length} · ${definition.title}`;
  document.querySelector('#demo-guide-instruction').textContent = definition.instruction;
  document.querySelector('#demo-guide-prev').hidden = step === 1;
  document.querySelector('#demo-guide-next').textContent = definition.next;
  document.querySelector('#demo-guide-next').disabled = false;
  if (step === 1) {
    const questionType = document.querySelector('.demo-question[aria-pressed="true"]').dataset.demoQuestion;
    handleDemoQuestion(questionType, { showResults: false });
    animateDemoQuery(DEMO_EXAMPLES[questionType].question);
  } else {
    handleDemoQuestion(document.querySelector('.demo-question[aria-pressed="true"]').dataset.demoQuestion);
  }
  scheduleDemoSpotlightUpdate();
}

function focusDemoGuideStep() {
  document.querySelector(DEMO_GUIDE_STEPS[demoGuideStep - 1].focus).focus();
  scheduleDemoSpotlightUpdate();
}

function startDemoGuide() {
  clearDemoQueryAnimation();
  demoGuideStep = 0;
  document.querySelector('#demo-alert-status').textContent = 'Aucun rappel n’a été ajouté.';
  const warranty = DEMO_EXAMPLES['garantie-pompe'].results[0];
  document.querySelector('#demo-alert-date').textContent = warranty.deadline;
  document.querySelector('#demo-alert-source').textContent = `${warranty.title} · ${warranty.source}`;
  document.querySelector('#demo-alert-evidence').textContent = warranty.evidence;
  document.querySelector('#demo-house-documents').replaceChildren(
    ...['facture-piscine', 'garantie-pompe'].map(key => {
      const item = document.createElement('li');
      item.textContent = DEMO_EXAMPLES[key].results[0].title;
      return item;
    })
  );
  document.querySelector('#demo-photo-list').replaceChildren(
    ...DEMO_EXAMPLES['photos-ete'].results.map(createResultElement)
  );
  document.querySelector('#demo-data-list').replaceChildren(
    ...Object.values(DEMO_EXAMPLES).flatMap(example => example.results).map(createResultElement)
  );
  document.querySelector('.demo-examples').open = false;
  document.querySelector('#demo-intro').hidden = false;
  document.querySelector('#demo-guide').hidden = true;
  document.querySelector('#demo-workspace').hidden = true;
  document.querySelector('#demo-guide-restart').hidden = true;
  document.querySelector('#demo-guide-spotlight').hidden = true;
  showDemoScreen('recherche');
  handleDemoQuestion('facture-piscine', { showResults: false });
}

function startGuidedDemo() {
  document.querySelector('#demo-intro').hidden = true;
  document.querySelector('#demo-workspace').hidden = false;
  setDemoGuideStep(1);
  focusDemoGuideStep();
}

function startDemoExploration() {
  document.querySelector('#demo-intro').hidden = true;
  document.querySelector('#demo-workspace').hidden = false;
  setDemoGuideStep(0);
  showDemoScreen('recherche');
  handleDemoQuestion('facture-piscine', { showResults: false });
  document.querySelector('#demo-query').focus();
}

function handleDemoQuestion(questionType, { showResults = true } = {}) {
  clearDemoQueryAnimation();
  const documentList = document.querySelector('#demo-document-list');
  const example = DEMO_EXAMPLES[questionType];
  if (!example) throw new TypeError(`Exemple de démo inconnu : ${questionType}`);
  const { results, heading } = example;
  document.querySelector('#demo-query').value = example.question;
  document.querySelector('#demo-typing-status').textContent = '';
  document.querySelector('#demo-results').hidden = !showResults;
  document.querySelector('#demo-result-heading').textContent =
    `${heading} · ${results.length} ${results.length === 1 ? 'résultat' : 'résultats'}`;
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
  div.className = `ui-card onboarding-demo-result${result.image ? ' has-image' : ''}`;
  const badge = document.createElement('span');
  badge.className = `provenance-badge ${result.sourceKind === 'local' ? 'local' : 'drive'}`;
  badge.textContent = result.source;

  if (result.image) {
    const image = document.createElement('img');
    image.className = 'demo-result-photo';
    image.src = result.image;
    image.alt = result.imageAlt;
    image.loading = 'lazy';
    div.appendChild(image);
  }

  const title = document.createElement('h4');
  title.className = 'result-title';
  title.textContent = result.title;

  const content = document.createElement('p');
  content.className = 'result-content';
  content.textContent = result.content;

  const dateEl = document.createElement('small');
  dateEl.textContent = `${result.date} · ${result.location}`;
  const evidence = document.createElement('blockquote');
  evidence.className = 'demo-evidence';
  const evidenceLabel = document.createElement('small');
  evidenceLabel.textContent = result.evidenceLabel || 'Extrait du document';
  const highlight = document.createElement('mark');
  highlight.textContent = result.evidence;
  evidence.append(evidenceLabel, highlight);

  div.insertBefore(badge, div.firstChild);
  div.append(title, content);
  div.appendChild(evidence);
  div.appendChild(dateEl);

  return div;
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
initCoverPhotoDialog();
