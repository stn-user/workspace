import { test, expect } from '@playwright/test';

test('recherche locale et Drive simulé, puis purge sans résultats résiduels', async ({ page }) => {
  await page.goto('http://localhost:5179/#/recherche');
  await page.evaluate(async () => {
    const request = indexedDB.open('FamiliIADatabase', 2);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({
        id: 'drive-test-index', name: 'Facture Drive.txt', type: 'Texte',
        date: 'Date inconnue', isLocal: true, driveSource: true,
        content: 'Contenu fictif', keywords: '', summary: ''
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;
  await page.locator('#local-files-input').setInputFiles({
    name: 'Facture locale.txt', mimeType: 'text/plain', buffer: Buffer.from('Contenu fictif')
  });
  await page.locator('#experimental-index-query').fill('facture');
  await page.locator('#experimental-index-form button').click();
  const entries = page.locator('#experimental-index-results li');
  await expect(entries).toHaveCount(2);
  await expect(entries.filter({ hasText: 'Facture locale.txt' })).toContainText('Local');
  await expect(entries.filter({ hasText: 'Facture Drive.txt' })).toContainText('Google Drive');
  await page.evaluate(() => { location.hash = '#/vos-donnees'; });
  await page.locator('#purge-all-data').click();
  await page.locator('#confirm-purge').click();
  await expect(page.locator('#purge-status')).toContainText('supprimées');
  await expect(entries).toHaveCount(0);
});
