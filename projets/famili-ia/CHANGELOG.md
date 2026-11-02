# [15.4.e] - 2026-11-02 - Résultats expliqués et corrections locales Moments de vie

### 🖼️ Phase 15.4
- Les résultats exposent les filtres exacts, les dates de prise de vue/import, leur provenance, le contexte d'associations saisies et les données manquantes ou incertaines.
- Ajout d'un niveau de confiance explicable, fondé sur la provenance des champs (EXIF, saisie utilisateur, anciennes données) ; il décrit la qualité des sources, pas une probabilité statistique de pertinence.
- Possibilité de corriger les associations et la date locale de prise de vue ; une correction datée est marquée comme saisie utilisateur, conserve les métadonnées EXIF originales et peut être effacée.
- Les recherches sans résultat proposent d'accéder aux annotations des photos ; après une correction, la recherche en cours est rejouée localement.
- Tests de non-régression sur provenance incertaine, correction utilisateur, bornes de date, résultats absents et absence d'appel réseau. Aucune photo, coordonnée GPS ou requête n'est envoyée à un service externe.

# [15.4.d] - 2026-11-02 - Fiabilisation et indexation des imports locaux

### 📱 Import local
- Le bouton de scan de l'onboarding termine désormais l'onboarding et rend l'accueil accessible ; sur mobile, il ouvre le sélecteur natif multi-fichiers au lieu de scanner les dossiers privés de l'application.
- Le bouton « Dossier complet » ouvre le sélecteur de dossier sur ordinateur et propose une sélection multiple de fichiers sur mobile.
- Correction du gestionnaire manquant du bouton dossier, du double déclenchement du sélecteur dans la zone de dépôt et de la remise à zéro des sélections pour permettre de choisir à nouveau le même fichier.
- Suppression du plafond arbitraire de fichiers locaux ; les sélections sont indexées par lots en arrière-plan avec une progression et un bilan des erreurs.
- Les limites de taille par fichier restent inchangées ; la limite de 50 fichiers ne concerne désormais que les sélections Google Drive.

# [15.2.0] - 2026-11-02 - Recherche documentaire sourcée

### 🔎 Phase 15.2
- Constitution d'un corpus local fictif de sept documents et neuf requêtes avec synonymes, fautes de frappe, faits, ambiguïtés et absences de preuve.
- Remplacement du classement trop permissif par un classement local qui exige une correspondance des termes de sujet, pondère les métadonnées et utilise un dictionnaire de synonymes explicite.
- Réponses factuelles produites à partir du texte source, jamais du seul résumé ; chaque résultat expose son extrait, sa provenance et son niveau de correspondance.
- Abstention explicite quand le fait demandé ou une source vérifiable manque ; détection des réponses contradictoires pour demander une vérification plutôt que choisir arbitrairement.
- Affichage sécurisé des messages de recherche et de l'assistant avec `textContent`, sans interpréter le contenu des documents ou la question comme du HTML.
- Comparaison automatisée du lexical, du score par métadonnées et de l'approche hybride ; aucun modèle distant, embedding ni nouvelle dépendance n'a été ajouté. La recherche ne reçoit aucun quota ou verrouillage payant.
- Sur le corpus synthétique, l'approche hybride obtient précision@3 88,9 %, rappel@3 100 %, MRR 0,778, exactitude factuelle 100 %, abstention correcte 100 % et couverture des sources 100 %. Mesure indicative sur données fictives uniquement.

# [15.3.d] - 2026-11-02 - Confidentialité des métadonnées photo

### 📷 Phase 15.3
- Intégration du parseur EXIF `exifr` pour une extraction locale et limitée des métadonnées JPEG/PNG.
- Ajout du consentement distinct GPS, désactivé par défaut ; son retrait supprime les coordonnées déjà enregistrées, sans modifier les photos originales.
- Exclusion des coordonnées GPS des exports JSON/PDF par défaut ; les aperçus restent textuels et ne réembarquent pas les EXIF.
- Ajout de diagnostics pour les métadonnées absentes, invalides et les erreurs d'extraction, avec conservation du fichier importé.
- Tests du mapping EXIF, du consentement GPS et de l'expurgation des exports ; fixtures et mesures de corpus complétées en 15.3.e.

