# Famili-IA – Plan de Développement

## 📊 Vue d'ensemble
- **Phase actuelle** : Phase 9 – Homogénéisation UI & Polish
- **Prochaine étape prioritaire** : Phase 10 – Optimisation Mobile & Revue Documentaire

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
- [✓] ✅ 5.3 : Composants UI → Accueil, Recherche, Maison, Famille, Alertes, Assistant, Importer, Profil, Vos données
- [✓] ✅ 5.13 : Services → Données familiales partagées
- [✓] ✅ 5.14 : Services → Système notifications/alertes automatisées

### Phase 5bis – Améliorations UX & alignement maquettes (✅ TERMINÉE)
- [✓] ✅ 5.17 - 5.28 : Homogénéisation, Responsive, Recherche IA, etc.
- [✓] ✅ 5.30 : Recherche IA – Alignement design (logo, titre centré, nettoyage)
- [✓] ✅ 5.29 : Importation – Finalisation du Drag & Drop (feedback visuel robuste et traitement)

### Phase 6 – Infrastructure Data & Persistance
- [✓] ✅ 6.1 : Choix et implémentation du moteur de stockage persistant (IndexedDB)
- [✓] ✅ 6.2 : Modélisation réelle des données (User, Family, Equipment, Document, Alert)
- [ ] 6.3 : Mise en place de la synchronisation (si multi-appareil nécessaire)

### Phase 7 – Implémentation fonctionnelle
- [✓] ✅ 7.1 : Gestion Multi-utilisateurs (RBAC : Admin/Membre, gestion des rôles) - *Initialisé*
- [✓] ✅ 7.2 : Moteur d'indexation réel (recherche multi-fichiers, indexation persistante) - *Terminé*
- [✓] ✅ 7.3 : Système d'Alertes et rappels automatisés (calcul des échéances réel) - *Terminé*
- [✓] ✅ 7.4 : Inventaire des équipements (CRUD complet, catégorisation réelle) - *Terminé*

### Phase 8 – Sécurisation & Vie privée avancée
- [✓] ✅ 8.1 : Chiffrement des données sensibles en local (clé dynamique IndexedDB)
- [✓] ✅ 8.2 : Workflow d'export complet (JSON/PDF) et purge sécurisée
- [✓] ✅ 8.3 : Gestion fine des consentements (télémétrie/partage) et logs d'accès

### Phase 9 – Homogénéisation UI & Polish
- [✓] ✅ 9.1 : Standardisation globale des headers et titres
- [✓] ✅ 9.2 : Audit d'accessibilité complet
- [✓] ✅ 9.3 : Gestion robuste des états d'erreur et états vides
- [✓] ✅ 9.4 : Alignement FAB & bouton + (uniquement accueil/recherche), retrait de la section "Mes sources" en doublon sur la page Recherche
- [✓] ✅ 9.5 : Intégration du logo officiel de l'application
- [✓] ✅ 9.6 : Implémentation de la gestion des membres de famille (CRUD & Refonte UX)
- [✓] ✅ 9.7 : Harmonisation des icônes *(Terminée)*
- [✓] ✅ 9.8 : Standardisation et validation du composant Logo
- [✓] ✅ 9.9 : **Phase A – Intégration d'images (photos) dans le file picker** — Utilisation de l'OCR existant (`local-files.js`) pour extraire le texte des images JPG/PNG et les classifier automatiquement.
- [✓] ✅ 9.10 : **Phase B – Support des fichiers Word (.docx)** — Parsing du texte via bibliothèque dédiée (ex: mammoth.js).
- [✓] ✅ 9.11 : **Phase C – Support des fichiers Excel (.xlsx)** — Extraction des données tabulaires via bibliothèque dédiée (ex: sheetjs).
- [✓] ✅ 9.14 : **Phase D – Amélioration UX Import** — Harmoniser l'importation (unifier les deux méthodes d'import), permettre la visualisation des fichiers importés sur l'écran d'import, et synchroniser les sources.
- [✓] ✅ 9.15 : **Optimisation Menu Mobile** — Rendre la barre de navigation inférieure scrollable horizontalement pour inclure toutes les vues.
- [ ] 9.16 : **Refonte Navigation Mobile — Parcours Utilisateur Simplifié** — Réduire la barre inférieure à 5 éléments prioritaires (Accueil, Recherche, Importer, Maison, Menu «Plus») et regrouper les vues secondaires (Alertes, Famille, Profil, Vos données) dans un écran «Plus».
    - [✓] ✅ 9.16.a : Audit & Validation — Valider la structure cible (5 items) et le parcours utilisateur (Dashboard contextuel → Recherche → Import rapide → Bibliothèques → Menu «Plus»).
    - [✓] ✅ 9.16.b : Mise à jour de la maquette — Amender `docs/MAQUETTE_UI_MOBILE.md` avec la nouvelle structure de navigation et les interactions cibles entre vues.
    - [✓] ✅ 9.16.c : Refactor `index.html` — Restructurer `.bottom-nav` (5 items) et créer la vue «Plus» (regroupement Alertes, Famille, Profil, Vos données).
    - [✓] ✅ 9.16.d : Refactor `app.js` — Ajouter le routage `#/plus`, le rendu de la vue «Plus» et la mise à jour de l'état actif de la navigation.
    - [✓] ✅ 9.16.e : Adaptation CSS — Ajuster `styles.css` pour le nouveau menu (cibles tactiles, état actif, transition de la vue «Plus»).
