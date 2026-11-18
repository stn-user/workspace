# Modèle d'index multi-sources — 15.5bis.2

**Statut : expérimental.** Les fiches communes sont enregistrées dans chaque document du store IndexedDB `documents`, sous `indexRecord` (schéma de fiche `1.2.0`). La base applicative est en version 4 : la migration v3 a ajouté les fiches et la migration v4 le store `source_sync`, de façon additive sans remplacer les documents. Les faits persistés reviennent dans la recherche après restauration et vérification de la provenance du contenu. L'index de recherche et les extraits restent en mémoire. Les états des parcours de sources sont enregistrés séparément dans `source_sync`, sur l'appareil courant uniquement ; ils ne sont pas encore synchronisés entre appareils.

## Forme et validation

`createIndexRecord(sourceId, itemId, options)` construit une fiche indépendante des objets fournis ; il rejette les données invalides par `TypeError`. `isValidIndexRecord(record)` contrôle la même structure et renvoie un booléen. La version actuelle est `schema: "1.2.0"` ; elle ne constitue pas une version IndexedDB. La migration convertit `1.0.0` et `1.1.0` en `1.2.0`, en initialisant à `null` les informations absentes.

- L'identité logique est le triplet `(sourceId, accountRef, itemId)`. `sourceId` et `itemId` sont des chaînes non vides ; `accountRef` est `null` ou une empreinte SHA-256 de 64 caractères hexadécimaux minuscules. Cette empreinte est pseudonymisée, pas anonyme, et ne prouve pas l'accès actuel.
- Les copies OneDrive et Dropbox renseignent `accountRef` seulement à partir de leur empreinte de compte déjà conservée. Les sources locale et Drive, ainsi que les fiches historiques sans empreinte connue, restent `null` (« compte non attribué ») ; aucune identité n'est déduite d'un nom, chemin ou jeton absent.
- L'isolation du triplet est testée avec des comptes synthétiques. La synchronisation et l'isolation réelle entre appareils ne sont pas implémentées ni validées.
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

- Les identités sont comparées par triplet exact `sourceId`, `accountRef`, `itemId`, sans concaténation.
- Le nom fournisseur est actualisé à l'identique, y compris les différences de casse. Un nom absent est renseigné ; un nom d'une autre provenance, notamment une correction utilisateur, est conservé.
- Type, dates, faits, preuves, couverture et dernière vérification existants sont conservés. Une découverte de métadonnées ne prouve pas que le contenu analysé est à jour.
- `needs-review` signale une couverture `partial` ou `analyzed`, même si l'élément est absent de la découverte. `not-analyzed` accompagne une nouvelle fiche ou une couverture `metadata` ou `unavailable`. `unknown` signale une couverture inconnue. Ces états ne prouvent ni changement du contenu ni accès actuel à la source.

Par exemple, une fiche avec nom utilisateur `Facture.txt` et couverture `analyzed`, redécouverte sous le nom fournisseur `Facture_2024.pdf`, conserve son nom et sa couverture ; son résultat porte `verificationState: "needs-review"`.

Une fiche absente d'une découverte, même vide ou incomplète, reste conservée : son absence ne démontre pas sa suppression. `removeIndexRecord(records, sourceId, itemId, accountRef)` supprime explicitement une fiche de la liste en mémoire et retourne `{ records, removed: true }` ; `accountRef` peut être omis seulement si le couple source/élément désigne une fiche unique. Une identité ambiguë, inconnue ou une entrée invalide provoque une erreur. La fonction n'appelle aucun connecteur et ne supprime pas l'original.

## Persistance et migration

`document-index.js` construit les fiches durables à partir des informations déjà présentes dans le document. Il ne date pas automatiquement une vérification ; les métadonnées sans contenu vérifié restent en couverture `metadata`. Une couverture `partial` exige une provenance de contenu restaurée et vérifiée. Le parseur existant est appliqué uniquement aux segments vérifiés : échéance, date, émetteur, montant et équipement explicitement étiqueté incluent une preuve littérale et sa ligne. Les types et catégories déduits par règles sont marqués comme estimations automatiques. Une valeur d'échéance déjà fournie par le document n'est reprise que si sa preuve est aussi littéralement présente dans le texte vérifié. Pour les photos, la date EXIF et les annotations explicitement saisies sont reprises sans inférer de personne, lieu ou événement.