# [15.3.e] - 2026-11-02 - Fixtures et mesures EXIF

### 📷 Phase 15.3
- Ajout de fixtures JPEG EXIF et de tests d'extraction réelle couvrant dates avec/sans fuseau, orientation, dimensions, GPS avec consentement, métadonnées absentes, valeurs malformées, JPEG/PNG invalides et limites de 10 Mio.
- Correction de l'import `exifr` pour Node et lecture unique des octets en mémoire, utilisés aussi pour le hash, afin d'éviter `FileReader` et une copie de fichier supplémentaire ; extraction GPS uniquement avec consentement.
- Ajout de `npm run benchmark:photo-exif` et d'une page de benchmark navigateur (`/tests/photo-exif-browser-benchmark.html`) pour mesurer temps, couverture attendue et mémoire sur les fixtures synthétiques, les images de démonstration et le corpus local.
- Analyse de 15 photos réelles issues de trois groupes d'appareils : dates 15/15, orientations 15/15, offsets explicites 5/15, dimensions et modèle/appareil 10/15, zéro diagnostic. Aucun GPS n'a été lu.
- Limite d'import et d'extraction photo portée de 1 à 10 Mio pour inclure ces exemples ; le chargement des fichiers sélectionnés est séquentiel afin de borner les buffers temporaires. Le corpus personnel est ignoré par Git.
- Mesures indicatives consignées dans l'audit ; le profilage sur mobiles reste hors périmètre de cette validation.

# [15.4.d] - 2026-11-02 - Recherche déterministe Moments de vie

### 🖼️ Phase 15.4
- Ajout d'une recherche locale sur les seules métadonnées de prise de vue/import et les associations explicitement saisies : membres, événements et lieux manuels.
- Classement déterministe des résultats par date de prise de vue la plus récente, puis date d'import et identifiant stable ; les dates absentes restent à la fin.
- Ajout de l'interface de recherche dans « Vos données », avec état de clarification, absence de résultat, critères retenus, dates affichées sans conversion de fuseau et accès à l'aperçu du fichier.
- Évaluation sur les 12 requêtes synthétiques : précision@5 100 %, rappel@5 98,15 %, MRR 100 %, clarification 100 % et abstention 100 %. Le rappel est une moyenne par requête ; un cas comporte six résultats pertinents, dont cinq visibles à la limite @5.
- Aucun embedding, modèle sémantique, index vectoriel ou dépendance supplémentaire n'est ajouté. Aucun média, GPS, contenu de photo ou requête n'est envoyé à un service externe.
- Les performances sur appareils Android/iOS cibles et le coût mémoire d'une photothèque réelle restent à mesurer avant toute décision d'ajouter un modèle.

# [15.4.c] - 2026-11-02 - Associations photo volontaires

### 🖼️ Phase 15.4
- Ajout d'une date de naissance facultative au formulaire des membres de famille, avec validation stricte des dates calendaires et stockage local dans les fiches existantes.
- Ajout d'une action « Associer » à l'inventaire des photos pour sélectionner explicitement des membres et saisir des événements et lieux ; les annotations versionnées conservent une provenance utilisateur.
- Les membres associés à une photo sont vérifiés contre les membres existants ; les doublons d'événements sont normalisés et les entrées invalides signalées.
- La suppression d'un membre retire ses associations photo tout en conservant les autres annotations.
- Aucune détection de visage, identification automatique ou inférence d'identité n'est exécutée ; les données et images ne sont pas envoyées à un service externe.

# [15.4.b] - 2026-11-02 - Interprétation locale des requêtes Moments de vie

