# Famili-IA — feuille de route produit

## Vision

Aider une personne ou une famille à retrouver, comprendre et organiser ses informations numériques, même lorsqu’elles sont dispersées entre plusieurs services.

Famili-IA est une couche de recherche et de compréhension au-dessus des espaces numériques que les utilisateurs possèdent déjà. Le produit ne cherche pas à remplacer iCloud, Google Drive, OneDrive ou Dropbox, ni à devenir un nouveau service de stockage généraliste.

## Principes de conception

- **L’utilisateur garde le contrôle** : connexion explicite à chaque source, permissions minimales, déconnexion et révocation simples.
- **Pas de suppression automatique** : les doublons et fichiers « inutiles » sont des suggestions à examiner, jamais des suppressions automatiques.
- **La confidentialité est une fonction centrale** : collecter et conserver le minimum, expliquer où les données transitent et pourquoi.
- **Résultats vérifiables** : les réponses renvoient au fichier source, indiquent leur niveau d’incertitude et distinguent les informations extraites des déductions de l’IA.
- **Pas de promesse de stockage ou d’archivage garanti** : les documents restent dans les services d’origine, sauf décision ultérieure explicite.
- **Accessibilité et simplicité** : langage clair, parcours utilisable sur téléphone comme sur ordinateur.
- **Aucune donnée sensible réelle dans les environnements de démonstration ou de test** sans protections et autorisation adaptées.

## Exigences transverses de sécurité et de confidentialité

Ces exigences s’appliquent au prototype, au MVP et à toute extension. La sécurité et la confidentialité sont des critères de livraison, pas des améliorations à reporter après le lancement.

- **Minimisation par défaut** : les documents restent chez leur fournisseur. Ne récupérer leur contenu que si le cas d’usage le justifie ; privilégier un traitement temporaire et ne conserver ni document ni texte extrait par défaut.
- **Transparence des flux** : documenter les données collectées, leur finalité, leur durée de conservation et chaque destinataire, y compris fournisseurs d’IA, journaux, sauvegardes et outils de support. Informer l’utilisateur avant toute transmission à un service tiers.
- **Contrôle utilisateur effectif** : permettre de consulter les sources connectées, de révoquer leur accès et de demander la suppression des données de l’application ; vérifier que suppression et déconnexion couvrent aussi les index, caches et sauvegardes selon les délais annoncés.
- **Isolation stricte** : vérifier côté serveur les droits sur chaque ressource et isoler les comptes et foyers. Aucun identifiant fourni par le client ne suffit à autoriser l’accès à une donnée.
- **Accès et secrets** : permissions fournisseur minimales et en lecture seule lorsque possible ; protéger les jetons et secrets, limiter leur accès et ne jamais les exposer dans le navigateur, les journaux ou les outils de suivi.
- **Protection technique** : chiffrement en transit et au stockage lorsque des données y sont conservées, contrôle d’accès, mises à jour des dépendances, limitation des abus et journaux minimisés, sans contenu de documents ni requêtes personnelles par défaut.
- **Validation avant données réelles** : utiliser des données synthétiques en développement ; tester l’isolation entre utilisateurs, la révocation, la suppression et les erreurs d’autorisation. Faire examiner indépendamment l’architecture et les contrôles pertinents avant un pilote utilisant de vrais comptes ou documents.
- **Gestion des incidents** : définir les responsabilités, les moyens de détection et la procédure de réponse avant l’ouverture à des utilisateurs externes.

**Critère de passage commun :** pas de lancement avec des données réelles tant que les flux et durées de conservation ne sont pas documentés, que les contrôles d’accès et de suppression ne sont pas testés, et que les risques importants identifiés n’ont pas de mesure de réduction ou de décision explicite.

## Public et problème à valider

La cible initiale envisagée est une personne ou une famille qui utilise plusieurs services et peine à retrouver ses documents, factures, garanties et souvenirs. Cette cible, les services prioritaires et la volonté de payer restent à confirmer auprès d’utilisateurs.

La question produit de départ est :

> « Puis-je retrouver rapidement un document personnel, comprendre ce qu’il contient et revenir à sa source, sans devoir déplacer toute ma vie numérique ? »

