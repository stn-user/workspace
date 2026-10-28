## [10.0.0] - 2026-10-28 - Phase 10 : Optimisation Mobile & Revue Documentaire
### 🚀 Nouvelles Fonctionnalités
- **Revue Documentaire (Phase 10.4)** : Refonte structurelle complète, migration vers `/docs/`, création de `document-parser.js`, suppression des redondances, mise en place du processus de maintenance (CI, lint, revues PR).
- **Intelligence Contextuelle (Phase 10.5)** : Moteur `document-parser.js` pour extraction structurée métadonnées (Type/Fournisseur/Date/Montant/Catégorie) sur fichiers locaux (PDF, DOCX, XLSX, TXT). Prise en charge Facture, Garantie, Assurance.
- **Recherche Sémantique (Phase 10.6)** : Similarité pondérée (Provider 40%, Type 20%, Catégorie 20%, Tags 10%, Date 10%) + règles de rebond (Facture ↔ Garantie). Intégration `search-utils.js`.
- **Assistant Proactif (Phase 10.7)** : Alertes automatiques à l'import/démarrage (Seuils: Garantie 60j/15j, Assurance 30j, Facture 30j/7j). Moteur `alert-engine.js`. Intégration UI transparente.

### 🛠 Corrections et Améliorations
- **Architecture Documentaire** : Migration schémas Mermaid `/docs/architecture/mermaid/`, centralisation `AUTH_LOCALE_DOC.md` → `docs/architecture/integration.md`.
- **Nettoyage** : Suppression fichiers temporaires `projets/famili-ia/plans/`.
- **Checklist Anti-Régression** : Mise à jour `CLAUDE.md` et `DEVELOPPEMENT_PLAN.md`.

### 📦 dépendances
- Aucune dépendance externe ajoutée (traitement "No-AI" / local).

---

## [0.9.0] - Phase 9 : Homogénéisation UI, Polish & Gestion des Membres
### 🚀 Nouvelles Fonctionnalités
- **Optimisation Import & Navigation (Phase 9.17 / 9.18)** :
  - Unification du bouton de capture (fusion "Prendre une photo" et "Scanner") (9.17.c).
  - Rétablissement du support des formats `.docx`, `.xlsx`, `.xls` dans le filtre d'importation (9.18.c).
  - Implémentation d'une navigation contextuelle fonctionnelle avec transmission de `docId` permettant d'ouvrir directement les documents depuis le Dashboard, les Alertes et la vue Famille (9.18.d).
- **Gestion des Membres (Phase 9.6)** :
  - Refonte de la gestion des membres de la famille avec une modale dédiée et centralisée ("Gérer les membres et accès").
  - Intégration complète du CRUD (Création, Lecture, Modification, Suppression) pour les proches et invités.
  - Épuration visuelle de la liste des membres dans la vue Famille principale.
- **Logo Officiel (Phase 9.5)** :
  - Intégration du logo officiel SVG Famili-IA dans le header et la vue de recherche.

### 🛠️ Correctifs et Améliorations UI
- **Conformité Charte Graphique & Modales** :
  - Mise à jour des boutons de modales (Maison, Membres) pour utiliser les classes CSS uniformes du design system (`primary-button`, `secondary-button`, `danger-button`).
  - Correction de la fermeture par la croix (`×`) de la modale de gestion des équipements domestiques (`#close-equipment-dialog`).
  - Correction d'une erreur de taille de clé AES (`DataError: AES key data must be 128 or 256 bits`) dans `crypto.js` en utilisant une clé 256 bits de 32 octets.
  - Correction d'un import manquant (`deleteFamilyMember`) dans `app.js`.

