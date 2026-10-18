# Plan d'implémentation : Étape 5.26 (Homogénéisation UI)

## Contexte
L'étape 5.26 vise à assurer la cohérence visuelle et l'accessibilité de l'application Famili-IA en auditant et homogénéisant les styles CSS :
- Vérification des variables d'espacement (`var(--space-*)`).
- Cohérence des rayons de bordure (`--radius-*`) et des ombres (`--shadow-*`).
- Implémentation des styles globaux `:focus-visible` pour l'accessibilité au clavier.

## Fichiers concernés
- `projets/famili-ia/styles.css`

## Étapes de réalisation
1. **Audit des sélecteurs et composants** :
   - Vérifier les éléments interactifs (`button`, `a`, `.chip`, `.nav-item`, `.stat-card`, `.alert-card`, etc.) pour s'assurer qu'ils utilisent les variables CSS standard.
   - Ajouter une règle globale `:focus-visible` claire et accessible (ex: outline de couleur primaire avec offset).
2. **Vérification de la cohérence** :
   - S'assurer que les espacements et les rayons de bordure respectent la charte graphique définie dans `CLAUDE.md`.

## Vérification
- Validation visuelle et test de la navigation clavier (focus) sur l'ensemble des éléments interactifs.
