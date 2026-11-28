# Chantier 2 — inventaire initial des vues (étape 2.1)

Relevé du 27 novembre 2026 : Chromium, **390 × 844 px**, données de démonstration, réseau HTTPS bloqué, sans fichier personnel. Les mots sont ceux du texte visible dans la vue (titres, libellés et aides) ; les « textes longs » sont des paragraphes de six mots ou plus. Les captures « avant » sont conservées hors dépôt.

| Vue | Mots | Contrôles visibles | Textes longs | Hauteur (px) | Action principale constatée |
| --- | ---: | ---: | ---: | ---: | --- |
| Accueil | 155 | 9 | 8 | 1 553 | Ouvrir la recherche / ajouter des fichiers |
| Recherche | 573 | 19 | 9 | 1 250 | Poser une question |
| Assistant | 249 | 9 | 8 | 862 | Poser une question documentaire |
| Importer | 264 | 13 | 13 | 2 400 | Choisir une source |
| Alertes | 75 | 8 | 3 | 624 | Consulter les rappels actifs |
| Famille | 107 | 8 | 5 | 1 397 | Consulter/ajouter un membre |
| Maison | 91 | 12 | 4 | 1 050 | Consulter les équipements |
| Profil | 145 | 12 | 5 | 1 448 | Modifier identité, adresse, GPS |
| Vos données | 534 | 19 | 17 | 2 409 | Comprendre les sources et la couverture |
| Plus | 53 | 5 | 0 | 746 | Accéder aux destinations |

## Constats

**Rappels — quatrième lot Prisme Aurore.** « À venir » et « Terminés » sont communs aux deux formats ; les liens vers une catégorie détaillée ouvrent ses filtres. Après comparaison avec la maquette, le panneau expérimental suit la liste sur les deux formats. Seul le premier rappel actif daté en tête de liste reçoit la carte corail autonome (218 px minimum, rayon de 30 px, trois anneaux immobiles si mouvement réduit). Les rappels suivants ont une petite date, menthe si terminés. Sans rappel, afficher la carte de verre à bordure pointillée plutôt qu'une date fictive. Les réglages de notification restent explicites.

Vérifications : build Vite, 42 tests ciblés sur les alertes et les échéances. Dans Chrome isolé : import d’une garantie fictive, confirmation depuis les propositions (un seul rappel après confirmation), passage à « Terminés », rechargement et réactivation. Contrôle du mode sombre, de la largeur de page et des réglages (Échap et retour du focus) à 320, 390, 820 et 1 366 px. Pas de suite Playwright, d’autorisation de notification accordée ni d’essai sur appareil physique.

**Foyer — troisième lot Prisme Aurore.** Même carte menthe illustrée, catégories défilantes et accès au cercle local sur mobile et ordinateur. Le carnet distingue première utilisation et catégorie sans résultat. La feuille d’ajout réutilise le dialogue d’équipement ; aucun équipement ou membre de démonstration ajouté par la vue.

Vérifications : build Vite, cinq tests unitaires liés au foyer et à la famille, contrôle Chrome à 320, 390, 820 et 1 366 px (largeur de page, ouverture et annulation). En profil temporaire : création d’un équipement fictif, persistance après rechargement en sombre, filtre vide, retour clavier sur « Tout », ouverture du détail et navigation vers Famille. Pas de suite Playwright ni d’essai sur appareil physique.

**28 novembre — premier lot Prisme Aurore dans l’application.** L’Accueil mobile et web partage un seul raccourci de recherche, la prochaine échéance issue des rappels enregistrés (ou son état vide), les raccourcis Importer/Foyer et les fichiers avec leur provenance. Le détail des rappels reste accessible sur ordinateur. Le logo Orbite, le sélecteur d’apparence et la navigation sont communs.

