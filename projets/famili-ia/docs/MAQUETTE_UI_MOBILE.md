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
   - Tout ce qui n'est pas quotidien : **Alertes** (détail), **Famille** (membres/rôles), **Assistant** (conversation), **Profil** (identification/paramètres), **Vos données** (inventaire, export, purge).

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
- **Identité** : en-tête bleu/marine, raccourcis dans une carte claire légèrement teintée, compteurs et contrôles partagés. Aucun formulaire de recherche ni bouton flottant : Accueil reste un tableau de bord.
- **Contenu réel** : accueil nominatif, raccourcis Recherche et Importer, démo fictive, trois compteurs (fichiers visibles, garanties, contrats), aperçu de trois rappels actifs au maximum et accès au foyer. Aucun compteur approximatif, document récent ou garantie « active » n'est inventé.
- **Périmètre** : les compteurs reprennent l'inventaire visible, avec exemples intégrés en repli lorsqu'aucun fichier n'est enregistré ; les exemples sont signalés et ne sont pas recherchés dans l'index personnel. Profils et équipements peuvent encore contenir les exemples initiaux du prototype.
- **Interactions** :
  - « Ouvrir la recherche » → vue **Recherche**, avec focus dans le formulaire unique. L'Assistant reste accessible séparément, sans nouveau raccourci concurrent sur Accueil.
  - « Ajouter des fichiers » → **Importer** ; « Essayer un exemple fictif » → démo rejouable, sans permission ni écriture de données applicatives.
  - Compteurs → **Vos données**, avec filtre Garantie ou Contrat correspondant si nécessaire.
  - Rappel ou « Toutes les alertes » → **Alertes** ; l'aperçu inclut les rappels reportés, sans prétendre couvrir toutes les échéances.
  - « Ma maison » / « Ma famille » → destinations correspondantes.

### 2. Recherche unifiée
- **Contenu réel** : en-tête compact et ajout, formulaire unique, périmètre explicite et résultats prioritaires. Filtres repliables (source, type, couverture, dates, personne, lieu), sources et échéances expérimentales se consultent séparément. Aucune reconnaissance visuelle ni couverture de tout l'appareil/cloud n'est annoncée.
- **Interactions** :
  - Un seul raccourci « Ajouter des fichiers », dans l'en-tête, mène à **Importer**. Aucun bouton d'ajout flottant. Le retour explicite restaure la vue et le focus du raccourci ; question courante et filtres restent présents. Un import local lancé depuis ce parcours conserve aussi la question au retour dans Recherche.
  - Soumission → résultats dans la même vue, provenance et preuves conservées ; les volets repliés ne modifient pas les filtres appliqués.
  - Copie disponible → aperçu local existant, sans prétendre ouvrir l'original. Les photos conservent détail, annotations, regroupement, pagination et sélection/suppression confirmée.
  - « Effacer les filtres » conserve la question ; le bouton d'état vide efface aussi la question. Le focus revient au champ et l'état initial explique comment commencer.
  - « Sources et limites de la recherche » → état réel des sources et limites de couverture/fraîcheur ; « Échéances proposées — expérimental » → preuves et confirmation explicite existante avant création d'alerte.

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
- **Identité** : en-tête compact et socle bleu/marine de l'onboarding ; trois cartes de sources avec les icônes officielles existantes, empilées jusqu'à 900 px et sur trois colonnes au-delà. Le choix local reste prioritaire et les formats sont repliables.
- **Contenu** : appareil, Google Drive et OneDrive personnel, disponibilité réelle des connecteurs et explications avant connexion. Options locales secondaires : dossier, capture et saisie manuelle ; le doublon « Plusieurs fichiers » est retiré. Les originaux ne sont pas déplacés ni supprimés.
- **Interactions** :
  - « Choisir des fichiers » est un bouton utilisable au clavier ; sélection ou dépôt → traitement local existant, progression dans **Recherche**, puis consultation depuis **Vos données**.
  - Dossier sur navigateur de bureau compatible → sélecteur de dossier ; sur navigateur mobile détecté ou plateforme native → sélection multiple avec explication. La capture utilise le sélecteur photo existant ; aucun OCR mobile réel n'est validé ici.
  - « Saisir manuellement » → `ui-dialog` nommé, champs et boutons partagés, titre requis, choix du type et contenu facultatif. Annuler/Échap supprime le dialogue sans écriture et restaure le focus ; enregistrer attend le stockage, annonce les erreurs et conserve la saisie pour réessayer.
  - La saisie crée une fiche texte locale, pas un PDF original : le nom en `.pdf` reste celui du modèle existant, sans génération de fichier.
  - « Options Google Drive » / « Options OneDrive » → dialogue partagé limité au fournisseur choisi. Il conserve les contrôles de connexion et d'indexation existants, sans les déclencher à l'ouverture. Fermeture par Échap/bouton/fond et retour du focus ; les permissions restent distinctes selon le fournisseur. Les options restent consultables lorsqu'un connecteur n'est pas disponible, mais ne permettent pas de le connecter.
  - Les états affichés réutilisent la disponibilité Google et l'état de session/action OneDrive, sans nouveau compte, accès ou synchronisation. Une configuration présente ne prouve pas qu'un compte réel a été validé.
  - « Voir mes fichiers » → inventaire. Les raccourcis d'ajout d'Accueil, Recherche et Vos données convergent vers Importer, avec retour explicite vers leur écran d'origine. Une entrée directe dans Importer ne présente pas de faux retour.

