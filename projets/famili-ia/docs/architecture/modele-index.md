# Modèle d'index multi-sources — 15.5bis.2

**Statut : expérimental.** Les fiches communes sont enregistrées dans chaque document du store IndexedDB `documents`, sous `indexRecord` (schéma de fiche `1.1.0`). La base est en version 3 ; la migration depuis IndexedDB v2 est additive et reprenable. Les faits persistés reviennent dans la recherche après restauration et vérification de la provenance du contenu. L'index de recherche et les extraits restent en mémoire.

## Forme et validation

`createIndexRecord(sourceId, itemId, options)` construit une fiche indépendante des objets fournis ; il rejette les données invalides par `TypeError`. `isValidIndexRecord(record)` contrôle la même structure et renvoie un booléen. La version actuelle est `schema: "1.1.0"` ; elle ne constitue pas une version IndexedDB. La migration de fiche convertit `1.0.0` en `1.1.0` et initialise l'emplacement à `null`.

- `sourceId` et `itemId` sont deux chaînes non vides et distinctes : leur paire identifie l'élément. Le modèle ne garantit pas lui-même leur stabilité. Deux sources peuvent employer le même `itemId`.
- `type` vaut `document`, `photo` ou `null` si inconnu. `name` est une valeur avec provenance ou `null`.
- `location` est l'emplacement connu avec provenance ou `null` ; son absence ne signifie pas que le fichier est à la racine.
- `dates` contient, seulement si connues, les clés `creation`, `modification`, `priseDeVue`, `achat`, `echeance`, chacune avec sa provenance. Les valeurs sont des dates calendaires valides `AAAA-MM-JJ` ou des dates-heures UTC `AAAA-MM-JJTHH:mm:ssZ` ou `AAAA-MM-JJTHH:mm:ss.sssZ`.
- `coverage` est un des niveaux définis dans [index-coverage.md](index-coverage.md), ou `null` si inconnu. `analyzed` ne garantit ni l'extraction de tous les faits ni l'accès actuel à la source.
- `lastCheck` est une date ou date-heure du même format, ou `null`. Aucune date courante n'est ajoutée automatiquement.
- `fields` est un tableau de faits ou métadonnées supplémentaires ; chacun comprend un `name` non vide et une valeur avec provenance. Les valeurs du modèle sont pour l'instant des chaînes non vides.

Une valeur avec provenance a la forme `{ value, source, estimated, proof }`. Les sources acceptées sont `provider` (fournisseur), `extracted` (contenu extrait), `user-input` (saisie volontaire) et `auto-estimate` (estimation automatique). `estimated` est un booléen ; il vaut par défaut `true` pour `auto-estimate`, et `false` sinon. Une estimation automatique ne peut pas être déclarée confirmée. Pour les autres sources, l'appelant doit indiquer `estimated: true` s'il s'agit d'une estimation ; une provenance seule ne prouve pas l'exactitude.

La preuve, liée à la valeur concernée, est `null` ou `{ excerpt, location }` : l'extrait non vide est obligatoire, la localisation est une chaîne non vide ou `null`. Une preuve peut étayer une estimation sans en faire un fait confirmé. Le modèle valide la forme de la preuve, pas sa véracité. Les extraits sont des données sensibles : aucune journalisation n'est effectuée par ce module.

## Exemples fictifs

```javascript
const document = createIndexRecord("drive-fictif", "123", {
  type: "document",
  name: { value: "facture.pdf", source: "provider" },
  dates: {
    achat: {
      value: "2024-01-03", source: "extracted",
      proof: { excerpt: "Achat : 03/01/2024", location: "page 1" }
    },
    echeance: { value: "2025-01-03", source: "auto-estimate" }
  },
  coverage: "partial"
});

const photo = createIndexRecord("local-fictif", "123", {
  type: "photo",
  name: { value: "fete.jpg", source: "provider" },
  dates: { priseDeVue: { value: "2024-07-14", source: "provider" } },
  fields: [{ name: "evenement", value: "fête", source: "user-input" }],
  coverage: "metadata"
});
```

Les éléments ont le même identifiant fournisseur mais appartiennent à deux sources distinctes. Les dates, annotations et extraits sont fictifs.

## Adaptateur fictif

