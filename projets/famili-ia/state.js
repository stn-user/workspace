/**
 * state.js - Gestion de l'état global de l'application Famili-IA avec IndexedDB
 */

import { getAll, put, initDB, remove, purgeDatabase } from './db.js';
import { getAlertLevelForDate, normalizeAlertNotificationPreferences, refreshAlerts } from './alert-engine.js';
import { createPhotoMetadata, mergePhotoMetadata, normalizePhotoDocument } from './photo-metadata.js';

export function reconcileDocumentAlerts(existingAlerts, generatedAlerts) {
  const generatedById = new Map(generatedAlerts.map(alert => [alert.id, alert]));
  const generatedIds = new Set(generatedById.keys());
  const previousDocumentAlerts = existingAlerts.filter(alert => (
    alert.source === "document" || generatedIds.has(alert.id) || alert.id?.startsWith("alert-")
  ));
  const previousById = new Map(previousDocumentAlerts.map(alert => [alert.id, alert]));
  const retainedAlerts = existingAlerts.filter(alert => !previousDocumentAlerts.includes(alert));

  const synchronizedAlerts = generatedAlerts.map((alert) => {
    const previous = previousById.get(alert.id);
    if (!previous) return alert;
    const sameDueDate = previous.dueDate === alert.dueDate;
    return {
      ...alert,
      status: sameDueDate ? previous.status || alert.status : alert.status,
      notificationSentFor: sameDueDate ? previous.notificationSentFor : undefined,
      notificationSentAt: sameDueDate ? previous.notificationSentAt : undefined,
      snoozedUntil: sameDueDate ? previous.snoozedUntil : undefined
    };
  });

  return {
    alerts: [...retainedAlerts, ...synchronizedAlerts],
    alertsToRemove: previousDocumentAlerts.filter(alert => !generatedById.has(alert.id))
  };
}

async function synchronizeDocumentAlerts(documents) {
  const { alerts: synchronizedAlerts, alertsToRemove } = reconcileDocumentAlerts(
    state.alerts,
    refreshAlerts(documents)
  );
  for (const alert of alertsToRemove) await remove('alerts', alert.id);
  for (const alert of synchronizedAlerts.filter(alert => alert.source === "document")) await put('alerts', alert);
  state.alerts = synchronizedAlerts;
}

const defaultState = {
  currentUser: {
    id: 'u1',
    name: 'Steve',
    role: 'Admin',
    avatar: 'S',
    address: '12 rue des Bleuets',
    postalCode: '31000',
    city: 'Saint-Martin',
    preferences: {
      localAccess: true,
      driveConnection: false,
      enableAutoScan: false,
      scanDirectories: [],
      alertNotifications: normalizeAlertNotificationPreferences()
    },
    privacy: {
      consentVersion: '1.0',
      telemetryEnabled: false,
      dataSharingConsent: false,
      photoLocationConsent: false,
      lastConsentDate: null
    }
  },
  family: [
    { id: 'u1', name: 'Steve', role: 'Admin', avatar: 'S', access: 'full' },
    { id: 'u2', name: 'Conjointe', role: 'Member', avatar: 'C', access: 'limited' },
    { id: 'u3', name: 'Aaron', role: 'Member', avatar: 'A', access: 'limited' },
    { id: 'u4', name: 'Lorena', role: 'Member', avatar: 'L', access: 'limited' },
    { id: 'u5', name: 'Elyana', role: 'Member', avatar: 'E', access: 'limited' }
  ],
  homeEquipment: [
    { id: 'eq-piscine-pompe', category: 'pompe', name: 'Pompe Hayward Modèle 2022', status: 'Bon état', docs: ['piscine-garantie'] },
    { id: 'eq-piscine-filtre', category: 'piscine', name: 'Filtre de piscine', status: 'À nettoyer', docs: ['maison-notice'] },
    { id: 'eq-bambu-a1', category: 'imprimante', name: 'Bambu Lab A1', status: 'Opérationnelle', docs: ['bambu-facture'] },
    { id: 'eq-assurance-hab', category: 'assurance', name: 'Contrat Habitation', status: 'Actif', docs: ['habitation-contrat'] }
  ],
  alerts: [
    { id: 'a1', title: 'Garantie piscine', detail: 'Vérifiez les conditions et préparez le renouvellement.', type: 'red', docId: 'piscine-garantie', dueDate: '2026-11-15' },
    { id: 'a2', title: 'Entretien chaudière', detail: 'Pensez à faire le contrôle annuel.', type: 'amber', docId: 'chaudiere-entretien', dueDate: '2026-11-02' },
    { id: 'a3', title: 'Assurance habitation', detail: 'Renouvellement à prévoir.', type: 'amber', docId: 'assurance-habitation', dueDate: '2026-12-08' },
    { id: 'a4', title: 'Contrôle technique', detail: 'Vérifiez les documents du véhicule.', type: 'blue', docId: 'vehicule-ct', dueDate: '2027-01-20' },
    { id: 'a5', title: 'Facture électricité', detail: 'Paiement en attente.', type: 'muted', docId: 'facture-elec', dueDate: '2026-10-20' }
  ],
  documents: [],
  isDemoMode: false
};

