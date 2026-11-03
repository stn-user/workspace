# Conception Galerie et Journal de bord — Phase 15.5.a

## Objectif et périmètre

Concevoir un espace photo local permettant de parcourir visuellement les images et de les relire dans leur contexte chronologique, sans confondre date de prise de vue et date d'import. La conception initiale 15.5.a couvre les vues, leurs états vides/chargement/erreur, les filtres par personne/date/lieu et le chemin d'une photo vers son fichier d'origine. Les décisions et réalisations de 15.5.b sont consignées dans la section de mise en œuvre plus bas.

## État de départ constaté

- La vue « Vos données » (`index.html`) contient l'inventaire des fichiers et un panneau « Moments de vie » pour les recherches en langage naturel ; elle ne propose pas encore de Galerie ni de Journal de bord.
- `moments-life-search.js` filtre localement par membre associé, date de prise de vue/import, lieu saisi et événement. Les résultats sont triés par date de prise de vue, puis d'import, et exposent des avertissements de provenance.
- Les membres associés, événements, lieux saisis et dates corrigées sont des annotations explicites de l'utilisateur. La date EXIF conserve sa provenance et peut avoir un fuseau inconnu. Le consentement GPS est distinct ; les coordonnées ne doivent pas devenir un filtre ou un libellé de lieu implicite.
- L'import actuel persiste les métadonnées et le texte extrait dans le document, mais pas les octets de l'image. `openSource()` affiche le contenu textuel dans une boîte de dialogue et ne peut pas restituer l'image originale. Le parcours vers la source réelle est donc un point à résoudre avant son implémentation, pas une capacité déjà acquise.

## Architecture d'information proposée

Conserver « Vos données » comme point d'entrée de gestion et y ajouter un accès explicite **Photos** / **Ouvrir la photothèque**. Ne pas ajouter un onglet principal à la navigation pour cette étape. La photothèque devient un espace dédié intitulé **Photos**, avec deux vues accessibles par un sélecteur d'affichage :

1. **Galerie** — grille de vignettes, parcours visuel par défaut.
2. **Journal de bord** — les mêmes photos groupées chronologiquement, sans créer un second catalogue ni modifier les données.

Le panneau de recherche « Moments de vie » reste accessible depuis cet espace et peut préremplir les filtres de la photothèque avec les critères exacts de la recherche. Les filtres sont partagés entre les deux vues ; changer de vue ne les efface pas.

## Galerie

- Afficher une grille responsive de vignettes, triées par date de prise de vue décroissante lorsqu'elle est disponible ; les images sans date restent visibles après les images datées.
- Chaque vignette présente le minimum utile : aperçu, date clairement nommée (« Prise de vue »), indicateur de provenance si la date est incertaine, et associations manuelles pertinentes (personnes, événement ou lieu).
- Une date d'import n'est jamais présentée comme une date de prise de vue. Lorsqu'elle est utile, l'afficher séparément et explicitement comme « Importée dans Famili-IA ».
- Garder les photos sans date ou sans annotation dans la galerie : l'absence de métadonnée ne doit pas les faire disparaître.

## Journal de bord

- Présenter les mêmes résultats sous forme de groupes datés, ordonnés du plus récent au plus ancien ; mois et année servent de repères de navigation.
- Construire les groupes à partir de la date locale de prise de vue, pas de la date d'import. Respecter l'heure locale enregistrée et ne pas convertir silencieusement une date dont le fuseau est inconnu.
- Signaler la provenance : date EXIF avec fuseau connu, date EXIF avec fuseau inconnu, correction manuelle, donnée ancienne ou date indisponible. Ne pas qualifier une date incertaine de date exacte.
- Garder les photos non datées dans un groupe distinct « Date de prise de vue indisponible », plutôt que de les éliminer ou de leur attribuer une date d'import.

## Filtres communs

