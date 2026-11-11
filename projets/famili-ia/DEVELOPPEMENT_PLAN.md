# Famili-IA – Plan de Développement

## 📊 Vue d'ensemble
- **Phase terminée** : Phase 14 – Refonte de la Vue "Vos Données" & Polish
- **Phase en cours** : Phase 15 – Assistant Vie Numérique, recherche multi-sources & préparation du modèle économique

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
- [✓] ✅ 11.3 : Centralisation de la Navigation par Filtres (Vue "Vos données")
    - [✓] ✅ 11.3.a : Audit complet des points d'accès existants (Dashboard, Alertes, Famille)
    - [✓] ✅ 11.3.b : Définition du protocole de filtrage par URL (ex: `#/vos-donnees?type=X&category=Y`)
    - [✓] ✅ 11.3.c : Refactorisation de `showView` dans `app.js` pour traiter la navigation vers `#/vos-donnees` avec paramètres
    - [✓] ✅ 11.3.d : Généralisation de `renderDataInventory()` pour supporter les filtres optionnels
    - [✓] ✅ 11.3.e : Migration des liens UI vers la vue unifiée `vos-donnees` avec filtres transmis dans l’URL.
    - [✓] ✅ 11.3.f : Gestion du retour arrière et du contexte utilisateur via l’historique navigateur (`popstate`).
    - [✓] ✅ 11.3.g : Suppression de l’ancienne vue de liste redondante `documents-list`.

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
    - Note : les travaux restant de cette sous-phase sont détaillés et replanifiés en 15.1 et 15.3 à 15.5 ; ils ne sont pas considérés comme réalisés.

### Phase 13 – Refonte Complète du Parcours Nouvel Utilisateur (Onboarding & Expérience "Magique")
- [✓] 13.1 : Refonte du Flux d'Accueil en Mode "Wizard" (3 étapes fluides)
    - [✓] 13.1.a : Remplacer l'écran d'accueil statique actuel par un parcours d'introduction en étapes courtes pour lever les freins psychologiques.
    - [✓] 13.1.b : Étape 1 — La Promesse & la Souveraineté : Expliquer clairement le principe "Zéro Serveur / 100% sur votre appareil".
    - [✓] 13.1.c : Étape 2 — L'Identité du Foyer : Demander rapidement le prénom de l'utilisateur et sa ville/code postal.
    - [✓] 13.1.d : Étape 3 — Le Choix d'Entrée : Proposer clairement une bifurcation entre l'essai immédiat (Démo) et l'utilisation réelle (Scan local).
- [✓] 13.2 : Implémentation du Mode Démo Interactif et Instantané ("Explorer la démo")
    - [✓] 13.2.a : Injection instantanée des documents de référence et initialisation du foyer complet.
    - [✓] 13.2.b : Mode Démo contextualisé (badge, message, state.js, correctif mobile HTTP, etc.).
    - [✓] 13.2.c : Visite guidée automatisée en 6 étapes (Recherche ➔ Maison ➔ Alertes ➔ Importer ➔ Famille ➔ Vos données).
- [✓] 13.3 : Valorisation du Scan Proactif Local (Le "Moment Waouh")
    - [✓] 13.3.a : Intégration du bouton principal de Scan Local Intelligent dans l'onboarding.
    - [✓] 13.3.b : Interface de progression visuelle engageante lors du premier scan.
    - [✓] 13.3.c : Classification automatique des fichiers trouvés.
- [✓] 13.4 : Synchronisation des États et Transition Fluide vers le Dashboard
- [✓] 13.5 : Tests d'Ergonomie et Polish Mobile / Web

### Phase 14 – Refonte de la Vue "Vos Données" (Priorité : UX & Clarté)
L'objectif est d'améliorer la visibilité, la gestion et la compréhension des données indexées localement.

- [✓] **14.1 : Architecture & Navigation**
    - [✓] ✅ 14.1.a : Nettoyage et consolidation des interfaces de gestion des données (remplacement des vues de listes redondantes par l'accès à l'inventaire central).
    - [✓] ✅ 14.1.b : Vue "Vos Données" (`data-view`) unifiée pour afficher les fichiers locaux et les sources (Drive/simulé), avec aperçu et dédoublonnage.
    - [✓] ✅ 14.1.c : Filtres dynamiques par hash URL, compatibilité avec les anciens liens catégorie et restauration de l’état via Retour navigateur.

- [✓] **14.2 : Expérience Utilisateur (UX)**
    - [✓] ✅ 14.2.a (14.4) : Refonte visuelle de « Vos données » alignée sur les tokens de marque partagés, les cartes de synthèse, la hiérarchie responsive et la charte mise à jour.
    - [✓] ✅ 14.2.b (14.5) : Badges visuels pour le type, la provenance et la couverture d'indexation (texte indexé ou métadonnées seules).

- [✓] **14.3 : Fonctionnalités & Sécurité**
    - [✓] ✅ 14.3.a (14.6) : Suppression confirmée des données applicatives en IndexedDB et du foyer personnalisé en localStorage ; les scans actifs sont arrêtés et les fichiers sources restent intacts.
    - [✓] ✅ 14.3.b (14.7) : Filtres de type/provenance partagés avec la recherche unifiée et compatibilité des filtres d'inventaire/anciens liens vérifiée.

### Phase 15 – Assistant Vie Numérique & Préparation du modèle économique
Cette phase reprend les travaux encore ouverts de l'ancienne 12.2 et améliore les fonctions qui donnent une valeur régulière à Famili-IA, en commençant par un audit des capacités réelles. Le traitement des documents et photos reste local par défaut. Les offres Essentiel et Sérénité sont retenues comme hypothèses de travail fournies par l'utilisateur, à réexaminer plus tard ; le prix de 4,99 €/mois est un prix de test, pas un tarif définitif. La qualité de recherche utile ne sera pas artificiellement réservée à l'offre payante. Tout composant serveur, fournisseur de paiement ou accès natif spécifique est conditionné à une étude de faisabilité, de confidentialité et de conformité.

#### 15.0 – Audit initial de l'intelligence produit
- [✓] 15.0.a : Examiner l'implémentation, la documentation et les tests existants pour la recherche documentaire, les alertes domestiques et les photos ; consigner les capacités, écarts et limites dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md).
- [✓] 15.0.b : Exécuter les tests ciblés existants et établir un ordre de priorité ainsi que les mesures de qualité à ajouter ; l'audit est un état statique initial, sans prétendre mesurer la précision sur un corpus réel.

#### 15.1 – Alertes domestiques fiables et explicables
- [✓] 15.1.a : Constituer des cas de test fictifs pour garanties, contrats, factures et entretiens ; préciser pour chaque alerte la source, la date, le niveau de confiance et le résultat attendu.
- [✓] 15.1.b : Fiabiliser l'extraction et la validation des dates : distinguer échéance, date d'achat et autres dates, traiter les formats pris en charge et ne pas créer d'alerte sur une date invalide ou non explicitement libellée.
- [✓] 15.1.c : Unifier les règles de seuil et d'affichage, dédupliquer les alertes et rendre leur synchronisation idempotente au démarrage et après ajout/suppression d'un document.
- [✓] 15.1.d : Associer les alertes documentaires à un extrait source et à un niveau de confiance ; n'afficher ces preuves que lorsqu'elles existent.
- [✓] 15.1.e : Définir et implémenter le cycle de vie réversible d'une alerte : active, ignorée ou terminée, avec réactivation et persistance.
- [✓] 15.1.f : Ajouter la correction manuelle des dates (avec preuve et source confirmées), la désactivation des notifications par catégorie, le report réversible, un plafond quotidien et des plages silencieuses configurables.
- [✓] 15.1.g : Demander la permission de notification seulement après une action explicite ; dédupliquer les notifications par échéance et ne pas exposer de détail documentaire sur l'écran verrouillé.
- [✓] 15.1.h : Documenter les différences Web/PWA, push et notifications locales natives, les permissions et limites d'arrière-plan, ainsi que l'absence actuelle de service worker, de serveur push et du plugin Capacitor local dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md).
- [✓] 15.1.i : Mesurer précision, échéances manquées, alertes sans preuve, doublons et répétitions sur un corpus fictif annoté de huit cas ; les résultats sont des tests de base synthétiques, pas une mesure de qualité en production, et aucune économie n'est revendiquée.

