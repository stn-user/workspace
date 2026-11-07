# Développement assisté : missions Cline et contrôles

Ce guide organise les lots Famili-IA confiés à un agent et leur revue. Les instructions sont des aides, pas des garanties : aucun agent ne voit automatiquement la conversation d'un autre, et une revue ne prouve pas l'absence de défaut ou de vulnérabilité.

## Mise en route

1. Ouvrir la racine du workspace dans VS Code. Le fichier [AGENTS.md](../../../../AGENTS.md) contient des règles limitées à Famili-IA. Dans Cline, vérifier dans le panneau des règles qu'il est détecté et activé ; vérifier aussi la prise en charge d'`AGENTS.md` dans la configuration Copilot utilisée.
2. Si une règle n'est pas chargée, demander explicitement à l'agent de lire `AGENTS.md` depuis la racine du workspace. Si seul le dossier Famili-IA est ouvert, lui indiquer explicitement le chemin du fichier parent : ne pas supposer que Cline découvre les instructions situées en dehors de son workspace.
3. Vérifier les données transmises par Cline, OmniRoute et le fournisseur de modèle ainsi que les autorisations automatiques de fichiers, commandes et réseau. Utiliser uniquement des exemples fictifs ; ne pas envoyer de secrets ni de données familiales réelles.
4. Avant chaque lot, identifier les modifications déjà présentes et choisir une base de comparaison connue. Ne pas écraser le travail existant ; ne pas mélanger plusieurs missions dans le même lot si leur revue devient ambiguë.

## Cycle d'un lot

1. **Préparer** : choisir une sous-étape du [plan](../../DEVELOPPEMENT_PLAN.md), définir une mission bornée et un niveau de risque.
2. **Implémenter** : transmettre la mission à Cline. Il lit le contexte, modifie uniquement le périmètre autorisé, teste et fournit le compte rendu demandé.
3. **Contrôler** : revenir vers Copilot avec la mission, la base de comparaison et les éventuelles modifications préexistantes. La revue porte sur le diff réel, les critères et les tests, pas seulement sur le résumé de l'agent.
4. **Décider** : conclure « validé », « à corriger » ou « bloqué », avec preuves et limites. Corriger puis refaire le contrôle nécessaire avant de déclarer le lot terminé.

La revue s'effectue avant toute intégration ou tout commit demandé. Si le lot est déjà commité, fournir sa référence et sa base ; sinon, indiquer les fichiers concernés et les changements préexistants. La revue doit examiner séparément les changements suivis, indexés et non indexés, ainsi que les fichiers non suivis pertinents : un simple `git diff` ne montre pas tout.

## Modèle de mission à remplir

Copier le bloc suivant dans Cline après avoir remplacé les champs entre crochets :

```text
Mission Famili-IA : [identifiant de la sous-étape et objectif précis]

Contexte à lire : [plan, documentation et fichiers pertinents]
Base / changements préexistants à préserver : [référence ou description]
Périmètre modifiable : [liste précise]
Hors périmètre : [liste précise]
Comportement attendu : [règles, cas normaux et cas limites]
Critères d'acceptation mesurables : [liste]
Tests à ajouter ou adapter : [liste]
Vérifications à exécuter : [commandes et scénarios]
Arrêter et demander une décision si : [ambiguïtés ou risques]

Respecte AGENTS.md et le guide du projet. Ne coche pas une phase du plan
simplement parce que le lot est implémenté. Ne crée pas de commit. Ne change
pas de fichiers hors périmètre ; si c'est nécessaire, arrête-toi et explique.
Dans le compte rendu, donne : fichiers modifiés, décisions, tests et résultats
exacts, vérifications non faites, risques, critères atteints ou non et
changements préexistants préservés.
```

Le périmètre inclut les tests et la documentation attendus ; si des fichiers supplémentaires s'avèrent nécessaires, réviser la mission plutôt que contourner cette limite. Une mission portant sur OAuth, permissions, chiffrement, migration, synchronisation ou suppression nécessite un cadrage et une revue approfondis avant validation.

## Demander une revue à Copilot

```text
Contrôle le lot Cline [identifiant] par rapport à [mission et critères].
Base de comparaison : [référence ou description].
Changements préexistants à ne pas attribuer au lot : [liste].
Périmètre : [fichiers].
Vérifie le diff réel, les tests, les régressions et la roadmap ; ajoute les
contrôles graphique et confidentialité/sécurité adaptés au lot.
Ne modifie rien pendant cette première revue. Classe les problèmes par gravité,
indique les preuves et les vérifications non réalisées, puis conclus : validé,
à corriger ou bloqué.
```

