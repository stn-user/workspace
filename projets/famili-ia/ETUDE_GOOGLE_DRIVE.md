# Étude préliminaire — Google Drive

**Vérifiée le : 9 octobre 2026**
**Objet :** faisabilité du parcours « poser une question et retrouver l’information dans Google Drive », avec un principe de permissions minimales.

Cette note est un cadrage technique fondé sur la documentation Google, pas un avis juridique ni une confirmation préalable de l’éligibilité de Famili-IA à une portée OAuth donnée. Google peut modifier ses règles, seuils et processus ; ils devront être revérifiés avant une intégration et avant le lancement.

## Conclusion essentielle : deux produits possibles derrière la même promesse

### A. L’utilisateur choisit les fichiers à interroger

- Le Google Picker permet à l’utilisateur de sélectionner des fichiers Drive depuis l’interface de l’application.
- La portée `drive.file` est non sensible et vise l’accès par fichier aux documents créés par l’application ou explicitement ouverts/partagés avec elle via un sélecteur.
- On peut alors rechercher dans les fichiers sélectionnés, sous réserve de vérifier les méthodes et formats utilisés.
- C’est le parcours le plus compatible avec le principe de moindre privilège, mais Famili-IA **ne parcourt pas automatiquement tout le Drive** : l’utilisateur choisit d’abord le périmètre.
- Une portée non sensible ne signifie pas qu’il n’y a aucune exigence OAuth, de transparence, de sécurité ou de protection des données.

### B. Famili-IA recherche dans tout le Drive

- L’API Drive permet de lister des fichiers et de filtrer le texte indexé avec une requête `fullText contains`.
- Pour télécharger le contenu de tous les fichiers, la portée `drive.readonly` (lecture et téléchargement de tous les fichiers Drive) est classée **restreinte**.
- `drive.metadata.readonly` est également restreinte et ne donne accès qu’aux métadonnées ; elle ne suffit pas à lire les documents pour en extraire une réponse.
- Google indique que les portées restreintes Drive sont réservées à certaines catégories d’applications, notamment « productivité et éducation » lorsque l’interface principale interagit avec les fichiers Drive, leurs métadonnées ou permissions. La recherche Famili-IA pourrait relever de cette catégorie si cette interaction est bien sa fonction principale, mais seul le processus de vérification Google peut le confirmer.
- Les portées restreintes requièrent la vérification Google, sauf exception applicable. Une application grand public ne doit pas présumer bénéficier de l’exception prévue pour une application utilisée uniquement au sein de son propre domaine Google Workspace.
- Si l’application peut accéder aux données restreintes depuis ou via un serveur tiers, Google demande une évaluation CASA par un évaluateur approuvé, puis un renouvellement au moins tous les 12 mois pour maintenir l’accès. Un traitement strictement sur l’appareil pourrait éviter cette exigence spécifique au serveur, mais ne dispense ni de la vérification des portées ni des règles de données ; le périmètre exact doit être confirmé avec Google. Le coût doit être chiffré auprès d’évaluateurs approuvés ; une revue indépendante générale ne vaut **pas** automatiquement cette évaluation Google.

**Décision produit à prendre avant l’intégration :** est-ce acceptable de demander à l’utilisateur de choisir les fichiers à interroger, ou la promesse nécessite-t-elle de chercher immédiatement dans l’ensemble de son Drive ? La seconde option implique un accès beaucoup plus large et un parcours de vérification plus lourd.

**Orientation retenue pour le MVP (8 octobre 2026) :** commencer avec Google Picker et l’accès limité aux fichiers choisis (`drive.file`), sans recherche automatique dans tout le Drive. Les méthodes API, formats et exigences OAuth doivent être validés avant tout pilote ou traitement de données personnelles ; une preuve de développement peut uniquement tester le flux web avec des fichiers synthétiques explicitement sélectionnés et le scope minimal.

La comparaison avec Google Photos, OneDrive, Dropbox et iCloud est documentée dans [ETUDE_FAISABILITE_CLOUDS.md](./ETUDE_FAISABILITE_CLOUDS.md).

## Vérification de l’accès étendu — prochaine étape, sans contenu réel

La documentation officielle laisse une voie possible, mais conditionnelle : une app de productivité peut demander les portées restreintes si sa fonction principale satisfait les critères Google. Ce n’est donc ni un refus automatique de Famili-IA, ni une autorisation acquise. Le principal point de décision est la qualification de son usage de recherche dans les fichiers Drive.

