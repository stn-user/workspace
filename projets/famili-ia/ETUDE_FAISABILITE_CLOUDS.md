# Faisabilité préliminaire — connecteurs de stockage et de photos

**Vérifiée le : 8 octobre 2026**  
**Sources :** documentation officielle Google, Microsoft, Dropbox et Apple consultée à la date indiquée.  
**But :** déterminer si Famili-IA peut tenir la promesse « poser une question et retrouver l’information » à travers Google Drive, Google Photos, OneDrive, Dropbox, iCloud Drive et Photos iCloud.

Cette étude est un cadrage de produit et de plateforme, pas une approbation OAuth des fournisseurs, un avis juridique ou une garantie de disponibilité. Les règles, quotas et processus de validation peuvent évoluer ; chaque intégration devra refaire ces vérifications sur les appels et formats réellement prévus.

## Résumé exécutif

**La promesse est techniquement envisageable pour plusieurs services, mais pas sous la forme d’un accès universel et uniforme à tous les clouds.** Chaque connexion impose son OAuth, ses permissions, ses écrans de consentement et ses limitations. Certains services rendent possible une lecture déléguée des fichiers du compte ; d’autres ne proposent aux applications tierces qu’une sélection explicite, ou pas d’API publique pour parcourir le coffre personnel.

| Source | Fichiers choisis par l’utilisateur | Parcours de l’ensemble du coffre | Faisabilité pour « demander et retrouver » |
|---|---|---|---|
| **Google Drive** | Oui, via Picker et `drive.file` | Possible techniquement avec une portée de lecture plus large, classée restreinte et soumise à vérification | **Possible sous conditions** ; accès global coûteux en confiance, conformité et sécurité |
| **Google Photos** | Photos Picker permet la sélection d’éléments | L’API Library ne permet plus de parcourir la bibliothèque personnelle complète | **Éligibilité du cas de recherche IA à confirmer** ; ne pas planifier avant accord Google |
| **OneDrive** | Oui, via File Picker | Microsoft Graph permet les opérations list/read/download avec consentement délégué | **Faisable** ; l’interface Picker ne signifie pas forcément que le jeton OAuth est limité aux seuls fichiers sélectionnés |
| **Dropbox** | Oui, avec Chooser / liens choisis selon le scénario | Oui, avec une application « Full Dropbox », scopes read et approbation de production | **Faisable**, mais accès complet explicitement sensible du point de vue de la confiance |
| **iCloud Drive** | Via le sélecteur de documents sur une app Apple compatible | Aucune API publique Apple identifiée pour qu’un service tiers parcoure l’iCloud Drive personnel | **Sélection locale seulement** ; pas de connecteur cloud web équivalent |
| **Photos iCloud** | Photos Picker natif, choix limité par l’utilisateur | PhotoKit peut lire la photothèque entière sur l’appareil si l’utilisateur accorde l’autorisation complète | **Possible sur app native Apple**, index local requis ; pas un accès cloud serveur |

## Par fournisseur

### Google Drive — compromis entre portée restreinte et recherche automatique

- Google Picker permet à une personne de choisir les fichiers à partager avec l’application. La portée OAuth `drive.file` est non sensible et l’accès est associé aux fichiers que l’utilisateur a explicitement ouverts, créés ou choisis.
- Cette voie limite l’étendue initiale, mais l’utilisateur doit choisir des fichiers ; elle ne réalise pas une découverte silencieuse de tout le Drive.
- L’API peut lister des fichiers et filtre le texte indexé avec `fullText contains`. Cela ne comprend pas une question en langage naturel et ne remplace pas la lecture/exportation du contenu nécessaire pour extraire une réponse.
- Pour lire tout le contenu du Drive, il faudrait notamment examiner `drive.readonly`, portée restreinte. Google demande une vérification pour les portées restreintes, confirme l’éligibilité de certains types d’applications et exige, si les données restreintes sont accessibles depuis ou via un serveur, une évaluation de sécurité par un évaluateur approuvé renouvelée annuellement.
- L’éligibilité de Famili-IA et l’acceptation de la portée ne sont pas garanties.

