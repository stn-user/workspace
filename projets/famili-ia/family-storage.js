/**
 * family-storage.js - Persistance de l'état familial dans localStorage
 *
 * Permet de sauvegarder et charger la structure familiale entre les sessions
 * tout en restant dans le principe privacy-first (stockage local uniquement).
 */

/**
 * Sauvegarde l'état familial dans localStorage
 * @param {Array} familyData - Array des membres de la famille
 * @returns {boolean} true si succès, false sinon
 */
export const saveFamilyState = (familyData) => {
  try {
    localStorage.setItem('famili-ia-family', JSON.stringify(familyData));
    return true;
  } catch (e) {
    console.warn('Impossible de sauvegarder l\'état familial:', e);
    return false;
  }
};

/**
 * Charge l'état familial depuis localStorage
 * @returns {Array|null} Array des membres de la famille ou null si aucun données
 */
export const loadFamilyState = () => {
  try {
    const saved = localStorage.getItem('famili-ia-family');
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.warn('Impossible de charger l\'état familial:', e);
    return null;
  }
};

/**
 * Supprime l'état familial de localStorage (utile pour logout ou reset)
 */
export const clearFamilyState = () => {
  try {
    localStorage.removeItem('famili-ia-family');
    return true;
  } catch (e) {
    console.warn('Impossible de supprimer l\'état familial:', e);
    return false;
  }
};