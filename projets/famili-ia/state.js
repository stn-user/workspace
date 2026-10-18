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
    avatar: 'S',
    // Preferences for the current user
    preferences: {
      localAccess: true,
      driveConnection: false
    }
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
    { id: 'a1', title: 'Garantie piscine', detail: 'Vérifiez les conditions et préparez le renouvellement.', type: 'red', docId: 'piscine-garantie', dueDate: '2026-11-15' }, // Expire dans 32 jours
    { id: 'a2', title: 'Entretien chaudière', detail: 'Pensez à faire le contrôle annuel.', type: 'amber', docId: 'chaudiere-entretien', dueDate: '2026-11-02' }, // Dans 15 jours
    { id: 'a3', title: 'Assurance habitation', detail: 'Renouvellement à prévoir.', type: 'amber', docId: 'assurance-habitation', dueDate: '2026-12-08' }, // Dans 52 jours
    { id: 'a4', title: 'Contrôle technique', detail: 'Vérifiez les documents du véhicule.', type: 'blue', docId: 'vehicule-ct', dueDate: '2027-01-20' }, // Dans 95 jours
    { id: 'a5', title: 'Facture électricité', detail: 'Paiement en attente.', type: 'muted', docId: 'facture-elec', dueDate: '2026-10-20' }, // Exemple
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