### 4. Maison
- **Identité** : en-tête aligné à gauche, palette bleu/marine, cartes partagées et action d'ajout dans l'en-tête (icône nommée sur smartphone). L'illustration de maison reste visible sur mobile ; l'adresse vient du profil. Les équipements réutilisent les images locales de catégorie disponibles (pompe, piscine, pergola, volets/store, chauffage/chaudière), sinon une icône.
- **Provenance des visuels** : la maison et les équipements sont explicitement présentés comme des illustrations, pas des photos du foyer. Aucun import, association ni stockage de photo personnelle n'est ajouté.
- **Contenu** : équipements et compteur annoncé, huit filtres de catégorie défilants horizontalement. Pas de recherche inline implémentée.
- **Interactions** :
  - Équipement → **Détail équipement**, avec identifiant dans l'URL.
  - « Ajouter un équipement » → formulaire partagé (nom, catégorie, statut), fermeture par bouton ou Échap avec retour du focus.
  - Filtres → `aria-pressed`, URL, rechargement et historique cohérents ; filtre inconnu affiché comme « Tout ».
  - État vide → « Voir tous les équipements », avec retour du focus sur « Tout ». L'ajout reste disponible dans l'en-tête.
  - « Modifier dans le profil » → **Profil**, lui aussi harmonisé.

### 5. Détail équipement (sous-vue)
- **Contenu** : nom, catégorie, statut, référence et documents liés dans une carte partagée. L'installation inconnue est explicitement non renseignée ; aucun état de garantie ou historique réel n'est déduit.
- **Interactions** :
  - Fil d'Ariane → **Maison** ; document lié → aperçu existant ou message d'indisponibilité.
  - « Modifier » → formulaire prérempli ; les liens documentaires sont conservés et le focus revient à l'action.
  - « Supprimer » → confirmation native existante, puis retour Maison ; annuler conserve la fiche.
  - « Lier un document (démo) » et « Historique (démo) » → information de prototype, sans liaison ni historique opérationnels.
  - Les erreurs d'enregistrement sont affichées dans le formulaire, qui reste ouvert.

### 6. Alertes (issue du menu «Plus»)
- **Identité** : logo officiel recadré, bleu/marine et fond clair de l'onboarding ; ce thème est aussi utilisé par les autres vues déjà migrées. Cartes teintées rouge, ambre ou bleu selon l'urgence, avec état textuel et échéance ; largeur de lecture limitée à 960 px.
- **Contenu** : cinq filtres avec compteurs (à traiter, à anticiper, à surveiller, reportées, ignorées / terminées), résumé de la liste, preuves disponibles et état vide. Les exemples liés aux documents fictifs intégrés sont identifiés ; les autres alertes sans provenance documentaire indiquent « Source non renseignée ».
- **Interactions** :
  - Chevron nommé → aperçu du document lorsqu'il est disponible, sinon inventaire existant.
  - « Gérer cette alerte » → ignorer, terminer, reporter ou réactiver selon l'état, marquer lue/non lue, corriger la date d'une alerte documentaire. La lecture est temporaire, réinitialisée au prochain rendu ; cliquer sur la carte ne change plus implicitement cet état.
  - Filtres → URL conservée dans l'historique et au rechargement ; après une mise à jour, retour du focus au filtre actif.
  - Roue des réglages → dialogue des notifications, catégories et plages silencieuses. Aucune demande automatique de permission ; fermeture par bouton, Échap ou fond extérieur, avec retour du focus.
- **Composants partagés** : `ui-card`, `ui-icon`, `ui-button`, `ui-input`, `ui-label`, `ui-dialog`. Filtres sélectionnés et lecture exposés avec `aria-pressed` ; résumé de liste annoncé avec `role="status"`. Cibles de 48 px, filtres défilants horizontalement sur mobile et actions repliées pour privilégier les échéances.
- **Validation** : `tests/alerts-ui.spec.js` couvre les quatre largeurs de référence, réglages, refus de permission simulé, persistance, reports, historique, clavier, noms longs, correction et aperçu. Contrastes mesurés sur une carte critique et ses actions ; audit complet, lecteur d'écran et essais sur appareils réels restent nécessaires.

