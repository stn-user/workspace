/**
 * state.js - Gestion de l'état global de l'application Famili-IA avec IndexedDB
 */

import { getAll, put, initDB, remove, purgeDatabase } from './db.js';
import { generateAlertForDoc, refreshAlerts } from './alert-engine.js';

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
      driveConnection: false
    },
    privacy: {
      consentVersion: '1.0',
      telemetryEnabled: false,
      dataSharingConsent: false,
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
  documents: []
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
    const documents = await getAll('documents');

    if (family.length > 0) state.family = family;
    else for (const m of defaultState.family) await put('family', m);

    if (equipment.length > 0) state.homeEquipment = equipment;
    else for (const e of defaultState.homeEquipment) await put('equipment', e);

    if (alerts.length > 0) state.alerts = alerts;
    else for (const a of defaultState.alerts) await put('alerts', a);

    if (users.length > 0) state.currentUser = users[0];
    else await put('users', defaultState.currentUser);

    if (documents.length > 0) {
      state.documents = documents;
      // Synchronisation proactive des alertes au démarrage
      const dynamicAlerts = refreshAlerts(documents);
      if (dynamicAlerts.length > 0) {
        // Fusion des alertes dynamiques avec les alertes par défaut ou existantes
        state.alerts = [...state.alerts, ...dynamicAlerts];
      }
    }

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
  // Le document reçu est déjà enrichi par le parser (DocumentContext)
  state.documents.push(document);
  await put('documents', document);

  // Logique de classification automatique
  if (document.type && document.provider) {
    console.log(`Auto-classification : Document ${document.originalName} classé (${document.type} - ${document.provider})`);
  }

  // Liaison automatique Document-Alerte (Intelligence Proactive)
  const newAlert = generateAlertForDoc(document);
  if (newAlert) {
    state.alerts.push(newAlert);
    await put('alerts', newAlert);
    console.log(`Assistant Proactif : Nouvelle alerte générée pour ${document.originalName}`);
  }

  return state.documents;
}

export async function deleteDocument(id) {
  state.documents = state.documents.filter(doc => doc.id !== id);
  await remove('documents', id);
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

export function calculateAlertType(dueDate, currentType) {
  if (!dueDate) return currentType;
  const dueDateObj = new Date(dueDate);
  const today = new Date();
  const diffTime = dueDateObj - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'red';
  if (diffDays <= 30) return 'amber';
  return 'blue';
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

export default state;
