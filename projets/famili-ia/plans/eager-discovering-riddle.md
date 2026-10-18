# Plan d'implémentation : Améliorations de l'Assistant IA (5.23)

## Contexte
Le projet Famili-IA nécessite une amélioration de l'interface de l'Assistant IA pour le rendre plus intuitif et visuellement cohérent avec la charte graphique définie dans `CLAUDE.md`. L'objectif est d'implémenter des bulles de chat différenciées, des avatars, des suggestions rapides et un scroll automatique.

## Approche
### 1. Style CSS (styles.css)
- Création des classes CSS pour les messages de chat : `.chat-container`, `.chat-message`, `.chat-message.ai`, `.chat-message.user`.
- Utilisation des variables de couleurs et de rayons de bordure de `CLAUDE.md` (`--color-primary`, `--color-primary-light`, `--radius-md`).
- Style spécifique pour l'avatar de l'IA.

### 2. Structure HTML (index.html)
- Ajout d'une zone pour les suggestions rapides (`.suggestion-container`) sous la zone de saisie.

### 3. Logique JavaScript (app.js)
- Mise à jour de `initAssistantView` pour :
    - Ajouter le scroll automatique vers le bas lors de l'ajout de nouveaux messages.
    - Gérer les événements de clic sur les suggestions rapides pour remplir le champ de saisie et soumettre.

## Fichiers critiques
- `projets/famili-ia/index.html`
- `projets/famili-ia/app.js`
- `projets/famili-ia/styles.css`

## Vérification
- Tester le scroll automatique en simulant une conversation longue.
- Vérifier que les bulles de chat respectent les couleurs (Teal primaire pour l'IA, fond gris/bordure pour l'utilisateur).
- Tester la réactivité des suggestions rapides.
