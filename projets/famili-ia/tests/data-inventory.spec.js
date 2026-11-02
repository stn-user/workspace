import { test, expect } from '@playwright/test';

test.describe('Vue Vos données et recherche unifiée', () => {
  test('adapte les cartes et les filtres aux petits écrans sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5179/#/vos-donnees');

    await expect(page.locator('.data-stat-card')).toHaveCount(4);
    await expect(page.locator('.data-file-row')).toHaveCount(5);
    await expect(page.locator('.data-view .chip').first()).toHaveCSS('min-height', '44px');
    await expect(page.locator('.data-badge--type')).toHaveCount(5);
    await expect(page.locator('.data-badge--source')).toHaveCount(5);
    await expect(page.locator('.data-badge--index')).toHaveCount(5);
    await expect(page.locator('.data-file-row').first().locator('.data-badge--type')).toHaveText('Facture');
    await expect(page.locator('.data-file-row').first().locator('.data-badge--source')).toHaveText('Démonstration');
    await expect(page.locator('.data-file-row').first().locator('.data-badge--index')).toHaveText('Texte indexé');

    const hasHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('applique les filtres à l’URL et restaure le précédent avec Retour', async ({ page }) => {
    await page.goto('http://localhost:5179/#/vos-donnees?type=document&category=Facture');

    await expect(page.locator('.data-file-row')).toHaveCount(2);
    await expect(page.locator('#view-vos-donnees [data-filter-type="Facture"]')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#view-vos-donnees [data-filter-type="Garantie"]').click();
    await expect(page).toHaveURL(/#\/vos-donnees\?type=Garantie$/);
    await expect(page.locator('.data-file-row')).toHaveCount(1);
    await expect(page.locator('.data-file-name')).toHaveText('Garantie - Pompe piscine.pdf');

    await page.goBack();
    await expect(page).toHaveURL(/#\/vos-donnees\?type=document&category=Facture$/);
    await expect(page.locator('.data-file-row')).toHaveCount(2);
    await expect(page.locator('#view-vos-donnees [data-filter-type="Facture"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('relie les chips de recherche unifiée aux types et provenances des documents', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5179/#/recherche');
    await expect(page.locator('#filter-type-group .chip').first()).toHaveCSS('min-height', '44px');
    await page.locator('#question').fill('Combien ai-je payé pour ma piscine ?');
    await page.locator('#search-form button[type="submit"]').click();

    await expect(page.locator('#result-count')).toHaveText('1 document trouvé');
    await page.locator('#filter-type-group [data-filter-type="Facture"]').click();
    await page.locator('#filter-source-group [data-filter-source="demo"]').click();
    await expect(page.locator('#result-count')).toHaveText('1 document trouvé');
    await expect(page.locator('.document-name')).toHaveText('Facture - Installation piscine.pdf');

    await page.locator('#filter-source-group [data-filter-source="local"]').click();
    await expect(page.locator('#no-results')).toBeVisible();
    await expect(page.locator('#filter-source-group [data-filter-source="local"]')).toHaveAttribute('aria-pressed', 'true');

    const hasHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('requiert une confirmation avant toute suppression et explique ce qui est préservé', async ({ page }) => {
    await page.goto('http://localhost:5179/#/vos-donnees');
    await page.locator('#purge-all-data').click();

    const dialog = page.locator('#purge-confirmation');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Les fichiers d’origine dans vos dossiers ou sur Google Drive ne seront pas supprimés');
    await page.locator('#cancel-purge').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.data-file-row')).toHaveCount(5);
  });

  test('purge les données applicatives confirmées sans supprimer les exemples intégrés', async ({ page }) => {
    await page.goto('http://localhost:5179/#/vos-donnees');
    await expect(page.locator('#summary-demo')).toHaveText('5');
    await page.evaluate(async () => {
      localStorage.setItem('famili-ia-family', JSON.stringify([{ id: 'custom-family-member' }]));
      const request = indexedDB.open('FamiliIADatabase', 2);
      const database = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put({ id: 'purge-test-document', name: 'Fichier local' });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });

    await page.locator('#purge-all-data').click();
    const reload = page.waitForEvent('load');
    await page.locator('#confirm-purge').click();
    await expect(page.locator('#purge-status')).toContainText('Les données enregistrées par Famili-IA ont été supprimées');
    await reload;

    const storedState = await page.evaluate(async () => {
      const request = indexedDB.open('FamiliIADatabase', 2);
      const database = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const count = await new Promise((resolve, reject) => {
        const transaction = database.transaction('documents', 'readonly');
        const countRequest = transaction.objectStore('documents').count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
      });
      database.close();
      return { documentCount: count, savedFamily: localStorage.getItem('famili-ia-family') };
    });

    expect(storedState).toEqual({ documentCount: 0, savedFamily: null });
    await expect(page.locator('.data-file-row')).toHaveCount(5);
  });
});
