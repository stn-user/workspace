# Contrat proposé des connecteurs de sources — 15.5bis.1

**Statut : proposition de conception partiellement confrontée au parcours Google Drive Web.** Le connecteur expérimental ci-dessous ne réalise qu'une partie du contrat ; la sélection et la recherche après rechargement ont été confirmées par l'utilisateur sur le parcours actuel, mais pas la révocation. Voir [états et capacités des sources](etat-et-capacites-sources.md) et [couverture d'indexation](index-coverage.md).

## Objectif et limites

Un connecteur expose les opérations réellement disponibles pour une source autorisée. Un orchestrateur distinct décide quand découvrir, lire ou indexer ; l'indexation et la recherche restent distinctes de l'accès à la source. Le contrat ne promet ni accès à tout un compte, ni lecture de chaque fichier, ni exécution continue en arrière-plan.

Les éléments présentés ci-dessous sont une cible de travail pour 15.5bis.1.a–d, pas une API déjà disponible. Ils ne constituent pas encore le schéma persistant de 15.5bis.2 et ne supposent aucune migration de données.

## Source, capacités et états

Chaque instance représente un périmètre d'accès et non un fournisseur global. Son identifiant applicatif opaque est distinct des noms de compte, chemins et jetons. Un même fournisseur peut avoir plusieurs instances. Le périmètre humainement lisible est décrit sans prétendre dépasser ce qui a réellement été autorisé.

Le descripteur doit distinguer :

- le fournisseur ou type de source, l'instance applicative et la plateforme ;
- le périmètre connu ou inconnu, sans déduire une autorisation à partir d'un choix d'interface ;
- les capacités réellement disponibles pour l'instance : découverte, lecture de métadonnées ou de contenu, ouverture de l'original, suivi des changements, déconnexion et révocation ;
- les états indépendants d'autorisation, de disponibilité, d'avancement de l'indexation et de dernière vérification réussie, avec valeurs inconnues si nécessaire.

Les capacités dépendent du fournisseur, de la plateforme, de la session et du périmètre accordé ; elles peuvent changer. Une capacité indisponible ne doit jamais être simulée par un succès ou une liste vide. Le niveau d'indexation d'un élément n'est pas une preuve d'accès actuel à sa source ; un index conservé peut être obsolète.

## Opérations proposées

Les noms ci-dessous décrivent un contrat logique à traduire en JavaScript avec le premier adaptateur ; ils ne sont pas des fonctions existantes.

| Opération | Entrée et résultat attendus | Contraintes |
|---|---|---|
| `describe` | Retourne l'identité d'instance, le périmètre connu, les capacités et les états connus. | Aucune demande de permission implicite ; aucune donnée d'authentification exposée. |
| `authorize` | À la suite d'une action explicite, lance le parcours système ou fournisseur ; retourne le périmètre effectivement connu et les capacités résultantes. | Refus, annulation et erreur sont distincts ; ne pas assimiler l'annulation à une sélection vide réussie. |
| `discover` | Pour un périmètre autorisé, retourne une page d'identifiants et de métadonnées disponibles, un indicateur de fin et, si nécessaire, un curseur opaque de reprise. | Répéter jusqu'à la fin ; une page vide avec curseur n'est pas nécessairement la fin. Si la sélection est ponctuelle ou non renouvelable, l'indiquer explicitement. |
| `readMetadata` | Retourne les champs accessibles pour une identité d'élément, leur provenance et leurs absences connues. | Une métadonnée manquante reste inconnue ; ne pas inventer de date ou de contenu. |
| `readContent` | Retourne le contenu accessible avec son type et ses limites, ou une erreur explicite. | Ne pas supposer que tous les formats sont lisibles ; l'orchestrateur ne doit pas interpréter un message d'erreur ou de remplacement comme du contenu extrait. |
| `openOriginal` | Lance l'ouverture ou retourne une référence d'ouverture utilisable dans le contexte autorisé, selon le parcours validé. | Si l'ouverture n'est pas supportée ou si la permission est perdue, le signaler ; ne pas exposer de lien privé non validé. |
| `getChanges` | Si disponible, retourne les changements, suppressions et un curseur opaque depuis un point connu. | Une liste vide signifie absence de changements seulement si l'opération a réussi et que le fournisseur garantit cette interprétation ; sinon utiliser une découverte complète appropriée ou signaler l'indisponibilité. |
| `disconnect` | Termine la session locale et rend l'état observable. | Ne présume ni révocation fournisseur ni suppression de l'index ; préciser les effets réels. |
| `revoke` | Si pris en charge, demande explicitement la révocation fournisseur et en rapporte le résultat. | Ne pas prétendre avoir révoqué si l'API ne le permet pas ou échoue ; expliquer le parcours externe quand nécessaire. |

Une opération non prise en charge est annoncée dans les capacités et rejetée explicitement si appelée. L'autorisation, l'ouverture et la révocation exigent une action utilisateur quand la plateforme ou le fournisseur l'impose. La sélection manuelle d'un fichier peut permettre une lecture ponctuelle sans fournir de découverte durable ou de réouverture après redémarrage.

## Identité, contenu et index

- Une identité utilisable pour la reprise doit combiner l'instance de source et un identifiant opaque stable fourni ou conservé par le connecteur. Deux sources peuvent employer le même identifiant fournisseur sans désigner le même fichier.
- Si aucune identité durable n'est disponible, le connecteur doit le signaler : un nom, chemin ou identifiant de session ne doit pas être présenté comme stable. La stratégie d'identité locale et les migrations restent à concevoir et tester en 15.5bis.2.
- Une métadonnée, un contenu partiel et un contenu analysé sont distingués ; un format reconnu ne garantit pas une extraction réussie. Les preuves et corrections utilisateur restent dans le modèle d'index, pas dans le connecteur.
- L'index peut rester local après perte de connectivité uniquement selon la politique de rétention, les autorisations et les règles fournisseur applicables. Une suppression de l'index n'efface jamais l'original ; la déconnexion et la révocation ne valent pas suppression automatique de toutes les données.
- Les données personnelles, y compris les extraits et miniatures, doivent être minimisées. Les jetons et curseurs sensibles ne figurent ni dans les résultats destinés à l'interface ni dans les journaux ; leur stockage éventuel exige une conception de sécurité distincte.

## Erreurs, annulation et reprise

Le contrat doit rendre distinguables au minimum : annulation utilisateur, autorisation refusée ou expirée, opération non prise en charge, élément inaccessible ou supprimé, format non pris en charge, erreur réseau temporaire, quota et erreur interne. Conserver la cause utile sans journaliser de contenu privé ni de secret. Ne pas remplacer une erreur par une liste vide ou un statut de réussite.

L'orchestrateur peut reprendre après une erreur récupérable ou une interruption si un curseur valable existe ; sinon il indique qu'un nouveau parcours ou une nouvelle sélection est nécessaire. Les opérations répétées doivent éviter les doublons côté index, sans effacer les corrections utilisateur. Les limites de concurrence, temporisations et stratégies de reprise restent à définir par adaptateur selon les API réelles.

## Confrontation aux parcours existants

- **Google Drive Web** : [GoogleDriveClient](../../google-drive.js) combine demande d'autorisation, Picker et lecture des fichiers sélectionnés dans `pickFiles`. Le scope est `drive.file`. Il propose `revoke`, qui efface le jeton local et demande sa révocation à Google ; un échec fournisseur est signalé, sans garantie de suppression de l'index. Le parcours ne fournit pas à lui seul une découverte générale, un suivi de changements ou une ouverture de l'original conformes à la cible. Les droits étendus restent soumis à vérification dans [l'étude Drive](../../ETUDE_GOOGLE_DRIVE.md).
- **OneDrive personnel Web** : [onedrive-auth.js](../../onedrive-auth.js), [onedrive-graph.js](../../onedrive-graph.js) et [onedrive-document.js](../../onedrive-document.js) raccordent connexion, parcours paginé volontaire et lecture bornée à l'application. `Files.Read` peut autoriser l'accès à tous les fichiers ; la déconnexion locale ne révoque pas le consentement. Pas de synchronisation ou de reprise durable, et aucun essai sur compte réel ; voir [l'étude OneDrive](../../ETUDE_ONEDRIVE.md).
- **Sélection locale et scan** : [local-files.js](../../local-files.js) lit les fichiers et [background-sync.js](../../background-sync.js) orchestre les traitements et leur persistance. Le worker construit actuellement des identifiants locaux basés sur l'heure et une valeur aléatoire : ils ne constituent pas une identité source stable pour la réindexation. La disponibilité d'un fichier ou d'un dossier après redémarrage dépend du parcours et du navigateur.
- **Recherche et inventaire** : [data-inventory.js](../../data-inventory.js) distingue actuellement les sources et l'état « texte / métadonnées » selon ses propres conventions. L'index expérimental expose une couverture `metadata` ou `partial` selon les segments vérifiés ; les états et capacités complets du contrat restent à raccorder.

Ces constats ne garantissent pas la disponibilité des parcours sur tous les appareils. Les limites Web, Android et iOS sont détaillées dans [integration.md](integration.md).

## Première expérimentation fictive

[FakeSourceConnector](../../tests/fixtures/fake-source-connector.js) est une doublure exclusivement destinée aux tests, sans réseau ni persistance. Les [tests associés](../../tests/fake-source-connector.test.js) couvrent autorisation, refus et annulation, pagination et reprise après indisponibilité, lecture, changement, suppression, isolation de deux sources, déconnexion et révocation simulées. Les curseurs de découverte deviennent invalides si le jeu change : cela illustre une stratégie possible, non une exigence imposée aux fournisseurs.

Cette expérimentation ne prouve ni l'idempotence d'un index réel, ni la conservation des corrections, ni la compatibilité avec un connecteur de production. Elle ne modélise pas encore les quotas, pages vides avec curseur, autorisations système ou révocations effectives. Le contrat reste à valider avant d'être figé.

## Confrontation au parcours Google Drive

Les [tests Drive](../../google-drive.test.js) exercent le client existant avec Picker et réseau simulés : lecture des seuls fichiers sélectionnés, annulation, refus de la portée, formats et tailles, et réponse de révocation. Ils ne constituent pas une validation OAuth Google ni un essai sur un vrai compte.

| Exigence cible | Comportement existant et écart |
|---|---|
| Autorisation et sélection explicites | `pickFilesDetailed` associe demande de jeton, Picker et lecture, en distinguant annulation, sélection vide et refus. `pickFiles` conserve son API historique de tableau pour les appelants existants. |
| Découverte, pagination et reprise | Le Picker retourne une sélection ponctuelle ; aucun parcours général de pagination ou de curseur de reprise n'est exposé par le client. |
| Métadonnées et contenu | `readSelectedFile` lit les métadonnées et le contenu d'un fichier sélectionné en une opération ; il n'expose pas séparément un résultat partiel lorsque la lecture échoue. |
| Identité | Le résultat utilise un identifiant dérivé de l'identifiant Drive, sans identifiant d'instance de compte/source ; la stratégie multi-comptes reste à définir. |
| Changements et ouverture de l'original | Aucun suivi de changements ni méthode d'ouverture directe de l'original n'est exposé par ce client. |
| Déconnexion et révocation | `revoke` efface d'abord le jeton local puis demande la révocation ; un refus de Google est signalé. Il n'expose pas une déconnexion locale indépendante ni la suppression de l'index. |

### Connecteur de sélection expérimentale

[GoogleDriveSource](../../google-drive-source.js) raccorde le parcours Web existant à un sous-ensemble du contrat : `describe`, `selectFiles` et `revoke`. L'application utilise ce connecteur pour la sélection et la révocation, puis conserve son traitement habituel des documents, y compris les segments PDF et la persistance. `selectFiles` fournit les documents lus et leurs fiches de métadonnées adaptées, sans requête supplémentaire. Les fiches ne remplacent pas l'index reconstruit par l'application ; si un identifiant apparaît plusieurs fois, les documents restent transmis au parcours existant et les fiches sont uniques.

- Le scope reste `drive.file`, limité aux fichiers auxquels l'application est autorisée ; le Picker sélectionne explicitement les fichiers à traiter. Selon [Google : portées Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) et [Picker pour applications Web](https://developers.google.com/workspace/drive/picker/guides/web-picker), cette portée ne donne pas une découverte exhaustive du compte.
- L'identifiant `drive` utilisé par l'application distingue le fournisseur localement, pas une instance durable de compte. Les changements de compte et les identités multi-comptes restent à concevoir.
- `describe` rapporte les capacités, le dernier résultat de sélection en mémoire et la présence éventuelle d'un jeton, sans exposer celui-ci. Ni la disponibilité, ni l'accès aux originaux, ni leur fraîcheur ne sont vérifiés. Annulation du Picker ou fermeture de la fenêtre OAuth, sélection vide et erreurs dont le refus sont distingués.
- `revoke` exige un jeton de session, interdit les opérations concurrentes et rapporte la réponse fournisseur ; l'absence de réponse confirmant le succès est une erreur. Le jeton local est effacé même en cas d'échec. Dans « Vos données », la révocation est proposée même sans fichier importé et conserve les copies ; la suppression globale efface les copies et demande aussi la révocation si un jeton est présent.
- Autorisation séparée, découverte, lecture séparée, ouverture d'original, changements et déconnexion locale indépendante sont annoncés indisponibles et rejetés explicitement. Les plateformes natives ne sont pas raccordées.

Les [tests](../../tests/google-drive-source.test.js) utilisent le client réel avec Picker et réseau simulés ainsi qu'une doublure pour les transitions. Le 9 novembre 2026, l'utilisateur a confirmé la sélection et la recherche après rechargement avec Google ; la révocation du parcours actuel reste à confirmer. Une absence de jeton après redémarrage ne prouve pas une révocation fournisseur.

## Orchestration des découvertes

Le module **source-orchestrator.js** exporte trois fonctions principales :

1. **readSourcePage(connector, cursor)** - Lit une seule page de découverte
2. **collectSourcePages(connector, options)** - Collecte toutes les pages d'une source
3. **collectMultipleSources(sources, options)** - Orchestration de plusieurs sources

### Caractéristiques de l'orchestrateur

- **Validation stricte** des pages rejetant les incohérences (`done` avec `nextCursor` incohérent)
- **Propagation d'erreurs** sans transformation (préserve l'erreur originale)
- **Limite explicite** à `maxPages`, avec erreur seulement si la dernière page lue n'est pas finale
- **Isolation des sources** - erreur sur une source n'empêche pas les autres
- **Détection des doublons** de sourceId avant démarrage