`fakeConnectorAdapter(page, sourceId)` convertit les champs `id` et `name` réellement renvoyés par la fixture de découverte. Il attribue `metadata`, conserve la provenance du nom et laisse le type inconnu : une extension d'image ne prouve pas qu'il s'agit d'une photo. Il ne lit aucun contenu et n'ajoute ni date ni preuve. Cet adaptateur ne prend en charge aucun connecteur réel.

## Rapprochement fictif en mémoire

`reconcileIndex(existing, discovered)` prend deux tableaux de fiches valides. `discovered` doit contenir exclusivement des fiches de métadonnées produites par `fakeConnectorAdapter` : nom fournisseur, couverture `metadata`, type inconnu et aucun autre fait, date ou preuve. Toute fiche hors de ce périmètre, identité dupliquée ou entrée invalide est rejetée.

Le résultat est un tableau d'objets `{ record, verificationState }` : `record` reste une fiche valide du modèle, et l'état est séparé. Pour un parcours ultérieur, utiliser `result.map(({ record }) => record)` comme liste existante. Les fiches existantes conservent leur ordre ; les nouvelles sont ajoutées dans l'ordre de découverte. Entrées et sorties ne partagent pas les objets imbriqués du modèle.

- Les identités sont comparées par paire exacte `sourceId`, `itemId`, sans concaténation.
- Le nom fournisseur est actualisé à l'identique, y compris les différences de casse. Un nom absent est renseigné ; un nom d'une autre provenance, notamment une correction utilisateur, est conservé.
- Type, dates, faits, preuves, couverture et dernière vérification existants sont conservés. Une découverte de métadonnées ne prouve pas que le contenu analysé est à jour.
- `needs-review` signale une couverture `partial` ou `analyzed`, même si l'élément est absent de la découverte. `not-analyzed` accompagne une nouvelle fiche ou une couverture `metadata` ou `unavailable`. `unknown` signale une couverture inconnue. Ces états ne prouvent ni changement du contenu ni accès actuel à la source.

Par exemple, une fiche avec nom utilisateur `Facture.txt` et couverture `analyzed`, redécouverte sous le nom fournisseur `Facture_2024.pdf`, conserve son nom et sa couverture ; son résultat porte `verificationState: "needs-review"`.

Une fiche absente d'une découverte, même vide ou incomplète, reste conservée : son absence ne démontre pas sa suppression. `removeIndexRecord(records, sourceId, itemId)` supprime explicitement une fiche de la liste en mémoire et retourne `{ records, removed: true }` ; une identité inconnue ou une entrée invalide provoque une erreur. La fonction n'appelle aucun connecteur et ne supprime pas l'original. La politique de traitement des éléments supprimés ou devenus inaccessibles reste à définir avec les connecteurs réels et les règles de conservation.

## Persistance et migration

`document-index.js` construit les fiches durables à partir des informations déjà présentes dans le document. Il ne date pas automatiquement une vérification ; les métadonnées sans contenu vérifié restent en couverture `metadata`. Une couverture `partial` exige une provenance de contenu restaurée et vérifiée. Le parseur existant est appliqué uniquement aux segments vérifiés : échéance, date, émetteur, montant et équipement explicitement étiqueté incluent une preuve littérale et sa ligne. Les types et catégories déduits par règles sont marqués comme estimations automatiques. Une valeur d'échéance déjà fournie par le document n'est reprise que si sa preuve est aussi littéralement présente dans le texte vérifié. Pour les photos, la date EXIF et les annotations explicitement saisies sont reprises sans inférer de personne, lieu ou événement.

`document-index-migration.js` ajoute `indexRecord` aux documents historiques, puis les persiste un par un. En cas d'échec, l'initialisation signale et propage l'erreur ; au prochain lancement, les fiches déjà valides sont conservées et les documents restants migrés. Le document source, son contenu, ses provenances, ses annotations et ses vignettes ne sont pas supprimés ni remplacés par la migration. Les fiches existantes invalides ou rattachées à une autre identité provoquent une erreur plutôt qu'une réécriture silencieuse. Le retour arrière applicatif `rollbackDocumentIndexes` enlève uniquement `indexRecord` ; il ne rétrograde pas IndexedDB v3 vers v2 et ne garantit pas la compatibilité avec une ancienne version de l'application qui demande v2.

