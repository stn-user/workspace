import { test, expect } from '@playwright/test';

const views = ['accueil', 'recherche', 'maison', 'detail', 'famille', 'alertes', 'assistant', 'importer', 'profil', 'vos-donnees', 'plus'];

async function ready(page, reload = false) {
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  if (reload) await page.reload();
  else await page.goto('http://127.0.0.1:5179/#/maison');
  await initialized;
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts', 'source_sync'].map(store => getAll(store)));
  });
}

for (const width of [390, 768, 1280, 1920]) {
  test(`onze vues sans aide permanente ni préférence consultée à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('famili-ia-source-choice-complete', 'true');
      localStorage.setItem('famili-ia-view-help-v1', '["maison"]');
      window.obsoleteHelpAccesses = [];
      window.navigationScrollBehaviors = [];
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (key, ...args) {
          if (key === 'famili-ia-view-help-v1') window.obsoleteHelpAccesses.push(method);
          return original.call(this, key, ...args);
        };
      }
      const scrollTo = Element.prototype.scrollTo;
      Element.prototype.scrollTo = function (options) {
        if (this.matches('.main-content')) window.navigationScrollBehaviors.push(options.behavior);
        return scrollTo.call(this, options);
      };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      await put('equipment', { id: 'carnet-fictif', category: 'pompe', name: 'Équipement fictif', status: 'Saisi', docs: [] });
      await put('family', { id: 'proche-fictif', name: 'Proche fictif', avatar: 'P' });
      await put('documents', { id: 'papier-fictif', name: 'Document fictif.txt', type: 'Texte', isLocal: true });
    });
    await ready(page, true);
    const before = await snapshot(page);
    for (const view of views) {
      const destination = view === 'detail' ? 'detail?id=carnet-fictif' : view;
      await page.evaluate(destination => { location.hash = `/${destination}`; }, destination);
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await expect(page.locator('.view-help, .view-help-container')).toHaveCount(0);
      expect(await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth <= innerWidth,
        vertical: document.documentElement.scrollHeight <= innerHeight + 1,
        scroll: window.navigationScrollBehaviors.at(-1)
      }))).toEqual({ horizontal: true, vertical: true, scroll: 'auto' });
      const primary = {
        recherche: '#experimental-index-query',
        maison: '#add-equipment-btn',
        importer: '#choose-import-files',
        assistant: '#assistant-input'
      }[view];
      if (primary) await expect(page.locator(primary)).toBeInViewport();
    }
    expect(await page.evaluate(() => window.obsoleteHelpAccesses)).toEqual([]);
    expect(await snapshot(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}
