# Audit initial de l'intelligence produit — Phase 15

## Portée et limites

Cet audit est une lecture statique du code, de la documentation et des tests existants, complétée par l'exécution des tests ciblés de recherche, d'alertes et de lecture de fichiers. Il établit un état de départ, pas une mesure de précision en production : le projet ne contient pas encore de corpus représentatif ni de métriques de qualité utilisateur.

Les tests ciblés exécutés sont `search-utils.test.js`, `tests/phase7.test.js` et `tests/local-files.test.js` : 15 tests réussis. L'avertissement de `pdf.js` concernant les polices standard apparaît pendant le test PDF ; il ne fait pas échouer celui-ci.

## Synthèse

| Domaine | Capacité actuelle | Limite principale | Priorité |
|---|---|---|---|
| Recherche documentaire | Recherche locale déterministe, extraction de quelques faits et affichage d'extraits | Ce n'est pas une recherche sémantique intégrée ; couverture et qualité non mesurées | 2 |
| Alertes domestiques | Alertes de démonstration et règles simples à partir d'une date d'expiration | Extraction, cohérence des dates, déduplication et notifications insuffisamment fiables pour une promesse de prévention | 1 |
| Photos | Sélection de formats image ; branche OCR non raccordée dans le module de lecture audité | Pas d'EXIF, de métadonnées photo structurées, de recherche dédiée, de galerie ni de timeline | 3 |

## 1. Recherche documentaire

### État observé

- `search-utils.js` normalise les accents, retire des mots fréquents, tolère certaines fautes de frappe et recherche des correspondances lexicales.
- Quelques intentions (montant, date, durée, fréquence, identifiant) permettent d'extraire une ligne de fait si elle correspond à des libellés attendus.
- La recherche de l'application classe les documents par correspondance textuelle, n'affiche que les trois premiers résultats et exige un seuil de score. Une réponse exacte est possible sur certains documents locaux ; les résultats de démonstration utilisent du contenu et des résumés fictifs.
- `calculateSemanticScore` existe, mais compare des métadonnées de documents. Le parcours principal de recherche ne lui transmet pas de document de référence : le score sémantique n'y est donc pas exploité.
- `search-utils.test.js` vérifie des cas précis sur trois exemples synthétiques. Il ne mesure pas la pertinence d'un classement sur un corpus de requêtes et de documents variés.

### Conséquence et cible

La recherche est une base utile et locale, mais les termes « sémantique » ou « IA » ne décrivent pas la capacité du parcours actuel. Il faut d'abord mesurer les résultats avec un jeu de requêtes représentatif, améliorer l'interprétation et le classement, puis fournir une réponse traçable vers le document et l'extrait source. Les requêtes non étayées doivent rester sans réponse plutôt que produire une supposition. La recherche essentielle doit rester utile dans l'offre gratuite.

Mesures à établir : précision et rappel parmi les premiers résultats, exactitude des faits extraits, taux d'abstention correcte en l'absence de preuve, et temps de réponse sur un jeu de documents local.

## 2. Alertes et suivi domestique

### État observé

- Le foyer de démonstration contient des équipements et des alertes prédéfinis ; ce sont des exemples, pas des détections issues des documents réels de l'utilisateur.
- `document-parser.js` classe les documents par quelques mots-clés et affecte à une garantie la première date reconnue dans le texte, sans établir qu'il s'agit bien d'une date d'expiration ni conserver sa provenance.
- `alert-engine.js` applique des seuils par type aux champs `expiryDate`. Les dates invalides ne sont pas explicitement rejetées et les dates passées satisfont aussi les seuils.
- L'interface recalcule la couleur avec `calculateAlertType` dans `state.js`, selon une règle générique distincte des seuils du moteur. L'urgence affichée peut donc différer de celle calculée à la création.
- Au démarrage, `initState` ajoute les alertes recalculées aux alertes existantes sans déduplication ni persistance de cette synchronisation. Les tests existants vérifient `calculateAlertType`, mais pas `generateAlertForDoc`, `refreshAlerts` ou le cycle de vie des alertes.
- Le planificateur de notifications relance une vérification quotidienne ; la sélection des échéances repose sur l'écart absolu et ne mémorise pas les notifications déjà envoyées. Il n'y a pas de contrôle par catégorie ni de réglage de fréquence dans le parcours audité.

### Conséquence et cible

La fiabilité des alertes est le premier chantier recommandé : c'est la valeur distinctive de l'offre Sérénité, mais les règles actuelles ne suffisent pas à promettre qu'un utilisateur n'oubliera plus une échéance. Avant d'ajouter davantage de déclencheurs, le système doit distinguer date d'échéance et date quelconque, rejeter les valeurs non fiables, harmoniser le calcul et l'affichage, dédupliquer les recalculs et contrôler le cycle de notification.

Mesures à établir sur des cas fictifs annotés : précision des alertes, échéances pertinentes manquées, alertes sans preuve exploitable, doublons après redémarrage, et répétitions de notifications. Toute alerte devra renvoyer à une source vérifiable et rester corrigeable ou désactivable.

## 3. Photos

### État observé

- Les sélecteurs et scanners acceptent plusieurs formats d'image.
- Le code contient un branchement OCR prévu pour la plateforme native, mais `local-files.js` initialise `Capacitor` et `Ocr` avec des doublures fixes ; ce module suit donc actuellement le parcours Web, qui retourne un texte de remplacement. L'image rejoint le flux de lecture de documents, pas un flux photo spécialisé.
- Le parcours ne lit ni ne stocke de métadonnées EXIF structurées (date de prise de vue, orientation ou GPS). Aucun écran dédié de bibliothèque photo, de recherche de moments ou de timeline n'a été identifié.
- Les tests de lecture de fichiers ne couvrent que l'extraction d'un PDF ; il n'y a pas de fixture photo ou EXIF ni de mesure de performance sur un ensemble d'images.