Pour les nouvelles copies OneDrive, `oneDriveItemId` conserve localement l'identifiant opaque fournisseur nécessaire à une demande d'ouverture ultérieure. L'action d'ouverture vérifie l'empreinte du compte actif et relit `id`/`webUrl` via Graph au moment du clic ; elle confirme aussi que la copie et la session n'ont pas changé pendant la requête. Seul le `webUrl` courant est utilisé en mémoire, jamais persisté. Les copies historiques sans cet identifiant ne peuvent pas être rouvertes directement et restent consultables comme copies locales. Ce comportement est validé par des tests simulés, pas encore sur un compte OneDrive réel ni sur appareil mobile.

`document-index-migration.js` ajoute `indexRecord` aux documents historiques, puis les persiste un par un. En cas d'échec, l'initialisation signale et propage l'erreur ; au prochain lancement, les fiches déjà valides sont conservées et les documents restants migrés. Le document source, son contenu, ses provenances, ses annotations et ses vignettes ne sont pas supprimés ni remplacés par la migration. Les fiches existantes invalides ou rattachées à une autre identité provoquent une erreur plutôt qu'une réécriture silencieuse. Le retour arrière applicatif `rollbackDocumentIndexes` enlève uniquement `indexRecord` ; il ne rétrograde pas IndexedDB v3 vers v2 et ne garantit pas la compatibilité avec une ancienne version de l'application qui demande v2.

Lors d'une réindexation via `addDocument`, les corrections de nom, d'emplacement et de dates utilisateur ainsi que les champs utilisateur non issus directement des annotations photo sont préservés et prévalent sur une nouvelle extraction de même nom. Les champs gérés par les annotations photo reflètent les annotations courantes. `IndexSession` recharge les champs de la fiche durable après restauration du contenu ; si sa provenance est invalide, les faits `extracted` et `auto-estimate` sont écartés et la couverture revient à `metadata`.

Les extraits de preuve sont conservés dans `indexRecord` avec le document ; `contentProvenance` conserve des plages et une empreinte, pas une seconde copie du texte. Il n'y a pas d'expiration automatique : les copies, fiches, preuves, provenances et vignettes suivent la durée de vie du document Famili-IA et sont retirées avec lui lors d'une suppression explicite ou d'une purge. Cette suppression ne touche pas l'original chez le fournisseur. Le retour arrière de la fonctionnalité d'index est distinct : il retire uniquement `indexRecord` et laisse les autres données du document en place.

La détection de doublons de `document-deduplication.js` propose une correspondance exacte si les deux empreintes SHA-256 sont déjà disponibles, sinon une suggestion incertaine par nom normalisé. Les empreintes ne sont pas ajoutées systématiquement, les rapprochements n'entraînent aucune fusion et aucune interface de revue n'est livrée. L'évaluation du corpus fictif porte sur sept cas seulement ; elle ne démontre pas la qualité en production.

### Première baseline multi-sources du lot D

Mesure du 12 novembre 2026 avec Node v24.21.0 sous Windows. Depuis le répertoire du projet :

```powershell
node --test tests\multi-source-quality.test.js
```

Le [corpus annoté](../../tests/fixtures/multi-source-quality-corpus.js) réutilise les sept cas d'extraction ci-dessus et ajoute onze cas : identifiant identique sur deux sources, échéance positive sur chaque source, échéances ambiguë/invalide/niée/estimée, copie altérée, métadonnées seules, date corrigée et photo annotée explicitement. Les 18 copies fictives représentent huit imports locaux, quatre copies Drive et six OneDrive ; 13 ont un texte partiellement recherché et cinq restent en métadonnées seules. Les provenances et fiches sont construites puis restaurées par les mécanismes réels du modèle. Les fournisseurs, leurs connexions et les décodeurs PDF/DOCX ne sont **pas** exécutés par cette mesure.