Avant de créer un flux OAuth public ou de connecter un vrai compte, préparer pour la vérification Google :

- un descriptif bref du cas d’usage, des utilisateurs visés et de la raison pour laquelle l’accès limité à `drive.file` ne suffit pas ;
- les seules portées nécessaires, en distinguant l’énumération des métadonnées (`drive.metadata.readonly`) de la lecture des contenus (`drive.readonly`) ;
- un schéma indiquant où sont reçus les jetons, où le contenu est lu et traité, si un serveur ou un fournisseur d’IA peut y accéder, et ce qui est retenu ou supprimé ;
- une démonstration sur données synthétiques, une page d’accueil publique et une politique de confidentialité cohérente avec les pratiques réelles ;
- les explications de consentement, les parcours de révocation/suppression et les contrôles protégeant les jetons, contenus et index.

### Questions à soumettre dans le processus de vérification Google

1. La fonction principale Famili-IA — rechercher en langage naturel et restituer des passages de fichiers personnels — est-elle admissible dans la catégorie « productivité et éducation » pour les portées Drive restreintes ?
2. L’accès à `drive.readonly` est-il justifié par cette fonction, ou Google attend-il un périmètre plus limité ou un parcours `drive.file` ?
3. Pour une application native qui traite le contenu strictement sur l’appareil, sans accès possible depuis un serveur Famili-IA, quelle preuve d’architecture est demandée et l’évaluation CASA s’applique-t-elle ?
4. Si un backend reçoit les jetons ou télécharge temporairement les fichiers, l’application doit-elle effectuer CASA avant la mise en production et quels niveaux/exigences s’appliquent ?
5. Quelles divulgations et garanties sont requises si l’utilisateur demande une réponse générée à partir de passages transmis à un fournisseur d’IA ?
6. Quel est le dossier exact à fournir, le délai de vérification et le coût prévisible de CASA auprès d’un évaluateur approuvé pour l’architecture retenue ?

Ces réponses ne sont pas présumées acquises : les consigner dans la console OAuth/Verification Center ou dans la réponse formelle de Google. Google ne publie pas de tarif fixe CASA dans les pages consultées ; demander des devis à des évaluateurs agréés avant d’engager ce scénario.

## Recherche et lecture des contenus

- `files.list` peut filtrer les fichiers avec `fullText contains 'terme'`. La recherche Drive correspondante est une recherche de texte indexé, pas une compréhension sémantique d’une question en langage naturel.
- Pour répondre à une question à partir du texte, Famili-IA devra récupérer suffisamment de contenu, puis trouver et présenter des passages vérifiables. Les fichiers binaires peuvent être téléchargés (`files.get` avec `alt=media`) ; les fichiers Google Workspace peuvent être exportés (`files.export`).
- Un accès aux seules métadonnées ne permet donc pas de réaliser la réponse prévue. Les formats pris en charge et leur extraction (PDF, documents Google, etc.) restent à définir et à tester séparément.
- L’API prend en charge des quotas par projet et par utilisateur ; il faudra limiter les appels, gérer les erreurs de quota et les reprises avec temporisation.

## Vérification OAuth, sécurité et confidentialité

- Google demande de déclarer les portées réellement utilisées, de justifier leur nécessité et d’utiliser le périmètre minimal.
- Pour la mise à disposition publique, les exigences de marque OAuth comprennent notamment un site d’accueil public et une politique de confidentialité publique, hébergée sur le domaine de l’application et renseignée dans la configuration OAuth.
- La politique Google impose une explication claire des accès, usages, stockage et partages, la protection des données en transit et au repos, et limite l’utilisation aux fonctions visibles et annoncées. Les transferts à un tiers pour fournir la fonction doivent être transparents et consentis.
- L’envoi de texte à un fournisseur d’IA constituerait un flux de données distinct à documenter et à évaluer. Il faut examiner ses conditions de traitement, rétention et utilisation des données avant tout choix ; aucun fournisseur IA n’est décidé à ce stade.
- Même si Famili-IA ne garde pas les documents durablement, les lire, les télécharger ou transmettre leur contenu constitue un traitement de données. Une architecture sans stockage serveur réduit certains risques, mais ne supprime pas les obligations relatives aux accès, jetons, journaux, sous-traitants et suppressions.

## Coûts d’API publiés par Google

La documentation Drive consultée indique des quotas et précise que l’utilisation sous le seuil quotidien indiqué ne génère pas de facturation API supplémentaire ; Google indique aussi que les détails de facturation ultérieurs seront communiqués en 2026 avec préavis. Il ne faut donc pas budgéter l’API Drive comme un coût par utilisateur déjà établi, mais surveiller les quotas et revérifier les conditions tarifaires avant le lancement.