## [0.6.0] - Phase 8 : Sécurisation & Vie privée
### 🚀 Nouvelles Fonctionnalités
- **Consentements (Phase 8.3)** : Ajout d'une structure de préférences de confidentialité (`privacy`) dans l'état utilisateur pour gérer les consentements (télémétrie, partage de données).
- **Journalisation (Phase 8.3)** : Implémentation d'un système de logs d'accès (`access_logs`) dans IndexedDB pour assurer une traçabilité sécurisée des actions.
- **Purge Sécurisée (Phase 8.2)** : Ajout d'une fonctionnalité de réinitialisation complète des données (`resetState` et `purgeDatabase`) permettant de vider l'ensemble des bases IndexedDB proprement.

### 🛠️ Correctifs et Améliorations
- **Nettoyage Codebase** : Résolution de l'erreur syntaxique `Identifier 'purgeDatabase' has already been declared` causée par une duplication de fonction dans `db.js`.
- **Tests** : Ajout d'une suite de tests (Phase 8) validant la logique de chiffrement, la gestion des consentements et la purge de la base de données.

### Sécurité & Corrections (Session actuelle)
- **Chiffrement dynamique (8.1)** : Remplacement de la clé AES-GCM codée en dur par une clé générée dynamiquement et stockée dans IndexedDB, éliminant la vulnérabilité de clé statique.
- **Export PDF (8.2)** : Implémentation d'un générateur de rapport PDF léger sans bibliothèque externe, permettant l'export des données vers `famili-ia-data.pdf`.
- **Gestion des consentements (8.3)** : Ajout d'options de télémétrie anonyme et de partage de données dans la vue Profil, persistant via `state.updatePrivacyConsent`.
- **Correction layout Données** : Remise en place correcte de la section `view-vos-donnees` dans `<main class="main-content">`, résolvant l'affichage en décalé par rapport à la sidebar.
- **Correction Vite** : Débogage et correction de l'erreur de syntaxe JavaScript bloquant le démarrage de l'application (`app.js` ligne 2161).

### 🛠️ Correctifs et Améliorations
- **Alignement Design (Étape 5.30)** :
  - Centrage du titre et de l'intro sur l'écran "Recherche IA" conformément aux maquettes.
  - Nettoyage de l'interface principale de recherche (suppression des filtres redondants déplacés dans l'écran dédié).
  - Élimination des doublons de la notice de sécurité.
  - Mise en conformité de la charte graphique (`CLAUDE.md`) pour la fenêtre modale de choix des sources.
- **Régression Navigation & Layout** :
  - Restructuration du DOM (`index.html`) et du CSS Grid (`styles.css`) pour rétablir la disposition côte à côte de la sidebar et du contenu principal, résolvant les problèmes de navigation.
  - Correction d'une erreur JavaScript (`TypeError`) empêchant l'initialisation des écouteurs d'événements après le nettoyage de la vue de recherche.

## [0.4.0] - Phase 4 : MVP Privé & Accès Local
### 🚀 Nouvelles Fonctionnalités
- **Accès Système Natif** : Intégration du plugin `@capacitor/filesystem` pour accéder aux dossiers de l'appareil sur Android et iOS.
- **Indexation Locale** : Capacité d'extraire et d'indexer le texte des fichiers stockés localement (PDF, TXT).
- **Recherche Unifiée** : Fusion des résultats provenant de Google Drive et du stockage local dans un seul moteur de recherche.

### 🛠️ Améliorations Techniques
- **Gestion des Permissions** : Implémentation des demandes de permissions système pour le stockage externe.

## [0.1.0 - 0.3.0] - Phases Initiales : MVP Cloud
### 🚀 Nouvelles Fonctionnalités
- **Intégration Google Drive** : Implémentation de l'OAuth et du Picker Drive (scope `drive.file`).
- **Moteur de Recherche de Base** : Recherche textuelle immédiate en mémoire pour les fichiers cloud.
- **Extraction PDF** : Intégration de `pdfjs-dist` pour la lecture des documents PDF.

---

## 🛡️ Principes de Privacy (Maintenus)
- **Zéro Serveur** : Aucune donnée n'est envoyée vers un serveur externe.
- **Stockage Éphémère** : L'indexation est réalisée en mémoire pour la session utilisateur.
- **Contrôle Total** : L'utilisateur peut purger ses données à tout moment.