Les [tests](../../tests/multi-source-quality.test.js) évaluent `IndexSession`, pas le classement documentaire de l'Assistant. Les annotations attendues ne sont pas calculées à partir des résultats du moteur. Les identités sont comparées par paire source/élément ; les métriques sont micro-agrégées sur tous les résultats, sans classement ni coupure top-k. Une date, son extrait exact et le caractère estimé doivent tous correspondre pour qu'une proposition soit correcte.

| Mesure sur ce petit corpus | Résultat |
|---|---|
| Requêtes et filtres | 20 cas ; 20 résultats pertinents attendus au total |
| Recherche : vrais positifs / faux positifs / faux négatifs | 18 / 0 / 2 |
| Précision / rappel | 100 % / 90 % |
| Détail local / Drive / OneDrive : résultats corrects et manqués | 8 et 2 / 5 et 0 / 5 et 0 |
| Abstentions justifiées | 4/4 cas dont l'annotation attend zéro résultat |
| Preuves extraites vérifiées | 18 raisons de résultat, toutes littérales dans les segments vérifiés ; mot attendu également contrôlé pour les requêtes de contenu |
| Propositions d'échéance | 5/5 correctes sur les trois sources, dont une estimation explicitement marquée ; aucun faux positif ni faux négatif sur ces annotations |
| Autres échéances | Neuf documents à vérifier, trois hors période ; date corrigée non reproposée |
| Recherche : moyenne / maximum observés | 4,18 ms / 41,82 ms |
| Préparation des copies/fiches et restauration initiale / calcul des propositions | 266,07 ms / 8,85 ms |
| Variation de tas Node après préparation, mesures et seconde session | +3 084 192 octets |

Lors de cette première mesure, les deux faux négatifs étaient conservés dans le score : `chaudierre` ne retrouvait pas le document chaudière, et `facture de la piscine` ne retrouvait pas la facture pertinente. Le moteur initial exigeait tous les mots sans tolérance aux fautes ni retrait des mots-outils. Ces échecs n'étaient **pas** comptés comme de bonnes abstentions. Leur correction est mesurée ci-dessous, sans traitement distant.

La suite contrôle aussi les résultats après restauration de session simulée par copie structurée (sans lecture IndexedDB), les preuves et propositions retirées après altération du contenu, la séparation des copies de sources différentes et l'absence de résidus après retrait de tout l'instantané. Aucun appel réseau n'est effectué, et un appel à `fetch` pendant la mesure échouerait. Garde-fous initiaux : précision 100 %, rappel au moins 85 %, aucune preuve invalide, recherche individuelle sous une seconde et préparation sous dix secondes sur ce petit corpus. Le seuil de rappel a depuis été porté à 100 % après correction des deux manques ci-dessous.

Ces temps sont une exécution indicative de la sélection de 22 tests ciblés, pas un percentile ni une garantie mobile ; la charge des autres tests peut les influencer. La variation de tas dépend du ramasse-miettes, inclut les objets du test et la seconde session, et n'est pas un pic mémoire. Le corpus restreint ne valide ni une bibliothèque volumineuse, ni la pertinence générale du français, ni la qualité sémantique de toutes les preuves, ni les formats, accès ou révocations fournisseurs. Les propositions ne sont pas des alertes créées ou envoyées ; leurs seuils, confirmations et notifications restent couverts séparément. Les lots C et D restent ouverts pour un corpus représentatif et les validations réelles.

### Améliorations lexicales après la baseline

La recherche des noms/champs et des segments vérifiés partage désormais `getIndexSearchTerms` et `matchIndexTerm` dans [search-utils.js](../../search-utils.js). Elle retire les mots-outils de la liste existante et traite les élisions françaises `l'`/`d'` devant une lettre, sans retirer les mots courts significatifs ni les chiffres. Une requête composée uniquement de mots-outils ne renvoie aucun résultat, même avec des filtres ; une requête véritablement vide avec filtres conserve le parcours existant. Les termes retenus restent combinés par ET.

Les sous-chaînes littérales restent admissibles comme auparavant. En complément, une substitution, insertion ou suppression de lettre est tolérée entre deux mots normalisés alphabétiques de 6 à 32 lettres. Il n'y a pas de correction approchée des mots courts, chiffres ou termes alphanumériques, ni des négations protégées (`aucune`, `aucuns`, `jamais`). Les autres négations courantes (`sans`, `pas`, `non`, `aucun`) restent des termes littéraux ; elles ne sont pas interprétées comme des commandes d'exclusion. Les filtres de source/type/couverture/date/personne/lieu/événement restent exacts et ne passent pas par ce rapprochement.

