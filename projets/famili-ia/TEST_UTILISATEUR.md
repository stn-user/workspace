# Test utilisateur — prototype Famili-IA

## Objectif

Vérifier que des personnes comprennent la proposition « poser une question et retrouver l’information dans ses documents », savent interpréter une réponse sourcée et comprennent ce qui est — et n’est pas — connecté.

Ce test évalue le parcours, pas la qualité d’une IA ni une intégration Google Drive réelle.

## Participants et durée

- 3 à 5 personnes qui utilisent régulièrement un espace de stockage de documents.
- Environ 20 minutes par personne pour parcourir les cinq vues.
- Faire tester le prototype sur ordinateur ou téléphone, sans aide pendant les tâches si possible.

## Préparation et confidentialité

- Ouvrir `index.html` localement ou utiliser la version hébergée de démonstration après vérification de son mode de diffusion.
- Ne pas demander aux participants de se connecter à Google ni d’ouvrir, charger ou partager leurs vrais documents.
- Ne saisir aucun nom, adresse, numéro de contrat, détail de santé ou autre information personnelle.
- Expliquer que les réponses viennent d’exemples fictifs ou de fichiers sélectionnés pour la session ; la recherche est locale par mots-clés, pas une IA. Par défaut aucun compte n’est connecté.
- Prendre des notes agrégées sur les réussites et les difficultés ; ne pas enregistrer l’écran ou la voix sans accord explicite.

## Introduction à lire

« Nous testons une idée de service, pas vos compétences. Par défaut cette démonstration n’est pas connectée à Google Drive. Si nous faisons l’essai Drive, vous autoriserez explicitement l’accès limité à des fichiers choisis et nous utiliserons uniquement un document synthétique ; vous pourrez annuler ou retirer les fichiers. Les résultats sont recherchés localement, sans IA. Dites à voix haute ce que vous pensez que l’application fait et ce qui vous semble clair ou inquiétant. »

## Tâches

1. « Depuis l’accueil, où iriez-vous pour retrouver le prix de l’installation de la piscine ? »
2. « Où vérifieriez-vous que le montant affiché vient bien d’un document ? »
3. « Téléchargez l’exemple de facture fictive, ajoutez-le à la démo et demandez quel est le montant total. Où voyez-vous la preuve ? »
4. « Dans la section Maison, retrouvez les informations sur la piscine et sa garantie. Que pensez-vous que ces éléments représentent ? »
5. « Regardez les sections Famille et Alertes. Quelles actions pensez-vous pouvoir effectuer, et lesquelles semblent seulement illustratives ? »
6. « Posez une question dont la réponse n’est pas dans les exemples. Que comprenez-vous du résultat ? »
7. « D’après cette démonstration, l’application est-elle connectée à votre Drive ? Quelles données utilise-t-elle et que devient le fichier ajouté ? »
8. « Qu’est-ce qui vous manquerait pour avoir confiance avant de connecter un compte réel ? »
9. Facultatif après configuration Google Cloud : « Connectez le compte de test, choisissez uniquement un fichier synthétique dans le Picker officiel, puis retrouvez son information. Quelle autorisation pensez-vous avoir accordée et que devient le contenu ? »

Ne pas guider les participants vers les boutons ou suggérer la réponse pendant la tâche. Après chaque tâche, demander : « Qu’est-ce qui vous a paru facile ou difficile ? »

## Mesures à noter

Pour chaque participant, noter sans donnée personnelle :

- réussite autonome de la tâche 1 ;
- réussite autonome de l’ajout local du fichier fictif et de la recherche dans son contenu ;
- temps approximatif jusqu’à l’affichage de la réponse ;
- ouverture spontanée du document source ;
- compréhension que la réponse est simulée, que Drive n’est pas connecté et que le fichier choisi reste local à la page ;
- compréhension que le sélecteur Drive est une simulation et n’accède à aucun compte ou fichier réel ;
- interprétation correcte de l’état « aucun résultat » ;
- inquiétude, hésitation ou élément manquant exprimé spontanément.

## Seuils de décision initiaux

Ce sont des seuils exploratoires, à réviser après les premiers tests :

- au moins 80 % des participants (arrondi au nombre supérieur) trouvent la réponse principale sans aide ;
- au moins 80 % ajoutent le fichier d’exemple et retrouvent son montant sans aide ;
- au moins 80 % identifient le document source comme moyen de vérification ;
- au moins 80 % comprennent que cette démo n’est pas connectée à Google et n’utilise pas d’IA ;
- toute confusion sur l’envoi ou l’enregistrement de données est traitée avant de montrer une version connectée.

Avec moins de cinq participants, ces observations servent à améliorer le parcours ; elles ne démontrent pas la demande du marché.

## Synthèse après les tests

Renseigner les nombres agrégés, les formulations qui reviennent et les trois problèmes les plus importants. Ne pas y copier de documents, de questions personnelles ou d’identifiants de participants.