#### 15.2 – Recherche documentaire pertinente et traçable
- [✓] 15.2.a : Constituer un corpus local fictif de sept documents et neuf requêtes réalistes (synonymes, fautes, questions factuelles, ambiguïté et absence de réponse), avec résultats et extraits attendus dans `tests/search-corpus.js`.
- [✓] 15.2.b : Mesurer précision/rappel à 3 résultats, MRR, exactitude des faits, abstention correcte, réponses non étayées, couverture des sources et temps moyen sur le corpus annoté.
- [✓] 15.2.c : Comparer le classement lexical seul, le score pondéré par métadonnées et le classement hybride à synonymes locaux ; retenir le classement déterministe hybride, sans embeddings, modèle distant ni nouvelle dépendance.
- [✓] 15.2.d : Présenter les réponses factuelles avec document et extrait justificatif ; afficher l'incertitude en cas de résultats contradictoires, et s'abstenir si un fait ou une preuve manque.
- [✓] 15.2.e : Maintenir les mêmes capacités de recherche pour tous les utilisateurs, sans quota fonctionnel ni verrouillage payant ; conserver la différenciation Sérénité pour la continuité, les rappels, la synchronisation et le partage.

#### 15.3 – Photos : accès, extraction et stockage des métadonnées
- [✓] 15.3.a : Décider du périmètre des sources par plateforme (sélection explicite de fichiers Web, sélecteur système, Capacitor/natif) et vérifier permissions, formats, limites, fonctionnement hors ligne et capacités réelles des API avant engagement produit ; décision et limites consignées dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md) et [la documentation d'intégration](docs/architecture/integration.md).
- [✓] 15.3.b : Comparer les parseurs EXIF, retenir `exifr` (MIT, navigateur/Node, sans dépendance runtime) pour JPEG/PNG et documenter les champs utiles et limites dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md) ; le parseur est intégré localement au flux photo en 15.3.d et validé sur le corpus en 15.3.e.
- [✓] 15.3.c : Définir et implémenter `photoMetadata` versionné et lié par `documentId` : date locale normalisée avec offset éventuellement inconnu, provenance par champ, orientation, dimensions, appareil facultatif, localisation omise/effacée et empreinte SHA-256 ; ajouter validation explicite, détection des doublons exacts, fusion idempotente et migration v0→v1 dans `photo-metadata.js`, documentées dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md).
- [✓] 15.3.d : Extraire localement un ensemble ciblé de métadonnées via `exifr` ; ajouter un consentement GPS distinct, désactivé par défaut, dont le retrait efface les coordonnées persistées ; ne jamais exporter les coordonnées GPS par défaut et n'embarquer aucun EXIF dans les aperçus textuels, comme documenté dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md).
- [✓] 15.3.e : Fixtures EXIF et tests ajoutés (métadonnées absentes, dates/fuseaux, rotations, GPS, fichiers invalides, PNG et limites de taille) ; mesures Node et Chromium sur 15 photos réelles non sensibles, couvrant trois groupes d'appareils. La limite photo a été portée à 10 Mio pour inclure ce corpus ; résultats et limites consignés dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md). Le profilage sur appareils mobiles reste à faire avant un engagement de performance mobile.