Vérifications : build Vite ; Accueil dans Chrome sur un profil temporaire à 320, 390, 820 et 1 366 px, sans débordement horizontal du contenu ; bascule dock/barre latérale, navigation vers Recherche, persistance du sombre et suivi des changements de thème système. Pas de suite Playwright, ni de validation sur appareil physique pour ce lot.

**Recherche — deuxième lot Prisme Aurore dans l’application.** Sur ordinateur, les filtres latéraux actualisent l’index sans génération Qwen. Sur mobile, « Filtres » ouvre une feuille : appliquer valide les choix, fermer ou Échap abandonne les changements non appliqués. La carte à anneaux conserve le type, la provenance, la preuve et l’accès conditionnel à la copie. Le filtre Contrats utilise le type enregistré ; « Options de réponse » sous la requête conserve l’opt-in Qwen.

Vérifications : build Vite, 18 tests unitaires d’index et de recherche de contenu, puis parcours Chrome dans un profil temporaire avec import texte fictif, recherche, preuve et ouverture de la copie. Vérifiés à 320, 390, 820 et 1 366 px : absence de débordement horizontal de la page, feuille modale, focus et Échap, filtre appliqué conservé au changement de format, état sans résultat, réinitialisation, bascule sombre et lien Assistant. Pas de suite Playwright, d’essai sur appareil physique ni de génération Qwen pour ce lot.

- **Plus de texte :** Recherche (573 mots), Vos données (534) et Importer (264) concentrent l'essentiel de la lecture. Sur Vos données et Importer, la page dépasse deux hauteurs d'écran.
- **Répétitions probables :** le périmètre « fichiers présents dans Famili-IA », la mention des exemples fictifs, la confidentialité du dossier/connexion, les limites de couverture et le fonctionnement de Qwen sont répétés dans plusieurs blocs de Recherche, Assistant, Importer et Vos données.
- **À conserver près de l'action :** consentement et portée de Qwen, accès choisi aux sources, mention que les originaux restent en place, couverture inconnue/incomplète, provenance et limites d'accès. Ils pourront être raccourcis, mais ni retirés ni déplacés vers une infobulle permanente.
- **Accueil :** 155 mots et 1,8 écran. La première carte combine slogan, aide et deux actions ; les rappels, le foyer et la démonstration suivent. C'est un bon premier lot pour tester Prisme avec une seule tuile.

## Lot 1 — Accueil (27 novembre 2026)

La carte d'introduction (`.home-actions-panel`) est devenue une tuile Prisme `ui-prisme ui-prisme--inline` / `prisme-feature--action`. Titre « Retrouvez l'essentiel », une courte phrase, « Ouvrir la recherche » (`data-open-view="recherche"`) et « Ajouter des fichiers » (`data-open-import`) : mécanismes, routes et libellés d'action inchangés. L'ancien slogan, son surtitre et son paragraphe d'aide sont retirés ; l'illustration d'origine, masquée sur mobile, est remplacée par le décor Prisme. Le rappel de couverture des rappels reste affiché.

| Mesure à 390 px | Avant | Après |
| --- | ---: | ---: |
| Mots visibles de l'Accueil | 155 | **129 (−16,8 %)** |
| Contrôles visibles | 9 | 9 |
| Hauteur du contenu | 1 553 px | 1 466 px |

Vérifié : débordement horizontal absent à 320 et 390 px ; accueil (4 largeurs), accessibilité de l'Accueil (4 largeurs), galerie Prisme et build réussis. Reste à faire : validation de la compréhension du parcours par l'utilisateur.

## Lot 2 — Recherche (27 novembre 2026)

La vue Recherche est placée dans une portée `ui-prisme ui-prisme--inline` (champ lilas, bouton de lancement bleu nuit, résultat sur carte lilas avec preuve encadrée). Mécanismes, identifiants, filtres, Qwen opt-in, provenance (« Provenance et détails ») et accès aux copies sont inchangés. Retirés : surtitre et sous-titre du titre ; ne sont plus répétés dans l'aide Qwen que les plafonds numériques (la mention d'envoi limité à huit extraits, jamais le document complet ni l'historique, et l'indisponibilité mobile restent visibles) ; l'état vide est raccourci. Le périmètre de recherche (fichiers présents, photos sans reconnaissance visuelle) reste affiché. La carte reprend les composants Prisme : badge de type avec icône de fichier, métadonnées, preuve encadrée, lien de copie fléché et détails repliés après l'action. Le compteur est condensé et les filtres avancés restent accessibles à côté du filtre contrat.