### Première direction produit retenue

> **Connecter Google Drive, poser une question en langage naturel et retrouver rapidement l’information utile, avec une réponse vérifiable qui renvoie aux fichiers sources.**

Le prototype couvrira les documents textuels, sans recherche dans les photos pour l’instant. Ce choix fixe une direction pour le cadrage et le prototype ; il n’autorise pas encore la connexion de comptes réels. La promesse de rapidité devra être mesurée sur un jeu de test et ne devra pas conduire à indexer ou conserver plus de données que nécessaire. Pour toute réponse, l’application devra distinguer les éléments trouvés dans les documents des interprétations générées et signaler les résultats incertains ou absents.

### Signal utilisateur préliminaire — 9 octobre 2026

Selon les retours communiqués par le porteur du projet, les personnes consultées trouvent la sélection de quelques documents utile, mais souhaitent connecter l’ensemble de leurs clouds et se disent prêtes à autoriser un accès complet depuis leur smartphone, avec un niveau de confiance élevé envers une application de cette catégorie.

Ce retour renforce l’intérêt de la proposition, mais ne confirme pas encore la faisabilité des permissions ni la représentativité de la demande : le nombre et le profil des personnes interrogées, les fournisseurs exacts, la distinction entre documents et photos, et leur compréhension de l’indexation/rétention restent à consigner. Le consentement de l’utilisateur ne remplace pas l’approbation OAuth du fournisseur et ne crée pas une API là où elle n’existe pas.

## Feuille de route

### Phase 0 — Cadrer le problème et vérifier la demande

**Objectif :** confirmer que le problème est fréquent, important et suffisamment précis pour justifier un premier produit.

- Interroger des foyers qui utilisent plusieurs espaces numériques.
- Recueillir des exemples concrets de questions que les utilisateurs voudraient poser sur leur Google Drive : facture, garantie, contrat ou document scolaire.
- Observer comment les personnes cherchent aujourd’hui et ce qu’elles acceptent ou refusent de connecter.
- Tester une proposition de valeur et un prototype de parcours, sans demander l’accès aux comptes ni aux vrais documents.
- Distinguer les besoins de recherche, classement, rappels et gestion familiale ; ne pas les traiter tous comme un seul MVP.

**Livrables :** profils d’utilisateurs, parcours prioritaires, objections de confiance, critères de réussite et décisions consignées.

**Critère de passage :** plusieurs personnes de la cible décrivent spontanément le même problème et souhaitent essayer une solution sur une source précise.

### Phase 1 — Définir le MVP et ses limites

**Objectif :** choisir un cas d’usage unique et établir ce que la première version ne fera pas.

À préciser avant de coder l’intégration réelle :

- première cible : particulier seul ou foyer ;
- premier scénario : poser une question en langage naturel pour retrouver une information dans les documents de Google Drive explicitement choisis ; formats visés : TXT, Markdown et PDF, y compris les PDF numérisés via OCR exécuté sur l’appareil. Photos hors périmètre initial ;
- périmètre du premier MVP : un seul fournisseur, Google Drive comme candidat retenu, et uniquement les fichiers explicitement choisis par l’utilisateur ; valider les permissions et méthodes API exactes avant tout pilote ou traitement de données personnelles ; une preuve de développement peut utiliser uniquement des fichiers synthétiques sélectionnés avec le scope minimal ;
- traitement du MVP : sur un seul téléphone, sans synchronisation multi-appareils, sans IA distante et sans historique persistant des questions ;
- accès à l’espace cloud complet et connexions à plusieurs fournisseurs : hors périmètre du premier MVP, à réexaminer dans une phase ultérieure après validation de l’usage et des permissions ;
- index local : session seulement, conservé en mémoire sur l’appareil et supprimé à la fermeture de l’application ; pas de persistance entre sessions dans le MVP initial ;
- fournisseur envisagé : Google Drive, sous réserve de confirmer les permissions officielles, les quotas et les conditions de validation applicables ;
- recherche dans le contenu textuel des formats retenus ; l’OCR local des PDF scannés est une capacité à prototyper et valider avant de la promettre ;
- réponses consultables uniquement, sans déplacement ni modification des fichiers ;
- fonctionnement web responsive/PWA d’abord, ou besoin confirmé d’une application mobile native dès le départ.