- **Personne** : choix parmi les membres existants, uniquement sur la base des associations manuelles enregistrées. Une photo sans association reste visible sans filtre ; elle ne correspond pas à un membre par inférence.
- **Date** : choisir explicitement « date de prise de vue » ou « date d'import », puis une date ou une période. Les dates absentes ne satisfont pas un filtre de date. Le Journal de bord reste, lui, groupé par date de prise de vue.
- **Lieu** : choix/recherche parmi les libellés saisis manuellement. Aucun lieu n'est déduit des coordonnées GPS ou d'une géolocalisation automatique.
- Les filtres actifs se combinent en **ET**, sont visibles sous forme de critères actifs et peuvent être retirés individuellement ou effacés d'un seul geste. L'état des filtres est identique dans Galerie et Journal de bord.
- Si aucun résultat ne correspond, expliquer que les annotations ou la date peuvent manquer et proposer d'effacer les filtres ou de vérifier les associations depuis la photo.

## États d'interface

| État | Galerie | Journal de bord | Action/règle |
|---|---|---|---|
| Chargement initial | Placeholders de vignettes et statut accessible « Chargement des photos… » | Placeholders de groupes et même statut | Garder les filtres et éviter le saut de mise en page. Le travail de vignette et sa progression détaillée relèvent de 15.5.b. |
| Bibliothèque vide | Illustration sobre, « Aucune photo dans Famili-IA pour le moment » | Message équivalent, sans timeline factice | Proposer l'action d'import locale et rappeler que les originaux ne sont pas déplacés. |
| Résultats | Grille des photos correspondant aux critères | Groupes chronologiques correspondants | Présenter le nombre de résultats et les critères actifs. |
| Aucun résultat filtré | « Aucune photo ne correspond à ces filtres » | Même message, sans groupe vide | Proposer « Effacer les filtres » et « Vérifier les associations ». Distinguer ce cas d'une bibliothèque vide. |
| Photos sans métadonnées | Vignettes conservées, avec date/association indiquée comme indisponible | Groupe dédié aux dates de prise de vue indisponibles | Ne pas inventer date, personne ou lieu. |
| Erreur de chargement | Message explicite et localisé ; conserver l'inventaire si seule une image échoue | Même traitement dans le groupe concerné | Proposer réessai. Ne pas transformer une erreur de lecture en état vide ni supprimer les filtres. |
| Source originale indisponible | Détail avec nom, provenance et explication de la disponibilité de la source | Même détail depuis l'entrée chronologique | Proposer une nouvelle sélection de la source si nécessaire ; ne pas présenter le texte extrait comme l'image originale. |

## Parcours d'une photo vers son fichier d'origine

1. Depuis une vignette ou une entrée du Journal de bord, ouvrir une fiche détaillée avec aperçu de la photo, nom, date et provenance, associations, et indication de la source.
2. Depuis cette fiche, proposer **Ouvrir le fichier d'origine** lorsqu'une source réellement lisible est disponible, ainsi que l'accès aux associations/corrections déjà existantes.
3. La fiche ne doit pas confondre l'aperçu généré par Famili-IA avec le fichier source ni suggérer que l'original est stocké par l'application.
4. Avant de coder le parcours, décider comment retrouver les octets : référence locale durable et permissionnelle lorsque la plateforme le permet, ou demande explicite de re-sélection de la source si seul l'enregistrement de métadonnées subsiste. Les URL d'objet temporaires ne constituent pas une référence durable. Si la source ne peut être rouverte, l'indiquer et conserver l'accès aux métadonnées sans prétendre ouvrir l'original.

## Principes transverses

- Toute la recherche et la présentation des métadonnées restent locales.
- N'exposer aucune coordonnée GPS dans la galerie ou la timeline ; un lieu visible vient uniquement d'une annotation manuelle.
- Les erreurs et absences de données sont explicites, distinctes et réversibles par une action utilisateur.
- Le nombre de photos, leurs noms et leurs annotations ne sont pas présentés comme une détection ou une identification automatique.

## Critères de conception validés

