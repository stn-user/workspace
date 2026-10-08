# Étude préliminaire — Google Drive

**Vérifiée le : 8 octobre 2026**  
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

**Orientation retenue pour le MVP (8 octobre 2026) :** commencer avec Google Picker et l’accès limité aux fichiers choisis (`drive.file`), sans recherche automatique dans tout le Drive. Cette décision reste conditionnée à la validation des méthodes API, formats et exigences OAuth exacts avant toute connexion réelle.

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
