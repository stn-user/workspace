# Famili-IA – Plan de Développement

## 📊 Vue d'ensemble
- **Phase terminée** : Phase 14 – Refonte de la Vue "Vos Données" & Polish
- **Prochaine phase planifiée** : Phase 15 – Assistant Vie Numérique & Préparation du modèle économique

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
- [ ] 15.4.a : Définir les requêtes et le jeu d'évaluation (personne, période, âge, lieu facultatif, événements, formulations ambiguës et absence de résultat) et les critères mesurables de précision/rappel.
- [ ] 15.4.b : Concevoir une interprétation locale et explicable des requêtes en filtres structurés ; distinguer date de prise de vue, date d'import et date de naissance, et demander une précision si nécessaire.
- [ ] 15.4.c : Permettre l'association volontaire d'une photo à des membres/événements et la saisie facultative d'une date de naissance ; ne pas déduire l'identité d'une personne par reconnaissance faciale sans décision produit, consentement distinct et revue spécifique.
- [ ] 15.4.d : Implémenter le classement et la recherche avec des métadonnées d'abord ; n'ajouter embeddings/modèle sémantique local qu'après comparaison mesurée avec une recherche déterministe, validation des performances sur appareils cibles et contrôle du stockage.
- [ ] 15.4.e : Présenter résultats, provenance, filtres, contexte et niveau de confiance ; couvrir requêtes sans résultat, données incertaines, corrections utilisateur et tests de non-régression sans envoyer les requêtes/photos à un service externe.

#### 15.5 – Galerie et timeline chronologique
- [ ] 15.5.a : Concevoir les vues Galerie et Journal de bord, les états vides/chargement/erreur, les filtres par personne/date/lieu et le parcours depuis une photo vers son fichier d'origine.
- [ ] 15.5.b : Générer des vignettes locales orientées correctement et optimiser le chargement (pagination/virtualisation, formats, caches bornés et libération mémoire) pour les grandes photothèques.
- [ ] 15.5.c : Regrouper les images par jour/mois/événement à partir de dates fiables, en signalant les dates estimées et en évitant les changements silencieux de fuseau.
- [ ] 15.5.d : Ajouter navigation clavier/tactile accessible, aperçu détaillé, sélection multiple et suppression des seules données Famili-IA, en préservant les originaux.
- [ ] 15.5.e : Valider sur appareils et tailles de bibliothèque représentatifs : fluidité du défilement, mémoire, absence de débordement mobile, accessibilité et exactitude des liens vers les sources.

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
