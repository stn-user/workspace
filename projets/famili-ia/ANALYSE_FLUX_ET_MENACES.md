# Famili-IA — flux de données et premières menaces

**État :** cadrage préliminaire, à réviser après le choix d’architecture et avant tout pilote avec des comptes ou documents réels.  
**Périmètre :** prototype web actuel et scénarios envisagés pour un MVP de recherche dans des documents personnels.  
**Important :** ce document ne constitue ni un audit de sécurité, ni une AIPD, ni un avis juridique. Les menaces et mesures proposées devront être vérifiées sur l’architecture effectivement construite.

## Orientation d’architecture retenue pour la suite

Le porteur du projet privilégie une application native avec traitement et index local, sans envoi du contenu à un serveur Famili-IA. C’est une orientation de conception pour les prochains essais, pas encore une architecture validée ni une autorisation fournisseur.

- Les deux plateformes mobiles, iOS et Android, sont ciblées dès le départ.
- Le périmètre fonctionnel décidé pour le premier MVP est un seul fournisseur (Google Drive comme candidat), des fichiers explicitement choisis par l’utilisateur, un seul téléphone et aucun transfert de contenu à un serveur Famili-IA.
- L’accès à l’espace cloud complet et la connexion de plusieurs fournisseurs seront étudiés dans une phase ultérieure ; ils ne font pas partie du premier MVP.
- Aucune IA distante ni aucun historique persistant des questions ne sont prévus dans le premier MVP.
- Le contenu téléchargé depuis le cloud, les extraits et l’index restent sur l’appareil.
- Aucun fournisseur d’IA distant ne reçoit de contenu par défaut ; une telle transmission nécessiterait une décision distincte, une information claire et une analyse de ses conditions.
- Les jetons doivent rester sur l’appareil dans le stockage sécurisé adapté au système ; l’index et les caches doivent être protégés et supprimés lors de la déconnexion.
- Pour le MVP initial, l’index reste en mémoire sur l’appareil et est supprimé à la fermeture de l’application ; il n’est pas conservé entre les sessions et les fichiers devront être sélectionnés à nouveau. Cette décision réduit la rétention mais ne remplace pas la vérification de l’effacement des buffers, caches temporaires et données fournies au système d’exploitation.
- Les formats visés sont TXT, Markdown et PDF, dont les PDF numérisés traités par OCR sur l’appareil. Le branchement OCR natif est implémenté à titre expérimental mais n’est pas encore validé sur appareil. Aucun contenu reconnu par OCR ne doit être envoyé à un serveur Famili-IA ou à un service d’IA distant dans le périmètre retenu.
- Le traitement local ne supprime ni l’examen des scopes, ni le consentement OAuth, ni les politiques d’usage des fournisseurs. Pour Google Drive restreint, la nécessité d’une vérification reste à confirmer ; seule l’évaluation de sécurité propre à l’accès depuis/à travers un serveur pourrait ne pas s’appliquer si le contenu n’est effectivement accessible par aucun serveur.
- Aucun document personnel ne sera utilisé pour un prototype d’architecture : commencer par des fichiers synthétiques et des comptes développeur dédiés quand disponibles.

## Modèle de développement mobile — comparaison initiale

La préférence exprimée est un code partagé iOS/Android avec des modules natifs spécifiques. Le prototype actuel est du HTML, CSS et JavaScript sans framework mobile.