Lors d'une réindexation via `addDocument`, les corrections de nom, d'emplacement et de dates utilisateur ainsi que les champs utilisateur non issus directement des annotations photo sont préservés et prévalent sur une nouvelle extraction de même nom. Les champs gérés par les annotations photo reflètent les annotations courantes. `IndexSession` recharge les champs de la fiche durable après restauration du contenu ; si sa provenance est invalide, les faits `extracted` et `auto-estimate` sont écartés et la couverture revient à `metadata`.

Les extraits de preuve sont conservés dans `indexRecord` avec le document ; `contentProvenance` conserve des plages et une empreinte, pas une seconde copie du texte. Il n'y a pas d'expiration automatique : les copies, fiches, preuves, provenances et vignettes suivent la durée de vie du document Famili-IA et sont retirées avec lui lors d'une suppression explicite ou d'une purge. Cette suppression ne touche pas l'original chez le fournisseur. Le retour arrière de la fonctionnalité d'index est distinct : il retire uniquement `indexRecord` et laisse les autres données du document en place.

La détection de doublons de `document-deduplication.js` propose une correspondance exacte si les deux empreintes SHA-256 sont déjà disponibles, sinon une suggestion incertaine par nom normalisé. Les empreintes ne sont pas ajoutées systématiquement, les rapprochements n'entraînent aucune fusion et aucune interface de revue n'est livrée. L'évaluation du corpus fictif porte sur sept cas seulement ; elle ne démontre pas la qualité en production.

## Structures existantes et décisions ouvertes

- Dans [db.js](../../db.js), le store `documents` a pour clé `id` ; aucune clé composée n'est introduite par ce lot.
- [data-inventory.js](../../data-inventory.js) utilise notamment `type`, `category` et des extensions pour classer les résultats existants. Ces champs n'ont pas automatiquement la même sémantique que le type général de cette fiche.
- La couverture réutilise le module existant. Les documents historiques sont convertis par la migration IndexedDB ; les autres formes de fiches ne sont pas automatiquement interprétées.

Les identités stables de comptes et appareils, la classification générale, l'extraction exhaustive, la couverture multi-plateforme, les politiques complètes de conservation/suppression des extraits et la compatibilité d'un retour à l'ancienne version IndexedDB restent à définir.

La fiche est embarquée dans le document afin de préserver les chemins de stockage, chiffrement et suppression Famili-IA existants ; aucun index séparé ni synchronisation n'est réalisé ici. Le parcours OneDrive expérimental découvre les éléments accessibles lors d'un scan volontaire ; il ne constitue pas une découverte générale de toutes les sources. Supprimer une fiche d'index ne supprime pas l'original.

## Parcours expérimental local et Drive dans l'application

`IndexSession.syncDocuments(documents)` recharge les fiches durables valides et rapproche les informations de l'instantané des documents locaux, Drive et OneDrive déjà présents dans l'application, sans lecture de fichier ni nouvel appel cloud. Les exemples de démonstration sont exclus. Les faits issus du contenu ne sont conservés que si sa provenance a été restaurée et vérifiée. L'identité est la paire source (`local`, `drive` ou `onedrive`) et identifiant applicatif ; les identifiants locaux sont ceux des documents importés, pas une garantie de réidentification du fichier original. Pour OneDrive, l'identifiant applicatif est dérivé de l'identité du compte Microsoft et de l'identifiant de l'élément. Les identifiants répétés pour une même source utilisent la dernière entrée de l'instantané. Les entrées invalides interrompent la mise à jour sans remplacer l'état précédent.

Le rapprochement conserve les corrections de nom en mémoire lorsque la même identité reste présente ; les éléments absents de l'instantané applicatif sont retirés de cet index, sans suppression des originaux. Une absence ne signifie pas que le fournisseur a supprimé un fichier. `getAllRecords`, `getRecordsBySource`, `updateRecord` et `search` travaillent sur des copies ou résultats indépendants. Les corrections de l'index ne sont pas exposées dans l'interface ni persistées.

