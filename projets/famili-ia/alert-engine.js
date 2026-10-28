/**
 * alert-engine.js - Moteur de génération d'alertes proactives
 */

// Configuration des seuils (en jours)
const THRESHOLDS = {
  garantie: { amber: 60, red: 15 },
  assurance: { amber: 30, red: null }, // Pas de seuil "red" par défaut pour assurance
  facture: { amber: 30, red: 7 }
};

/**
 * Génère une alerte pour un document spécifique
 */
export function generateAlertForDoc(doc) {
  if (!doc.expiryDate) return null;

  const expiry = new Date(doc.expiryDate);
  const today = new Date();
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  const typeConfig = THRESHOLDS[doc.type];
  if (!typeConfig) return null;

  let level = null;
  if (typeConfig.red && diffDays <= typeConfig.red) level = 'red';
  else if (diffDays <= typeConfig.amber) level = 'amber';

  if (!level) return null;

  return {
    id: `alert-${doc.id}`,
    docId: doc.id,
    title: `${doc.type.charAt(0).toUpperCase() + doc.type.slice(1)}: ${doc.provider || doc.originalName}`,
    detail: level === 'red' ? "Attention, échéance imminente." : "Échéance à prévoir.",
    type: level,
    dueDate: doc.expiryDate
  };
}

/**
 * Synchronise toutes les alertes basées sur la liste des documents
 */
export function refreshAlerts(documents) {
  return documents
    .map(doc => generateAlertForDoc(doc))
    .filter(alert => alert !== null);
}
