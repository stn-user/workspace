/**
 * state.js - Gestion de l'état global de l'application Famili-IA avec IndexedDB
 */

import { getAll, put, initDB } from './db.js';

const defaultState = {
  currentUser: {
    id: 'u1',
    name: 'Steve',
    role: 'Admin',
    avatar: 'S',
    preferences: {
      localAccess: true,
      driveConnection: false
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
  ]
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

    if (family.length > 0) state.family = family;
    else for (const m of defaultState.family) await put('family', m);

    if (equipment.length > 0) state.homeEquipment = equipment;
    else for (const e of defaultState.homeEquipment) await put('equipment', e);

    if (alerts.length > 0) state.alerts = alerts;
    else for (const a of defaultState.alerts) await put('alerts', a);

    if (users.length > 0) state.currentUser = users[0];
    else await put('users', defaultState.currentUser);

  } catch (e) {
    console.warn('Erreur lors de l\'initialisation IndexedDB, utilisation des valeurs par défaut:', e);
  }
  return state;
}

export function getCurrentUser() {
  return state.currentUser;
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

export async function addFamilyMember(member) {
  state.family.push(member);
  await put('family', member);
  return state.family;
}

export async function updateCurrentUser(updates) {
  state.currentUser = { ...state.currentUser, ...updates };
  await put('users', state.currentUser);
  return state.currentUser;
}

export default state;