### 7. Famille (issue du menu «Plus»)
- **Identité** : composants partagés, cartes de membres sur deux colonnes sur smartphone, action principale « Gérer les membres » dans l'en-tête ; compteur annoncé et avatars sobres.
- **Contenu** : membres et niveaux d'accès déclaratifs locaux (complet/limité). Les cartes ne sont pas des boutons. Aucun compte réel, invitation ni partage familial n'est créé.
- **Interactions** :
  - « Gérer les membres » → dialogue partagé, puis ajout/édition dans un second dialogue : nom, date de naissance facultative et niveau d'accès. Les rôles existants sont conservés, sans éditeur de rôle ni modification des permissions.
  - Suppression → confirmation native existante ; annuler préserve le membre et ses associations. La suppression confirmée conserve le mécanisme de nettoyage des associations photo.
  - Fermeture par bouton/Échap et retour du focus au lanceur ; après sauvegarde, retour à l'action d'édition ou d'ajout dans le gestionnaire.
  - Contrats, Factures, Garanties et Notices → inventaire filtré ; « Voir tout » → inventaire complet. Aucun partage automatique.
  - Mode urgence → « À venir », explicitement non opérationnel ; « Découvrir » affiche seulement l'information de démonstration.
- **Validation foyer** : huit tests `tests/household-ui.spec.js` et huit audits Maison/Famille passent à 390, 768, 1280 et 1920 px ; formulaires également vérifiés à 390 × 660 px. Ajout, modification, suppression annulée/confirmée, persistance, rôles, documents liés, noms longs, erreurs explicites, focus et cibles de 48 px couverts avec des données fictives. 41 tests navigateur liés, un test unitaire familial et compilation passent. Appareils physiques, lecteur d'écran et audit complet des contrastes restent nécessaires.

### 8. Assistant (issue du menu «Plus»)
- **Identité** : en-tête compact, palette bleu/marine et composants partagés ; conversation défilable et focalisable au clavier, champ de question dans une carte, suggestions repliables. Le formulaire initial reste visible aux quatre formats de référence.
- **Contenu réel** : réponses issues du moteur documentaire local existant, statut de vérification, extraits et jusqu'à deux sources. Sans fichier chargé, un mode exemples fictifs est indiqué ; après lecture de la base, le périmètre est réactualisé. Aucun appel à une IA distante.
- **Interactions** :
  - Soumission par bouton ou Entrée → réponse et preuves dans la conversation, sans délai simulé ; le focus reste dans le champ.
  - Suggestion → prépare la question et referme les idées, sans soumettre ni déclencher la recherche de l'autre écran. La question peut être modifiée avant l'envoi.
  - Copie disponible → dialogue d'extrait partagé, distinction avec l'original et retour du focus au bouton. Une copie devenue indisponible est signalée explicitement.
  - Question blanche → message et focus ; erreur locale → message, question conservée et nouvelle tentative possible. Ambiguïtés, absence de preuve ou de résultat restent explicites.
  - La conversation reste dans la page lors d'une navigation et disparaît au rechargement ; aucun historique n'est persisté.
  - « Rechercher » → recherche unifiée pour les filtres multi-sources et annotations photo ; l'Assistant ne prétend pas utiliser ce moteur photo. La brique proactive sur l'Accueil (10.7.d) n'est pas ajoutée ici.
- **Dernier dialogue applicatif** : l'ancien aperçu de scan, sans point d'entrée ni traitement relié, adopte `ui-dialog`, avec champs désactivés et case non précochée. Aucun bouton d'autorisation ni nouveau scan ; fermeture nommée, Échap et retour du focus. Les confirmations natives des suppressions et échéances restent inchangées.
- **Validation** : neuf tests `tests/assistant-ui.spec.js` passent : quatre largeurs, petite hauteur 390 × 480, clavier, sources, copie, données fictives/réelles de test, noms longs littéraux, incertitude, erreur/reprise et conservation des données. La suite réunie passe 131 tests navigateur, dont 42 audits des dix vues aux quatre formats et clavier/mouvement réduit. Cinq tests unitaires du moteur documentaire et compilation réussis. Pas de requête externe liée aux interactions testées.
- **Limites** : appareils physiques, clavier virtuel réel, lecteur d'écran et contrastes complets restent à vérifier. Les limites historiques PDF/tests des sources ne sont pas corrigées ni revalidées dans cette tranche ; les comptes réels et le scan automatique ne sont pas validés.

