# Plan d'implémentation : Améliorations de l'interface Profil (5.24)

## Contexte
Le projet Famili-IA nécessite une amélioration de l'interface utilisateur de la vue "Profil". L'objectif est d'aligner cette vue sur les maquettes et la charte graphique (`CLAUDE.md`) :
- Utilisation d'initiales pour l'avatar.
- Champs éditables avec un design cohérent.
- Bouton de sauvegarde stylisé.
- Cases à cocher (checkboxes) stylisées pour la confidentialité.

## Approche
### 1. Style CSS (`styles.css`)
- Ajouter les styles pour les classes de la vue profil (`.profile-grid`, `.user-info-panel`, `.privacy-panel`, `.field`, `.privacy-option`, etc.).
- S'assurer d'utiliser les tokens CSS du design system (`--color-primary`, `--radius-md`, `--shadow-sm`, etc.).

### 2. Structure HTML (`index.html`)
- Mettre à jour la structure existante de `#view-profil` pour appliquer les classes CSS et s'assurer que les éléments (avatar, inputs, checkboxes) sont bien identifiés pour le binding JS.

### 3. Logique JavaScript (`app.js`)
- Vérifier que `initProfileHandlers` gère correctement la mise à jour de l'état, la sauvegarde et l'initialisation des cases à cocher en fonction de `state.js`.

## Fichiers critiques
- `projets/famili-ia/index.html`
- `projets/famili-ia/styles.css`
- `projets/famili-ia/app.js`

## Vérification
- Tester l'affichage de l'initiale dans l'avatar.
- Vérifier le fonctionnement de la sauvegarde du nom d'affichage.
- Tester l'état des cases à cocher de confidentialité (liées à `state.js`).
- Vérifier le responsive design.