**Hors périmètre initial :** accès à l’espace cloud complet, connexions à plusieurs fournisseurs, synchronisation multi-appareils, IA distante, historique persistant des questions, Gmail et messageries, recherche de photos complexes, gestion de succession, rappels administratifs, partage entre proches, classement automatique en écriture, nettoyage ou suppression, coffre de stockage propriétaire.

**Critère de passage :** un parcours principal, un fournisseur et une définition mesurable d’une recherche réussie sont validés.

### Phase 2 — Conception technique, confidentialité et conformité

**Objectif :** concevoir le traitement des données avant d’autoriser une connexion réelle.

- Étudier les API et règles officielles du fournisseur retenu : consentement OAuth, portée des permissions, limitations, procédure de validation et révocation.
- Pour Google Drive, vérifier les portées OAuth minimales permettant le scénario retenu, les exigences de vérification de l’application et les règles applicables au traitement du contenu des fichiers.
- Pour chaque fournisseur envisagé, distinguer l’accès aux fichiers sélectionnés de l’accès à toute une bibliothèque ; ne pas supposer qu’un sélecteur visuel limite à lui seul la portée du jeton OAuth.
- Modéliser le trajet des données : fournisseur, application, index de recherche, service d’IA éventuel, journaux, sauvegardes et suppression.
- Choisir, selon le besoin validé, entre recherche locale, index serveur ou indexation hybride.
- Déterminer précisément si le contenu des fichiers est conservé, combien de temps, où et sous quelle forme.
- Réaliser une analyse de risques et un modèle de menace couvrant comptes, jetons d’accès, appareils partagés, accès familial, fuites et demandes de suppression.
- Définir les règles d’isolation des comptes et des foyers ; aucune donnée d’un membre ne doit être accessible à un autre sans autorisation explicite.
- Vérifier les exigences RGPD et les règles applicables aux données sensibles, aux mineurs et au traitement automatisé ; demander un conseil spécialisé lorsque nécessaire.
- Définir les exigences de chiffrement, gestion des secrets, sauvegarde, audit et réponse à incident.
- Définir les contrôles de sécurité à tester à chaque livraison et les critères déclenchant une revue indépendante ou une AIPD.
- Consigner le schéma de flux, les frontières de confiance, les menaces prioritaires et les critères de passage avant données réelles dans [ANALYSE_FLUX_ET_MENACES.md](./ANALYSE_FLUX_ET_MENACES.md).

**Choix prudents par défaut :** permissions en lecture seule, autorisation révocable, jetons conservés dans le stockage sécurisé du système sur l’appareil (ou chiffrés côté serveur si un backend devient nécessaire), absence de contenu documentaire dans les journaux, index local minimal avec durée définie et suppression vérifiable.

**Critère de passage :** le fournisseur autorise le scénario prévu et les flux de données, contrôles de sécurité et obligations de confidentialité sont documentés.

**État du cadrage :** une première analyse préliminaire des flux et menaces est disponible dans [ANALYSE_FLUX_ET_MENACES.md](./ANALYSE_FLUX_ET_MENACES.md). L’orientation choisie est une app native avec index local, sans envoi des contenus à un serveur Famili-IA. La plateforme initiale, le stockage sécurisé des jetons/index, la durée de l’index et la faisabilité fournisseur restent à valider avant tout compte réel. Ce choix ne dispense pas des examens OAuth ni des règles des plateformes.

### Phase 3 — Prototype d’expérience sans comptes réels

**Objectif :** tester la compréhension et l’utilité avant de construire les intégrations sensibles.

