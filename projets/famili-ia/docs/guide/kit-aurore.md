# Utiliser le kit Prisme Aurore

Ouvrir le [catalogue](./kit-aurore.html) via le serveur local : depuis le projet, lancer `npm run dev`, puis ouvrir l’URL affichée par Vite suivie de `/docs/guide/kit-aurore.html` (par défaut `http://localhost:5173/docs/guide/kit-aurore.html`). Certains navigateurs limitent le chargement du sprite SVG si le fichier est ouvert directement en `file://`. Le catalogue présente les couleurs, les pictogrammes et un motif par écran avec son HTML. Les [maquettes interactives](./prisme-aurore.html) restent la référence pour les compositions complètes, les feuilles, les gestes et les états fictifs.

## Intégrer un motif

Depuis la racine de l’application, charger le [CSS du kit](../../assets/prisme/aurore-kit.css) après les feuilles existantes. Entourer **seulement le nouveau bloc** avec `.aurore-kit`. Le kit utilise CSS `@scope` (navigateur ou WebView compatible requis). Il suit le `data-aurore` du document ; un `data-theme="light"` ou `"dark"` sur le bloc permet une prévisualisation indépendante.

```html
<link rel="stylesheet" href="./assets/prisme/aurore-kit.css">
<div class="aurore-kit">
  <button class="act pri" type="button">
    <svg class="i fx-spark" aria-hidden="true">
      <use href="./assets/prisme/aurore-icones.svg#i-spark"></use>
    </svg>
    Ouvrir l’assistant
  </button>
</div>
```

Le [sprite](../../assets/prisme/aurore-icones.svg) se sert depuis la même origine. Le [logo Orbite](../../assets/prisme/aurore-orbite.svg) s’utilise indépendamment : `<img src="./assets/prisme/aurore-orbite.svg" width="48" height="48" alt="Famili-IA">`. Utiliser `alt=""` si le nom est déjà écrit à côté. Les animations du kit et du logo respectent `prefers-reduced-motion`.

## Où trouver les variantes

Rappels garde la même lecture sur téléphone et ordinateur : filtres, rappels enregistrés, puis propositions à confirmer. Le premier rappel actif daté en tête de liste utilise `.coralhero` ; les suivants utilisent `.mini`, avec une date menthe pour un rappel terminé. La feuille de réglages conserve la demande de permission explicite et distincte de l’enregistrement des préférences.

Mon foyer utilise la carte maison menthe, les catégories défilantes, les lignes d’équipement et les avatars du cercle. Le raccourci « Profil et famille » ouvre la rubrique du même nom dans Paramètres. Les catégories du formulaire natif d’ajout et d’édition sont des pastilles radio. La maison reste une illustration ; les visuels personnels des équipements conservent leur provenance.

Dans Recherche, Source, Type et Couverture utilisent les pastilles `.opts` / `.opt` avec des boutons radio natifs. Sur téléphone, « Appliquer » valide les choix et fermer la feuille les annule ; sur ordinateur, les filtres s’appliquent immédiatement. Les dates, personnes et lieux restent dans le volet complémentaire.

L’Accueil réel réutilise la recherche, la carte à orbes, les tuiles et les lignes du kit. Les raccourcis passent sous la carte sur téléphone et à sa droite à partir de 640 px de largeur **disponible dans le contenu**. La flèche de recherche ouvre Recherche, sans activer le micro. Les titres, dates et provenances viennent de l’état applicatif ; les orbes sont uniquement décoratives.

La salutation utilise le nom enregistré dans Profil ou le prénom facultatif du premier lancement. Sans nom, elle affiche « Bonjour » et un accès au profil, jamais un prénom fictif. Recherche utilise le champ vitré, les puces de filtres, les cartes à anneaux avec preuve et provenance, et la carte Assistant du kit. Le panneau ordinateur et la feuille mobile gardent les mêmes contrôles métier.

| Écran | Classes du kit |
|---|---|
| Accueil | `.hero`, `.orb`, `.tiles`, `.tile`, `.row`, `.badge` |
| Recherche | `.find.field`, `.fchip`, `.res`, `.proof`, `.prov`, `.sheet` |
| Foyer | `.house`, `.cats`, `.avs` ; [illustration maison](../../assets/prisme/maison.svg) |
| Rappels | `.seg`, `.coralhero`, `.ribbon`, `.mini.done`, `.prop` |
| Assistant | `.ctx`, `.chat`, `.msg`, `.typing`, `.composer` |
| Importer | `.drop`, `.stepper`, `.prog`, `.frow` |
| Vos données | `.trust`, `.donut`, `.legend`, `.viewseg`, `.danger` |
| En-tête | `.head-actions`, `.round`, icône `i-settings` à côté du thème |
| Paramètres | `.web-settings`, `.section`, `.prop`, `.seg3`, `.row` |
| Profil et famille (rubrique de Paramètres) | `.pf-hero`, `.av`, `.field2`, `.mrow`, `.invite`, `.privcard` |
| Navigation mobile | `.dock`, `.ind`, `.mobile-data` et icône `i-folder` |
| Onboarding | `.onbhero`, `.choice`, `.srccard`, `.recap` |

### Navigation intégrée à l’application

- **En-tête commun :** la roue dentée (`#open-app-settings`) ouvre Paramètres, sans remplacer le contrôle clair/sombre. Un nouvel appui retourne à l’écran d’origine et restaure le focus. `i-settings` est un tracé, pas une forme pleine : conserver `fill: none`, `stroke: currentColor` et le trait de 1.8 px du kit. Ne pas confondre cette icône avec `i-sliders`, réservé notamment aux réglages de Rappels.
- **Paramètres :** la route conservée `plus` affiche le `<details class="prop">` Profil et famille, puis Apparence, Aide et Offres. Les anciens liens et hash `profil` sont acceptés et redirigés vers `plus?section=profile`. Depuis Foyer, ouvrir la même vue, déplier ce bloc et placer le focus sur son `<summary>`. Réutiliser les formulaires et confirmations existants, sans seconde copie du profil. L’offre illustrée n’implique ni tarif ni paiement.
- **Rappels :** après les propositions, une ligne menthe avec `i-folder` mène à l’inventaire « Vos données ». Sur smartphone, ce même inventaire est aussi la cinquième destination du dock, après Accueil, Recherche, Foyer et Rappels : libellé court « Données », nom accessible « Vos données ».
- **Indicateur du dock :** sur le bouton de la destination active, poser `aria-current="page"`. Données est une destination principale : elle s’active depuis Rappels ou le dock. Dans Paramètres, aucune destination du dock n’est active. La barre latérale web ne répète pas Profil et famille ; Paramètres reste accessible par la roue dentée.

Les classes décrivent la présentation, pas le comportement. Raccorder les actions, états accessibles, preuves et erreurs aux mécanismes de l’application. Ne pas importer le script du prototype, ses identifiants DOM ni ses données fictives. L’application conserve la route `plus` pour Paramètres et traite `profil` comme un alias d’accès à la rubrique Profil et famille. Adapter le dock et les dialogues de production plutôt que les dupliquer.

## Actualiser les ressources

Après une modification graphique de la maquette : `node scripts/export-aurore-kit.js`, puis `node scripts/export-aurore-kit.js --check` depuis le projet. Le premier régénère les trois ressources CSS/SVG ; le second vérifie sans écrire. Ne pas modifier les exports à la main. Le catalogue et le générateur sont des outils de développement locaux, pas des dépendances de l’application.
