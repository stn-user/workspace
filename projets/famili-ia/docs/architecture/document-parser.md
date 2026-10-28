# Architecture du Moteur d'Analyse (document-parser.js)

## 🎯 Concept
Le parser utilise une architecture basée sur des **Détecteurs Modulaires**. Au lieu d'une logique monolithique, chaque type de document (Facture, Garantie, etc.) possède son propre détecteur encapsulant :
- Des mots-clés de reconnaissance.
- Une logique d'extraction spécifique.

## 🏗 Fonctionnement
Le flux d'analyse suit trois étapes :
1. **Identification** : Le moteur calcule un score de confiance pour chaque détecteur basé sur la présence de mots-clés.
2. **Extraction** : Le détecteur ayant le score le plus élevé (ou dépassant un seuil) est sélectionné pour extraire les données (`provider`, `date`, `amount`, etc.).
3. **Normalisation** : Les données sont formatées dans un objet `DocumentContext` standard.

## ➕ Avantages
- **Extensibilité** : Ajout facile de nouveaux types de documents sans modifier le cœur du moteur.
- **Robustesse** : Le système de scoring évite les erreurs de classification.
- **Maintenance** : Chaque règle métier est isolée.

## 🛠 Ajouter un détecteur
Pour ajouter un type de document (ex: "Assurance"), ajoutez un objet dans le tableau `detectors` de `document-parser.js` :
```javascript
{
  type: 'assurance',
  keywords: ['assurance', 'police', 'contrat'],
  extract: (text) => ({ ... })
}
```