- Les deux vues partagent les mêmes photos et filtres, mais servent deux usages distincts : explorer visuellement et relire chronologiquement.
- Une photo reste visible même sans date, personne ou lieu ; la timeline sépare les dates inconnues.
- Les filtres sont explicables, combinables et effaçables ; leurs sources correspondent aux annotations et métadonnées réellement disponibles.
- La fiche détail décrit honnêtement les limites de réouverture de la source actuelle : seul l'aperçu local peut être affiché et aucun bouton ne prétend ouvrir un original indisponible.
- La conception couvre les états vide, chargement, erreur et absence de résultat, sans confondre ces situations.

## Suite

La génération d'aperçus orientés, leur persistance, le chargement à la demande et la pagination sont réalisés en 15.5.b. Les règles de regroupement et de calendrier local sont réalisées en 15.5.c ; l'accessibilité détaillée, l'aperçu interactif et les actions de gestion sont réalisées en 15.5.d.

## Mise en œuvre 15.5.b

- À l'import d'une photo sélectionnée ou découverte par le scan local, générer une vignette sur l'appareil en décodant l'image avec son orientation EXIF, puis la réencoder en WebP ou JPEG. Le canvas est dimensionné à 320 px maximum, le fichier de vignette à 48 Kio maximum, et deux décodages au plus sont actifs simultanément.
- Persister la vignette dans l'enregistrement du document, distincte du texte extrait et des métadonnées EXIF. Elle transite par le stockage documentaire IndexedDB existant et son chiffrement quand Web Crypto est disponible ; l'original image n'est toujours pas conservé par cette modification.
- L'import reste utilisable si l'encodage échoue : la photo et ses métadonnées restent indexées, l'avertissement est journalisé et signalé dans le statut d'import.
- Dans « Moments de vie », afficher l'aperçu quand il existe, avec décodage différé à proximité du viewport. Paginer les résultats par 24 et ne garder en DOM que la page active. En quittant « Vos données » ou en remplaçant les résultats, retirer les sources des éléments image pour libérer leur mémoire décodée ; les bitmaps et canvases de génération sont fermés/réinitialisés immédiatement.
- Si `IntersectionObserver`, WebP ou `OffscreenCanvas` ne sont pas pris en charge, utiliser le fallback local disponible (JPEG, canvas HTML ou chargement immédiat). Les données persistées sont validées avant de devenir une source image ; aucun format SVG n'est accepté.
- L'export JSON conserve les vignettes comme données locales dérivées ; l'export PDF les omet pour ne pas insérer de longues chaînes base64 dans un document destiné à la lecture. Dans les deux cas, les fichiers originaux ne sont pas exportés.

## Mise en œuvre 15.5.c

- Les contrôles de la recherche photo permettent de choisir un regroupement **par jour**, **par mois** ou **par événement**. Les groupes temporels utilisent uniquement la date locale de prise de vue ; la date d'import reste une information séparée et ne sert jamais de substitut.
- Chaque date est validée calendrièrement sans `Date.parse` ni conversion UTC. Les groupes utilisent directement la chaîne locale `YYYY-MM-DD` / `YYYY-MM`, les jours sont affichés à midi local pour les libellés, et les photos non datées ou invalides restent dans un groupe « Date de prise de vue indisponible » placé à la fin.
- Les dates de provenance `legacy` ou inconnue sont affichées comme **estimées** ; une date EXIF sans offset valide indique explicitement **fuseau inconnu**. Une date saisie/corrigée manuellement est signalée comme locale, sans être considérée à tort comme une date EXIF à fuseau inconnu. Aucun offset n'est appliqué pour déplacer une photo à un autre jour.
- Le regroupement par événement utilise les tags explicites enregistrés, sans inférence. Pour qu'une photo multi-annotée ne soit pas dupliquée dans plusieurs groupes et ne dépasse pas le budget de 24 éléments par page, elle est classée sous son premier événement par ordre alphabétique ; tous ses tags restent affichés dans sa fiche résultat. Sans événement associé, elle apparaît sous « Sans événement associé ».
- Le groupement ne modifie ni les métadonnées ni les dates. Il s'applique à la page de résultats courante ; pagination et groupes restent bornés ensemble, y compris lorsque plusieurs photos partagent un même jour.