- [ ] 9.17 : **Amélioration Vue Importer & Actions Mobiles (Photo, Scan, Saisie manuelle)**
     - [✓] ✅ 9.17.a : Correction esthétique de la zone de glisser-déposer (ajustement de la taille de l'icône par rapport au cercle gris).
     - [✓] ✅ 9.17.b : Implémentation du bouton "Prendre une photo" (utilisation de l'input file avec `capture="environment"` / `accept="image/*"` pour déclencher l'appareil photo du smartphone).
     - [x] ✅ 9.17.c : Optimisation ou fusion du bouton "Scanner un document" — Fusionné avec le bouton "Capture" (un seul bouton pour photo/navigateur). Redondance éliminée, code simplifié.
     - [x] ✅ 9.17.d : Implémentation du bouton "Saisir manuellement" (ouverture d'une modale ou d'un formulaire de saisie de texte libre, avec conversion et enregistrement automatique au format document dans l'application).
     - [x] ✅ 9.17.d : Implémentation du bouton "Saisir manuellement" - Dialogue complet avec saisie titre, type et contenu, enregistrement automatique dans la base locale.
- [ ] 9.18 : **Corrections Fonctionnelles & Expérience Utilisateur Import**
     - [✓] ✅ 9.18.a : Corriger le bouton "Annuler" dans le dialogue de saisie manuelle pour revenir à l'écran précédent (fermer le dialog et rétablir l'état précédent).
     - [✓] ✅ 9.18.b : Étendre la gestion des types de documents au-delà des 4 types actuels (Facture, Garantie, Contrat, Notice, Quittance, Attestation, Ordonnance, Courrier, Certificat, Autre).
     - [ ] 9.18.c : Réactiver la recherche et l'assistant intelligent sur les documents saisis manuellement (s'assurer que le texte extrait/entré est correctement indexé et recherchable).
     - [x] ✅ 9.18.c.1 : Corriger `app.js` pour accepter .docx, .xlsx, .xls lors de l'import.
         - [ ] 9.18.c.2 : Vérifier l'intégration des parsers (mammoth, sheetjs) dans `local-files.js`.
         - [ ] 9.18.c.2 : Vérifier l'intégration des parsers (mammoth, sheetjs) dans `local-files.js`.
         - [ ] 9.18.c.3 : Tester l'importation réelle des fichiers Word/Excel.
         - [ ] 9.18.c.4 : Valider la recherche et l'assistant sur ces nouveaux formats.
     - [ ] 9.18.d : Rendre la navigation vers les documents fonctionnelle depuis toutes les interfaces (Accueil, Alertes, Inventaire).
         - [ ] 9.18.d.1 : Étendre `showView` pour gérer le paramètre `docId`.
         - [ ] 9.18.d.2 : Mettre à jour les liens (Dashboard, Alertes, Inventaire) dans `index.html` pour transmettre les `docId` réels.
         - [ ] 9.18.d.3 : Automatiser l'ouverture du `sourceDialog` lors de la navigation avec un `docId`.
         - [ ] 9.18.d.4 : Vérifier la cohérence des données mockées entre le Dashboard et le lecteur de document.

