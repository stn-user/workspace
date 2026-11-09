import { test, expect } from '@playwright/test';

for (const scenario of [
  { name: 'sans configuration Google', port: 5188 },
  { name: 'avec bibliothèques Google indisponibles', port: 5189 }
]) {
  test(`OneDrive et la purge fonctionnent ${scenario.name}`, async ({ page }) => {
    await page.route('https://accounts.google.com/**', route => route.abort());
    await page.route('https://apis.google.com/**', route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${scenario.port}/#/recherche`);
    await expect(page.locator('#onedrive-status')).toContainText('OneDrive prêt à être connecté');
    await expect(page.locator('#connect-onedrive')).toBeEnabled();
    await page.locator('#local-files-input').setInputFiles({
      name: 'fictif.txt', mimeType: 'text/plain', buffer: Buffer.from('contenu fictif')
    });
    await page.evaluate(() => { location.hash = '#/vos-donnees'; });
    await page.locator('#purge-all-data').click();
    await page.locator('#confirm-purge').click();
    await expect(page.locator('#purge-status')).toContainText('supprimées');
    expect(errors).toEqual([]);
  });
}

test('détecte un changement OneDrive sans remplacer la copie', async ({ page }) => {
  await page.route('**/onedrive-auth.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export class OneDriveAuth {
      connected = false;
      accountId = "compte-fictif";
      async initialize() {}
      async connect() { this.connected = true; }
      async getToken() { return "jeton-fictif"; }
      async disconnect() { this.connected = false; }
    }`
  }));
  let version = '"v1"';
  let releaseFirstScan;
  const firstScanGate = new Promise(resolve => { releaseFirstScan = resolve; });
  let graphRequests = 0;
  await page.route('https://graph.microsoft.com/**', async route => {
    graphRequests++;
    if (graphRequests === 1) await firstScanGate;
    await route.fulfill({
      json: { value: [{ id: 'element-fictif', name: 'photo.jpg', file: {}, eTag: version }] }
    });
  });
  await page.goto('http://127.0.0.1:5188/#/recherche');
  await expect(page.locator('#connect-onedrive')).toBeEnabled();
  await page.locator('[data-open-source-dialog]').click();
  await expect(page.locator('#source-choice-dialog')).toBeVisible();
  await expect(page.locator('#start-onedrive')).toBeDisabled();
  await expect(page.locator('#stop-onedrive')).toBeHidden();
  await page.locator('#connect-onedrive').click();
  await expect(page.locator('#start-onedrive')).toBeEnabled();
  expect(graphRequests).toBe(0);
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#stop-onedrive')).toBeVisible();
  await expect(page.locator('#start-onedrive')).toBeDisabled();
  releaseFirstScan();
  await expect(page.locator('#onedrive-status')).toContainText('Parcours terminé.');
  await expect(page.locator('#stop-onedrive')).toBeHidden();
  await expect(page.locator('#onedrive-status')).toContainText('1 copie(s) ajoutée(s)');
  await expect(page.locator('#start-onedrive')).toBeEnabled();
  version = '"v2"';
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-status')).toContainText('1 changement détecté');
  const documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  const copy = documents.find(document => document.name === 'photo.jpg');
  expect(copy.oneDriveETag).toBe('"v1"');
  expect(documents.filter(document => document.name === 'photo.jpg')).toHaveLength(1);
});