let state = { ...defaultState };

/**
 * Initialise l'état depuis IndexedDB ou peuple avec les défauts
 */
export async function initState() {
  try {
    await initDB();
    const family = await getAll('family');
    const equipment = await getAll('equipment');
    const alerts = await getAll('alerts');
    const users = await getAll('users');
    const storedDocuments = await getAll('documents');
    const documents = [];
    for (const storedDocument of storedDocuments) {
      try {
        const document = normalizePhotoDocument(storedDocument);
        if (storedDocument.photoMetadata
          && storedDocument.photoMetadata.schemaVersion !== document.photoMetadata.schemaVersion) {
          await put('documents', document);
        }
        documents.push(document);
      } catch (error) {
        console.error(`Métadonnées photo invalides pour le document ${storedDocument?.id ?? "inconnu"}:`, error);
        documents.push(storedDocument);
      }
    }

    if (family.length > 0) state.family = family;
    else for (const m of defaultState.family) await put('family', m);

    if (equipment.length > 0) state.homeEquipment = equipment;
    else for (const e of defaultState.homeEquipment) await put('equipment', e);

    if (alerts.length > 0) state.alerts = alerts;
    else {
      state.alerts = [...defaultState.alerts];
      for (const a of defaultState.alerts) await put('alerts', a);
    }

    if (users.length > 0) state.currentUser = users[0];
    else await put('users', defaultState.currentUser);

    state.documents = documents;
    if (state.currentUser.privacy?.photoLocationConsent !== true
      && documents.some(document => document.photoMetadata?.location?.status === "available")) {
      await updatePhotoLocationConsent(false);
    }
    await synchronizeDocumentAlerts(documents);

  } catch (e) {
    console.warn('Erreur lors de l\'initialisation IndexedDB, utilisation des valeurs par défaut:', e);
  }
  return state;
}

export function getCurrentUser() {
  return state.currentUser;
}

export function getFullState() {
  return state;
}

export function getFamilyMembers() {
  return state.family;
}

export function getEquipmentByCategory(category = 'tout') {
  if (category === 'tout') return state.homeEquipment;
  return state.homeEquipment.filter(eq => eq.category === category);
}

export function getEquipmentDetail(id) {
  return state.homeEquipment.find(eq => eq.id === id);
}

export function getAlerts() {
  return state.alerts;
}

export function getDocuments() {
  return state.documents;
}

export async function addFamilyMember(member) {
  state.family.push(member);
  await put('family', member);
  return state.family;
}

export async function updateFamilyMember(member) {
  const index = state.family.findIndex(m => m.id === member.id);
  if (index !== -1) {
    state.family[index] = member;
    await put('family', member);
  }
  return state.family;
}

export async function deleteFamilyMember(id) {
  state.family = state.family.filter(m => m.id !== id);
  await remove('family', id);
  return state.family;
}

export async function addEquipment(equipment) {
  state.homeEquipment.push(equipment);
  await put('equipment', equipment);
  return state.homeEquipment;
}

export async function updateEquipment(equipment) {
  const index = state.homeEquipment.findIndex(eq => eq.id === equipment.id);
  if (index !== -1) {
    state.homeEquipment[index] = equipment;
    await put('equipment', equipment);
  }
  return state.homeEquipment;
}

export async function deleteEquipment(id) {
  state.homeEquipment = state.homeEquipment.filter(eq => eq.id !== id);
  await remove('equipment', id);
  return state.homeEquipment;
}

export async function addDocument(document) {
  document = normalizePhotoDocument(document);
  const existingIndex = state.documents.findIndex(existing => existing.id === document.id);
  if (existingIndex === -1) state.documents.push(document);
  else state.documents[existingIndex] = document;
  await put('documents', document);

  // Logique de classification automatique
  if (document.type && document.provider) {
    console.log(`Auto-classification : Document ${document.originalName} classé (${document.type} - ${document.provider})`);
  }

  await synchronizeDocumentAlerts(state.documents);

  return state.documents;
}

