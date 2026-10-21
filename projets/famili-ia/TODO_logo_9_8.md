# TODO List - Famili-IA : Étape 9.8 (Standardisation du composant Logo)

## Contexte
Cette étape concerne la validation, le formatage et la standardisation du composant graphique principal (logo) de l'application, en lien avec le point 9.7 (harmonisation des icônes déjà validée).

---

## 🎨 Spécifications techniques du Logo (Étape 9.8)

Pour valider le point **9.8**, veuillez respecter ou vérifier les caractéristiques suivantes pour le fichier logo (SVG ou PNG) :

### 1. Formats et Dimensions attendus :
- **Format privilégié** : Vectoriel **SVG** (`logo.svg`), pour un affichage net sur tous les écrans Retina / haute définition sans perte de qualité.
- **Format alternatif** : **PNG** transparent si le SVG n'est pas disponible (résolution minimale recommandée : **512×512 px** pour supporter les écrans à forte densité de pixels).
- **Tailles d'affichage dans l'interface** :
  - **Header / Barre principale (Navbar)** : Hauteur fixe de `32px` à `40px` (classe `.logo-md` ou `.brand-mark`).
  - **Écrans de connexion / Accueil grand format** : Hauteur de `48px` à `64px` (classe `.logo-lg`).
  - **Favicon / Miniature** : `32×32 px`.

### 2. Charte Graphique & Couleurs :
- **Couleur principale (Teal officiel)** : `#0f7173` (et `#0c5e5f` pour les états au survol).
- **Fond** : Transparent ou adapté au mode clair/sombre (`#ffffff` en surface, `#f8fafc` en fond global).
- **Intégration** : Le logo doit s'intégrer proprement dans le conteneur `.brand` sans déformation de ratio (utilisation de `object-fit: contain` ou `viewBox` correct).

---

## 📋 Critères de Validation (Checklist)

- [ ] **Fichier fourni** : Le fichier du logo est présent dans `projets/famili-ia/assets/logo.svg` (ou format image équivalent).
- [ ] **Dimensions et ratio** : Le logo est aux dimensions adaptées et ne subit aucune distorsion.
- [ ] **Intégration HTML/CSS** : Le logo est correctement appelé dans `index.html` et stylisé dans `styles.css`.
- [ ] **Rendu visuel** : Le rendu est validé sur bureau (Desktop) et mobile (Responsive).

---

## Fichiers concernés
- `projets/famili-ia/assets/logo.svg` (ou équivalent)
- `projets/famili-ia/index.html`
- `projets/famili-ia/styles.css`
- `projets/famili-ia/DEVELOPPEMENT_PLAN.md`