L'interface expérimentale recherche les noms et les segments explicitement transmis comme texte extrait par le lecteur. Les imports locaux TXT, Markdown, les fichiers DOCX lisibles et les pages à texte incorporé des PDF locaux fournissent ces segments ; les textes de remplacement OCR Web ne le font pas. Sur l'application native, le texte reconnu par OCR sur les pages PDF scannées et les images est également indexable. L'utilisateur a confirmé le 10 novembre 2026 les essais demandés sur tablette Android avec une image et un PDF scanné fictifs. Les formats Word `.doc` ne sont pas pris en charge et les erreurs DOCX sont propagées, sans texte indexable de substitution. Les fichiers texte, Markdown et Google Docs sélectionnés via Drive fournissent leur contenu lu ; les PDF Drive sélectionnés fournissent seulement les segments à texte incorporé. OneDrive fournit les segments TXT/Markdown et PDF incorporés dans les limites décrites par [l'étude OneDrive](../../ETUDE_ONEDRIVE.md). Les classeurs XLS/XLSX locaux fournissent également du texte indexable. La lecture XLSX et DOCX est testée avec des fichiers synthétiques, dont un DOCX OOXML lu par Mammoth sous Node et Chromium ; un corpus de documents Word réels reste à valider. Le texte des anciens documents sans provenance reste exclu : seuls leurs noms sont recherchés.

Le lecteur PDF Drive conserve son texte de présentation avec ses étiquettes de page, mais ces étiquettes et les résultats OCR ne font pas partie des segments recherchables. Sur le Web, un PDF scanné ou mixte dont une page nécessite l'OCR est refusé comme auparavant ; aucune couverture partielle n'est promise pour cette sélection. Le lecteur local utilise les plugins Capacitor Filesystem et OCR natifs ; le texte reconnu sur les pages PDF scannées et les images est transmis comme segment indexable. Les essais sur tablette Android avec fichiers fictifs ont été confirmés par l'utilisateur le 10 novembre 2026. Les segments sont transmis temporairement en mémoire, puis seules leurs positions et leur provenance sont enregistrées avec le document.

Pour les nouveaux contenus, `contentProvenance` est stockée avec le document dans IndexedDB : version, méthode, positions des segments dans le contenu et empreinte SHA-256 liant source, identifiant, méthode, positions et contenu. Au redémarrage, les positions et l'empreinte sont vérifiées avant de reconstruire les segments ; une provenance invalide n'autorise que la recherche par nom et est signalée. Aucune copie supplémentaire du texte ni migration des anciens documents n'est créée. L'empreinte détecte les changements accidentels mais n'authentifie pas les données face à un acteur capable de modifier à la fois contenu et provenance.

La couverture `partial` indique la présence de segments recherchables, sans prétendre que tout le document est analysé. Chaque terme de contenu possède un extrait littéral, potentiellement distinct si les termes sont éloignés ; une correspondance exige tous les termes dans le nom ou tous dans les segments du contenu. Aucun résumé n'est traité comme preuve. L'affichage utilise du texte, pas du HTML interprété. L'index et ses extraits ne sont pas persistés séparément ; le document, son contenu et sa provenance sont conservés dans le stockage applicatif existant.

Chaque résultat affiche le type, la source, l'emplacement et les dates disponibles, la couverture, la dernière vérification de source (ou « inconnue »), l'observation d'accès et les raisons de correspondance avec leur provenance et leurs éventuelles preuves ou estimations. Les dates de modification Drive proviennent des métadonnées conservées lors de la sélection ; les dates locales dont la nature est inconnue ne sont pas qualifiées de dates de création ou de modification. Les informations manquantes sont signalées. Le bouton de copie n'apparaît que si un texte est conservé dans Famili-IA ; le détail d'une photo utilise le parcours de vignette existant. Ces actions ne rouvrent pas les originaux. Une copie peut être ancienne ou contenir du texte non vérifié, notamment pour les anciens documents. L'utilisateur est invité à chercher l'original dans la source ; aucun lien ni disponibilité d'accès n'est inventé. Lorsque les deux documents font partie des résultats, ceux portant des noms normalisés identiques ou des empreintes disponibles identiques sont regroupés comme rapprochements, mais chaque copie et sa source restent affichées séparément ; aucune fusion n'est faite.

Les imports, suppressions et la purge actualisent les résultats. La recherche interroge uniquement les copies présentes, sans nouvel appel cloud ; OneDrive ne parcourt les dossiers qu'après déclenchement explicite et ne met pas à jour les copies existantes. L'index ne vérifie pas l'accès actuel aux originaux et ne garantit pas la couverture de l'ensemble d'un appareil ou d'un compte. Une recherche sans résultat ne prouve pas l'absence de correspondance dans les textes non disponibles.