- Créer un prototype web responsive avec données fictives ou documents de test fabriqués.
- Pour la première version, simuler la recherche avec un petit jeu local de documents textuels fictifs ; ce prototype n’utilise ni IA ni connexion Google.
- Permettre de charger jusqu’à cinq fichiers TXT/MD/PDF fictifs depuis le poste ; les lire uniquement en mémoire et permettre de les retirer. Le texte des PDF sélectionnables est extrait localement dans le prototype web ; l’OCR des PDF scannés est une preuve expérimentale native et doit être validé avant de l’inclure au parcours utilisable.
- Tester la connexion simulée, l’état d’indexation, la barre de recherche, les filtres et la fiche de résultat.
- Afficher pour chaque résultat son nom, sa source, sa date, les éléments utilisés et un lien ou une action pour le retrouver dans son espace d’origine.
- Tester les états sans résultat, résultat incertain, source indisponible et autorisation expirée.
- Évaluer l’expérience sur téléphone et ordinateur avec des utilisateurs représentatifs.
- Utiliser exclusivement des données synthétiques ; ne pas connecter de comptes personnels pour les démonstrations.

**Critère de passage :** les utilisateurs comprennent ce qui est recherché, ce qui est lu, où se trouvent les fichiers et comment revenir à la source.

### Phase 4 — MVP privé sur une seule source

**Objectif :** permettre une recherche utile, limitée et vérifiable sur une source autorisée.

- Mettre en place comptes, sessions sécurisées et séparation stricte des utilisateurs.
- Ajouter une seule intégration fournisseur, selon les permissions officiellement approuvées.
- Commencer par les métadonnées nécessaires ; ne télécharger le contenu qu’en cas de besoin justifié et annoncé.
- Implémenter une recherche sur un scénario prioritaire et des résultats avec provenance ; ne créer un index persistant que si les essais démontrent qu’il est nécessaire et que sa durée de conservation est définie.
- Si une IA intervient, limiter les champs envoyés, expliquer le traitement et demander le consentement approprié.
- Permettre de voir l’état de la connexion, de rafraîchir ou supprimer l’index, de déconnecter la source et de révoquer l’accès.
- Prévoir gestion des erreurs, limites API, relance contrôlée et suppression des jetons lors de la déconnexion.
- Ajouter des tests automatisés d’autorisation et d’isolation entre comptes, ainsi que de révocation et de suppression des données.
- Avant le pilote réel, faire examiner indépendamment l’architecture, les permissions et les contrôles d’accès ; corriger les risques importants identifiés ou documenter formellement leur traitement.

**Critères de réussite à fixer avant le pilote :** taux de recherches abouties, temps pour retrouver un élément, précision des résultats, taux de faux positifs, compréhension des autorisations, incidents de confidentialité et demandes de déconnexion.

### Phase 5 — Pilote fermé et amélioration

**Objectif :** vérifier que le MVP résout le problème dans des conditions réelles, sans élargir prématurément le périmètre.

- Inviter un petit groupe volontaire après validation des protections et des conditions applicables.
- Mesurer la qualité des résultats et observer les recherches manquées.
- Collecter des retours avec des journaux minimisés et sans enregistrer les contenus recherchés par défaut.
- Corriger les problèmes de sécurité, compréhension et fiabilité avant d’ajouter des fonctionnalités.
- Documenter le support, la suppression des données, les incidents et les demandes d’accès.

**Critère de passage :** le bénéfice est démontré sur le scénario retenu, les erreurs sont comprises et le pilote est acceptable pour les utilisateurs.

### Phase 6 — Étendre les usages avec prudence

**Objectif :** élargir uniquement aux besoins confirmés et aux intégrations techniquement et juridiquement viables.

Extensions possibles, à prioriser après le pilote :

1. autres documents importants (factures, contrats, garanties, notices) ;
2. second fournisseur de stockage, seulement après examen de ses portées et de son modèle d’accès ;
3. parcours photo propre à chaque plateforme, sans présumer d’une API de lecture complète ou d’un accès serveur ;
4. métadonnées structurées et rappels de garantie, toujours révisables ;
5. espace familial avec rôles et consentements explicites ;
6. applications mobiles natives si la PWA ne répond pas aux besoins hors ligne, notifications ou intégrations appareil. Une app iOS native pourrait aussi étudier une recherche locale dans la photothèque autorisée via PhotoKit ; cela ne fournit pas un accès serveur à Photos iCloud ni à iCloud Drive.

Chaque fournisseur et chaque catégorie de données passent par une revue distincte des permissions, flux, coûts, rétention et risques.