| Approche | Réutilisation du prototype | Accès natif | Conséquence pour Famili-IA |
|---|---|---|---|
| **Capacitor** | Forte : permet d’intégrer un projet web existant dans une app mobile | Plugins JavaScript avec implémentations iOS en Swift/Objective-C et Android en Java/Kotlin | Candidat le plus direct pour réutiliser l’interface actuelle et ajouter des plugins de stockage sécurisé, OAuth et PhotoKit. Les traitements locaux lourds et l’exécution en arrière-plan devront être validés par prototype ; l’interface est rendue dans une WebView. |
| **React Native** | Faible à moyenne : logique JavaScript réutilisable en partie, mais l’interface DOM existante devrait être adaptée aux composants natifs | Modules natifs iOS/Android | Bonne voie pour une interface plus intégrée au natif, mais implique davantage de réécriture de l’écran actuel. |
| **Flutter** | Faible : l’interface actuelle devrait être réécrite en Dart | Canaux de plateforme pour appeler du Swift/Kotlin | Socle partagé mature, mais représente la plus grande réécriture de l’interface existante parmi ces options. |

**Recommandation provisoire :** évaluer Capacitor en premier parce qu’il réutilise le prototype existant et permet d’ajouter des plugins natifs. Ce n’est pas encore un choix de framework final : un essai doit confirmer stockage local protégé, accès Photos iOS, indexation hors ligne, limites en arrière-plan et absence de transfert de contenu hors de l’appareil.

**Contrainte de poste :** la documentation Capacitor indique que le projet iOS est géré dans Xcode. L’environnement de travail actuel étant Windows, le développement web et Android peut commencer ici, mais construire, signer et tester la version iOS exigera un Mac avec Xcode ou un service de build Mac correctement maîtrisé. Cette dépendance doit être budgétée et planifiée avant de promettre un pilote iOS.

## 1. Situation actuelle

Le prototype web présente cinq vues — Accueil, Recherche, Maison, Famille et Alertes — avec navigation responsive et données fictives. Il ne comporte ni connexion Google, ni backend Famili-IA, ni fournisseur d’IA. Depuis la vue Recherche, l’utilisateur peut charger des fichiers TXT/MD/PDF fictifs, lus uniquement pour la session ; PDF.js extrait localement le texte intégré aux PDF numériques. L’extraction locale déterministe peut citer une ligne clairement étiquetée correspondant à un montant, une date, un numéro, une durée ou une fréquence ; elle ne comprend pas le langage comme une IA et ne doit pas inventer une valeur absente. Le code contient un branchement OCR natif expérimental (Vision sur iOS, ML Kit sur Android) pour rasteriser les pages PDF et reconnaître les scans ; il compile dans le projet Android mais n’a pas été validé sur appareil, et le projet iOS n’est pas encore généré/testable sur le poste Windows. Plusieurs commandes des vues Maison, Famille et Alertes sont de simples interactions de démonstration, sans effet sur des comptes ou des données réels. Le prototype ne doit pas être utilisé avec des documents personnels réels.

Les risques principaux du MVP ne sont pas encore ceux d’un service en production : ils dépendent du choix entre traitement local, traitement serveur ou architecture hybride, et du connecteur autorisé. Aucun jeton OAuth ou contenu cloud réel n’est actuellement traité.

### État de la preuve Capacitor Android

- Capacitor 8 est configuré pour réutiliser le prototype web ; les ressources fictives sont incluses dans le build Android.
- PDF.js lit le texte des PDF localement et rend les pages sans texte intégré en images temporaires pour l’OCR. Le plugin `@jcesarmobile/capacitor-ocr` appelle Vision sur iOS et ML Kit sur Android ; l’APK Android compile avec ce plugin et n’ajoute pas de permission réseau. Le parcours OCR sur un vrai PDF scanné reste à tester sur appareil ; aucun appareil n’était connecté au dernier build et aucun projet iOS/Xcode n’est présent sur ce poste Windows.
- Le projet Android natif a été généré. Le manifeste fusionné désactive les sauvegardes Android et ne contient actuellement aucune permission réseau ou accès fichiers/photos. Ces choix devront être réexaminés et expliqués avant d’ajouter une connexion cloud.
- La démo web a été vérifiée via le serveur Vite : recherche fictive, chargement d’un fichier TXT fictif, extraction d’un passage, suppression du fichier et accès HTTP aux exemples.
- `npm audit` ne signale aucune vulnérabilité connue après correction d’une dépendance transitive du CLI.
- Android Studio et les outils Android 36 ont été installés. Microsoft OpenJDK 21 est nécessaire car le JDK 25 fourni avec Android Studio est trop récent pour le Gradle généré.
- Le build `assembleDebug` réussit et produit un APK de démonstration. `JAVA_HOME` (OpenJDK 21) et `ANDROID_HOME` (SDK utilisateur) sont configurés au niveau du compte Windows ; les nouveaux terminaux les prendront en compte après redémarrage de la session.
- L’APK a été installé et lancé avec succès dans l’AVD `FamiliIA_API36`. Cet AVD a ensuite été supprimé parce qu’il était trop lent pour des tests réalistes ; le SDK et les outils restent disponibles pour tester sur un appareil physique.
- Les fonctions de stockage sécurisé, index local persistant, PhotoKit et OAuth ne sont pas implémentées.
- Commandes préparées : `npm run build`, `npm run cap:sync` et `npm run android:run`.

