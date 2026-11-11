import { test, expect } from '@playwright/test';

async function openInventory(page) {
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/vos-donnees');
  await ready;
}

async function expectUsablePanel(panel) {
  const result = await panel.evaluate(root => {
    const undersized = [...root.querySelectorAll('button, a[href], input:not([type="hidden"]):not(.visually-hidden), textarea')]
      .filter(el => {
        const bounds = el.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && (bounds.width < 47.5 || bounds.height < 47.5);
      }).map(el => el.id || el.textContent);
    const bounds = root.getBoundingClientRect();
    return {
      undersized,
      overflow: root.scrollWidth > root.clientWidth + 1,
      outsideViewport: bounds.left < 0 || bounds.right > innerWidth + 1
        || (root.tagName === 'DIALOG' && (bounds.top < 0 || bounds.bottom > innerHeight + 1))
    };
  });
  expect(result).toEqual({ undersized: [], overflow: false, outsideViewport: false });
}

async function seedPhotoRecords(page, count = 1) {
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://localhost:5179/#/recherche');
  await initialized;
  await page.evaluate(async photoCount => {
    const { createDocumentIndexRecord } = await import('/document-index.js');
    const documents = [];
    for (let index = 0; index < photoCount; index += 1) {
      const photo = {
        id: `gallery-test-photo-${index}`,
        type: 'Image',
        name: `vacances-${index}.jpg`,
        isLocal: true,
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
      };
      photo.indexRecord = await createDocumentIndexRecord(photo);
      documents.push(photo);
    }
    const request = indexedDB.open('FamiliIADatabase', 3);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      for (const document of documents) store.put(document);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, count);
  const dialogsInitialized = page.waitForEvent('console', message =>
    message.type() === 'log' && message.text().includes('dialogs initialized')
  );
  await page.reload();
  await dialogsInitialized;
  await page.locator('#experimental-index-query').fill('photos importées en 2024');
  await page.locator('#experimental-index-form .submit-button').click();
}

test.describe('Vue Vos données et recherche unifiée', () => {
  for (const width of [390, 768, 1280, 1920]) {
    test(`identité partagée, aperçu et confirmation accessibles à ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
      await openInventory(page);
      await expect(page.locator('#data-inventory-status')).toHaveText('5 fichiers affichés sur 5');
      const firstFile = await page.locator('.data-file-row').first().boundingBox();
      const contentViewport = await page.locator('.main-content').boundingBox();
      expect(firstFile.y + firstFile.height).toBeLessThanOrEqual(contentViewport.y + contentViewport.height);
      await expectUsablePanel(page.locator('#view-vos-donnees'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const addButton = page.getByRole('button', { name: 'Ajouter des fichiers', exact: true });
      await addButton.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#view-importer')).toBeVisible();
      await expect(page.locator('#source-choice-dialog')).toBeHidden();
      await expectUsablePanel(page.locator('#view-importer'));
      await page.locator('#return-from-import').click();
      await expect(addButton).toBeFocused();

      const preview = page.locator('.data-file-row').first().getByRole('button');
      await preview.click();
      const dialog = page.locator('#source-dialog');
      await expect(dialog).toContainText("contenu d'exemple inventé");
      await expectUsablePanel(dialog);
      await page.keyboard.press('Escape');
      await expect(preview).toBeFocused();

      await page.locator('#purge-all-data').click();
      await expect(page.locator('#cancel-purge')).toBeFocused();
      await expectUsablePanel(page.locator('#purge-confirmation'));
      await page.keyboard.press('Escape');
      await expect(page.locator('#purge-all-data')).toBeFocused();
      await expect(page.locator('.data-file-row')).toHaveCount(5);
    });
  }

  test('état vide : réinitialiser les filtres retrouve les fichiers et actualise le résumé', async ({ page }) => {
    await openInventory(page);
    await page.locator('#view-vos-donnees [data-filter-category="Images"]').click();
    await expect(page.locator('#data-inventory-status')).toHaveText('0 fichier affiché sur 5');
    await page.getByRole('button', { name: 'Afficher tous les fichiers' }).click();
    await expect(page.locator('#data-inventory-status')).toHaveText('5 fichiers affichés sur 5');
    await expect(page.locator('#view-vos-donnees [data-filter-type="document"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#view-vos-donnees [data-filter-type="document"]')).toBeFocused();
    await expect(page).toHaveURL(/#\/vos-donnees$/);
  });

  test('ajout depuis l’inventaire : fichier local, aperçu et export JSON conservés', async ({ page }) => {
    await openInventory(page);
    await page.getByRole('button', { name: 'Ajouter des fichiers', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#choose-import-files').click();
    await (await chooser).setFiles({
      name: 'document-fictif.txt', mimeType: 'text/plain',
      buffer: Buffer.from('Document fictif pour la refonte UX. Référence : UX-E5.')
    });
    await expect(page.locator('#scan-progress-text')).toContainText('1/1 fichiers indexés');
    await page.goto('http://127.0.0.1:5179/#/vos-donnees');
    await expect(page.locator('#summary-total')).toHaveText('1');
    await expect(page.locator('#summary-local')).toHaveText('1');
    await expect(page.locator('#summary-demo')).toHaveText('0');
    await page.getByRole('button', { name: 'Consulter document-fictif.txt' }).click();
    await expect(page.locator('#dialog-content')).toContainText('UX-E5');
    await expect(page.locator('#dialog-notice-text')).toContainText("Ce n'est pas l'original");
    await page.keyboard.press('Escape');

    const downloading = page.waitForEvent('download');
    await page.locator('#export-all-data').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('famili-ia-data.json');
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const content = Buffer.concat(chunks).toString('utf8');
    expect(JSON.parse(content).documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'document-fictif.txt', isLocal: true })
    ]));
  });

  test('photo et annotations sur mobile : noms longs, annulation et enregistrement local', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openInventory(page);
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      await put('documents', {
        id: 'e5-photo', name: `Photo fictive ${'vacances'.repeat(20)}.jpg`, type: 'Image', isLocal: true,
        importedAt: '2026-01-01T10:00:00Z',
        photoAnnotations: {
          schemaVersion: 1, personIds: [], eventTags: [], captureDateOverride: null,
          placeLabel: null, placeSource: null, source: 'user'
        }
      });
    });
    const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.reload();
    await ready;
    await expect(page.locator('#summary-total')).toHaveText('1');
    await expect(page.locator('.data-badge--index')).toHaveText('Métadonnées seules');
    await expect(page.locator('.data-badge--source')).toHaveText('Fichier local');
    await expectUsablePanel(page.locator('#view-vos-donnees'));
    const detailButton = page.getByRole('button', { name: /Voir le détail de Photo fictive/ });
    await detailButton.click();
    const detail = page.locator('#photo-detail-dialog');
    await expect(detail).toContainText('Aucun aperçu');
    await expectUsablePanel(detail);
    await page.locator('#photo-detail-edit-annotations').click();
    const annotations = page.locator('#photo-annotations-dialog');
    await expect(annotations).toBeVisible();
    await expectUsablePanel(annotations);
    await page.locator('#photo-event-tags-input').fill('Voyage fictif');
    await page.locator('#cancel-photo-annotations-dialog').click();
    const associate = page.getByRole('button', { name: /Associer des membres/ });
    await associate.click();
    await expect(page.locator('#photo-event-tags-input')).toHaveValue('');
    await page.locator('#photo-event-tags-input').fill('Voyage fictif');
    await page.locator('#photo-place-input').fill('Lieu fictif');
    await page.getByRole('button', { name: 'Enregistrer les associations' }).click();
    await expect(annotations).toBeHidden();
    await expect(associate).toBeFocused();
    await expect(page.locator('.data-file-annotations')).toContainText('Voyage fictif');
    const stored = await page.evaluate(async () => {
      const { getAll } = await import('/db.js');
      return (await getAll('documents')).find(doc => doc.id === 'e5-photo').photoAnnotations;
    });
    expect(stored.eventTags).toEqual(['Voyage fictif']);
    expect(stored.placeLabel).toBe('Lieu fictif');
    await detailButton.click();
    await page.keyboard.press('Escape');
    await expect(detailButton).toBeFocused();
  });

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

    await expect(page.locator('.data-stat-card')).toHaveCount(5);
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

  test('la recherche unique combine les mots-clés et les filtres multi-sources', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://localhost:5179/#/recherche');
    await initialized;
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      const { createIndexRecord } = await import('/index-record.js');
      const document = { id: 'unified-search-test', name: 'Facture locale.txt', type: 'Texte',
        isLocal: true, content: '', keywords: '', summary: '' };
      document.indexRecord = createIndexRecord('local', document.id, {
        type: 'document',
        name: { value: document.name, source: 'provider' },
        coverage: 'metadata'
      });
      await put('documents', document);
    });
    const dialogsInitialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
    await page.reload();
    await dialogsInitialized;

    await expect(page.locator('#experimental-index-form')).toBeVisible();
    await expect(page.locator('#search-mode')).toHaveCount(0);
    await expect(page.locator('#moments-life-query')).toHaveCount(0);
    await page.locator('#search-filters-panel > summary').click();
    await page.locator('#experimental-index-source').selectOption('local');
    await page.locator('#experimental-index-type').selectOption('document');
    await page.locator('#experimental-index-query').fill('facture');
    await page.locator('#experimental-index-form .submit-button').click();
    await expect(page.locator('#experimental-index-results li')).toHaveCount(1);
    await expect(page.locator('#experimental-index-results')).toContainText('Facture locale.txt');

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
    for (const control of [anotherPhoto.locator('xpath=..'), page.locator('#moments-life-delete-selected')]) {
      const bounds = await control.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(48);
      expect(bounds.height).toBeGreaterThanOrEqual(48);
    }
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
    await expect(detailDialog.locator('#close-photo-detail')).toHaveCSS('height', '48px');
    await expect(detailDialog.locator('#photo-detail-image')).toHaveAttribute('src', 'data:image/jpeg;base64,AQID');
    await expect(detailDialog.locator('a')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(detailDialog).toBeHidden();

    await page.goto('http://localhost:5179/#/vos-donnees');
    const inventoryPhoto = page.locator('#data-inventory-list .data-file-row')
      .filter({ hasText: 'vacances-0.jpg' });
    await expect(inventoryPhoto).toHaveCount(1);
    await expect(inventoryPhoto.getByRole('button', { name: 'Voir le détail de vacances-0.jpg' })).toBeVisible();
    await inventoryPhoto.getByRole('button', { name: 'Voir le détail de vacances-0.jpg' }).click();
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.locator('#photo-detail-image')).toHaveAttribute('src', 'data:image/jpeg;base64,AQID');
    await page.keyboard.press('Escape');
    await expect(detailDialog).toBeHidden();

    await page.goto('http://localhost:5179/#/recherche');
    await expect(page.locator('#moments-life-search')).toBeVisible();
    await page.locator('#experimental-index-query').fill('photos importées en 2099');
    await page.locator('#experimental-index-form .submit-button').click();
    await expect(page.locator('#moments-life-search-results .moments-life-result')).toHaveCount(0);
    await expect(page.locator('#moments-life-selection-toolbar')).toBeHidden();
  });
});
