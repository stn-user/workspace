# Famili-IA – Plan de Développement

## 📊 Vue d'ensemble
- **Phase actuelle** : Phase 5bis – Améliorations UX & alignement maquettes
- **Prochaine étape prioritaire** : Alignement visuel des 10 écrans selon les maquettes (Phase 5bis)

## 📋 Liste des étapes

### Phase 0 – Cadrer le problème
- [✓] ✅ 0.1 : Vision & principe de design réd. (roadmap) 
- [✓] ✅ 0.2 : Analyse des exigences de sécurité/privacy (roadmap)

### Phase 1 – MVP : version cloud unique
- [✓] ✅ 1.1 : Implémenter OAuth/Picker Drive (scope `drive.file`)
- [✓] ✅ 1.2 : Moteur de recherche local-cloud, index immédiat en mémoire
- [✓] ❌ 1.3 : OCR intégration (Vision/ML-kit) – **incomplete** (à valider plus tard)

### Phase 2 – Conception technique
- [✓] ✅ 2.1 : Architecture de stockage *en-mémoire* (no persistence)
- [✓] ✅ 2.2 : Composants UI de résultats (source cloud/local)
- [ ] 2.3 : Sécurisation des scopes OAuth & gestion des tokens
- [ ] 2.4 : Design de l'authentification locale `READ_EXTERNAL_STORAGE`/scope-files

### Phase 3 – Prototype web local (déjà réalisé)
- [✓] ✅ 3.1 : UI de sélection de fichiers locaux (web + Capacitor)
- [✓] ✅ 3.2 : Extraction texte via PDF.js + OCR expérimental
- [✓] ✅ 3.3 : Tableau de résultats unifié
- [ ] 3.4 : Tests de régression sur le moteur de recherche (cloud vs local)

### Phase 4 – MVP privé sur un seul Cloud (✅ TERMINÉE)
- [✓] ✅ 4.1 : Mise à jour de la roadmap (ajout *recherche locale*)
- [✓] ✅ 4.2 : Intégration du plugin **@capacitor/filesystem**
- [✓] ✅ 4.3 : Gestion des permissions système (Android `READ_EXTERNAL_STORAGE`, iOS Files access)
- [✓] ✅ 4.4 : Création du module local-files.js
- [✓] ✅ 4.5 : Extraction texte pour fichiers "local-only" (même chemin que Drive)
- [✓] ✅ 4.6 : Unifier la logique index-ing : concaténer résultats cloud + local
- [✓] ✅ 4.7 : UI indicateur "☁️ / 💾" de provenance
- [✓] ✅ 4.8 : Tests unitaires & d'intégration local-cloud
- [✓] ✅ 4.9 : Vérification de la min-sécurité (pas de persistance, accès limité)
- [✓] ✅ 4.10 : Documentation de la chaîne d'authentification locale

### Phase 5 – Extension Family & Interface (✅ TERMINÉE)
- [✓] ✅ 5.1 : État global → Création state.js (utilisateur, famille, équipements, alertes)
- [✓] ✅ 5.2 : Navigation → Refactor app.js pour supporter 10 écrans + routes imbriquées
- [✓] ✅ 5.3 : Composants UI → **Accueil** (dashboard familial, stats, actions rapides)
- [✓] ✅ 5.4 : Composants UI → **Recherche** (recherche avancée avec filtres par type/source)
- [✓] ✅ 5.5 : Composants UI → **Maison** (liste équipements par catégorie + ajout rapide)
- [✓] ✅ 5.6 : Composants UI → **Détail équipement** (affichage facture/garantie/notice liés)
- [✓] ✅ 5.7 : Composants UI → **Alertes** (suivi échéances, statuts, actions)
- [✓] ✅ 5.8 : Composants UI → **Famille** (gestion membres, rôles, accès, invitations)
- [✓] ✅ 5.9 : Composants UI → **Profil/Paramètres** (infos user, confidentialité, export/suppression)
- [✓] ✅ 5.10 : Composants UI → **Importer** (sélection local/cloud, drag & drop)
- [✓] ✅ 5.11 : Composants UI → **Vos données** (inventaire, historique, export)
- [✓] ✅ 5.12 : Composants UI → **Assistant IA** (chat conversationnel, suggestions)
- [✓] ✅ 5.13 : Services → Données familiales partagées (stockage local partagé)
- [✓] ✅ 5.14 : Services → Système notifications/alertes automatisées
- [✓] ✅ 5.15 : Intégration → Navigation 10 écrans + états partagés
- [✓] ✅ 5.16 : Tests → UI/UX sur use-cases familiaux

### Phase 5bis – Améliorations UX & alignement maquettes (EN COURS)
- [✓] ✅ 5.17 : Accueil – Personnalisation greeting, icônes SVG remplis, cartes stats
- [✓] ✅ 5.18 : Recherche – Barre centrée, suggestions prompt, filtres stylisés, résultats
- [✓] ✅ 5.19 : Maison – SVG propriété, onglets catégorie stylisés, liste équipements dynamique
- [✓] ✅ 5.20 : Famille – Avatars membres, liste avec rôles, panel documents couleur-codés
- [✓] ✅ 5.21 : Alertes – Icône cloche remplie, bouton marquer lu, cartes alertes colorées
- [✓] ✅ 5.22 : Detail – Illustrations équipements, sections techniques, actions contextuelles
- [✓] ✅ 5.23 : Assistant – Bulles chat différenciées, avatar, suggestions rapides, scroll auto
- [✓] ✅ 5.24 : Profil – Avatar initiale lettre, champs éditables, bouton sauvegarder, cases cocher stylisées
- [✓] ✅ 5.25 : Vos données – Icône dossier rempli, liste fichiers avec métadonnées, actions critiques
- [✓] ✅ 5.26 : Homogénéisation – Variables espacements, audit cohérence couleurs/ombres/rayons, focus-visible
- [✓] ✅ 5.27 : Responsive – Tests sur mobile (<540px) pour chaque écran, ajustements spécifiques
- [ ] 5.28 : Recherche IA – Amélioration de l'interface conversationnelle et intégration fluide des suggestions
- [ ] 5.29 : Importation – Finalisation du Drag & Drop (feedback visuel robuste et traitement)

### Phase 6 – Validation & Lancement (à venir)
- [ ] 6.1 : Tests utilisateurs complets (famille monoparentale, multi-membres)
- [ ] 6.2 : Mesure de la satisfaction utilisateur et des temps de recherche
- [ ] 6.3 Rapport final & next-steps pour Phase 7 (éventuelle)

## 📌 Comment mettre à jour
- Cochez la case `[✓]` lorsque la tâche est terminée.
- Si une tâche est bloquée, ajoutez un commentaire après la case (ex : `[ ] ❌ 4.4 : En attente de Android X debugging → config .`).
- Maintenez le fichier à jour dans chaque branche ou commit important.

> **Remarque** : Ce fichier sert de référentiel vivant. En cas de question, naviguer vers la section correspondante ou laisser un commentaire.