**Conclusion :** commencer avec Picker et les fichiers choisis est le MVP prudent. Ne pas promettre l’indexation automatique de tout Drive avant confirmation écrite/de vérification Google.

### Google Photos — choix d’éléments, pas index de toute la bibliothèque

- Depuis le 31 mars 2025, les anciennes portées permettant à une application de lire la bibliothèque Google Photos entière ont été retirées.
- La Photos Library API est recentrée sur le contenu créé par l’application. Pour sélectionner des éléments préexistants de la photothèque, Google renvoie vers la Photos Picker API.
- L’utilisateur choisit les photos/vidéos ; l’application récupère les éléments sélectionnés. Les URL d’accès aux octets (`baseUrl`) expirent après 60 minutes, parfois plus tôt si l’autorisation est révoquée.
- Il existe des quotas API publiés ; les accroître peut nécessiter une demande au programme partenaire.
- Cette architecture ne permet pas une indexation permanente et automatique de toutes les photos de l’utilisateur. Toute rétention d’extraits ou de descriptions dans Famili-IA constituerait un choix séparé à divulguer et à sécuriser.
- **Risque d’éligibilité produit à lever :** la politique Photos consultée n’autorise les usages API que pour des cas d’usage approuvés, notamment stocker, éditer, imprimer, exporter ou partager des images/vidéos, et interdit de créer un produit similaire ou concurrent de Google Photos. La recherche IA dans des photos personnelles n’est pas explicitement nommée parmi ces cas approuvés ; ne pas supposer que Famili-IA est éligible au seul motif que l’utilisateur choisit les photos. Demander une confirmation Google avant d’investir dans ce connecteur.

**Conclusion :** la sélection technique est disponible, mais l’acceptabilité du cas d’usage Famili-IA reste à confirmer par Google. Ne pas planifier de recherche IA/photo Google Photos en production sans cette réponse.

### OneDrive — API exploitable, mais attention à la portée réelle du Picker

- Microsoft Graph permet de lister les éléments d’un dossier et de télécharger le contenu d’un fichier.
- Pour l’accès délégué, la permission minimale documentée pour lister et télécharger est `Files.Read`, aussi bien sur compte personnel que professionnel/scolaire ; les permissions plus larges incluent notamment `Files.Read.All`. En mode délégué, l’application reste bornée par les droits du compte connecté. Les politiques de consentement de l’organisation peuvent toutefois nécessiter une approbation administrateur.
- Le File Picker offre un parcours familier de sélection. Sa documentation requiert néanmoins des permissions Graph déléguées, et décrit `Files.Read` pour la lecture OneDrive. **Afficher un sélecteur ne crée pas automatiquement une frontière d’autorisation au niveau des seuls fichiers sélectionnés.** La portée accordée et les méthodes demandées doivent être vérifiées sur le parcours précis.
- La vérification de l’éditeur Microsoft est principalement pertinente pour les applications multi-tenant : c’est un mécanisme de confiance/identification du développeur, pas une autorisation générale de lire les fichiers.

**Conclusion :** bonne faisabilité API pour rechercher dans le OneDrive du compte avec consentement délégué. Si l’objectif est de limiter l’application aux seuls fichiers choisis, il faudra concevoir et vérifier une véritable contrainte de moindre privilège au-delà de la seule interface Picker.

### Dropbox — lecture complète possible, avec approbation de mise en production