Pour une correction ultérieure, demander explicitement à Copilot ou préparer une nouvelle mission Cline. Une revue de sécurité dédiée est nécessaire pour les changements sensibles ; une checklist générique n'est pas un audit complet.

## Checklist de revue du lot

- [ ] Base et changements préexistants identifiés ; fichiers suivis et non suivis pertinents examinés.
- [ ] Chaque critère est vérifié sur le comportement réel ; le périmètre et les parcours existants sont respectés.
- [ ] Cas limites, erreurs, états vides et conséquences sur les autres vues ou plateformes examinés.
- [ ] Tests pertinents lus et exécutés ; résultats et limites relevés ; build exécuté si le changement le justifie.
- [ ] Documentation et plan cohérents avec les capacités réellement vérifiées ; aucune phase cochée prématurément.
- [ ] Conclusion et risques résiduels communiqués ; les vérifications non réalisées ne sont pas présentées comme réussies.

## Checklist graphique et accessibilité

- [ ] Comparer les éléments modifiés aux tokens et composants de [CLAUDE.md](../../CLAUDE.md) et aux maquettes applicables ; distinguer la charte existante des critères plus stricts propres à une phase.
- [ ] Vérifier les tailles d'écran et cibles tactiles définies pour le lot, les débordements, le clavier, le focus, les libellés accessibles, les contrastes et `prefers-reduced-motion` lorsque concernés.
- [ ] Examiner états de chargement, erreur, vide et contenu réel ou fictif selon le parcours.
- [ ] Si une vérification visuelle ou sur appareil est impossible, le signaler ; ne pas conclure à une conformité visuelle complète sur la seule lecture du code.

## Checklist confidentialité et sécurité

- [ ] Identifier les données et permissions manipulées, leurs destinataires, le stockage, la durée de conservation et les journaux concernés.
- [ ] Vérifier local par défaut, données fictives de test, absence de secrets et absence de transmission non autorisée ; inspecter les flux réseau pertinents lorsque c'est possible.
- [ ] Vérifier refus et révocation, accès incomplet, gestion des erreurs, déconnexion et suppression des données applicatives sans suppression des originaux lorsque ces parcours sont concernés.
- [ ] Pour OAuth, permissions natives, chiffrement, synchronisation, migrations ou partage : vérifier la documentation et les règles fournisseur applicables, prévoir une revue dédiée et relever les limites ; ne pas présumer une approbation.

## Première mission Cline : essai à faible risque

Cet essai prépare uniquement les scénarios de **15.5bis.0.a** ; il n'implémente pas de connecteur et ne valide pas toute la phase. Après exécution, demander la revue décrite ci-dessus.

```text
Mission Famili-IA : préparer des scénarios fictifs pour 15.5bis.0.a.

Contexte à lire : AGENTS.md à la racine du workspace, les sections 15.2,
15.4 et 15.5bis.0 du plan de développement, et les études existantes sur
les sources uniquement si nécessaires.
Base / changements préexistants : examine git status avant de commencer ;
préserve notamment les changements éventuels du plan.
Périmètre modifiable : créer uniquement
projets/famili-ia/docs/architecture/scenarios-recherche-multi-sources.md.
Hors périmètre : code, dépendances, configuration, autres documents et
cases du plan ; aucun compte ni aucune donnée réelle.

Rédige cinq scénarios synthétiques : facture d'emplacement inconnu,
garantie et échéance, contrat et fait précis, recherche de photos, et
recherche simultanée dans plusieurs sources. Pour chacun, indique intention,
sources fictives et niveau d'accès supposé, données disponibles, requête,
résultat attendu avec provenance ou preuve lorsqu'elle existe, et au moins
un cas limite ou d'absence. Distingue clairement hypothèses et capacités
actuelles : n'affirme pas qu'un connecteur ou une reconnaissance de photo
existe sans preuve. N'invente pas de contenu pour une source inaccessible.

Critères d'acceptation : cinq scénarios distincts et entièrement fictifs,
couverture des cinq intentions ci-dessus, au moins une source partiellement
accessible et un résultat sans preuve ou sans accès traité explicitement.
Vérifie la lisibilité et la cohérence avec le plan ; aucun test applicatif
n'est requis pour ce document. Si un autre fichier doit être modifié ou si
une décision produit est nécessaire, arrête-toi et explique.
Ne coche aucune case du plan et ne crée pas de commit.
Compte rendu : fichier créé, hypothèses, critères vérifiés, limites et
changements préexistants préservés.
```
