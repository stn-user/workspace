# Plan d'implémentation : Amélioration Recherche IA (5.28)

## Contexte
L'objectif est d'aligner l'interface de "Recherche IA" sur la maquette :
- Rendre l'interface plus "conversationnelle" (barre de recherche centrale, style épuré).
- Améliorer l'aspect visuel des suggestions (les transformer en "chips" interactifs mieux intégrés).
- Ajuster le flux de recherche pour une meilleure expérience utilisateur.

## Fichiers concernés
- `projets/famili-ia/index.html` (structure de `#view-recherche`)
- `projets/famili-ia/styles.css` (styles de la section `.search-view`)

## Étapes de réalisation
1. **HTML** :
   - Refondre la structure de `.search-form` pour une apparence plus centrée et épurée.
   - Refactoriser le conteneur `.suggestions` pour mieux intégrer les puces de suggestions (`.assistant-suggestion-chip` réutilisées ici ou nouveau style de chips).
2. **CSS** :
   - Appliquer des styles plus modernes pour la zone de recherche (plus grande, ombre légère, radius accru).
   - Styliser les suggestions pour qu'elles ressemblent à des puces interactives (chips).
   - Ajuster la mise en page pour que le tout soit centré et aéré.

## Vérification
- Tester le flux de recherche : entrée de question, affichage des résultats, clics sur les suggestions.
- Vérifier la cohérence visuelle avec les autres écrans.