- L’API Dropbox utilise OAuth 2.0 et des scopes configurés dans la console développeur.
- Une application peut être limitée à son « App Folder » ou demander « Full Dropbox », qui couvre les fichiers et dossiers préexistants du compte. L’App Folder seul ne convient pas à une recherche générale dans les documents de l’utilisateur.
- L’API permet de parcourir les dossiers, y compris récursivement, avec pagination et curseurs, puis de lire le contenu via les endpoints adaptés. Il faudra prendre en charge quotas, pagination et erreurs.
- Les nouvelles applications restent en mode développement, initialement limitées au compte du développeur, avec possibilité d’ajouter des utilisateurs de test. La documentation Dropbox indique un plafond de 500 comptes en mode développement ; après 50 comptes liés, il faut obtenir l’approbation de production pour continuer à en relier. Dropbox examine la fonctionnalité et les permissions demandées.
- Le Chooser donne accès aux fichiers sélectionnés sans donner par lui-même un accès API direct permanent à l’ensemble du compte ; l’intégration exacte et la possibilité d’analyser durablement le contenu sélectionné doivent être vérifiées par rapport au flux retenu.

**Conclusion :** connecteur complet techniquement plausible. « Full Dropbox » et l’examen de production représentent une barrière produit et confiance, mais la documentation consultée ne met pas en évidence un audit de sécurité annuel systématique équivalent à la condition de Google pour les portées Drive restreintes via serveur.

### iCloud Drive — écart majeur entre stockage iCloud d’une app et fichiers de l’utilisateur

- CloudKit est une plateforme permettant à une application de synchroniser **ses propres données d’application** avec iCloud. Ce n’est pas une API générale pour parcourir les fichiers personnels iCloud Drive d’un utilisateur.
- Pour permettre à une personne d’ouvrir un document depuis iCloud Drive, Apple fournit des sélecteurs de documents dans ses plateformes (par exemple `UIDocumentPickerViewController`). L’accès correspond au document choisi et s’inscrit dans les API d’applications Apple, avec gestion de l’accès au document.
- La documentation publique Apple consultée ne révèle pas d’API web/serveur tierce qui permette à Famili-IA de parcourir ou indexer automatiquement tout iCloud Drive.

**Conclusion :** l’accès à un document choisi dans une app native Apple est un scénario possible ; un connecteur iCloud Drive complet, accessible à une application web ou à un serveur comme Drive/Dropbox, n’est pas établi et ne doit pas être promis.

### Photos iCloud — permission locale sur appareil Apple

- PhotoKit donne à une app iOS/macOS accès à la photothèque de l’appareil selon l’autorisation système accordée par l’utilisateur.
- PhotosUI/`PhotosPicker` permet un parcours de sélection explicite de contenus, cohérent avec une collecte limitée.
- Sur iOS/iPadOS, PhotoKit permet aussi de demander une autorisation de lecture plus large sur la photothèque. Si l’utilisateur accorde l’accès complet, une app native peut interroger les ressources visibles par PhotoKit, y compris les éléments gérés par Photos/iCloud, selon leur disponibilité et le chargement des originaux. Ce n’est pas un jeton permettant à un serveur Famili-IA d’interroger le compte iCloud à distance.
- Cela implique une application native ou un composant natif Apple : ce n’est pas une API générique que le serveur d’une PWA Famili-IA pourrait appeler pour lire la photothèque iCloud.
- Un accès plus large à la photothèque suppose une autorisation adaptée, une explication claire de son usage et le respect des règles de distribution Apple ; l’utilisateur peut limiter ou modifier l’accès.

**Conclusion :** un accès complet à la photothèque est techniquement envisageable pour une application native Apple lorsque l’utilisateur le donne, avec traitement et index potentiellement maintenus sur l’appareil. Il ne rend pas les photos accessibles à une PWA ou à un serveur et doit être validé sur appareils, états réseau et réglages de confidentialité réels.

## Ce que cela implique pour la promesse Famili-IA

### Une architecture commune reste possible ; une permission commune, non

On peut concevoir une expérience homogène au-dessus de connecteurs indépendants, mais chaque connecteur doit annoncer ses capacités réelles :

