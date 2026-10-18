# Plan d'implémentation : Vos données (5.25)

## Contexte
L'étape 5.25 du plan de développement vise à peaufiner l'écran "Vos données" (`#view-vos-donnees`) :
- Icône de dossier rempli/stylisée pour les fichiers.
- Liste de fichiers avec métadonnées claires (type, taille, source).
- Actions critiques bien stylisées (suppression, export).

## Approche
1. **Style CSS (`styles.css`)** : Ajouter des règles pour `.data-inventory`, `.data-file-row`, `.data-file-icon` (style dossier rempli avec couleur primaire ou cyan), et les boutons d'actions critiques (`.danger-button`, `.secondary-button`).
2. **Structure HTML (`index.html`)** : S'assurer que les classes correspondent bien.
3. **Logique JavaScript (`app.js`)** : Vérifier que `renderDataInventory` affiche correctement les métadonnées et icônes adaptées.

## Fichiers critiques
- `projets/famili-ia/index.html`
- `projets/famili-ia/styles.css`
- `projets/famili-ia/app.js`

## Vérification
- Ouvrir la vue "Vos données" et vérifier l'affichage des icônes de dossiers et fichiers.
- Tester l'export et la suppression des données.