### Limitations connues

- Pas de mécanisme de reprise persistante automatique
- Aucune déduplication des éléments entre sources
- La découverte paginée n'est pas applicable à la sélection Drive ponctuelle : l'orchestrateur reçoit une erreur explicite s'il la demande. Le parcours de sélection applicatif n'utilise pas cet orchestrateur ; dates et quotas fournisseurs ne sont pas simulés.

`readSourcePage` laisse l'appelant conserver le curseur et décider quand reprendre ; aucun curseur n'est persisté automatiquement. Les curseurs sont opaques et transmis sans interprétation. `collectMultipleSources` valide la configuration globale (options, identifiants et forme des connecteurs) avant les appels, puis conserve l'erreur de chaque source en échec à l'exécution.

[Voir les tests](../../tests/source-orchestrator.test.js) pour les scénarios couverts.

[Voir le modèle d'index multi-sources (15.5bis.2)](modele-index.md) pour la définition des enregistrements d'index.

## Adaptateur Google Drive (15.5bis.5)

Le module [google-drive-index-adapter.js](../../google-drive-index-adapter.js) fournit une adaptation expérimentale entre les résultats de `GoogleDriveClient.readSelectedFile` et le modèle d'index commun. Il n'est raccordé ni à l'interface ni à la persistance.

### Entrée

- `sourceId` : chaîne opaque fournie par l'appelant
- `result` : objet résultant d'un appel à `readSelectedFile` avec la forme :
  ```javascript
  {
    id: "drive-{fileId}",
    name: "NomDuFichier.ext",
    type: "PDF|Document Google|Texte|Markdown",
    date: "15 janvier 2024" | "Date inconnue",
    content: "texte extrait",
    keywords: "",
    summary: "",
    isLocal: true,
    driveSource: true
  }
  ```

### Sortie

`adaptDriveResult(sourceId, result)` produit une fiche ; `adaptDriveResults(sourceId, results)` produit un tableau dans le même ordre. Les fiches contiennent :
- `sourceId` et `itemId` conservés séparément
- `name` avec provenance `provider`
- `coverage: "metadata"` (seulement les métadonnées conservées dans la fiche, et non l'ensemble de ce que le client a lu)
- `type: null` (non déduit fiablement)
- Pas de `content`, `summary`, `keywords` ni `date` converti

### Différences importantes

- **Sélection ponctuelle** : l'adaptateur travaille sur une sélection déjà effectuée, pas sur une découverte globale
- **Scope restant `drive.file`** : aucun accès étendu ni lecture indépendante
- **Client pré-existant** : GoogleDriveClient a déjà lu le contenu avant que l'adaptateur ne reçoive le résultat
- **Date non conservée** : la date formatée en français n'est ni recopiée ni convertie en date ISO pour éviter les ambiguïtés.
- Les [tests de l'adaptateur](../../tests/google-drive-index-adapter.test.js) simulent le client et ses réponses ; ils ne constituent pas une validation OAuth ou un essai avec un compte réel.

### Validation

Rejette explicitement :
- sourceId vide ou invalide, même si la sélection est vide
- résultat ne présentant pas les champs et marqueurs du client actuel, ou identifiant et nom invalides
- identifiants dupliqués dans une sélection

### Limites

- Aucun appel réseau n'est effectué par l'adaptateur
- L'adaptateur ne lit pas le contenu supplémentaire
- Un tableau vide reste vide ; il ne permet pas de déduire le contenu du compte ni, à lui seul, la raison de l'absence de résultats. L'annulation du Picker produit notamment un tel tableau.
- L'adaptateur ne reçoit pas les erreurs du client et ne les masque pas : l'appelant doit les traiter explicitement.

### Session expérimentale de sélection

`DriveIndexSession` dans [drive-session.js](../../drive-session.js) relie en mémoire `pickFiles`, l'adaptateur, le rapprochement et `searchIndex`. L'appelant fournit un client initialisé, un `sourceId` opaque et, facultativement, des fiches de la même source. `selectFiles(maxItems)` lance une sélection explicite et retourne `{ selectedCount, records }` ; `getRecords()` retourne une copie, `updateRecord(record)` remplace une fiche existante de cette session et `search(query, options)` recherche dans les fiches.

Une sélection vide conserve les fiches et ne prouve rien sur le contenu du compte. Les erreurs de sélection ou d'adaptation sont propagées sans modifier l'index. Une seule sélection peut être en cours ; les corrections sont refusées pendant celle-ci. Le contenu déjà lu par le client n'est pas conservé par l'adaptateur : seules les métadonnées sont recherchables. Les corrections restent en mémoire uniquement.

La session n'est pas raccordée à l'interface ni à la persistance, ne lance pas elle-même l'initialisation du client et ne constitue pas un connecteur complet. Elle ne modifie pas le scope `drive.file`, ne découvre pas tout Drive et n'ajoute aucun appel réseau au parcours existant. Les tests utilisent des réponses simulées, sans validation OAuth réelle.

## Plan de validation avant adoption

1. Construire un adaptateur fictif sans réseau et un jeu de données synthétiques ; vérifier les opérations supportées et non supportées, le refus et l'annulation.
2. Tester pagination, page vide avec curseur, reprise après interruption, erreur récupérable, quota, suppression et changement d'un élément, puis révocation et déconnexion distinctes.
3. Vérifier l'isolation de deux sources, l'absence de doublons lors d'une reprise, la conservation des corrections et la présentation honnête d'un index partiel ou périmé.
4. Confronter le contrat à un premier connecteur réel **avant de le figer** : cartographier les opérations existantes, leurs écarts, l'identité disponible et les tests à ajouter. Ne pas élargir les permissions ni modifier les flux de production sans mission et validation explicites.
5. Documenter les résultats et les capacités réellement vérifiées par adaptateur ; conserver dans le plan les étapes non réalisées ou conditionnelles.