- sélection ponctuelle de fichiers ;
- accès continu aux fichiers choisis ;
- recherche/mise à jour automatique ;
- formats lisibles ;
- possibilité ou non de retrait/révocation ;
- données envoyées à l’appareil, au serveur ou à un fournisseur d’IA.

L’interface ne doit pas afficher « cloud connecté » comme si tous les services donnaient la même couverture. Il faut montrer le fournisseur, le périmètre autorisé, les limites connues, la dernière synchronisation et les options de déconnexion/suppression.

### Trois niveaux de promesse à distinguer

1. **Retrouver dans les fichiers choisis par l’utilisateur** — faisable de façon transversale, mais parcours de sélection répété et capacités variables selon plateforme.
2. **Retrouver dans un dossier ou périmètre explicitement autorisé** — faisable pour certains connecteurs ; il faut confirmer si l’API permet une vraie permission restreinte plutôt qu’une simple limite d’interface.
3. **Retrouver dans tout le cloud automatiquement** — plausible sur certains connecteurs (notamment Dropbox et OneDrive délégué), restreint et soumis à approbation pour Google Drive, limité et d’éligibilité produit incertaine pour Google Photos, non établi pour iCloud Drive tiers. La photothèque iCloud est un cas distinct : accès complet possible depuis une app Apple native autorisée, pas depuis le serveur.

**Conséquence produit :** un produit de recherche multi-source reste techniquement envisageable ; la promesse universelle « connectez vos clouds, Famili-IA indexe tout », en revanche, n’est pas garantie par les interfaces documentées. Il faut annoncer les capacités source par source. Une app mobile native pourrait apporter un accès local plus large aux fichiers/photos disponibles sur le terminal, mais ne résout ni les restrictions serveur Google, ni l’absence d’API iCloud Drive distante, ni l’incertitude d’éligibilité de Google Photos.

## Décision provisoire par connecteur

| Connecteur | Décision de faisabilité | Condition ou blocage principal |
|---|---|---|
| Google Drive — fichiers choisis | **GO pour un prototype OAuth sans vrais contenus** | Tester Picker + `drive.file` et confirmer les méthodes/formats requis. |
| Google Drive — tout le compte | **GO conditionnel** | Google doit valider les portées restreintes et l’éligibilité de Famili-IA ; si le serveur accède aux données, prévoir l’évaluation CASA applicable et son coût récurrent. |
| Google Photos | **NO-GO production à ce stade** | Confirmer par écrit que la recherche IA de Famili-IA est un usage autorisé ; le Picker n’établit pas cette éligibilité et l’accès complet à la bibliothèque n’est plus disponible. |
| OneDrive | **GO conditionnel** | Prototype de lecture déléguée Graph envisageable ; valider scopes, comptes personnels/professionnels et parcours de consentement. Le Picker ne limite pas à lui seul le jeton aux seuls fichiers choisis. |
| Dropbox | **GO conditionnel** | Full Dropbox + scopes de lecture et approbation de production selon les seuils Dropbox ; prévoir pagination, quotas et parcours de confiance. |
| iCloud Drive | **NO-GO pour un connecteur complet distant** | Pas d’API publique identifiée pour parcourir le compte ; garder le parcours de documents explicitement choisis dans une app Apple. |
| Photos iCloud | **GO conditionnel pour app Apple native, index local** | PhotoKit peut lire toute la photothèque si autorisé ; vérifier disponibilité des originaux iCloud, synchronisation, traitement local, sécurité de l’index et règles de distribution Apple. Pas d’accès serveur. |

## Architecture : PWA/serveur ou app native/index local ?

