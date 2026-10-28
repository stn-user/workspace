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
