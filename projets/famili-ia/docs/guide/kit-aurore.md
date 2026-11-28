# Utiliser le kit Prisme Aurore

Ouvrir le [catalogue](./kit-aurore.html) via le serveur local (`npm run dev`, puis `/docs/guide/kit-aurore.html`). Il présente les couleurs, les pictogrammes et un motif par écran avec son HTML. Les [maquettes interactives](./prisme-aurore.html) restent la référence pour les compositions complètes, les feuilles, les gestes et les états fictifs.

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

Mon foyer utilise la carte maison menthe, les catégories défilantes, les lignes d’équipement et les avatars du cercle. Sur ordinateur, les liens Famille et Mon espace sont à droite du carnet ; sur mobile, ils le suivent. Les catégories du formulaire natif d’ajout et d’édition sont des pastilles radio. La maison reste une illustration ; les visuels personnels des équipements conservent leur provenance.

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
| Plus | `.me`, `.assistant`, `.rowsm` |
| Profil et famille | `.av`, `.preview`, `.seg3` |
| Onboarding | `.onbhero`, `.choice`, `.srccard`, `.recap` |

Les classes décrivent la présentation, pas le comportement. Raccorder les actions, états accessibles, preuves et erreurs aux mécanismes de l’application. Ne pas importer le script du prototype, ses identifiants DOM ni ses données fictives. Conserver les dialogues natifs et le dock de production (neuf destinations web, quatre mobiles), déjà stylés dans [aurore.css](../../assets/prisme/aurore.css).

## Actualiser les ressources

Après une modification graphique de la maquette : `node scripts/export-aurore-kit.js`, puis `node scripts/export-aurore-kit.js --check` depuis le projet. Le premier régénère les trois ressources CSS/SVG ; le second vérifie sans écrire. Ne pas modifier les exports à la main. Le catalogue et le générateur sont des outils de développement locaux, pas des dépendances de l’application.
