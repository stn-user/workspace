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
  await expect(page.locator('#experimental-source-status')).toContainText('1 fichier présent dans Famili-IA');
  await expect(page.locator('#experimental-source-status')).toContainText('accès actuel');
  await page.evaluate(() => { location.hash = '#/vos-donnees'; });
  await page.locator('#purge-all-data').click();
  await page.locator('#confirm-purge').click();
  await expect(page.locator('#purge-status')).toContainText('supprimées');
  await expect(entries).toHaveCount(0);
});

test('texte local extrait et preuve littérale conservés après redémarrage', async ({ page }) => {
  await page.goto('http://localhost:5179/#/recherche');
  await page.locator('#local-files-input').setInputFiles({
    name: 'contrat-test.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Impossible de résilier avant décembre. <img src=x onerror=alert(1)>')
  });
  await page.locator('#experimental-index-query').fill('résilier');
  await page.locator('#experimental-index-form button').click();
  const entries = page.locator('#experimental-index-results li');
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Impossible de résilier');
  await expect(entries.first()).toContainText('<img src=x onerror=alert(1)>');
  await expect(entries.locator('img')).toHaveCount(0);
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', {
      id: 'legacy-test', name: 'ancien.txt', isLocal: true,
      content: 'motancienunique', keywords: '', summary: ''
    });
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;
  await page.locator('#experimental-index-query').fill('résilier');
  await page.locator('#experimental-index-form button').click();
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Impossible de résilier');
  await expect(entries.locator('img')).toHaveCount(0);
  await page.locator('#experimental-index-query').fill('motancienunique');
  await page.locator('#experimental-index-form button').click();
  await expect(entries).toHaveCount(0);
  await page.locator('#experimental-index-query').fill('ancien.txt');
  await page.locator('#experimental-index-form button').click();
  await expect(entries).toHaveCount(1);
});
