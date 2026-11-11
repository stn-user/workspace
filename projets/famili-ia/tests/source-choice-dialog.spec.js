import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 480 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 }
]) {
  test(`options OneDrive accessibles à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', route => route.abort());
    const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://127.0.0.1:5179/#/importer');
    await initialized;
    const open = page.getByRole('button', { name: 'Options OneDrive', exact: true });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'OneDrive — accès aux fichiers' });
    const close = dialog.getByRole('button', { name: 'Fermer le choix des sources' });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expect(dialog).toHaveAccessibleDescription('Vérifiez les permissions avant de continuer. Ouvrir ces options ne connecte aucun compte.');
    await expect(dialog).toContainText('permission Microsoft Files.Read');
    await expect(dialog).toContainText('Les changements détectés sont proposés ici avant remplacement.');
    await expect(page.locator('#stop-onedrive')).toBeHidden();
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const buttons = dialog.locator('button');
    for (const button of await buttons.all()) {
      if (!await button.isVisible()) continue;
      const bounds = await button.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(48);
      expect(bounds.height).toBeGreaterThanOrEqual(48);
    }
    for (const image of await dialog.locator('.source-choice-icon image').all()) {
      expect(await image.evaluate(async el => {
        const img = new Image();
        img.src = el.getAttribute('href');
        await img.decode();
        return img.naturalWidth > 0;
      })).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await page.mouse.click(1, 1);
    await expect(dialog).toBeHidden();
  });
}

test('choix local ouvre le sélecteur sans importer automatiquement', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/importer');
  await initialized;
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#choose-import-files').click();
  const control = await chooser;
  expect(control.isMultiple()).toBe(true);
  await control.setFiles([]);
  await expect(page.locator('#source-choice-dialog')).toBeHidden();
  await expect(page.locator('#view-importer')).toBeVisible();
});

test('démo depuis Accueil reste fictive et préserve les données', async ({ page }) => {
  let externalRequests = 0;
  await page.route('https://**/*', route => {
    externalRequests++;
    return route.abort();
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', { id: 'existing-test', name: 'fichier existant.txt', isLocal: true });
    localStorage.setItem('famili-ia-source-choice-complete', 'true');
  });
  const restored = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await restored;
  const snapshot = () => page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
  });
  const before = await snapshot();
  const requestsBefore = externalRequests;
  await page.locator('[data-replay-demo]').click();
  await expect(page.locator('#source-choice-dialog')).toBeHidden();
  await expect(page.locator('#step-3')).toBeVisible();
  await expect(page.locator('#step-3-title')).toBeFocused();
  await expect(page.locator('#demo-result-heading')).toContainText('Facture de piscine');
  await page.locator('[data-demo-question="photos-aaron"]').click();
  await expect(page.locator('#demo-result-heading')).toContainText('Photos');
  expect(await snapshot()).toEqual(before);
  expect(externalRequests).toBe(requestsBefore);
  await page.locator('#finish-onboarding-demo').click();
  expect(await snapshot()).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('famili-ia-source-choice-complete'))).toBe('true');
  const reinitialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await reinitialized;
  await expect(page.locator('#onboarding-wizard')).toBeHidden();
  expect(await snapshot()).toEqual(before);
});