| Option | Atouts | Limites et risques | Pertinence pour Famili-IA |
|---|---|---|---|
| **PWA avec backend** | Un seul client web ; synchronisation continue et traitement/index centralisés plus simples ; facilite une expérience multi-appareils. | Le serveur devient un point sensible pour les jetons et contenus. Pour Drive restreint, un accès serveur déclenche l’évaluation CASA annuelle applicable. Exige isolation, chiffrement, révocation, suppression et contrôle des sous-traitants. Ne peut pas utiliser PhotoKit ni parcourir iCloud Drive. | Adaptée à une recherche serveur multi-cloud si Google autorise les scopes et si le budget CASA est acceptable ; mauvais choix si l’objectif prioritaire est que le contenu ne transite jamais par un serveur Famili-IA. |
| **PWA, traitement local** | Contenus traités dans le navigateur ; limite l’exposition à un backend Famili-IA et peut servir un premier parcours web. | Le navigateur ne donne pas accès à toute une photothèque/cloud par magie ; OAuth et jetons restent à protéger côté client. Capacités de stockage, indexation, synchronisation en arrière-plan et fonctionnement multi-appareils limités. Ne débloque ni Google Photos complet ni iCloud Drive complet. | Utile pour tester le parcours sur fichiers choisis ; pas une solution uniforme pour les bibliothèques cloud entières. |
| **App mobile native, index local** | Peut exploiter les API système. Sur Apple, PhotoKit peut autoriser la photothèque complète localement ; les connecteurs cloud peuvent télécharger et indexer au fil de l’eau. Contenu et index peuvent rester sur le terminal si aucune fonction distante ne les transmet. | Viser iOS et Android dès le départ demande un socle partagé avec modules natifs ou deux applications séparées. Disponibilité réseau et espace disque, limites de tâches en arrière-plan, protection du cache/index et migration entre appareils restent à traiter. Le traitement local ne supprime pas les vérifications OAuth ni les règles fournisseur ; Google Drive complet reste soumis à acceptation. iCloud Drive reste sans parcours tiers de découverte générale. | Piste retenue pour l’orientation produit, avec développement iOS/Android parallèle à cadrer ; elle réduit l’exposition serveur, mais ne garantit pas la couverture de tous les clouds. |
| **Hybride** | Peut combiner connecteurs serveur et fonctions locales par source ; permet une évolution progressive. | Plus de chemins de données à expliquer et sécuriser ; le moindre envoi d’extraits à un backend ou à un service IA doit être documenté et peut rendre applicable l’examen serveur Google. | Probablement réaliste à terme si chaque source affiche clairement son mode de traitement ; à éviter avant d’avoir démontré le besoin et la faisabilité des premiers connecteurs. |

**Orientation de travail retenue le 9 octobre 2026 :** privilégier une app native et un index local sur iOS et Android, sans envoyer le contenu à un serveur Famili-IA. Le modèle retenu est un code partagé avec des modules natifs spécifiques ; Capacitor sera le premier candidat à évaluer, sans décision finale de framework. Cette orientation réduit un point central d’exposition, mais ne règle pas l’éligibilité OAuth Google, n’accorde pas l’accès complet à chaque fournisseur et n’évite pas le traitement de données sur l’appareil. L’IA distante est hors périmètre par défaut ; toute transmission à un service tiers demandera une décision et une information distinctes.

## Protocole OAuth sans lecture de fichiers — OneDrive et Dropbox

Ce test vérifie uniquement l’inscription développeur, le consentement OAuth, le rappel d’authentification et les scopes effectivement retournés. Il ne prouve pas encore que l’API peut lister ou télécharger tout le contenu ; cette étape ultérieure devra utiliser un compte de test et des fichiers synthétiques uniquement.