L’étude préliminaire des six cibles est consignée dans [ETUDE_FAISABILITE_CLOUDS.md](./ETUDE_FAISABILITE_CLOUDS.md). Conclusion à ce stade : Dropbox et OneDrive sont les pistes les plus directes pour une lecture déléguée étendue ; Google Drive complet reste conditionné à la vérification des portées restreintes et à l’éligibilité de l’application ; l’usage de recherche IA de Google Photos doit être confirmé avec Google ; PhotoKit peut permettre un accès local complet à Photos iCloud sur une app Apple native ; aucun accès tiers général à tout iCloud Drive n’est établi. La promesse n’est donc pas une indexation universelle garantie : chaque connecteur doit afficher son périmètre et ses limites.

### Phase 7 — Modèle économique et lancement

**Objectif :** vérifier la viabilité économique après la preuve de valeur.

- Tester la volonté de payer avant de fixer des abonnements ou des tarifs.
- Estimer les coûts d’API, d’indexation, d’IA, de support, de conformité et de sécurité.
- Comparer une offre gratuite limitée, une offre individuelle et une offre familiale, sans promettre une fonctionnalité qui n’est pas livrée.
- Préparer support utilisateur, conditions d’utilisation, politique de confidentialité et procédure de suppression.
- Déployer progressivement avec supervision, limites d’usage et plan de réponse à incident.

## Décisions encore ouvertes

- Quelle personne de la famille est le premier utilisateur cible ?
- Les exigences OAuth, méthodes API et formats autorisés pour l’accès aux fichiers explicitement choisis via Picker (`drive.file`) sont-elles confirmées pour le parcours exact du MVP ?
- Quel périmètre de recherche dans l’espace cloud complet et quels autres fournisseurs seront prioritaires dans une phase ultérieure ?
- Combien de personnes ont été consultées, quels profils représentent-elles et comprennent-elles la différence entre accès complet, indexation persistante et analyse à la demande ?
- Pour viser iOS et Android en parallèle, le modèle retenu est un code partagé avec modules natifs spécifiques ; Capacitor est le premier candidat à tester, sans décision finale. Il faut vérifier son adéquation et déterminer comment construire/tester iOS depuis l’environnement Windows.
- Quel niveau de partage familial est nécessaire, et quelles données doivent rester privées à chaque membre ?
- Quel nom public, quel modèle économique et quelles régions de lancement ?

**Décisions — formats et conservation locale :**

- Formats visés : TXT, Markdown et PDF, y compris les PDF numérisés avec OCR exécuté sur l’appareil. La prise en charge OCR est une exigence cible, pas une capacité déjà implémentée ; il faut valider la qualité, les limites et la faisabilité sur iOS et Android avant toute promesse.
- Index : mémoire de l’application seulement, supprimé à sa fermeture. Aucune persistance entre sessions ; les fichiers devront être sélectionnés à nouveau à la prochaine session.

## État actuel

