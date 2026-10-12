/**
 * state.js - Gestion de l'état global de l'application Famili-IA
 *
 * Ce module gère les données utilisateur, familiales et les équipements
 * pour permettre une synchronisation entre les différents écrans.
 */

const state = {
  // Utilisateur actuellement connecté
  currentUser: {
    id: 'u1',
    name: 'Steve',
    role: 'Admin',
    avatar: 'S'
  },

  // Membres de la famille
  family: [
    { id: 'u1', name: 'Steve', role: 'Admin', avatar: 'S', access: 'full' },
    { id: 'u2', name: 'Conjointe', role: 'Member', avatar: 'C', access: 'limited' },
    { id: 'u3', name: 'Aaron', role: 'Member', avatar: 'A', access: 'limited' },
    { id: 'u4', name: 'Lorena', role: 'Member', avatar: 'L', access: 'limited' },
    { id: 'u5', name: 'Elyana', role: 'Member', avatar: 'E', access: 'limited' },
  ],

  // Équipements de la maison
  // Chaque équipement est lié à un ou plusieurs documents par leur ID
  homeEquipment: [
    {
      id: 'eq-piscine-pompe',
      category: 'pompe',
      name: 'Pompe Hayward Modèle 2022',
      status: 'Bon état',
      docs: ['piscine-garantie']
    },
    {
      id: 'eq-piscine-filtre',
      category: 'piscine',
      name: 'Filtre de piscine',
      status: 'À nettoyer',
      docs: ['maison-notice']
    },
    {
      id: 'eq-bambu-a1',
      category: 'imprimante',
      name: 'Bambu Lab A1',
      status: 'Opérationnelle',
      docs: ['bambu-facture']
    },
    {
      id: 'eq-assurance-hab',
      category: 'assurance',
      name: 'Contrat Habitation',
      status: 'Actif',
      docs: ['habitation-contrat']
    }
  ],

  // Alertes administratives
  alerts: [
    { id: 'a1', title: 'Garantie piscine', detail: 'Expire dans 32 jours', type: 'amber', docId: 'piscine-garantie' },
    { id: 'a2', title: 'Contrôle technique', detail: 'Dans 18 jours', type: 'red', docId: 'vehicule-ct' },
    { id: 'a3', title: 'Doublons détectés', detail: '247 doublons', type: 'amber', docId: null },
  ]
};

/**
 * Récupère l'utilisateur actuel
 */
export function getCurrentUser() {
  return state.currentUser;
}

/**
 * Récupère la liste des membres de la famille
 */
export function getFamilyMembers() {
  return state.family;
}

/**
 * Récupère les équipements par catégorie
 */
export function getEquipmentByCategory(category = 'tout') {
  if (category === 'tout') return state.homeEquipment;
  return state.homeEquipment.filter(eq => eq.category === category);
}

/**
 * Récupère les détails d'un équipement spécifique
 */
export function getEquipmentDetail(id) {
  return state.homeEquipment.find(eq => eq.id === id);
}

/**
 * Récupère toutes les alertes
 */
export function getAlerts() {
  return state.alerts;
}

/**
 * Ajoute un membre à la famille
 */
export function addFamilyMember(member) {
  state.family.push(member);
  return state.family;
}

/**
 * Met à jour le profil utilisateur
 */
export function updateCurrentUser(updates) {
  state.currentUser = { ...state.currentUser, ...updates };
  return state.currentUser;
}

export default state;