- Participants : nombre et profils non communiqués.
- Réussites autonomes : selon les retours qualitatifs communiqués le 9 octobre 2026, les recherches ont généralement abouti, y compris avec des fautes d’orthographe. Après l’ajout de l’extraction locale, le texte source fait ressortir davantage de précisions et la réponse à la question paraît plus concluante. Un fichier TXT fictif a été importé et le bon document a été retrouvé. Aucun décompte par tâche ni détail par type de question n’a été fourni.
- Vérification technique du prototype (9 octobre 2026) : avec les fichiers d’exemple TXT, la recherche affiche la ligne de montant de la facture et la date de fin de garantie ; l’ouverture de la source permet de consulter le contenu complet. Une question portant sur une information absente affiche l’état sans résultat. Cette vérification manuelle et les tests automatisés ne sont pas des tests participants.
- Ouvertures de source par les participants : non renseigné.
- Compréhension de la simulation et de la connexion : non renseignée ; à vérifier explicitement lors d’un prochain test.
- Questions ou inquiétudes récurrentes : le premier retour signalait que le document était retrouvé, mais que l’information exacte n’était pas toujours mise en évidence. Le retour après l’itération d’extraction est plus positif : le texte fait ressortir davantage de précisions liées à la question. La qualité sur plusieurs participants, catégories de faits et formulations reste à mesurer. Le prototype ne doit pas laisser croire qu’une IA est utilisée.
- Trois améliorations prioritaires :
  1. Quantifier les résultats sur plusieurs questions et catégories (montants, dates, numéros, durées et fréquences), y compris des formulations avec fautes ; distinguer découverte du document et extraction de l’information.
  2. Relever les réussites autonomes, le temps, l’ouverture de la source et la compréhension du traitement local sans Google ni IA.
  3. Prototyper l’OCR local sur des PDF scannés synthétiques ; noter les erreurs de reconnaissance, le temps de traitement et les limites de volume avant d’intégrer cette fonction au MVP.
- Décision : ajuster le prototype et retester sur des données fictives avant de poursuivre l’intégration technique. Les seuils de réussite ne peuvent pas encore être évalués faute de mesures chiffrées.

### Itération — extraction locale sans IA

Une extraction déterministe a été ajoutée pour les questions reconnues comme portant sur un montant, une date, un numéro, une durée ou une fréquence. Elle cite la ligne correspondante du fichier TXT/MD, sans reformuler ni générer de valeur. Les formats et formulations non reconnus retombent sur l’extrait textuel ou l’état sans résultat. Le 9 octobre 2026, les deux exemples de facture et de garantie ont été vérifiés dans le navigateur ; les exemples affichés et les fichiers téléchargeables ont été harmonisés. Des tests automatisés couvrent les cinq types d’information et plusieurs formulations. Cela ne valide ni la tolérance aux fautes par les participants, ni l’utilité générale de l’extraction ; un nouveau test utilisateur reste nécessaire.

**Retour après essai — 9 octobre 2026 :** le porteur du projet indique que les tests sont plus concluants : le texte fait ressortir davantage de précisions et la réponse à la question demandée est mieux étayée. Retour qualitatif, sans nombre de participants, mesures par tâche ni catégories détaillées ; il ne suffit pas à valider les seuils de réussite.

**Décision de périmètre — 9 octobre 2026 :** les formats visés pour le MVP sont TXT, Markdown et PDF, y compris les PDF scannés avec OCR exécuté sur l’appareil. La démo lit les PDF numériques ; l’OCR des scans fait l’objet d’une preuve technique sur des fichiers synthétiques. L’index restera en mémoire et sera supprimé à la fermeture ; aucun résultat ne sera conservé entre les sessions.

**État du prototype PDF — 9 octobre 2026 :** le texte des PDF numériques est extrait localement dans le navigateur. Un branchement OCR natif expérimental pour les scans est intégré et compile sur Android, mais n’a pas été vérifié sur téléphone ; iOS reste à construire et tester sur Mac/Xcode. Ne pas compter l’OCR comme une fonction validée tant que l’extraction n’a pas été comparée au texte source sur des PDF synthétiques réels, sur les deux plateformes.

**Retour de test technique — 9 octobre 2026 :** un essai sur téléphone Apple a signalé trois problèmes : impossibilité de charger un PDF réel, bouton Retour quittant l’interface, et résultats PDF trop larges pour « montant facture électricité ». Correctifs apportés au prototype : limite PDF portée de 1 à 10 Mo (20 pages maximum inchangé), navigation interne conservée dans l’historique navigateur pour que Retour revienne à la vue précédente, et correspondance requise du sujet spécifique de la demande avec tolérance aux petites fautes. Vérification dans le navigateur avec un vrai fichier PDF synthétique : la question « montant facture éléctricité » retourne sa ligne de montant. Sur le corpus fictif hors sujet, la même question affiche « aucun document correspondant » ; le retour navigateur de Maison revient à Recherche. La sélection de PDF et le comportement Retour doivent encore être retestés sur iPhone avec le même fichier et le même mode d’ouverture que le test initial.