Une raison approchée expose `approximateMatches: [{ queryTerm, matchedTerm }]`, avec les deux termes normalisés. [experimental-result.js](../../experimental-result.js) affiche « correspondance approchée » sans changer la question ni le texte de la preuve. Les extraits restent des sous-chaînes exactes des segments vérifiés ; dans le contenu, une correspondance littérale remplace une correspondance approchée trouvée plus tôt. Aucune réécriture de document, connexion ou nouvelle indexation n'est déclenchée. Le calcul de distance préexistant est partagé avec l'Assistant, dont les règles et seuils de classement restent inchangés.

Mesure après correction sur **les mêmes 18 copies et 20 cas annotés**, le 12 novembre 2026 :

| Mesure | Avant | Après |
|---|---|---|
| Résultats corrects / non pertinents / manqués | 18 / 0 / 2 | 20 / 0 / 0 |
| Précision / rappel | 100 % / 90 % | 100 % / 100 % |
| Abstentions justifiées | 4/4 | 4/4 |
| Raisons extraites à preuve littérale valide | 18 | 22 |
| Propositions d'échéance correctes | 5/5 | 5/5 |

La sélection de 53 tests Node ciblés passe, y compris les cinq tests du classement documentaire de l'Assistant. Sur cette exécution indicative : moyenne de recherche 5,31 ms, maximum 25,96 ms ; préparation 135,13 ms, propositions 10,29 ms, variation du tas +2 403 304 octets. Ces valeurs ne permettent pas de conclure à un gain ou une régression de performance entre exécutions. 25 scénarios navigateur passent, dont trois nouveaux parcours à 390, 768 et 1280 px avec import TXT fictif, preuve inchangée, mention d'approximation, filtre source, rechargement et absence de résultats pour une référence numérique erronée, une négation non présente ou des mots-outils seuls. Compilation et contrôle du diff réussis.

Limites : pas de synonymes supplémentaires, pas d'analyse générale des questions, pas d'opérateurs booléens ni de tolérance aux transpositions de deux lettres. Des mots ou codes purement alphabétiques voisins peuvent correspondre : la mention d'approximation invite à vérifier la preuve. Les identités et permissions ne sont pas élargies. Les métriques parfaites restent propres à ce petit corpus ; comptes externes, volumes, appareils physiques et lecteur d'écran ne sont pas validés par cette tranche.

### Extension des requêtes annotées

Le 13 novembre 2026, la même session de mesure a été rejouée avec **35 requêtes/filtres annotés sur les mêmes 18 copies fictives**. Les 15 cas ajoutés évaluent notamment les élisions, pluriels, fautes simples, mot-outil seul, termes courts, chiffres, transposition, combinaisons de termes et filtres exacts de source, couverture et date. Les annotations attendues ont été inscrites dans le jeu de tests ; aucune réponse du moteur n'est utilisée pour les calculer. Le corpus comprend maintenant 31 occurrences de résultats pertinentes et dix cas annotés sans résultat attendu, parmi lesquels des absences lexicales et des exclusions par filtres exacts.

| Mesure sur les 35 requêtes/filtres | Résultat |
|---|---|
| Résultats pertinents attendus | 31 |
| Vrais positifs / faux positifs / faux négatifs | 31 / 0 / 0 |
| Précision / rappel | 100 % / 100 % |
| Cas sans résultat attendu correctement vides | 10/10 |
| Raisons extraites vérifiées littéralement | 53 ; aucune preuve invalide |
| Propositions d'échéance | 5/5 toujours exactes, sans faux positif ni faux négatif |
| Recherche : moyenne / maximum observés | 1,85 ms / 9,16 ms |
| Préparation / propositions d'échéance | 58,51 ms / 9,05 ms |
| Variation de tas Node | +2 292 832 octets |

