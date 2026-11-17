# Contrat versionné des faits photo

## Objectif et périmètre

Le contrat P1 unifie les faits nécessaires à la recherche photo sans remplacer les formats historiques (`photoMetadata` et `photoAnnotations`). Il est défini dans [`photo-facts.js`](../../photo-facts.js), versionné indépendamment et validé par des tests fictifs. Depuis la tranche locale P2, `photoFacts` est persisté de façon additive dans chaque document photo ; les formats historiques restent la source de reconstruction et ne sont pas supprimés.

`photoFactSetFromDocument` reste un adaptateur pur. La persistance et la réconciliation sont orchestrées par `state.js` après vérification du consentement GPS. L'index commun, la recherche de moments de vie et la timeline lisent les faits persistés, sans substituer la date d'import à la date de prise de vue. Avec le consentement dédié, les coordonnées sont indexées et une recherche explicite par paire latitude/longitude les compare exactement ; aucun rayon, rapprochement géographique, géocodage inverse ou recherche par adresse n'est raccordé.

## Forme du contrat

Chaque fiche porte une version, un document parent, une empreinte exacte facultative et les copies connues :

```js
{
  schemaVersion: 1,
  documentId: "photo-locale-123",
  contentHash: "sha256:<64 caractères hexadécimaux>",
  sourceCopies: [{
    providerId: "dropbox",
    accountRef: "<empreinte SHA-256 opaque ou null>",
    itemId: "identifiant-stable-de-la-copie",
    path: "/Photos/Vacances",
    lastCheckedAt: "2026-11-15T10:19:00.000Z"
  }],
  dates: {
    fileCreatedAt: null,
    fileModifiedAt: "2026-11-14T09:00:00.000Z",
    importedAt: "2026-11-15T10:20:30.000Z",
    analyzedAt: null,
    lastSourceCheckAt: "2026-11-15T10:19:00.000Z"
  },
  facts: []
}
```

Les dates de fichier, de prise de vue, d'import, d'analyse et de dernier contrôle restent distinctes. Une date seule reste une date seule ; une date EXIF sans fuseau conserve `offsetMinutes: null`. `DateTimeOriginal` utilise uniquement `OffsetTimeOriginal` et le repli `CreateDate` utilise uniquement `OffsetTimeDigitized` : le fuseau d'une autre date n'est jamais réutilisé. La date Graph OneDrive `photo.takenDateTime` conserve son heure locale et son décalage explicite, avec provenance `provider`. Aucune date d'import ou de modification n'est substituée à une date de prise de vue.

Chaque fait contient son type, sa valeur typée, sa provenance, son statut, son indice justificatif, sa date d'analyse éventuelle et ses dépendances. Les faits pris en charge sont `captureDate`, `location`, `place`, `person`, `event`, `caption` et `keyword`. Une légende et un mot-clé sont conservés comme texte borné avec leur source XMP/IPTC ; ils ne sont pas convertis en événement, lieu ou identité.

Pour les fichiers locaux JPEG/PNG, l'extraction retient uniquement XMP `dc:description`/`dc:subject` et IPTC `Caption`/`Keywords`. XMP est lu en mode XML brut puis ces seuls champs DC sont sélectionnés ; tous les autres champs XMP, notamment les coordonnées, sont ignorés. IPTC est limité par la sélection de tags du parseur. Google Drive demande pour les JPEG/PNG choisis `imageMediaMetadata.time`, les dimensions et l'appareil ; la date EXIF fournisseur reste sans fuseau. OneDrive demande le facet Graph `photo` et retient, s'ils sont présents, `takenDateTime`, `cameraMake` et `cameraModel` avec provenance fournisseur. Avec consentement GPS actif, Drive demande `imageMediaMetadata.location`, OneDrive relit séparément `id,location` et Dropbox consulte `media_info.metadata.location` ; seules les coordonnées valides sont conservées, sans altitude fournisseur. Les images cloud restent en métadonnées seules : aucun octet image n'est téléchargé. Ces parcours sont validés par réponses synthétiques ; leur disponibilité réelle reste à vérifier. Les albums, sidecars et adaptateurs des autres fournisseurs restent hors de cette tranche.

