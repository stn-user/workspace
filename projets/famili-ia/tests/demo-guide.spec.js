import { test, expect } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 }
];

const snapshot = page => page.evaluate(async () => {
  const { getAll } = await import('/db.js');
  return {
    stores: await Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll)),
    storage: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
  };
});

for (const viewport of viewports) {
  test(`démo scénarisée, rejouable et isolée à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let externalRequests = 0;
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5179') {
        externalRequests++;
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(() => {
      window.demoPermissionRequests = 0;
      window.showDirectoryPicker = async () => {
        window.demoPermissionRequests++;
        throw new Error('Aucun sélecteur attendu dans la démo');
      };
      if ('Notification' in window) {
        Notification.requestPermission = async () => {
          window.demoPermissionRequests++;
          return 'denied';
        };
      }
    });
    const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://127.0.0.1:5179/#/accueil');
    await initialized;
    const freshState = await snapshot(page);
    expect(freshState.stores[0]).toMatchObject([{
      id: 'u1',
      name: 'Mon espace',
      address: '',
      postalCode: '',
      city: ''
    }]);
    expect(freshState.stores.slice(1)).toEqual([[], [], [], []]);
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      await put('documents', { id: 'guide-test', name: 'document fictif privé.txt', isLocal: true });
      await put('alerts', { id: 'guide-alert', title: 'alerte fictive privée' });
    });
    const before = await snapshot(page);
    const initialRequests = externalRequests;
    const initialPermissions = await page.evaluate(() => window.demoPermissionRequests);
    await page.locator('#start-onboarding').click();
    await page.locator('#skip-personalization').click();
    await page.locator('#step-2 [data-wizard-next="3"]').click();
    const progress = page.locator('#demo-guide-progress');
    const results = page.locator('#demo-results');
    const next = page.locator('#demo-guide-next');
    const prev = page.locator('#demo-guide-prev');

    async function checkLayout() {
      expect(await page.locator('#onboarding-wizard').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      for (const control of await page.locator('#step-3 button, #step-3 summary, #demo-query').all()) {
        if (!await control.isVisible()) continue;
        const box = await control.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
      await expect(page.locator('#step-3')).not.toContainText('document fictif privé');
      await expect(page.locator('#step-3')).not.toContainText('alerte fictive privée');
      await expect(page.locator('#step-3')).not.toContainText(/fictif|fictive/i);
      if (viewport.width <= 760) {
        const focus = page.locator('.demo-workspace :focus');
        if (await focus.count()) {
          const focusedBox = await focus.boundingBox();
          const guideBox = await page.locator('#demo-guide').boundingBox();
          if (guideBox) expect(focusedBox.y + focusedBox.height).toBeLessThanOrEqual(guideBox.y + 1);
        }
      }
    }

    await expect(page.locator('#demo-intro')).toBeVisible();
    await expect(page.locator('#demo-workspace')).toBeHidden();
    await expect(page.locator('.demo-disclosure')).toContainText('aucune connexion ni écriture réelle');
    for (const image of await page.locator('#demo-intro img').all()) {
      expect(await image.evaluate(async element => {
        await element.decode();
        return element.naturalWidth > 0;
      })).toBe(true);
    }
    if (viewport.width <= 760) {
      const caption = await page.locator('.demo-intro-gallery > span').boundingBox();
      const memory = await page.locator('#demo-intro-memory-image').boundingBox();
      const overlaps = caption.x < memory.x + memory.width && caption.x + caption.width > memory.x
        && caption.y < memory.y + memory.height && caption.y + caption.height > memory.y;
      expect(overlaps).toBe(false);
    }
    await page.locator('#demo-start-guided').click();
    await expect(progress).toHaveText('Étape 1 sur 6 · La question');
    await expect(page.locator('#demo-search-form')).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-query')).toHaveValue('Tu me retrouves la facture de la piscine ?');
    await expect(page.locator('#demo-query')).toHaveAttribute('readonly', '');
    await expect(results).toBeHidden();
    await expect(page.locator('#demo-guide-spotlight')).toBeVisible();
    await expect(page.locator('#demo-query')).toHaveCSS('outline-color', 'rgb(214, 154, 69)');
    await expect(page.locator('#demo-query')).toHaveCSS('border-color', 'rgb(214, 154, 69)');
    const spotlight = await page.locator('[data-spotlight-frame]').boundingBox();
    const targetBounds = await page.locator('#demo-search-form').boundingBox();
    expect(spotlight.x).toBeLessThanOrEqual(targetBounds.x);
    expect(spotlight.y).toBeLessThanOrEqual(targetBounds.y);
    expect(spotlight.x + spotlight.width).toBeGreaterThanOrEqual(targetBounds.x + targetBounds.width);
    expect(spotlight.y + spotlight.height).toBeGreaterThanOrEqual(targetBounds.y + targetBounds.height);
    await checkLayout();
    if ([390, 1280].includes(viewport.width)) {
      await page.screenshot({ path: test.info().outputPath('demo-search.png') });
    }
    await next.click();
    await expect(progress).toHaveText('Étape 2 sur 6 · La preuve');
    await expect(results).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(results).toContainText('OneDrive · Maison');
    await expect(results).toContainText('12 juin 2024 · Dossier Maison');
    await expect(results.locator('mark')).toHaveText('Total TTC : 8 900 €');
    await checkLayout();
    await prev.click();
    await expect(page.locator('#demo-query')).toBeFocused();
    await next.click();
    await next.click();
    await expect(progress).toHaveText('Étape 3 sur 6 · Le rappel');
    await expect(page.locator('#demo-alert-preview')).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-alert-title')).toBeFocused();
    const deadline = await page.locator('#demo-alert-date').innerText();
    await page.locator('#demo-confirm-alert').click();
    await expect(page.locator('#demo-alert-status')).toContainText('Rien n’a été ajouté à votre espace');
    await checkLayout();
    await prev.click();
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await next.click();
    await next.click();
    await expect(progress).toHaveText('Étape 4 sur 6 · La maison');
    await expect(page.locator('#demo-house-title')).toBeFocused();
    await expect(page.locator('#demo-house-documents')).toContainText('Facture piscine.pdf');
    await expect(page.locator('#demo-house-documents')).toContainText('Garantie pompe piscine.pdf');
    await checkLayout();
    if ([390, 1280].includes(viewport.width)) {
      await page.screenshot({ path: test.info().outputPath('demo-house.png') });
    }
    await next.click();
    await expect(progress).toHaveText('Étape 5 sur 6 · Les souvenirs');
    await expect(page.locator('#demo-photos-title')).toBeFocused();
    await expect(page.locator('#demo-photo-list .onboarding-demo-result')).toHaveCount(2);
    await expect(page.locator('#demo-photo-list .demo-result-photo').nth(0))
      .toHaveAttribute('src', /\/assets\/demo\/am-piscine\.jpg/);
    await expect(page.locator('#demo-photo-list .demo-result-photo').nth(1))
      .toHaveAttribute('src', /\/assets\/demo\/gouter-pergola\.jpg/);
    await expect(page.locator('[data-demo-panel="photos"]')).toContainText('pas d’une reconnaissance de visages');
    for (const image of await page.locator('#demo-photo-list .demo-result-photo').all()) {
      expect(await image.evaluate(async element => {
        await element.decode();
        return element.naturalWidth > 0;
      })).toBe(true);
    }
    await checkLayout();
    await next.click();
    await expect(progress).toHaveText('Étape 6 sur 6 · La provenance');
    await expect(page.locator('#demo-data-title')).toBeFocused();
    await expect(page.locator('#demo-data-list .onboarding-demo-result')).toHaveCount(5);
    await expect(page.locator('#demo-data-list')).toContainText('Valable jusqu’au 12 juin 2027');
    await checkLayout();
    await next.click();
    await expect(page.locator('#demo-guide')).toBeHidden();
    await expect(page.locator('#demo-intro')).toBeHidden();
    await expect(page.locator('#demo-workspace')).toBeVisible();
    await expect(page.locator('#demo-guide-restart')).toBeFocused();
    await expect(page.locator('#step-3 .demo-guide-highlight')).toHaveCount(0);
    await page.locator('[data-demo-screen="maison"]').click();
    await expect(page.locator('#demo-screen-title')).toBeFocused();
    await page.locator('#demo-open-warranty').click();
    await expect(results.locator('mark')).toHaveText('Valable jusqu’au 12 juin 2027');
    await expect(page.locator('#demo-guide')).toBeHidden();
    await page.locator('#demo-guide-restart').click();
    await expect(progress).toHaveText('Étape 1 sur 6 · La question');
    await expect(page.locator('#demo-query')).toBeFocused();
    await page.locator('#demo-guide-skip').click();
    await expect(page.locator('#demo-guide-restart')).toBeFocused();
    await expect(page.locator('#demo-intro')).toBeHidden();
    await page.locator('.demo-examples summary').click();
    await page.locator('[data-demo-question="photos-ete"]').click();
    await expect(page.locator('#demo-query')).toHaveValue('Montre-moi nos souvenirs de l’été');
    await expect(page.locator('#demo-search-form button')).toBeVisible();
    await page.locator('#demo-search-form button').click();
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(page.locator('#demo-result-heading')).toContainText('Un été à la maison');
    await expect(results.locator('.demo-result-photo')).toHaveCount(2);
    await expect(page.locator('#demo-guide')).toBeHidden();
    expect(await snapshot(page)).toEqual(before);
    expect(externalRequests).toBe(initialRequests);
    expect(await page.evaluate(() => window.demoPermissionRequests)).toBe(initialPermissions);
    expect(errors).toEqual([]);
    await page.locator('#finish-onboarding-demo').click();
    await expect(page.locator('#onboarding-wizard')).toBeHidden();
    await expect(page.locator('#dashboard-title')).toBeFocused();
    const completed = await snapshot(page);
    expect(completed.stores).toEqual(before.stores);
    expect(completed.storage).toEqual({ ...before.storage, 'famili-ia-source-choice-complete': 'true' });
    await page.locator('[data-replay-demo]').click();
    await expect(page.locator('#demo-intro')).toBeVisible();
    await page.locator('#demo-start-guided').click();
    await expect(progress).toHaveText('Étape 1 sur 6 · La question');
    await expect(page.locator('#demo-query')).toHaveValue('Tu me retrouves la facture de la piscine ?');
    await page.locator('#demo-guide-skip').click();
    await page.locator('[data-demo-screen="alertes"]').click();
    await expect(page.locator('#demo-alert-status')).toHaveText('Aucun rappel n’a été ajouté.');
    await page.locator('#finish-onboarding-demo').click();
    await expect(page.locator('[data-replay-demo]')).toBeFocused();
    expect(await snapshot(page)).toEqual(completed);
  });
}

test('quitter la découverte rejouée restaure la route et le focus du profil', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/profil');
  await initialized;
  const before = await snapshot(page);
  const historyLength = await page.evaluate(() => history.length);
  await page.locator('#reset-onboarding-btn').click();
  await page.locator('#start-onboarding').click();
  await page.locator('#skip-personalization').click();
  await page.locator('#step-2 [data-wizard-next="3"]').click();
  await expect(page.locator('#step-3')).toBeVisible();
  await page.locator('#finish-onboarding-demo').click();
  await expect(page).toHaveURL(/#\/profil$/);
  await expect(page.locator('#reset-onboarding-btn')).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(await snapshot(page)).toEqual(before);
});

test('la démo reste quittable au clavier sur un petit écran de 390 × 480', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await page.locator('#start-onboarding').click();
  await page.locator('#skip-personalization').click();
  await page.locator('#step-2 [data-wizard-next="3"]').click();
  await page.locator('#demo-start-guided').click();
  await page.locator('#demo-guide-skip').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#demo-guide-restart')).toBeFocused();
  await page.locator('#finish-onboarding-demo').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dashboard-title')).toBeFocused();
  await expect(page.locator('#onboarding-wizard')).toBeHidden();
});