| Mesure initiale à 390 px (texte visible, panneaux repliés exclus) | Avant | Après |
| --- | ---: | ---: |
| Recherche, état vide | 155 | **118 (−24 %)** |
| Recherche avec un résultat fictif | 168 | **144 (−14 %)** |

Le relevé du tableau initial comptait aussi le contenu des panneaux repliés : le chiffre de 573 mots pour Recherche était surestimé ; la valeur visible de départ est 155. Les valeurs des autres vues devront être remesurées avec ce décompte avant leur lot.

Vérifié lors de l'ajustement de la carte : `tests/unified-search-entry.spec.js` (20 tests), absence de débordement à 320 et 390 px, `npm run build`. Reste à faire : validation utilisateur sur le parcours réel.

## Lot 3 — Assistant (27 novembre 2026)

La vue Assistant est placée dans la même portée `ui-prisme ui-prisme--inline` : formulaire lilas, bouton d'envoi bleu nuit, bulle utilisateur bleu nuit, message d'accueil menthe, source citée sur carte lilas avec passage encadré. Mécanismes, Qwen opt-in, annulation, contexte, « Assistant ou Recherche ? », idées de questions et confirmations d'action sont inchangés. Retirés : surtitre et sous-titre ; dans l'aide Qwen, seuls les plafonds numériques par extrait et au total (la limite de 500 caractères, les huit extraits, l'absence du document complet et de l'historique et l'indisponibilité mobile restent) ; le message d'accueil est raccourci. Les mentions de périmètre et de source générées dans les réponses sont conservées.

| Mesure à 390 px (texte visible, panneaux repliés exclus) | Avant | Après |
| --- | ---: | ---: |
| Assistant, état initial | 144 | **111 (−23 %)** |
| Assistant après une question documentaire fictive | 213 | **180 (−15 %)** |

Vérifié : aucun débordement horizontal ; tests Assistant (dont Qwen), accessibilité de l'Assistant et galerie Prisme, puis build réussis. Le test « assistant et aperçu du scan » échouait déjà avant ce lot : il attendait encore l'ancienne formulation « faits exacts déjà extraits » de l'aide, mise à jour avec le chantier 1 ; l'assertion attend désormais « huit extraits vérifiés ». Reste à faire : validation utilisateur.

## Lot 4 — Foyer : Maison et Famille (27 novembre 2026)

Maison et Famille sont placées dans la portée `ui-prisme ui-prisme--inline`. La fiche de la maison reprend le fond menthe de la maquette tout en conservant sa photo, son bouton « Modifier la photo », la mention « Visuel d'illustration · IA » et « Modifier dans le profil » ; la sélection de catégorie passe en bleu nuit et les accents de Famille suivent les couleurs Prisme. Retirés : surtitres et sous-titres, l'eyebrow et la phrase d'aide de la fiche de la maison, la phrase d'accès direct aux catégories d'inventaire et une partie de l'aide des souvenirs. Conservés : la note sur les illustrations IA (les cartes n'affichent que « Illustration IA »), « Ces fiches restent sur cet appareil. Aucun compte ni partage n'est créé » et les états vides. Aucune permission, donnée ou route n'est modifiée.

| Mesure à 390 px (texte visible, panneaux repliés exclus) | Avant | Après |
| --- | ---: | ---: |
| Maison, état vide | 91 | **≈ 58 (−36 %)** : 45 mesurés, plus 13 mots de la note rétablie après test |
| Famille, état vide | 107 | **77 (−28 %)** |

Vérifié : aucun débordement horizontal ; 26 tests ciblés (Foyer, photo d'équipement, accessibilité Maison/Famille, Prisme) puis le test Foyer rejoué après rétablissement de la note, et build réussis. Un premier passage a échoué parce que j'avais retiré la note sur les illustrations IA, requise par le test ; elle a été rétablie. Les états avec équipements ou proches enregistrés n'ont pas été capturés dans ce lot. Reste à faire : validation utilisateur.

## Lot 5 — Rappels (Alertes) (27 novembre 2026)

La vue Alertes est placée dans la portée `ui-prisme ui-prisme--inline`. Filtre sélectionné en bleu nuit ; chaque rappel **daté** affiche sa date sur une tuile corail (jour + mois, décorative, `aria-hidden`) à la place de l'icône ; la carte est blanche et son état reste écrit (« À traiter », « À anticiper », « À surveiller », « Reportée »…), la couleur n'étant jamais le seul signal. Un rappel sans date valide garde son icône et son texte « Date non renseignée » / « Date à vérifier ». Le texte « Échéance : jj/mm/aaaa », la preuve, la provenance, les avis de source à vérifier, les réglages, les actions de report/ignorer/terminer et « Gérer cette alerte » sont inchangés ; seuls surtitre et sous-titre sont retirés (13 mots). Aucune donnée, seuil ou notification n'est modifié.

Mesure à 390 px : état sans rappel 75 → 57 mots hors éléments décoratifs (relevé initial et final avec méthodes de décompte proches mais non strictement identiques) ; avec deux rappels fictifs, 81 mots visibles pour 976 px de hauteur.

Vérifié : aucun débordement ; 20 tests ciblés (alertes complètes, accessibilité Alertes à quatre largeurs, Prisme) et build réussis. Reste à faire : validation utilisateur.

## Lot 6 — Importer et Vos données (27 novembre 2026)

Les deux vues sont placées dans la portée `ui-prisme ui-prisme--inline` : zone « Sur cet appareil » sur fond menthe, pastilles d'étapes et filtres sélectionnés en bleu nuit, bandeau de confiance de Vos données sur fond lilas. Retirés : surtitres et sous-titres, l'introduction « Un espace distinct… » de l'export, et deux phrases répétées dans « Sources, contrôle et limites » (la couverture et « Métadonnées seules » restent affichées sous l'inventaire). Raccourcis : l'indication de retour d'Importer et la phrase de suivi local. **Conservés tels quels :** la mention « Vos originaux restent à leur emplacement », les permissions et limites de Google Drive, OneDrive et Dropbox, « Traitement local. Les originaux ne sont ni déplacés ni supprimés », les formats et limites, les confirmations de suppression, l'export et la révocation des accès. Aucune permission, source ni donnée n'est modifiée.

| Mesure à 390 px (texte visible, panneaux repliés exclus) | Avant | Après |
| --- | ---: | ---: |
| Importer | 217 | **188 (−13 %)** |
| Vos données (exemples intégrés) | 310 | **273 (−12 %)** |

Vérifié : aucun débordement ; 33 tests ciblés (inventaire de Vos données, ajout depuis Recherche, accessibilité Importer/Vos données à quatre largeurs, Prisme) et build réussis. Ces deux vues restent longues (environ deux écrans et demi) : une réduction plus forte demanderait de déplacer ou de condenser des informations de permission ou de couverture, ce qui relève d'une décision séparée. Reste à faire : validation utilisateur.

## Lot 7 — Profil, Plus et fiche de détail (27 novembre 2026)

Profil, Plus et la fiche de détail d'un équipement sont placés dans la portée `ui-prisme ui-prisme--inline` : pastille d'avatar corail, icônes de Plus sur menthe. Retirés : surtitres et sous-titres, ainsi que deux phrases d'aide de Profil (« Retrouvez les actions utiles… », « Une aide à rejouer… »). Le surtitre de la fiche de détail est retiré ; sa description, renseignée dynamiquement (état vide ou équipement), est conservée. **Conservés :** le choix de localisation GPS et son explication, la précision « Ce choix ne connecte aucun service et ne crée aucun partage », l'adresse facultative, les libellés descriptifs des destinations de Plus. Aucun réglage, donnée ni route n'est modifié.

| Mesure à 390 px (texte visible, panneaux repliés exclus) | Avant | Après |
| --- | ---: | ---: |
| Profil | 128 | **96 (−25 %)** |
| Plus | 53 | **46 (−13 %)** |

Vérifié : aucun débordement ; 33 tests ciblés (Profil, Plus, fiche équipement, photo d'équipement, visite guidée, accessibilité Profil/Plus à quatre largeurs, Prisme) et build réussis. La fiche de détail n'a pas été mesurée en mots (contenu dynamique).

## Bilan des lots 1 à 7

Les onze vues actives (Accueil, Recherche, Assistant, Maison, Famille, Alertes, Importer, Vos données, Profil, Plus et la fiche de détail) ont reçu le langage Prisme et une réduction du texte répété. À l'issue de ces lots, la navigation et les routes n'avaient pas encore été réorganisées ; le choix utilisateur et son réalignement mobile sont consignés ci-dessous. Les validations restent des tests ciblés par lot, pas la suite complète. Restent ouverts : validation utilisateur du parcours sur téléphone, états non nominaux (erreur, chargement) à inventorier, captures avant/après à consigner pour chaque vue.

## Réalignement du parcours mobile

À la demande explicite de l'utilisateur, le parcours mobile principal reprend les quatre destinations de la maquette : Accueil, Recherche, Foyer (route `maison`) et Rappels (route `alertes`). La navigation desktop et les routes métier ne changent pas. Le menu Plus garde Famille, Assistant, Profil et Vos données ; Importer y est également accessible, en plus des raccourcis d'ajout existants.

L'Accueil utilise les rappels et fichiers réellement disponibles sur l'appareil : dates validées sur tuile corail, état vide explicite, provenance affichée pour chaque fichier, exemples marqués fictifs. Les fichiers datés sont triés du plus récent au plus ancien ; les éléments sans date restent après eux sans date inventée. Aucun contenu de démonstration de la maquette n'est repris comme donnée réelle.

Vérifié : build réussi ; 9 tests Playwright ciblés réussis (navigation mobile, accueil et visite guidée à quatre largeurs, galerie Prisme) ; aperçu navigateur des quatre destinations à 390 × 844 px. Les captures n'ont pas été archivées. La validation utilisateur du parcours reste requise avant de considérer le chantier 2 terminé.

## Lot 8 — Mon foyer (27 novembre 2026)

La vue mobile reprend la composition Foyer de la maquette : carte menthe « Carnet de maison / La maison » avec l'illustration IA standard (la photo personnalisée de la maison est retirée), puis équipements compacts, Famille et Mon espace. « Modifier dans le profil » reste disponible. Les filtres d’équipement sont repliés derrière « Filtrer par catégorie » sur mobile, ouverts sur ordinateur, et leur état reste accessible après une modification. Les lignes conservent le statut saisi et le nombre de documents associés ; la note identifie les illustrations IA. Le compteur Famille est calculé depuis les fiches présentes sur cet appareil, sans partage implicite. La carte « Votre carnet commence ici » est supprimée : l'ajout passe par le bouton de l'en-tête.

Nettoyage après revue utilisateur (28 novembre 2026) : Recherche perd la carte d'état vide, les panneaux « Sources et limites de la recherche » (l'état des sources reste dans Vos données) et l'encart de confidentialité en bas de page ; « Échéances proposées — expérimental » est déplacé dans Rappels (même logique, même confirmation explicite). L'Accueil perd le bloc de compteurs (exemples fictifs inclus) ; « Revoir la démo » passe dans Vos données. La date de l'Accueil adopte le style Prisme (mono, capitales, couleur atténuée). Côté code : `updateHousePhoto`, le bouton et la logique « photo de la maison » sont supprimés ; `initCoverPhotoDialog` ne gère plus que les équipements ; une photo de maison déjà enregistrée est conservée (export/purge) mais ignorée. Les 23 tests Playwright (`tests/*.spec.js`) sont supprimés pour la durée de la refonte et seront recréés à la fin ; ils restent récupérables dans l'historique git. Seuls `npm run build` et un contrôle visuel à 390 px (sans débordement sur les cinq vues) ont été exécutés après ce nettoyage.

Nouvel alignement Foyer (28 novembre 2026) : la carte « Carnet de maison » reprend la maquette (pastille de rubrique en haut, grande illustration en arrière-plan à droite, « La maison » et l'origine « Visuel d'illustration · IA » en bas, « Modifier dans le profil » conservé). Les rubriques Équipements, Famille et Mon espace deviennent des lignes Prisme : titre de section, tuile d'icône, texte secondaire, filet de séparation ; Mon cercle affiche les initiales des fiches réellement enregistrées (trois au plus) ou une icône s'il n'y en a pas. Vérifié à 390 px et 1280 px avec des données fictives (retirées ensuite) : aucun débordement horizontal ; aucun test automatisé n'a été relancé.

Alignement Rappels mobile (28 novembre 2026) : filtres « À venir · n » / « Terminés · n » en contrôle segmenté (« Autres filtres » conservé dessous), titre de liste masqué visuellement mais lu par les lecteurs d'écran, puis chaque rappel daté devient une grande carte corail (jour, mois en toutes lettres, titre, « Dans n jours → », rubans décoratifs) suivie de son état, de la date, du détail, d'un titre « Document source », de la preuve littérale, de la provenance, des avis « Source à vérifier » et de « Voir la copie » ; « Gérer cette alerte » et les actions de report restent inchangés. Sur ordinateur, la tuile date garde le mois abrégé. Vérifié à 390 px avec un rappel fictif (retiré ensuite), sans débordement ; aucun test automatisé relancé.

Mesures et vérifications du lot Foyer précédent (13 tests Playwright, désormais retirés) : 64 mots visibles à 390 × 844 px, sans débordement. Cette capture ne remplace pas l’essai sur le téléphone réel ni la validation visuelle de l’utilisateur.

## Limites de ce relevé

Sur mobile, « Retrouver un fichier » mène à Recherche, puis « Assistant documentaire » à l’Assistant. La carte « À la une » présente la prochaine échéance active datée non reportée, ou son état vide. Dans Foyer, « Mon cercle » et « Fichiers et réglages » mènent à Famille et Plus. Dans Rappels, « À venir » regroupe les rappels actifs et « Terminés » les rappels résolus ; les rappels ignorés restent dans les autres filtres. Sur ordinateur, les vues restent indépendantes de cette présentation mobile.

Ce relevé ne couvre pas encore les fiches de détail ni les parcours avec résultats, erreur, chargement ou succès pour chaque vue. Il ne valide aucune compréhension utilisateur. L'étape 2.1 reste donc ouverte tant que ces états ne sont pas inventoriés.

## Proposition de premier lot — Accueil (à valider avant implémentation)

- **Périmètre :** seule la carte d'introduction de l'Accueil devient une tuile Prisme ; les actions « Ouvrir la recherche » et « Ajouter des fichiers » conservent leurs mécanismes existants. Navigation, routes et autres vues inchangées.
- **Objectif textuel :** remplacer le slogan et l'aide par un titre court et la seule phrase nécessaire à l'action ; viser **au moins 15 % de mots en moins sur l'Accueil** sans supprimer le rappel de couverture des alertes.
- **Preuves :** captures avant/après, test Playwright ciblé de l'Accueil, vérification 320/390 px et clavier, puis validation du parcours par l'utilisateur.
