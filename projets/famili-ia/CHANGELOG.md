# Changelog - Famili-IA

Toutes les modifications notables de Famili-IA sont documentées ici. Ce projet suit un cycle de développement par phases pour garantir une approche privacy-first.

## [0.5.0] - Phase 5 : Extension Family & Interface (Version Actuelle)
### 🚀 Nouvelles Fonctionnalités
- **Système de Navigation Complet** : Implémentation de 10 écrans distincts et interconnectés.
- **Assistant IA Conversationnel** : Interface de chat permettant de poser des questions naturelles sur les documents indexés avec attribution des sources.
- **Gestion Familiale** : Écran de gestion des membres, des rôles (Admin/Member) et des niveaux d'accès.
- **Inventaire "Vos Données"** : Vue exhaustive des fichiers indexés, possibilité d'export JSON et purge complète de la session.
- **Dashboard Accueil** : Tableau de bord dynamique avec statistiques et actions rapides.
- **Gestion du Foyer** : Inventaire des équipements domestiques catégorisés avec liens directs vers les documents associés (factures, notices, garanties).
- **Suivi des Alertes** : Système d'échéances pour les contrats et garanties avec codes couleurs (Rouge/Ambre).
- **Interface d'Importation** : Support du Drag & Drop et sélection de fichiers locaux/cloud.
- **État Global Centralisé** : Introduction de `state.js` pour synchroniser les données entre tous les écrans sans duplication.

### 🛠️ Améliorations Techniques
- **Optimisation UI/UX** : Refactorisation complète de `index.html` et `app.js` pour supporter un routage fluide entre les vues.
- **Provenance des données** : Intégration de badges visuels (☁️ Drive, 💾 Local, ✦ Démo) pour une transparence totale sur l'origine des informations.

---

## [0.4.0] - Phase 4 : MVP Privé & Accès Local
### 🚀 Nouvelles Fonctionnalités
- **Accès Système Natif** : Intégration du plugin `@capacitor/filesystem` pour accéder aux dossiers de l'appareil sur Android et iOS.
- **Indexation Locale** : Capacité d'extraire et d'indexer le texte des fichiers stockés localement (PDF, TXT).
- **Recherche Unifiée** : Fusion des résultats provenant de Google Drive et du stockage local dans un seul moteur de recherche.

### 🛠️ Améliorations Techniques
- **Gestion des Permissions** : Implémentation des demandes de permissions système pour le stockage externe.

---

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