La commande `node --test tests\multi-source-quality.test.js` passe ses deux tests. Elle vérifie aussi le rejeu après restauration structurée, l'absence d'appel réseau, les preuves et échéances après redémarrage simulé, ainsi que l'absence de résidus après altération/retrait. Les temps et le delta de tas sont indicatifs, sensibles à l'hôte et au ramasse-miettes ; ils ne sont pas comparables comme un benchmark stable. Cette extension augmente la variété des questions mais **pas** le nombre de copies ni leur représentativité. Les résultats restent une mesure synthétique étroite, pas une certification du français naturel ni de la production.

## Structures existantes et décisions ouvertes

- Dans [db.js](../../db.js), le store `documents` a pour clé `id` ; aucune clé composée n'est introduite par ce lot.
- [data-inventory.js](../../data-inventory.js) utilise notamment `type`, `category` et des extensions pour classer les résultats existants. Ces champs n'ont pas automatiquement la même sémantique que le type général de cette fiche.
- La couverture réutilise le module existant. Les documents historiques sont convertis par la migration IndexedDB ; les autres formes de fiches ne sont pas automatiquement interprétées.

Les identités stables de comptes et appareils, la classification générale, l'extraction exhaustive, la couverture multi-plateforme, les politiques complètes de conservation/suppression des extraits et la compatibilité d'un retour à l'ancienne version IndexedDB restent à définir.

La fiche est embarquée dans le document afin de préserver les chemins de stockage, chiffrement et suppression Famili-IA existants ; aucun index séparé ni synchronisation n'est réalisé ici. Le parcours OneDrive expérimental découvre les éléments accessibles lors d'un scan volontaire ; il ne constitue pas une découverte générale de toutes les sources. Supprimer une fiche d'index ne supprime pas l'original.

## Parcours expérimental local et Drive dans l'application

`IndexSession.syncDocuments(documents)` recharge les fiches durables valides et rapproche les informations de l'instantané des documents locaux, Drive, OneDrive et Dropbox déjà présents dans l'application, sans lecture de fichier ni nouvel appel cloud. Les exemples de démonstration sont exclus. Les faits issus du contenu ne sont conservés que si sa provenance a été restaurée et vérifiée. L'identité est le triplet source (`local`, `drive`, `onedrive` ou `dropbox`), empreinte de compte (ou `null`) et identifiant applicatif ; les identifiants locaux sont ceux des documents importés, pas une garantie de réidentification du fichier original. Pour OneDrive, l'identifiant applicatif est dérivé de l'identité du compte Microsoft et de l'identifiant de l'élément ; pour Dropbox, il est dérivé du fournisseur, du compte et de l'élément. Les triplets répétés utilisent la dernière entrée de l'instantané dans l'index ; l'Assistant refuse néanmoins une réponse si plusieurs copies correspondent au même triplet. Les entrées invalides interrompent la mise à jour sans remplacer l'état précédent.

Le rapprochement conserve les corrections de nom en mémoire lorsque la même identité reste présente ; les éléments absents de l'instantané applicatif sont retirés de cet index, sans suppression des originaux. Une absence ne signifie pas que le fournisseur a supprimé un fichier. `getAllRecords`, `getRecordsBySource`, `updateRecord` et `search` travaillent sur des copies ou résultats indépendants. Les corrections de l'index ne sont pas exposées dans l'interface ni persistées.