### Conséquence et cible

La prise en charge d'un fichier image ne constitue pas encore une fonctionnalité de gestion ou de recherche de photos. L'étape suivante doit établir les capacités réelles par plateforme, puis traiter localement les métadonnées utiles avec consentement explicite et distinct pour la localisation. La recherche de photos et la galerie dépendront de cette base.

Mesures à établir : taux d'extraction des métadonnées par format, traitement des dates/fuseaux/orientations inconnus, temps et mémoire sur appareils cibles, et absence de fuite des données EXIF dans les aperçus ou exports.

### Décision 15.3.a — sources et accès par plateforme (2 novembre 2026)

L'inspection de `index.html`, `app.js`, `local-files.js`, `capacitor.config.json`, du manifeste Android et des dépendances confirme que l'import photo réel se limite aujourd'hui à une sélection manuelle JPG/JPEG/PNG dans le flux Web. Les contrôles `accept` ne sont pas une validation. L'import vérifie ensuite les extensions, limite une image à 10 Mio et une sélection à cinq fichiers. Le scanner de dossiers accepte davantage d'extensions, mais cela ne signifie pas que ces fichiers sont correctement traités ou que ces formats sont pris en charge dans l'import utilisateur.

| Plateforme | Capacité actuelle vérifiée | Décision produit pour les photos |
|---|---|---|
| Web | Sélection explicite via `input type=file`; caméra proposée au navigateur via `capture`; scan de dossiers dépendant de `showDirectoryPicker`/`webkitdirectory`. Pas de service worker identifié. | Garder le sélecteur de fichiers comme parcours principal, accès ponctuel seulement ; le scan de photothèque n'est pas promis. Distinguer traitement local après chargement et ouverture hors ligne non garantie. |
| Android | Cible Capacitor présente, mais pas de plugin Photo Picker. `Filesystem.Directory.Documents` est utilisé à tort comme si les dossiers publics étaient parcourables ; sur Android 11+, Capacitor le limite aux fichiers créés par l'application. Aucune permission de lecture média n'est déclarée. | Utiliser ultérieurement le sélecteur photo système, qui donne accès aux seuls éléments choisis ; ne pas demander d'accès global aux photos pour l'import. Le code de scan existant n'est pas un parcours photo utilisable à garantir. |
| iOS | Aucune cible iOS dans le dépôt. | Hors engagement jusqu'à création et validation de la cible, du sélecteur natif et des exigences de confidentialité. |

Périmètre retenu : JPEG et PNG, cohérents avec l'import actuel ; HEIC/HEIF et WebP restent non garantis. Le traitement des fichiers sélectionnés reste local. L'application n'a pas de service worker Web ; le mode hors ligne intégral n'est pas promis. Depuis les décisions 15.3.c-d, le schéma versionné et l'extraction EXIF locale sont intégrés. Aucun accès persistant à la photothèque n'existe.

