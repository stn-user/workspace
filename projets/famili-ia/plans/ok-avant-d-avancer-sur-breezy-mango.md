# Plan de développement : Phase 9 (Polish UI & Monetization Setup)

## Contexte
Cette phase vise à terminer l'homogénéisation de l'interface utilisateur, améliorer l'aspect visuel (photos, logo), et jeter les bases techniques pour une future stratégie de monétisation.

## Étapes recommandées

### 1. Logo officiel & Harmonisation UI
- **Problème :** Le logo (`assets/logo.svg`) est utilisé de manière incohérente (tailles fixes, styles inline).
- **Plan :**
  - Standardiser le composant Logo via un wrapper CSS (`.logo-wrapper` avec classes `.size-sm`, `.size-md`, `.size-lg`).
  - Supprimer les styles inline sur les balises `<img>` et les conteneurs `brand-mark`.
  - Harmoniser les icônes sur toutes les pages en utilisant une approche cohérente (SVG inline ou via un composant utilitaire).

### 2. Amélioration visuelle (Images dynamiques)
- **Objectif :** Rendre l'interface plus vivante avec des illustrations contextuelles.
- **Plan :**
  - Créer un dictionnaire de correspondance `catégorie -> image` (ex: `pompe` -> `pool-pump.jpg`, `maison` -> `house.jpg`).
  - Mettre à jour `initHouseView()` pour injecter ces images dans les cartes correspondantes plutôt que d'utiliser uniquement des icônes SVG.

### 3. Navigation & UX des vues
- **Objectif :** Améliorer la fluidité de navigation entre les onglets et le contenu détaillé.
- **Plan :**
  - Réparer la navigation dans la page "Maison" : le clic sur un onglet doit filtrer les équipements sans recharger la page.
  - Réparer la navigation dans la page "Alertes" : le clic sur un onglet doit filtrer les alertes dynamiquement.
  - S'assurer que `showView` conserve correctement l'état de filtrage si nécessaire.

### 4. Support Fichiers & Cloud
- **Objectif :** Étendre la capacité de traitement.
- **Plan :**
  - Ajouter le support des images (JPG, PNG) dans `local-files.js` et le file picker (pour OCR ultérieur).
  - Étudier l'ajout de nouvelles sources (ex: Dropbox, OneDrive) dans `google-drive.js` et créer une interface générique pour les connecteurs Cloud.

### 5. Préparation à la monétisation
- **Objectif :** Définir les bases techniques pour des offres (Gratuit, Confort, Premium).
- **Plan :**
  - Étendre `state.js` pour inclure un `subscriptionTier` dans `currentUser`.
  - Externaliser les limites actuelles (`maxFiles = 5`, etc.) dans une configuration dynamique basée sur le `subscriptionTier`.
  - Ajouter un composant UI pour afficher le niveau actuel de l'abonnement et proposer le passage au niveau supérieur.

## Vérification
- **Visuel :** Vérifier le rendu du logo sur mobile et desktop.
- **Navigation :** Tester les onglets "Maison" et "Alertes" sur téléphone.
- **Data :** Vérifier que les nouvelles limites de fichiers respectent le `subscriptionTier`.
- **Intégration :** Tester l'ajout d'une image depuis le file picker.
