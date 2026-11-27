# Prisme : adopter une composition

Ouvrir la [galerie interactive](prisme.html) directement dans le navigateur. Son HTML est le catalogue de fragments à reprendre, pas une nouvelle application. Il utilise les [primitives UI de production](../../styles.css) et la [feuille Prisme](../../assets/prisme/prisme.css), sans bibliothèque ni service externe.

## Premier branchement

1. `assets/prisme/prisme.css` est chargé depuis `index.html`, **après** `styles.css` (fait au lot 1). Les URLs des trois décors sont relatives à la feuille et sont empaquetées par Vite.
2. Ajouter `ui-prisme` à un conteneur **à l’intérieur de la vue**. Garder les identifiants, attributs `data-*`, écouteurs, états `hidden` et composants `ui-*` existants. Pour un dialogue hors de ce conteneur, prévoir une portée dédiée ; ne pas étendre le thème au `body`.
3. Prendre le fragment correspondant dans la galerie. Remplacer les textes d’exemple par les valeurs existantes, via `textContent` pour les données dynamiques. Ne pas importer le script, les ancres internes ni les exemples de la galerie dans l’application.

| Besoin | Fragment ou primitive |
| --- | --- |
| Titre, action, champ | `prisme-title`, `ui-button` (primaire, secondaire, texte, danger), `ui-label` + `ui-input` |
| Accueil et raccourcis | `prisme-feature` pour la tuile iris ; `prisme-tiles` et `prisme-tile` pour les actions avec icône et libellé |
| Résultat de recherche / Assistant | `ui-card prisme-result`, `prisme-proof`, `ui-badge`, `prisme-meta`, `details` : preuve littérale, provenance et couverture visibles |
| Foyer et fiche | `prisme-feature--foyer`, `prisme-row`, `ui-dialog` ; le décor menthe est une illustration, pas la photo du foyer |
| Rappels | `prisme-feature--rappel`, `prisme-date`, `prisme-segments` ; en l’absence de date fiable, afficher son absence |
| Navigation | `prisme-nav`, SVG décoratif `prisme-icon` et libellé visible ; `aria-current="page"` sur la destination courante |
| Vide, chargement, erreur, succès, action requise | `ui-card` + message explicite ; désactiver seulement l’action indisponible et conserver les annonces accessibles des parcours existants |

Les variantes `--foyer`, `--rappel`, `--action` et `--mint` complètent leur classe de base ; `ui-prisme--inline` rend transparent le fond de la portée lorsqu'elle est placée dans une vue existante, et `prisme-feature--action` accueille du texte et des boutons au-dessus du décor. Dans une tuile `prisme-feature`, les boutons `ui-button--primary` et `--secondary` prennent leurs variantes claires pour rester lisibles sur le fond sombre. Les accents identifient des compositions, pas des niveaux d’urgence. Les couleurs d’alerte et de suppression restent sémantiques. Les SVG de décor ne contiennent pas d’information indispensable.

## Ordre proposé

Commencer par **une tuile Accueil** reliée à son action actuelle. Poursuivre avec la carte de preuve Recherche, puis Foyer et Rappels. Garder la navigation pour un lot distinct : les quatre destinations de la maquette ne remplacent pas encore les routes existantes. Ne pas activer de nouvelle capacité de recherche ou d’Assistant dans un lot graphique.

Pour chaque lot : relever les blocs avant/après, vérifier les vraies données et leurs états manquants, tester clavier, focus, 320/390 px et retour à la vue d’origine. Conserver une capture et faire valider le parcours avant de poursuivre. La vérification de la galerie seule ne valide pas une migration.
