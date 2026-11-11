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
- **Documentation :** Toute modification majeure (architecture, interactions entre composants, changements critiques dans `styles.css`) **DOIT** s'accompagner d'une mise à jour de la documentation correspondante dans le dossier `/docs/`.

## 🎨 Charte Graphique & UI/UX (Anti-Régression)
Pour maintenir la cohérence visuelle, suivez ces règles basées sur les maquettes officielles :

### Couleurs & Thèmes
**Migration progressive du lot E :** l'onboarding, l'Accueil, la Recherche, l'Assistant, les Alertes, Vos données, Famille, Maison, les fiches équipement, Importer, Profil et Plus utilisent désormais l'identité bleu/marine du logo officiel : `--ui-brand` (`#245be8`), `--ui-brand-hover` (`#1948bd`), `--ui-ink` (`#12285c`), `--ui-muted` (`#40547b`), `--ui-border` (`#d7e2f6`), `--ui-tint` (`#eaf1ff`) et `--ui-page` (`#f5f8ff`). Réutiliser les composants `ui-*` dans ces parcours ; `--ui-danger` et `ui-button--danger` signalent une action destructive. Le thème `body.ui-theme` est activé pour `accueil`, `recherche`, `assistant`, `alertes`, `vos-donnees`, `famille`, `maison`, `detail`, `importer`, `profil` et `plus` ; la palette historique ci-dessous demeure pour les vues non migrées. Ne pas recolorer globalement les autres vues.

Tous les dialogues HTML déclarés et les dialogues dynamiques de gestion familiale/saisie manuelle utilisent `ui-dialog`. L'ancien dialogue de scan reste un aperçu sans point d'entrée, désactivé et non opérationnel. Ne pas le relier à une permission ou à un scan dans une simple tâche graphique. Les confirmations natives du navigateur restent natives. L'Assistant conserve son moteur documentaire local et ses exemples de repli, distincts de l'index unifié de Recherche ; une suggestion prépare la question sans l'envoyer.

**Cohérence des parcours E5 :** Accueil est un tableau de bord avec raccourci Recherche, pas un deuxième formulaire. Les ajouts depuis Accueil, Recherche et Vos données utilisent `data-open-import` vers Importer ; pas de bouton flottant concurrent. Importer expose appareil/Google Drive/OneDrive et ouvre les options existantes du fournisseur sans connexion automatique. Réutiliser leurs états de disponibilité, ne pas annoncer un connecteur indisponible comme opérationnel. Les images de Maison sont des illustrations locales explicitement identifiées ; leur affichage ne constitue pas une personnalisation photo persistante.

**Couleurs de marque principales (tokens CSS dans `styles.css`) :**
- **Primaire (Noir) :** `#171717` - Logo, liens, éléments interactifs
- **Primaire Sombre :** `#000000` - États hover et contraste fort
- **Primaire Clair :** `#f1f1f1` - Fonds légers
- **Fond général :** `#f6f6f6`, avec un dégradé blanc subtil dans la zone de contenu
- **Surface :** `#ffffff`
- **Texte principal :** `#171717`
- **Texte secondaire :** `#525252`
- **Bordure :** `#e5e5e5`

Les surfaces utilisent des dégradés discrets de blanc vers gris clair ; réserver le dégradé noir/gris aux actions principales et aux mises en avant. Les couleurs sémantiques restent réservées aux états (succès, alerte, erreur) et aux catégories qui en ont besoin.

**Palette de couleurs sémantiques (Cartes stats & Icônes) :**
- **Bleu :** `#2563eb` - Documents, infos générales
- **Vert :** `#059669` - Maison, équipements, succès, garanties
- **Violet :** `#7c3aed` - Véhicules, catégories spéciales
- **Pourpre :** `#9333ea` - Photos, médias
- **Ambre :** `#d97706` - Alertes, avertissements
- **Rouge :** `#dc2626` - Alertes critiques, urgences
- **Cyan :** `#0891b2` - Technique, imprimantes

**Couleurs neutres :**
- **Texte Muted :** `#737373`
- **Surface teintée :** `#f5f5f5`
- **Surface de succès :** `#ecfdf5`
- **Surface d'action destructive :** `#fff7f7`

### Typographie
- **Police :** Fontes système (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`)
- **Poids :** Regular (400), Medium (500), Semibold (600), Bold (700)

### Espacement & Layout
- **Unité de base :** `1rem` = 16px
- **Rayon de bordure (Border Radius) :** `8px` (petits), `12px` (cartes standard), `16px` (panneaux), `24px` (modales).
- **Surfaces :** cartes blanches avec bordure neutre et ombre discrète ; réserver les fonds teintés aux accents, états ou groupes d'information.
- **Badges d'inventaire :** afficher séparément le type, la provenance et l'état de couverture d'indexation ; distinguer « Texte indexé » de « Métadonnées seules » et permettre le retour à la ligne sur mobile.
- **Hiérarchie :** privilégier une page à largeur de lecture maîtrisée, une synthèse chiffrée lisible, puis le contenu principal et ses actions secondaires.
- **Mobile :** conserver des cibles tactiles d'au moins `44px`, autoriser le défilement horizontal des filtres lorsque nécessaire et empiler les colonnes sous `900px`.

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
- **Documentation :** Toute modification majeure de l'architecture, de l'interaction entre composants, ou de la charte de style (`styles.css`) **doit** impérativement s'accompagner d'une mise à jour de la documentation technique (schémas Mermaid, fichiers Markdown dans `/docs/`).

## ✅ Checklist Anti-Régression (avant commit)
- [ ] **Structure des modules** : `state.js`, `app.js`, `search-utils.js`, `local-files.js` sont présents et exportent les fonctions attendues.
- [ ] **Documentation à jour** : Les schémas Mermaid ([overview.mmd](docs/architecture/mermaid/overview.mmd)) et fichiers techniques ([integration.md](docs/architecture/integration.md)) reflètent les changements récents.
- [ ] **Pas de fichiers orphelins** : Aucun fichier `.bak`, `.tmp`, ou backup à la racine du projet ou dans `projets/famili-ia/`.
- [ ] **Respect des tokens CSS** : Utiliser les tokens `--ui-*` pour l'onboarding, l'Accueil, la Recherche, l'Assistant, les Alertes, Vos données, le foyer, Importer, Profil et Plus ; préserver la palette historique des vues non migrées. Les couleurs sémantiques sont définies dans les variables CSS.
- [ ] **Navigation hash** : `parseHash()` gère correctement `#/view` et `#view` sans régression.
- [ ] **Capacitor safety** : `Capacitor.isNativePlatform()` vérifié avant tout appel API native.
- [ ] **Interface de recherche** : La barre de recherche et les résultats s'affichent correctement sur desktop et mobile.
- [ ] **États d'erreur** : Les composants affichent un état vide/erreur significatif si les données manquent.
- [ ] **Accessibilité** : Les contrastes respectent les ratios minimaux (texte: 4.5:1, UI components: 3:1).
- [ ] **Cibles et clavier** : Tout contrôle interactif fait au moins 48 × 48 px (case à cocher : zone de 48 px, carré visible de 24 px), expose un nom accessible, a un focus visible et respecte `prefers-reduced-motion`. `tests/accessibility-audit.spec.js` le vérifie sur chaque écran.