## 2. Données à protéger

| Donnée | Sensibilité et risque | Règle de conception proposée |
|---|---|---|
| Jetons OAuth et codes d’autorisation | Permettent d’accéder aux fichiers du compte ; compromission potentiellement grave | Demander les scopes minimaux ; utiliser les protections OAuth adaptées, dont `state` et PKCE lorsque supporté ; ne jamais afficher ni journaliser de secret ; révocation accessible et vérifiée. |
| Contenu, extraits et métadonnées de documents | Peut révéler identité, adresse, santé, finances, école, habitudes et données de tiers | Ne pas collecter ou conserver par défaut ; traiter seulement les formats nécessaires ; afficher les destinataires et durées avant connexion. |
| Questions et résultats | Peuvent révéler une situation personnelle même sans joindre le document | Ne pas enregistrer par défaut dans les journaux ; séparer les métriques d’usage du contenu et des identifiants. |
| Index, embeddings, cache et miniatures | Dérivés des documents, parfois aussi sensibles que les originaux | Traiter comme contenu sensible ; durée explicite ; suppression avec la source et lors de la déconnexion ; accès isolé par compte. |
| Identifiants, profils de compte et liens source | Peuvent relier une personne à des documents ou à un foyer | Collecter le minimum ; vérifier côté serveur que chaque ressource appartient au compte courant. |
| Informations de diagnostic | Peuvent involontairement inclure chemin, nom de fichier, requête ou extrait | Liste autorisée de champs ; expurger les entrées ; interdire les payloads documentaires dans analytics et rapports d’erreur. |

## 3. Flux envisagés — à confirmer avant développement du MVP

### Option A — traitement local

1. L’application s’authentifie auprès du fournisseur et obtient les permissions approuvées.
2. Le client récupère les fichiers nécessaires depuis l’API du fournisseur.
3. Le contenu, la recherche et l’index restent sur l’appareil.
4. La réponse et les sources sont affichées localement.
5. Aucun contenu ni extrait n’est envoyé à un serveur Famili-IA ou à une IA distante, sauf décision distincte et consentement explicite.

**À décider :** comment synchroniser entre les appareils d’un même utilisateur ou foyer sans envoyer de contenu à un serveur Famili-IA, et comment gérer l’accès aux originaux non téléchargés.

**Option privilégiée pour les prochains essais.** iOS et Android seront visés en parallèle avec un code partagé et des modules natifs par plateforme. Capacitor est le premier candidat à évaluer, mais le framework n’est pas encore choisi. Il faut préciser les protections de stockage et le comportement sans réseau. Une indexation locale complète peut télécharger une quantité importante de données et consommer espace, batterie et bande passante ; l’utilisateur devra voir et contrôler ce périmètre.

### Option B — traitement serveur

