# Famili-IA — Maquette UI Mobile

> **MàJ octobre 2026 — Tâche 9.16 : Refonte Navigation Mobile**
> La barre de navigation passe de 9 éléments à 5 éléments prioritaires. Les vues secondaires sont regroupées dans un écran «Plus».

---

## 🧭 Parcours Utilisateur (parcours cible)

Parcours principal d'un utilisateur au démarrage de l'application :

1. **Démarrage → Accueil (Dashboard contextuel)**
   - Bienvenue personnalisée + ce qui mérite attention :
     - Bannière «À surveiller» si alertes actives (échéance garantie/contrat < 30j) → raccourci vers **Alertes**
     - Documents importés récemment
     - Équipements sans document critique (facture/garantie manquante)
   - **Action rapide** : ajouter un document (cœur de valeur de l'app)
2. **Recherche → Recherche**
   - Barre toujours accessible (barre basse). Question en langage naturel.
   - Résultats avec provenance (☁️ Drive / 💾 local) et extraits.
   - Depuis un résultat : ouvrir le document, ou **lier le document à un équipement** (transversalité).
   - Recherche vide ou peu de résultats → appel à l'action «Importer un document».
3. **Ajout rapide → Importer**
   - Accès direct au **centre de la barre basse** (position héroïque) ou via la bannière d'accueil.
   - Choix : fichiers locaux / Google Drive.
   - Après lecture : classification automatique (OCR, `document-parser.js`), affichage des fichiers importés.
   - Fin de flux : «Voir le document» ou retour **Accueil**.
4. **Organisation → Maison**
   - Liste des équipements par catégorie, filtre.
   - Tap sur un équipement → **Détail équipement** (documents associés, garantie, alertes de l'équipement).
   - Bouton «+» : ajouter un équipement.
5. **Administration → Menu «Plus»**
   - Tout ce qui n'est pas quotidien : **Alertes** (détail), **Famille** (cercle familial), **Assistant** (conversation), **Profil** (identification/paramètres), **Vos données** (inventaire, export, purge).

**Principe directeur :** la barre basse ne porte que les *actions* (consulter, rechercher, ajouter, organiser, admin). Tout le reste vit dans «Plus». Chaque écran n'offre qu'une seule action principale évidente.

---

## 📱 Structure de Navigation Cible

### Barre inférieure — 5 items

| # | Vue | Icône (Feather/Lucide) | Rôle |
|---|-----|------------------------|------|
| 1 | **Accueil** | `home` | Dashboard contextuel |
| 2 | **Recherche** | `search` | Recherche IA globale |
| 3 | **Importer** | `upload` | **Position centrale, mise en avant** (style FAB intégré, icône dans un disque teinté primaire) |
| 4 | **Maison** | `home` (variant bâtiment/boîte) | Équipements & documents |
| 5 | **Plus** | `more-horizontal` / `grid` | Regroupement des vues secondaires |

### Écran «Plus» (vue dédiée, `#/plus`)

Destinations dans des cartes partagées bleu/marine : une colonne sur mobile/tablette, deux au-dessus de 900 px. Chaque carte conserve son icône, son libellé et son sous-titre complet, avec un compteur lorsqu'il est disponible :

| Destination | Badge | Raccourci d'écran |
|-------------|-------|-------------------|
| **Alertes** | nombre d'alertes actives | Bannière d'accueil |
| **Famille** | nombre de membres | Card «Famille» de l'accueil |
| **Assistant** | — | Suggestion de question (poste plus tard sur l'accueil — tâche 10.7.d) |
| **Profil** | — | Menu du profil |
| **Vos données** | volume/count documents | Boutons d'accueil liant aux données |

Retour : bouton retour natif/hash (`#/plus` pousse l'historique, bouton retour rend vers la vue d'origine).

### Sous-vues (jamais dans la barre basse)

- **Détail équipement** : `#/detail?id=<id>`, ouvert depuis Maison (tap) ou depuis un résultat de recherche lié. Bouton retour → Maison (ou vue d'origine).
- **Vues transitoires** : modales (confirmation suppression, ajout membre) ne sont pas des vues du routeur.

---

## 📺 Vues détaillées et interactions

### 1. Accueil (Dashboard contextuel)
- **Identité** : thème progressif `ui-warm`, fond ivoire, cartes crème arrondies, accents ambrés et texte foncé ; le bleu reste réservé à l'action principale. Le bloc d'accueil propose de retrouver un fichier et affiche une illustration décorative abstraite, masquée sur smartphone. Aucun formulaire de recherche ni bouton flottant : Accueil reste un tableau de bord.
- **Hiérarchie** : introduction et raccourcis Recherche/Importer, rappels utiles, accès au foyer, puis trois compteurs secondaires (fichiers visibles, garanties, contrats) et invitation à rejouer la démo. Le nom choisi est affiché littéralement ; le profil neutre reçoit « Bienvenue chez vous » sans modifier les données enregistrées.
- **Contenu réel** : trois rappels actifs au maximum, sans inventer d'activité. Sans rappel enregistré, un état apaisé remplace la liste ; cela ne garantit pas l'absence d'échéances à venir. Aucun compteur approximatif, document récent ou garantie « active » n'est inventé.
- **Périmètre** : les compteurs reprennent l'inventaire visible, avec exemples intégrés en repli lorsqu'aucun fichier n'est enregistré ; les exemples sont signalés et ne sont pas recherchés dans l'index personnel. Aucun membre, équipement ni rappel n'est prérempli lors d'une installation neuve ; l'illustration n'est pas présentée comme une photo de la maison.
- **Interactions** :
  - « Ouvrir la recherche » → vue **Recherche**, avec focus dans le formulaire unique. L'Assistant reste accessible séparément, sans nouveau raccourci concurrent sur Accueil.
  - « Ajouter des fichiers » → **Importer** ; « Revoir la démo » → démo rejouable, sans permission ni écriture de données applicatives.
  - Compteurs → **Vos données**, avec filtre Garantie ou Contrat correspondant si nécessaire.
  - Rappel ou « Toutes les alertes » → **Alertes** ; l'aperçu inclut les rappels reportés, sans prétendre couvrir toutes les échéances.
  - « Ma maison » / « Ma famille » → destinations correspondantes.

### 2. Recherche unifiée
- **Identité** : même thème chaleureux `ui-warm` qu'Accueil, formulaire crème avec libellé visible et action de recherche bleue. L'ajout dans l'en-tête devient une action secondaire ; l'état initial invite à commencer avec ses fichiers, sans suggestions issues d'un foyer inventé.
- **Contenu réel** : formulaire unique, périmètre explicite et résultats prioritaires. Chaque résultat documentaire met en avant une preuve littérale surlignée, en distinguant « Extrait correspondant », « Nom correspondant » et « Indice correspondant ». Une correspondance approchée ou une estimation non confirmée reste signalée près de la preuve. Source et couverture restent compactes et visibles avec la limite d'accès à l'original. Les résultats restent ceux du moteur existant, sans réponse synthétique inventée.
- **Photos** : grandes vignettes issues des seules copies locales déjà disponibles, sans téléchargement d'original ni image de remplacement inventée. Une colonne sur mobile, deux sur grand écran, dans les regroupements chronologiques existants. Nom, date disponible, source et critères interprétés restent visibles ; informations détaillées et annotations se déplient.
- **Outils secondaires** : filtres repliables (source, type, couverture, dates, personne, lieu), sources et échéances expérimentales se consultent séparément. Les volets ont un indicateur d'ouverture +/−. Aucune reconnaissance visuelle ni couverture de tout l'appareil/cloud n'est annoncée.
- **Interactions** :
  - Un seul raccourci « Ajouter des fichiers », dans l'en-tête, mène à **Importer**. Aucun bouton d'ajout flottant. Le retour explicite restaure la vue et le focus du raccourci ; question courante et filtres restent présents. Un import local lancé depuis ce parcours conserve aussi la question au retour dans Recherche.
  - Soumission → résultats dans la même vue, provenance et preuves conservées ; les volets repliés ne modifient pas les filtres appliqués.
  - « Provenance et détails » → type, emplacement, dates et preuves associées, couverture, fraîcheur, accès à l'original et raisons complètes. « Provenance et annotations » expose les informations de copie et les annotations photo. Ces volets natifs sont ouvrables au clavier ; la copie et les actions photo restent accessibles sans les ouvrir.
  - Mots-outils et élisions usuelles sont ignorés dans les termes recherchés. Une faute simple sur un mot alphabétique de 6 à 32 lettres peut correspondre ; la raison indique « correspondance approchée » et les termes normalisés, sans modifier la saisie ni l'extrait. Chiffres, références alphanumériques, mots courts et filtres ne sont pas approximés. Les mots-outils seuls ne renvoient pas tous les fichiers.
  - Copie disponible → aperçu local existant, sans prétendre ouvrir l'original. Les photos conservent détail, annotations, regroupement, pagination et sélection/suppression confirmée.
  - « Effacer les filtres » conserve la question ; le bouton d'état vide efface aussi la question. Le focus revient au champ et l'état initial explique comment commencer.
  - « Sources et limites de la recherche » → état réel des sources et limites de couverture/fraîcheur ; « Échéances proposées — expérimental » → preuves et confirmation explicite existante avant création d'alerte.
  - Validation lexicale : 25 scénarios navigateur passent, dont trois nouveaux parcours à 390, 768 et 1280 px ; preuve littérale, explication d'une faute, filtre source et rechargement vérifiés avec un TXT fictif. La précision et le rappel atteignent 100 % sur les seuls 20 cas du petit corpus annoté, pas sur tout le français. 53 tests Node ciblés et compilation réussis ; appareils physiques et lecteur d'écran non revalidés.
  - Validation de l'harmonisation du lot D : 38 scénarios navigateur, 7 tests Node ciblés et build réussis. Les quatre largeurs 390/768/1280/1920 px couvrent les cibles de 48 px, l'absence de débordement et des vignettes décodées d'au moins 240 × 180 px. Détails au clavier, preuves littérales et stockage inchangé vérifiés ; contrastes des vues à 390/1280 px, inspection visuelle des cartes et mouvement réduit contrôlés. Appareils physiques, lecteur d'écran et comptes fournisseurs réels non revalidés.

### Validation de la tranche initiale Accueil / Recherche (avant E5.a–d)
- Douze tests dans `tests/unified-search-entry.spec.js`, seize d'inventaire et huit d'onboarding passent, ainsi que 44 tests de non-régression et dix audits ciblés (quatre largeurs 390, 768, 1280 et 1920 px, clavier et mouvement réduit), compilation et contrôle du diff.
- Données fictives uniquement : démo sans écriture, nom littéral long après rechargement, compteurs/destinations, soumission unique, filtres et état vide, preuves, confirmations et bibliothèque de 1 000 photos. Cibles d'au moins 48 px vérifiées sur l'accueil hors onboarding et la recherche avec photos/filtres ouverts.
- Assistant et le dernier dialogue sont traités dans la tranche décrite plus bas. Appareils physiques, lecteur d'écran, contrastes complets et comptes externes réels ne sont pas validés. Les limites historiques PDF et tests du choix des sources restent signalées dans les tranches précédentes.

### Validation des corrections de cohérence E5.a–d
- 111 scénarios UX/accessibilité validés : inventaire, foyer, gestion/import, recherche unifiée, onboarding, dialogues, visite et 42 audits sur les dix vues aux quatre largeurs. Après un premier passage à 108/111, les cinq tests des sources passent avec des attentes adaptées au dialogue d'un seul fournisseur (qui peut n'avoir que la fermeture active).
- Deux scénarios OneDrive supplémentaires passent : indisponibilité sans configuration et copies de deux comptes simulés préservées/recherchables. Les tests suivent le nouveau passage par Importer puis le retour explicite vers Recherche. Le scénario de documents utilise un fichier à métadonnées seules, sans attendre une photo dans la liste documentaire.
- Cinq tests unitaires du moteur documentaire, compilation et chargement/décodage des images Maison/pompe/piscine dans la version compilée réussis. Les flux de données et les permissions n'ont pas changé. Une erreur de sélection des champs masqués dans l'audit ciblé d'import a été corrigée dans le test ; les boutons visibles restent contrôlés à au moins 48 px.
- Les données de validation sont fictives. Pas d'essai physique, de compte cloud réel, de lecteur d'écran ni de mesure complète des contrastes dans cette tranche ; l'export PDF historique reste hors périmètre.

### 3. Importer
- **Identité** : thème chaleureux `ui-warm`, cartes crème et accents ambrés ; en-tête compact et trois repères de parcours, sans visite imposée ni étapes artificiellement validées. Quatre cartes de sources avec les icônes existantes, sur une colonne jusqu'à 700 px et deux au-delà. Le choix local reste prioritaire et accessible dès le premier écran aux quatre largeurs testées ; les formats sont repliables avec un indicateur d'ouverture.
- **Contenu** : appareil, Google Drive, OneDrive personnel et Dropbox, disponibilité réelle des connecteurs et explications avant connexion. Options locales secondaires : dossier, capture et saisie manuelle. Les originaux ne sont pas déplacés ni supprimés.
- **Interactions** :
  - « Choisir des fichiers » est un bouton utilisable au clavier ; sélection ou dépôt → traitement local existant et ouverture de **Recherche**, en conservant la question si l'ajout y a été demandé. Le toast de progression global est conservé ; le suivi local et son bilan restent consultables en revenant dans **Importer**.
  - Le suivi local utilise les événements réels du worker : exploration indéterminée ou progression des fichiers traités (réussis ou non), compte indexé, échecs, interruption, avertissements de métadonnées et de vignettes. Aucun délai ajouté ni progression automatique. Une sélection refusée affiche son erreur sans ajout ; une fiche manuelle n'affiche une confirmation qu'après sauvegarde.
  - Le bilan local survit à la disparition du toast et à la navigation, mais pas au rechargement ; les ajouts simultanés ne sont pas regroupés. Il ne représente ni l'inventaire complet ni le suivi cloud, qui reste dans les options de chaque fournisseur.
  - Dossier sur navigateur de bureau compatible → sélecteur de dossier ; sur navigateur mobile détecté ou plateforme native → sélection multiple avec explication. La capture utilise le sélecteur photo existant ; aucun OCR mobile réel n'est validé ici.
  - Le défilement reste dans le contenu principal, au-dessus du menu mobile. Le conteneur d'import sert de repère de positionnement aux sélecteurs invisibles, afin qu'ils n'agrandissent pas la page sous le menu.
  - « Saisir manuellement » → `ui-dialog` nommé, champs et boutons partagés, titre requis, choix du type et contenu facultatif. Annuler/Échap supprime le dialogue sans écriture et restaure le focus ; enregistrer attend le stockage, annonce les erreurs et conserve la saisie pour réessayer.
  - La saisie crée une fiche texte locale, pas un PDF original : le nom en `.pdf` reste celui du modèle existant, sans génération de fichier.
  - « Options Google Drive » / « Options OneDrive » / « Options Dropbox » → dialogue partagé limité au fournisseur choisi. Il conserve les contrôles de connexion et d'indexation existants, sans les déclencher à l'ouverture. Fermeture par Échap/bouton/fond et retour du focus ; les permissions restent distinctes selon le fournisseur. Les options restent consultables lorsqu'un connecteur n'est pas disponible, mais ne permettent pas de le connecter.
  - Les états affichés réutilisent la disponibilité Google et les états de session/action OneDrive et Dropbox, sans nouveau compte, accès ou synchronisation. Une configuration présente ne prouve pas qu'un compte réel a été validé.
  - « Voir mes fichiers » → inventaire ; « Ouvrir la recherche » → Recherche. Les raccourcis d'ajout d'Accueil, Recherche et Vos données convergent vers Importer, avec retour explicite vers leur écran d'origine. Une entrée directe dans Importer ne présente pas de faux retour.
- **Validation de l'harmonisation du lot D** : 39 scénarios navigateur réussis (14 gestion/import, 19 Accueil/Recherche et 6 audits Importer/contrastes) et build Vite réussi. Quatre largeurs 390/768/1280/1920 px, bouton principal au premier écran, clavier/focus des dialogues, cibles de 48 px, absence de débordement et données inchangées à la consultation. Progression immobile pendant une lecture bloquée, bilan conservé après le toast, refus de sélection sans ajout, échec partiel, avertissements photo, interruption entre lots et reprise par un nouvel ajout vérifiés. Inspection visuelle et mouvement réduit à 390/1280 px dans un navigateur isolé. Appareils physiques, lecteur d'écran et comptes réels restent à valider.

### 4. Maison
- **Identité** : thème chaleureux `ui-warm`, carnet illustré d'ouverture, cartes crème et accents ambrés. L'action d'ajout reste dans l'en-tête (icône nommée sur smartphone). L'illustration de maison reste visible sur mobile ; l'adresse facultative vient du profil et disparaît si elle est effacée. Les cartes équipement réutilisent les images locales de catégorie disponibles (pompe, piscine, pergola, volets/store, chauffage/chaudière), sinon une icône ; une colonne sur petit écran, deux sur grand écran.
- **Provenance des visuels** : la maison et les équipements sont explicitement présentés comme des illustrations, pas des photos du foyer. Aucun import, association ni stockage de photo personnelle n'est ajouté.
- **Contenu** : équipements avec nom, statut explicitement saisi et nombre de références documentaires associées ; une référence peut être indisponible sur cet appareil. Compteur annoncé et huit filtres de catégorie défilants horizontalement. Aucun diagnostic ou état de garantie n'est déduit. Pas de recherche inline implémentée.
- **Interactions** :
  - Équipement → **Détail équipement**, avec identifiant dans l'URL.
  - « Ajouter un équipement » → formulaire partagé (nom, catégorie, statut), fermeture par bouton ou Échap avec retour du focus.
  - Filtres → `aria-pressed`, URL, rechargement et historique cohérents ; filtre inconnu affiché comme « Tout ».
  - Carnet vide → invitation « Votre carnet commence ici » et bouton « Ajouter mon premier équipement » vers le formulaire existant. Une catégorie vide dans un carnet renseigné propose « Voir tous les équipements », avec retour du focus sur « Tout ». L'ajout reste disponible dans l'en-tête.
  - « Modifier dans le profil » → **Profil**, qui conserve pour l'instant sa palette précédente.

### 5. Détail équipement (sous-vue)
- **Contenu** : thème chaleureux et trois sections : « Ses repères » (illustration de catégorie, catégorie et statut saisi), « Ses papiers » (références liées, provenance des copies et accès aux originaux non garanti), « Ce qui mérite votre attention » (rappels actifs des seuls documents associés). L'identifiant interne n'est plus présenté comme une référence fabricant ; aucune installation, garantie ou échéance absente n'est inventée.
- **Rappels** : titre, détail et date enregistrés, document associé et extrait disponible. Une date illisible est explicitement à vérifier ; une source à réexaminer et un report restent signalés. Les rappels terminés ou sans lien avec les documents de l'équipement sont exclus. L'absence de rappel ne garantit pas l'absence d'échéance.
- **Interactions** :
  - Fil d'Ariane → **Maison** ; document lié → aperçu existant ou message d'indisponibilité.
  - « Modifier ses informations » → formulaire prérempli ; les liens documentaires sont conservés et le focus revient à l'action.
  - « Rechercher ses documents » → Recherche avec le nom de l'équipement ; cette action n'associe pas automatiquement les résultats.
  - « Voir le rappel dans Alertes » → catégorie correspondante, notamment « Reportées » pour un report encore actif.
  - « Supprimer cet équipement » → confirmation native existante, puis retour Maison ; annuler conserve la fiche. Cette action est distincte de la consultation des papiers et rappels.
  - Les anciens boutons simulés de liaison et d'historique sont retirés. L'association de nouveaux documents reste explicitement indisponible ; les liens déjà enregistrés restent consultables.
  - Fiche absente ou route sans identifiant → état explicite et retour Maison, sans conserver le nom ni les informations de la fiche précédente.
  - Les erreurs d'enregistrement sont affichées dans le formulaire, qui reste ouvert.
- **Validation de la tranche Maison** : 36 scénarios navigateur et build réussis, dont quatre largeurs de référence, gestion des équipements, état vide, documents absents, preuves littérales, reports et conservation du stockage à la consultation. Images et contrastes textuels des fiches, mouvement réduit et rendu visuel vérifiés à 390/1280 px dans un navigateur isolé. Appareils physiques et lecteur d'écran non revalidés.

### 6. Alertes (issue du menu «Plus»)
- **Identité** : thème chaleureux `ui-warm`, fond ivoire, cartes crème arrondies et accents ambrés. Les couleurs d'urgence restent sur le liseré, l'icône et l'état textuel plutôt que sur toute la carte. Chronologie en liste ordonnée avec repères décoratifs ; largeur de lecture limitée à 960 px.
- **Contenu** : cinq filtres avec compteurs (à traiter, à anticiper, à surveiller, reportées, ignorées / terminées), titre de période et résumé annoncé. Chaque catégorie est triée par échéance croissante, sauf les reports triés par reprise ; l'historique utilise aussi l'échéance, pas une date de clôture inexistante. Dates normalisées pour l'affichage, repères relatifs et date précise dans un `time` ; dates absentes ou invalides explicitement signalées en fin de liste. Aucune modification des dates enregistrées ni des seuils de classement.
- **Preuves et états vides** : extrait littéral surligné sans interprétation HTML, provenance compacte et limites d'accès conservées. Les exemples liés aux documents fictifs intégrés restent identifiés ; les autres alertes sans provenance documentaire indiquent « Source non renseignée ». Une première utilisation propose l'ajout d'un document ou la recherche d'une échéance ; une catégorie vide propose une autre catégorie non vide lorsqu'elle existe. Aucune promesse de couverture complète ou de foyer « à jour ».
- **Interactions** :
  - « Voir la copie » nommé avec le titre du rappel → aperçu de la copie disponible. Si elle manque, « Voir mes fichiers » → inventaire, sans tenter d'ouvrir une copie absente.
  - « Gérer cette alerte » → ignorer, terminer, reporter ou réactiver selon l'état, marquer lue/non lue, corriger la date d'une alerte documentaire. La lecture est temporaire, réinitialisée au prochain rendu ; cliquer sur la carte ne change plus implicitement cet état.
  - Une copie absente, ambiguë, modifiée ou de provenance invalide lors de la réévaluation locale conserve l'alerte et affiche « Source à vérifier » avec sa raison. Aucune nouvelle notification pour cette alerte tant qu'elle reste à vérifier. L'ancienne date et la preuve restent visibles ; « Réexaminer les preuves dans Recherche » ouvre le parcours existant. L'accès à l'original n'est jamais garanti par une copie locale.
  - Une correction ou confirmation explicite adopte la nouvelle date et conserve statut et report, y compris pour une échéance hors des seuils. Les échéances déjà confirmées ne sont pas automatiquement reproposées : consulter la copie puis utiliser la correction manuelle. La suppression volontaire d'un document avec son alerte liée et la purge générale gardent leur fonctionnement existant.
  - Filtres → URL conservée dans l'historique et au rechargement ; après une mise à jour, retour du focus au filtre actif.
  - Roue des réglages → dialogue des notifications, catégories et plages silencieuses. Aucune demande automatique de permission ; fermeture par bouton, Échap ou fond extérieur, avec retour du focus.
- **Composants partagés** : `ui-card`, `ui-icon`, `ui-button`, `ui-input`, `ui-label`, `ui-dialog`. Filtres sélectionnés et lecture exposés avec `aria-pressed` ; résumé de liste annoncé avec `role="status"`. Cibles de 48 px, filtres défilants horizontalement sur mobile et actions repliées pour privilégier les échéances.
- **Validation** : `tests/alerts-ui.spec.js` couvre les quatre largeurs de référence, réglages, refus de permission simulé, persistance, reports, historique, clavier, noms longs, correction et aperçu. Contrastes mesurés sur une carte critique et ses actions ; audit complet, lecteur d'écran et essais sur appareils réels restent nécessaires.
- **Consolidation E/D** : 11 scénarios Alertes et dix scénarios recherche/preuves passent, dont import TXT fictif → recherche → preuve → confirmation → alerte persistante → purge à 390 et 1280 px. Copie modifiée/invalide/absente et correction éloignée vérifiées. Deux tests mesurent aussi les textes visibles des dix vues à 390 et 1280 px ; les 42 contrôles de cibles, noms, débordement, clavier et mouvement réduit restent verts. Ces mesures n'incluent pas tous les états dynamiques, les contrastes non textuels ni les fonds photographiques ; clavier virtuel réel, lecteur d'écran et appareils physiques non validés.
- **Harmonisation chaleureuse du lot D** : 28 scénarios navigateur réussis (14 Alertes, 6 audits Alertes/contrastes et 8 parcours liés Recherche/Accueil/fiches équipement) et build Vite réussi. Ordre chronologique sans écriture, dates inconnues explicites, reprise des reports, échéance initiale conservée, lecture collective temporaire, preuve littérale et trois destinations d'états vides couverts. Les quatre largeurs conservent une première carte compacte, des actions de 48 px et aucun débordement sous le menu. Inspection visuelle mobile/bureau et mouvement réduit dans un navigateur isolé ; appareils physiques, lecteur d'écran et notifications système réelles restent à valider.

### 7. Famille (issue du menu «Plus»)
- **Identité** : thème chaleureux `ui-warm`, panneau crème « Votre cercle », cartes arrondies et avatars ambrés. Deux colonnes sur smartphone, grille adaptée au bureau et panneaux secondaires côte à côte au-delà de 700 px. Action « Personnaliser » dans l'en-tête, nom accessible conservé en mode icône ; compteur annoncé et liste nommée.
- **Contenu** : uniquement les membres enregistrés et les noms choisis par l'utilisateur, avec avatar texte existant ou initiale et repère « Vous » pour le profil courant. Les cartes ne sont pas des boutons. Aucun badge ni contrôle de droits ; la note locale précise qu'aucun compte ni partage n'est créé. Le cercle vide invite à ajouter directement un premier proche, sans famille préremplie.
- **Interactions** :
  - « Personnaliser » → dialogue « Votre cercle familial », puis ajout/édition : nom à afficher et date de naissance facultative. Le formulaire refuse un nom blanc explicitement ; le nom est conservé littéralement, sans interprétation HTML. Les anciens champs internes, dont rôle et accès, restent enregistrés sans être présentés comme des permissions opérationnelles.
  - Au renommage, l'initiale automatique est actualisée, mais un avatar personnalisé est conservé. Aucun nouvel éditeur d'avatar ni chargement d'image distante.
  - En cas d'échec de sauvegarde, erreur visible et saisie conservée pour réessayer ; aucune confirmation de succès anticipée.
  - Suppression → confirmation native existante ; annuler préserve le membre et ses associations. La suppression confirmée conserve le mécanisme de nettoyage des associations photo.
  - Fermeture par bouton/Échap et retour du focus au lanceur ; après sauvegarde, retour à l'action d'édition ou d'ajout dans le gestionnaire, ou à « Personnaliser » après le premier ajout direct.
  - Contrats, Factures, Garanties et Notices → inventaire filtré ; « Voir tout » → inventaire complet. Aucun partage automatique.
  - L'ancien Mode urgence illustratif est retiré. La carte souvenirs explique l'association manuelle des personnes dans le détail d'une photo et ouvre Recherche, sans filtre inventé ni reconnaissance faciale.
- **Validation** : 22 scénarios navigateur réussis (13 foyer/fiches, 6 audits Famille/contrastes et 3 parcours photo/Recherche), 7 tests Node ciblés et build Vite réussi. Quatre largeurs 390/768/1280/1920 px, dialogues à 390 × 660 px, cibles de 48 px, focus, état vide, erreur de stockage puis nouvelle tentative, noms longs/littéraux, avatars, conservation des champs internes et persistance couverts. Renommage et suppression annulée/confirmée préservent les autres associations photo. Consultation sans écriture vérifiée. Inspection visuelle mobile/bureau et mouvement réduit dans des contextes isolés ; document limité au viewport et contenu accessible au-dessus du menu. Appareils physiques, clavier virtuel, lecteur d'écran et audit complet des contrastes non textuels restent à valider.

### 8. Assistant (issue du menu «Plus»)
- **Identité** : thème chaleureux `ui-warm`, cartes crème, accents ambrés et promesse « Un coup de main pour comprendre vos documents. » La saisie précède les idées et les réponses ; elle est visible dès le premier écran aux quatre formats. Les échanges se déroulent dans le contenu principal, sans hauteur imposée ni défilement imbriqué qui comprime les preuves sur smartphone.
- **Contenu réel** : moteur documentaire local existant, montant/date/référence repérés dans le texte disponible, statut de vérification et jusqu'à deux sources. Une réponse factuelle présente d'abord la ligne retenue, sans répéter le nom du fichier ; chaque carte place ensuite passage surligné, nom, provenance et action. Un passage rapproché non factuel reste « à vérifier » ; sans preuve, aucun surlignage n'est inventé. Sans fichier chargé, les exemples sont annoncés ; après lecture de la base, le périmètre est réactualisé. Aucun appel à une IA distante ni synthèse multi-documents.
- **Assistant ou Recherche ?** : volet natif dépliable au clavier. Ici, une question documentaire précise ; dans Recherche, exploration des fichiers et photos avec filtres. L'indépendance de chaque question est rappelée près du champ : aucune mémoire contextuelle entre questions, même si les échanges restent affichés. Pas d'action automatique.
- **Interactions** :
  - Soumission par bouton ou Entrée → réponse et preuves dans la conversation, sans délai simulé ; le focus reste dans le champ.
  - Suggestion montant/date/référence → prépare une question à adapter à ses documents et referme les idées, sans soumettre ni déclencher la recherche de l'autre écran.
  - Copie disponible → dialogue d'extrait partagé, distinction avec l'original et retour du focus au bouton. Une copie devenue indisponible est signalée explicitement.
  - Question blanche → message et focus ; erreur locale → message, question conservée et nouvelle tentative possible. Ambiguïtés, absence de preuve ou de résultat restent explicites.
  - La conversation reste dans la page lors d'une navigation et disparaît au rechargement ; aucun historique n'est persisté.
  - « Rechercher » → recherche unifiée pour les filtres multi-sources et annotations photo ; en l'absence de résultat ou de copie textuelle, « Explorer dans Recherche » ouvre aussi cette vue sans recherche cachée ni écriture. L'Assistant ne prétend pas utiliser ce moteur photo.
  - « Poser une autre question » → focus et retour au champ. La réponse ajoutée est mise en vue dans le défilement principal ; le champ conserve son focus après envoi sans forcer le retour en haut.
- **Dernier dialogue applicatif** : l'ancien aperçu de scan, sans point d'entrée ni traitement relié, adopte `ui-dialog`, avec champs désactivés et case non précochée. Aucun bouton d'autorisation ni nouveau scan ; fermeture nommée, Échap et retour du focus. Les confirmations natives des suppressions et échéances restent inchangées.
- **Validation de l'harmonisation** : 22 scénarios navigateur passent (9 Assistant, 6 audits Assistant/contrastes, 1 navigation Plus et 6 visites), 5 tests Node du moteur documentaire et build réussis. Quatre largeurs, petite hauteur 390 × 480, noms longs, preuve littérale non interprétée, ordre preuve/source/action, source sans texte, navigation, clavier/focus, erreur/reprise et absence d'écriture couverts. Inspection visuelle mobile/bureau, mouvement réduit, contrastes des réponses et absence de défilement sous le menu vérifiés en contexte isolé. Le test d'aperçu accepte la casse du document d'exemple existant, sans changer son contenu. La validation historique bleu/marine comptait 131 tests navigateur ; elle n'est pas assimilée à la suite ciblée actuelle.
- **Limites** : appareils physiques, clavier virtuel réel, lecteur d'écran et audit complet des contrastes non textuels restent à vérifier. Comptes réels et scan automatique non validés ici. L'Assistant enrichi (index commun, compréhension/synthèse, actions confirmées, suivi proactif) est un chantier de conception séparé du plan actif ; aucun modèle, reconnaissance faciale ou paiement n'est ajouté par cette refonte.

### 9. Profil (issue du menu «Plus»)
- **Identité** : thème chaleureux, carte crème, avatar texte ou initiale ambrée, nom choisi et introduction courte. Colonne secondaire sur grand écran, empilement sous 900 px. L'adresse facultative est repliée par défaut ; code postal et ville restent côte à côte hors mobile.
- **Contenu** : nom d'affichage, adresse utilisée dans Maison et consentement GPS fonctionnel. Aucun rôle affiché, compte créé, partage ni nouvelle permission. Le bouton de profil de l'en-tête ouvre réellement cette vue.
- **Interactions** :
  - Formulaire renseigné depuis l'état sur route directe, après chargement de la base et depuis toute navigation (y compris Maison). Champs vides conservés, nom constitué d'espaces refusé avec message et focus.
  - Enregistrement par bouton ou Entrée → sauvegarde attendue avant publication de l'identité ; bouton désactivé pendant l'opération et résultat annoncé. Nom blanc refusé explicitement. Avatar personnalisé conservé, initiale automatique actualisée.
  - Les contrôles de télémétrie/partage et l'aperçu non relié d'accès local, scan automatique, répertoires et connexion Drive sont retirés. Rôle, anciennes préférences, consentements et métadonnées restent enregistrés sans être réinitialisés lors d'un renommage.
  - GPS : prochains imports uniquement, sans relecture automatique des copies. Désactiver conserve la purge locale existante des coordonnées/faits/index et ne modifie aucun original. En cas d'erreur, la saisie reste disponible et la case reflète le consentement réellement enregistré ; des coordonnées déjà effacées ne sont pas restaurées.
  - « Vos fichiers et vos rappels » conserve les accès aux données et ajoute des raccourcis vers Importer et Alertes. « Un coup de main » réunit « Revoir la découverte » et « Visiter les autres vues », sans aide imposée.

### 10. Vos données (issue du menu «Plus»)
- **Contenu** : fichiers enregistrés dans Famili-IA, issus de l'appareil, Google Drive, OneDrive ou Dropbox, avec provenance et couverture. Sans fichier personnel, les exemples intégrés restent disponibles et sont explicitement distingués des données de l'utilisateur. L'inventaire ne représente pas l'ensemble des comptes.
- **Présentation** : thème chaleureux `ui-warm`, fonds ivoire, cartes crème et accents ambrés. En-tête compact avec ajout principal et rappel du maintien des originaux à leur emplacement. Le panneau « Ce que vous retrouvez ici » privilégie le nombre et la nature des éléments visibles ; les détails des sources sont secondaires et dépliables. Les filtres et l'inventaire occupent la largeur de lecture ; la première ligne reste entièrement visible à 390 × 800 px. Chaque fichier conserve ses badges de type, provenance et couverture (« Texte indexé » ou « Métadonnées seules »). Une date absente indique « Date non renseignée », pas « Session ». Les filtres défilent horizontalement sur smartphone et l'ajout devient un « + » nommé.
- **Sources, contrôle et limites** : volet natif utilisable au clavier, cinq origines avec compteurs dont Dropbox et exemples. Réutilisation des états de parcours et d'accès existants : terminé pour un périmètre, partiel, interrompu, en cours ou en erreur. Le dernier parcours connu ne remplace ni une date manquante par aujourd'hui, ni un contrôle par la date d'import/modification. L'empreinte locale précise le compte concerné lorsqu'elle est connue ; les nombres peuvent regrouper plusieurs comptes. L'absence de parcours reste explicite, et un échec de lecture/enregistrement des états est visible hors du volet. Aucun parcours ne garantit accès actuel, actualisation des copies ou exhaustivité.
- **Interactions** :
  - « Ajouter des fichiers » → choix des sources existant. L'import local conserve sa navigation vers Recherche ; revenir à Vos données affiche les nouvelles copies.
  - « Export et suppression », sous l'inventaire, sépare export, sessions/autorisations et suppression locale. Export JSON → téléchargement détaillé existant, sans originaux et avec les exclusions GPS existantes. Rapport PDF → bilan chiffré d'une page, sans noms personnels, coordonnées GPS ni originaux ; ce n'est pas une sauvegarde détaillée. Bouton désactivé pendant la génération réelle, erreur visible et possibilité de réessayer.
  - « Supprimer toutes mes données » → **confirmation explicite**, avec focus initial sur « Annuler » ; la purge vise les données applicatives, arrête les scans actifs et ne supprime jamais les originaux locaux, Google Drive, OneDrive ou Dropbox. Les copies locales, la déconnexion de session et la révocation fournisseur restent des notions distinctes. Aucun changement de logique de suppression.
  - « Aperçu » → texte documentaire, avec distinction copie/exemple. « Détail » d'une photo → vignette locale si disponible, métadonnées et limite de l'original. « Associer » → formulaire d'annotations manuelles, sans reconnaissance visuelle ; après enregistrement depuis l'inventaire, retour du focus au bouton de la photo.
  - Chips de type et catégorie → filtres partageables dans l’URL, restaurés avec Retour navigateur. Un compteur annonce le nombre affiché ; l'état vide propose de réinitialiser les filtres et replace le focus sur « Tout ».
  - Les filtres de type et de provenance de la recherche réutilisent les mêmes règles que l'inventaire
- **Modales partagées** : `ui-dialog`, en-tête et fermeture communs ; champs `ui-input`/`ui-label`, boutons `ui-button`, variante `ui-button--danger` pour confirmer une suppression. Le dialogue natif conserve Échap et le retour du focus ; les contrôles font au moins 48 px, avec défilement interne sur écran court.
- **Validation** : 27 scénarios navigateur réussis (20 inventaire/parcours photo, 6 audits Vos données/contrastes et 1 parcours Dropbox avec purge), 17 tests Node ciblés et build Vite réussi. Quatre largeurs, première ligne complète à 390 × 800 px, cibles de 48 px, volet et formulaires au clavier, filtres/historique, noms longs/littéraux, annotations et bibliothèque de 1 000 photos couverts. Dates de parcours distinctes de l'import/modification, comptes multiples, absence/erreur de contrôle sans écriture ni appel fournisseur vérifiées. Le PDF téléchargé est relu par le lecteur PDF existant : page et texte du bilan réels, absence des noms, erreur puis nouvelle tentative ; JSON et confirmations/purge restent opérationnels. Inspection visuelle mobile/bureau et mouvement réduit dans des contextes isolés. Le titre de filtre invisible reste ancré dans son panneau pour ne pas étendre le document quand les sources sont dépliées.
- **Limites** : le PDF est un bilan chiffré, pas l'intégralité des données du JSON. Appareils physiques, téléchargement natif, lecteur d'écran, audit complet des contrastes non textuels et connexions réelles restent à valider.

### 11. Écran «Plus» *(nouveauté 9.16)*
- **Contenu** : cinq cartes crème avec icônes SVG ambrées et compteurs existants, sans troncature des sous-titres. Deux groupes : « Au quotidien » (Alertes, Famille, Assistant) et « Votre espace » (Profil, Vos données). Les descriptions ne suggèrent plus des permissions ou un partage familial opérationnel.
- **Interactions** :
  - Tap destination → navigation correspondante (le menu «Plus» perd son état actif, la vue d'origine reprend l'état actif au retour)
  - Bouton retour → vue d'origine

### Validation de l'harmonisation Profil / Plus
- 60 scénarios navigateur réussis : 16 gestion/import/profil, 13 foyer/fiches, 14 Alertes, 6 visite des vues, 10 audits Profil/Plus/contrastes et 1 rejeu de découverte. Build Vite réussi.
- Quatre largeurs, cibles de 48 px, clavier/focus, noms longs/littéraux, avatars, champs facultatifs, erreurs de sauvegarde et reprise, conservation des anciennes valeurs et purge GPS interrompue puis reprise couverts. Les cinq destinations de Plus et les raccourcis Profil n'écrivent pas dans les données à la navigation.
- Inspection visuelle mobile/bureau et mouvement réduit dans des contextes isolés ; adresse fermée/ouverte et absence de défilement sous le menu vérifiées. Appareils physiques, lecteur d'écran et connexions réelles restent à valider.

### Validation historique de la tranche Importer / Profil / Plus
- `tests/management-ui.spec.js` : onze scénarios passent, dont les quatre largeurs 390, 768, 1280 et 1920 px, la saisie à 390 × 480 px, clavier/focus, annulation, stockage indisponible et reprise, import TXT fictif, profil persistant et navigation depuis Plus.
- Douze audits ciblés Importer/Profil/Plus et 49 tests de non-régression (foyer, Alertes, données, onboarding, extraits et visite guidée), ainsi que la compilation, complètent cette validation.
- Le repli de dossier mobile est simulé par user-agent ; il ne valide ni le sélecteur natif ni la caméra sur appareil réel. Aucun compte externe réel n'est connecté pour ces tests.
- Le test historique `tests/source-choice-dialog.spec.js` conserve quatre échecs hors de cette refonte : trois attentes d'un ancien texte OneDrive et une comparaison de données avant/après migration automatique d'index. Le dialogue et ces mécanismes n'ont pas été modifiés dans cette tranche ; l'ouverture/fermeture depuis Importer est vérifiée séparément.
- Appareils physiques, lecteur d'écran, contrastes complets et connexions réelles restent à vérifier. Les tranches Accueil/Recherche et Assistant/dernier dialogue sont décrites plus haut.

---

## 🗺️ Graphe de Navigation

```mermaid
graph TD
    BB["Barre basse<br/>(Accueil · Recherche · Importer · Maison · Plus)"]

    ACC["Accueil"]
    REC["Recherche"]
    IMP["Importer"]
    MAI["Maison"]
    PLUS["Menu Plus"]

    DET["Détail équipement"]
    AL["Alertes"]
    FAM["Famille"]
    AS["Assistant"]
    PRO["Profil"]
    VD["Vos données"]

    BB --> ACC
    BB --> REC
    BB --> IMP
    BB --> MAI
    BB --> PLUS

    ACC -->|bannière alertes| AL
    ACC -->|FAB / "+"| IMP
    ACC -->|cards stats| MAI
    ACC -->|card stat| VD
    ACC -->|card stat| FAM

    REC -->|0 résultat CTA| IMP
    REC -->|lier doc à équipement| MODAL["Modale choix équipement"]
    MODAL -.-> DET

    IMP -->|fin de flux| ACC

    MAI -->|tap équipement| DET
    DET -->|"Ajouter un doc"| IMP
    DET -->|alerte équipement| AL

    PLUS --> AL
    PLUS --> FAM
    PLUS --> AS
    PLUS --> PRO
    PLUS --> VD
    PRO -->|lien| VD

    classDef bottomfill:#f1f1f1,stroke:#171717,stroke-width:2px;
    classDef sub fill:#fff3e0,stroke:#d97706,stroke-width:2px;
    class ACC,REC,IMP,MAI,PLUS bottom;
    class DET,AL,FAM,AS,PRO,VD sub;
```

---

## 📊 Priorités d'implémentation (Mise à jour 9.16)

1. **Accueil** — rendu contextuel (bannière alertes, stats, récents) : déjà implémenté à adapter aux nouveaux raccourcis
2. **Importer** — repositionné au centre de la barre basse (structure + style)
3. **Menu «Plus»** — à créer (vue `#/plus`, rendu, badges, routing retour)
4. **Recherche** — CTA «Importer» en cas de résultat vide
5. **Maison / Détail** — fil «+ Ajout d'un document» pré-rempli sur l'équipement (à reprendre avec la tâche 10.7.c déjà existante)