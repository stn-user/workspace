export async function appModuleUrl(page, moduleName) {
  return page.evaluate(async moduleName => {
    const entry = document.querySelector('script[type="module"][src*="app.js"]');
    const source = await (await fetch(entry.src)).text();
    const match = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
      .find(([, specifier]) => new URL(specifier, location.href).pathname === `/${moduleName}`);
    if (!match) throw new Error(`Import du module de l'application introuvable : ${moduleName}.`);
    return new URL(match[1], location.href).href;
  }, moduleName);
}

export function stateModuleUrl(page) {
  return appModuleUrl(page, "state.js");
}
