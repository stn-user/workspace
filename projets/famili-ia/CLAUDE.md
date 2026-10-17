# CLAUDE.md - Guide du projet Famili-IA

## 🚀 Présentation du projet
Famili-IA est une application de gestion de documents familiaux et d'équipements domestiques. Elle se concentre sur une recherche locale respectueuse de la vie privée à travers plusieurs sources (fichiers locaux, Google Drive, et données de démonstration).

**Tech Stack :**
- **Frontend :** Vanilla JavaScript, CSS3, HTML5.
- **Wrapper Mobile :** Capacitor (Android/iOS).
- **Gestion d'état :** Centralisée dans `state.js`.
- **Navigation :** Routage basé sur le hash (`#/view?params`).

## 🛠 Workflow de développement
- **Lancer l'App :** Ouvrez `index.html` dans un navigateur ou utilisez le flow dev Capacitor.
- **Navigation :** Utilisez toujours `showView(name, options)` pour les transitions de vue afin de gérer l'historique et les paramètres.
- **État :** Lecture/Écriture des données familiales via les fonctions de `state.js`.

## 🎨 Charte Graphique & UI/UX (Anti-Régression)
Pour maintenir la cohérence visuelle, suivez ces règles basées sur les maquettes officielles :

### Couleurs & Thèmes
**Couleurs de marque principales :**
- **Primaire (Teal) :** `#0f7173` - Logo, liens, éléments interactifs
- **Primaire Sombre :** `#0c5e5f` - États hover
- **Primaire Clair :** `#e6f4f4` - Fonds légers

**Palette de couleurs sémantiques (Cartes stats & Icônes) :**
- **Bleu :** `#2563eb` - Documents, infos générales
- **Vert :** `#059669` - Maison, équipements, succès, garanties
- **Violet :** `#7c3aed` - Véhicules, catégories spéciales
- **Pourpre :** `#9333ea` - Photos, médias
- **Ambre :** `#d97706` - Alertes, avertissements
- **Rouge :** `#dc2626` - Alertes critiques, urgences
- **Cyan :** `#0891b2` - Technique, imprimantes

**Couleurs neutres :**
- **Fond :** `#f8fafc`
- **Surface :** `#ffffff`
- **Texte :** `#0f172a`
- **Texte Secondaire :** `#475569`
- **Texte Muted :** `#94a3b8`
- **Bordure :** `#e2e8f0`

### Typographie
- **Police :** Fontes système (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`)
- **Poids :** Regular (400), Medium (500), Semibold (600), Bold (700)

### Espacement & Layout
- **Unité de base :** `1rem` = 16px
- **Rayon de bordure (Border Radius) :** `8px` (petits), `12px` (cartes standard), `16px` (panneaux), `24px` (modales).

### Icônes & Visuels
**Style des Icônes :**
- **Format :** SVG inline.
- **Cartes Stats :** 
  - Style : Fond coloré transparent (`rgba(color, 0.1)`) avec icône de même couleur, contour défini par `stroke` et `fill: none`.
  - Taille : `24px` dans un conteneur `48px` circulaire.
- **Navigation (barre basse) :** 
  - Style : Icônes outline (style Feather/Lucide).
  - Taille : `20px`.
  - État actif : Couleur primaire.

## 🏗 Patterns d'Architecture
- **Logique de recherche :**
    - Utilisez `search-utils.js` pour la normalisation du texte.
    - Recherche "No-AI" (extraction de mots-clés/faits) pour garantir la confidentialité.
- **Initialisation des vues :** Chaque vue doit avoir une fonction `init[ViewName]View()` appelée lors de `showView`.
- **Flux de données :** `state.js` $\rightarrow$ `app.js` $\rightarrow$ DOM.

## ⚠️ Contraintes & Points de vigilance
- **Capacitor Native :** Vérifiez toujours `Capacitor.isNativePlatform()` avant les appels aux APIs natives.
- **Google Drive :** OAuth restreint à la version Web (prototype).
- **Pas de serveur :** Prototype client-side uniquement.
- **Hash de compatibilité :** Supportez `#/view` et `#view` dans `parseHash()`.
