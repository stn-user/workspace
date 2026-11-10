import { test, expect } from '@playwright/test';

const steps = [
  { view: 'recherche', title: 'Recherche' },
  { view: 'maison', title: 'Maison' },
  { view: 'famille', title: 'Famille' },
  { view: 'alertes', title: 'Alertes' },
  { view: 'vos-donnees', title: 'Vos données' },
  { view: 'importer', title: 'Importer' }
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 }
]) {
  test(`visite guidée complète, accessible et sans écriture à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let cloudRequests = 0;
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5179') {
        cloudRequests++;
        return route.abort();
      }
      return route.continue();
    });
    const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://127.0.0.1:5179/#/profil');
    await initialized;
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      await put('documents', { id: 'view-tour-document', name: 'exemple-fictif.txt', isLocal: true });
      await put('alerts', { id: 'view-tour-alert', title: 'alerte fictive' });
    });
    const snapshot = () => page.evaluate(async () => {
      const { getAll } = await import('/db.js');
      return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
    });
    const before = await snapshot();
    const localStorageBefore = await page.evaluate(() =>
      Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    );
    const initialCloudRequests = cloudRequests;
    const initialHistoryLength = await page.evaluate(() => history.length);

    await page.locator('#start-view-tour-profile').click();
    const panel = page.locator('#view-tour');
    await expect(panel).toBeVisible();
    await expect(page.getByRole('region', { name: 'Visite guidée des vues' })).toBeVisible();
    await expect(page.locator('#view-tour-progress')).toHaveText('Étape 1 sur 6 · Recherche');
    await expect(page.locator('#page-title')).toBeFocused();
    await expect(page.locator('#page-title')).toHaveClass(/view-tour-highlight/);

    const bottomNav = page.locator('.bottom-nav');
    if (viewport.width <= 1024) {
      const panelBox = await panel.boundingBox();
      const navBox = await bottomNav.boundingBox();
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(navBox.y);
    }
    for (const button of await panel.locator('button').all()) {
      if (!await button.isVisible()) continue;
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    await page.locator('#view-tour-next').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-tour-progress')).toHaveText('Étape 2 sur 6 · Maison');
    await expect(page.locator('#house-title')).toBeFocused();
    await page.locator('#view-tour-prev').click();
    await expect(page.locator('#view-tour-progress')).toHaveText('Étape 1 sur 6 · Recherche');
    await expect(page.locator('#page-title')).toBeFocused();
    await page.locator('#view-tour-next').click();

    for (let index = 1; index < steps.length; index += 1) {
      const step = steps[index];
      await expect(page.locator('#view-tour-progress')).toHaveText(`Étape ${index + 1} sur 6 · ${step.title}`);
      await expect(page.locator(`[data-view="${step.view}"] h1`)).toHaveClass(/view-tour-highlight/);
      await expect(page.locator(`[data-view="${step.view}"] h1`)).toBeFocused();
      await expect(page.locator('#view-tour')).toContainText('Lecture seule');
      if (index < steps.length - 1) await page.locator('#view-tour-next').click();
    }
    await expect(page.locator('#view-tour-next')).toHaveText('Terminer la visite');
    expect(await snapshot()).toEqual(before);
    expect(await page.evaluate(() =>
      Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    )).toEqual(localStorageBefore);
    expect(cloudRequests).toBe(initialCloudRequests);
    await page.locator('#view-tour-next').click();
    await expect(page).toHaveURL(/#\/profil$/);
    await expect(page.locator('#view-tour')).toBeHidden();
    await expect(page.locator('#start-view-tour-profile')).toBeFocused();
    expect(await snapshot()).toEqual(before);
    expect(await page.evaluate(() =>
      Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    )).toEqual(localStorageBefore);
    expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength);

    await page.locator('#start-view-tour-profile').click();
    await page.locator('#view-tour-exit').click();
    await expect(page.locator('#view-tour')).toBeHidden();
    await expect(page.locator('#start-view-tour-profile')).toBeFocused();
    expect(await snapshot()).toEqual(before);
    expect(cloudRequests).toBe(initialCloudRequests);
  });
}

test('la démo propose la visite sans empêcher de terminer ou de revenir à la démo', async ({ page }) => {
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await page.locator('#start-onboarding').click();
  await page.locator('#skip-personalization').click();
  await page.locator('#step-2 [data-wizard-next="3"]').click();
  await expect(page.locator('#start-view-tour-demo')).toBeVisible();
  await expect(page.locator('#finish-onboarding-demo')).toBeVisible();
  await page.locator('#start-view-tour-demo').click();
  await expect(page.locator('#view-tour-progress')).toHaveText('Étape 1 sur 6 · Recherche');
  await page.locator('#view-tour-exit').click();
  await expect(page.locator('#step-3')).toBeVisible();
  await expect(page.locator('#start-view-tour-demo')).toBeFocused();
  await page.locator('#finish-onboarding-demo').click();
  await expect(page.locator('#view-accueil')).toBeVisible();
  await expect(page.locator('#onboarding-wizard')).toBeHidden();
});

test('une navigation choisie par l’utilisateur quitte la visite sans la détourner', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/profil');
  await initialized;
  await page.locator('#start-view-tour-profile').click();
  await page.locator('.bottom-nav [data-nav="maison"]').click();
  await expect(page).toHaveURL(/#\/maison$/);
  await expect(page.locator('#view-tour')).toBeHidden();
  await expect(page.locator('#house-title')).toBeVisible();
});