### 9. Profil (issue du menu «Plus»)
- **Identité** : formulaire partagé et cartes bleu/marine, colonne secondaire sur grand écran, empilement sous 900 px. Nom et adresse occupent la largeur ; code postal et ville restent côte à côte.
- **Contenu** : identité locale, rôle en lecture seule et préférences de confidentialité existantes. Aucune création de compte, modification de rôle ou nouvelle permission.
- **Interactions** :
  - Formulaire renseigné depuis l'état sur route directe, après chargement de la base et depuis toute navigation (y compris Maison). Champs vides conservés, nom constitué d'espaces refusé avec message et focus.
  - Enregistrement par bouton ou Entrée → mécanismes existants ; résultat annoncé. Rôle et préférences de scan/connexion restent inchangés. Le consentement GPS conserve son traitement existant de retrait des coordonnées.
  - Télémétrie/partage : préférences enregistrées, sans prétendre activer un envoi ou un partage familial réel.
  - Les anciens contrôles non reliés d'accès local, scan automatique, répertoires et connexion Drive sont désactivés dans un aperçu explicitement non opérationnel. Aucun nouveau branchement de scan ou d'authentification.
  - « Gérer mes données », « Revoir la découverte » et « Visiter les autres vues » conservent leurs parcours.

### 10. Vos données (issue du menu «Plus»)
- **Contenu** : fichiers enregistrés dans Famili-IA (locaux, copies Google Drive et OneDrive, ou exemples fictifs), avec provenance et compteurs par source. L'inventaire ne représente pas l'ensemble des comptes.
- **Présentation** : logo et identité bleu/marine communs à l'onboarding et aux Alertes, en-tête compact, ajout principal, synthèse par source et filtres dans une surface partagée. L'inventaire occupe la largeur de lecture ; la gestion se trouve dessous, sans colonne latérale. Chaque fichier conserve ses badges de type, provenance et couverture (« Texte indexé » ou « Métadonnées seules »). Sur smartphone, le total occupe deux rangées à côté des quatre compteurs ; les filtres défilent horizontalement et les badges reviennent à la ligne. Le bouton d'ajout devient un « + » nommé pour l'accessibilité.
- **Interactions** :
  - « Ajouter des fichiers » → choix des sources existant. L'import local conserve sa navigation vers Recherche ; revenir à Vos données affiche les nouvelles copies.
  - Export JSON → téléchargement direct. « Supprimer toutes mes données » → **confirmation explicite**, avec focus initial sur « Annuler » ; la purge vise les données applicatives, arrête les scans actifs et ne supprime jamais les originaux locaux, Google Drive ou OneDrive. Aucun changement de logique de suppression.
  - « Aperçu » → texte documentaire, avec distinction copie/exemple. « Détail » d'une photo → vignette locale si disponible, métadonnées et limite de l'original. « Associer » → formulaire d'annotations manuelles, sans reconnaissance visuelle ; après enregistrement depuis l'inventaire, retour du focus au bouton de la photo.
  - Chips de type et catégorie → filtres partageables dans l’URL, restaurés avec Retour navigateur. Un compteur annonce le nombre affiché ; l'état vide propose de réinitialiser les filtres et replace le focus sur « Tout ».
  - Les filtres de type et de provenance de la recherche réutilisent les mêmes règles que l'inventaire
- **Modales partagées** : `ui-dialog`, en-tête et fermeture communs ; champs `ui-input`/`ui-label`, boutons `ui-button`, variante `ui-button--danger` pour confirmer une suppression. Le dialogue natif conserve Échap et le retour du focus ; les contrôles font au moins 48 px, avec défilement interne sur écran court.
- **Validation** : 16 tests de `tests/data-inventory.spec.js` passent : quatre largeurs de référence et première ligne complète dans le viewport à 390 × 800, filtres, état vide, aperçu/confirmation, import fictif, export JSON, édition photo mobile avec nom long et bibliothèque de 1 000 photos. Les tests existants des Alertes, de l'onboarding, des extraits et de la visite guidée passent également, ainsi que les audits ciblés des deux vues et les tests unitaires inventaire/annotations.
- **Limites** : l'essai de l'export PDF a échoué sur une référence préexistante à `Buffer` dans le générateur navigateur ; son bouton reste disponible mais cet export n'est pas validé et sa réparation reste hors de cette tranche UX. Appareils physiques, lecteur d'écran, audit complet des contrastes et connexions réelles non validés ici.

### 11. Écran «Plus» *(nouveauté 9.16)*
- **Contenu** : cinq cartes de destination (voir ci-dessus), icônes SVG et badges bleu/marine ; sous-titres sans troncature.
- **Interactions** :
  - Tap destination → navigation correspondante (le menu «Plus» perd son état actif, la vue d'origine reprend l'état actif au retour)
  - Bouton retour → vue d'origine

### Validation de la tranche Importer / Profil / Plus
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