## Recherche expérimentale dans l'index commun 15.5bis.9

`searchIndex(records, query, options)` effectue une recherche textuelle simple sur un tableau de fiches d'index valides. Chaque fiche est comparée mot par mot après normalisation, et les résultats sont retournés dans l'ordre d'entrée.

### Champs recherchés

- `name.value` : le nom de l'élément
- `dates.{type}.value` : les valeurs de dates connues
- `fields.{fieldName}.value` : les valeurs des champs personnalisés

### Champs exclus de la recherche

- `sourceId`, `itemId` : les identifiants ne sont pas recherchés
- `type`, `coverage`, `lastCheck` : ces métadonnées ne sont pas recherchées
- `proof.excerpt`, `proof.location` : les preuves ne sont pas utilisées pour trouver une fiche ; elles sont restituées si la valeur à laquelle elles sont associées correspond
- Les dates absentes, les champs sans valeur, les objets `proof: null`

### Règles de correspondance

- La requête est normalisée avec `normalizeText` (accents, majuscules, ponctuation)
- La requête est découpée en mots
- Un mot doit être présent dans **au moins une** des valeurs recherchables
- Tous les mots doivent correspondre (règle ET logique)
- Chaque mot est recherché comme sous-chaîne d'une valeur normalisée : `"elec"` correspond à `"electricite maison"`.

### Résultats traçables

Chaque résultat contient :

- `sourceId`, `itemId` : identifiants séparés
- `name` : nom de l'élément (peut être `null`)
- `type`, `coverage` : métadonnées de l'élément
- `reasons` : tableau des valeurs qui ont contribué à la correspondance
  - Chaque raison contient `value`, `location` (`name`, `date.xxx`, `field.xxx`), `source`, `estimated`, `proof` et `matchedWords` (mots normalisés correspondant à cette valeur).
  - Les raisons couvrent ensemble tous les mots recherchés, même lorsqu'ils correspondent à plusieurs valeurs. Les objets de preuve sont copiés.

### Filtres supportés

```javascript
searchIndex(records, "facture", {
  sourceId: "google-drive",  // filtre par source exacte
  type: "document",          // "document" ou "photo"
  coverage: "metadata",      // niveau de couverture connu
  dateType: "achat",         // nature exacte parmi les dates du modèle
  dateFrom: "2024-01-01",    // borne incluse, dates ISO
  dateTo: "2024-12-31",
  personId: "member-1",      // annotation explicite personIds
  place: "Québec"            // annotation explicite place
})
```

Les filtres sont combinés par ET. Une valeur inconnue (`null` ou absence de champ) ne correspond pas à un filtre précis. Une période sans `dateType` correspond à toute date connue ; sélectionner une nature limite la période à cette date (prise de vue, achat, échéance, etc.). Les bornes sont inclusives. Les filtres personne et lieu ne lisent que les annotations explicites ; ils ne déduisent pas d'identité ou de lieu. Dans la recherche intégrée, les choix personne/lieu sont limités aux annotations disponibles dans les fiches chargées.

### Validation et erreurs

- Rejette les tableaux contenant des fiches invalides (`TypeError`)
- Rejette les identités dupliquées dans le tableau d'entrée (`TypeError`)
- Rejette les filtres invalides ou les options non reconnues (`TypeError`)
- Rejette les requêtes vides ou composées uniquement de ponctuation (`TypeError`)
- Ne modifie pas les fiches d'entrée (copie profonde des résultats)

### Limites

- Recherche en mémoire uniquement, pas persistante
- Pas de classement par pertinence, résultats dans l'ordre d'entrée
- Pas de recherche dans les contenus originaux ni les preuves ; une valeur explicitement indexée dans `fields` reste recherchable
- Pas de recherche dans les identifiants ou les preuves
- Les fiches Drive actuelles ne contiennent que des métadonnées : pas de recherche dans le contenu Drive
- Aucune synchronisation ou recherche en temps réel dans les sources
- Aucun état d'accès actuel, disponibilité de l'original ou fraîcheur ne peut être déduit de la fiche seule

### Exemple fictif

