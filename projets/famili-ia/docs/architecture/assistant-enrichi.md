# Assistant enrichi — conception initiale

**Date : 18 novembre 2026. Statut : A1, A2.1 et A4 local livrés ; A2.2 comparaisons de modèles différées.**

Référence opérationnelle : [chantier du plan actif](../../DEVELOPPEMENT_PLAN.md#chantier-à-concevoir--assistant-enrichi). Ce document décrit l'architecture cible et les premières tranches ; il ne remplace pas le calendrier du plan.

## 1. Décisions et limites de cette étape

- **Orientation choisie avec l'utilisateur : étudier une option hybride**, locale par défaut et distante facultative avec autorisation explicite. Ce choix autorise l'étude, pas un envoi de documents ni une activation de fournisseur.
- Recherche locale essentielle reste la porte d'exploration gratuite et utile. L'Assistant prépare une réponse, une comparaison ou une action à partir des mêmes sources, sans catalogue ni classement concurrent.
- Tranche A1 livrée : préparer localement un contexte de réponse justifiable depuis l'index partagé. Aucun modèle, téléchargement de poids, serveur, paiement ou nouvelle permission dans cette tranche.
- Première version enrichie documentaire ; pas de reconnaissance faciale, d'analyse visuelle, d'envoi de message ni de modification d'original. Les photos restent explorables par leurs métadonnées et annotations dans Recherche ; un texte OCR déjà extrait et vérifié reste lisible comme texte, sans nouvelle lecture des pixels.
- Modèle, fournisseur, hébergement, identité serveur et politique de conservation distante restent à choisir après évaluation. Ni un tarif d'abonnement ni une couverture de tous les appareils ne sont décidés.

**Cadrage initial :** examen du socle, flux cible, contrats proposés, comparaison documentaire des options, exemple de coût et critères de passage. La section A1 ci-dessous décrit désormais le code livré. Aucune mesure de qualité d'un LLM ou de performance sur téléphone n'a été effectuée.

## 2. Socle vérifié et points de raccordement

| Existant | Réutilisation et limite |
| --- | --- |
| [IndexSession](../../index-session.js) : `search`, `getAllRecords`, `getAllContentDocs`, `restoreDocumentContent`, `syncDocuments` | Recherche et Assistant doivent recevoir la même instance. La créer une seconde fois dans l'Assistant produirait un état de confiance indépendant. |
| [Provenance du contenu](../../content-index.js) | Les segments restaurés sont vérifiés par empreinte et identité. Une provenance invalide n'autorise pas de réponse sur le contenu ; un document historique sans provenance n'est pas assimilé à un texte vérifié. |
| [Recherche textuelle](../../content-search.js) et [fiches d'index](modele-index.md) | Les raisons comprennent des extraits, mais une fenêtre lexicale peut couper une clause. Utiliser les segments vérifiés pour fournir le contexte nécessaire, pas seulement la petite vignette d'extrait. |
| [Interprétation unifiée](../../unified-index-query.js) | Elle interprète notamment les intentions photo. Une question documentaire non photo revient aujourd'hui comme mots-clés ; ce n'est pas un interpréteur général de conversation. |
| [États des sources](../../source-status.js), `getSourceStatuses()` dans [app.js](../../app.js) | Couverture locale, périmètre parcouru et accès à l'original sont distincts. Un parcours récent ne garantit pas une copie à jour. |
| [Propositions d'échéances](../../index-deadline-search.js) et parcours de confirmation dans [app.js](../../app.js) | Réutiliser date, preuve, caractère estimé et règles existantes. La validation UI est actuellement imbriquée dans le rendu Recherche : l'extraire à terme, ne pas la dupliquer dans le chat. |
| Confirmation dans [state.js](../../state.js) | `confirmDocumentDeadline()` est l'opération A4 commune à Recherche/Assistant, avec identité complète et transaction document/alerte. `confirmDocumentAlert(documentId)` reste l'entrée historique des corrections manuelles. Les deux refusent une copie absente ou ambiguë. |
| Assistant actuel dans [app.js](../../app.js) | Utilise `prepareAssistantContext` pour les fichiers personnels et `buildSearchResponse` pour la réponse déterministe. `rankDocuments` est limité aux exemples de repli, sans fichier chargé. Questions indépendantes et historique de page, sans synthèse générative. |

L'identité documentaire est `(sourceId, accountRef, itemId)`, jamais le nom ni `itemId` seul. L'empreinte de compte reste une donnée pseudonymisée, pas anonyme.

**Baseline exécutée le 18 novembre :** 33 tests réussis, sans appel fournisseur, avec :

```powershell
node --test tests\index-session.test.js tests\content-index.test.js tests\index-deadline-search.test.js tests\source-status.test.js
```

Cette baseline vérifie le socle existant, pas encore l'Assistant enrichi. L'ancien [audit de phase 15](phase-15-intelligence-audit.md) reste un historique ; ses premières observations ne décrivent pas toutes l'application actuelle.

### A1 livré — contexte partagé et preuves

[assistant-context.js](../../assistant-context.js) reçoit l'instance `IndexSession` existante. `prepareAssistantContext` synchronise **l'instantané complet** des documents, puis appelle `session.search` sans modifier le rendu de Recherche, écrire dans le stockage ou relire une source. Ne pas lui passer une collection préfiltrée : les filtres sont un paramètre distinct, sinon la synchronisation retirerait les autres documents de l'index partagé.

L'interprétation réutilise les intentions, termes de sujet et synonymes locaux de [search-utils.js](../../search-utils.js). Elle conserve les variantes dans `queries`, bornées à 32 combinaisons ; un sujet manquant ou trop de variantes demandent une reformulation plutôt que supprimer silencieusement des critères. « Renouvelle/renouveler » est traité comme un verbe de question de date. Cela reste une interprétation déterministe limitée, pas une compréhension générale.

Le contexte effectivement retourné comprend `status`, `intent`, `query`, `queries`, `scope` et `matches`. `scope` porte la révision volatile du corpus, les filtres et les états de sources ; les correspondances gardent le triplet documentaire, les segments vérifiés, l'empreinte persistée si disponible, l'instantané utilisé, le fait littéral et sa preuve. Les statuts sont `ready`, `clarification`, `no-evidence` et `stale` ; les erreurs techniques sont levées puis annoncées par l'interface en conservant la question. Le contrat de génération proposé plus loin n'est pas encore implémenté.

Les photos sans segments vérifiés et les exemples sont exclus des réponses personnelles. Le texte OCR déjà fourni par un lecteur et vérifié dans l'index reste admissible pour préserver les capacités documentaires existantes ; A1 ne lance aucune analyse d'image. Les fiches documentaires en métadonnées seules peuvent indiquer une source, mais ni leur texte historique ni leurs faits extraits non restaurés ne deviennent une preuve. Les corrections et contenus altérés continuent à suivre les règles existantes de l'index. Le fait retenu vient des lignes complètes des segments vérifiés, pas d'une fenêtre lexicale tronquée. Une copie non vérifiée reste consultable comme copie, avec avertissement, sans servir de réponse factuelle.

Les résultats ne font pas l'objet d'un second score de classement : l'Assistant cherche le fait demandé parmi les candidats de l'index. Des faits littéraux différents déclenchent une abstention ; les deux sources affichées montrent alors deux faits différents, même si d'autres copies répètent le premier. Une identité complète correspondant à plusieurs copies est refusée.

`IndexSession.getRevision()` change lors d'une modification des fiches ou segments actifs, mais reste stable pour une synchronisation identique. Ce compteur n'est ni persistant, ni une date de lecture, ni une preuve d'accès à l'original. Les réponses affichées gardent cette révision et sont invalidées à l'actualisation du corpus, à l'entrée de l'Assistant et à la soumission ; l'ouverture d'une copie contrôle aussi identité complète, contenu et provenance. Une purge retire les preuves avant son rechargement automatique. Les exemples précédemment affichés sont invalidés si des fichiers sont ajoutés.

Le sujet et le périmètre documentaires sont visibles. Les filtres de Recherche ne sont pas repris implicitement : l'Assistant n'a pas encore de sélecteur de filtres et ne change ni question ni résultats de l'autre vue. Le module accepte les mêmes filtres explicites que l'index pour ses appelants et ses tests.

**Validation A1 :** 53 tests Node ciblés passent (socle, qualité documentaire, résultats et corpus multi-sources), ainsi que 12 scénarios navigateur et le build de production. Les six nouveaux tests Node couvrent les annotations existantes montant/date/durée/fréquence/référence selon les cas disponibles, synonymes et fautes, filtres, contenu non vérifié, comptes distincts, ambiguïtés, altérations, retraits et clauses longues. Les cas de référence explicites ajoutés aux étapes suivantes restent à annoter ; ces tests ne remplacent pas le corpus génératif de 24 scénarios.

Les nouveaux parcours navigateur vérifient le refus d'une preuve altérée, l'indépendance des filtres et la suppression des preuves avant rechargement. Les scénarios existants vérifient notamment quatre largeurs, focus, consultation sans écriture, incertitude et reprise sur erreur. Contrôle visuel mobile effectué avec une pièce synthétique dans un contexte isolé ; aucune donnée de la page utilisateur partagée n'a été modifiée.

**Micro-mesure indicative :** 1 000 documents synthétiques déjà en mémoire, chacun avec un nom et une ligne de montant, une requête ciblant un équipement, 20 exécutions après une préparation initiale : médiane 81,96 ms, p95 90,80 ms, sous le budget proposé de 300 ms pour ce seul essai. Mesure Node sur ce poste, pas sur téléphone ni avec de longs PDF ; elle ne valide pas mémoire maximale, batterie, latence à froid ou génération.

## 3. Flux cible

```text
Question et périmètre choisis
  -> interprétation de l'intention et des références
  -> clarification si sujet ou pièce ambigu
  -> recherche dans l'instance partagée de l'index
  -> sélection locale des éléments et segments vérifiés
  -> réponse locale déterministe
     OU modèle local disponible, choisi explicitement
     OU aperçu des données + accord pour un traitement distant
  -> contrôle de structure, citations et révision des sources
  -> réponse : faits / comparaison / inconnues / sources
  -> éventuelle proposition d'action
  -> nouvelle validation de la preuve et confirmation utilisateur
  -> écriture contrôlée et résultat explicite
  -> suivi uniquement selon une règle séparément activée
```

Un échec de modèle ne doit pas être caché par une réponse de repli présentée comme une synthèse réussie. Proposer explicitement de consulter les résultats locaux ; ne pas basculer du local vers le distant silencieusement.

### Scénario de référence

L'utilisateur choisit une facture et une garantie présentes dans Famili-IA puis demande : « Compare ces deux pièces pour la garantie de cet équipement. »

1. Afficher les deux pièces retenues et le périmètre ; demander confirmation du sujet si plusieurs équipements correspondent.
2. Distinguer une fin de garantie écrite d'une estimation fondée sur une date d'achat et une durée. Pour une estimation, citer les deux preuves et nommer le calcul.
3. Si les pièces divergent, afficher la divergence sans inventer une priorité juridique ou contractuelle.
4. Proposer un rappel seulement si la date, la catégorie et les règles de création prises en charge le permettent.
5. Présenter preuve, date et portée locale avant confirmation ; une simple question ne crée rien.
6. Après sauvegarde, afficher le résultat réel. Le suivi des nouvelles pièces nécessite une activation supplémentaire.

Ce scénario est la cible des tranches successives, pas une capacité du moteur actuel.

## 4. Contexte partagé et réponses traçables

### Préparer le contexte, sans second moteur

L'adaptateur A1 est une fonction de préparation recevant l'instance `IndexSession`, les documents courants, la question et les filtres choisis. Les états des sources complètent le contexte après synchronisation. L'instance n'est pas exportée comme une globale à partir du démarrage de l'application ; elle est passée au code réutilisable.

- Réutiliser les règles existantes de normalisation et d'intention lorsqu'elles conviennent. Un petit planificateur documentaire doit séparer sujet, intention et filtres, sans créer un nouveau classement.
- Ne pas appeler simplement `session.search(questionComplete)` : les mots d'une question et ceux d'une clause ne sont pas nécessairement les mêmes.
- Montrer le sujet et les filtres retenus. Ne pas supprimer un filtre pour obtenir artificiellement des résultats ; demander une précision si nécessaire.
- Réserver les faits contractuels aux passages vérifiés. Les métadonnées peuvent répondre sur un nom ou une source, mais ne prouvent pas une garantie.
- Respecter les corrections utilisateur et les estimations. Une preuve littérale établit que le texte est présent dans une copie, pas qu'il est vrai ni encore applicable.
- Ne pas enrichir silencieusement le contexte par un téléchargement d'original ou une lecture de compte cloud.

Conserver les exemples de démonstration à part du contexte personnel. Le remplacement du parcours actuel dépend de la non-régression sur ses intentions montant/date/référence ; ne pas imposer une simple recherche lexicale plus limitée au nom de l'unification.

### Contrat de préparation proposé, non encore implémenté

| Champ | Sens attendu |
| --- | --- |
| `status` | `ready`, `clarification`, `no-evidence`, `stale` ou `error`. `ready` signifie « contexte prêt », pas « réponse correcte ». |
| `scope` | Révision du corpus, filtres effectifs et limites de couverture. Pas de date de contrôle inventée. |
| `evidence[]` | Identifiant local de preuve, triplet documentaire, révision du contenu, passage exact, localisation connue ou `null`, provenance et caractère estimé. |
| `clarification` | Motif et choix possibles lorsqu'un sujet ou une référence ne peut être résolu ; pas de choix arbitraire. |

Pour les contenus persistés, utiliser la provenance vérifiée existante pour détecter les changements. Pour les segments fiables seulement dans la session, conserver une révision volatile propre à la requête ; ne pas fabriquer de preuve durable.

Le résultat du modèle devra séparer des affirmations avec références à ces preuves, les points manquants et les éventuelles propositions. Les identifiants de preuve retournés doivent appartenir au contexte fourni. Une référence inexistante, une structure invalide ou une révision dépassée bloque la réponse concernée.

Les passages documentaires, même formulés comme des instructions système, restent des données non fiables. Le modèle ne dispose ni d'outil d'écriture ni d'accès autonome aux sources ou au réseau. L'application contrôle les types d'action et leurs paramètres ; une URL générée ne remplace jamais le mécanisme existant d'ouverture de l'original. Les réponses sont rendues comme texte, sans exécution de HTML ou de code produit par le modèle.

**Limite importante :** vérifier qu'une citation existe ne prouve pas qu'elle implique l'affirmation générée. La fidélité sémantique exige une évaluation indépendante ; ne jamais annoncer « zéro hallucination » sur la seule validation du JSON.

### Contexte de conversation et invalidation

- Première étape sans mémoire nouvelle : chaque question reste indépendante.
- Étape contextuelle ultérieure : garder en mémoire de session les références choisies et le dernier sujet confirmé, pas un profil familial déduit. « Et pour l'autre ? » doit provoquer une clarification si plusieurs pièces conviennent.
- Au départ, aucun historique de conversation persistant ni synchronisé. Un historique durable demanderait un choix produit distinct, avec export et suppression.
- Introduire une révision de corpus et un mécanisme d'annulation. Suppression, changement de contenu ou de consentement pertinent invalident le travail en cours et les passages dérivés concernés, y compris dans l'affichage.
- Une réponse tardive d'une requête annulée ne doit pas réafficher un texte supprimé. Les preuves et références de contexte invalides doivent être retirées ou remplacées par un état explicite.
- Une déconnexion fournisseur n'efface pas automatiquement les copies locales déjà conservées. Actualiser le statut d'accès à l'original et respecter les règles locales existantes ; ne pas confondre révocation, suppression et fraîcheur.

## 5. Option hybride : frontières de données

### Local par défaut

La recherche et la préparation des preuves restent locales. Un modèle local est un composant supplémentaire, pas un synonyme de l'index existant. Son installation nécessiterait un choix explicite : taille du téléchargement mesurée, compatibilité, espace requis, progression réelle et suppression des poids.

Un appareil incompatible garde les fonctions locales existantes. Ne pas télécharger un modèle sur réseau mobile sans choix clair, ni promettre le hors ligne intégral de l'application simplement parce que l'inférence peut être locale.

### Distant facultatif — conception proposée

Avant le premier envoi de chaque requête distante, présenter fournisseur, objectif, question, pièces et extraits exacts sélectionnés, puis demander une autorisation explicite. Ce consentement est distinct de la connexion Drive/OneDrive/Dropbox, du GPS et d'un éventuel abonnement.

Le paquet sera borné au nécessaire : question et extraits retenus, avec identifiants éphémères tels que « Pièce 1 ». Ne pas transmettre de jeton OAuth, empreinte de compte, URL d'original, chemin local, photo, GPS ou historique familial complet. Un extrait et la question peuvent néanmoins contenir des données personnelles : ce n'est pas une anonymisation garantie.

Architecture distante à étudier :

```text
Appareil : recherche + choix des preuves + accord
  -> passerelle applicative authentifiée, chiffrée en transit
  -> API de modèle sélectionnée, sans outil d'action
  -> validation locale des références et de la révision
```

La passerelle n'existe pas aujourd'hui. Avant de la livrer : identité de session, isolation des utilisateurs, limites de dépense contrôlées côté serveur, taille et durée maximales, protection contre les doublons, gestion d'erreur et politique de journaux sans contenu documentaire. Aucune clé secrète dans Vite, le navigateur, l'APK ou IndexedDB.

Le serveur et le fournisseur voient les extraits nécessaires pendant le traitement : ne pas appeler ce parcours « documents jamais accessibles au serveur ». Désactiver l'option arrête les futurs envois et annule le travail en cours dans la mesure possible ; cela ne retire pas rétroactivement des données déjà reçues par un fournisseur.

Séparer :

- absence d'entraînement sur les données ;
- conservation des requêtes à des fins d'exploitation ou de sécurité ;
- stockage d'un historique produit ;
- région d'hébergement et transferts ;
- suppression et conditions éventuelles de rétention zéro.

Aucun de ces points ne peut être garanti uniquement par un paramètre envoyé au modèle.

### Comparaison documentaire initiale

Sources officielles consultées le 18 novembre 2026 ; pas d'essai d'inférence et aucun fournisseur retenu.

| Option | Intérêt | Contraintes et décision encore nécessaire |
| --- | --- | --- |
| WebLLM dans un worker | Inférence navigateur avec accélération WebGPU ; évite d'envoyer les preuves à une API de génération. | Vérifier WebGPU dans chaque navigateur/WebView cible, modèle et licence, téléchargement/cache, mémoire, batterie et annulation. Aucun engagement Android/iOS fondé sur la seule compatibilité d'un navigateur de bureau. |
| Runtime natif tel que llama.cpp | Exemple Android officiel ; possibilité d'intégrer le traitement local en dehors de la WebView. | Pont Capacitor à concevoir et maintenir ; modèle, stockage, limites mémoire et thermique à mesurer. La cible iOS et son intégration restent à étudier séparément. |
| API OpenAI derrière la passerelle | Référence possible pour comparer la qualité documentaire et chiffrer une requête bornée. | Documentation : données API non utilisées pour l'entraînement par défaut ; journaux de contrôle généralement jusqu'à 30 jours avec exceptions décrites. Rétention zéro soumise à éligibilité/approbation et limitations d'endpoints. |
| API Mistral derrière la passerelle | Autre candidat à comparer sur le même corpus francophone ; ne pas confondre API et produit de chat. | Documentation ZDR : requête à faire approuver, plans payants et appels sans état pris en charge ; fichiers, conversations et autres services avec état exclus. Vérifier séparément entraînement, contrat, région et tarif de l'offre retenue. |

La rétention zéro n'est considérée comme acquise pour aucun candidat. Éviter au premier prototype distant les fichiers importés chez le fournisseur, bases vectorielles hébergées, agents et conversations hébergées : ils ne sont pas nécessaires pour une requête bornée et ajoutent des règles de conservation.

## 6. Actions et suivi : réutiliser sans donner les commandes au modèle

Une sortie de modèle n'est jamais une autorisation d'écriture. Le premier type d'action envisagé est une confirmation d'échéance déjà admissible selon le moteur existant.

Avant confirmation, le code applicatif doit revalider :

1. triplet exact et copie persistée unique ;
2. révision et preuve toujours présentes dans le contenu vérifié ;
3. date valide, distinction date écrite/estimation et catégorie prise en charge ;
4. règles d'admissibilité courantes et éventuelle alerte déjà créée ;
5. aperçu du résultat et portée locale, puis confirmation explicite.

### A4 local livré — propositions et confirmations communes

[document-alert-action.js](../../document-alert-action.js) prépare une proposition en lecture seule depuis la copie persistée et les segments de l'index commun. Les règles de [index-deadline-search.js](../../index-deadline-search.js) sont partagées avec la revalidation, sans seconde instance d'index. Date, preuve littérale, estimation et catégorie sont contrôlées ; les seuils existants restent inchangés.

Recherche et Assistant utilisent le même rendu d'action et la même confirmation native. Dans l'Assistant, seule une réponse avec une unique source vérifiée non ambiguë peut proposer une échéance admissible ; l'incertitude de la réponse reste affichée. La date proposée et sa preuve sont distinctes de la réponse ; une estimation montre les deux lignes achat/durée. Les exemples fictifs n'offrent aucune création d'alerte. La lecture et l'annulation ne modifient rien.

`confirmDocumentDeadline()` sérialise l'opération avec les mutations documentaires existantes. Elle contrôle le triplet, les instantanés de source et de choix d'échéance, restaure la provenance et recalcule la proposition avant écriture. Elle préserve statut, report et notifications déjà envoyées pour une même date. `sourceAccountRef` conserve la référence complète du compte, y compris Dropbox ; une modification ultérieure déclenche la revue de source. L'estimation reste identifiée dans le document et la vue Alertes.

`putConfirmedDocumentAlert()` prépare le stockage avant une transaction IndexedDB unique sur `documents` et `alerts`, avec comparaison de l'état persistant avant et pendant l'écriture. La confirmation n'est publiée en mémoire qu'après `transaction.oncomplete`. Un abandon après les requêtes d'écriture annule les deux enregistrements ; une suppression ou modification concurrente bloque l'opération au lieu de recréer la copie. Une confirmation répétée rend l'alerte existante sans écrire, après contrôle de sa présence persistante. L'erreur reste visible et permet de réessayer ; un échec d'actualisation de l'affichage après sauvegarde annonce que le rappel est déjà enregistré.

**Validation A4 :** 30 tests Node ciblés et 42 scénarios navigateur (15 Assistant, 13 Recherche, 14 Alertes), build réussi. Les nouveaux cas couvrent dates écrites/estimées, preuve modifiée ou hors segments, compte différent, consultation/annulation sans écriture, confirmations concurrentes, préservation des choix, abandon après écritures avant commit, reprise et suppression entre lecture et transaction. Les tests utilisent uniquement des pièces fictives dans des contextes isolés ; la page utilisateur partagée n'a pas été modifiée. Les fixtures Assistant/Alertes résolvent l'import d'état depuis l'entrée réellement servie : importer `/state.js` sans le paramètre de version Vite pouvait créer une seconde instance vide et invalider le test.

Les corrections manuelles historiques conservent leur parcours séparé ; la transaction A4 concerne la confirmation d'une proposition dans Recherche/Assistant. Ce chantier ne désactive pas les alertes existantes, ne demande aucune permission de notification et n'envoie pas de notification immédiatement. Il ne propose pas de rappels arbitraires hors catégories/seuils et ne livre ni génération ni suivi proactif.

### Suivi proactif par paliers

- D'abord réévaluation locale lors d'un import ou d'un contrôle réellement effectué, application ouverte, avec activation d'une règle par l'utilisateur.
- Montrer ce qui a changé, la preuve et la dernière exécution réelle. Une nouvelle date divergente propose une revue, pas une modification silencieuse d'un rappel confirmé.
- Prévoir pause, désactivation, erreurs et absence de contrôle ; pas d'animation ou de date « dernier contrôle » simulée.
- Pour fonctionner application fermée, étudier séparément tâches/notifications natives et éventuel service serveur. Le contrôle périodique actuel de la page ne suffit pas.
- Ne pas envoyer un document en arrière-plan à une IA externe sous prétexte qu'une règle locale a été activée.

## 7. Coûts : première enveloppe, pas tarif commercial

Le traitement local n'a pas de coût de jeton API, mais a des coûts de développement, distribution des poids, stockage et énergie. Aucun chiffre fiable de mémoire/latence n'est retenu sans modèle choisi et mesure sur appareil.

**Exemple chiffré uniquement pour dimensionner l'option distante :** le tarif standard publié pour `gpt-4.1-mini`, consulté le 18 novembre, est de 0,40 USD par million de jetons d'entrée et 1,60 USD par million de jetons de sortie. Ce modèle est un point de calcul, pas un choix ni une garantie de disponibilité future.

Hypothèses de travail : une requête totalise 4 000 jetons d'entrée (consignes, question et preuves comprises) et 600 de sortie ; sans cache, outil, fichier hébergé ou remise de traitement différé.

```text
Coût = entrée / 1 000 000 × prix_entrée
     + sortie / 1 000 000 × prix_sortie

Exemple : 0,00160 + 0,00096 = 0,00256 USD par requête.
```

| Volume supposé | Génération seule, hors taxes et autres services |
| --- | --- |
| 100 requêtes / mois / utilisateur | 0,256 USD |
| 300 requêtes / mois / utilisateur | 0,768 USD |
| 1 000 requêtes / mois / utilisateur | 2,56 USD |

À 300 requêtes, une réserve purement illustrative de 30 % pour les reprises porte ce poste à environ 1 USD ; elle n'est pas une mesure de taux d'erreur. Ajouter hébergement, authentification, supervision sans contenu, trafic, assistance, taxes, frais de distribution et éventuels autres traitements. Recalculer avec l'usage réel facturé, notamment si un modèle facture du raisonnement supplémentaire.

Pas de rapprochement direct avec le prix historique de 4,99 EUR : devises, taxes, frais et modèle économique ne sont pas fixés. Une limite de dépense serveur et un avertissement explicite sont nécessaires avant une ouverture distante ; ne pas facturer un quota théorique comme si la qualité était validée.

## 8. Évaluation et critères de passage

Le [corpus d'évaluation indépendant](../../tests/fixtures/assistant-evaluation.json) contient des exemples synthétiques annotés à l'avance, références attendues et extraits écrits manuellement. Les bonnes réponses ne sont pas calculées avec le moteur testé. Le jeu existant multi-sources est un socle de non-régression, pas une évaluation suffisante des synthèses.

**A2.1 livré :** corpus, export des seules entrées admissibles, contrat JSON, contrôle des preuves littérales, campagnes importées et relecture motivée liée aux sorties exactes. Le [protocole reproductible](assistant-evaluation.md) décrit commandes, formats, limites et décisions. Aucun modèle installé ou exécuté. Les contrôles unitaires de l'évaluateur ne sont pas une mesure de qualité d'IA.

Premier lot : 24 scénarios annotés, dont **18 cas de génération et 6 intégrations différées à A3/A4**, répartis comme suit.

| Groupe | Cas | Attendu principal |
| --- | --- | --- |
| Lecture documentaire | 6 | Montant, date, référence, négation, information absente, texte non vérifié : réponse sourcée ou abstention. |
| Synthèse | 4 | Deux pièces concordantes, deux dates divergentes, estimation à deux preuves, clause tronquée : ne pas inventer une conclusion. |
| Contexte | 4 | Référence claire, « l'autre » ambigu, changement explicite de sujet, nouvelle session : référence correcte ou clarification. |
| Identité et instructions adverses | 4 | Même identifiant sur deux comptes, preuve falsifiée, instruction malveillante dans une pièce, citation inconnue : isolation et refus de l'action. |
| Consentements et cycle de vie | 4 | Refus distant, retrait pendant requête, suppression pendant génération, erreur réseau : pas d'envoi interdit ni réaffichage d'une pièce supprimée. |
| Actions | 2 | Annulation puis confirmation répétée, écriture partielle : aucune écriture à l'annulation, pas de doublon et erreur/reprise explicites. |

**Conditions bloquantes :**

- zéro appel distant dans tous les cas de refus, mode local ou annulation avant envoi ;
- zéro confusion de compte, écriture sans confirmation ou réaffichage de preuve supprimée dans ces tests ;
- toutes les citations affichées appartiennent à des passages autorisés et encore présents ;
- aucune assertion factuelle non étayée sur le corpus de sortie ; une citation structurellement valide mais hors sujet compte comme un échec ;
- contradictions et absence de preuve des cas annotés donnent une clarification/abstention, pas une conclusion inventée ;
- chaque cas positif annoté reçoit la réponse attendue et la bonne preuve ; une abstention systématique ne satisfait pas le protocole ;
- mêmes résultats de recherche pour une requête et des filtres équivalents entre les deux vues ; toute différence d'interprétation doit être visible, pas un classement secret.

Ces seuils sont des critères sur un corpus borné, pas une garantie universelle. Publier nombres de cas et erreurs, pas seulement un pourcentage.

**Budgets provisoires, à mesurer :** préparation locale p95 inférieure à 300 ms sur un corpus de 1 000 fiches déjà en mémoire ; génération complète p95 inférieure à 15 s pour l'option évaluée, hors installation initiale. En cas d'échec, réduire le périmètre ou ne pas proposer l'option sur l'appareil concerné. Mesurer aussi mémoire maximale, volume téléchargé, batterie et coût par requête ; ces objectifs ne sont pas des résultats acquis.

## 9. Tranches de réalisation proposées

| Tranche | Livrable | Dépendances et sortie |
| --- | --- | --- |
| **A1 — Contexte documentaire partagé — livré** | Adaptateur local en lecture seule : sujet visible, filtres explicites au niveau du module, preuves vérifiées, identités et limites depuis la même instance d'index ; raccordement de l'Assistant personnel et invalidation des réponses. | Sans modèle ni serveur. Parité sur les requêtes/filtres équivalents, absence de preuve, altération, suppression et comptes distincts testés ; Recherche et accès aux données préservés. |
| **A2 — Évaluer la compréhension et la synthèse — A2.1 livré, A2.2 différé** | Corpus annoté et protocole hors ligne livrés. Les essais de modèles restent différés ; ils ne sont pas un préalable aux actions déterministes locales. | Après A1. Licence des poids, capacité réelle des appareils et conditions fournisseur à vérifier pour chaque choix ; aucun téléchargement ni appel payant sans autorisation dédiée. |
| **A3 — Contexte de session et génération contrôlée** | Références de conversation explicites, citations validées, annulation et invalidation ; option distante seulement avec aperçu/accord, passerelle authentifiée et budget serveur. | Après A2 et décisions fournisseur/confidentialité/hébergement. Pas d'historique persistant au premier palier. Sans option disponible, état explicite et accès au parcours local existant. |
| **A4 — Actions confirmées — local livré** | Proposition déterministe et confirmation communes Recherche/Assistant ; preuve et identité revalidées, transaction atomique, concurrence/reprise et absence de doublon testées. | Après A1, sans modèle ni A3. Limité aux échéances déjà admissibles ; futures actions issues d'une génération à concevoir avec A3. |
| **A5 — Suivi local choisi** | Règles explicites lors des imports/contrôles réels, journal minimal sans contenu et propositions de revue. | Après A4. Application ouverte seulement au premier palier ; aucun envoi distant automatique. |
| **A6 — Continuité et offre** | Étude puis validation du fonctionnement en arrière-plan par plateforme, coûts réels et matrice Essentiel/Sérénité. | Après A5 pour le suivi, et après les décisions mobiles/serveur nécessaires. La recherche essentielle, les preuves, l'accès aux données, l'export et la suppression restent accessibles. |

**Ordre retenu : finition transversale du lot D, puis A5.** A2.2 reste différé faute de ressources locales disponibles ; aucun remplacement distant n'est autorisé. Les campagnes exigeront un nouveau choix et une autorisation explicite. Qwen3-1.7B MLC reste une piste documentée, pas un modèle sélectionné : environ 0,97 Go de poids seuls et indication fournisseur d'environ 2 Go de mémoire vidéo. Compatibilité, qualité et performances restent à mesurer. A2.1 n'active aucun fournisseur et ne promet pas une intelligence générative encore non mesurée.

## 10. Sources publiques consultées

Uniquement des documentations publiques ont été consultées ; aucun document utilisateur ni extrait du code du projet n'a été transmis aux services étudiés.

- [WebLLM — documentation officielle](https://webllm.mlc.ai/docs/) : WebGPU, interface de génération et workers.
- [WebLLM — chargement et usage](https://webllm.mlc.ai/docs/user/basic_usage.html) : téléchargement initial, chargement asynchrone et cache.
- [llama.cpp — exemple Android officiel](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md) : intégration native, chargement et génération.
- [OpenAI — contrôles des données API](https://developers.openai.com/api/docs/guides/your-data) : entraînement, rétention, éligibilité et exceptions.
- [OpenAI — prix API](https://developers.openai.com/api/docs/pricing) : tarif standard utilisé pour l'exemple, hors cache et services supplémentaires.
- [OpenAI — sécurité des clés](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety) : clés non déployées dans les clients Web/mobile.
- [Mistral — rétention zéro](https://docs.mistral.ai/admin/monitor-comply/zero-data-retention) : périmètre, exclusions, approbation et distinction avec l'entraînement.

Tarifs, modèles et conditions évoluent : les vérifier à nouveau avant toute décision d'activation. Ce document n'est pas une validation juridique ou contractuelle.