Le retrait du consentement retire les coordonnées et leurs dérivés des copies et de l'index dans l'onglet actif ; les mutations photo y sont sérialisées. La coordination entre plusieurs onglets ouverts n'est pas garantie : fermer les autres onglets avant de modifier ce consentement. Autoriser le GPS ne déclenche pas la relecture des photos existantes ; les possibilités et pertes éventuelles lors d'une nouvelle lecture sont détaillées dans les études des connecteurs.

## Comparaison P2 des jeux de géolocalisation inverse

**Évaluation documentaire : 16 novembre 2026. Décision : ne pas ajouter de conversion automatique pour l'instant.** La recherche GPS par coordonnées exactes reste disponible sous consentement ; aucune donnée de localisation n'est envoyée à un service distant. Un nom de localité présenté comme réponse certaine serait trompeur sans géométrie adaptée ou règle explicite de proximité.

| Option | Licence, taille et couverture observées | Limite pour Famili-IA | Conclusion |
|---|---|---|---|
| Coordonnées seules | Aucun paquet ni licence de tiers à intégrer ; recherche exacte déjà raccordée. | Peu lisible pour une personne qui ne reconnaît pas elle-même les coordonnées ; ne fournit ni pays ni lieu. | Référence actuelle : aucune nouvelle approximation ni collecte. |
| [GeoNames](https://www.geonames.org/export/) | Les extraits sont gratuits, autorisent l'usage commercial et sont sous CC BY 4.0 avec attribution. L'export est mis à jour quotidiennement ; `cities500.zip` contient environ 185 000 lieux. L'extrait pays `FR.zip` faisait 7,0 Mo dans l'index officiel du 16 novembre 2026. | Les lieux sont des points nommés, pas des adresses ni des polygones de ville. Trouver le point le plus proche ne prouve pas qu'une photo a été prise dans cette ville ; il faudrait une distance maximale explicitement choisie, un résultat présenté comme « près de », une attribution et une politique de mise à jour du paquet. | Candidat le plus pertinent pour un futur libellé de localité approximatif, mais non retenu ni intégré. |
| [Natural Earth — lieux habités](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) | Données public domain. Le paquet 10m complet annoncé est de 2,68 Mo (version 5.1.2) ; la version simple est de 636,84 Ko. | Points pour les capitales, villes importantes et une sélection de petites villes ; couverture trop clairsemée pour attribuer un nom fiable à toute coordonnée. | Adapté à des libellés de carte à petite échelle, pas à une recherche inverse générale de photos. |
| [Natural Earth — divisions administratives de niveau 1](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/) | Données public domain ; le paquet annoncé couvre plus de 4 500 divisions et fait 14,22 Mo (version 5.1.1). | Couverture inégale, données signalées comme difficiles à maintenir à jour ; les unités ne correspondent pas partout à la même granularité. Cela n'assigne pas une localité ni une adresse. | Pourrait aider à afficher une région large, après contrôle de la géométrie et du périmètre ; pas retenu pour cette tranche. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Données détaillées sous ODbL 1.0 ; l'attribution est requise et une base adaptée/dérivée distribuée est soumise aux conditions share-alike de l'ODbL. | Extraction, réduction, indexation hors ligne, volume, attribution dans l'application et obligations de redistribution demandent une évaluation dédiée. | Non retenu sans analyse juridique et mesure du paquet, de l'index et du coût de mise à jour. |

Cette comparaison n'est pas une validation des données sur un corpus réel. Avant tout raccordement, décider explicitement du périmètre géographique téléchargeable, de la taille compressée et décompressée, de la fraîcheur, des langues et attributions, de la distance maximale et de la formulation incertaine (« près de »). Tout résultat local devra rester une suggestion dérivée du fait GPS, être supprimé si le consentement est retiré et ne jamais remplacer les coordonnées ou une valeur saisie par la personne.

## Première baseline P3 : indices textuels de mariage

`findMetadataEventCandidates` dans [`photo-event-metadata.js`](../../photo-event-metadata.js) est une première baseline déterministe, limitée à l'événement « mariage ». Elle examine uniquement les faits photo `caption`/`keyword` déjà présents, le nom de fichier, les noms de dossiers disponibles dans `sourceDir` et les chemins des copies fournisseur. Elle ne lit aucun octet d'image et ne consulte pas de GPS.

Un mot-clé entier correspondant à `mariage`, `mariages`, `noces`, `wedding` ou `weddings` est rendu comme `explicit-label`; une occurrence dans une légende, un nom ou un chemin est un `lexical-match`. Dans les deux cas, le résultat reste un **candidat**, conserve la source, le champ, la provenance fournisseur éventuelle et le fait texte d'origine ; il ne signifie pas « mon mariage » et n'identifie aucune personne. Les faits textuels rejetés sont ignorés.

Cette fonction ne modifie ni ne persiste les faits, n'alimente pas encore la recherche de suggestions et ne les affiche pas dans l'interface : ces raccordements relèvent de 15.5ter.3.c. Les connecteurs présents n'exposent pas de titres d'albums. Les tests sont synthétiques ; aucune baseline de précision sur un corpus réel n'est disponible. Le test doit rester local sur les photos de l'utilisateur si ce corpus est évalué.

### Mesure locale de la baseline

Depuis la racine du projet, exécuter :

```powershell
node scripts\evaluate-photo-events.js tests\fixtures\photo-event-evaluation.json
```

Cette commande lit uniquement le JSON indiqué et affiche des statistiques agrégées dans le terminal. Elle ne lit pas les photos, n'effectue aucune requête réseau et ne crée aucun fichier. Le corpus fourni est entièrement fictif : ses résultats ne mesurent pas la qualité sur une photothèque réelle.

Pour une évaluation indépendante, préparer **hors dépôt** un JSON sur son propre appareil, puis passer son chemin à la même commande. Ne pas partager ni committer ce fichier : les noms, chemins et descriptions peuvent eux-mêmes être personnels. Il doit être constitué avant de consulter les résultats, avec des photos pertinentes et non pertinentes, y compris celles sans indice ; une sélection limitée aux photos déjà détectées fausserait le rappel. L'annotation doit être décidée par une personne autorisée, à partir de la photo et de son contexte, sans transmettre les images.

Le format est une liste de cas, comme dans le fichier fictif. Chaque cas comporte :

- `document` : un objet photo avec un `id` unique et `type: "Image"`, son nom et, si disponibles, `sourceDir` et les `photoFacts.facts` de légendes/mots-clés ou `photoFacts.sourceCopies` avec leurs chemins. Reproduire les seuls indices effectivement disponibles pour la baseline, sans ajouter les annotations de référence aux indices. Le script ne construit pas automatiquement le corpus depuis l'application.
- `expectedWedding` : `true` si la photo concerne un mariage, `false` sinon, `null` si la référence est incertaine. Cela ne signifie jamais « mon mariage » et ne déduit aucune identité.

Chaque photo compte une fois, même si plusieurs indices correspondent. Le résultat `all` regroupe toutes les suggestions ; `explicitLabel` et `lexicalMatch` les mesurent séparément et peuvent se chevaucher pour une même photo. Les annotations `null` sont exclues des calculs et comptées à part. `precision` vaut vrais positifs / suggestions, `recall` vaut vrais positifs / photos positives annotées ; une division impossible donne `null`. Les cas sans suggestion sont des abstentions, pas une preuve d'absence de mariage. Les vrais négatifs et faux négatifs décrivent uniquement leur comparaison aux annotations.

Le seuil cible de précision de 95 % concerne des étiquettes exploitées automatiquement sur un jeu indépendant ; ce script affiche la mesure sans déclarer une validation ou activer les suggestions. Il faut également examiner le rappel, les faux positifs, la diversité et la taille du corpus avant toute décision. Aucune mesure sur corpus réel ni validation fournisseur/appareil ne découle du test fictif.

## Faisabilité initiale P3.b : classification visuelle locale

**Revue documentaire : 16 novembre 2026. Décision : aucun poids ni moteur ajouté.** La baseline de 15.5ter.3.a est une correspondance déterministe sur texte, alors qu'un modèle image-texte compare une image à des descriptions candidates. Ses scores sont des similarités, pas des probabilités calibrées ni une preuve qu'il s'agit d'un événement personnel.

| Candidat | Licence du code, des poids et des données | Taille observée | Compatibilité et pertinence |
|---|---|---|---|
| [Apple MobileCLIP2-S0](https://github.com/apple-aiml-research/ml-mobileclip) | Code sous MIT, mais poids sous la licence Apple ML Research Model, réservée à la recherche scientifique non commerciale et excluant explicitement le développement ou l'usage dans un produit/service commercial. Les données d'accompagnement sont sous CC BY-NC-ND 4.0. La licence des poids, distincte de celle du code, est bloquante pour Famili-IA. | Le checkpoint officiel `mobileclip2_s0.pt` fait 300 Mo ; MobileCLIP2-S0 annonce 11,4 M paramètres image et 63,4 M texte. | L'architecture est conçue pour appareils mobiles, mais les mesures officielles de latence citées portent sur iPhone 12 Pro, pas sur WebView/Android ni la Galaxy Tab A8. Malgré la taille/rapidité attractive, le modèle n'est pas utilisable dans le produit sous cette licence. |
| [OpenAI CLIP ViT-B/32](https://huggingface.co/openai/clip-vit-base-patch32) | Le dépôt du code est sous MIT ; la fiche du modèle avertit que tout usage déployé est hors périmètre et recommande de limiter les usages de recherche à l'anglais et à une taxonomie testée en domaine. Ce n'est pas un feu vert de déploiement pour l'application. | Le fichier de poids indiqué fait 605 Mo (plus les fichiers de tokenizer/processeur). | Trop lourd pour une activation mobile discrète ; la restriction linguistique est en outre inadaptée à l'interface française. Rejeté pour cette tranche. |
| [Google SigLIP 2 Base](https://huggingface.co/google/siglip2-base-patch16-224) | La fiche Hub indique Apache 2.0 pour le modèle ; vérifier séparément les droits et notices des fichiers transformés avant redistribution. | 0,4 milliard de paramètres ; `model.safetensors` fait 1,5 Go sur le dépôt consulté. | Prend en charge la classification zéro-shot et la recherche image-texte, mais cette taille ne convient pas à l'installation ni à l'inférence sur notre cible mobile. |

### Exécution locale et distribution

ONNX Runtime Web indique le backend WASM CPU pour les navigateurs de sa matrice et WebGPU pour Chrome/Edge Android ; WebGPU n'y est pas listé sur iOS. Transformers.js documente aussi WebGPU comme option dont la disponibilité varie selon navigateur et appareil. Le mode « sans réseau après installation » est techniquement possible si le modèle, le tokenizer et les fichiers WASM sont hébergés dans l'application ou son stockage local, et si les modèles distants/CDN sont désactivés ; le chargement depuis un dépôt en ligne ne serait pas une exécution hors ligne au premier lancement.

Ces documents établissent une faisabilité générale, pas un fonctionnement validé dans Famili-IA. Aucun convertisseur ONNX tiers, binaire de poids, coût mémoire, temps par photo, chauffe ou autonomie n'a été testé dans le navigateur ou sur Android. Le navigateur doit également disposer d'un fallback CPU si WebGPU est absent.

### Décision et critères restant ouverts

La revue écarte les trois candidats ci-dessus pour cette version, mais **ne clôt pas 15.5ter.3.b** : aucune comparaison de précision sur des photos n'a été faite. Avant toute intégration, il faut identifier un modèle dont la licence des poids autorise le produit, vérifier redistribution et licence des données, puis comparer sur un petit corpus contrôlé par l'utilisateur les propositions de l'analyse textuelle et celles du modèle, avec rappel/précision et abstention. L'évaluation doit rester locale, sans visage ni identité, et mesurer taille téléchargée, mémoire, durée par photo, fonctionnement après redémarrage/hors ligne et repli CPU sur les appareils cibles. En l'absence de candidat conforme et assez léger, le bon choix demeure la baseline textuelle seule.

```js
{
  id: "suggestion-evenement-1",
  kind: "event",
  value: { eventId: null, label: "mariage" },
  status: "suggested",
  provenance: { kind: "model", field: "eventClassifier", providerId: null, accountRef: null, itemId: null },
  evidence: {
    kind: "model-output",
    method: "local-event-classifier",
    modelVersion: "1.2.0",
    calibratedScore: 0.87
  },
  analyzedAt: "2026-11-15T10:00:00Z",
  review: null,
  dependsOnFactIds: []
}
```

Un résultat de modèle n'accepte aucun extrait textuel : seule la méthode, la version et une confiance calibrée entre 0 et 1 peuvent le justifier. Les annotations explicites de la personne utilisent `user` et `confirmed`; une correction crée un fait distinct au lieu d'écraser l'extraction. Les suggestions restent séparées des faits confirmés. Une correction ou un rejet conserve une trace de revue utilisateur, sans date inventée si l'ancien format n'en avait pas.

## Identité, conflits et doublons

- Une copie est identifiée par `(providerId, accountRef, itemId)`. `accountRef` est une empreinte opaque SHA-256 ; une adresse de compte, un jeton et une URL temporaire sont refusés. Un chemin fournisseur connu peut être conservé, mais jamais une URL de téléchargement.
- `mergePhotoFactSets` n'écrase pas un fait de même ID avec une valeur différente : il exige un nouvel ID, conserve les faits de l'utilisateur et laisse les faits automatiques distincts. `resolvePhotoFact` donne priorité à une valeur confirmée par l'utilisateur ; à défaut, il ne choisit une valeur extraite/suggérée que si elle n'a pas de contradicteur. Même lorsqu'une correction confirmée est prioritaire, `findPhotoFactConflicts` expose les valeurs incompatibles de date, lieu et coordonnées.
- Les événements et personnes sont multivalués ; ils ne sont pas déclarés contradictoires simplement parce qu'ils diffèrent. Aucune identité n'est propagée entre comptes ou foyers.
- `contentHash` est un SHA-256 des octets exacts. `findExactPhotoFactDuplicates` ne présente des candidats qu'en cas d'empreinte identique ; il ne fusionne ni documents ni copies. Nom, date, chemin ou ressemblance ne suffisent pas à établir un doublon.

## Faits dérivés et cycle de vie

`dependsOnFactIds` référence les faits sources et le validateur rejette les références manquantes ainsi que les cycles. `getDependentPhotoFactIds` identifie les dépendances transitives (par exemple GPS → lieu dérivé → regroupement) lors d'un retrait de source.

Règles de cycle de vie appliquées aux photos locales et aux métadonnées GPS Dropbox :

1. N'enregistrer une localisation qu'après vérification du consentement dédié. Son retrait efface le GPS historique et les faits qui en dépendent ; un lieu saisi directement par la personne reste distinct.
2. À l'export, masquer les coordonnées et les valeurs dérivées uniquement du GPS. Les autres annotations restent distinctes.
3. La suppression d'une fiche Famili-IA ne supprime pas l'original chez le fournisseur sans action distincte et autorisée.
4. Les faits dérivés ne survivent pas à la suppression de leur source. Les URL temporaires et jetons n'appartiennent jamais à ce contrat.

La règle de consentement et l'export sont raccordés aux données photo locales ; la recherche de coordonnées n'est disponible que lorsque la paire exacte est présente dans l'index. Les comportements des adaptateurs cloud, des fichiers annexes et des nouveaux formats restent hors de cette tranche.

## Compatibilité et stratégie de migration

`photoFactSetFromDocument` est une conversion pure et rejouable des formes `photoMetadata`/`photoAnnotations` existantes. Les schémas `photoMetadata` et `photoFacts` sont actuellement en version 2 ; leurs formes v1 sont acceptées et normalisées sans modification IndexedDB. Des identifiants locaux déterministes rendent la conversion répétable ; ils ne sont pas des empreintes de contenu. Les faits existants sont fusionnés sans écrasement ; les faits d'annotations historiques sont remplacés à partir de leur source de vérité lors d'une modification. Les métadonnées GPS sont exclues par défaut.

La migration actuelle est additive et rejouable : au chargement, les fiches photo sans faits sont reconstruites depuis les champs historiques ; les faits incohérents sont journalisés et reconstruits lorsque les sources le permettent. Les anciennes fiches v1 de métadonnées et de faits sont normalisées vers v2 ; l'index est recalculé après réconciliation. Aucun magasin ni version IndexedDB supplémentaire n'est requis. Les anciens champs sont conservés pour retour arrière ; aucun changement au chiffrement n'est apporté.

## Vérification

Les tests utilisent uniquement des identifiants, dates, coordonnées et fichiers synthétiques. Ils couvrent la conversion, la migration additive, l'extraction locale de légendes/mots-clés XMP/IPTC, leur recherche après rechargement, les métadonnées et le GPS sous consentement de Drive, OneDrive et Dropbox, la révocation dans le navigateur, les conflits, les dépendances GPS et l'export expurgé. Aucun compte réel, photo personnelle, service de géocodage ou modèle de vision n'est utilisé. Les albums fournisseur, sidecars, autres adaptateurs cloud et géolocalisation inverse ne sont pas couverts par cette tranche.