1. L’application envoie l’utilisateur vers l’autorisation OAuth du fournisseur.
2. Le backend reçoit et protège le jeton.
3. Le backend interroge le fournisseur, récupère les métadonnées ou contenus nécessaires et effectue la recherche.
4. Selon le choix produit, le backend appelle un fournisseur d’IA avec une partie limitée du texte.
5. Le backend retourne réponse, extrait et lien source ; les caches et données temporaires sont supprimés selon une durée définie.

Cette option facilite la synchronisation multi-appareils, mais augmente l’impact d’une compromission du backend. Pour Google Drive en portée restreinte, un accès depuis ou via un serveur rend applicable l’évaluation de sécurité Google indiquée dans l’étude Drive.

### Option C — hybride

Une source peut être traitée localement et une autre via serveur. Chaque passage d’un appareil, d’un fournisseur cloud ou d’un prestataire constitue un flux distinct à documenter. Aucun contenu ne doit être envoyé à un service d’IA avant choix du fournisseur, examen de ses conditions et divulgation claire à l’utilisateur.

## 4. Frontières de confiance

- **Appareil utilisateur :** navigateur ou app native, potentiellement partagé, perdu, compromis ou sauvegardé par le système.
- **Fournisseur cloud :** Google, Microsoft, Dropbox ou Apple ; chaque API, portée, révocation et politique est distincte.
- **Backend Famili-IA, s’il existe :** identité, sessions, jetons, contenu temporaire, index, caches et sauvegardes.
- **Prestataires :** IA, hébergement, observabilité, assistance et envoi d’e-mails ; ils ne doivent recevoir que les données nécessaires.
- **Foyer :** plusieurs personnes et comptes ; une appartenance familiale ne vaut pas permission d’ouvrir les documents d’un autre membre.

## 5. Menaces prioritaires et mesures à prévoir

| Menace / scénario | Impact | Mesures nécessaires avant pilote réel |
|---|---|---|
| Une autorisation trop large est demandée ou mal comprise | Accès non nécessaire à l’ensemble du compte, perte de confiance, refus fournisseur | Montrer clairement le fournisseur, les permissions, le périmètre réel et la finalité ; choisir le scope minimal ; ne pas présenter un Picker comme une limite d’accès s’il ne l’est pas. |
| Vol d’un jeton OAuth via stockage navigateur, serveur, journaux ou poste développeur | Lecture des fichiers jusqu’à révocation ou expiration | Flux OAuth adaptés à la plateforme ; `state`, PKCE et validation stricte des URI de retour ; ne pas mettre de secret client dans le navigateur ; stockage protégé, durée minimale, rotation/révocation et alertes d’accès anormal. |
| Accès croisé entre utilisateurs ou membres d’un foyer | Divulgation de documents personnels | Autoriser chaque requête à partir de la session vérifiée, pas d’un identifiant fourni par le client ; cloisonnement des index et caches ; tests négatifs entre comptes et rôles privés par défaut. |
| Révocation OAuth sans suppression de l’index, cache ou copie locale | L’application conserve des informations après retrait du consentement | Procédure unique de déconnexion : révoquer le jeton quand possible, bloquer les tâches, supprimer index/caches et confirmer l’état ; documenter séparément les délais des sauvegardes. |
| Contenu transmis à un fournisseur d’IA ou visible dans les journaux | Exposition à un tiers, rétention ou réutilisation non comprise | Pas d’IA distante par défaut ; envoyer uniquement les passages strictement utiles après information/consentement ; vérifier rétention, entraînement, localisation, sous-traitants et suppression ; filtrer journaux et traces. |
| Un document contient des instructions malveillantes visant l’IA (prompt injection) | Réponse trompeuse, fuite de données ou appels d’outils non voulus | Traiter le contenu du document comme donnée non fiable ; ne jamais lui permettre de modifier les permissions ou d’appeler des outils ; pas d’action d’écriture/suppression automatique ; réponses sourcées et contrôle des destinations d’outils. |
| PDF malformé, volumineux ou conçu pour épuiser l’OCR exploite le parseur ou consomme excessivement les ressources | Plantage, déni de service ou exécution de code selon les bibliothèques | Limiter taille, nombre et pages ; choisir des parseurs/OCR maintenus ; limiter le temps et la mémoire ; traiter localement ; refuser les PDF chiffrés ou les formats non pris en charge avec une explication claire. |
| Index ou texte OCR visible dans un aperçu système, un cache temporaire ou un rapport de plantage | Divulgation de contenu documentaire malgré l’absence de persistance volontaire | Garder l’index en mémoire seulement ; éviter l’exposition dans les aperçus, journaux et rapports ; supprimer les fichiers temporaires à la fermeture et à la déconnexion ; vérifier le comportement du système d’exploitation et expliquer qu’un verrouillage d’application ne remplace pas le chiffrement appareil. |
| Journaux, sauvegardes ou outils de support copient des données | Exposition secondaire plus difficile à supprimer | Ne pas journaliser contenu, questions ou jetons ; inventorier sauvegardes et prestataires ; restreindre l’accès au support ; définir rétention et procédure d’effacement. |
| API en panne, permission révoquée ou index périmé affiché comme complet | Décision erronée, fausse assurance de couverture | Afficher état, date de synchronisation, périmètre et erreurs ; distinguer absence de résultat d’une source inaccessible ; ne pas prétendre que l’index est exhaustif s’il ne l’est pas. |