Cette estimation ne couvre pas l’hébergement, la base de données, les services d’extraction, l’IA, l’évaluation CASA ni les coûts commerciaux et juridiques.

## Sources officielles

- [Choisir les portées OAuth Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Sélecteur Google Drive (Picker)](https://developers.google.com/workspace/drive/picker/guides/overview)
- [Rechercher des fichiers dans Drive](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Termes de recherche `fullText`](https://developers.google.com/workspace/drive/api/guides/ref-search-terms#file-properties)
- [Télécharger ou exporter le contenu](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Vérification des portées OAuth restreintes et évaluation de sécurité](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Politique relative aux données utilisateur des API Google](https://developers.google.com/terms/api-services-user-data-policy)
- [Quotas et seuils de l’API Drive](https://developers.google.com/workspace/drive/api/guides/limits)

## Parcours local de démonstration — 9 octobre 2026

Le bouton « Drive (démo) » présente trois documents synthétiques. Les exemples sélectionnés sont ajoutés à l’index mémoire local pour tester le parcours de sélection et de recherche. L’interface avertit qu’aucun compte n’est connecté et qu’aucun fichier Drive réel n’est consulté ou téléchargé.

Ce parcours fictif reste distinct du flux web réel décrit ci-dessous : il n’utilise pas le SDK Google Picker, OAuth, une portée `drive.file`, ni des requêtes réseau. Il ne prouve pas l’éligibilité des scopes, la compatibilité des méthodes d’API ou la conformité du parcours réel.

## Première connexion réelle depuis le navigateur — préparation locale

Un parcours web réel est maintenant implémenté derrière le bouton « Connecter Google Drive », distinct de la démo fictive. Il demande uniquement `https://www.googleapis.com/auth/drive.file`, déclenche OAuth à la suite du clic, puis ouvre le Google Picker officiel. L’application ne demande pas `drive.readonly`, ne parcourt pas le Drive et ne traite que les identifiants remis par le Picker. Les types sont limités aux PDF, TXT, Markdown et Google Docs (exportés en texte brut). Le contenu est récupéré directement par le navigateur depuis l’API Google, puis gardé en mémoire pour la session ; aucun backend Famili-IA, journal de contenu ou service d’IA n’est utilisé. La limite existante s’applique : 10 Mo/20 pages pour PDF, 1 Mo pour les textes. Les PDF scannés restent non pris en charge en web sans OCR natif. Ce flux est réservé au navigateur web : il est bloqué dans la WebView Capacitor ; l’intégration mobile native devra utiliser le parcours OAuth système approprié plutôt que d’embarquer le Picker web.

Le jeton d’accès reste en mémoire JavaScript uniquement ; il n’est pas écrit dans `localStorage`, un cookie ou un fichier. « Retirer mes fichiers » efface les données de session et demande à Google de révoquer l’autorisation ; si Google ne confirme pas cette révocation, l’interface le signale. La révocation reste aussi disponible depuis les paramètres de sécurité du compte Google.

### Configuration préalable dans Google Cloud

1. Créer ou choisir un projet Google Cloud dédié au prototype et activer Google Drive API et Google Picker API.
2. Configurer l’écran de consentement OAuth en mode test et ajouter le compte Google qui servira au test comme utilisateur de test. N’utiliser que des fichiers synthétiques sélectionnés spécifiquement ; ne pas choisir « tout le Drive » ni des documents personnels.
3. Créer un identifiant OAuth de type **Application Web** avec origine JavaScript autorisée `http://localhost:5173`. Le client secret n’est pas nécessaire et ne doit jamais être placé dans l’application web.
4. Créer une clé API, restreindre son référent HTTP à `http://localhost:5173/*` et limiter les API autorisées à Google Picker API lorsque cette restriction est disponible.
5. Relever le numéro du projet Google Cloud, requis par Picker comme `appId`.
6. Copier `.env.example` vers `.env.local` et renseigner `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` et `VITE_GOOGLE_APP_ID`. Ces valeurs de navigateur ne sont pas des secrets ; conserver quand même la clé API restreinte. `.env.local` est ignoré par Git. Ne jamais ajouter de client secret ou jeton OAuth.
7. Redémarrer Vite, puis ouvrir `http://localhost:5173` sur le même ordinateur. Les origines `localhost` sont prévues pour le développement web local ; ne pas utiliser l’adresse IP HTTP du réseau local pour l’autorisation OAuth.
8. Depuis l’écran d’accueil, choisir « Ajouter des documents », puis « Google Drive ». Vérifier le nom de la portée `drive.file`, puis sélectionner un unique PDF/TXT/Markdown synthétique ou Google Doc fabriqué pour le test. Vérifier l’extraction, la provenance et le retrait/révocation.

**Test depuis un iPhone sur le réseau local :** `localhost` désigne l’appareil qui ouvre l’URL. Sur l’iPhone, l’application utilise donc l’origine de l’ordinateur, par exemple `http://192.168.0.24:5173`, qui ne correspond pas à `http://localhost:5173` et provoque l’erreur Google `400: origin_mismatch`. Ne pas ajouter cette origine HTTP LAN pour contourner l’erreur. Pour tester sur iPhone, servir l’application depuis une origine HTTPS accessible au téléphone (hébergement HTTPS de test ou tunnel HTTPS temporaire), puis ajouter cette origine exacte aux origines JavaScript autorisées du client OAuth et son référent HTTPS à la restriction de la clé API. Révoquer ou retirer ces autorisations de test et fermer l’accès temporaire après l’essai. N’utiliser que des fichiers synthétiques ; ne pas exposer le serveur de développement à Internet sans protection.

Lorsque la configuration est présente, les bibliothèques publiques Google sont chargées au démarrage de la page ; aucun consentement ni accès aux fichiers ne survient avant le choix explicite de Google Drive. Si une autorisation est refusée ou si un identifiant manque, l’interface affiche l’erreur et ne retombe pas silencieusement sur des données fictives. Tant que les identifiants ne sont pas renseignés, l’option Google Drive est désactivée et explique son indisponibilité ; les exemples de démonstration restent distincts des fichiers réels.

### Parcours de choix des sources du prototype

À la première ouverture, l’écran d’accueil propose d’ajouter des documents ou d’explorer la démonstration. Le choix « Sur cet appareil » ouvre le sélecteur de fichiers du système et accepte uniquement TXT, Markdown et PDF ; les photos ne sont pas encore prises en charge. Google Drive est disponible uniquement dans le navigateur web configuré et reste explicitement indisponible dans l’application native tant que son flux OAuth mobile n’a pas été validé. Les exemples de démonstration sont fictifs et ne demandent aucun compte. Le choix d’accueil est mémorisé localement dans le navigateur ; le contenu des fichiers, lui, reste en mémoire de la session uniquement.

**Résultat de la preuve Drive web — 9 octobre 2026 :** le porteur du projet a téléversé `facture-piscine.txt`, fichier synthétique fourni avec le prototype, dans le compte de test, puis l’a sélectionné via le Picker officiel. Il confirme que la recherche « Combien ai-je payé pour ma piscine ? » a affiché le montant attendu de 8 900 euros avec une provenance Drive. Le retrait des fichiers a ensuite été suivi de la confirmation de révocation Google. Cette preuve couvre un TXT synthétique et un navigateur de bureau seulement ; elle ne valide pas les PDF, l’OCR, les limites en conditions extrêmes, d’autres types Google Workspace, l’application native ou un accès au Drive entier. Le compte et ses jetons ne sont pas conservés par Famili-IA.

Un PDF synthétique à couche texte, `samples/facture-piscine.pdf`, a ensuite été testé de bout en bout. Sa lecture locale a extrait le montant attendu ; après téléversement puis sélection depuis Drive, la même recherche a extrait 8 900 euros et affiché la provenance « Google Drive · copie temporaire locale ». Le retrait des fichiers a de nouveau confirmé la révocation. La preuve porte sur un seul PDF numérique d’une page, sur ordinateur.

### Limites et critères de cette preuve

Cette preuve démontre qu’une application web locale peut obtenir, après consentement, un accès `drive.file` aux fichiers TXT et PDF numériques choisis, les lire, rechercher une information attendue, indiquer leur provenance, puis retirer le contenu de la session et révoquer l’accès selon le retour du porteur. Elle ne valide pas les limites maximales de taille/pages, l’accès à toute la bibliothèque, la viabilité commerciale, la publication OAuth, la conformité juridique, la version iOS/Android native, ni l’OCR des scans. Le contenu choisi est transmis directement par le navigateur à Google pour OAuth/Picker/lecture ; il n’est pas transmis à Famili-IA ou à un fournisseur d’IA. Google traite nécessairement les opérations de compte/API selon ses propres règles.