Depuis A1 de [l'Assistant enrichi](assistant-enrichi.md), Recherche et Assistant personnel utilisent la même instance. `getRevision()` expose un compteur volatil modifié lorsque les fiches ou segments actifs changent dans `syncDocuments` ou `updateRecord`, mais stable à synchronisation identique. Ce compteur ne constitue ni une empreinte persistante, ni une date de contrôle ou une observation d'accès. Il permet de retirer les réponses et leurs preuves lorsque leur instantané n'est plus actuel. Le module [assistant-context.js](../../assistant-context.js) prépare les intentions documentaires et réutilise `search`, sans second classement ni effet sur le rendu de Recherche ; les exemples de repli restent isolés.

L'interface expérimentale recherche les noms et les segments explicitement transmis comme texte extrait par le lecteur. Les imports locaux TXT, Markdown, les fichiers DOCX lisibles et les pages à texte incorporé des PDF locaux fournissent ces segments ; les textes de remplacement OCR Web ne le font pas. Sur l'application native, le texte reconnu par OCR sur les pages PDF scannées et les images est également indexable. L'utilisateur a confirmé le 10 novembre 2026 les essais demandés sur tablette Android avec une image et un PDF scanné fictifs. Les formats Word `.doc` ne sont pas pris en charge et les erreurs DOCX sont propagées, sans texte indexable de substitution. Les fichiers texte, Markdown et Google Docs sélectionnés via Drive fournissent leur contenu lu ; les PDF Drive sélectionnés fournissent seulement les segments à texte incorporé. OneDrive fournit les segments TXT/Markdown et PDF incorporés dans les limites décrites par [l'étude OneDrive](../../ETUDE_ONEDRIVE.md). Les classeurs XLS/XLSX locaux fournissent également du texte indexable. La lecture XLSX et DOCX est testée avec des fichiers synthétiques, dont un DOCX OOXML lu par Mammoth sous Node et Chromium ; un corpus de documents Word réels reste à valider. Le texte des anciens documents sans provenance reste exclu : seuls leurs noms sont recherchés.

Le lecteur PDF Drive conserve son texte de présentation avec ses étiquettes de page, mais ces étiquettes et les résultats OCR ne font pas partie des segments recherchables. Sur le Web, un PDF scanné ou mixte dont une page nécessite l'OCR est refusé comme auparavant ; aucune couverture partielle n'est promise pour cette sélection. Le lecteur local utilise les plugins Capacitor Filesystem et OCR natifs ; le texte reconnu sur les pages PDF scannées et les images est transmis comme segment indexable. Les essais sur tablette Android avec fichiers fictifs ont été confirmés par l'utilisateur le 10 novembre 2026. Les segments sont transmis temporairement en mémoire, puis seules leurs positions et leur provenance sont enregistrées avec le document.

Pour les nouveaux contenus, `contentProvenance` est stockée avec le document dans IndexedDB : version, méthode, positions des segments dans le contenu et empreinte SHA-256 liant source, identifiant, méthode, positions et contenu. Au redémarrage, les positions et l'empreinte sont vérifiées avant de reconstruire les segments ; une provenance invalide n'autorise que la recherche par nom et est signalée. Aucune copie supplémentaire du texte ni migration des anciens documents n'est créée. L'empreinte détecte les changements accidentels mais n'authentifie pas les données face à un acteur capable de modifier à la fois contenu et provenance.

Dropbox ajoute les méthodes `dropbox-text` et `dropbox-pdf-text`, acceptées uniquement sur un document reconnu de cette source. La première tranche Web conserve les segments TXT/Markdown ≤ 1 Mo et PDF incorporés ≤ 10 Mo/20 pages ; un dépassement ou un PDF illisible reste en métadonnées seules avec motif visible. Le lecteur de flux borné est partagé avec OneDrive. La réponse de téléchargement doit confirmer identifiant, nom et révision avant conservation. L'empreinte de compte, la révision et le chemin connus restent attachés au document ; aucun jeton, identifiant de compte en clair ou lien temporaire n'est persisté. Les copies sont séparées par compte et les versions existantes ne sont pas remplacées. Les photos conservent `media_info.metadata.time_taken` si présent ; `media_info.metadata.location` n'est consulté et indexé qu'avec le consentement GPS actif. Aucun pixel, EXIF ou autre champ photo n'est lu. Voir [le protocole Dropbox](../../ETUDE_FAISABILITE_CLOUDS.md#première-tranche-dropbox-web--lot-f).

La couverture `partial` indique la présence de segments recherchables, sans prétendre que tout le document est analysé. Chaque terme de contenu possède un extrait littéral, potentiellement distinct si les termes sont éloignés ; une correspondance exige tous les termes dans le nom ou tous dans les segments du contenu. Aucun résumé n'est traité comme preuve. L'affichage utilise du texte, pas du HTML interprété. L'index et ses extraits ne sont pas persistés séparément ; le document, son contenu et sa provenance sont conservés dans le stockage applicatif existant.

