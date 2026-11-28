# Famili-IA — plan opérationnel restant

**Plan actif, révisé le 27 novembre 2026.** Il remplace la feuille de route active précédente, archivée à l'identique dans [DEVELOPPEMENT_PLAN_old.md](./DEVELOPPEMENT_PLAN_old.md). L'archive conserve les décisions, validations et cases cochées historiques ; elle ne constitue pas le plan d'exécution courant.

Ce plan détaille les six chantiers demandés : terminer et cadrer l'intégration applicative de Qwen3:8b, rendre les pages plus intuitives et y intégrer progressivement la direction graphique Prisme, ajouter une navigation par glissement sur mobile, simplifier l'indexation sans dépasser les autorisations, revoir les alertes familiales, puis décider et mettre en œuvre un modèle économique. Les capacités et états décrits ci-dessous sont le point de départ constaté, pas une promesse de livraison.

Une case ne peut être cochée qu'après réalisation du parcours complet, exécution des vérifications indiquées, documentation des résultats et revue des changements. Un test simulé n'est pas une validation sur un compte fournisseur ou un appareil réel.

## 1. État de départ constaté

- L'application est un projet JavaScript/HTML/CSS avec Capacitor Android. Le dossier et la cible iOS ne sont pas présents dans le dépôt au 25 novembre 2026 ; une construction et des essais natifs iOS exigent macOS/Xcode.
- L'Assistant applicatif utilise encore `qwen3:8b`, prompt `1.1.0`, en mode local opt-in sur ordinateur. Son intégration reste expérimentale et ne doit pas être confondue avec le modèle choisi pour Cline.
- A5 (40 cas synthétiques) a reçu une revue sémantique indépendante 40/40 `pass`, mais confirme uniquement ce contrôle. D3 (20 cas) a réussi les contrôles de décision/barrière et les huit sorties admissibles ; la lecture sémantique D3 était interne, non indépendante. A2.2 reste rejetée : les campagnes n'atteignent pas 18/18 conformes. **Qwen n'est pas qualifié globalement.** Détails : [évaluation de l'Assistant](./docs/architecture/assistant-evaluation.md).
- L'import local propose une sélection de fichiers et, sur le Web compatible, un choix explicite de dossier. Le scan natif existant est limité au répertoire Documents de l'application ; ce n'est pas un accès automatique à tout le stockage du téléphone. Les listes de formats varient selon les parcours et doivent être harmonisées avant d'annoncer une couverture complète.
- Aucun gestionnaire de glissement entre vues n'a été trouvé dans les fichiers de navigation examinés. La vue Famille et les alertes sont enregistrées localement ; aucun partage vérifié entre comptes ou appareils n'est livré.
- Aucun flux d'achat ou de facturation n'a été trouvé dans les dépendances et modules applicatifs examinés. Les offres et prix précédemment évoqués demeurent des hypothèses, pas des décisions.

## 2. Principes et règles d'exécution

- Traitement local par défaut. Ne pas transmettre documents, photos, requêtes familiales, coordonnées, index, extraits ou secrets à un service distant sans décision et information explicites.
- Ne pas demander d'accès global aux fichiers. Un scan automatique éventuel ne couvre que le périmètre précisément choisi et accordé par l'utilisateur, et seulement les formats réellement pris en charge.
- Ne pas élargir permissions, authentification, chiffrement, synchronisation, migrations, partage ou suppression sans une mission explicite, une décision documentée et des critères de validation adaptés. Ne jamais supprimer les originaux de l'utilisateur.
- Respecter les conventions d'interface de [CLAUDE.md](./CLAUDE.md), notamment les composants et tokens existants, les états d'erreur, les preuves/provenances utiles et une aide compacte placée au point d'action plutôt qu'en paragraphes répétés.
- Pour la refonte graphique, suivre le [guide d'adoption Prisme](./docs/guide/prisme.md) et ses [compositions interactives](./docs/guide/prisme.html) : adoption par vue, composants `ui-*` réutilisés, pas de nouveau thème global ni de remplacement implicite de la navigation.
- Pour chaque lot Cline, appliquer le [guide de mission et de contrôle](./docs/guide/developpement-assiste.md), lire les fichiers concernés et vérifier l'état Git avant modification. Protéger les modifications préexistantes, suivre un périmètre borné et livrer code, tests et documentation ensemble.
- La configuration souhaitée de Cline est décrite dans [`.clinerules`](../../.clinerules/execution-commandes.md) : Plan = OmniRoute / NVIDIA Poolside Laguna XS ; Act = Ollama local / `qwen3:14B`. Ce routage concerne Cline seulement ; il ne modifie pas le modèle applicatif Qwen3:8b.
- Ne pas installer de dépendance, modifier la configuration d'un fournisseur, créer de compte, effectuer un achat ou créer un commit sans autorisation adaptée.

## 3. Ordre recommandé

1. Vérifier la configuration et le protocole de travail Cline, puis prendre une base de tests/documentation.
2. Stabiliser le parcours existant de Qwen3:8b sans changer le prompt sans preuve.
3. Intégrer progressivement Prisme et simplifier les vues par lots, en commençant par une tuile de l'Accueil ; en parallèle, cadrer puis implémenter les gestes de navigation après validation du parcours cible.
4. Étudier l'accès automatique à un dossier autorisé avant tout changement de permission ou scan natif.
5. Décider si le partage des alertes est local au même appareil ou entre comptes/appareils ; n'implémenter le second qu'après décision d'architecture.
6. Choisir les offres et canaux de vente après estimation des coûts et retours utilisateur ; le paiement vient en dernier, après approbation explicite.
7. Conduire les validations sur les plateformes réellement livrées et décider du lancement ou du report.

Les étapes de recherche et de décision peuvent avancer en parallèle. Aucun chantier dépendant d'un choix sensible ne passe en implémentation tant que ce choix n'est pas approuvé.

---

## Chantier 1 — Étendre l'usage applicatif Qwen3:8b

**Objectif :** rendre Qwen3:8b utilisable, en local et sur opt-in, depuis Recherche et l'Assistant pour répondre à des questions fondées sur les documents présents dans Famili-IA. La qualification globale est une décision séparée : elle ne bloque pas une mise en œuvre expérimentale et ne doit pas être annoncée sans preuves suffisantes. Le choix Cline `qwen3:14B` ne remplace pas le modèle applicatif.

### Étapes à réaliser

- [x] **1.1 — Fixer le périmètre d'usage :** navigateur sur ordinateur, Ollama sur `127.0.0.1:11434`, modèle `qwen3:8b`, prompt `1.1.0`, opt-in distinct depuis Recherche et l'Assistant, questions limitées à 500 caractères et jusqu'à huit extraits vérifiés (1 024 caractères par extrait, 8 192 au total). Pas de connaissances générales, de document complet, de nom de fichier ou d'historique transmis.
- [x] **1.2 — Intégrer Qwen à Recherche :** conserver l'index local et ses filtres pour choisir les résultats ; sur soumission explicite et opt-in, permettre une réponse Qwen à partir des seuls extraits vérifiés correspondants. Ne pas présenter cette étape comme une recherche sémantique ou un reclassement du corpus.
- [x] **1.3 — Élargir l'usage dans l'Assistant :** autoriser des questions documentaires plus générales et des réponses synthétisées à partir de plusieurs extraits et sources locales vérifiés, même sans extraction préalable d'un fait unique. Conserver les citations littérales, la provenance, l'abstention en absence de preuve et l'invalidation des réponses périmées.
- [x] **1.4 — Vérifier les cas de sécurité et d'état :** absence de preuve textuelle, fait manquant, ambiguïté, conflit, instruction hostile dans un document, citation invalide, modèle indisponible, annulation et modification du document pendant la génération. Une sortie invalide ou obsolète ne doit jamais être affichée comme une réussite.
- [x] **1.5 — Séparer mise en œuvre et qualification :** conserver l'étiquette expérimentale. La qualification globale exige un protocole versionné, des seuils de qualité, une revue sémantique indépendante reliée aux sorties exactes et des limites publiées. A2.2 demeure rejetée jusqu'à une nouvelle décision/version qui satisfait ses critères ; A5 et D3 ne sont pas des qualifications globales.
- [x] **1.6 — Trancher le déploiement mobile séparément :** ne pas appeler Ollama sur le téléphone via `127.0.0.1`, ne pas ouvrir Ollama au réseau local et ne pas élargir CORS. Une cible mobile exige une architecture et une revue dédiées avant toute implémentation.

**Critères de sortie :**

- Seuls la question et des extraits de texte vérifiés, issus du contexte local retenu, sont transmis ; jamais un document complet, un nom de fichier ou l'historique.
- Recherche conserve son index et ses filtres déterministes ; Qwen ne reçoit que les preuves des résultats correspondant à la recherche et aux filtres actifs.
- Aucun appel modèle sans extrait vérifié admissible, en cas d'ambiguïté ou de conflit ; les résultats déterministes restent visibles si Qwen est désactivé ou échoue.
- Chaque affirmation affichée passe le schéma et la validation de citations littérales ; les preuves et sources correspondantes restent visibles.
- Les réponses tardives, annulées, non citées ou liées à un instantané périmé sont écartées avec un état explicite.
- Aucun réseau externe n'est utilisé par le parcours local et aucune action ne peut être exécutée sur la seule instruction du modèle.
- Un éventuel statut « qualifié » reste distinct de l'usage expérimental et doit satisfaire les exigences de revue indépendante. La qualification n'est pas un préalable à la livraison de cet usage expérimental.

**Tests et preuves à fournir :** tests unitaires de validation/barrière et de sélection de plusieurs extraits ; tests navigateur pour Recherche et Assistant, opt-in, refus, erreur, annulation et invalidation ; vérification avec données fictives et réseau local uniquement. Noter les résultats réels sans confondre test applicatif et qualification du modèle.

### Validation de l'intégration — 27 novembre 2026

- `node --test tests/assistant-local-qwen.test.js tests/search-quality.test.js tests/assistant-qwen-development-gate.test.js` : 30/30 réussis.
- `npx playwright test tests/assistant-ui.spec.js tests/search-qwen.spec.js --grep "Qwen"` : 14/14 réussis ; inclut opt-in, refus, annulation, citations, injections et modification d'une source pendant une génération dans les deux parcours. Le premier passage a échoué sur une attente de résultat local devenue invalide après modification de la preuve ; l'assertion a été corrigée pour vérifier l'état réel « Aucun résultat », puis les 14 tests ont réussi. Le contrôle initial de l'opt-in Assistant a aussi été rejoué seul : 1/1 réussi.
- `npm run build` : réussi.
- Smoke Chromium vers Ollama local `qwen3:8b`, avec une facture synthétique uniquement : 2 appels à `/api/chat`, preuve littérale visible dans Recherche et l'Assistant, aucun appel HTTPS observé. Une première tentative de smoke n'a pas produit de résultat à cause de l'encodage du script PowerShell et d'une requête fixture mal ciblée ; le smoke corrigé a réussi.
- Ces résultats valident le branchement expérimental et ses barrières, pas la qualité sémantique générale du modèle. La qualification globale reste ouverte et A2.2 reste rejetée.

---

## Chantier 2 — Rendre les pages intuitives et intégrer la direction graphique Prisme

**Objectif :** faire évoluer progressivement les vues actives vers la direction graphique Prisme, tout en rendant leur action principale, leur état et la suite à donner plus immédiatement compréhensibles. Réduire les explications répétitives, sans cacher les informations nécessaires aux décisions, à la confidentialité, à la provenance ou à la sécurité. Le parcours mobile principal comprend désormais cinq destinations : Accueil, Recherche, Foyer (route Maison), Rappels (route Alertes) et Vos données. Paramètres est accessible depuis l’en-tête ; Profil et famille est une rubrique de Paramètres, également accessible depuis Foyer. Le menu web ne duplique pas cette entrée.

### Étapes à réaliser

- [ ] **2.1 — Établir l'état initial des vues :** pour Accueil, Recherche, Assistant, Importer, Alertes, Famille, Maison, détails, Profil, Vos données et les autres vues actives, relever titre, action, hiérarchie visuelle, composants, texte répété, provenance, limites et états vide/chargement/erreur/succès/action requise. Capturer les vues retenues avant toute modification. *Avancement : premier relevé et captures de dix vues à 390 px dans l'[inventaire](./docs/guide/chantier-2-inventaire.md) ; fiches de détail et états non nominaux restent à inventorier. Lot 1 (tuile Accueil) livré techniquement : −16,8 % de mots à 390 px, tests ciblés et build réussis. Lot 2 (Recherche) : −24 % à l'état vide, −14 % avec un résultat, 29 tests ciblés et build réussis. Lot 3 (Assistant) : −23 % à l'état initial, −15 % après une réponse, tests ciblés et build réussis. Lot 4 (Maison et Famille) : environ −36 % et −28 % à l'état vide, tests ciblés et build réussis. Lot 5 (Alertes) : tuile date corail, surtitre/sous-titre retirés, 20 tests ciblés et build réussis. Lot 6 (Importer et Vos données) : −13 % et −12 % de mots visibles, permissions et limites conservées, 33 tests ciblés et build réussis. Lot 7 (Profil, Plus et fiche de détail) : −25 % et −13 %, 33 tests ciblés et build réussis. Toutes les vues actives ont reçu Prisme ; validation utilisateur en attente pour les sept lots ; aucune case cochée.*- [ ] **2.2 — Définir le langage visuel et son raccordement :** utiliser la galerie Prisme et le guide d'intégration pour faire correspondre les compositions aux composants et tokens `ui-*` existants. Charger les styles Prisme de façon locale à la vue ; ne pas recolorer le `body` ni créer un système de composants concurrent. Le réagencement mobile convenu conserve les routes et fonctions métier existantes.
- [ ] **2.3 — Fixer l'ordre et les objectifs des lots :** commencer par une tuile d'Accueil reliée à une action existante, puis proposer les lots cohérents suivants (preuve Recherche/Assistant, Foyer/Maison, Rappels/Alertes). Avant chaque lot, convenir avec l'utilisateur des vues concernées et du résultat attendu ; mesurer les mots/blocs avant et après. Les cinq destinations sont désormais le parcours mobile convenu ; la navigation desktop reste distincte.
- [ ] **2.4 — Simplifier sans supprimer l'information utile :** garder près de l'action les permissions, le consentement, les erreurs, les limites d'accès et de couverture, les preuves/provenances, confirmations et conséquences de suppression. Ne retirer que les répétitions sans utilité décisionnelle ; conserver des libellés visibles, sans substituer des icônes ou infobulles permanentes au texte.
- [ ] **2.5 — Intégrer par petits lots réversibles :** appliquer les composants Prisme aux vues ciblées en conservant les mécanismes, données et états métier existants. Réorganiser la navigation mobile conformément aux choix explicites de l'utilisateur sans supprimer les routes ; les vues secondaires restent accessibles depuis leurs liens contextuels, et Paramètres depuis l’en-tête. Respecter les illustrations comme décor (jamais une photo personnelle), les couleurs d'état sémantiques, le mouvement réduit, les tokens et les dialogues de production.
- [ ] **2.6 — Valider chaque lot avant de poursuivre :** comparer les captures avant/après et vérifier la compréhension de l'action, des états et des limites ; consigner les incompréhensions et corrections, puis obtenir la validation utilisateur du parcours. Ne pas généraliser à d'autres vues avant cette validation.**Critères de sortie :**
- Chaque vue modifiée possède un relevé avant/après de sa hiérarchie, ses composants et son nombre de mots/blocs ; les éléments conservés servent à l'action, à la sécurité, à une limite ou à un état.
- Les styles Prisme sont isolés aux vues retenues et réutilisent les tokens et composants de production ; aucune régression globale ni changement involontaire de routes, destinations ou fonctions n'est introduit.
- Aucune information requise pour le consentement, la provenance, la couverture, une erreur ou une action destructive n'a été supprimée ou reléguée dans une infobulle.
- Le parcours principal de chaque vue reste réalisable au clavier et sur petit écran ; le contenu reste accessible au lecteur d'écran et les cibles tactiles respectent les règles du projet.
- Les états vide, chargement, erreur, succès et action requise restent distincts et véridiques.
- Les illustrations restent identifiables comme décoratives et ne suggèrent pas de données ou de capacités absentes ; les couleurs n'encodent pas seules un statut.
- La validation utilisateur ou le test de compréhension prévu pour chaque lot est consigné ; une simple réduction du nombre de mots ou une ressemblance à la maquette ne suffit pas.

**Tests et preuves à fournir :** tests Playwright pertinents par vue, audit d'accessibilité ciblé, vérification responsive et captures avant/après pour les vues touchées ; tests existants de navigation simple et d'accessibilité à adapter au lieu d'ajouter un second système d'interface. Exécuter uniquement les tests structurants du lot ; consigner toute vérification non exécutée. Le test de la galerie Prisme ne valide pas à lui seul l'intégration aux vues applicatives.

---

## Chantier 3 — Navigation entre vues par glissement sur iOS et Android

**Objectif :** permettre un changement de vue par geste horizontal sur les appareils natifs sans gêner le défilement, les champs ou les sélecteurs.

### Étapes à réaliser

- [ ] **3.1 — Définir le parcours :** choisir les vues de premier niveau concernées, leur ordre, le sens gauche/droite, le comportement aux extrémités et la relation avec le bouton retour système. Ne pas supposer que chaque sous-vue ou fiche doit être incluse.
- [ ] **3.2 — Vérifier la disponibilité des plateformes :** créer et configurer la cible iOS sur macOS/Xcode avant de promettre un comportement iOS ; documenter les blocages tant qu'aucun environnement/appareil ne permet la validation.
- [ ] **3.3 — Implémenter un geste borné :** activer uniquement sur les plateformes natives et les zones retenues ; distinguer un déplacement horizontal d'un scroll vertical ; ignorer les formulaires, la sélection de texte, les dialogues, composants horizontaux et interactions tactiles concurrentes.
- [ ] **3.4 — Préserver les comportements existants :** conserver navigation par boutons/hash, historique, lien profond, retour système, focus, accessibilité et `prefers-reduced-motion`. Ne pas ajouter de plugin si une implémentation existante suffit.
- [ ] **3.5 — Valider sur appareils réels :** effectuer des essais Android et iOS, pas seulement une simulation navigateur, puis documenter modèles, versions et limites.

**Critères de sortie :**

- Le geste aboutit uniquement à une destination prévue et ne saute aucune vue.
- Un mouvement vertical, un geste commencé dans un champ ou un contrôle horizontal ne change pas de vue.
- Le retour système, les boutons de navigation, l'historique et les URL/hash restent cohérents.
- Aucune navigation involontaire n'est observée pendant un scroll ou une saisie ; le geste respecte les réglages de mouvement réduit.
- Les résultats sont validés sur au moins un appareil Android et un appareil iOS ; sinon, la partie non testée reste explicitement bloquée et non cochée.

**Tests et preuves à fournir :** tests unitaires du détecteur de geste et de ses seuils, tests navigateur/tactiles pour les exclusions, build Capacitor, essais manuels sur appareils physiques, tests d'accessibilité et de navigation retour. Aucun build Web seul ne valide iOS.

---

## Chantier 4 — Simplifier et fiabiliser l'indexation des fichiers autorisés

**Objectif :** réduire les sélections répétitives en évaluant un parcours de scan d'un périmètre explicitement autorisé, sans prétendre accéder à tous les fichiers du téléphone ou du cloud.

### Étapes à réaliser

- [ ] **4.1 — Établir la matrice réelle :** inventorier les formats analysables, les limites par parseur, les points d'entrée et les APIs disponibles sur Web, Android et iOS. Expliquer les différences constatées entre sélection de fichiers, sélection de dossier et répertoire Documents de l'application.
- [ ] **4.2 — Étudier les permissions et les sélecteurs officiels :** pour chaque plateforme, préciser si l'utilisateur peut accorder un accès à un dossier, si cet accès persiste, comment il est révoqué et quelles limites s'appliquent aux fichiers distants. Vérifier les règles officielles au moment de la mission. Ne pas demander un accès global au stockage.
- [ ] **4.3 — Soumettre un choix produit avant l'implémentation :** comparer sélection multiple, dossier choisi explicitement, dossiers favoris et scan récurrent explicitement activé. Présenter les données lues, la portée, la fréquence, l'espace indexé, les coûts/ressources, l'arrêt et la révocation. Demander une décision si le périmètre d'accès s'élargit.
- [ ] **4.4 — Concevoir le parcours autorisé :** afficher le périmètre avant scan, permettre d'exclure des sous-dossiers/formats, montrer la progression réelle, pause/annulation, erreurs, éléments ignorés et reprise. Ne rien indexer avant confirmation de la portée.
- [ ] **4.5 — Implémenter par plateforme validée :** parcourir seulement le dossier ou la source accordé ; traiter les fichiers pris en charge ; conserver provenance et couverture ; réagir correctement à la perte d'accès ou au fichier déplacé.
- [ ] **4.6 — Protéger le cycle de vie :** vérifier ce qui est copié dans Famili-IA, où les extraits/index sont conservés, comment réindexer et supprimer les copies applicatives sans supprimer les originaux. Ne pas synchroniser le contenu vers un fournisseur par défaut.

**Critères de sortie :**

- « Tous les fichiers pris en charge » signifie tous les fichiers admissibles **dans le périmètre choisi et accessible**, jamais l'ensemble du stockage sans restriction.
- Refus, annulation, autorisation partielle, révocation et source inaccessible ne sont ni présentés comme une indexation complète ni traités comme un succès.
- Les formats non supportés, fichiers corrompus, fichiers volumineux et erreurs sont signalés ; les compteurs distinguent découverts, indexés, ignorés et échoués.
- Aucun original n'est déplacé ou supprimé. L'utilisateur peut arrêter le scan et retirer l'index/copie Famili-IA selon les mécanismes existants.
- Les sélecteurs, filtres de formats et indicateurs de couverture reflètent les capacités réellement testées sur la plateforme.

**Tests et preuves à fournir :** fixtures synthétiques par type de fichier ; tests unitaires des formats et du scan borné ; tests d'intégration permission accordée/refusée/révoquée, reprise, doublons et fichiers illisibles ; essais sur appareils Android/iOS requis avant de cocher leur plateforme. Un test simulé ne prouve pas l'accès à une bibliothèque réelle.

**Décision bloquante :** aucune permission globale, surveillance en arrière-plan ou indexation automatique récurrente ne sera activée par défaut. Toute évolution de ce type exige une mission et une décision explicites sur les permissions, la fréquence et les données conservées.

---

## Chantier 5 — Gestion et partage des alertes familiales

**Objectif :** clarifier qui voit et gère une alerte, puis permettre un partage réel uniquement après décision sur l'identité, les autorisations et le transport. Aujourd'hui, la persistance familiale est locale et aucun partage inter-comptes/appareils n'est établi.

### Étapes à réaliser

- [ ] **5.1 — Cartographier l'existant :** documenter sources d'une alerte, preuve, échéance, statut, report, notifications et association à un membre ; distinguer les alertes locales des notifications réellement envoyées.
- [ ] **5.2 — Définir les scénarios :** traiter séparément plusieurs membres utilisant un même appareil et plusieurs comptes/appareils. Définir qui peut créer, consulter, corriger, reporter, acquitter ou supprimer une alerte.
- [ ] **5.3 — Décider les données partagées :** choisir explicitement si le partage porte uniquement sur un résumé d'alerte, sa date et son statut, ou aussi sur une preuve/extrait/document. Définir consentement, destinataires, révocation, rétention, historique et comportement hors ligne.
- [ ] **5.4 — Étudier identité et architecture :** examiner les besoins de compte, d'appartenance au foyer, d'autorisations, de synchronisation, de chiffrement, de conflits, de révocation et de notifications. Préparer les risques et alternatives sans introduire de backend ou d'autorisation dans ce cadrage.
- [ ] **5.5 — Obtenir une décision utilisateur avant développement :** valider le scénario retenu, les rôles et les données transférées. Si l'architecture change authentification, chiffrement, synchronisation ou permissions, obtenir une mission dédiée.
- [ ] **5.6 — Implémenter et vérifier le périmètre approuvé :** ajouter le parcours complet, ses états d'erreur, la réconciliation des modifications et la désactivation ; maintenir l'alerte locale comme comportement explicite en l'absence de partage.

**Critères de sortie :**

- L'interface dit clairement si une alerte est locale, partagée, en attente ou non synchronisée ; aucun partage n'est inféré d'une fiche familiale locale.
- Chaque membre n'accède qu'aux actions autorisées ; les changements, reports, corrections, conflits et suppressions sont cohérents entre appareils autorisés.
- Le retrait d'un membre ou la révocation bloque tout nouvel accès sans supprimer les originaux ; la propagation des suppressions et la conservation des traces sont documentées.
- Une erreur réseau, un conflit hors ligne ou une permission expirée n'efface pas un choix utilisateur ni ne crée de fausse confirmation.
- Aucune action, notification système ou échéance nouvelle n'est déclenchée par le modèle seul.

**Tests et preuves à fournir :** tests unitaires des rôles et transitions de statut, tests d'intégration multi-profils synthétiques, scénarios hors ligne/conflits/révocation, contrôle des données transférées, tests UI et revue sécurité/confidentialité adaptée. Si aucun backend ou second appareil réel n'est disponible, le partage reste non validé.

---

## Chantier 6 — Définir puis mettre en place le modèle de monétisation

**Objectif :** choisir une offre durable à partir de la valeur utilisateur et des coûts réels ; ne pas ajouter un prix, un paywall ou des achats avant décision.

### Étapes à réaliser

- [ ] **6.1 — Recueillir les usages et la valeur :** préparer un pilote sans paiement, des scénarios synthétiques et un questionnaire de retour ; identifier les usages indispensables, récurrents et coûteux. Ne pas annoncer comme disponibles les fonctions expérimentales ou prévues.
- [ ] **6.2 — Définir les principes gratuits/payants :** proposer une matrice d'offres et la faire décider. Préserver l'accès aux données, aux preuves essentielles, à l'export et à la suppression, y compris après expiration ou résiliation ; ne pas vendre les données personnelles.
- [ ] **6.3 — Estimer les coûts :** distinguer coûts locaux, stockage, sauvegarde/synchronisation, notifications, support, paiements et services tiers ; établir les hypothèses, fourchettes et coûts par utilisateur/offre.
- [ ] **6.4 — Choisir les canaux et le modèle d'achat :** comparer Web, Google Play et App Store selon les règles officielles en vigueur, frais, taxes, annulation, remboursements, restauration, support et nécessité d'un backend. Ne pas présumer un fournisseur ou un prix.
- [ ] **6.5 — Décider offre, prix et entitlements :** définir identifiants de droits indépendants de l'UI, usage hors ligne, transition d'offre, partage de foyer et expiration ; obtenir une décision produit et les validations réglementaires nécessaires.
- [ ] **6.6 — Implémenter les achats seulement après approbation :** vérifier les transactions côté serveur si l'architecture l'exige, garder les secrets hors client, traiter achat/restauration/annulation/échec/remboursement/expiration et fournir un accès clair à la résiliation.

**Critères de sortie :**

- Les offres et les prix sont approuvés et cohérents avec des coûts documentés, pas déduits d'une ancienne hypothèse.
- Les règles et obligations de chaque boutique sont vérifiées dans leur documentation officielle au moment du choix.
- Aucun secret de facturation n'est dans le client ou le dépôt ; les droits ne reposent pas uniquement sur une préférence locale falsifiable.
- Expiration, remboursement, perte de réseau ou changement d'offre ne bloquent jamais l'accès aux données personnelles, à leur export ou à leur suppression.
- L'achat, la restauration, l'annulation, l'expiration et l'erreur sont éprouvés en environnement de test des boutiques avant toute vente réelle.

**Tests et preuves à fournir :** tests unitaires des transitions d'entitlement, scénarios de facturation sandbox par canal retenu, tests UI de gestion/résiliation, vérification des données et permissions transférées, estimation de coûts vérifiable et revue légale/confidentialité avant commercialisation.

---

## Chantier 7 — Validation transversale et décision de livraison

- [ ] **7.1 — Consolider la matrice capacité/source/plateforme :** marquer disponible, expérimental, simulé, bloqué ou absent ; préciser accès, couverture, tests et limites.
- [ ] **7.2 — Valider les builds et appareils concernés :** Web, Android et iOS uniquement lorsque chaque cible est construite, installée et testée ; conserver les clés de signature hors dépôt.
- [ ] **7.3 — Rejouer les tests ciblés et les tests de non-régression :** utiliser les commandes du projet et ajouter les suites globales seulement quand l'étendue le justifie ; consigner les appareils, versions, résultats et limites.
- [ ] **7.4 — Réaliser les revues sécurité/confidentialité et accessibilité :** vérifier les flux de données, permissions, erreurs, révocation, données familiales, exports/suppressions, lecteurs d'écran, contrastes et navigation tactile selon les lots.
- [ ] **7.5 — Prendre une décision Go/No-Go :** livrer seulement les fonctions validées sur les plateformes annoncées ; garder expérimental ou reporter tout critère incomplet.

**Critères de sortie :** aucun connecteur, partage, traitement de modèle, permission, achat ou comportement mobile n'est annoncé au-delà des preuves disponibles ; les résultats et risques résiduels sont publiés dans la documentation utilisateur et technique.

**Tests et preuves à fournir :** commandes exactes exécutées, résultats bruts utiles, rapport de revue, builds associés à leurs empreintes, tests réels autorisés et liste explicite des validations non réalisées.

---

## Backlog à requalifier après les six chantiers prioritaires

Les éléments ci-dessous restent ouverts dans l'archive et ne sont ni annulés ni déclarés réalisés par ce plan. Leur priorité et leurs critères devront être réévalués après les chantiers ci-dessus :

- [ ] Terminer les connecteurs et validations réelles des sources (Drive, OneDrive, Dropbox, Photos/iCloud) sans confondre tests simulés et accès fournisseur.
- [ ] Décider séparément de la synchronisation multi-appareils et des services d'arrière-plan ; cadrer révocation, chiffrement et conflits.
- [ ] Évaluer la recherche sémantique/EmbeddingGemma et toute approche RAG sur corpus indépendant avant intégration.
- [ ] Étudier séparément la vision photo et toute identification biométrique ; aucun traitement facial n'est autorisé par cette ligne de backlog.
- [ ] Terminer les préparatifs de bêta et de distribution, dont une cible iOS, support, confidentialité et procédures de mise à jour/retour arrière.

## Rapport de lot obligatoire

Pour chaque lot, le compte rendu doit indiquer : identifiant et périmètre, état Git initial, fichiers modifiés, décisions et blocages, critères vérifiés/partiels/non vérifiés, commandes réellement exécutées avec résultats exacts, vérifications non faites, risques résiduels et changements préexistants préservés. Une synthèse Cline ne remplace ni les tests, ni l'examen du diff, ni une revue indépendante lorsqu'elle est requise.
