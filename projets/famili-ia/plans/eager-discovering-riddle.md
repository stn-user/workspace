# Plan d'implémentation : Finalisation du Drag & Drop (5.29)

## Contexte
L'étape 5.29 vise à finaliser la fonctionnalité de "Glisser-déposer" (Drag & Drop) dans la vue d'importation (`#view-importer`) et à s'assurer qu'elle offre un feedback visuel robuste et un traitement correct des fichiers déposés.

## Fichiers concernés
- `projets/famili-ia/index.html` (structure de `#view-importer`)
- `projets/famili-ia/app.js` (gestion des événements dragover, dragleave, drop et intégration dans `uploadedDocuments`)
- `projets/famili-ia/styles.css` (styles pour les états de la zone de dépôt : survol, fichier accepté, etc.)

## Étapes de réalisation
1. **CSS (`styles.css`)** :
   - Ajouter des classes pour le survol de la zone de dépôt (`.drop-zone.is-dragover`).
2. **JavaScript (`app.js`)** :
   - Implémenter les gestionnaires d'événements pour `dragover`, `dragleave`, et `drop` sur `#drop-zone`.
   - Traiter les fichiers déposés de la même manière que ceux sélectionnés via l'explorateur de fichiers (validation du type, taille, ajout à `uploadedDocuments`).
   - Afficher un message de succès ou un toast de confirmation.

## Vérification
- Tester le glisser-déposer d'un fichier compatible (.txt, .md, .pdf) dans la zone dédiée.
- Vérifier que le fichier est bien ajouté et indexé dans la session.
