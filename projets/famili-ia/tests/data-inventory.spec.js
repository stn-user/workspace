import { test, expect } from '@playwright/test';

async function seedPhotoRecords(page, count = 1) {
  await page.goto('http://localhost:5179/#/vos-donnees');
  await expect(page.locator('.data-file-row')).toHaveCount(5);
  await page.evaluate(async photoCount => {
    const request = indexedDB.open('FamiliIADatabase', 3);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      for (let index = 0; index < photoCount; index += 1) {
        const id = `gallery-test-photo-${index}`;
        store.put({
          id,
          type: 'Image',
          name: `vacances-${index}.jpg`,
          importedAt: '2024-06-15T10:00:00.000Z',
          photoAnnotations: {
            schemaVersion: 1,
            personIds: [],
            eventTags: ['Vacances'],
            captureDateOverride: null,
            placeLabel: null,
            placeSource: null,
            source: 'user'
          },
          photoThumbnail: {
            schemaVersion: 1,
            mimeType: 'image/jpeg',
            width: 1,
            height: 1,
            byteLength: 3,
            dataUrl: 'data:image/jpeg;base64,AQID'
          }
        });
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, count);
  const initialized = page.waitForEvent('console', message =>
    message.type() === 'log' && message.text().includes('dialogs initialized')
  );
  await page.reload();
  await initialized;
  await page.locator('#moments-life-query').fill('photos importées en 2024');
  await page.locator('#moments-life-search-form button[type="submit"]').click();
}

test.describe('Vue Vos données et recherche unifiée', () => {
  test('migre un document IndexedDB v2 vers une fiche durable en v3', async ({ page }) => {
    await page.goto('http://localhost:5179/styles.css');
    await page.evaluate(async () => {
      const request = indexedDB.open('FamiliIADatabase', 2);
      const database = await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const store of ['users', 'family', 'equipment', 'documents', 'alerts', 'logs', 'access_logs']) {
            if (!db.objectStoreNames.contains(store)) {
              db.createObjectStore(store, { keyPath: 'id' });
            }
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put({
          id: 'legacy-local',
          name: 'ancien.txt',
          isLocal: true,
          content: 'Contenu historique à conserver'
        });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });

    await page.goto('http://localhost:5179/#/vos-donnees');
    await expect(page.locator('.data-file-row')).toHaveCount(1);
    const migrated = await page.evaluate(async () => {
      const { getAll, put } = await import('/db.js');
      const { rollbackDocumentIndexes } = await import('/document-index-migration.js');
      const request = indexedDB.open('FamiliIADatabase');
      const database = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const version = database.version;
      database.close();
      const documents = await getAll('documents');
      const document = documents.find(entry => entry.id === 'legacy-local');
      const rolledBack = await rollbackDocumentIndexes(
        documents,
        entry => put('documents', entry)
      );
      const afterRollback = (await getAll('documents')).find(entry => entry.id === 'legacy-local');
      return {
        version,
        document,
        rollback: {
          recordRemoved: !Object.hasOwn(rolledBack.find(entry => entry.id === 'legacy-local'), 'indexRecord'),
          contentPreserved: afterRollback.content === 'Contenu historique à conserver',
          recordAbsent: !Object.hasOwn(afterRollback, 'indexRecord')
        }
      };
    });

    expect(migrated.version).toBe(3);
    expect(migrated.document.content).toBe('Contenu historique à conserver');
    expect(migrated.document.indexRecord.sourceId).toBe('local');
    expect(migrated.document.indexRecord.itemId).toBe('legacy-local');
    expect(migrated.document.indexRecord.coverage).toBe('metadata');
    expect(migrated.rollback).toEqual({ recordRemoved: true, contentPreserved: true, recordAbsent: true });
  });

  test('adapte les cartes et les filtres aux petits écrans sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5179/#/vos-donnees');

    await expect(page.locator('.data-stat-card')).toHaveCount(4);
    await expect(page.locator('.data-file-row')).toHaveCount(5);
    await expect(page.locator('.data-view .chip').first()).toHaveCSS('min-height', '48px');
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
    await expect(page.locator('#filter-type-group .chip').first()).toHaveCSS('min-height', '48px');
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
    await expect(dialog).toContainText('Les fichiers d’origine locaux, Google Drive et OneDrive ne seront pas supprimés.');
    await page.locator('#cancel-purge').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.data-file-row')).toHaveCount(5);
  });

  test('purge les données applicatives confirmées sans supprimer les exemples intégrés', async ({ page }) => {
    await page.goto('http://localhost:5179/#/vos-donnees');
    await expect(page.locator('#summary-demo')).toHaveText('5');
    await page.evaluate(async () => {
      localStorage.setItem('famili-ia-family', JSON.stringify([{ id: 'custom-family-member' }]));
      const request = indexedDB.open('FamiliIADatabase', 3);
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
      const request = indexedDB.open('FamiliIADatabase', 3);
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

  test('ouvre un détail photo accessible et indique honnêtement la limite du fichier original', async ({ page }) => {
    await seedPhotoRecords(page);
    const photoDetail = page.locator('#photo-detail-dialog');
    await expect(page.locator('#moments-life-search-results')).toContainText('vacances-0.jpg');
    await page.locator('#moments-life-search-results')
      .getByRole('button', { name: 'Voir le détail de vacances-0.jpg' }).click();

    await expect(photoDetail).toBeVisible();
    await expect(photoDetail).toContainText('Famili-IA ne conserve pas le fichier original');
    await expect(photoDetail.locator('#photo-detail-image')).toBeVisible();
    await expect(photoDetail).toContainText('Importée dans Famili-IA');
    await page.keyboard.press('Escape');
    await expect(photoDetail).toBeHidden();
  });

  test('sélectionne au clavier sur plusieurs pages et supprime uniquement après confirmation', async ({ page }) => {
    await seedPhotoRecords(page, 25);
    await expect(page.locator('#moments-life-search-results .moments-life-result')).toHaveCount(24);

    await page.locator('#moments-life-select-page').check();
    await expect(page.locator('#moments-life-selection-status')).toHaveText('24 photos sélectionnées');
    await page.locator('#moments-life-next-page').click();
    await expect(page.locator('#moments-life-select-page')).not.toBeChecked();
    await page.locator('#moments-life-select-page').check();
    await expect(page.locator('#moments-life-selection-status')).toHaveText('25 photos sélectionnées');
    await page.locator('#moments-life-previous-page').click();
    await expect(page.locator('#moments-life-select-page')).toBeChecked();
    await page.locator('#moments-life-select-page').uncheck();
    await expect(page.locator('#moments-life-selection-status')).toHaveText('1 photo sélectionnée');

    await page.locator('#moments-life-next-page').click();
    const firstCheckbox = page.locator('[data-photo-select]').first();
    await firstCheckbox.focus();
    await firstCheckbox.press('Space');
    await expect(page.locator('#moments-life-selection-status')).toHaveText('Aucune photo sélectionnée');
    await firstCheckbox.press('Space');
    await expect(page.locator('#moments-life-selection-status')).toHaveText('1 photo sélectionnée');

    await page.locator('#moments-life-previous-page').click();
    const anotherPhoto = page.locator('[data-photo-select]').first();
    await anotherPhoto.focus();
    await anotherPhoto.press('Space');
    await expect(page.locator('#moments-life-selection-status')).toHaveText('2 photos sélectionnées');
    await expect(anotherPhoto.locator('xpath=..')).toHaveCSS('min-height', '44px');
    await expect(page.locator('#moments-life-delete-selected')).toHaveCSS('min-height', '44px');
    await page.locator('#moments-life-delete-selected').click();

    const confirmation = page.locator('#photo-delete-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Les fichiers originaux ne seront pas supprimés');
    await page.locator('#cancel-photo-delete').click();
    await expect(confirmation).toBeHidden();
    await expect(page.locator('#moments-life-selection-status')).toHaveText('2 photos sélectionnées');

    await page.locator('#moments-life-delete-selected').click();
    await page.locator('#confirm-photo-delete').click();
    await expect(confirmation).toBeHidden();
    await expect(page.locator('#moments-life-search-status')).toContainText('Les fichiers originaux sont préservés');
    const remainingPhotoIds = await page.evaluate(async () => {
      const request = indexedDB.open('FamiliIADatabase', 3);
      const database = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const ids = await new Promise((resolve, reject) => {
        const transaction = database.transaction('documents', 'readonly');
        const getAllRequest = transaction.objectStore('documents').getAll();
        getAllRequest.onsuccess = () => resolve(getAllRequest.result
          .filter(document => document.id.startsWith('gallery-test-photo-'))
          .map(document => document.id));
        getAllRequest.onerror = () => reject(getAllRequest.error);
      });
      database.close();
      return ids;
    });
    expect(remainingPhotoIds).toHaveLength(23);
  });

  test('reste utilisable sur téléphone, tablette et bureau avec une bibliothèque de 1 000 photos', async ({ page }) => {
    const viewports = [
      { name: 'téléphone étroit', width: 320, height: 740 },
      { name: 'tablette', width: 768, height: 1024 },
      { name: 'bureau', width: 1440, height: 900 }
    ];
    await page.setViewportSize(viewports[0]);
    await seedPhotoRecords(page, 1000);

    await expect(page.locator('#moments-life-search-status')).toContainText('1000 photos trouvées');
    await expect(page.locator('#moments-life-search-results .moments-life-result')).toHaveCount(24);
    await expect(page.locator('#moments-life-selection-toolbar')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Sélectionner la page' })).toBeVisible();

    const firstPageMetrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      contentHeight: document.querySelector('.main-content').scrollHeight,
      contentViewportHeight: document.querySelector('.main-content').clientHeight,
      photoRows: document.querySelectorAll('#moments-life-search-results .moments-life-result').length,
      loadedThumbnails: [...document.querySelectorAll('.moments-life-thumbnail')]
        .filter(image => image.hasAttribute('src')).length,
      totalThumbnails: document.querySelectorAll('.moments-life-thumbnail').length,
      selectionTargetHeight: document.querySelector('#moments-life-select-page').parentElement.getBoundingClientRect().height,
      deleteButtonMinHeight: getComputedStyle(document.querySelector('#moments-life-delete-selected')).minHeight,
      heapUsedBytes: performance.memory?.usedJSHeapSize ?? null
    }));
    expect(firstPageMetrics.documentWidth).toBeLessThanOrEqual(firstPageMetrics.viewportWidth);
    expect(firstPageMetrics.contentHeight).toBeGreaterThan(firstPageMetrics.contentViewportHeight);
    expect(firstPageMetrics.photoRows).toBe(24);
    expect(firstPageMetrics.loadedThumbnails).toBeLessThanOrEqual(24);
    expect(firstPageMetrics.totalThumbnails).toBeLessThanOrEqual(24);
    expect(firstPageMetrics.selectionTargetHeight).toBeGreaterThanOrEqual(44);
    expect(firstPageMetrics.deleteButtonMinHeight).toBe('44px');
    if (firstPageMetrics.heapUsedBytes !== null) {
      expect(firstPageMetrics.heapUsedBytes).toBeLessThan(256 * 1024 * 1024);
    }
    await page.locator('.main-content').evaluate(element => element.scrollTo(0, element.scrollHeight));
    await expect.poll(() => page.locator('.main-content').evaluate(element => element.scrollTop))
      .toBeGreaterThan(0);

    for (const viewport of viewports.slice(1)) {
      await page.setViewportSize(viewport);
      const widths = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      }));
      expect(widths.documentWidth, `horizontal overflow on ${viewport.name}`).toBeLessThanOrEqual(widths.viewportWidth);
      await expect(page.locator('#moments-life-search-results .moments-life-result')).toHaveCount(24);
    }

    const pageTurnDuration = await page.evaluate(() => {
      const next = document.querySelector('#moments-life-next-page');
      const previous = document.querySelector('#moments-life-previous-page');
      const start = performance.now();
      for (let turn = 0; turn < 20; turn += 1) next.click();
      for (let turn = 0; turn < 20; turn += 1) previous.click();
      return performance.now() - start;
    });
    expect(pageTurnDuration).toBeLessThan(5000);
    await expect(page.locator('#moments-life-search-results .moments-life-result')).toHaveCount(24);
    await page.locator('.main-content').evaluate(element => element.scrollTo(0, 0));

    await page.locator('#moments-life-search-results')
      .getByRole('button', { name: 'Voir le détail de vacances-0.jpg' }).click();
    const detailDialog = page.getByRole('dialog', { name: 'vacances-0.jpg' });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.locator('#close-photo-detail')).toHaveCSS('height', '44px');
    await expect(detailDialog.locator('#photo-detail-image')).toHaveAttribute('src', 'data:image/jpeg;base64,AQID');
    await expect(detailDialog.locator('a')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(detailDialog).toBeHidden();

    const inventoryPhoto = page.locator('#data-inventory-list .data-file-row')
      .filter({ hasText: 'vacances-0.jpg' });
    await expect(inventoryPhoto.getByRole('button', { name: 'Voir le détail de vacances-0.jpg' })).toBeVisible();
    await inventoryPhoto.getByRole('button', { name: 'Voir le détail de vacances-0.jpg' }).click();
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.locator('#photo-detail-image')).toHaveAttribute('src', 'data:image/jpeg;base64,AQID');
    await page.keyboard.press('Escape');
    await expect(detailDialog).toBeHidden();

    await page.locator('#moments-life-query').fill('photos importées en 2099');
    await page.locator('#moments-life-search-form button[type="submit"]').click();
    await expect(page.locator('#moments-life-search-results .moments-life-result')).toHaveCount(0);
    await expect(page.locator('#moments-life-selection-toolbar')).toBeHidden();
  });
});