### Phase 11 – Monétisation, Expérience Utilisateur & Valeur Augmentée
- [ ] 11.1 : Préparation modèle monétisation (état utilisateur & limites dynamiques)
- [ ] 11.2 : Correction navigation dynamique (tabs Maison/Alertes)
- [ ] 11.3 : Centralisation de la Navigation par Filtres (Vue "Vos données")
    - [✓] ✅ 11.3.a : Audit complet des points d'accès existants (Dashboard, Alertes, Famille)
    - [✓] ✅ 11.3.b : Définition du protocole de filtrage par URL (ex: `#/donnees?type=X&category=Y`)
    - [✓] ✅ 11.3.c : Refactorisation de `showView` dans `app.js` pour traiter la redirection vers `#/donnees` avec paramètres
    - [✓] ✅ 11.3.d : Généralisation de `renderDataInventory()` pour supporter les filtres optionnels
    - [✓] ✅ 11.3.e : Migration des liens UI : remplacer `data-open-view="documents-list?category=..."` par `data-open-view="donnees?type=document&category=..."`
    - [ ] 11.3.f : Gestion du retour arrière et du contexte utilisateur
    - [ ] 11.3.g : Nettoyage et suppression des vues de listes redondantes (documents-list)
### Phase 12 – Intégration Proactive & Vie Numérique
- [✓] ✅ 12.1 : Indexation Globale & Onboarding Utilisateur
    - [✓] ✅ 12.1.a : Complétion du profil utilisateur & préférences d'indexation.
    - [✓] ✅ 12.1.b : Demande et sécurisation des permissions système (Accès stockage local récursif).
    - [ ] 12.1.c : Mise en place du "Worker d'Indexation en Fond" (Background Sync)
        - [✓] ✅ 12.1.c.1 : Interface du Worker & structure du cycle de vie
        - [✓] ✅ 12.1.c.2 : Algorithme de parcours récursif des dossiers configurés
        - [✓] ✅ 12.1.c.3 : Gestion par lots (Batching) pour préserver l'UI
            - [✓] ✅ 12.1.c.3.a : Logique de partitionnement des fichiers en lots
            - [✓] ✅ 12.1.c.3.b : Traitement asynchrone par lot (lecture, parsing, indexation)
            - [✓] ✅ 12.1.c.3.c : Gestion de pause (yield) entre les lots
        - [✓] ✅ 12.1.c.4 : Traitement sélectif (Skip fichiers existants & Filter système)
        - [✓] ✅ 12.1.c.5 : Persistance (IndexedDB) & Feedback UI progressif
            - [✓] ✅ 12.1.c.5.a : UI de progression (Toast/Progress Bar)
            - [✓] ✅ 12.1.c.5.b : Hook de persistance IndexedDB
            - [✓] ✅ 12.1.c.5.c : Intégration du worker dans l'Onboarding
            - [✓] ✅ 12.1.c.5.d : Gestion des erreurs & Nettoyage
        - [✓] ✅ 12.1.d : Gestion intelligente de la mémoire (Traitement par lots, saut des fichiers verrouillés/protected).
        - [✓] ✅ 12.1.e : Retour utilisateur — Synthèse du "Ce qui a été trouvé" après le premier scan.
- [ ] 12.2 : Recherche Sémantique & Visualisation Photos (Assistant Vie Numérique)
    - [ ] 12.2.a : Extraction de métadonnées EXIF (dates/lieux sur les photos).
    - [ ] 12.2.b : Moteur de recherche "Moments de vie" (langage naturel : "Photos de Lorena 2 ans").
    - [ ] 12.2.c : Vue Galerie interactive + Timeline chronologique (Journal de bord).
    - [ ] 12.2.d : Assistant proactif (notifications intelligentes sur les documents indexés).

