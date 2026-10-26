/**
 * Script de tests automatisés (sanity check) pour Famili-IA
 * Vérifie l'intégrité de la structure des fichiers, l'existence des modules et des fonctions clés.
 */

import fs from 'fs';
import path from 'path';

// Utiliser path.resolve('.') au lieu d'un chemin relatif qui plante si exécuté depuis le bon répertoire
const projectDir = path.resolve('.');

const checks = [
  {
    name: 'index.html - Structure de base & vues',
    file: 'index.html',
    validate: (content) => content.includes('app-shell') && content.includes('accueil')
  },
  {
    name: 'app.js - Contrôleur principal',
    file: 'app.js',
    validate: (content) => content.includes('showView') && content.includes('initState')
  },
  {
    name: 'state.js - Gestion d’état & IndexedDB',
    file: 'state.js',
    validate: (content) => content.includes('initState') && content.includes('defaultState')
  },
  {
    name: 'search-utils.js - Moteur de recherche & intent',
    file: 'search-utils.js',
    validate: (content) => content.includes('detectQuestionIntent') && content.includes('normalizeText')
  },
  {
    name: 'local-files.js - Gestion des fichiers locaux & OCR',
    file: 'local-files.js',
    validate: (content) => content.includes('readFileContent') && content.includes('listLocalFiles')
  },
  {
    name: 'CLAUDE.md - Guide technique et charte graphique',
    file: 'CLAUDE.md',
    validate: (content) => content.includes('Famili-IA') && content.includes('Charte Graphique')
  },
  {
    name: 'DEVELOPPEMENT_PLAN.md - Plan de développement & Architecture',
    file: 'DEVELOPPEMENT_PLAN.md',
    validate: (content) => content.includes('Architecture') && content.includes('Phase')
  }
];

console.log("=== Test de sanitation Famili-IA ===\n");

let passed = 0;
let failed = 0;

for (const check of checks) {
  const filePath = path.join(projectDir, check.file);
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`  ✗ ${check.name} - fichier introuvable (${check.file})`);
      failed++;
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (check.validate(content)) {
      console.log(`  ✓ ${check.name}`);
      passed++;
    } else {
      console.log(`  ✗ ${check.name} - contenu non conforme`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ ${check.name} - erreur: ${err.message}`);
    failed++;
  }
}

console.log("\n=== Vérification fichiers temporaires ===");
const tempFiles = [
  'app.js.bak',
  'styles_backup.css',
  'index_orig.html',
  '.env.local.bak'
];

let foundTemp = false;
for (const temp of tempFiles) {
  const p1 = path.join(projectDir, temp);
  const p2 = path.resolve(temp);
  if (fs.existsSync(p1) || fs.existsSync(p2)) {
    console.log(`  ⚠ Fichier temporaire détecté: ${temp}`);
    foundTemp = true;
  }
}

if (!foundTemp) {
  console.log("  ✓ Aucun fichier temporaire ou de sauvegarde orphelin détecté.");
}

console.log(`\n=== Résultat : ${passed} passés, ${failed} échoués ===`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