export async function deleteDocument(id) {
  state.documents = state.documents.filter(doc => doc.id !== id);
  await remove('documents', id);
  const linkedAlert = state.alerts.find(alert => alert.docId === id && (
    alert.source === "document" || alert.id === `alert-${id}`
  ));
  if (linkedAlert) {
    state.alerts = state.alerts.filter(alert => alert.id !== linkedAlert.id);
    await remove('alerts', linkedAlert.id);
  }
  return state.documents;
}

export async function updateAlert(alert) {
  const index = state.alerts.findIndex(a => a.id === alert.id);
  if (index !== -1) {
    state.alerts[index] = alert;
    await put('alerts', alert);
  }
  return state.alerts;
}

export async function updateAlertNotificationPreferences(preferences) {
  const alertNotifications = normalizeAlertNotificationPreferences(preferences);
  state.currentUser.preferences = {
    ...state.currentUser.preferences,
    alertNotifications
  };
  await put('users', state.currentUser);
  return alertNotifications;
}

export function calculateAlertType(dueDate, currentType, documentType) {
  if (!dueDate) return currentType;
  const level = getAlertLevelForDate(dueDate, documentType || "assurance");
  if (level) return level;

  return "muted";
}

export async function updatePrivacyConsent(newPrivacySettings) {
  state.currentUser.privacy = {
    ...state.currentUser.privacy,
    ...newPrivacySettings,
    lastConsentDate: new Date().toISOString()
  };
  await put('users', state.currentUser);
  return state.currentUser.privacy;
}

export async function updatePhotoLocationConsent(enabled) {
  const photoLocationConsent = enabled === true;
  if (photoLocationConsent) {
    await updatePrivacyConsent({ photoLocationConsent: true });
    return true;
  }

  const documentsWithLocation = state.documents.filter(
    document => document.photoMetadata?.location?.status === "available"
  );
  if (!state.currentUser.privacy?.photoLocationConsent && documentsWithLocation.length === 0) return false;

  for (const document of documentsWithLocation) {
    const clearedMetadata = createPhotoMetadata(document.id, {
      location: {
        status: "cleared",
        source: { kind: "user", field: "photoLocationConsentRevoked" }
      }
    });
    const updatedDocument = {
      ...document,
      photoMetadata: mergePhotoMetadata(document.photoMetadata, clearedMetadata)
    };
    await put('documents', updatedDocument);
    state.documents[state.documents.indexOf(document)] = updatedDocument;
  }
  await updatePrivacyConsent({ photoLocationConsent: false });
  return false;
}

export async function addLog(action, details) {
  const logEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    action,
    details
  };
  await put('logs', logEntry);
  return logEntry;
}

export async function resetState() {
  await purgeDatabase();
  state = { ...defaultState };
  return state;
}

/**
 * Définit l'état de mode démo (true/false).
 * Permet d'activer/désactiver l'affichage des éléments "Mode Démo" (badge, message).
 * @param {boolean} mode - true pour activer le mode démo, false pour le désactiver
 */
export function setDemoMode(mode) {
  state.isDemoMode = mode;
  return state.isDemoMode;
}

/**
 * Initialise un foyer de démonstration complet dans l'état local.
 * Utilisé par le bouton "Explorer la démo" (Phase 13.2.a)
 */
export async function initializeDemoState() {
  // Réinitialiser d'abord pour partir sur une base propre
  await resetState();

  // 1. Membres de la famille fictifs
  const demoMembers = [
    { id: 'u1', name: 'Steve', role: 'Admin', avatar: 'S', access: 'full' },
    { id: 'u2', name: 'Marie', role: 'Member', avatar: 'M', access: 'limited' }
  ];
  for (const m of demoMembers) await addFamilyMember(m);

  // 2. Équipements fictifs
  const demoEquipments = [
    { id: 'eq-1', category: 'piscine', name: 'Piscine Extérieure', status: 'Bon état', docs: [] },
    { id: 'eq-2', category: 'pompe', name: 'Pompe de filtration', status: 'À réviser', docs: [] }
  ];
  for (const e of demoEquipments) await addEquipment(e);

  // 3. Alertes fictives
  const demoAlerts = [
    { id: 'a-1', title: 'Entretien Pompe', detail: 'Révision annuelle requise.', type: 'amber', docId: '', dueDate: '2026-11-30' }
  ];
  for (const a of demoAlerts) {
    state.alerts.push(a);
    await put('alerts', a);
  }

  return state;
}

export default state;