```javascript
const document = createIndexRecord("source-a", "123", {
  name: { value: "Facture Électricité", source: "provider" },
  type: "document",
  dates: { achat: { value: "2024-01-15", source: "provider" } },
  fields: [{ name: "montant", value: "150 euros", source: "extracted" }],
  coverage: "partial"
});

const results = searchIndex([document], "electricite facture");
// Retourne le document avec les raisons de correspondance
```

### Contexte des sources

`searchIndexWithContext(records, query, sourceDescriptors, options)` dans [index-search-context.js](../../index-search-context.js) appelle `searchIndex` sans en modifier les résultats et renvoie `{ results, sources }`. `sourceDescriptors` est un tableau ordonné de descripteurs déclarés par l'appelant, chacun avec :

- `sourceId` : identifiant unique non vide ;
- `scope` : description non vide du périmètre, ou `null` ;
- `availability` : `available`, `unavailable` ou `unknown` ;
- `indexing` : `complete`, `partial`, `in-progress` ou `unknown` ;
- `lastCheck` : date au format accepté par le modèle, ou `null`.

La sortie `sources` copie les descripteurs concernés et ajoute `resultCount`, le nombre de résultats correspondant à la requête et à tous les filtres. Sans filtre de source, toutes les sources déclarées sont présentes, y compris celles sans résultat. Avec `sourceId`, seule la source déclarée correspondante est incluse. Toute fiche d'une source non déclarée est rejetée même si elle est exclue par un filtre.

```javascript
const context = searchIndexWithContext([document], "facture", [{
  sourceId: "source-a", scope: "Sélection fictive",
  availability: "unavailable", indexing: "partial", lastCheck: null
}]);
// context.results contient la correspondance ; context.sources[0].resultCount vaut 1.
```

Les états sont des déclarations fournies par l'appelant, pas des constats réalisés par la recherche. `complete` concerne uniquement le périmètre déclaré, qui peut lui-même être inconnu. Couverture d'une fiche, état d'indexation de la source, disponibilité et date de vérification sont distincts : aucun de ces éléments ne garantit que les résultats sont exhaustifs ou à jour. Aucun accès aux sources, affichage ni persistance n'est ajouté.

## Propositions d'échéances expérimentales

`findDeadlineCandidates(records, referenceDate, daysToExamine)` dans [index-deadline-candidates.js](../../index-deadline-candidates.js) examine les fiches valides avec une date de référence explicite `AAAA-MM-JJ` et une période entière non négative sûre. Les jours sont calendaires UTC : aujourd'hui vaut zéro et les deux bornes de la période sont incluses. Le résultat `{ candidates, ineligible }` préserve l'ordre des fiches dans chaque liste.

Par défaut, une proposition exige une date `dates.echeance` calendaire, non estimée, et une preuve avec extrait. L'option `includeEstimated: true` permet aussi les fiches explicitement `auto-estimate`, qui restent marquées `estimated: true` dans la proposition. Celle-ci contient `sourceId`, `itemId`, `name`, `dueDate`, `source`, `proof` et `daysUntil`. Une échéance non éligible figure dans `ineligible` avec tous les motifs applicables : `date-heure non prise en charge`, `échéance estimée`, `preuve absente`. Les fiches sans échéance et les dates admissibles hors période ne produisent aucune entrée.

```javascript
const contrat = createIndexRecord("source-fictive", "contrat", {
  dates: { echeance: {
    value: "2025-01-03", source: "extracted",
    proof: { excerpt: "Échéance : 03/01/2025", location: "page 1" }
  } }
});
const propositions = findDeadlineCandidates([contrat], "2025-01-01", 2);
// propositions.candidates[0].daysUntil vaut 2.
```

Il s'agit de propositions en mémoire, pas d'alertes ni de notifications. Le module ne vérifie pas l'authenticité des preuves ni la fraîcheur de l'index, et n'interroge aucune source. L'absence de proposition ne prouve pas l'absence d'une échéance ; les règles de notification définitives restent à définir.

## Extraction expérimentale depuis du texte

`extractDeadlineFromText(record, text)` dans [index-text-analysis.js](../../index-text-analysis.js) reçoit une fiche valide et un texte déjà extrait. Il retourne une copie indépendante et `status` : `kept` si une échéance existait déjà, `extracted` pour une date explicite, `estimated` pour une échéance calculée, `estimate-ineligible` si les preuves d'achat/durée sont absentes ou ambiguës, `not-found` si aucun libellé pertinent n'est trouvé, `invalid-date` pour une date explicite invalide, ou `ambiguous` si le texte présente plusieurs lignes candidates ou une ligne candidate de forme non reconnue.