### 🖼️ Phase 15.4
- Ajout d'un interpréteur local déterministe qui convertit les requêtes en filtres structurés et expose, pour chaque filtre, sa provenance textuelle et sa règle d'interprétation.
- Distinction explicite entre dates de prise de vue (date locale, sans conversion d'un fuseau inconnu), dates d'import et dates de naissance ; les âges sont calculés depuis la date de naissance du membre avec borne anniversaire de fin exclusive.
- Résolution des membres, lieux saisis par l'utilisateur et événements à partir de catalogues fournis localement ; les noms ambigus, saisons sans année, âges sans date de naissance et requêtes non interprétables demandent une précision.
- Tests des 12 requêtes annotées, des filtres exacts, des années de naissance distinctes des années de prise de vue, des anniversaires bissextiles et des dates invalides.
- Aucun média, GPS ni requête n'est envoyé à un service externe ; la recherche déterministe est décrite en 15.4.d.

# [15.4.a] - 2026-11-02 - Jeu d'évaluation Moments de vie

### 🖼️ Phase 15.4
- Définition d'un corpus d'évaluation entièrement synthétique de 12 photos annotées et 3 profils fictifs, avec métadonnées de prise/import, personnes volontairement associées, événements et lieux saisis manuellement.
- Ajout de 12 requêtes annotées couvrant personne, période, âge et borne anniversaire, lieu, événement, fuseau inconnu, date d'import distincte, ambiguïté et absence de résultat.
- Fixation des cibles de qualité pour les prochaines étapes : précision@5 ≥ 90 %, rappel@5 ≥ 90 %, MRR ≥ 0,85, exactitude des filtres calendaires/âge à 100 %, clarification et abstention correctes à 100 %.
- Aucun média réel, GPS ou donnée personnelle n'est inclus ; le jeu ne suppose aucune reconnaissance faciale.

# [15.1.0] - 2026-11-02 - Fiabilisation des alertes

### 🔔 Phase 15.1
- Extraction d'échéances à partir de libellés explicites, dates françaises validées et conservation de l'extrait justificatif ; les dates ambiguës ou invalides ne déclenchent pas d'alerte automatique.
- Centralisation des seuils par type de document, gestion des échéances dépassées et suppression des doublons lors des synchronisations IndexedDB.
- Ajout des statuts d'alerte actifs, ignorés et terminés, avec réactivation ; affichage de la preuve textuelle issue du document.
- Correction manuelle d'une échéance depuis son alerte, avec confirmation explicite, preuve éditoriale et nouvelle synchronisation.
- Préférences locales des notifications : désactivation par catégorie, plafond quotidien, plages silencieuses, report d'une journée ou d'une semaine et réactivation anticipée.
- Les notifications navigateur ne sont demandées qu'après action utilisateur, sont dédupliquées par échéance et n'affichent pas le titre ou le contenu du document. Elles sont vérifiées tant que l'application est ouverte.
- Vérification de la qualité sur huit cas fictifs annotés : précision 100 %, rappel 100 %, preuves 100 %, zéro doublon et zéro répétition au second passage. Ce résultat synthétique ne prédit pas la qualité en production.
- Étude des contraintes Web/PWA, iOS et Android ; les notifications locales planifiées et les notifications push distantes restent des évolutions distinctes, non activées par cette étape.
- Ajout de tests sur les dates, seuils, sources, types de documents, préférences, reports, transitions de statut et métriques du corpus fictif.

## [14.0.7] - 2026-11-02 - Suppression sûre et filtres unifiés

### 🔒 Phase 14
- **14.3.a** : Ajout d'une confirmation explicite avant purge d'IndexedDB et des données familiales locales ; les scans en cours sont arrêtés avant la suppression et les fichiers sources restent intacts.
- Les erreurs de purge et de révocation Google sont signalées à l'utilisateur ; la suppression entraîne un rechargement propre de l'application.
- **14.3.b** : Rétablissement des chips visibles de type/provenance dans la recherche et centralisation de leurs règles avec l'inventaire ; maintien des anciens liens de filtres partageables par URL.
- Ajout de tests sur la confirmation, la purge IndexedDB, la préservation des exemples et le filtrage combiné.

---

## [14.0.6] - 2026-11-02 - Indicateurs de l'inventaire de données

### ✨ Phase 14
- **14.2.b** : Ajout de badges distincts pour le type de document, sa provenance et sa couverture d'indexation.
- L'état différencie le texte indexé des documents disponibles uniquement par leurs métadonnées, sans présenter les métadonnées seules comme une indexation complète.
- Ajout de tests unitaires et navigateur pour les indicateurs et leur affichage responsive.

---

## [14.0.5] - 2026-11-02 - Identité monochrome noir et blanc

### 🎨 Interface
- Adoption d'une palette de marque noire et blanche, avec des dégradés discrets sur les surfaces et les éléments principaux.
- Harmonisation du panneau « Gestion des données » avec les surfaces monochromes, tout en conservant le bouton de suppression en rouge.
- Conservation des couleurs sémantiques pour les alertes, erreurs et états fonctionnels.
- Mise à jour des fallbacks de couleur, de la charte UI et de la maquette mobile.

---

## [14.0.4] - 2026-11-02 - Refonte visuelle de « Vos données »

### 🎨 Phase 14
- **14.2.a** : Recomposition de la page avec en-tête éditorial, repère de confidentialité, synthèse en cartes, filtres hiérarchisés, inventaire et panneau d'actions distinct.
- Mise en cohérence des tokens CSS partagés avec la palette de marque teal et ajout de tokens de surfaces réutilisables.
- Adaptation responsive : grille de compteurs mobile, filtres défilants, lignes de fichiers réorganisées et panneaux empilés.
- Validation visuelle desktop/mobile, cibles tactiles de 44px et absence de débordement horizontal sur petit écran.
- Mise à jour de la charte UI et de la maquette mobile.

---

## [14.0.3] - 2026-11-02 - Filtres URL de l’inventaire

### ✨ Phase 14
- **14.1.c** : Les filtres de type et catégorie de « Vos données » sont appliqués à l’inventaire et reflétés dans le hash `#/vos-donnees`.
- Prise en charge des anciens liens `type=document&category=Facture`, des ouvertures directes/rafraîchissements et du retour navigateur.
- Ajout de tests unitaires de filtrage et d’un test navigateur couvrant les filtres et l’historique.

---

## [14.0.2] - 2026-11-02 - Inventaire unifié des documents

### ✨ Phase 14
- **14.1.b** : La vue « Vos données » réunit les fichiers ajoutés localement, les fichiers Google Drive sélectionnés et les documents fictifs utilisés en l'absence de fichiers ajoutés.
- Les documents sont dédoublonnés par identifiant, les compteurs par provenance reflètent l'inventaire et chaque ligne permet d'ouvrir l'aperçu du document.
- Ajout de tests ciblés sur la fusion et la classification des sources.

---

## [14.0.1] - 2026-11-02 - Consolidation des interfaces de gestion des données

### ✨ Phase 14
- **14.1.a** : Remplacement de la liste de fichiers redondante dans l'écran Importer par un accès à l'inventaire central « Vos données ».
- Mise à jour de la maquette mobile pour refléter le parcours unifié de consultation et de gestion des fichiers.
- Confirmation de la suppression antérieure de la vue `documents-list` dans le cadre de la phase 11.3.g.

---

## [13.2.1] - 2026-11-01 - Correctif Critique Onboarding Mobile

### 🐛 Corrections Critiques
- **Correctif Mobile HTTP (13.2.b.9)** : Résolution complète du blocage de l'onboarding sur smartphone en environnement HTTP (développement local).
  - **Race Condition `activeView`** : Initialisation immédiate en parsant `window.location.hash` dès le chargement (ligne ~1310) au lieu d'un hardcode à `"accueil"`, éliminant les différences de timing entre desktop et mobile.
  - **Blocage `initState()`** : Ajout d'un timeout de 5 secondes avec `Promise.race()` pour éviter le freeze infini causé par `crypto.subtle` undefined en HTTP mobile (ligne ~340).
  - **Fallback `crypto.subtle`** : Détection de disponibilité de `crypto.subtle` dans `crypto.js` avec stockage en clair automatique si indisponible (HTTP mobile), évitant le crash au démarrage.
  - **Amélioration CSS Mobile** : Z-index augmenté à 2000, ajout de `touch-action: manipulation`, `min-height: 44px` sur boutons, media query `@media (max-width: 600px)` complète pour optimiser l'affichage et la réactivité tactile.

### 📚 Documentation & Anti-Régression
- **Architecture Technique** : Création de `docs/ONBOARDING_ARCHITECTURE.md` (400+ lignes) avec diagrammes Mermaid, historique des régressions, checklist de validation.
- **Skill de Protection** : Nouveau skill `.claude/skills/onboarding-guard.md` avec déclenchement automatique, règles de protection absolues, templates de commit safe.
- **Rapport de Résolution** : Mise à jour complète de `PROMPT_CORRECTIF_ONBOARDING_MOBILE.md` avec causes racines, corrections détaillées, tests de validation.

### ✅ Tests Validés
- ✅ Premier lancement mobile HTTP (192.168.x.x:5179) - Wizard s'affiche en < 2s
- ✅ Navigation entre étapes (0→1→2) - Validation bloquante prénom/ville fonctionnelle
- ✅ Mode Démo - Injection documents + visite guidée + retour étape 3
- ✅ Persistance localStorage - Pas de ré-affichage après completion
- ✅ Console mobile - Aucune erreur JavaScript

### 🔧 Fichiers Modifiés
- `app.js` : Initialisation activeView, timeout initState, logs debug enrichis
- `crypto.js` : Détection crypto.subtle, fallback stockage en clair
- `styles.css` : Z-index 2000, touch-action, media query mobile complète
- `docs/ONBOARDING_ARCHITECTURE.md` : Nouveau (documentation complète)
- `.claude/skills/onboarding-guard.md` : Nouveau (skill de protection)

### 📊 Impact
- **Avant** : Onboarding bloqué sur 100% des smartphones en HTTP (freeze infini)
- **Après** : Onboarding fonctionnel sur desktop ET mobile (HTTP/HTTPS)
- **Métrique** : Temps d'affichage mobile < 2s (vs ∞ freeze avant)

---

## [13.2.0] - 2026-11-01 - Phase 13 : Refonte Complète du Onboarding (Expérience "Magique")
### 🚀 Nouvelles Fonctionnalités & Refonte
- **Refonte du flux d'accueil (13.1)** : Remplacement de l'accueil statique par un parcours "Wizard" (3 étapes) structuré pour expliquer la souveraineté numérique (0 serveur) et collecter les informations minimales (prénom, ville) pour la personnalisation du foyer.
- **Mode Démo Interactif (13.2)** : Implémentation d'un mode de démonstration instantané ("Explorer la démo") avec injection automatique de documents fictifs.
- **Visite Guidée Automatisée (13.2.c)** : Parcours interactif automatisé (6 étapes : Recherche, Maison, Alertes, Import, Famille, Vos données) pour présenter les fonctionnalités clés sans clic utilisateur initial.
- **Enrichissement Pédagogique (13.2.c.5)** : Ajout d'explications contextuelles détaillées lors de la visite guidée (toasts pédagogiques).

### 🛠 Corrections et Améliorations
- **Validation Onboarding** : Ajout d'une validation bloquante (avec toast) sur l'étape 2 (nom/ville).
- **Personnalisation** : Personnalisation dynamique du titre de l'étape 3 avec le prénom de l'utilisateur.
- **Flux de retour** : Redirection automatique vers l'étape 3 du wizard à la fin du tour de démonstration.
- **Correction UX** : Correction de fautes d'orthographe (13.2.b.5), bannissement des émojis au profit des icônes SVG.

---


### 🚀 Nouvelles Fonctionnalités & Polish (Phase 11.3)
- **Gestion du retour arrière (11.3.f)** : Implémentation d'une gestion robuste de l'événement `popstate` dans `app.js` pour permettre un retour arrière propre dans l'historique de navigation après la consultation de documents par filtres.
- **Nettoyage définitif (11.3.g)** : Suppression définitive de l'ancienne vue de liste redondante (`documents-list`) de `index.html`, désormais entièrement remplacée par la vue unifiée "Vos données".

### 🛠 Corrections et Améliorations
- Consolidation du routage par hachage (`parseHash` / `showView`) pour éviter les états orphelins lors de la navigation arrière.
- Validation du build complet du projet (Vite).

---

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