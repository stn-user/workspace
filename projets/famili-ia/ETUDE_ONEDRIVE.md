# OneDrive personnel Web — parcours expérimental

## Configuration et essai

1. Dans Microsoft Entra, enregistrer une application acceptant les comptes Microsoft personnels. Ajouter la plateforme **Application monopage (SPA)** et l'URI de redirection exacte, par exemple `http://localhost:5173/microsoft-redirect.html`. La page de redirection doit être servie sans en-tête Cross-Origin-Opener-Policy empêchant la communication avec la fenêtre d'origine.
2. Autoriser la permission déléguée Microsoft Graph `Files.Read`. Copier l'identifiant d'application dans `VITE_MICROSOFT_CLIENT_ID` dans le fichier d'environnement local, sans secret client : l'application est publique et s'exécute dans le navigateur.
3. Redémarrer Vite, ouvrir l'origine configurée, puis choisir « Connecter OneDrive personnel ». La connexion seule ne démarre pas le parcours ; cliquer séparément sur « Indexer mon OneDrive ». Pour le premier essai, utiliser un compte ou des fichiers fictifs et vérifier connexion, arrêt, recherche et rechargement.

La permission `Files.Read` peut autoriser l'accès à tous les fichiers du compte, même si l'application n'accède à leur contenu qu'après le déclenchement du parcours. Elle ne modifie ni ne supprime les originaux. Les liens de téléchargement temporaires ne sont ni enregistrés ni affichés.

## Validation effectuée et à compléter

Le 9 novembre 2026, les tests automatisés ont vérifié notamment la pagination, l'arrêt, les erreurs, les limites de lecture et la provenance. Dans le navigateur, une authentification et des réponses Graph simulées ont permis d'indexer un texte fictif et de le retrouver après rechargement. **Aucun compte Microsoft réel n'a encore été testé.** La connexion OAuth, les permissions effectivement accordées, l'arrêt pendant un parcours réel et la déconnexion restent à vérifier avec un compte et des fichiers de test.

## Limites et données

L'indexation parcourt progressivement les dossiers tant que l'onglet est ouvert. Elle peut être arrêtée ; une erreur ou une interruption conserve les copies déjà enregistrées. Les compteurs ne sont pas un pourcentage d'avancement ni une preuve d'exhaustivité. Le jeton est gardé en mémoire ; la reconnexion est nécessaire après rechargement.

Le texte TXT/Markdown jusqu'à 1 Mo et le texte incorporé des PDF jusqu'à 10 Mo et 20 pages sont traités. Les PDF scannés, illisibles ou trop longs et les autres formats, y compris les photos, ne fournissent que des métadonnées. Les textes extraits sont enregistrés localement avec leur provenance ; la recherche expérimentale reconstruit son index après rechargement. L'accès actuel aux originaux n'est pas vérifié.

Les éléments déjà présents ne sont pas actualisés : aucune synchronisation des modifications ou suppressions n'est effectuée. La déconnexion locale efface le cache de session, sans supprimer les copies ni révoquer le consentement chez Microsoft. La révocation se fait dans les paramètres d'autorisations du compte Microsoft. Les actions de suppression de Famili-IA effacent les copies locales concernées, jamais les originaux.

Références : [liste des fichiers Graph](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0), [téléchargement dans les applications JavaScript](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0#downloading-files-in-javascript-apps), [page de redirection MSAL](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge).