- **Projet :** prototype web local étendu aux cinq vues de la maquette — Accueil, Recherche, Maison, Famille et Alertes — avec navigation responsive et données fictives. La recherche repose sur des mots-clés et exige désormais la correspondance des termes spécifiques du sujet pour éviter de remonter des factures sans rapport ; les petites fautes restent tolérées. Les fichiers TXT/MD sont limités à 1 Mo, les PDF à 10 Mo et 20 pages. PDF.js extrait le texte des PDF numériques ; un PDF synthétique a été chargé et recherché avec succès dans le navigateur. Le retrait des fichiers locaux vide les résultats et l’aperçu de source. Le bouton « Drive (démo) » conserve un sélecteur fictif distinct. Un vrai flux web Google Picker/OAuth est implémenté derrière « Connecter Google Drive » avec le scope limité `drive.file`, téléchargement direct des seuls fichiers sélectionnés, traitement en mémoire, absence de backend/IA et action de révocation. Le consentement OAuth et l’ouverture du Picker ont été vérifiés sur ordinateur le 9 octobre 2026 ; le PDF sélectionné a été reconnu comme scanné et rejeté, l’OCR n’étant pas disponible dans ce flux web. La lecture et l’indexation d’un fichier Drive à couche texte, ainsi que la révocation réelle, restent à vérifier. La configuration locale est documentée dans [ETUDE_GOOGLE_DRIVE.md](./ETUDE_GOOGLE_DRIVE.md) ; les identifiants sont ignorés par Git et aucun secret ne doit être partagé. Un essai iPhone via l’adresse IP HTTP locale a échoué avant l’autorisation avec `400: origin_mismatch` ; OAuth mobile nécessitera une origine HTTPS autorisée. Un branchement natif expérimental pour l’OCR des PDF scannés utilise Vision sur iOS et ML Kit sur Android, mais n’a pas encore été testé sur appareil. L’historique navigateur permet de revenir aux vues précédentes avec Retour. Les actions non implémentées restent signalées comme démonstratives. Le bundle web et l’APK Debug Android ont été compilés le 9 octobre ; l’OCR n’a pas été testé sur téléphone et aucun émulateur n’a été relancé. `adb` n’est pas disponible sur ce poste, et le projet iOS ne peut pas être construit ici sans Mac/Xcode. La campagne de tests sur appareils et utilisateurs est reportée à la version bêta et ne bloque plus les développements vérifiables localement. Détails : [ANALYSE_FLUX_ET_MENACES.md](./ANALYSE_FLUX_ET_MENACES.md). Périmètre MVP : un fournisseur et des fichiers choisis, traitement sur un seul téléphone, index mémoire de session, sans IA distante ni historique persistant des questions ; l’accès cloud complet reste une étape ultérieure.
- **Validation utilisateur :** premiers retours qualitatifs communiqués le 9 octobre : les personnes consultées souhaitent connecter leurs clouds et se disent à l’aise avec un accès complet ; échantillon et portée exacte restent à documenter. Après l’itération d’extraction locale, le porteur du projet rapporte des tests plus concluants : le texte fait ressortir davantage de précisions liées à la question. Ce retour qualitatif est encourageant, mais le nombre de participants, les réussites par tâche, l’ouverture des sources et la compréhension de la simulation ne sont pas encore consignés ; les seuils de réussite restent donc à vérifier. Synthèse et priorités dans [TEST_UTILISATEUR.md](./TEST_UTILISATEUR.md).
- **Étude Google Drive :** contraintes de portées, vérification, sécurité et quotas résumées dans [ETUDE_GOOGLE_DRIVE.md](./ETUDE_GOOGLE_DRIVE.md). Orientation retenue : l’utilisateur sélectionne les fichiers via Picker (`drive.file`), sous réserve de validation technique détaillée.
- **Étude multi-cloud :** comparaison Google Drive, Google Photos, OneDrive, Dropbox, iCloud Drive et Photos iCloud dans [ETUDE_FAISABILITE_CLOUDS.md](./ETUDE_FAISABILITE_CLOUDS.md) ; couverture complète et uniforme impossible à garantir à ce stade. Le retour positif sur l’accès complet ne remplace pas l’accord des plateformes.
- **Dépôt :** dépôt unique `workspace`, avec les projets sous `projets/`.
- **Prochaine séquence retenue :** poursuivre le test Drive sur ordinateur avec un PDF synthétique comportant du texte sélectionnable (ou un TXT synthétique) : vérifier extraction et recherche, provenance, limites, retrait en mémoire, puis révocation via « Déconnecter Drive ». Le PDF précédemment choisi n’a pas été déclaré synthétique ; il n’a pas été indexé. Le test validé jusqu’ici couvre le consentement OAuth et le Picker, pas la lecture des fichiers Drive, la révocation réelle, l’accès au Drive entier, le statut OAuth de production ou la version native mobile. Ne pas élargir les scopes pour contourner ces limites. La campagne complète de bêta regroupera les tests sur appareils iOS/Android (dont OCR scanné et Retour iPhone), les mesures d’usage avec participants et la vérification des performances/limites. Aucun accès global, document personnel, backend ou IA ne sera ajouté à ce stade. L’accès cloud complet reste une étude ultérieure, sans engagement de faisabilité ni de calendrier.
