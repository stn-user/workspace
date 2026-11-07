# Instructions pour le workspace

## Famili-IA uniquement

Ces instructions s'appliquent aux travaux dans `projets/famili-ia/` ; elles ne définissent pas de règles pour les autres projets du workspace.

- Lire la partie pertinente de `projets/famili-ia/DEVELOPPEMENT_PLAN.md` et, pour l'interface et les conventions, `projets/famili-ia/CLAUDE.md`. Vérifier les capacités dans le code : la cible de la roadmap n'est pas nécessairement implémentée.
- Pour la recherche multi-sources, distinguer données fictives et réelles, provenance, accès autorisé et couverture réelle de l'index. Ne pas présenter une source non disponible comme opérationnelle.
- Garder le traitement local par défaut. Ne pas transmettre de documents, photos, requêtes, coordonnées ou secrets à un service externe sans décision et information explicites ; utiliser des données fictives pour les tests. Les index et extraits sont aussi des données personnelles.
- Ne pas élargir les permissions, modifier l'authentification, les mécanismes de chiffrement, la synchronisation, les migrations ou la suppression des données sans une mission explicite et des critères de validation adaptés. En cas d'ambiguïté ou de risque nouveau, s'arrêter et demander une décision.
- Avant modification, examiner les fichiers concernés et l'état du dépôt ; préserver les changements préexistants. Limiter les modifications à la mission, réutiliser les mécanismes existants et signaler explicitement les erreurs.
- Respecter les tokens, composants et règles d'accessibilité du guide du projet. Toute évolution majeure de l'architecture ou de l'interface doit mettre à jour la documentation concernée.
- Ajouter ou adapter les tests pertinents ; exécuter les vérifications ciblées et signaler toute commande non exécutée, tout échec ou toute limite. Ne pas déclarer une phase terminée ni cocher le plan sans preuve que tous ses critères sont remplis.
- Ne pas effectuer d'opération destructive, de commit ou d'installation de dépendance sans nécessité et autorisation appropriée. Ne jamais supprimer les originaux de l'utilisateur dans le cadre d'une purge de données applicatives.
- Utiliser le [guide de mission et de contrôle](projets/famili-ia/docs/guide/developpement-assiste.md) pour les lots confiés à Cline et leur revue. Un compte rendu ne remplace ni les tests ni une revue indépendante.