Une seule ligne contenant un libellé explicite (`Fin de garantie`, `Date d'expiration`, `Expiration`, `Date d'échéance` ou `Échéance`), suivi de `:`, `au` ou `le` et d'une date valide `JJ/MM/AAAA` ou `AAAA-MM-JJ` peut être retenue. Un texte descriptif et d'autres faits explicitement libellés, comme une date d'achat, peuvent précéder le libellé d'échéance sur la même ligne ; la date d'échéance doit être en fin de ligne. La ligne entière est copiée exactement comme preuve, sans localisation inventée. Plusieurs lignes ou libellés d'échéance, les formulations niées ou toute information après la date entraînent une abstention, y compris si plusieurs dates sont identiques.

Sans fin de garantie explicite, une estimation peut être proposée si le texte fiable contient exactement une date d'achat prouvée et exactement une `Durée de garantie : N an(s)`, `année(s)` ou `mois`, avec une durée entière comprise entre 1 et 50. La date calculée utilise l'anniversaire calendaire ; si le jour n'existe pas dans le mois cible, il est ramené au dernier jour de ce mois. Les deux lignes sources sont conservées ensemble comme preuve. Les autres unités/formulations, données manquantes ou ambiguës ne sont pas calculées. L'estimation est visuellement distinguée et doit être confirmée explicitement avant tout enregistrement de date ou création d'alerte.

La couverture, la dernière vérification, les faits et les corrections existantes sont conservés. Le texte complet n'est pas ajouté à l'index. Le format volontairement restrictif ne reconnaît pas toutes les formulations ; il ne valide ni le contexte du document, ni l'authenticité de la preuve ou la qualité OCR.

## Parcours expérimental des échéances dans l'application

Dans la recherche, [index-deadline-search.js](../../index-deadline-search.js) réutilise les fiches et les copies des segments actifs du dernier instantané `IndexSession.syncDocuments`. Les segments issus d'une extraction fiable de la session sont utilisables immédiatement ; au redémarrage, seuls ceux dont la provenance a été vérifiée sont reconstruits. Les anciennes copies sans provenance, les provenances invalides et les textes de remplacement ne produisent pas de proposition. Les segments de chaque document sont analysés ensemble : plusieurs lignes candidates, même identiques ou réparties sur plusieurs segments, entraînent une abstention. Une échéance explicite et prouvée reste admissible ; une estimation n'est proposée que si l'extraction d'achat et de durée satisfait les critères ci-dessus. Une estimation déjà confirmée manuellement n'est pas proposée à nouveau.

L'interface affiche les échéances détectées du jour local jusqu'à 90 jours calendaires inclus, avec source, extrait littéral, couverture et état d'accès connu. Les échéances passées ou plus éloignées ne sont pas affichées et leur nombre est indiqué. Les documents sans texte fiable et les dates ambiguës ou invalides apparaissent parmi les documents à vérifier. La copie textuelle locale peut être consultée lorsqu'elle existe ; ce n'est pas l'original. Les mises à jour de l'instantané recalculent les propositions, sans conserver de proposition séparément. Le bouton d'actualisation recalcule aussi la date de référence, sans lecture des sources ni accès réseau. Une page ouverte au-delà de minuit nécessite une actualisation.

Les propositions explicites et estimées restent **non confirmées** jusqu'à une action affirmative. Pour les catégories prises en charge par le moteur, la confirmation revérifie l'identité unique de la copie persistée, la date et la présence de toutes les lignes de preuve ; une date ambiguë, non vérifiable ou hors seuil ne crée pas d'alerte. La confirmation enregistre l'échéance avec provenance utilisateur, preuve et source, puis crée une alerte selon les règles de seuil et préférences de notification existantes. L'annulation ne modifie ni document ni alerte. L'original fournisseur n'est pas touché. Les changements et pertes d'accès aux sources ne sont pas encore reliés au cycle de vie des alertes et restent à valider sur plusieurs connecteurs. Une provenance détecte les incohérences mais ne prouve ni l'authenticité ni la fraîcheur de l'original. L'extraction reste limitée aux libellés et formats ci-dessus ; l'absence de résultat n'établit pas l'absence d'échéance.
