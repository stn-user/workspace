# Moteur de Recherche Sémantique & Similarité

## 🎯 Concept
Famili-IA intègre un moteur de recherche sémantique **local et respectueux de la vie privée ("No-AI" externe)**. Il permet de lier des documents entre eux sans envoyer de données sur le cloud.

## ⚖️ Modèle de Pondération
La similarité entre deux documents est calculée via un score pondéré combinant 5 critères :
1. **Fournisseur (`provider`) — 40%** : Deux documents provenant du même émetteur (ex: EDF, Orange) partagent un lien fort.
2. **Type de document (`type`) — 20%** : Rapproche les documents de même nature.
3. **Catégorie (`category`) — 20%** : Confine la recherche au même univers (ex: maison, auto).
4. **Tags (`tags`) — 10%** : Intersection des mots-clés thématiques.
5. **Proximité temporelle (`date`) — 10%** : Évaluation de l'écart chronologique (bonus si < 30 jours ou < 1 an).

## ⚡ Règles de Rebond (Bonus Sémantiques)
Pour simuler une véritable intelligence de gestion domestique, des règles de rebond dynamiques s'ajoutent au score de base :
- **Lien Facture $\leftrightarrow$ Garantie** : Si un document est une *facture* et l'autre une *garantie* et qu'ils partagent le même *fournisseur*, un bonus de **+15%** est appliqué (reconnaissance automatique du lien entre l'achat et la garantie associée).
- **Cohérence d'équipement** : Un bonus s'applique si les documents partagent des balises d'équipement communes.

## 🛠 Implémentation technique
Le calcul est réalisé par la fonction `calculateSemanticScore(docA, docB)` située dans [search-utils.js](projets/famili-ia/search-utils.js).

## Recherche unifiée multi-sources

La vue « Recherche » expose un seul formulaire relié à `IndexSession` et `searchIndex`. Les documents et les photos passent par les mêmes filtres de source, type, couverture et date. Il n'y a pas de mode question ni de formulaire Moments de vie séparé, et « Vos données » ne propose plus de raccourci vers une autre recherche.

`unified-index-query.js` réutilise `interpretMomentsLifeQuery` pour traduire des requêtes photo en critères exacts de l'index : personne associée, lieu et événement annotés, période de prise de vue et type photo. Une requête photo peut donc être satisfaite par des filtres seuls, sans mot-clé résiduel. Les requêtes sur la date d'import utilisent `importedAt`, disponible sur les copies présentes dans Famili-IA, sans ajouter de date au schéma durable de l'index. Les critères interprétés sont combinés aux filtres manuels ; un conflit ou une ambiguïté est signalé, pas silencieusement ignoré.

Les résultats photo gardent leur présentation avec vignettes, regroupement, pagination, détails, correction d'annotations et suppression confirmée. Cette présentation n'effectue pas une seconde recherche : elle affiche les mêmes correspondances retournées par l'index commun. Seules les métadonnées et annotations explicites sont utilisées ; aucune reconnaissance visuelle ni couverture intégrale de l'appareil ou des fournisseurs n'est promise. Les recherches restent locales et ne transmettent pas les requêtes ou les annotations à un service externe.

Aucun historique persistant de requêtes n'est actuellement implémenté ; il reste hors du périmètre initial.