### Phase 13 – Refonte Complète du Parcours Nouvel Utilisateur (Onboarding & Expérience "Magique")
13.1 : Refonte du Flux d'Accueil en Mode "Wizard" (3 étapes fluides)
13.1.a : Remplacer l'écran d'accueil statique actuel par un parcours d'introduction en étapes courtes pour lever les freins psychologiques. ✅ Terminé - Onboarding wizard implémenté avec succès : structure HTML, logique JavaScript, styles CSS, initialisation au démarrage, gestion de la visibilité selon l'état firstRun/onboardingComplete. Voir app.js modifications.
13.1.b : Étape 1 — La Promesse & la Souveraineté : Expliquer clairement le principe "Zéro Serveur / 100% sur votre appareil" avant de demander la moindre action. ✅ Terminé — Message renforcé sur la souveraineté numérique et stylisation des boutons du wizard avec les classes unifiées (.primary-button / .secondary-button).
13.1.c : Étape 2 — L'Identité du Foyer : Demander rapidement le prénom de l'utilisateur et sa ville/code postal (nécessaire pour personnaliser les alertes et contrats d'assurance dès le départ). ✅ Terminé — Champs de saisie ajoutés au wizard, stockage dans state.js et synchronisation affichage profil/accueil lors du passage à l'étape 3.
13.1.d : Étape 3 — Le Choix d'Entrée : Proposer clairement une bifurcation entre l'essai immédiat (Démo) et l'utilisation réelle (Scan local). ✅ Terminé — Deux boutons d'action clairement identifiés avec les classes .primary-button / .secondary-button, implémentation de injectDemoDocuments() et launchIntelligentScan(), initialisation du foyer complet en mode démo ou démarrage du scan local progressif.
13.2 : Implémentation du Mode Démo Interactif et Instantané ("Explorer la démo")
13.2.a : Corriger le bouton "Explorer la démo" pour qu'il injecte instantanément les 5 documents fictifs de référence et initialise un foyer complet (équipements, alertes, membres). ✅ Terminé
13.2.b : Implémenter le Mode Démo avec message de bienvenue contextualisé et badge visuel :
    - [✓] ✅ 13.2.b.1 : Ajouter un badge visuel "Mode Démo" dans le `topbar` et un message de bienvenue dans le dashboard.
    - [✓] ✅ 13.2.b.2 : Gérer l'état de ce mode dans `state.js` via une variable `isDemoMode` pour le rendu conditionnel.
    - [✓] ✅ 13.2.b.3 : Afficher/masquer le badge dynamiquement selon cet état.
    - [✓] ✅ 13.2.b.4 : Correction disposition wizard — Adapter le CSS `.wizard-step` pour que les étapes s'affichent verticalement (`flex-direction: column`) et centrées sur l'écran.
    - [✓] ✅ 13.2.b.5 : Correction orthographique et cohérence du message — Correction de "Biencome" → "Bienvenue" dans `index.html` et affichage conditionnel du prénom dans le dashboard.
    - [✓] ✅ 13.2.b.6 : Enrichissement de la visite guidée — Étendue à 6 étapes pour inclure l'importation de documents, la gestion des membres de la famille et la vue des données.
    - [✓] ✅ 13.2.b.9 : **Correctif Mobile Onboarding** — Résolution des blocages sur smartphone HTTP : race condition activeView, timeout initState(), fallback crypto.subtle, amélioration CSS mobile. Documentation complète créée (docs/ONBOARDING_ARCHITECTURE.md) + skill onboarding-guard.
13.2.c : Implémenter une visite guidée automatisée ("Mode Vidéo Interactive") :
    - [✓] ✅ 13.2.c.1 : Enchaînement automatique (Recherche ➔ Maison ➔ Alertes ➔ Importer ➔ Famille ➔ Vos données) sans clic utilisateur après le lancement de la démo.
    - [✓] ✅ 13.2.c.2 : Toasts de progression animés pour jalonner chaque étape (Étape 1/6 à 6/6).
    - [✓] ✅ 13.2.c.3 : Restitution du contrôle à l'utilisateur à la fin du parcours.
    - [✓] ✅ 13.2.c.4 : Simuler des actions réelles (saisie de recherche, import de fichier, ajout membre, suppression données) pendant le parcours.
    - [✓] ✅ 13.2.b.7 : Onboarding sur page blanche (non inséré dans accueil) pour éviter affichage conditionnel prénom dashboard
    - [✓] ✅ 13.2.b.8 : Bannir les émojis, n'utiliser que SVG icons (conformément CLAUDE.md) - étape 3 onboarding
    - [✓] ✅ 13.2.c.5 : Enrichir démo avec explications fonctions : ajout membre écran Famille, lecture alerte écran dédié, changement équipement pour filtre auto, utilisation assistant-IA
    - [✓] ✅ 13.2.c.6 : Retour automatique à l'étape 3 onboarding après fin démo (pour replay ou bouton scan intelligent)
13.3 : Valorisation du Scan Proactif Local (Le "Moment Waouh")
13.3.a : Mettre en avant le Scan Local Intelligent (basé sur le BackgroundSyncWorker et local-files.js) comme la méthode principale et naturelle d'intégration des documents. ✅ Terminé — Bouton principal dans le wizard d'onboarding, interface de progression et résumé de classification automatique intégrés.
13.3.b : Créer une interface de progression visuelle engageante lors du premier scan (barre de progression animée, compteur de documents découverts en temps réel : "🔍 Analyse des dossiers Documents/Téléchargements..."). ✅ Terminé — Interface stylisée, animation fluide et barre de progression enrichie.
13.3.c : Intégrer la classification automatique des fichiers trouvés (factures, garanties, photos) directement dans le dashboard à la fin du scan. ✅ Terminé — Interface de mise à jour dynamique ajoutée, persistance IndexedDB et affichage toast au terme du scan.
13.4 : Synchronisation des États et Transition Fluide vers le Dashboard
13.4.b : Prévoir un bouton de réinitialisation ou de "mode découverte" dans les paramètres (Profil / Vos données) pour pouvoir relâcher/tester l'onboarding à volonté.
13.4.c : Gérer proprement la persistance de fin d'onboarding (localStorage / IndexedDB) pour qu'un utilisateur de retour ne voie plus l'assistant de configuration, mais accède directement à son tableau de bord.
13.5 : Tests d'Ergonomie et Polish Mobile / Web
13.5.a : Valider le parcours complet sur smartphone (responsive, cibles tactiles, fluidité des transitions d'étapes).
13.5.b : Vérifier l'absence d'erreurs de console et la robustesse des flux asynchrones (notamment si l'utilisateur refuse l'accès aux dossiers locaux ou annule une étape).

## 🛠 Framework des Skills - Implémentation Structurée
Cette section définit les skills techniques et domain spécifiques à mettre en place pour assurer la qualité, la cohérence UI et l'automatisation tout au long du projet Famili-IA.

### ✅ Skills Techniques - État d'avancement
| Skill | Statut | Description | Cas d'usage | Coché |
|-------|--------|-------------|-------------|-------|
| **update-config** | ✅ **Terminé** | settings.json créé avec attribution et permissions de base (`Bash(npm *)`, `Bash(git *)`, Read/Edit/Write) | Configuration de base, réduction prompts Capacitor, attribution git/pr | [x] |
| **fewer-permission-prompts** | ✅ **Terminé** | Allowlist des appels natives problématiques - 5 règles prioritaires validées | Gestion READ_EXTERNAL_STORAGE, notifications, accès Capacitor | [x] |
| **code-review** | ✅ **Terminé** | Qualité continue - revue medium effectuée, 4 findings identifiés et résolus | Détection régressions UI, respect charte graphique, standards architecture | [x] |
| **simplify** | ✅ **Terminé** | Nettoyage périodique du code - corrections Finding A-D appliquées, event delegation, async state loading | Refactoring composants, optimisation selectors, réduction technical debt | [x] |

### 🎯 Skills Domain Spécifiques
| Skill | Portée | Description |
|-------|--------|-------------|
| **artifact-design** | UI/UX | Maintenir la charte graphique (#0f7173, #2563eb, #059669, etc.) lors des nouvelles vues/pages |
| **workflow-authoring** | Automatisation | Workflows multi-étapes : lancement app, build Capacitor, tests de régression, génération rapports |
| **dataviz** | Analytics | Visualisation données familiales, graphiques équipements, stats alertes, KPI dashboards |

### Ordre d'Implémentation Recommandé
1. **Phase 0 - Setup** : `update-config` → configuration de base des settings.json ✅ **Déjà fait** (fichier créé avec attribution + permissions Bash)
2. **Phase 0 - Setup** : `fewer-permission-prompts` → allowlist des appels Capacitor critiques ✅ **Terminé** - 5 règles prioritaires validées et ajoutées à settings.json
3. **Qualité & Correction** : `code-review` → revue de niveau medium effectuée, 4 findings identifiés et résolus ✅ **Terminé**
   - Finding A résolu : bouton "ajouter membre" dans liste vide
   - Finding B résolu : chemin fragile dans test-sanity.mjs
   - Finding C résolu : listeners d'événements obsolètes supprimés
   - Finding D résolu : persistance IndexedDB correcte
4. **Qualité & Maintenance** : `simplify` → nettoyage effectué via corrections Finding A-D, delegation et async loading ✅ **Terminé**
5. **Avant commit** : `code-review` + validation `artifact-design` (charte graphique) ✅ **Workflow intégré** - Dans la checklist anti-régression existante
6. **Phase 10 (Lancement)** : `workflow-authoring` → scripts de test utilisateur automatisés ⏳ **Planification Phase 10** - Définir les workflows de test
7. **Phase 10 (Lancement)** : `dataviz` → visualisations pour rapports satisfaction/utilisateurs ⏳ **Planification Phase 10** - Graphiques/KPI pour rapports

### Intégration dans les Phases Existantes
- **Phase 7-9** : `code-review` comme étape finale avant commit (checklist anti-régression déjà présente)
- **Phase 8** (Sécurité) : Intégrer `security-review` dans la validation des consentements et chiffrement
- **Phase 9** (UI Polish) : Valider `artifact-design` pour chaque nouvelle vue/ composant
- **Toutes phases** : `fewer-permission-prompts` pour tout nouvel appel API native Capacitor

### Checklist Compétences par Phase
- **Avant tout commit** : ✅ `code-review` passé, ✅ `artifact-design` validé (si UI), ✅ `fewer-permission-prompts` à jour
- **Findings code-review (Phase 7-9)** : 4 findings identifiés lors de la revue de niveau medium - **TOUS RÉSOLUS** ✅
  1. [x] **Finding A** : app.js:1720 - Liste vide famille omet bouton "ajouter membre" → Corrigé : le bouton s'affiche toujours, même avec liste vide (return prématuré retiré)
  2. [x] **Finding B** : test-sanity.mjs:9 - Chemin relatif fragile → Corrigé : `path.resolve('.')` au lieu de `path.resolve('projets/famili-ia')`
  3. [x] **Finding C** : app.js:382 - Écouteurs d'événements sur éléments non-existent (filters chips) → Corrigé : supprimé listeners redondants `#filter-type, #filter-source`, la logique utilise maintenant `.chip.is-selected` dans `applyFilters()`
  4. [x] **Finding D** : app.js:1679 - Mutation directe d'objet module importé → Corrigé : remplacement par `import().then(() => initFamilyFromSaved(savedFamily()))` avec méthode officielle state.js
- **Règles de permission prioritaires (5 règles)** : Vérifier l'application des 5 règles ci-dessous dans `.claude/settings.json`
  1. [x] `Read(src/**, *.js)` - Lectures fichiers source JS ✅ Validé
  2. [x] `Edit(src/**, *.js)` - Modifications fichiers source JS ✅ Validé
  3. [x] `Read(**) `** - Lectures générales ✅ Validé
  4. [x] `Glob(**)` - Recherche globale de fichiers ✅ Validé
  5. [x] `Bash(npm *)`, `Bash(git *)` - Commandes npm/git ✅ Validé
- **Nouvelle feature** : Vérifier `update-config` si modification des permissions ou env vars
- **Nouvelle visualisation** : Appliquer `dataviz` si dashboard/statistiques impliquées