| Étape | OneDrive / Microsoft Graph | Dropbox |
|---|---|---|
| Enregistrement | Créer une app de test dans Microsoft Entra ; privilégier un compte développeur/test et un client public avec authorization code + PKCE. | Créer une app de test en mode développement ; choisir Full Dropbox si le test porte sur l’accès étendu et déclarer les scopes requis. |
| Autorisation | Demander seulement la permission déléguée `Files.Read` si le test doit préparer le périmètre « lire les fichiers du compte » ; relever toute demande d’approbation administrateur. | Demander uniquement `files.metadata.read` et `files.content.read` pour préparer l’accès aux fichiers ; noter que le consentement Full Dropbox a un périmètre plus large que l’App Folder. |
| Ce qui est vérifié | Succès/échec du retour OAuth, compte personnel ou organisationnel, scopes `scp` accordés et comportement du consentement. Ne pas appeler les routes de fichiers. | Succès/échec du retour OAuth et scopes retournés ; ne pas appeler `list_folder`, `download` ni autre route de contenu. |
| Protection | Ne jamais journaliser ou coller les jetons ; stockage temporaire en mémoire pendant le test, révocation ensuite, URI de rappel locale exacte. | Même règle ; supprimer le jeton à la fin et déconnecter l’app de test depuis les paramètres de compte. |
| Résultat attendu | Fiche de preuve : permission demandée/accordée, compte testé, avertissement ou blocage d’administrateur, date et capture du consentement sans information secrète. | Fiche de preuve : type d’accès, scopes demandés/accordés, éventuel avertissement, état du mode test et étapes d’approbation de production. |

Ne pas partager avec Famili-IA ni inscrire dans le dépôt des mots de passe, jetons, secrets client ou fichiers personnels. La création des applications de test exige que le propriétaire du projet utilise ses propres consoles développeur. Quand les identifiants OAuth de test seront créés, ils devront rester dans un stockage local ignoré par Git ; ne pas les envoyer dans le chat.

## Signal de confiance et conditions de faisabilité

Le porteur du projet rapporte que les personnes consultées souhaitent connecter l’ensemble de leurs clouds et sont fortement confiantes, y compris face à une demande d’accès complet depuis le smartphone. C’est un signal utile sur l’acceptabilité initiale des permissions, mais pas une autorisation technique ou contractuelle du fournisseur.

Avant un MVP réellement multi-cloud, la faisabilité est donc conditionnée à quatre validations séparées :

1. **Validation d’usage :** mesurer sur un échantillon documenté si les utilisateurs maintiennent cette préférence après explication concrète des fichiers concernés, du contenu lu, de l’indexation et de la révocation.
2. **Validation fournisseur :** obtenir/terminer les vérifications et approbations pour les scopes exacts ; Google Drive restricted-scope et Google Photos sont des dépendances particulièrement importantes.
3. **Validation d’architecture :** choisir si le texte et les index sont traités sur smartphone, sur serveur ou en hybride. Le traitement sur appareil peut réduire l’exposition des contenus mais implique une app native, des limites de mémoire/batterie, des téléchargements et des index locaux à protéger.
4. **Validation économique :** chiffrer les éventuelles revues de sécurité et approbations par fournisseur, l’extraction de documents, le stockage d’index, la synchronisation, le support et l’IA avant d’ajouter chaque source.

## Risques, coûts et contrôles à anticiper

- **OAuth et revues fournisseur :** temps de préparation, page d’accueil publique, politique de confidentialité, explication des permissions, démonstration et approbations selon chaque programme. Google Drive en portée restreinte est le cas le plus contraignant identifié.
- **Sécurité spécialisée :** si un service traite les données Google Drive restreintes depuis/à travers son serveur, l’évaluation annuelle approuvée par Google peut devenir un coût récurrent significatif. Demander un devis à un évaluateur agréé avant de choisir cette architecture.
- **Programme Dropbox :** demande d’approbation de production à planifier avant de dépasser les seuils de test publiés.
- **Écosystème Apple :** l’accès iCloud/Photos par les API système implique une stratégie applicative native et des tests sur appareils Apple. Vérifier les coûts et règles du programme Apple Developer avant publication ; ces coûts ne sont pas nécessaires pour un prototype web local.
- **IA et index :** l’API cloud n’inclut pas le coût d’extraction, de stockage d’index, de recherche ou d’IA. Toute transmission de contenu à un tiers doit avoir une justification, un consentement et des conditions de traitement appropriées.
- **Absence de stockage durable :** peut réduire l’exposition et le budget, mais n’annule ni OAuth, ni les obligations de traitement, ni les règles de la plateforme.
- **Pas de coût unifié par API :** les quotas et modèles diffèrent, et l’hébergement, le réseau, le traitement de contenu et les évaluations sont distincts. Chiffrer séparément chaque scénario une fois l’architecture choisie.

