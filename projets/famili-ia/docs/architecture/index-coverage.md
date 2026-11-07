# Socle de couverture d'indexation

## 15.5bis.0.b - Module `index-coverage.js`

---

## Niveaux de couverture

Ce module représente quatre niveaux déclarés de couverture de l'index. Le niveau d'un élément est distinct de l'autorisation et de la disponibilité actuelle de sa source : une source déconnectée peut avoir laissé des données indexées, éventuellement périmées.

| Niveau | Description | Utilisation |
|--------|-------------|-------------|
| `unavailable` | Aucun contenu ni métadonnée exploitable n'est disponible pour cet élément | Aucun résultat exploitable |
| `metadata` | Seules les métadonnées sont disponibles (nom de fichier, type, date du système) | Aucun texte extrait |
| `partial` | Une partie du contenu est accessible mais incomplète | Extraction partielle ou OCR partiel |
| `analyzed` | Le contenu accessible a été analysé | Ne garantit pas l'extraction de tous les faits ni la qualité du texte |

---

## API du module

### `isValidCoverageLevel(value)`

Renvoie `true` uniquement pour les quatre chaînes exactes :
- `"unavailable"`
- `"metadata"`
- `"partial"`
- `"analyzed"`

Retourne `false` pour toute autre valeur. Ne transforme pas l'entrée.

**Exemple** :
```javascript
import { isValidCoverageLevel } from "./index-coverage.js";

assert.equal(isValidCoverageLevel("analyzed"), true);
assert.equal(isValidCoverageLevel("Analyzed"), false); // case-sensitive
assert.equal(isValidCoverageLevel("unknown"), false);
```

---

### `getCoverageLabel(level)`

Retourne le libellé humain pour chaque niveau :
- `"unavailable"` → `"Non accessible"`
- `"metadata"` → `"Métadonnées seules"`
- `"partial"` → `"Contenu partiel"`
- `"analyzed"` → `"Contenu analysé"`

Lance une `TypeError` pour toute valeur invalide.

**Exemple** :
```javascript
import { getCoverageLabel } from "./index-coverage.js";

assert.equal(getCoverageLabel("analyzed"), "Contenu analysé");
assert.equal(getCoverageLabel("metadata"), "Métadonnées seules");
```

---

### `summarizeCoverage(levels)`

Accepte un tableau de niveaux de couverture valides et renvoie un objet de synthèse :

```javascript
{
  total: 0,        // nombre total d'éléments
  unavailable: 0,  // éléments non accessibles
  metadata: 0,     // éléments avec métadonnées seules
  partial: 0,      // éléments avec contenu partiel
  analyzed: 0      // éléments analysés
}
```

**Exemple fictif** :

```javascript
const levels = [
  "analyzed",      // facture.pdf - texte extrait
  "metadata",      // garantie.jpg - nom de fichier seul
  "analyzed",      // notice.pdf - texte extrait
  "partial",       // scan.jpg - OCR partiellement lisible
  "metadata"       // photo.mp4 - métadonnées uniquement
];

const summary = summarizeCoverage(levels);
// { total: 5, unavailable: 0, metadata: 2, partial: 1, analyzed: 2 }
```

Lance une `TypeError` si :
- L'entrée n'est pas un tableau
- Le tableau contient une valeur invalide

---

## Limites du lot

- **Module non raccordé** : Ce module n'est pas connecté aux connecteurs Drive, fichiers locaux ou cloud.
- **Pas d'interface** : Aucune modification de l'UI n'est prévue dans ce lot.
- **Pas de persistance** : Les niveaux de couverture ne sont pas sauvegardés automatiquement.
- **Déclaratif** : Les niveaux décrivent la couverture déclarée ; ils ne déduisent pas automatiquement l'accès.
- **Contenu analysé ≠ faits extraits** : Un élément "analyzed" n'indique pas que tous les faits sont trouvés.

---

## Exemple d'utilisation

```javascript
import { summarizeCoverage, getCoverageLabel } from "./index-coverage.js";

// Scénario fictif : recherche multi-sources
const searchResultCoverages = [
  "analyzed",  // Drive : facture.pdf lu
  "metadata",  // Local : copie_facture.pdf (nom seul)
  "analyzed"   // Drive : garantie.pdf lu
];

const summary = summarizeCoverage(searchResultCoverages);
// Console : { total: 3, unavailable: 0, metadata: 1, partial: 0, analyzed: 2 }

// Affichage
summary.analyzed > 0 && console.log(`📄 ${summary.analyzed} élément(s) analysé(s)`);
// Affiche : 📄 2 élément(s) analysé(s)
```