Sources officielles consultées le 2 novembre 2026 : [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem) (périmètre Android `Directory.Documents` et confidentialité iOS), [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker) (choix utilisateur sans accès global), [MDN `accept`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept) (filtre indicatif seulement) et [MDN `showOpenFilePicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) (activation explicite et disponibilité à détecter).

### Décision 15.3.b — parseur EXIF (2 novembre 2026)

Trois bibliothèques JavaScript ont été comparées à partir de leur documentation, de leurs manifestes npm et de leurs licences :

| Bibliothèque | Cibles et formats déclarés | Champs/capacités pertinents | Licence et limites pour Famili-IA |
|---|---|---|---|
| [`exifr`](https://github.com/MikeKovarik/exifr) | Navigateur et Node ; JPEG, TIFF, PNG, HEIC/HEIF, AVIF ; entrée `Blob`, `Uint8Array` et autres formats binaires ; aucun paquet runtime dépendant indiqué dans son manifeste. | EXIF/TIFF, GPS, orientation, segments d'image PNG/JPEG ; parsing ciblé de tags et GPS, conversions GPS en coordonnées décimales et résultats date typés selon sa documentation. | MIT. Correspond au périmètre JPEG/PNG sans engager HEIC/AVIF ; retenu comme candidat. Le format WebP n'est pas déclaré dans sa matrice principale et ne sera pas promis. |
| [`ExifReader`](https://github.com/mattiasw/ExifReader) | Navigateur et Node ; couverture plus large déclarée : JPEG, JPEG XL, TIFF, PNG, HEIC/HEIF, AVIF, WebP et GIF. | EXIF, GPS, IPTC/XMP/ICC selon format, orientation, détails d'image et vignettes ; build configurable. | MPL-2.0, dont les obligations liées aux fichiers couverts/modifiés requièrent une revue de conformité avant distribution. Couverture large mais dépasse les besoins initiaux. |
| [`exif-js`](https://github.com/exif-js/exif-js) | Navigateur et environnements AMD/CommonJS ; documentation centrée sur JPEG/TIFF. | Date, orientation et tags EXIF via API historique à callbacks ; lecture de `Blob` documentée. | MIT, mais couverture déclarée plus étroite et intégration API moins alignée avec le code ESM et la cible PNG. Non retenu. |

**Choix :** retenir `exifr` comme parseur à intégrer, en important explicitement seulement les fonctions nécessaires afin de garder une surface et un coût de bundle mesurés. Formats initiaux : JPEG/JPG et PNG. Métadonnées à extraire : date originale de prise de vue en conservant la valeur brute et l'absence éventuelle de fuseau, orientation, dimensions, modèle/appareil facultatif et GPS facultatif. Ces valeurs doivent ensuite être validées et normalisées par notre code ; l'analyseur n'est pas la source de vérité pour le fuseau, la confiance ou le consentement GPS.

La licence MIT est compatible avec l'intégration sous réserve de conserver les mentions requises. Cette comparaison documentaire n'est pas un avis juridique ni un test d'extraction. `exifr` a depuis été ajouté à `package.json` et raccordé en 15.3.d ; le schéma versionné a été défini en 15.3.c. Le comportement sur données malformées est couvert par des tests ciblés ; le benchmark du bundle et les mesures sur corpus/appareils restent à valider avant toute promesse de support étendu. HEIC/HEIF et WebP restent hors engagement produit initial.

Sources officielles consultées le 2 novembre 2026 :

- [`exifr` README](https://github.com/MikeKovarik/exifr), [`package.json`](https://raw.githubusercontent.com/MikeKovarik/exifr/master/package.json), [licence MIT](https://raw.githubusercontent.com/MikeKovarik/exifr/master/LICENSE).
- [ExifReader README](https://github.com/mattiasw/ExifReader), [`package.json`](https://raw.githubusercontent.com/mattiasw/ExifReader/master/package.json), [licence MPL-2.0](https://raw.githubusercontent.com/mattiasw/ExifReader/master/LICENSE).
- [exif-js README](https://github.com/exif-js/exif-js), [`package.json`](https://raw.githubusercontent.com/exif-js/exif-js/master/package.json), [licence MIT](https://raw.githubusercontent.com/exif-js/exif-js/master/LICENSE.md).

### Décision 15.3.c — schéma versionné des métadonnées photo (2 novembre 2026)

Le sous-objet optionnel `photoMetadata` est lié à l'identifiant stable du document par `documentId` et possède son propre `schemaVersion` (actuellement `1`). Il ne modifie pas le schéma global IndexedDB : les documents existants restent valides sans ce champ. La validation/migration dans l'état et le branchement du parseur au flux d'import sont réalisés.

```js
{
  schemaVersion: 1,
  documentId: "local-photo-…",
  captureDate: {
    raw: "2024:05:06 12:30:45",
    localDateTime: "2024-05-06T12:30:45",
    offsetMinutes: null,
    source: { kind: "exif", field: "DateTimeOriginal" }
  },
  orientation: { value: 6, source: { kind: "exif", field: "Orientation" } },
  dimensions: { width: 3024, height: 4032, source: { kind: "exif", field: "ImageSize" } },
  device: { make: "Camera Co", model: "Model X", source: { kind: "exif", field: "Make/Model" } },
  location: {
    status: "not_requested",
    latitude: null,
    longitude: null,
    altitudeMeters: null,
    source: null
  },
  contentHash: "sha256:<64 caractères hexadécimaux>" // ou null si non calculé
}
```

Le schéma est implémenté dans `photo-metadata.js` :

- Chaque valeur EXIF, utilisateur, nom de fichier ou migration historique porte sa propre provenance (`kind` et `field`). Les métadonnées absentes sont `null`, distinctes des métadonnées invalides, signalées par `normalizePhotoMetadata().issues` ; les versions inconnues et les créations invalides échouent explicitement.
- La date stocke la chaîne brute et les composantes locales normalisées sans conversion implicite en UTC. `offsetMinutes: null` signifie que le fuseau est inconnu, jamais UTC par défaut.
- L'état GPS distingue `not_requested`, `not_found`, `omitted`, `available` et `cleared`. Les coordonnées sont supprimées lors d'une omission/effacement ; omission et effacement portent une provenance utilisateur. Le contrôle de consentement avant extraction ou persistance est appliqué en 15.3.d.
- `hashPhotoContent` calcule le SHA-256 des octets originaux via Web Crypto ; `areDuplicatePhotos` ne traite comme doublons que les fichiers byte-à-byte identiques possédant le même hash. Les noms identiques ou ressemblances visuelles ne suffisent pas. L'environnement doit fournir Web Crypto ; sinon l'erreur est explicite.
- `mergePhotoMetadata` fusionne de façon déterministe les résultats partiels pour un même `documentId`, conserve les valeurs connues si un nouvel extrait est absent et autorise un effacement GPS explicite. Les entrées invalides ou les identifiants différents sont refusés.
- `migratePhotoMetadata` accepte la forme legacy v0 documentée par ses champs (`dateTaken`, `orientation`, dimensions, appareil, coordonnées) et produit le schéma v1. Une date legacy sans fuseau reste sans fuseau ; date invalide et coordonnées incohérentes produisent des diagnostics. Toute version supérieure sans migration échoue explicitement.

Les documents conservent `photoMetadata` comme sous-objet optionnel dans leur enregistrement IndexedDB, sans changement de version globale de la base ; `state.addDocument` valide ce sous-objet et refuse les liens ou champs invalides. À la lecture, les sous-objets legacy v0 valides sont migrés et persistés en v1 ; un enregistrement photo invalide est conservé sans le réécrire et l'erreur est journalisée explicitement. Les documents sans métadonnées photo ne sont pas modifiés. Les tests couvrent les dates valides/invalides et fuseaux, la provenance, l'orientation, les dimensions, le GPS et son effacement, les hash/duplicats, la fusion et la migration legacy.

### Décision 15.3.d — traitement local et confidentialité GPS (2 novembre 2026)

Le parseur `exifr` (`package.json`) est raccordé au flux d'import manuel des images JPEG/PNG dans `photo-exif.js`. Il lit un ensemble autorisé de balises EXIF (date, offset, orientation, dimensions, Make/Model) et calcule une empreinte sur les octets du fichier local. Les parseurs XMP/IPTC/ICC et autres segments non nécessaires sont désactivés. Le fichier image et les métadonnées ne sont pas envoyés par ce traitement. Les erreurs de parsing, date, orientation ou hash sont journalisées et signalées après import ; le document reste importable avec les champs indisponibles.

Le bloc GPS est désactivé explicitement dans le parsing de base (`gps: false`). Le profil offre un consentement photo GPS distinct, désactivé par défaut. Ce consentement est nécessaire avant l'appel séparé à `exifr.parse` avec uniquement les balises GPS ciblées et `gps: true`, et avant la persistance de coordonnées ou d'altitude. Refuser/ne pas avoir encore consenti produit `not_requested`, sans coordonnées ; consentir mais ne pas trouver de coordonnées donne `not_found`. Retirer le consentement efface d'abord les coordonnées GPS de chaque document enregistré puis enregistre le retrait ; une erreur de persistance est remontée et laisse le consentement actif afin de permettre une nouvelle tentative. Un consentement réactivé ne restaure pas de coordonnées précédemment effacées.

L'aperçu actuel d'une image n'intègre pas l'image ni les EXIF : il montre seulement le texte issu du flux OCR/placeholder. Les exports JSON et PDF passent par une copie expurgée où les coordonnées GPS des photos sont remplacées par un état `omitted` ; les données locales ne sont pas altérées. Aucun export binaire ou génération de vignette photo n'existe dans ce parcours ; toute future vignette/export d'image devra retirer les EXIF avant diffusion.

Les tests de cette étape couvrent la conversion des balises retenues, l'absence de GPS sans consentement, le GPS invalide, l'extraction d'un JPEG local existant, le hachage et l'expurgation des exports. Les fixtures et mesures initiales sont décrites en 15.3.e.

### Validation 15.3.e — fixtures et mesures locales (2 novembre 2026)

Les tests construisent des segments EXIF JPEG avec des valeurs connues, puis vérifient l'extraction réelle via `exifr` : date sans fuseau, date avec offset, orientation et dimensions, coordonnées/altitude GPS avec consentement, EXIF absent, date/offset/orientation malformés, PNG valide, signature d'image invalide et limites à 10 Mio/10 Mio + 1 octet. Les neuf fichiers JPG déjà présents dans `assets/` et les quinze images du corpus local sont également traités sans diagnostic. La limite photo de 10 Mio est centralisée dans `MAX_PHOTO_FILE_SIZE`, utilisée par le précontrôle d'import et par l'extracteur.

Les tests ont révélé puis corrigé deux problèmes d'intégration : l'import dynamique CommonJS d'`exifr` expose son API sous `default` en Node ; et l'analyse d'un `Blob` dans Node ne peut pas dépendre de `FileReader`. L'extracteur utilise désormais l'API du module avec fallback et transmet les octets déjà lus au parseur.

Le benchmark Node reproductible est lancé par `npm run benchmark:photo-exif`. Il réchauffe le parseur, exécute trois répétitions par cas, mesure le temps médian/moyen/p95 et observe l'écart de mémoire du processus après chaque extraction (avant collecte forcée). Résultats ponctuels sur Node 24.21.0, Windows x64 :

| Corpus mesuré | Cas / répétitions | Comportement attendu | Champs attendus extraits | Temps médian / p95 / moyen | Hausse observée RSS / heap |
|---|---:|---:|---:|---:|---:|
| 6 fixtures synthétiques (dont un fichier invalide diagnostiqué) | 6 / 18 | 6/6 | 6/6 (100 %) | 4,58 / 121,86 / 20,47 ms | 42,65 / 0,71 Mo |
| 9 JPG de démonstration existants (1 166 225 octets au total) | 9 / 27 | 9/9, zéro diagnostic | Aucun champ EXIF attendu | 2,20 / 8,18 / 3,19 ms | 1,31 / 0,40 Mo |
| 15 photos du corpus (65 237 969 octets au total) | 15 / 45 | 15/15, zéro diagnostic | Date 15/15 ; offset 5/15 ; orientation 15/15 ; dimensions/appareil 10/15 | 53,59 / 90,06 / 50,98 ms | 21,57 / 0,60 Mo |

Le corpus contient quinze JPEG en trois groupes de cinq selon les noms de fichier ; les noms et valeurs EXIF ne sont pas inclus dans les rapports. Les tailles vont de 1 154 837 à 8 552 448 octets (médiane 4 568 012) ; les quinze passent sous la limite de 10 Mio, contre zéro sous l'ancienne limite de 1 Mio. La couverture constatée est : date 15/15, orientation 15/15, offset explicite 5/15, dimensions 10/15 et make/model 10/15. Aucun GPS n'a été lu ni conservé : le consentement GPS n'était pas demandé pour ce benchmark.

La page navigateur de mesure s'ouvre en développement à `/tests/photo-exif-browser-benchmark.html`. Une exécution dans Chromium 150 (Electron / Windows x64) a traité les neuf images d'exemple et les quinze images du corpus en 72 extractions répétées : médiane globale 17,80 ms, p95 87,70 ms et moyenne 33,78 ms. Pour le corpus seul, les 45 répétitions ont une médiane de 64,20 ms, p95 de 88,60 ms et moyenne de 52,30 ms. Le heap indiqué par le navigateur a augmenté d'environ 5,11 Mo sur l'ensemble de cette session ; cette lecture approximative dépend du ramasse-miettes, elle ne constitue pas une mesure de mémoire vive par photo. Aucun diagnostic n'a été produit.

La hausse de la limite a conduit à traiter séquentiellement les fichiers sélectionnés au lieu de créer simultanément jusqu'à cinq buffers d'image/hachage. Le hachage SHA-256 réutilise maintenant les octets déjà chargés pour l'analyse EXIF, évitant une deuxième lecture/copie complète. Le corpus personnel reste local et son dossier est ignoré par Git.

Ces mesures sont indicatives sur cette machine, pas des seuils produit. Les quinze photos constituent un corpus réel limité à trois groupes d'appareils et ne couvrent pas toutes les variantes EXIF. Les tests Node et Chromium valident la couverture et le parcours Web ; les temps/mémoire sur appareils Android/iOS restent à mesurer avant tout engagement de performance mobile.

### 15.4.a — jeu d'évaluation de la recherche « Moments de vie »

Le jeu d'évaluation déterministe est dans `tests/moments-life-corpus.js` ; il ne contient ni image, ni donnée issue du corpus EXIF, ni coordonnée GPS. Il associe 12 fiches photo entièrement synthétiques à trois profils fictifs. Les associations de personnes et les libellés de lieux sont annotés comme des entrées volontaires (`personIds` et `place.source: "user"`), jamais déduits d'une image ou de coordonnées.

Les 12 requêtes de référence couvrent :

- personne seule et personne + période de prise de vue ;
- âge à partir d'une date de naissance fournie, avec intervalle anniversaire inclusif au début et exclusif au troisième anniversaire ;
- lieu saisi, événement et date locale avec fuseau inconnu ;
- différence explicite entre année de prise de vue et année d'import ;
- période saisonnière ambiguë nécessitant une précision ;
- âge impossible à calculer faute de date de naissance ;
- lieu sans résultat, et personne non associée à une photo dont la date seule correspond.

Les seuils à appliquer lors de l'implémentation du moteur (15.4.b-d) sont :

| Mesure | Cible |
|---|---:|
| Précision@5 et rappel@5 sur les requêtes à résultats annotés | ≥ 90 % chacun |
| Rang réciproque moyen (MRR) sur les résultats attendus | ≥ 0,85 |
| Exactitude des filtres déterministes de date de prise/import, âge, personne, lieu et événement, incluant les bornes calendaires | 100 % sur les cas dédiés |
| Clarification correcte quand année ou date de naissance manque | 100 % |
| Abstention correcte sur la requête sans résultat et zéro résultat non pertinent retourné | 100 % |

Précisions de calcul : précision@5 et rappel@5 sont calculées pour chaque requête à résultats parmi les cinq premiers résultats, puis moyennées sur ces requêtes ; la précision d'une requête sans résultat vaut zéro. MRR est la moyenne du réciproque du rang du premier résultat pertinent, calculée sur les seules requêtes à résultats. Les requêtes d'ambiguïté et d'absence sont évaluées séparément et ne gonflent pas artificiellement les mesures de classement. Le contrôle structurel de `tests/moments-life-corpus.test.js` valide l'intégrité et la couverture du jeu, mais n'évalue pas encore un moteur de recherche. Ces données synthétiques ne sont pas un benchmark de qualité utilisateur ; enrichir et faire annoter le jeu avec consentement avant toute affirmation produit.

### 15.4.b — interprétation locale et explicable des requêtes

`moments-life-query.js` expose `interpretMomentsLifeQuery(query, { members, places, events })`, une fonction pure sans accès réseau ni lecture de photos. Les catalogues sont fournis par l'appelant depuis les données locales : membres avec leur date de naissance facultative, lieux dont la provenance doit être une saisie utilisateur, et événements avec libellé et alias explicites. La fonction renvoie `ready` avec des filtres et une explication par filtre, ou `clarification` avec les filtres déjà certains et une raison stable ; l'application de ces filtres et le classement sont traités en 15.4.d.

- Les noms de membres sont reconnus par correspondance exacte insensible aux accents. Un nom absent n'est jamais inféré depuis une image ; plusieurs profils portant le même nom nécessitent une précision.
- Une année seule correspond à la prise de vue par défaut ; les formulations d'import explicites ciblent l'année ou la date d'import. Les dates de prise de vue utilisent la date locale enregistrée et ne convertissent pas un fuseau inconnu.
- Une formulation explicite de date de naissance produit un filtre de profil distinct. Une recherche « quand il/elle avait N ans » exige un membre résolu et une date de naissance valide, puis produit une borne d'anniversaire inclusive et une borne de fin exclusive. Pour une naissance le 29 février, l'anniversaire est ramené au 28 février les années non bissextiles.
- Les saisons sont interprétées selon les mois météorologiques (mars–mai, juin–août, septembre–novembre, décembre–février) et exigent une année ; les intervalles sont semi-ouverts.
- Les événements sont résolus uniquement via les libellés/alias passés au parseur. Les lieux utilisent seulement des libellés manuellement saisis ou explicitement demandés ; ce jalon ne lit ni n'interprète les coordonnées GPS.
- Les dates calendaires invalides, les noms/lieux/événements ambigus, les informations manquantes et les requêtes sans filtre compréhensible ne sont pas convertis en réponses approximatives : le parseur signale une clarification.

`tests/moments-life-query.test.js` compare les filtres produits aux 12 cas annotés de 15.4.a et vérifie en plus les années de naissance, les anniversaires bissextiles, les dates invalides, les ambiguïtés et la conservation des dates locales. Cette validation porte sur l'interprétation des requêtes, pas sur la qualité de classement ni sur l'interface ; elles sont traitées dans les étapes suivantes.

### 15.4.c — associations manuelles photo, membres et événements

La fiche membre existante peut maintenant conserver `birthDate` au format `AAAA-MM-JJ`, facultatif (`null` si non renseigné). Le formulaire applique une borne maximale au jour courant et `family-members.js` valide réellement les jours/mois, y compris les années bissextiles, pour les écritures venant d'autres appels. Aucun membre existant n'est forcé de fournir cette donnée.

Dans « Vos données », les photos JPEG/PNG comportent une action « Associer ». L'utilisateur coche un ou plusieurs membres déjà enregistrés, ajoute des libellés d'événements (un par ligne) et peut saisir un lieu. La donnée persistée sur le document est distincte des métadonnées EXIF ; le lieu est optionnel et son origine doit être explicitement `user` :

```js
photoAnnotations: {
  schemaVersion: 1,
  personIds: ["id-membre"],
  eventTags: ["anniversaire"],
  placeLabel: "Plage des Pins",
  placeSource: "user",
  source: "user"
}
```

`photo-annotations.js` valide la version, les références aux membres existants, les types, longueurs et doublons ; la source est normalisée en `user`. Modifier ou vider les associations est une action explicite du formulaire. Supprimer un membre retire ce membre de ses photos annotées et conserve les autres membres et événements. Les données restent dans les magasins IndexedDB `family` et `documents` existants, sans nouvelle migration de base de données.

*L'exemple de structure ci-dessus inclut le lieu manuel ajouté pour la recherche 15.4.d ; les libellés de lieux ne proviennent jamais du GPS.*

Aucun traitement d'image, détection de visage ou identification automatique n'est introduit. L'interface précise que la sélection est manuelle. Les dates de naissance et associations sont conservées localement avec les autres données d'application ; aucun média ni annotation n'est transmis à un service externe. Les tests `tests/family-members.test.js` et `tests/photo-annotations.test.js` valident les dates et les règles d'association ; ils complètent les tests du parseur, mais ne constituent pas encore un test navigateur de l'interface.

### 15.4.d — recherche et classement déterministes par métadonnées

`moments-life-search.js` applique les filtres de `interpretMomentsLifeQuery` à un ensemble de photos, membres et annotations locales. Tous les filtres sont combinés en AND : membre associé volontairement, dates locales de prise de vue, dates d'import, intervalle d'âge issu des anniversaires, événement et lieu saisi. Une métadonnée absente ou invalide ne satisfait pas un filtre de date. Les dates EXIF sont utilisées dans leur forme locale, sans conversion d'un offset nul/inconnu ; la date d'import n'est utilisée que si une valeur ISO persistée existe. Les nouveaux imports d'images enregistrent une date `importedAt`; les anciens fichiers sans cette donnée ne reçoivent pas de date rétroactive inventée.

Un résultat doit satisfaire les critères interprétés ; les coordonnées GPS, noms de fichiers, contenu OCR, aperçu texte, embeddings et inférences faciales ne servent pas à récupérer ou classer une photo. Les photos correspondantes sont triées par date de prise de vue décroissante, puis date d'import décroissante et identifiant stable ; les dates de prise de vue absentes restent après celles disponibles. L'interface « Moments de vie » affiche un rang, les critères retenus, les dates locales/provenances disponibles et un accès à l'aperçu du document. Les requêtes ambiguës demandent une précision ; une requête interprétable sans correspondance s'abstient et annonce l'absence de résultat.

`tests/moments-life-search.test.js` contrôle les filtres attendus sur les 12 requêtes de référence, l'exclusion des coordonnées GPS, le tri stable et les métriques calculées sur les résultats synthétiques :

| Mesure | Résultat sur le corpus synthétique | Cible |
|---|---:|---:|
| Précision@5 (moyenne par requête) | 100 % | ≥ 90 % |
| Rappel@5 (moyenne par requête) | 98,15 % | ≥ 90 % |
| MRR | 100 % | ≥ 0,85 |
| Clarification correcte | 100 % | 100 % |
| Abstention sur absence de résultat | 100 % | 100 % |

Le rappel n'est pas 100 % parce qu'une requête annotée a six photos pertinentes alors que la mesure @5 n'en peut retourner que cinq. Ces résultats vérifient l'implémentation contre un jeu synthétique défini en 15.4.a et ne prédisent pas la précision sur une photothèque réelle. Le classement actuel est chronologique, non appris, et ne prétend pas interpréter les synonymes d'événements au-delà des alias fournis. Aucun modèle/embedding ni dépendance n'a été ajouté. Le temps/mémoire sur appareils Android/iOS et le stockage d'une photothèque à l'échelle cible ne sont pas encore mesurés ; ces contrôles restent requis avant d'envisager une approche sémantique.

### 15.4.e — provenance, confiance et corrections utilisateur

Chaque résultat affiche les filtres exacts retenus et un contexte lisible : date locale de prise de vue, source de cette date, date d'import si connue, membres associés, événements et lieu saisis. Les dates absentes restent explicitement absentes. Une provenance EXIF ancienne, un fuseau inconnu et les associations sans origine vérifiable sont signalés ; les coordonnées GPS ne participent toujours pas à la recherche.

Le niveau affiché (« élevé », « modéré » ou « à vérifier ») est une appréciation déterministe de la provenance des champs qui ont permis la correspondance, pas une probabilité ni un score de pertinence. Les associations manuelles reconnues comme saisies par l'utilisateur et les dates EXIF avec fuseau explicite sont de confiance élevée ; un fuseau inconnu ou une date issue de données anciennes réduit le niveau. Les filtres restent exacts et les données de faible provenance ne sont pas utilisées pour élargir les résultats.

Depuis un résultat, l'utilisateur peut corriger membre, événement, lieu et date locale de prise de vue. Une date corrigée est stockée séparément de la valeur EXIF originale, porte une provenance utilisateur et n'impute aucun fuseau. Effacer le champ restaure l'utilisation de la date d'origine. En absence de résultat, un accès direct à l'inventaire des photos permet de compléter ou corriger leurs annotations ; la recherche en cours est rejouée après l'enregistrement.

`tests/moments-life-search.test.js` couvre les cas sans résultat, les niveaux de confiance selon la provenance, la correction d'une association/date et le rerun local. `tests/photo-annotations.test.js` vérifie la validation calendaire et la normalisation des dates corrigées. Le test bloque `fetch` pendant les recherches : l'interpréteur et le moteur ne font aucun appel réseau. Les médias, GPS et requêtes demeurent locaux. Ces tests vérifient des règles de code synthétiques, pas la qualité de données d'une bibliothèque réelle.

## Hypothèses d'offres retenues pour la suite

Les retours de l'utilisateur sont retenus comme hypothèses produit de travail, à réexaminer ultérieurement et non comme tarifs ou engagements définitivement validés :

- **Essentiel (gratuit)** : import manuel et indexation locale, recherche documentaire réellement utile, fiches et premières échéances, alertes consultables à l'ouverture.
- **Sérénité** : rappels programmés, synchronisation et sauvegarde des données structurées, partage familial des échéances, historique et suivi des garanties/contrats/entretiens, alertes personnalisées.
- **4,99 €/mois** est un prix de test proposé, pas un tarif fixé. Sa viabilité dépendra notamment des coûts de synchronisation, sauvegarde, notifications, assistance et sécurité.

La différenciation doit porter sur la continuité du service et l'aide à agir, pas sur la dégradation artificielle de la recherche gratuite ni sur une promesse d'économies non démontrées.

## Ordre recommandé

1. Fiabiliser les alertes et leur cycle de vie, avec des tests sur dates et preuves.
2. Mesurer puis améliorer la recherche documentaire sans sacrifier sa traçabilité ni son utilité gratuite.
3. Après l'accès photo, l'extraction locale et la validation initiale par corpus (15.3.a-e), concevoir la recherche « Moments de vie » et la galerie.
4. Chiffrer les coûts et préciser les droits/abonnements après avoir établi les besoins techniques des fonctions qui justifient l'offre.

## Sources examinées

- `search-utils.js`, `search-utils.test.js`, `app.js`
- `document-parser.js`, `alert-engine.js`, `state.js`, `tests/phase7.test.js`
- `local-files.js`, `tests/local-files.test.js`, `index.html`, `package.json`
- `docs/architecture/semantic-search.md`, `docs/architecture/proactive-assistant.md`

## Compléments de la phase 15.1

### Préférences et cycle de rappel

Les échéances détectées à partir des documents peuvent être corrigées dans l'interface. Une correction est enregistrée comme confirmée manuellement avec une nouvelle preuve, puis repasse par la synchronisation habituelle ; une nouvelle date réinitialise l'état et le marqueur de notification. Les préférences sont stockées localement dans les paramètres du foyer : catégories de notification désactivées, plafond de 1/3/5 notifications par jour et plage silencieuse. Les alertes peuvent être reportées d'un ou sept jours et réactivées avant la date de reprise.

Le navigateur est interrogé toutes les quinze minutes tant que la page reste ouverte. Cette fréquence ne transforme pas le minuteur de page en service d'arrière-plan fiable : les navigateurs peuvent suspendre ou retarder les tâches des onglets inactifs.

### Faisabilité des notifications par plateforme

| Parcours | Capacités et contraintes pertinentes | État dans ce dépôt |
|---|---|---|
| Web, page ouverte | La permission doit découler d'une action utilisateur. `Notification()` crée une notification non persistante liée à la page ; MDN précise que ce constructeur échoue sur la plupart des navigateurs mobiles. Le minuteur JavaScript cesse d'être fiable lorsque la page est suspendue ou fermée. | Implémenté comme rappel au premier plan avec contenu générique ; aucune garantie d'exécution en arrière-plan. |
| Web Push / PWA | Une notification persistante demande un service worker. Le Push API dépend d'un abonnement du navigateur et d'un émetteur côté serveur ; cela implique gestion des clés et endpoints, sécurité, consentement, désabonnement et coûts d'exploitation. Sur iOS/iPadOS, Web Push s'applique aux web apps ajoutées à l'écran d'accueil depuis iOS/iPadOS 16.4, avec demande déclenchée par l'utilisateur. | Aucun service worker, abonnement push, serveur d'envoi ou manifeste PWA dédié n'est raccordé à ce parcours. |
| iOS natif | UserNotifications permet de programmer localement des rappels conservés par le système sans réveiller l'application à chaque échéance ; l'autorisation et la présentation restent contrôlées par l'utilisateur et le système. | Aucun projet iOS ni pont de notifications locales n'est présent ; une validation sur appareil et une étude du cycle de vie/configuration sont nécessaires avant engagement. |
| Android natif / Capacitor | Le plugin Capacitor Local Notifications programme des notifications sur l'appareil sans service push. Android 13+ demande l'autorisation POST_NOTIFICATIONS ; depuis Android 12, les alarmes exactes ont des conditions et réglages système spécifiques. Doze et l'espace privé peuvent aussi retarder ou masquer certains rappels. | Projet Android présent, mais `@capacitor/local-notifications` n'est pas installé. Il ne faut donc pas présenter le scheduler navigateur comme une notification native planifiée. |

Sources de plateforme consultées :

- [MDN — Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Apple — Scheduling a notification locally from your app](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app)
- [Capacitor — Local Notifications API](https://capacitorjs.com/docs/apis/local-notifications)

Décision pour 15.1 : conserver le comportement Web explicite et local à l'application ouverte. Ne pas ajouter de backend push ou de dépendance native avant une décision produit, une revue de confidentialité/coûts, et des tests réels sur appareils cibles. Les notifications locales natives et le push serveur sont deux pistes distinctes.

### Mesure sur corpus fictif annoté

Le test automatisé `tests/alert-quality.test.js` contient huit cas synthétiques annotés pour les quatre catégories : quatre échéances attendues, une échéance éloignée, une date sans preuve, une date invalide et un type non pris en charge. Avec la date de référence fixée au 1er janvier 2027, la mesure de base est :

| Mesure sur ces huit cas | Résultat |
|---|---:|
| Vrais positifs / alertes attendues | 4 / 4 |
| Faux positifs | 0 |
| Échéances attendues manquées | 0 |
| Précision (TP / alertes générées) | 100 % |
| Rappel (TP / échéances attendues) | 100 % |
| Alertes générées avec preuve source | 4 / 4 (100 %) |
| Doublons d'identifiant | 0 |
| Répétitions au second passage après enregistrement de l'envoi | 0 |

Ce petit corpus est une régression déterministe, construite à partir de cas fictifs ; il ne représente ni la diversité des documents réels ni les performances en production. Les seuils et libellés de preuve devront être réévalués sur un corpus plus large et annoté indépendamment avant toute promesse de fiabilité ou d'économies.

## Recherche documentaire — implémentation et première évaluation (15.2)

Le moteur principal est désormais `rankDocuments` dans `search-utils.js`. Il reste entièrement local et déterministe :

- Les termes significatifs de la requête doivent tous être retrouvés, avec tolérance aux fautes déjà prévue et un petit dictionnaire de synonymes français modifiable et auditable.
- Les noms, types, fournisseurs, catégories, mots-clés et texte sont pris en compte ; les métadonnées ont un poids supérieur au corps du texte, et le type du document sert de signal selon l'intention factuelle.
- Les questions génériques sans sujet identifiable s'abstiennent. Les réponses factuelles sont extraites du contenu, pas du résumé. Une date générique n'est pas assimilée à une échéance.
- Les résultats exposent la provenance, un extrait choisi en fonction de l'intention et un niveau de correspondance. Les faits absents et les réponses contradictoires sont explicitement signalés.
- Aucun embedding, service externe, modèle génératif ou nouvelle dépendance n'a été ajouté. Le dictionnaire de synonymes est un rapprochement lexical déterministe, pas une compréhension sémantique générale.
- Les questions et contenus affichés dans l'assistant sont insérés comme texte, sans interprétation HTML.

### Corpus et comparaison

`tests/search-corpus.js` combine trois fichiers d'exemple existants et quatre documents synthétiques, soit sept documents au total. Neuf requêtes couvrent montant, garantie/date, entretien/fréquence, synonymes, faute, documents contradictoires, fait absent et sujet sans correspondance. Les faits attendus sont des lignes précises ; les demandes ambiguës attendent une abstention.

Sur Node.js/Windows, une exécution de `evaluateSearchCorpus` a donné les résultats suivants. La précision@3 est calculée de façon agrégée sur les documents retournés ; les temps sont une mesure ponctuelle et varient avec la machine et la charge.

| Approche locale | Précision@3 | Rappel@3 | MRR | Exactitude factuelle | Abstention correcte | Réponses non étayées | Couverture de source | Temps moyen/requête |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Lexicale (sans synonymes) | 85,7 % | 75 % | 0,556 | 80 % | 100 % | 1 | 100 % | env. 24 ms |
| Métadonnées pondérées (sans synonymes) | 85,7 % | 75 % | 0,556 | 80 % | 100 % | 1 | 100 % | env. 2,5 ms |
| Hybride déterministe (métadonnées + synonymes) | 88,9 % | 100 % | 0,778 | 100 % | 100 % | 0 | 100 % | env. 1,7 ms |

Cette évaluation distingue une recherche lexicale améliorée d'une vraie recherche sémantique : aucune représentation vectorielle n'a été comparée. Le résultat favorise le petit corpus choisi et sert seulement de seuil de non-régression. Avant d'utiliser ces valeurs comme indicateur produit, il faut élargir le corpus, faire annoter les requêtes et documents indépendamment, et mesurer les performances sur appareils cibles. La recherche ne comporte pas de quotas ou de capacités dégradées liés à l'offre.
