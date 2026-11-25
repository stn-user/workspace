# Exécution des commandes dans Famili-IA

Pour les missions dans `projets/famili-ia`, utilise uniquement les outils réellement proposés par ta session. Ne tente pas d'appeler un outil nommé `shell` s'il n'est pas disponible.

Lorsque l'outil `run_commands` figure dans la liste des outils disponibles, utilise-le pour lancer les commandes nécessaires, en respectant son schéma et les demandes d'autorisation. S'il n'est pas disponible, utilise un autre outil d'exécution réellement proposé ; sinon, indique le blocage et demande à l'utilisateur d'exécuter la commande. N'invente jamais une sortie ni un résultat.

Pour créer ou modifier du code, utilise en priorité l'outil d'édition de fichiers réellement proposé, par exemple `editor`, selon son schéma et après lecture du contexte. Effectue des modifications ciblées, puis relis le fichier et vérifie le diff. Ne construis pas de longs scripts de remplacement dans une commande PowerShell imbriquée et n'utilise pas `echo` comme preuve qu'un fichier a été écrit : sans redirection ou outil d'écriture, il ne fait qu'afficher du texte. Préserve l'encodage, les accents et les modifications préexistantes.

Sous Windows, adapte les commandes au terminal réellement utilisé : si le terminal est déjà PowerShell, exécute directement les commandes PowerShell sans les envelopper dans `powershell -Command`. Les guillemets et antislashs d'un autre shell ne sont pas interchangeables avec ceux de PowerShell. Utilise des chemins avec `\`, évite les heredocs Unix et les opérateurs non pris en charge par la version courante. Commence, si nécessaire, par une commande courte telle que `Get-Location`, puis exécute les tests depuis le bon répertoire. Donne dans ton compte rendu les commandes réellement exécutées, leur résultat et celles qui restent non vérifiées.

Si l'exécution ou l'édition est refusée ou échoue, indique le message exact et distingue outil indisponible, autorisation refusée, erreur de commande et échec du test. Un problème de guillemets n'est pas une preuve d'un problème Unicode ou d'un outil d'édition défectueux. Essaie l'outil d'édition disponible avant de conclure à un blocage ; s'il échoue, rapporte l'appel et l'erreur sans contenu sensible. Ne contourne pas les autorisations et ne modifie pas la configuration du fournisseur ou du modèle sans accord explicite.

## Profils Cline demandés pour Famili-IA

Cette section décrit le routage voulu par l'utilisateur ; `.clinerules` ne configure pas les fournisseurs ni les modèles. Vérifie le fournisseur et le modèle réellement actifs dans Cline au début de chaque session et après tout changement de mode. N'en déduis jamais qu'un profil est actif parce qu'il est écrit ici.

- **Plan** : OmniRoute avec le modèle **NVIDIA Poolside Laguna XS**.
- **Act** : Ollama local avec **`qwen3:14B`**.
- Si le nom exact, le fournisseur, le mode ou la disponibilité diffère, arrête-toi et demande confirmation. N'effectue aucun repli automatique vers un autre fournisseur ou modèle. Ne télécharge ni n'installe le modèle local sans autorisation explicite.
- Le modèle Act `qwen3:14B` est le modèle de travail de Cline uniquement. Il ne remplace pas le modèle applicatif Famili-IA `qwen3:8b` et n'autorise aucun changement de prompt, de runtime ou de candidat produit.

### Confidentialité selon le mode

- OmniRoute/Plan est un traitement distant : ses prompts et le contexte transmis peuvent quitter la machine. Par défaut, n'y envoie que la demande reformulée et des éléments synthétiques ou déjà expurgés. N'y colle pas de code source, diff, document, photo, requête familiale, coordonnées, sortie brute, secret ou contenu de `private-key.json`/paquet de revue. Si l'analyse exige de transmettre du code ou un document du dépôt, arrête-toi et demande une autorisation explicite portant sur ces données précises.
- Ollama/Act doit rester local. Vérifie le modèle configuré et son endpoint local ; si le service ou le modèle est indisponible, signale le blocage plutôt que d'utiliser un fournisseur distant ou de télécharger un modèle.
- Ne place aucun secret, jeton, clé API ou donnée familiale dans une mission, un fichier de configuration versionné, un log ou un rapport. Utilise des fixtures synthétiques.

### Cadre d'exécution des lots Famili-IA

- Avant chaque lot Act, lis les sections pertinentes de `projets/famili-ia/DEVELOPPEMENT_PLAN.md`, `projets/famili-ia/CLAUDE.md` et `projets/famili-ia/docs/guide/developpement-assiste.md`. Vérifie les capacités dans le code ; le plan et les maquettes ne prouvent pas qu'une fonction existe.
- Un lot suit une mission bornée : état Git initial, fichiers modifiables et hors périmètre, critères mesurables, tests, documentation, limites et conditions d'arrêt. Préserve toutes les modifications préexistantes, suivies ou non suivies.
- Planifie d'abord les décisions de produit et de confidentialité. Ne modifie pas permissions, authentification, chiffrement, synchronisation, migrations, partage, suppression, achats ou envoi de données avant une décision explicite et des critères de validation adaptés. Si le risque, le destinataire des données ou le périmètre d'accès n'est pas clair, arrête-toi et demande.
- Pour l'indexation, ne scanne que les emplacements explicitement autorisés ; ne demande pas un accès global au stockage et ne promets pas l'exhaustivité. Ne modifie ni ne supprime les originaux.
- Pour alertes et famille, distingue les fiches locales d'un partage réel entre appareils/comptes. N'annonce ni invitation, notification, synchronisation ou droit d'accès avant validation effective.
- Pour la monétisation, ne code aucun achat/paywall avant décision sur les offres, plateformes, prix, droits et obligations applicables. L'accès aux données, à leur export et à leur suppression doit rester disponible même après expiration d'une offre.
- N'installe pas de dépendance et ne crée pas de commit sans nécessité et autorisation. Exécute les tests ciblés ; indique exactement les résultats, échecs et vérifications non faites. Ne coche une étape du plan qu'après satisfaction de tous ses critères.
