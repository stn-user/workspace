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

## Hypothèses d'offres retenues pour la suite

Les retours de l'utilisateur sont retenus comme hypothèses produit de travail, à réexaminer ultérieurement et non comme tarifs ou engagements définitivement validés :

- **Essentiel (gratuit)** : import manuel et indexation locale, recherche documentaire réellement utile, fiches et premières échéances, alertes consultables à l'ouverture.
- **Sérénité** : rappels programmés, synchronisation et sauvegarde des données structurées, partage familial des échéances, historique et suivi des garanties/contrats/entretiens, alertes personnalisées.
- **4,99 €/mois** est un prix de test proposé, pas un tarif fixé. Sa viabilité dépendra notamment des coûts de synchronisation, sauvegarde, notifications, assistance et sécurité.

La différenciation doit porter sur la continuité du service et l'aide à agir, pas sur la dégradation artificielle de la recherche gratuite ni sur une promesse d'économies non démontrées.

## Ordre recommandé

1. Fiabiliser les alertes et leur cycle de vie, avec des tests sur dates et preuves.
2. Mesurer puis améliorer la recherche documentaire sans sacrifier sa traçabilité ni son utilité gratuite.
3. Étudier l'accès photo par plateforme et construire l'extraction locale des métadonnées ; la recherche « Moments de vie » et la galerie en dépendent.
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