## Recommandation de cadrage

1. Garder le MVP sur un seul fournisseur, Google Drive, avec fichiers explicitement sélectionnés via Picker (`drive.file`) comme orientation prudente.
2. Valider le besoin avec les tests du prototype avant d’implémenter plusieurs connecteurs.
3. Si le test révèle que la sélection de fichiers détruit l’utilité du produit, traiter l’accès étendu comme un **risque bloquant à valider auprès du fournisseur**, et non comme un détail technique.
4. Prévoir l’architecture avec des connecteurs séparés et un modèle de capacité explicite ; ne jamais centraliser toutes les autorisations ni supposer les mêmes droits entre clouds.
5. Prioriser ensuite les extensions selon la demande et les droits réels : Dropbox/OneDrive sont candidats à une recherche de fichiers avec OAuth délégué ; Google Photos exige de confirmer l’éligibilité du cas d’usage ; Photos iCloud peut être étudié dans un client Apple natif ; iCloud Drive complet reste hors périmètre tant qu’Apple ne documente pas d’API tierce adaptée.
6. Avant toute donnée réelle : confirmer chaque permission et examen en écrivant le parcours API, le stockage, les services tiers, les durées, la révocation et la suppression ; faire examiner le modèle de menace.

## Sources officielles

### Google Drive

- [Portées OAuth Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Picker](https://developers.google.com/workspace/drive/picker/guides/overview)
- [Recherche de fichiers Drive](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Téléchargement et export](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Vérification des portées restreintes et CASA](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

### Google Photos

- [Mise à jour des API Photos et retrait des portées bibliothèque](https://developers.google.com/photos/support/updates)
- [Démarrer avec Photos Picker](https://developers.google.com/photos/picker/guides/get-started-picker)
- [Accéder aux éléments sélectionnés et durée des URL](https://developers.google.com/photos/picker/guides/media-items)
- [Quotas Photos API](https://developers.google.com/photos/overview/api-limits-quotas)
- [Politique d’usage de l’API Google Photos](https://developers.google.com/photos/support/api-policy)

### OneDrive / Microsoft Graph

- [Permissions Microsoft Graph](https://learn.microsoft.com/en-us/graph/permissions-overview)
- [Lister les éléments d’un dossier — permissions déléguées](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0)
- [Télécharger le contenu d’un driveItem — permissions minimales](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)
- [OneDrive File Picker](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/?view=odsp-graph-online)
- [Vérification éditeur Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)

### Dropbox

- [OAuth, scopes et niveaux App Folder / Full Dropbox](https://docs.dropboxapi.com/dropbox-api/docs/oauth.md)
- [Parcourir les fichiers et dossiers](https://docs.dropboxapi.com/dropbox-api/docs/file-access.md)
- [Guide développeur et approbation de production](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide.md)
- [Autorisation OAuth et PKCE](https://docs.dropboxapi.com/dropbox-api/docs/get-started/authorization.md)

### Apple / iCloud

- [CloudKit](https://developer.apple.com/icloud/cloudkit/)
- [Sélecteur de documents Apple](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller)
- [PhotosPicker (PhotosUI)](https://developer.apple.com/documentation/photosui/photospicker)
- [PHPhotoLibrary et accès à la photothèque](https://developer.apple.com/documentation/photos/phphotolibrary)
- [Niveau d’autorisation PhotoKit](https://developer.apple.com/documentation/photos/phaccesslevel)