Chaque résultat affiche le type, la source, l'emplacement et les dates disponibles, la couverture, la dernière vérification de source (ou « inconnue »), l'observation d'accès et les raisons de correspondance avec leur provenance et leurs éventuelles preuves ou estimations. Les dates de modification Drive proviennent des métadonnées conservées lors de la sélection ; les dates locales dont la nature est inconnue ne sont pas qualifiées de dates de création ou de modification. Les informations manquantes sont signalées. Le bouton de copie n'apparaît que si un texte est conservé dans Famili-IA ; le détail d'une photo utilise le parcours de vignette existant. Pour les nouvelles copies OneDrive, une action distincte peut relire l'identifiant et le `webUrl` courant auprès de Graph et tenter l'ouverture, sous réserve d'une validation réelle encore à faire. Drive, Dropbox et les imports locaux n'ont pas d'action de réouverture dans ce parcours ; l'utilisateur doit y retrouver l'original manuellement. Aucun lien ni disponibilité d'accès n'est inventé. Lorsque les deux documents font partie des résultats, ceux portant des noms normalisés identiques ou des empreintes disponibles identiques sont regroupés comme rapprochements, mais chaque copie et sa source restent affichées séparément ; aucune fusion n'est faite.

Les imports, suppressions et la purge actualisent les résultats. La recherche interroge uniquement les copies présentes, sans nouvel appel cloud. OneDrive et Dropbox ne parcourent les dossiers qu'après déclenchement explicite ; OneDrive possède une revue de remplacement manuelle, Dropbox conserve les copies existantes sans remplacement. L'index ne vérifie pas l'accès actuel aux originaux et ne garantit pas la couverture de l'ensemble d'un appareil ou d'un compte. Une recherche sans résultat ne prouve pas l'absence de correspondance dans les textes non disponibles.

## Recherche expérimentale dans l'index commun 15.5bis.9

### Interprétation locale des recherches photo

`unified-index-query.js` reconnaît les demandes contenant « photo », « image » ou « souvenir » et utilise `moments-life-query.js` pour construire les filtres à partir des annotations disponibles. Les quantificateurs « tout », « toute », « tous », « toutes » ne deviennent pas des termes exigés dans les noms ou annotations : « montre moi toutes les photos de mon mariage » filtre ainsi sur l'événement explicite « Mariage » lorsqu'il existe. Le possessif « mon » n'identifie pas une personne ; aucun lien familial ou propriétaire d'événement n'est déduit.

Les dates complètes acceptées dans ces demandes sont `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA`, `AAAA-MM-JJ` et les dates françaises écrites comme « 6 septembre 2024 ». Jour et mois peuvent avoir un seul chiffre avec les séparateurs français. L'ordre est jour/mois/année pour ces trois formats, jamais mois/jour/année. Le calendrier est validé, y compris les années bissextiles ; une date reconnue mais invalide demande une correction au lieu de se rabattre sur l'année.

Une date complète produit deux bornes identiques inclusives sur la **prise de vue**, sans conversion de fuseau ; une demande portant explicitement sur des photos « importées » utilise la **date d'import**. Une année seule reste une recherche sur l'année entière. La phrase complète reconnue figure dans les critères affichés. Les photos sans date connue ne satisfont pas un filtre de date précis.

Cette interprétation ne transforme pas une date saisie seule sans intention photo en filtre de prise de vue ; les recherches documentaires ordinaires restent inchangées. Les termes de contenu restants et les négations restent littéraux, pas des exclusions sémantiques. Les résultats se limitent toujours aux copies présentes dans l'index, sans nouvel accès distant ni reconnaissance visuelle.

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

- `sourceId`, `accountRef`, `itemId` : identité séparée ; `accountRef: null` indique un compte non attribué
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

Par défaut, une proposition exige une date `dates.echeance` calendaire, non estimée, et une preuve avec extrait. L'option `includeEstimated: true` permet aussi les fiches explicitement `auto-estimate`, qui restent marquées `estimated: true` dans la proposition. Celle-ci contient `sourceId`, `accountRef`, `itemId`, `name`, `dueDate`, `source`, `proof` et `daysUntil`. Une échéance non éligible figure dans `ineligible` avec tous les motifs applicables : `date-heure non prise en charge`, `échéance estimée`, `preuve absente`. Les fiches sans échéance et les dates admissibles hors période ne produisent aucune entrée.

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