Les 15.5.b et 15.5.c préparent les aperçus et les groupes chronologiques. La persistance des originaux et leur ouverture ne sont pas introduites ; l'accès au fichier original reste à traiter conformément à la décision de conception ci-dessus.

## Mise en œuvre 15.5.d

- Chaque résultat propose une fiche détail accessible dans une boîte de dialogue native : vignette locale validée, nom, date de prise de vue/provenance, date d'import, personnes, événements et lieu saisis. Si aucune vignette n'existe, l'indisponibilité est indiquée. La fiche précise que la vignette n'est pas le fichier original et que l'original n'est pas conservé dans Famili-IA.
- Les contrôles natifs de sélection sont utilisables au clavier et disposent de cibles tactiles d'au moins 44 px. « Sélectionner la page » agit uniquement sur la page courante ; la sélection individuelle persiste lorsqu'on navigue entre les pages du même résultat, et est effacée lors d'une nouvelle recherche.
- La suppression exige une confirmation qui précise les données locales concernées et la préservation des originaux. Chaque suppression passe par `deleteDocument`, supprime les données/index de Famili-IA et leur alerte liée éventuelle, puis retire le miroir en mémoire ; un échec est journalisé et affiché sans être présenté comme un succès complet.
- Les boîtes de dialogue sont navigables/closes avec les interactions natives clavier ; la suppression reste impossible tant que la confirmation est en cours. Les tests navigateur couvrent l'aperçu, la sélection clavier et par page, sa persistance entre pages, l'annulation, la suppression confirmée et l'absence de débordement mobile.
- Limite maintenue : l'original n'est ni stocké ni supprimé par l'application. La suppression de la fiche Famili-IA ne peut donc pas supprimer un fichier local ou Drive ; sa réouverture depuis l'app reste hors périmètre tant qu'une référence de source réellement durable et permissionnelle n'est pas conçue.

## Validation 15.5.e

- Test Playwright Chromium sur une bibliothèque synthétique de **1 000 photos** : 24 résultats maximum restent dans le DOM de la timeline active ; au plus 24 éléments vignette sont présents/chargés sur cette page. La navigation effectue 20 pages aller-retour en moins de 5 secondes dans le navigateur de test. La limite mémoire reste complémentaire aux garde-fous de production : 320 px / 48 Kio par vignette, chargement différé et libération des `src` en quittant/remplaçant les résultats ; quand Chromium expose `performance.memory`, le heap JS total du test doit rester inférieur à 256 Mio.
- Viewports émulés : **320 × 740** (téléphone étroit), **768 × 1024** (tablette) et **1440 × 900** (bureau). Aucun débordement horizontal n'est observé ; le conteneur de contenu défile avec les résultats et la pagination conserve la liste bornée.
- Contrôles vérifiés : rôles et libellés accessibles des contrôles de sélection, cibles tactiles de 44 px, fiche photo accessible comme dialogue, fermeture clavier avec Échap et annonce de résultat vide. L'aperçu photo est toujours la vignette locale ; l'inventaire, la recherche Moments de vie et les ouvertures de documents par identifiant passent par le même aiguillage. Les documents gardent leur aperçu textuel ; aucun écran photo ne présente ce texte comme le fichier image original ni ne crée de lien trompeur vers un original indisponible.
- **Limite de validation matérielle** : les tailles d'écran sont simulées dans Chromium ; aucun appareil Android/iOS physique n'est disponible ici. La vérification finale du défilement tactile, de la mémoire native et des lecteurs d'écran sur appareils réels reste recommandée avant une publication mobile. Les résultats automatiques n'établissent pas de lien durable vers l'original : les octets et permissions de source ne sont pas conservés.