## 6. Décisions de conception restant bloquantes

1. Quelle qualité OCR, vitesse et taille/nombre maximal de pages sont acceptables sur les appareils iOS et Android visés ? La limite de 20 pages dans la démo est provisoire.
2. Capacitor convient-il aux fonctions natives requises, notamment l’OCR local sur les deux plateformes, ou faut-il retenir React Native/Flutter malgré la réécriture de l’interface ? Le branchement natif actuel est un essai technique, pas une décision finale de framework.
3. Quel type de compte est ciblé au départ : une personne seule, ou un foyer avec des espaces privés et partagés distincts ?
4. Le fournisseur confirme-t-il les scopes et méthodes API exacts nécessaires au parcours de sélection de fichiers Google Drive ?
5. L’accès à l’espace cloud complet et la recherche multi-fournisseurs pourront être réévalués ultérieurement, après validation du premier MVP ; aucun périmètre ni calendrier n’est encore engagé.

## 7. Seuils avant toute donnée réelle

Ne pas connecter de compte personnel ni traiter de document réel avant que les conditions suivantes soient satisfaites :

- le fournisseur confirme ou approuve les scopes et méthodes nécessaires ;
- le schéma de flux et les prestataires ont été arrêtés, y compris l’IA et l’observabilité ;
- les durées de contenu, index, jetons, journaux et sauvegardes sont définies et visibles ;
- révocation, suppression, isolation entre comptes et gestion des erreurs sont implémentées puis testées ;
- les fichiers malformés, refus d’autorisation, jetons expirés et accès croisés sont couverts par des tests ;
- le modèle de menace est revu à partir de l’architecture construite, et les risques importants sont traités ou formellement acceptés ;
- les revues fournisseur, sécurité, protection des données et exigences juridiques applicables sont terminées avant le pilote.

## Références internes

- [Feuille de route Famili-IA](./ROADMAP.md)
- [Étude Google Drive](./ETUDE_GOOGLE_DRIVE.md)
- [Étude de faisabilité multi-cloud](./ETUDE_FAISABILITE_CLOUDS.md)

## Documentation officielle consultée

- [Capacitor — présentation et plugins natifs](https://capacitorjs.com/docs)
- [Capacitor — iOS et configuration Xcode](https://capacitorjs.com/docs/ios)
- [Capacitor — Android et configuration Android Studio](https://capacitorjs.com/docs/android)
- [React Native — Turbo Native Modules](https://reactnative.dev/docs/turbo-native-modules-introduction)
- [Flutter — canaux de plateforme](https://docs.flutter.dev/platform-integration/platform-channels)