**Préparation du test OCR Android — 9 octobre 2026 :** le bundle web a été synchronisé dans Capacitor et l’APK Debug a été recompilé avec succès, incluant le plugin OCR. Fichier généré : `android/app/build/outputs/apk/debug/app-debug.apk` (environ 49 Mo). Aucun émulateur n’a été démarré ; `adb` n’est pas disponible sur ce poste, donc l’installation et la reconnaissance OCR sur appareil restent à vérifier sur un téléphone Android réel. Cette compilation confirme l’intégration au build, pas le fonctionnement de l’OCR à l’exécution.

**Décision de planification — 9 octobre 2026 :** faute d’appareils disponibles pour des tests autres que locaux, la campagne complète (tests participants, parcours mobile réel, OCR sur PDF scanné, limites de performance et navigation iOS/Android) sera regroupée à la bêta. Elle ne bloque pas les développements qui peuvent être vérifiés avec des données synthétiques, les tests automatisés et le navigateur local. Les comportements non validés sur appareil restent explicitement indiqués comme expérimentaux jusque-là.

**Cycle local — retrait des fichiers de session :** l’action « Retirer mes fichiers » vide maintenant la liste et les résultats, ferme et vide l’aperçu source. Vérification effectuée dans le navigateur avec un fichier TXT fictif ; le contenu de l’aperçu est effacé et l’état de résultat masqué après retrait. Cela confirme le comportement de l’interface, pas un effacement forensique de la mémoire du système.

**Parcours Drive simulé — 9 octobre 2026 :** le bouton « Drive (démo) » ouvre une liste de trois documents fictifs. Le choix ajoute une copie de démonstration à l’index mémoire de session, recherchable comme un fichier local ; les doublons sont désactivés et le plafond de cinq fichiers est partagé avec les fichiers locaux. Le dialogue précise qu’aucun compte n’est connecté et qu’aucun document Drive n’est consulté ou téléchargé. Parcours vérifié dans le navigateur : sélection, affichage du montant de la facture piscine, provenance simulée et retrait de la session. Cette maquette ne teste ni le Picker Google officiel, ni OAuth, ni les scopes, ni un appel réseau.

**Préparation du connecteur Google réel — 9 octobre 2026 :** le parcours navigateur OAuth + Google Picker officiel est implémenté avec le scope `drive.file`, un filtre de formats, des limites de taille, le téléchargement direct côté navigateur et la révocation sur demande. Des tests automatisés avec réponses API simulées vérifient que seuls les ID retournés par le Picker sont lus. Au moment de cette préparation, aucun projet/client Google Cloud ni configuration `.env.local` n’était encore créé. La preuve vise uniquement des fichiers choisis dans le Picker, jamais le Drive entier. Le code web n’est pas le flux d’authentification mobile natif.

**Test réel OAuth et Picker sur ordinateur — 9 octobre 2026 :** le porteur du projet confirme que l’authentification Google, l’écran de consentement et le Google Picker se sont ouverts correctement depuis `http://localhost:5173`. Après le choix d’un PDF, Famili-IA a affiché que le document semble scanné et que l’OCR n’est pas disponible dans la démo web. La sélection et le flux OAuth sont donc validés sur ordinateur ; la lecture, l’extraction et la recherche d’un document Drive ne le sont pas encore. Le message correspond à la limite prévue pour les PDF sans couche texte ; il ne démontre pas un défaut d’autorisation ou de Picker. Aucun contenu n’a été ajouté à la session de recherche, et aucune donnée n’a été envoyée à un serveur Famili-IA ou à une IA. Le bouton « Déconnecter Drive » reste visible après l’échec : l’accès Google doit être révoqué en fin de test. Prochaine vérification web : choisir un PDF synthétique comportant du texte sélectionnable, puis vérifier extraction, provenance, retrait et révocation. Un essai sur iPhone via l’adresse IP HTTP locale a, séparément, échoué avant l’autorisation avec `400: origin_mismatch` ; un test mobile nécessitera une origine HTTPS, comme décrit dans `ETUDE_GOOGLE_DRIVE.md`.

**Prototype de choix des sources — 9 octobre 2026 :** vérification fonctionnelle dans le navigateur de bureau : première ouverture avec accueil « Ajouter des documents » / « Explorer la démo », ouverture du choix de source, sélection d’un fichier TXT synthétique via le sélecteur local et arrivée sur Recherche, ainsi que sélection d’un exemple fictif. Le choix d’accueil est mémorisé dans le navigateur, pas le contenu des fichiers. Google Drive n’est proposé que dans le web configuré ; l’application native et les photos sont annoncées comme indisponibles. Ce contrôle d’interface ne constitue pas un test participant, ni une validation du parcours sur téléphone.
