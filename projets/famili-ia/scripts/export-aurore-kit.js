// La maquette autonome reste la source graphique, y compris pour un usage hors ligne.
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../docs/guide/prisme-aurore.html', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const target = new URL('../assets/prisme/', import.meta.url);
function between(start, end) {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error(`Section de maquette introuvable : ${start} … ${end}`);
  return source.slice(i, j);
}
function exportAsset(name, content) {
  const url = new URL(name, target);
  if (process.argv.includes('--check')) {
    if (readFileSync(url, 'utf8').replaceAll('\r\n', '\n') !== content) throw new Error(`Export à actualiser : ${name}`);
  } else writeFileSync(url, content);
}

const tokens = between(':root{', 'html{color-scheme').replace(':root', ':scope');
const primitives = between('button,input{', '/* ---------- présentation');
const components = between('.app-head{', '@media(max-width:1180px)');
const wide = between('.search-facets{display:none}', '@media(max-width:1040px)');
const css = `${tokens}
:scope{color-scheme:light;color:var(--ink);font:15px/1.45 "Segoe UI Variable","Segoe UI",system-ui,sans-serif}
[data-theme=dark]{color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
${primitives}${between('@keyframes drift', '.app-head{')}${components}${wide}
@media(prefers-reduced-motion:no-preference){
  .i.fx-spark{animation:twinkle 4s ease-in-out infinite}
  .i.fx-breathe{animation:breathe 7s ease-in-out infinite}
}
${between('@media(prefers-reduced-motion:reduce)', '</style>')}`
  .replaceAll('[data-theme=dark]', ':is(:scope[data-theme=dark],:scope:not([data-theme]):where([data-aurore=dark] *))')
  .replaceAll('[data-theme=light]', ':is(:scope[data-theme=light],:scope:not([data-theme]):not(:where([data-aurore=dark] *)))');
exportAsset('aurore-kit.css', `/* Généré par scripts/export-aurore-kit.js. */\n@scope (.aurore-kit) {\n${css}}\n`);

const symbols = between('<symbol id="i-home"', '</svg>');
for (const [, id] of source.matchAll(/href="#(i-[\w-]+)"/g)) {
  if (!symbols.includes(`id="${id}"`)) throw new Error(`Icône manquante : ${id}`);
}
exportAsset('aurore-icones.svg', `<svg xmlns="http://www.w3.org/2000/svg">\n  ${symbols}</svg>\n`);
const defs = between('<defs>', '<symbol id="logo-b"');
const logo = between('<symbol id="logo-b"', '</symbol>').split('viewBox="0 0 48 48">')[1];
exportAsset('aurore-orbite.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Famili-IA">
  <style>
    @media(prefers-reduced-motion:no-preference){
      ${between('.orbit{', '.logo-mark .letter')}
      .letter{animation:facet .9s cubic-bezier(.34,1.56,.64,1) both}
      ${between('@keyframes facet', '.orbit{')}
    }
  </style>
  ${defs}${logo}</svg>\n`);