#### 15.4 – Recherche « Moments de vie »
- [✓] 15.4.a : Définir 12 cas de requêtes et un corpus de métadonnées synthétiques couvrant personne, période de prise/import, âge et limites calendaires, lieu facultatif annoté manuellement, événements, fuseau inconnu, ambiguïtés et absence de résultat ; fixer les critères précision@5, rappel@5, MRR, filtres exacts et abstention dans [l'audit de la phase 15](docs/architecture/phase-15-intelligence-audit.md). Pas de photos réelles, coordonnées ni reconnaissance faciale dans ce jeu d'évaluation.
- [✓] 15.4.b : Implémenter dans `moments-life-query.js` une interprétation locale et explicable en filtres structurés ; distinguer date de prise de vue, date d'import et date de naissance, et demander une précision si nécessaire. Les 12 requêtes synthétiques sont vérifiées dans `tests/moments-life-query.test.js`.
- [✓] 15.4.c : Permettre l'association volontaire d'une photo à des membres/événements depuis l'inventaire, avec date de naissance facultative et validation calendaire ; persister localement les annotations et supprimer le lien d'un membre supprimé. Aucune identité n'est déduite par reconnaissance faciale.
- [✓] 15.4.d : Implémenter dans `moments-life-search.js` une recherche locale déterministe sur dates, associations explicites, lieux saisis et événements, avec classement chronologique et explication des critères. Le corpus 15.4.a dépasse ses seuils synthétiques ; aucun embedding/modèle n'est ajouté avant comparaison, mesures sur appareils cibles et contrôle du stockage.
- [✓] 15.4.e : Présenter les filtres exacts, la provenance, le contexte et un niveau de confiance explicable ; signaler les données manquantes/incertaines, proposer de corriger les associations et la date locale, puis relancer la recherche. Tester les résultats absents, corrections et absence de réseau ; aucune requête/photo n'est envoyée à un service externe.

#### 15.5 – Galerie et timeline chronologique
- [✓] 15.5.a : Concevoir les vues Galerie et Journal de bord, les états vides/chargement/erreur, les filtres par personne/date/lieu et le parcours depuis une photo vers son fichier d'origine ; consigner la conception et ses dépendances dans [la conception Galerie et Journal de bord](docs/architecture/phase-15-photo-gallery-design.md).
- [✓] 15.5.b : Générer des vignettes locales orientées correctement (WebP/JPEG, 320 px et 48 Kio max., décodages limités à deux en parallèle), les persister avec les documents, charger les aperçus à proximité de l'écran, paginer les résultats par 24 et libérer les ressources à la sortie ; documenter les limites et choix dans [la conception Galerie et Journal de bord](docs/architecture/phase-15-photo-gallery-design.md).
- [✓] 15.5.c : Ajouter le regroupement des résultats photo par jour/mois/événement ; valider les dates locales, distinguer les dates estimées, signaler les fuseaux EXIF inconnus et ne jamais déplacer silencieusement les images via une conversion de fuseau ; documenter les règles dans [la conception Galerie et Journal de bord](docs/architecture/phase-15-photo-gallery-design.md).
- [✓] 15.5.d : Ajouter navigation clavier/tactile accessible, aperçu détaillé, sélection multiple et suppression des seules données Famili-IA, en préservant les originaux ; documenter les limites et choix dans [la conception Galerie et Journal de bord](docs/architecture/phase-15-photo-gallery-design.md).
- [✓] 15.5.e : Valider le parcours sur tailles d'écran représentatives et une bibliothèque de 1 000 photos ; vérifier défilement/pagination, limites mémoire de rendu, débordement mobile, accessibilité clavier et exactitude des aperçus ; consigner les résultats et limites matérielles dans [la conception Galerie et Journal de bord](docs/architecture/phase-15-photo-gallery-design.md).

#### 15.5bis – Recherche et indexation intelligentes multi-sources

**Cible produit :** faire de Famili-IA le point d'accès permettant de rechercher et retrouver des documents et photos répartis sur les appareils et services autorisés, sans devoir connaître leur emplacement. Toutes les sources ci-dessous font partie de la cible : leur réalisation doit être tentée et planifiée, mais leur mise en production dépend des API, permissions, validations fournisseur et capacités des plateformes. Une source indisponible ne doit jamais être présentée comme opérationnelle.

L'index doit exploiter les métadonnées et le contenu effectivement accessibles afin de classer les éléments, retrouver leur source et leur date, conserver des extraits ou faits utiles et alimenter les alertes. Il ne peut pas déduire le contenu jamais accessible. La couverture, la fraîcheur et les incertitudes sont visibles. Les originaux restent dans leur source, sauf import ou copie explicitement choisi ; index, extraits et vignettes sont eux-mêmes des données personnelles dont la conservation, la suppression et la synchronisation doivent être expliquées.

Le traitement et l'index sont locaux par défaut ; toute synchronisation ou transmission à un service externe exige une décision d'architecture et une information distinctes. Les acquis de 15.1 à 15.5 sont réutilisés et leurs statuts restent inchangés. Les parcours existants sont à préserver ou à migrer explicitement et à tester.

### Plan d'action opérationnel 15.5bis

**Comment suivre ce plan :** les lots ci-dessous donnent l'ordre de travail et les cases décrivent les actions concrètes. Les sections 15.5bis.0 à 15.5bis.13 restent le référentiel des exigences globales : une action cochée ici ne valide pas automatiquement une exigence plus large. Un lot est terminé lorsque toutes ses cases et son critère de sortie sont satisfaits ; consigner la date, les tests et les limites dans la documentation. Une étude peut révéler un blocage fournisseur : le documenter, sans annoncer la source comme disponible.

**Acquis au 9 novembre 2026**
- [✓] Scénarios, couverture, contrat proposé et prototypes d'index, recherche et échéances sourcées réalisés ; la cible complète reste à construire.
- [✓] Google Drive Web : sélection `drive.file`, recherche après rechargement et indexation sur smartphone confirmées par l'utilisateur. Un cas passant a aussi confirmé révocation, conservation de la copie, purge globale et conservation de l'original ; les formats et l'annulation restent à préciser.
- [✓] OneDrive personnel Web raccordé avec parcours volontaire interruptible, TXT/Markdown et PDF texte bornés, autres formats en métadonnées seules ; indexation sur smartphone confirmée par l'utilisateur. Les détails des formats et du cycle de révocation et suppression restent à préciser.
- [✓] Recherche expérimentale des noms et segments vérifiés sur les copies présentes, avec source et extrait ; propositions d'échéances à vérifier, sans création d'alerte par ce parcours.
- [✓] Lot B : 262 tests Node, build Vite et huit tests navigateur ciblés réussis le 9 novembre 2026 ; la suite Playwright complète reste à exécuter. L'audit npm reste à réévaluer avant pilote.

**Lot C en cours — socle expérimental livré, sortie complète non déclarée.** Fiches durables `1.1.0`, migration IndexedDB v2→v3 reprenable, retour arrière applicatif non destructif, faits sourcés rechargés après redémarrage, filtrage des faits quand la provenance devient invalide, déduplication sans fusion et corpus fictif mesuré. Le lecteur DOCX et l'indexation sont validés dans Node et Chromium avec un fichier OOXML synthétique. Le 10 novembre 2026, l'utilisateur confirme sur une tablette Android la réussite des essais OCR demandés avec une image et un PDF scanné fictifs. Essais sur fichiers Word représentatifs, extraction générale et politique complète de conservation restent ouverts. Le lot B est terminé pour le périmètre expérimental actuel ; local et Google Drive restent sans actualisation, et les suppressions/pertes d'accès OneDrive ne sont pas déduites. Le lot A garde la réévaluation de l'audit npm comme préalable au pilote. Ne pas partager d'identifiants, de jetons ou de documents personnels.

**Lot D en cours — filtres et rapprochement validés, alertes en intégration contrôlée :** la recherche expérimentale applique des filtres exacts par source, type, couverture, nature/période de date, personne annotée et lieu annoté ; groupe les résultats à noms normalisés ou empreintes identiques sans fusionner les copies ; et affiche explicitement la dernière vérification, inconnue si elle n'est pas enregistrée. Le 10 novembre 2026, l'utilisateur confirme la réussite des essais demandés avec données fictives de plusieurs sources. Une proposition d'échéance vérifiée peut désormais devenir une alerte uniquement après confirmation explicite ; l'intégration complète des sources et du cycle de vie des alertes, la fraîcheur réelle et l'évaluation sur corpus annoté restent à traiter.

#### Lot A — Valider les parcours Web déjà raccordés
**Objectif :** disposer de deux parcours cloud expérimentaux dont le fonctionnement et les limites sont vérifiés de bout en bout. Références : 15.5bis.5.a, .6.a–c, .9.b, .13.a–b.

- [✓] Compte(s) de test et corpus fictif utilisés pour les validations réelles Google Drive et OneDrive, confirmés par l'utilisateur le 9 novembre 2026. Les identifiants, appareil et navigateur ne sont pas consignés.
- [✓] Google Drive : essais réels confirmés par l'utilisateur le 9 novembre 2026 ; sélection de documents TXT/PDF, recherche par mots-clés, suppression et révocation réussies. L'utilisateur indique que tous les tests prévus ont réussi ; appareil et navigateur non précisés. Détails dans [l'étude Drive](ETUDE_GOOGLE_DRIVE.md#validation-du-parcours-actuel).
- [✓] Cas passant Google Drive sur smartphone : révocation, copie conservée, purge globale et original préservé, confirmés par l'utilisateur. Ce test n'établit pas le format ni l'annulation et ne constitue pas un test de suppression sélective.
- [✓] OneDrive : tests réels avec compte et corpus fictifs confirmés par l'utilisateur le 9 novembre 2026, incluant la configuration et les scénarios prévus : consentement `Files.Read`, absence de scan avant l'action, dossiers/pages, textes/PDF, métadonnées seules et recherche après rechargement. L'appareil et le navigateur ne sont pas précisés ; voir [l'étude OneDrive](ETUDE_ONEDRIVE.md).
- [✓] OneDrive : l'utilisateur confirme également la réussite des tests d'arrêt et conservation des copies partielles, reconnexion, déconnexion locale, révocation Microsoft et suppression des copies sans suppression des originaux. Le détail de chaque manipulation n'est pas consigné.
- [✓] OneDrive : l'utilisateur confirme la réussite des tests de refus de consentement, expiration/indisponibilité, erreur réseau et nouveau lancement. Les formats et configurations précis ne sont pas détaillés dans le compte rendu.
- [✓] Tests automatisés ciblés, suite Node et build : 260 tests Node, compilation Vite et 13 tests Playwright pertinents réussis le 9 novembre 2026. Les scénarios réels et simulés sont distingués dans les études des sources.
- [ ] Refaire l'évaluation des vulnérabilités npm signalées, décider des mesures adaptées et documenter tout risque restant avant pilote.
- [✓] Audit npm : quatre dépendances signalées, dont `xlsx` en production (risque élevé, aucun correctif proposé par npm) et trois dépendances transitives de l'outillage Capacitor (risque modéré). Éviter les classeurs non fiables en attendant un remplacement ou une mise à niveau évaluée ; ne pas appliquer `npm audit fix` à l'aveugle. Voir [état et capacités](docs/architecture/etat-et-capacites-sources.md#audit-des-dépendances).
- [✓] Validation automatisée du 9 novembre 2026 : 260 tests Node, build Vite et 13 tests Playwright ciblés réussis. Parcours navigateur exécutés avec identifiant Microsoft synthétique, authentification et réponses Graph simulées ; aucune connexion réelle. Cela ne valide pas les comptes de test, formats et opérations réelles demandés ci-dessus ; l'audit actuel des dépendances reste à refaire.

**Sortie :** parcours testés sur comptes et données fictives, résultats et écarts documentés ; aucune promesse de synchronisation, de reprise durable ou d'accès continu aux originaux. Un blocage identifié est enregistré avec sa prochaine action, pas marqué comme validé.

#### Lot B — Fiabiliser les sources déjà disponibles
**Objectif :** maintenir la cohérence des données indexées et rendre les opérations compréhensibles. Prérequis : résultats du lot A ; références : 15.5bis.1.b–d, .4.a, .5.c, .6.b–c, .13.b.

- [✓] Définir les identités, périmètres et limites observables des imports locaux, Google Drive et OneDrive ; documenter les conséquences d'un changement de compte et les limites de réidentification.
- [✓] Documenter ces capacités et afficher les limites dans l'état des sources ; réidentification locale et changement de compte Drive non disponibles, donc aucune actualisation de ces sources.
- [✓] Pour les nouvelles copies OneDrive, conserver l'empreinte SHA-256 pseudonymisée du compte d'origine et distinguer deux comptes après déconnexion/reconnexion ; ne jamais conserver l'identifiant MSAL en clair. Les copies historiques sans empreinte restent non attribuées et non actualisées ; l'empreinte ne prouve pas l'accès actuel.
- [✓] Actualisation OneDrive manuelle après parcours complet : différencier les éléments nouveaux, inchangés, modifiés et à version inconnue. Une absence, une erreur, un refus d'accès ou une interruption ne prouve pas une suppression ni une perte d'accès. Actualisation automatique locale/Drive, détection certaine des suppressions et déplacements hors périmètre.
- [✓] Présenter les changements OneDrive par élément, décochés par défaut ; confirmer avant remplacement et préserver les annotations photo saisies. En cas d'échec de lecture, la copie précédente et son contenu restent conservés. Les copies historiques sans empreinte ne sont pas attribuées ni remplacées.
- [✓] Tester pagination, arrêt, 429 et 403 ; conserver les résultats partiels, afficher l'erreur et permettre une nouvelle action depuis le début. L'expiration/reconnexion a aussi été confirmée manuellement par l'utilisateur dans le lot A. Les curseurs ne sont pas persistés ; la reprise durable reste hors du parcours expérimental.
- [✓] Conserver les corrections reconnues et les copies en cas d'échec ; distinguer déconnexion locale, révocation fournisseur et suppression des copies Famili-IA. La purge concurrente attend l'arrêt du parcours et ne supprime jamais les originaux.
- [✓] Tester deux comptes, changement de version/contenu, renommage par comparaison, élément omis, accès refusé et purge concurrente ; les déplacements ne sont pas suivis séparément faute de chemin fournisseur conservé. Matrice mise à jour dans [l'état des capacités](docs/architecture/etat-et-capacites-sources.md).

**Sortie atteinte le 9 novembre 2026 pour les capacités expérimentales disponibles :** OneDrive ne remplace qu'après revue et confirmation ; aucune absence, interruption ou erreur ne supprime une copie. Les sources locale et Drive, la reprise durable, la détection des suppressions/déplacements et l'accès continu aux originaux sont explicitement hors périmètre. Tests automatisés avec comptes et données synthétiques ; aucune connexion réelle pour ces tests.

#### Lot C — Construire l'index durable et l'analyse utile
**Objectif :** passer des copies et fiches expérimentales à un modèle commun durable, explicable et compatible avec les données existantes. Prérequis : règles d'identité du lot B ; références : 15.5bis.2, .3.

- [ ] Spécifier les fiches document/photo, identités, dates et leur nature, couverture, provenance, preuves, corrections et durée de conservation ; définir les données manquantes et l'incertitude.
- [ ] Concevoir une migration versionnée IndexedDB avec stratégie de retour arrière ; tester anciennes données, interruption, reprise et suppression des seules données Famili-IA.
- [ ] Raccorder découverte, extraction et indexation pour les formats déjà disponibles ; ajouter ou adapter Word, Excel et OCR après vérification par plateforme, en conservant les métadonnées lorsque le contenu est illisible.
- [ ] Extraire et classer les faits utiles avec preuve ou abstention : type, émetteur, dates, montants, équipements et échéances ; réutiliser les métadonnées et annotations photo existantes sans inventer personnes ou lieux.
- [ ] Détecter les doublons exacts par empreinte lorsqu'elle existe ; proposer les rapprochements incertains sans fusion automatique et préserver les corrections lors des réindexations.
- [ ] Constituer un corpus fictif annoté ; mesurer couverture, extraction et classification, erreurs, temps et mémoire ; comparer les règles et les solutions locales avant tout modèle supplémentaire ou traitement distant.

**Sortie :** migration et retour arrière testés ; recherche et preuves restent correctes après redémarrage, réindexation et suppression ; limites de formats et mesures publiées.

#### Lot D — Achever la recherche multi-sources et les alertes
**Objectif :** retrouver et exploiter une information sourcée, pas seulement afficher un nom. Prérequis : modèle et preuves du lot C ; références : 15.5bis.9–10.

- [✓] Ajouter à la recherche expérimentale des filtres par source, type, couverture, nature et période de date, personne annotée et lieu annoté ; valeurs inconnues exclues plutôt que déduites. La validation intégrée est synthétique et ne clôt pas la validation multi-sources utilisateur.
- [✓] Afficher raison, extrait, nature de date, couverture, dernière vérification (ou « inconnue ») et accès observé ; proposer la copie conservée ou expliquer comment retrouver l'original, dont l'ouverture n'est pas disponible dans ce parcours.
- [✓] Regrouper les résultats correspondants par empreinte identique ou nom normalisé, tout en affichant chaque copie et sa source séparément ; aucune fusion n'est faite.
- [✓] Définir la confirmation explicite et les règles de création d'alertes à partir de faits vérifiables ; le parcours contrôle copie, identité, preuve, date et catégorie prise en charge, puis conserve source et extrait sans convertir une ambiguïté en alerte.
- [ ] Réévaluer les alertes lors des changements ou pertes d'accès et préserver corrections, reports et choix utilisateur ; tester dates ambiguës, doublons, révocations et suppressions.
- [ ] Mesurer précision, rappel, qualité des extraits et temps sur le corpus multi-sources ; documenter les cas d'abstention et les régressions.

- **Réalisé partiellement :** filtres exacts locaux/Drive/OneDrive, fraîcheur indiquée sans supposer de contrôle récent, rapprochements visibles sans masquer les sources, et conversion en alerte après confirmation seulement pour une date prouvée, une copie persistée unique et une catégorie admissible. Les résultats d'une source absente de l'instantané ne sont pas ajoutés au groupe ; la gestion de changements/pertes d'accès et la fraîcheur réelle restent ouvertes.
- **Validation automatisée :** 289 tests Node, build Vite et 8 tests navigateur ciblés réussis avec données synthétiques ; création d'alerte, provenance, annulation, date de fin en phrase et estimation achat+durée avec confirmation sont testées dans le navigateur. Les essais manuels de recherche multi-sources et le parcours d'alerte sourcée (date explicite et estimation, alertes visibles dans l'écran dédié) sont confirmés par l'utilisateur le 10 novembre 2026. La comparaison sur corpus annoté et les cas de source indisponible/index périmé restent ouverts.

**Sortie :** recherche sur au moins deux sources validées et corpus mesuré ; alertes sourcées testées avec cas incertains et corrections conservées.

#### Lot E — Rendre le parcours compréhensible et accessible
**Objectif :** permettre de découvrir, connecter et rechercher sans ambiguïté. Références : 15.5bis.11 et .13.a–b ; peut progresser en parallèle des lots C et D.

- [ ] E1 — Poser des composants et jetons visuels réutilisables (boutons, cartes, icônes, champs et modales), inspirés de la maquette ; les adopter progressivement dans les vues sans modifier leurs fonctions. Première tranche : accueil, personnalisation et choix du parcours d'onboarding.
- [✓] Première tranche E1/E2 : accueil, personnalisation et choix du parcours restylés ; illustration et logo corrigés, premiers styles partagés, libellé de champ et focus des titres. Tests navigateur ciblés à 390, 768, 1280 et 1920 px, cibles tactiles et annulation simulée ; accessibilité complète et harmonisation des autres vues restent ouvertes.
- [✓] Socle E1 : boutons primaire, secondaire et texte, champ texte et libellé partagés documentés ; adoption dans l'onboarding et pour le rejeu depuis le profil. Première modale partagée appliquée aux extraits documentaires. Restent les autres types de champs et la migration progressive des vues et modales.
- [✓] Modale de choix des sources harmonisée avec le socle et les icônes SVG fournies. L'accès aux exemples, précédemment inactif car son ancienne modale était absente, ouvre la démo isolée sans importer de données. Sélecteurs locaux, focus, états OneDrive simulés et préservation de données fictives testés ; comptes réels et autres modales non revalidés.
- [✓] Validation complémentaire ciblée : les deux tests de recherche attendaient insuffisamment l'initialisation de la base et la fin de l'indexation locale en arrière-plan. Après synchronisation des tests, les cinq scénarios de recherche et les trois tests de modale passent ; les deux scénarios précédemment en échec passent aussi trois fois chacun. Cela ne valide pas toute la suite ni les parcours sur appareils réels.
- [ ] E2 — Finaliser le parcours d'accueil : progression compréhensible, navigation et focus accessibles, prénom facultatif, illustration adaptée aux écrans et choix explicite entre démo et données personnelles.
- [ ] E3 — Revoir la démo : exemples fictifs clairement identifiés, scénarios facture, contrat et photos, mise en évidence des actions et résultats, étapes guidées rejouables ou ignorables. Ne jamais automatiser une permission ni une connexion réelle.
  - Avancement E2/E3 (non coché, validation manuelle attendue) : progression « Étape N sur 3 » sur l'accueil, Entrée valide le prénom facultatif, guide de démo en 3 étapes (la dernière rappelle l'absence d'alerte sans confirmation et met « Terminer » en évidence), textes photos corrigés ; 56 tests Playwright onboarding/démo/accessibilité passent. La visite des vues est implémentée et testée ci-dessous. Restent : essais sur appareils réels et contrastes.
  - Avancement visite des vues (non coché, validation manuelle attendue) : visite facultative en six étapes accessible depuis le profil et proposée à la fin de la démo ; navigation non modale, lecture seule, sans connexion ni permission, avec retour au point de départ. Tests Playwright ajoutés pour les quatre largeurs, clavier, rejeu, sortie, navigation manuelle et absence d'écriture/d'appels externes. Restent les essais manuels, notamment sur tablette, et la validation des contrastes.
- [✓] Démo d'onboarding rejouable : trois exemples fictifs affichés sans écriture de données applicatives ni connexion ; rejeu depuis le profil sans effacement de la progression. Tests de conservation avec documents, famille, équipements et alertes fictifs. La visite guidée des autres vues est décrite dans l'avancement E2/E3 ci-dessus ; sa validation manuelle reste ouverte.
- [✓] Premier guide E3 dans la démo : deux étapes facultatives, mise en évidence de la question puis du résultat et de sa provenance, progression automatique après sélection, retour et rejeu. Les exemples restent fictifs et libres d'accès ; la visite guidée des autres vues est décrite dans l'avancement E2/E3 ci-dessus.
- [✓] Scénario de contrat d'habitation ajouté à la démo, distinct de la garantie existante ; échéance et source explicitement fictives, aucune alerte créée. Test navigateur aux quatre largeurs de référence ; la visite guidée des autres vues est décrite dans l'avancement E2/E3 ci-dessus.
- [ ] E4 — Unifier les recherches documents et photos dans un seul formulaire multi-sources, en conservant les preuves et les fonctions photo de gestion. Ne pas présenter les annotations explicites comme une reconnaissance visuelle ni promettre une couverture complète des sources.
  - Avancement E4 (non coché, validation manuelle attendue) : un formulaire unique interroge `IndexSession` pour documents et photos ; l'adaptateur `unified-index-query.js` réutilise l'interpréteur Moments pour produire les filtres photo exacts, y compris événement et date d'import. Les résultats photo conservent vignettes, pagination, détails, corrections et suppression confirmée, mais ne relancent pas un moteur distinct. Les modes question/Moments et le raccourci photo dans Vos données ont été retirés. Les requêtes ambiguës et les incohérences avec les profils ou filtres sont explicites ; aucun contenu, requête ou annotation n'est transmis à un service externe. Aucun historique persistant de recherche n'existe dans le code ; il reste hors périmètre initial. Tests ciblés et essais manuels de l'unification restent à exécuter avant validation.
- [ ] E5 — Harmoniser progressivement accueil, données, foyer, alertes et modales avec les composants partagés ; vérifier les parcours existants et les appareils à chaque migration.
- [ ] Organiser l'accueil autour de la recherche et proposer une démo sans permission distinguant clairement sources et données fictives.
- [ ] Expliquer avant connexion les permissions, données lues et conservées, copies et originaux ; afficher progression, limites, erreurs et actions de déconnexion/suppression disponibles.
- [ ] Tester les trois scénarios fictifs facture, contrat et photos, puis une première recherche personnelle sur données de test ; conserver les accès utiles au foyer et aux alertes.
- [ ] Vérifier clavier, ARIA, contrastes et mouvement réduit ; cibles tactiles ≥ 48 × 48 px, absence de débordement à 390 et 768 px, rendu à 1280 et 1920 px.
  - Réalisé (non coché) : cibles ≥ 48 px, noms accessibles, absence de débordement, focus visible et mouvement réduit sur les neuf écrans aux quatre largeurs, via `tests/accessibility-audit.spec.js`. Restent : mesure des contrastes, modales et états dynamiques, lecteur d'écran et appareils réels.
- [ ] Automatiser les transitions et refus de permission avec Playwright ; consigner résultats, plateformes et limites.

**Sortie :** parcours de démo et de première recherche vérifiés, mesures d'accessibilité et tests navigateur documentés.

#### Lot F — Étendre les connecteurs et les appareils
**Objectif :** poursuivre toutes les sources de la cible sans supposer qu'elles offrent les mêmes droits. Références : 15.5bis.4, .5.b–c, .6, .7–8. Études fournisseurs à engager tôt, en parallèle ; intégration après validation de leurs prérequis et avec le socle des lots B–C.

- [ ] Google Drive étendu : vérifier éligibilité et exigences Google, périmètre, sécurité, délais et coûts ; prototyper seulement selon les autorisations obtenues. Conserver le parcours Picker limité si l'accès étendu n'est pas autorisé.
- [ ] OneDrive : étudier séparément comptes professionnels/scolaires et parcours natifs, politiques d'organisation et permissions ; implémenter et tester seulement après validation du périmètre.
- [ ] Dropbox : choisir et expliquer les niveaux d'accès, implémenter connexion, lecture et états, traiter quotas et changements ; préparer l'approbation de production.
- [ ] Local Web/ordinateur et Android : tester sélecteurs, accès persistants, reprise, permission perdue et originaux ; étudier un compagnon ordinateur si nécessaire et valider sur appareils Android réels.
- [ ] iOS/iCloud Drive et Photos Apple : créer la cible, étudier sélecteurs et photothèque autorisée, éléments distants et limites de permissions ; tester sur appareils et ne pas annoncer d'API cloud générale non établie.
- [ ] Google Photos : demander la confirmation d'éligibilité du cas d'usage et étudier la sélection et l'expiration des accès ; ne pas engager de production sans réponse favorable.
- [ ] Pour chaque source ajoutée, livrer configuration, permissions, formats, indexation, recherche, erreurs, déconnexion/suppression, tests et matrice des capacités ; consigner tout blocage fournisseur et son alternative.

**Sortie :** chaque source est soit testée sur son périmètre et documentée, soit explicitement bloquée avec preuve et prochaine démarche ; aucun connecteur indisponible n'est présenté comme opérationnel.

#### Lot G — Relier les appareils avec consentement
**Objectif :** rechercher entre appareils sans transfert implicite de données sensibles. Prérequis : index durable et politique de conservation du lot C ; référence : 15.5bis.12.

- [ ] Comparer index séparés, synchronisation chiffrée, recherche entre appareils autorisés et espace choisi ; documenter faisabilité, confidentialité, coûts et disponibilité.
- [ ] Choisir l'architecture et les données transférées avec consentement explicite ; définir association/révocation, chiffrement, hors ligne, conflits et propagation des suppressions, sans transfert automatique des originaux ou jetons.
- [ ] Implémenter et tester sur plusieurs appareils, avec conflit, hors ligne, révocation et suppression ; documenter les limites et coûts.

**Sortie :** architecture approuvée et parcours multi-appareils testés ; aucune recherche distante n'est annoncée sans mécanisme actif.

#### Lot H — Préparer le pilote et la livraison
**Objectif :** valider sécurité, conformité et qualité avant utilisation au-delà des essais fictifs. Références : 15.5bis.13 et 15.8 ; contrôles à engager dès le lot A et à finaliser après les lots retenus pour le pilote.

- [ ] Cartographier par source données lues, stockées, transmises et supprimées, destinataires et durées ; vérifier protection des jetons, liens temporaires et transferts, export et restauration.
- [ ] Examiner les risques des données familiales et des mineurs, ainsi que l'isolation des comptes et foyers si le partage est introduit ; réaliser les vérifications fournisseur, sécurité et conformité appropriées.
- [ ] Fixer le périmètre du pilote, ses critères d'entrée/sortie, assistance, suivi des incidents et retour arrière ; vérifier les risques et dépendances encore ouverts.
- [ ] Exécuter les tests unitaires, intégration et navigateur applicables, y compris les parcours réels autorisés ; relever résultats, appareils, limites et décision de livraison.

**Sortie :** décision documentée de lancement, de correction ou de report ; aucune validation globale n'est déduite d'un test simulé.

**Bilan de validation du 9 novembre 2026 :** 257 tests `node --test` et la compilation Vite ont réussi avant le lot B. L'utilisateur confirme l'indexation Google Drive et OneDrive sur smartphone, ainsi qu'un cas passant Google de révocation et purge avec original conservé. Un parcours navigateur avec authentification et Graph simulés a couvert la recherche OneDrive après rechargement. Les tests Playwright complets et les autres scénarios non explicitement confirmés restent ouverts. L'installation des dépendances a signalé quatre vulnérabilités npm ; leur analyse et leur statut actuel restent à vérifier avant un pilote.

### Référentiel détaillé des exigences 15.5bis

Les cases ci-dessous portent sur les objectifs globaux, plus larges que les lots livrables ci-dessus. Elles ne sont cochées que lorsque tous leurs critères sont satisfaits ; les lots opérationnels indiquent les prochaines actions.

##### 15.5bis.0 – Cadrage de la recherche universelle
- [✓] **15.5bis.0.a** : Décrire les scénarios prioritaires : facture dont l'emplacement est inconnu, garantie et échéance, contrat et fait précis, photos par date/personne/lieu/événement et recherche simultanée dans plusieurs sources. Voir [scénarios de recherche](docs/architecture/scenarios-recherche-multi-sources.md) ; ils décrivent la cible, pas une validation fonctionnelle.
- [✓] **15.5bis.0.b** : Définir les niveaux de couverture : non accessible, métadonnées seules, contenu partiel et contenu analysé ; distinguer la couverture effective de la simple autorisation d'accès. Voir [couverture d'indexation](docs/architecture/index-coverage.md).
- [✓] **15.5bis.0.c** : Définir les états et comportements d'une source déconnectée, inaccessible, partiellement indexée ou obsolète, ainsi que l'information montrée dans les résultats. Voir [états des sources](docs/architecture/etat-et-capacites-sources.md) ; comportements proposés, non tous intégrés.
- [ ] **15.5bis.0.d** : Établir une matrice par source et plateforme : lecture, recherche, mise à jour, accès à l'original, formats, permissions, limites et statut d'implémentation ; revérifier les études fournisseur avant intégration. [Matrice](docs/architecture/etat-et-capacites-sources.md) disponible et mise à jour pour les parcours expérimentaux, à compléter et à revérifier pour les autres sources.
- **Réalisé partiellement :** matrice actualisée pour les parcours locaux, Google Drive et OneDrive expérimentaux ; les autres plateformes et capacités restent à vérifier.
- **Validation :** les scénarios et la matrice distinguent ce qui existe, ce qui est prévu et ce qui dépend d'une autorisation ou d'une faisabilité non confirmée.

##### 15.5bis.1 – Architecture commune des sources
- [✓] **15.5bis.1.a** : Définir une interface de connecteur couvrant connexion, autorisation, découverte, lecture des métadonnées et du contenu accessible, ouverture de l'original, suivi des changements, déconnexion et révocation. Voir [contrat proposé](docs/architecture/contrat-connecteurs.md) ; sa mise en œuvre et sa validation sur un connecteur réel restent à faire.
- [ ] **15.5bis.1.b** : Modéliser fournisseur, compte ou appareil, périmètre autorisé, capacités et état ; utiliser un identifiant stable par élément distinct de son nom et de son emplacement.
- [ ] **15.5bis.1.c** : Gérer pagination, quotas, erreurs explicites, reconnexion et reprise après interruption ; isoler les défaillances d'une source des autres.
- [ ] **15.5bis.1.d** : Concevoir le socle avec un premier connecteur réel afin de permettre l'ajout d'autres sources sans réécrire la recherche.
- **Réalisé partiellement :** contrat et orchestrateur fictifs, adaptateur Drive limité et parcours Graph OneDrive paginé avec arrêt, erreurs et identité distincte par compte ; pas de reprise par curseur durable ni de contrat commun complet pour tous les fournisseurs.
- **Validation :** tests d'un connecteur fictif couvrant autorisation, pagination, erreurs, reprise, modification et révocation ; documentation des capacités effectives de chaque adaptateur.

##### 15.5bis.2 – Modèle d'index intelligent
- [ ] **15.5bis.2.a** : Définir une fiche d'index commune documents/photos compatible avec les données existantes : identité, source, emplacement, type, dates, classification, couverture et dernière vérification.
- [ ] **15.5bis.2.b** : Conserver la provenance des champs : métadonnée fournisseur, contenu extrait, saisie ou correction utilisateur, estimation ou classification automatique ; distinguer création, modification, prise de vue, achat et échéance.
- [ ] **15.5bis.2.c** : Associer les faits importants à une preuve ou un extrait lorsqu'ils existent ; afficher l'incertitude et ne pas présenter une estimation comme un fait certain.
- [✓] **15.5bis.2.d** : Versionner le schéma et migrer les données IndexedDB existantes ; définir la conservation et la suppression des extraits, liens et vignettes. Migration additive, reprenable et testée ; conservation sans expiration automatique, liée à la copie Famili-IA jusqu'à sa suppression/purge explicite ; retour arrière de l'index séparé et non destructif.
- [ ] **15.5bis.2.e** : Détecter les doublons exacts lorsque l'empreinte est disponible et proposer les rapprochements incertains sans fusion automatique ; préserver associations et corrections manuelles lors des réindexations.
- **Réalisé partiellement :** schéma `1.1.0` et emplacement sourcé facultatif ; migration IndexedDB v2→v3 reprenable, mise à niveau de fiches `1.0.0` et retrait applicatif du seul champ d'index ; restauration de faits après redémarrage si la provenance est vérifiée ; détection des empreintes déjà disponibles et suggestions par nom sans fusion. Les corrections utilisateur et annotations photo sont préservées. La conservation/suppression locale suit le cycle de vie de la copie Famili-IA sans expiration automatique ; identités stables multi-appareils et interface de revue restent à définir.
- **Validation de cette tranche :** 279 tests Node, build Vite et 4 tests navigateur ciblés réussis : DOCX synthétique, migration+retour arrière, confirmation de suppression et purge. Le test de migration vérifie contenu source préservé et retrait de la seule fiche ; les tests de recherche couvrent la restauration des faits après redémarrage et leur exclusion quand la provenance est altérée. `data-inventory.spec.js` passe 8 tests sur 9 ; l'unique échec est une attente ancienne de 4 cartes alors que l'interface en affiche 5. L'assertion de dialogue de purge a été corrigée et les vérifications ciblées passent. La suite navigateur complète du projet n'a pas été exécutée.
- **Validation :** tests de migration, réindexation, doublons, changement de nom, suppression et révocation ; supprimer l'index Famili-IA ne supprime pas l'original.

##### 15.5bis.3 – Pipeline d'analyse et de classification
- [ ] **15.5bis.3.a** : Construire le pipeline découverte → lecture → extraction → classification → indexation → alertes éventuelles, en réutilisant les traitements existants lorsque leurs capacités sont vérifiées.
- [ ] **15.5bis.3.b** : Vérifier et compléter l'extraction texte, PDF, Word, Excel et l'OCR des scans/photos de documents sur les plateformes retenues ; signaler les formats illisibles et conserver un résultat partiel utile.
- [ ] **15.5bis.3.c** : Extraire type de document, émetteur, dates, montants, équipements, échéances et extraits pertinents avec leur provenance ; réutiliser les métadonnées photo et annotations volontaires de 15.3 et 15.4.
- [ ] **15.5bis.3.d** : Comparer règles explicables, OCR et modèles locaux sur un corpus annoté avant de retenir un modèle supplémentaire ; mesurer intérêt, stockage, confidentialité et performance. Une analyse distante éventuelle nécessite une décision et une information distinctes.
- [ ] **15.5bis.3.e** : Traiter les fichiers progressivement avec pause, reprise, limitation mémoire et priorité configurable aux éléments récents ou utiles.
- **Réalisé partiellement :** classification/catégorie estimées et faits sourcés (émetteur, montants, dates, échéances, équipements explicitement étiquetés) depuis des segments vérifiés ; texte XLS/XLSX local indexable ; aucun fait lorsque la provenance manque. Lecture et indexation DOCX validées avec un fichier OOXML synthétique sur Node et Chromium. Essais OCR natif local sur tablette Android avec image et PDF scanné fictifs confirmés par l'utilisateur le 10 novembre 2026. Le corpus comprend 7 cas fictifs et mesure couverture, extraction, classification, erreurs, temps et mémoire ; il est trop petit pour soutenir une revendication générale. Essais de fichiers représentatifs, classification générale et reprise durable du traitement restent à valider.
- **Validation :** le corpus courant contient 5 cas avec contenu vérifié, 2 en métadonnées seules, 17 faits attendus/prédits et aucune erreur sur ce jeu synthétique ; une exécution a mesuré environ 71 ms et 1,08 Mo de delta mémoire. Ces mesures d'un petit corpus ne représentent pas la production. Les personnes, lieux et scènes ne sont pas déduits des seules métadonnées ; toute analyse supplémentaire est conçue et évaluée séparément. La suite navigateur complète et le profilage sur appareils cibles restent à faire.

##### 15.5bis.4 – Fichiers locaux et appareils
- [ ] **15.5bis.4.a – Web et ordinateur** : améliorer la sélection de fichiers/dossiers compatibles, l'actualisation des périmètres autorisés et la reprise après perte de permission ; ne pas supposer un accès à tout l'ordinateur.
- [ ] **15.5bis.4.b – Compagnon ordinateur** : étudier un composant local complémentaire si le navigateur ne permet pas la couverture ou la régularité visées ; documenter permissions, sécurité, distribution et faisabilité avant de l'implémenter.
- [ ] **15.5bis.4.c – Android** : étudier et intégrer les sélecteurs système et modules natifs nécessaires aux fichiers et photos autorisés, à l'accès persistant et à l'ouverture des originaux ; vérifier les limites d'arrière-plan sur appareils réels.
- [ ] **15.5bis.4.d – iOS** : créer et configurer une cible avant toute annonce native ; étudier sélecteurs de documents et photothèque, puis tester sur appareil les éléments locaux et fournis par iCloud.
- **Validation :** sélection, autorisation refusée ou révoquée, fichier déplacé, fonctionnement hors ligne et réouverture de la source, sur les plateformes effectivement prises en charge.

##### 15.5bis.5 – Google Drive
- [ ] **15.5bis.5.a** : Consolider et vérifier le parcours de sélection explicite, les permissions et les formats réellement lisibles ; indexer les métadonnées et contenus autorisés, y compris les exports nécessaires aux formats Google compatibles.
- [ ] **15.5bis.5.b** : Étudier et prototyper l'accès étendu lorsque la cible le justifie ; préparer les justificatifs, schémas de flux, vérifications et estimations de coûts applicables.
- [ ] **15.5bis.5.c** : Gérer pagination, quotas, modifications, révocation et fichiers devenus inaccessibles.
- **Réalisé partiellement :** sélection Web explicite `drive.file`, lecture bornée et révocation ; sélection et recherche après rechargement confirmées sur le parcours actuel. Actualisation continue, export de tous les formats Google, gestion générale des changements et validation complète restent à faire.
- **Validation :** tests sur données fictives ; distinguer fichiers choisis et accès étendu. Aucun accès étendu en production avant les autorisations requises. Voir [l'étude Google Drive](ETUDE_GOOGLE_DRIVE.md).

##### 15.5bis.6 – OneDrive
- **Première étape réalisée expérimentalement :** compte Microsoft personnel sur le Web ; `Files.Read` n'est pas limité aux fichiers sélectionnés. Authentification, parcours Graph paginé, indexation déclenchée séparément, arrêt, copies locales et recherche sont raccordés. Le parcours ne s'exécute que tant que l'onglet reste ouvert ; l'indexation sur smartphone a été confirmée, les autres scénarios restent à vérifier. Voir [étude OneDrive](ETUDE_ONEDRIVE.md).
- [ ] **15.5bis.6.a** : Concevoir l'authentification, les permissions et la lecture via l'API officielle ; étudier séparément les comptes personnels et professionnels/scolaires.
- [ ] **15.5bis.6.b** : Indexer les métadonnées et contenus accessibles ; gérer fichiers déplacés, modifiés, supprimés ou inaccessibles, expiration de session et reprise.
- [ ] **15.5bis.6.c** : Vérifier le périmètre réellement accordé, y compris lorsque l'interface utilise un sélecteur ; le présenter fidèlement à l'utilisateur.
- **Réalisé partiellement :** métadonnées et texte de formats bornés, conservation sur interruption et déconnexion locale distincte de la révocation Microsoft ; les copies existantes ne sont pas actualisées et les comptes professionnels ne sont pas pris en charge.
- **Validation :** tests sur comptes et données fictifs couvrant pagination, refus, expiration, déconnexion et reprise.

##### 15.5bis.7 – Dropbox
- [ ] **15.5bis.7.a** : Implémenter connexion et lecture via l'API officielle ; étudier les niveaux d'accès et l'accès élargi lorsque justifié.
- [ ] **15.5bis.7.b** : Indexer les métadonnées et contenus accessibles ; gérer changements, suppressions, quotas, erreurs réseau et déconnexion.
- [ ] **15.5bis.7.c** : Préparer les démarches d'approbation applicables à la production.
- **Validation :** tests avec fichiers et comptes fictifs, révocation et suppression des données indexées selon le choix utilisateur.

##### 15.5bis.8 – Photos et services Apple / Google
- [ ] **15.5bis.8.a – Google Photos** : étudier sélection et données accessibles, demander confirmation de l'éligibilité du cas d'usage, puis concevoir un connecteur limité aux usages autorisés ; traiter l'expiration des accès et le retour à la source lorsque possible. Ne pas présumer un accès à toute la bibliothèque ni autoriser la production sans confirmation.
- [ ] **15.5bis.8.b – Photos sur appareils Apple** : étudier l'accès natif à la photothèque autorisée, limité ou complet selon le choix utilisateur ; distinguer fichier local et original à récupérer depuis iCloud, indexer les éléments accessibles et signaler les indisponibilités.
- [ ] **15.5bis.8.c – iCloud Drive** : intégrer la sélection des documents accessibles par les mécanismes Apple compatibles ; réexaminer l'existence d'une API officielle plus large sans dépendre d'un accès tiers complet non établi.
- **Validation :** tests d'autorisation limitée, refusée et révoquée, de médias distants indisponibles et de réouverture ; réexaminer avant livraison [l'étude de faisabilité des clouds](ETUDE_FAISABILITE_CLOUDS.md) et [l'intégration photo](docs/architecture/integration.md).

##### 15.5bis.9 – Recherche réellement multi-sources
- [ ] **15.5bis.9.a** : Interroger l'index commun et afficher ensemble documents et photos pertinents ; filtrer par source, type, date, personne, lieu et couverture.
- [ ] **15.5bis.9.b** : Afficher nom, type, source, emplacement disponible, date et sa nature, extrait ou raison de correspondance et état d'accès à l'original ; expliquer les sources incomplètes, obsolètes ou indisponibles.
- [✓] **15.5bis.9.c** : Regrouper les doublons possibles sans masquer leurs sources ; ouvrir l'original lorsque possible ou expliquer la marche à suivre. Rapprochements visuels par nom normalisé ou empreinte disponible, sans fusion ; copie Famili-IA ou indications pour retrouver l'original.
- [ ] **15.5bis.9.d** : Réutiliser la recherche documentaire traçable et « Moments de vie » ; comparer les améliorations sur un corpus multi-sources annoté et maintenir la recherche utile pour tous, conformément à 15.2.e.
- **Réalisé partiellement :** recherche par nom et segments vérifiés sur les copies locales, Drive et OneDrive, avec source, extrait, couverture, filtres et regroupement des rapprochements sans fusion. Les résultats restent bornés aux copies présentes ; accès, couverture complète et fraîcheur effective ne sont pas garantis.
- **Validation :** tests unitaires/navigateur et essais manuels avec données fictives de plusieurs sources confirmés par l'utilisateur le 10 novembre 2026. La comparaison sur corpus annoté, les sources indisponibles et les états d'index périmé restent à tester.

##### 15.5bis.10 – Alertes issues des sources indexées
- [ ] **15.5bis.10.a** : Alimenter le moteur d'alertes existant avec les faits accessibles des différents connecteurs, en conservant source et extrait justificatif ; ne pas créer d'alerte certaine sur une date ambiguë ou non vérifiable.
- [ ] **15.5bis.10.b** : Réévaluer les alertes à la modification, disparition ou perte d'accès d'un document ; signaler une source indisponible ou un index ancien.
- [ ] **15.5bis.10.c** : Préserver corrections, reports et choix utilisateur lors des synchronisations et réindexations.
- **Partiellement réalisé :** une échéance explicite avec preuve et type supporté, ou une estimation issue d'une date d'achat et d'une durée de garantie explicites uniques, est proposée ; elle n'est persistée comme échéance confirmée et alerte qu'après action affirmative. Les estimations sont visuellement distinctes et conservent les deux lignes justificatives. La date et les preuves sont conservées avec le document, et l'alerte garde source, preuve et confiance « confirmée ». Les propositions ambiguës/non vérifiables, les catégories non prises en charge et les dates hors seuil ne créent pas d'alerte.
- **Validation :** 289 tests Node, 8 tests Playwright ciblés et le build Vite réussissent. Les tests couvrent confirmation, annulation, persistance des preuves et de la source, date explicite et estimation achat+durée. Le parcours (un fichier explicite, un fichier estimé, alertes visibles dans l'écran dédié) est confirmé manuellement le 10 novembre 2026. Restent à tester manuellement les alertes issues de plusieurs connecteurs, les modifications, révocations et suppressions.

##### 15.5bis.11 – Démonstration et parcours d'accueil
- [ ] **15.5bis.11.a** : Placer « Que recherchez-vous ? » au premier plan de l'accueil ; proposer bienvenue et prénom facultatif, sans formulaire lourd ni compte obligatoire tant que la source choisie n'en exige pas.
- [ ] **15.5bis.11.b** : Proposer une démo interactive sans permission ni accès aux données personnelles : facture de piscine, photos de vacances et contrat d'assurance ; identifier explicitement chaque résultat et chaque source simulés.
- [ ] **15.5bis.11.c** : Expliquer les données indexées et le devenir des originaux ; permettre de connecter une première source réelle puis d'en ajouter d'autres, et lancer une première recherche personnelle avec provenance et accès à l'original lorsque possible.
- [ ] **15.5bis.11.d** : Afficher des états dérivés de la situation réelle : à connecter, indexation en cours, disponible, partielle ou action nécessaire ; prévoir refus, échec, retour et reprise sans bloquer le parcours.
- [ ] **15.5bis.11.e** : Préserver les compteurs et accès utiles au foyer et aux alertes ; assurer navigation clavier, ARIA, contrastes et respect de `prefers-reduced-motion`.
- **Validation :** les trois questions fonctionnent sans données personnelles ; tests Playwright des transitions, permissions refusées et recherche réelle sur données de test. Vérifier cibles tactiles ≥ 48 × 48 px, absence de débordement horizontal à 390 et 768 px et rendu à 1280 et 1920 px.

##### 15.5bis.12 – Recherche et synchronisation multi-appareils
- [ ] **15.5bis.12.a** : Comparer index séparés, synchronisation chiffrée, recherche entre appareils autorisés et synchronisation via un espace choisi ; documenter faisabilité, coûts, confidentialité et disponibilité.
- [ ] **15.5bis.12.b** : Choisir l'architecture et préciser les données circulant : métadonnées, extraits, miniatures, annotations ou index ; informer l'utilisateur et recueillir son choix avant synchronisation.
- [ ] **15.5bis.12.c** : Concevoir association et révocation des appareils, chiffrement et protection des données, conflits, mode hors ligne et propagation des suppressions ; ne pas transférer automatiquement originaux ou jetons.
- [ ] **15.5bis.12.d** : Implémenter la solution retenue après validation de son architecture et de ses risques.
- **Validation :** tests multi-appareils, hors ligne, conflit, révocation et suppression ; ne pas prétendre rechercher sur un autre appareil sans mécanisme actif et périmètre accessible.

##### 15.5bis.13 – Confidentialité, sécurité et préparation du pilote
- [ ] **15.5bis.13.a** : Documenter par source les données lues, extraites, conservées, synchronisées et supprimées, leurs destinataires et durées ; protéger les jetons, l'index et les transferts sans embarquer de secrets client.
- [ ] **15.5bis.13.b** : Prévoir déconnexion, révocation et choix de suppression des données indexées, ainsi qu'export, restauration et erreurs explicites ; ne jamais supprimer les originaux sans action distincte.
- [ ] **15.5bis.13.c** : Examiner données familiales, photos et données de mineurs ; tester l'isolation des comptes et foyers si le partage est introduit.
- [ ] **15.5bis.13.d** : Réaliser les vérifications fournisseur, sécurité et conformité avant pilote sur données réelles ; préparer critères d'entrée/sortie, assistance et retour arrière en coordination avec 15.8.
- **Validation :** tests unitaires et d'intégration ciblés, puis suites de non-régression du projet (`node --test` et Playwright) avant livraison ; vérifier les flux réseau et la persistance selon l'architecture retenue, sans supposer que toutes les sources fonctionnent hors ligne ou sans serveur.

La progression et les dépendances figurent dans le [plan d'action opérationnel](#plan-daction-opérationnel-155bis). Les études natives et démarches fournisseur peuvent commencer en parallèle, car elles peuvent être longues ou bloquantes. La première recherche personnelle précède la décision de monétisation : les sections 15.6 et 15.7 restent à instruire, en préservant une recherche gratuite réellement utile, ainsi que l'accès, l'export et la suppression des données en cas de changement d'offre.


#### 15.6 – Hypothèses d'offres et viabilité économique
- [✓] 15.6.a : Consigner comme hypothèses de travail les offres Essentiel (gratuite, recherche locale et premières échéances) et Sérénité (rappels programmés, synchronisation/sauvegarde structurée, partage familial et suivi dans le temps), sans figer les fonctionnalités finales.
- [ ] 15.6.b : Estimer le coût de revient par utilisateur et par offre (stockage, synchronisation, notifications, support, paiements, conformité et services tiers), en séparant coûts locaux et coûts serveur.
- [ ] 15.6.c : Construire une matrice offre/fonctionnalité/coût, préserver les fonctions gratuites essentielles, et traiter 4,99 €/mois comme un prix de test uniquement.
- [ ] 15.6.d : Réexaminer plus tard les bénéfices et hypothèses de prix au regard des retours, des coûts et des limites techniques ; cette validation ne bloque pas les améliorations produit de la phase.
- [ ] 15.6.e : Définir les principes d'offre : limites compréhensibles, export et suppression accessibles, absence de vente des données personnelles, et décision documentée de poursuivre, modifier ou différer la monétisation.

#### 15.7 – État utilisateur, droits d'accès et limites dynamiques
- [ ] 15.7.a : Modéliser l'entitlement indépendant de l'interface : état anonyme/compte, offre, droits actifs, origine de l'achat, période de validité, renouvellement, grâce, expiration et révocation.
- [ ] 15.7.b : Inventorier et centraliser les capacités et quotas configurables (nombre et taille de fichiers, stockage, traitements photo/OCR, membres, synchronisation et notifications) ; préciser pour chacun unité, fenêtre de remise à zéro, comportement hors ligne et message d'approche de limite.
- [ ] 15.7.c : Définir comment l'entitlement suit l'utilisateur entre appareils et comment les membres d'un foyer partagent ou non les quotas, sans confondre abonnement, identité et autorisations familiales.
- [ ] 15.7.d : Réaliser une étude d'architecture de facturation selon les canaux retenus (Web, Google Play, App Store) : règles des boutiques, validation de reçus, restauration d'achats, annulation, remboursement, taxes et exigences backend.
- [ ] 15.7.e : Construire le socle technique des droits et des limites, avec configuration versionnée, vérification à chaque opération concernée, erreurs explicites, tolérance hors ligne bornée et tests de transition d'offre.
- [ ] 15.7.f : Implémenter l'achat et la gestion d'abonnement uniquement après choix d'un fournisseur et validation du parcours légal/plateforme ; ne jamais embarquer de secret de facturation dans le client et vérifier les transactions côté serveur si le modèle choisi l'exige.
- [ ] 15.7.g : Ajouter les vues d'offre, de quota, de mise à niveau, de restauration et de gestion/résiliation, ainsi que les parcours d'expiration, d'échec de paiement et de perte d'accès sans perte des données utilisateur.

#### 15.8 – Préparation au lancement et jalons transverses
- [ ] 15.8.a : Réaliser les revues sécurité, confidentialité et conformité : minimisation, consentements, droits d'accès, rétention, export/suppression, données de mineurs, achats et exigences applicables selon les régions.
- [ ] 15.8.b : Documenter les limites techniques réelles par plateforme, les dépendances, les modes hors ligne, les procédures de restauration et les engagements de service éventuels.
- [ ] 15.8.c : Préparer télémétrie minimale sans contenu de document, photo, requête ni coordonnées précises ; définir des métriques de qualité, conversion et coût que l'utilisateur peut comprendre et désactiver si applicable.
- [ ] 15.8.d : Conduire un pilote progressif avec critères d'entrée/sortie, assistance, mécanisme de désactivation/retour arrière et suivi des incidents avant toute ouverture générale.
- [ ] 15.8.e : Décider du lancement commercial uniquement si valeur utilisateur, faisabilité multiplateforme, coûts, conformité et qualité des résultats atteignent les seuils définis en 15.6.

## 🛠 Framework des Skills - Implémentation Structurée
...
