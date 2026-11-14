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
      if (viewport.width <= 760) {
        const focus = page.locator('.demo-workspace :focus');
        if (await focus.count()) {
          const focusedBox = await focus.boundingBox();
          const guideBox = await page.locator('#demo-guide').boundingBox();
          if (guideBox) expect(focusedBox.y + focusedBox.height).toBeLessThanOrEqual(guideBox.y + 1);
        }
      }
    }

    await expect(progress).toHaveText('Guide · étape 1 sur 6');
    await expect(page.locator('#demo-search-form')).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-query')).toHaveValue('Retrouve la facture de ma piscine');
    await expect(page.locator('#demo-query')).toHaveAttribute('readonly', '');
    await expect(results).toBeHidden();
    await checkLayout();
    if ([390, 1280].includes(viewport.width)) {
      await page.screenshot({ path: test.info().outputPath('demo-search.png') });
    }
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(progress).toHaveText('Guide · étape 2 sur 6');
    await expect(results).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(results).toContainText('Google Drive · exemple fictif');
    await expect(results).toContainText('4 mars 2023');
    await expect(results.locator('mark')).toHaveText('Montant total : 8 900 euros TTC.');
    await checkLayout();
    await prev.click();
    await expect(page.locator('#demo-query')).toBeFocused();
    await page.locator('.demo-examples summary').click();
    await page.locator('[data-demo-question="photos-aaron"]').click();
    await expect(page.locator('#demo-query')).toHaveValue('Montre-moi les photos d’Aaron');
    await expect(results).toBeHidden();
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(progress).toHaveText('Guide · étape 2 sur 6');
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(results).toContainText('Local · exemple fictif');
    await expect(results).toContainText('Annotations explicites : Aaron');
    await page.locator('[data-demo-question="contrat-habitation"]').click();
    await next.click();
    await expect(results).toContainText('OneDrive · exemple fictif');
    await expect(results).toContainText('31 décembre 2027');
    await expect(results).toContainText('aucune alerte n’est créée');
    await page.locator('[data-demo-question="garantie-pompe"]').click();
    await next.click();
    const warrantyEvidence = await results.locator('mark').innerText();
    await next.click();
    await expect(progress).toHaveText('Guide · étape 3 sur 6');
    await expect(page.locator('#demo-alert-preview')).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-alert-title')).toBeFocused();
    const deadline = await page.locator('#demo-alert-date').innerText();
    expect(warrantyEvidence).toContain(deadline);
    await page.locator('#demo-confirm-alert').click();
    await expect(page.locator('#demo-alert-status')).toContainText('Confirmation simulée uniquement');
    await expect(page.locator('#demo-alert-status')).toContainText('Aucune alerte créée');
    await checkLayout();
    await prev.click();
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(results.locator('mark')).toHaveText(warrantyEvidence);
    await next.click();
    await next.click();
    await expect(progress).toHaveText('Guide · étape 4 sur 6');
    await expect(page.locator('#demo-house-title')).toBeFocused();
    await expect(page.locator('#demo-house-documents')).toContainText('Facture - Installation piscine.pdf');
    await expect(page.locator('#demo-house-documents')).toContainText('Garantie - Pompe piscine.pdf');
    await checkLayout();
    if ([390, 1280].includes(viewport.width)) {
      await page.screenshot({ path: test.info().outputPath('demo-house.png') });
    }
    await next.click();
    await expect(progress).toHaveText('Guide · étape 5 sur 6');
    await expect(page.locator('#demo-photos-title')).toBeFocused();
    await expect(page.locator('#demo-photo-list .onboarding-demo-result')).toHaveCount(2);
    await expect(page.locator('[data-demo-panel="photos"]')).toContainText('Aucune reconnaissance faciale ou visuelle');
    for (const image of await page.locator('#step-3 .demo-preview-image').all()) {
      expect(await image.evaluate(async element => {
        await element.decode();
        return element.naturalWidth > 0;
      })).toBe(true);
    }
    await checkLayout();
    await next.click();
    await expect(progress).toHaveText('Guide · étape 6 sur 6');
    await expect(page.locator('#demo-data-title')).toBeFocused();
    await expect(page.locator('#demo-data-list .onboarding-demo-result')).toHaveCount(5);
    await expect(page.locator('#demo-data-list')).toContainText(warrantyEvidence);
    await expect(page.locator('#demo-data-list')).toContainText('OneDrive · exemple fictif');
    await checkLayout();
    await next.click();
    await expect(page.locator('#demo-guide')).toBeHidden();
    await expect(page.locator('#demo-guide-restart')).toBeFocused();
    await expect(page.locator('#step-3 .demo-guide-highlight')).toHaveCount(0);
    await page.locator('[data-demo-screen="maison"]').click();
    await expect(page.locator('#demo-screen-title')).toBeFocused();
    await page.locator('#demo-open-warranty').click();
    await expect(results.locator('mark')).toHaveText(warrantyEvidence);
    await expect(page.locator('#demo-guide')).toBeHidden();
    await page.locator('#demo-guide-restart').click();
    await expect(progress).toHaveText('Guide · étape 1 sur 6');
    await expect(page.locator('#demo-query')).toBeFocused();
    await expect(page.locator('[data-demo-question="garantie-pompe"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#demo-guide-skip').click();
    await expect(page.locator('#demo-guide-restart')).toBeFocused();
    await page.locator('[data-demo-question="photos-aaron"]').click();
    await expect(page.locator('#demo-search-form button')).toBeVisible();
    await page.locator('#demo-search-form button').click();
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(page.locator('#demo-result-heading')).toContainText('Photos familiales');
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
    await expect(progress).toHaveText('Guide · étape 1 sur 6');
    await expect(page.locator('#demo-query')).toHaveValue('Retrouve la facture de ma piscine');
    await page.locator('[data-demo-screen="alertes"]').click();
    await expect(page.locator('#demo-alert-status')).toHaveText('Aucune alerte créée. Aucune notification envoyée.');
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
  await page.locator('#demo-guide-skip').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#demo-guide-restart')).toBeFocused();
  await page.locator('#finish-onboarding-demo').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dashboard-title')).toBeFocused();
  await expect(page.locator('#onboarding-wizard')).toBeHidden();
});
