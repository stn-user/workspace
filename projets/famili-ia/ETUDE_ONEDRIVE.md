# OneDrive personnel Web — parcours expérimental

## Configuration et essai

1. Dans Microsoft Entra, enregistrer une application acceptant les comptes Microsoft personnels. Ajouter la plateforme **Application monopage (SPA)** et l'URI de redirection exacte, par exemple `http://localhost:5173/microsoft-redirect.html`. La page de redirection doit être servie sans en-tête Cross-Origin-Opener-Policy empêchant la communication avec la fenêtre d'origine.
2. Autoriser la permission déléguée Microsoft Graph `Files.Read`. Copier l'identifiant d'application dans `VITE_MICROSOFT_CLIENT_ID` de `.env.local`, sans secret client : l'application est publique et s'exécute dans le navigateur. Sans cette variable, le bouton de connexion reste désactivé et l'application indique comment la configurer.
3. Redémarrer Vite après toute modification de `.env.local`, ouvrir l'origine configurée, puis choisir « Connecter OneDrive personnel ». La connexion seule ne démarre pas le parcours ; cliquer séparément sur « Indexer ou vérifier les changements OneDrive ». Pour le premier essai, utiliser un compte ou des fichiers fictifs et vérifier connexion, arrêt, recherche et rechargement.

La permission `Files.Read` peut autoriser l'accès à tous les fichiers du compte, même si l'application n'accède à leur contenu qu'après le déclenchement du parcours. Elle ne modifie ni ne supprime les originaux. Les liens de téléchargement temporaires ne sont ni enregistrés ni affichés.

## Validation effectuée et à compléter

Le 9 novembre 2026, les tests automatisés ont vérifié notamment la pagination, l'arrêt, les erreurs, les limites de lecture et la provenance. Dans le navigateur, une authentification et des réponses Graph simulées ont permis d'indexer un texte fictif et de le retrouver après rechargement. Une validation complémentaire le même jour a fait réussir les 260 tests Node, le build Vite et 13 tests Playwright ciblés, avec un identifiant Microsoft synthétique et sans connexion réelle. L'utilisateur confirme l'indexation de documents OneDrive depuis son smartphone, puis indique le 9 novembre que tous les tests OneDrive prévus ont réussi sur son parcours : consentement, absence d'indexation avant action, dossiers/pages, formats et recherche après rechargement, arrêt et reprise, déconnexion locale, révocation, suppression des copies, refus de consentement, expiration/indisponibilité et erreurs réseau. L'appareil, le navigateur, les formats précis et les détails de chaque manipulation ne sont pas consignés ici.

Le parcours automatisé de changement de compte vérifie également que deux copies du même élément, importées avec deux comptes synthétiques, restent recherchables et portent chacune l'empreinte de leur compte d'origine. Le compte en clair n'est pas conservé ; l'empreinte SHA-256 est pseudonymisée et reste une donnée personnelle. Les copies historiques sans empreinte sont affichées comme non attribuées.

Un parcours OneDrive complet compare le nom et l'`eTag` des éléments retrouvés pour le même compte. Les éléments inchangés sont ignorés ; les changements détectés sont présentés individuellement et décochés par défaut. Le remplacement ne commence qu'après sélection et confirmation. Une erreur de lecture laisse la copie précédente et son contenu disponibles ; les annotations photo saisies par l'utilisateur sont conservées lors d'un remplacement réussi.

Un scan interrompu ou en erreur conserve les copies déjà ajoutées et ne propose pas de remplacement fondé sur un scan incomplet. La reprise est manuelle et recommence au début ; les curseurs ne sont pas persistés. Un HTTP 401/403/429 ou une erreur réseau affiche un échec et laisse une nouvelle tentative possible. Un élément absent d'un parcours, inaccessible ou supprimé n'est pas déclaré supprimé et sa copie n'est pas effacée. Les copies historiques sans empreinte de compte ne sont pas attribuées ni actualisées ; une version absente reste inconnue, sauf changement de nom qui peut être proposé sans preuve de version. Les déplacements ne sont pas suivis séparément : le chemin fournisseur n'est pas conservé. Le suivi est limité à OneDrive personnel ; Google Drive et les imports locaux n'ont pas de comparaison ni d'actualisation automatique.

Vérification simulée du 9 novembre 2026 : 262 tests Node, build Vite et huit tests Playwright du connecteur réussis. Les scénarios couvrent changement de compte, revue et confirmation d'une modification, échec de remplacement, copie historique non attribuée, scan incomplet/reprise, refus d'accès, absence d'inférence de suppression et purge concurrente ; aucun compte Microsoft réel n'a été utilisé pour ces scénarios.

## Limites et données

L'indexation parcourt progressivement les dossiers tant que l'onglet est ouvert. Elle peut être arrêtée ; une erreur ou une interruption conserve les copies déjà enregistrées. Les compteurs ne sont pas un pourcentage d'avancement ni une preuve d'exhaustivité. Le jeton est gardé en mémoire ; la reconnexion est nécessaire après rechargement.

Le texte TXT/Markdown jusqu'à 1 Mo et le texte incorporé des PDF jusqu'à 10 Mo et 20 pages sont traités. Les PDF scannés, illisibles ou trop longs et les autres formats, y compris les photos, ne fournissent que des métadonnées. Les textes extraits sont enregistrés localement avec leur provenance ; la recherche expérimentale reconstruit son index après rechargement. L'accès actuel aux originaux n'est pas vérifié.

La comparaison ne vérifie pas le contenu octet par octet ; elle s'appuie sur le nom et l'`eTag` disponible. Elle ne vérifie pas l'accès continu aux originaux et ne synchronise ni suppressions ni déplacements. La déconnexion locale efface le cache de session, sans supprimer les copies ni révoquer le consentement chez Microsoft. La révocation se fait dans les paramètres d'autorisations du compte Microsoft. Les actions de suppression de Famili-IA effacent les copies locales concernées, jamais les originaux.

L'empreinte attribue une nouvelle copie à son compte d'origine, mais ne permet pas de retrouver l'identifiant MSAL, de vérifier les droits actuels ni de réattribuer les copies historiques dépourvues d'empreinte.

Références : [liste des fichiers Graph](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0), [téléchargement dans les applications JavaScript](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0#downloading-files-in-javascript-apps), [page de redirection MSAL](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge).
