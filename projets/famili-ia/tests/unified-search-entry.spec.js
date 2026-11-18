import { test, expect } from '@playwright/test';
import { stateModuleUrl } from './helpers/app-state.js';

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

async function openReady(page, view, reload = false) {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  if (reload) await page.reload();
  else await page.goto(`http://127.0.0.1:5179/#/${view}`);
  await ready;
}

async function expectUsable(panel) {
  expect(await panel.evaluate(root => ({
    small: [...root.querySelectorAll('button, input:not([type=hidden]):not(.visually-hidden), select, summary')]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && (rect.width < 47.5 || rect.height < 47.5);
      }).map(el => el.id || el.textContent.trim()),
    overflow: root.scrollWidth > root.clientWidth + 1
  }))).toEqual({ small: [], overflow: false });
}

test('où sont mes photos : synthèse des copies par source et compte après rechargement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReady(page, 'recherche');
  await page.evaluate(async stateUrl => {
    const { addDocument } = await import(stateUrl);
    const { normalizePhotoAnnotations } = await import('/photo-annotations.js');
    const annotations = normalizePhotoAnnotations({ eventTags: ['Mariage'] });
    for (const [id, source] of [
      ['fictive-locale', {}],
      ['fictive-onedrive-a', { oneDriveSource: true, oneDriveAccountFingerprint: 'a'.repeat(64), sourceDir: 'Dossier fictif A' }],
      ['fictive-onedrive-b', { oneDriveSource: true, oneDriveAccountFingerprint: 'b'.repeat(64) }],
      ['fictive-drive', { driveSource: true }]
    ]) {
      await addDocument({ id, type: 'Image', name: `${id}.jpg`, isLocal: true,
        photoAnnotations: annotations, ...source });
    }
    await addDocument({ id: 'autre-photo', type: 'Image', name: 'autre.jpg', isLocal: true,
      photoAnnotations: normalizePhotoAnnotations({ eventTags: ['Voyage'] }) });
  }, await stateModuleUrl(page));
  await openReady(page, 'recherche', true);
  const query = page.locator('#experimental-index-query');
  await query.fill('Où sont mes photos de mon mariage ?');
  await query.press('Enter');
  const summary = page.locator('#moments-life-source-summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('li')).toHaveCount(4);
  await expect(summary).toContainText('Fichiers locaux : 1 copie indexée');
  await expect(summary).toContainText('OneDrive — compte 1 : 1 copie indexée');
  await expect(summary).toContainText('OneDrive — compte 2 : 1 copie indexée');
  await expect(summary).toContainText('Google Drive — compte non attribué : 1 copie indexée');
  await expect(summary).toContainText('peuvent représenter les mêmes photos');
  await expect(summary).toContainText("l'accès actuel aux originaux n'est pas garanti");
  const results = page.locator('#moments-life-search-results .moments-life-result');
  await expect(results).toHaveCount(4);
  await expect(results.filter({ hasText: 'fictive-onedrive-a.jpg' })).toContainText('Dossier fictif A');
  await expect(results.filter({ hasText: 'fictive-onedrive-b.jpg' })).toContainText('Dernière vérification de la copie : inconnue');
  await expect(results.filter({ hasText: 'autre.jpg' })).toHaveCount(0);
  await expectUsable(page.locator('#view-recherche'));

  await query.fill('Sur quelle source sont mes photos de randonnée ?');
  await query.press('Enter');
  await expect(summary).toBeHidden();
  await expect(page.locator('#moments-life-search-status')).toContainText('sources non indexées ne sont pas couvertes');
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 }
]) {
  test(`recherche unique de documents et photos à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', route => route.abort());
    const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://127.0.0.1:5179/#/recherche');
    await initialized;

    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      const { createIndexRecord } = await import('/index-record.js');
      const { createPhotoMetadata } = await import('/photo-metadata.js');
      const { generatePhotoThumbnail } = await import('/photo-thumbnails.js');
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
      const thumbnailBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      const photo = {
        id: 'unified-search-photo',
        type: 'Image',
        name: 'Vacances Québec.jpg',
        isLocal: true,
        importedAt: '2024-07-14T10:00:00.000Z',
        photoThumbnail: await generatePhotoThumbnail(thumbnailBlob),
        photoMetadata: createPhotoMetadata('unified-search-photo', {
          captureDate: {
            raw: '2024:07:14 10:00:00', localDateTime: '2024-07-14T10:00:00',
            offsetMinutes: null, source: { kind: 'exif', field: 'DateTimeOriginal' }
          }
        }),
        photoAnnotations: {
          schemaVersion: 1,
          personIds: [],
          eventTags: ['Vacances'],
          captureDateOverride: null,
          placeLabel: 'Québec',
          placeSource: 'user',
          source: 'user'
        }
      };
      photo.indexRecord = createIndexRecord('local', photo.id, {
        type: 'photo',
        name: { value: photo.name, source: 'provider' },
        dates: { priseDeVue: { value: '2024-07-14', source: 'provider' } },
        coverage: 'metadata',
        fields: [
          { name: 'eventTag', value: 'Vacances', source: 'user-input' },
          { name: 'place', value: 'Québec', source: 'user-input' }
        ]
      });
      await put('documents', photo);
    });
    const dialogsInitialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
    await page.reload();
    await dialogsInitialized;

    await expect(page.locator('#experimental-index-form')).toBeVisible();
    await expect(page.locator('#search-mode')).toHaveCount(0);
    await expect(page.locator('#moments-life-query')).toHaveCount(0);
    await page.locator('#experimental-index-query').fill('Photos des vacances à Québec en 2024');
    await page.locator('#experimental-index-form .submit-button').click();
    await expect(page.locator('#moments-life-search-status')).toContainText('1 photo trouvée');
    await expect(page.locator('#moments-life-search-results')).toContainText('Vacances Québec.jpg');
    const thumbnail = page.locator('.moments-life-thumbnail');
    await thumbnail.scrollIntoViewIfNeeded();
    await expect.poll(() => thumbnail.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const thumbnailBounds = await thumbnail.boundingBox();
    expect(thumbnailBounds.width).toBeGreaterThanOrEqual(240);
    expect(thumbnailBounds.height).toBeGreaterThanOrEqual(180);
    const provenance = page.locator('.moments-life-result .search-result-details');
    await expect(provenance).not.toHaveAttribute('open', '');
    await expect(page.locator('.moments-life-result .search-result-origin')).toContainText("accès à l'original non garanti");
    await provenance.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(provenance).toHaveAttribute('open', '');
    await expect(provenance).toContainText('Dernière vérification de la copie : inconnue');
    await expectUsable(page.locator('#view-recherche'));
    await page.locator('#search-filters-panel > summary').click();
    await expectUsable(page.locator('#view-recherche'));
    await page.locator('#search-filters-panel > summary').click();

    await page.locator('#experimental-index-query').fill('photos importées en 2024');
    await page.locator('#experimental-index-form .submit-button').click();
    await expect(page.locator('#moments-life-search-status')).toContainText('1 photo trouvée');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });

}

for (const width of [390, 1280]) {
  test(`photos annotées : phrase naturelle et date exacte à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openReady(page, 'recherche');
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      const { createDocumentIndexRecord } = await import('/document-index.js');
      const { normalizePhotoAnnotations } = await import('/photo-annotations.js');
      for (const [id, eventTag, captureDate, importedAt] of [
        ['jour-attendu', 'Mariage', '2024-09-06', '2025-01-02T10:00:00Z'],
        ['autre-jour', 'Mariage', '2024-09-07', '2024-09-06T10:00:00Z'],
        ['autre-evenement', 'Anniversaire', '2024-09-06', '2025-01-02T10:00:00Z'],
        ['sans-date', 'Mariage', null, '2025-01-02T10:00:00Z']
      ]) {
        const photo = {
          id, type: 'Image', name: `${id}-fictif.jpg`, isLocal: true, importedAt,
          photoAnnotations: normalizePhotoAnnotations({
            eventTags: [eventTag], placeLabel: 'Lieu fictif', placeSource: 'user',
            captureDateOverride: captureDate ? `${captureDate}T14:00` : null
          })
        };
        photo.indexRecord = await createDocumentIndexRecord(photo);
        await put('documents', photo);
      }
    });
    await openReady(page, 'recherche', true);
    const query = page.locator('#experimental-index-query');
    const results = page.locator('#moments-life-search-results .moments-life-result');
    const status = page.locator('#experimental-index-status');
    for (const text of ['mariage', 'montre moi toutes les photos de mon mariage']) {
      await query.fill(text);
      await query.press('Enter');
      await expect(results).toHaveCount(3);
      await expect(results.filter({ hasText: 'autre-evenement-fictif.jpg' })).toHaveCount(0);
    }
    for (const date of ['06/09/2024', '6/9/2024', '06-09-2024', '06.09.2024', '2024-09-06', '6 septembre 2024']) {
      await query.fill(`montre moi toutes les photos de mon mariage du ${date} à Lieu fictif`);
      await query.press('Enter');
      await expect(results).toHaveCount(1);
      await expect(results).toContainText('jour-attendu-fictif.jpg');
      await expect(status).toContainText(date);
    }
    await query.fill('photos du 06/09/2024');
    await query.press('Enter');
    await expect(results).toHaveCount(2);
    await expect(results.filter({ hasText: 'autre-jour-fictif.jpg' })).toHaveCount(0);
    await expect(results.filter({ hasText: 'sans-date-fictif.jpg' })).toHaveCount(0);
    await query.fill('photos importées le 06/09/2024');
    await query.press('Enter');
    await expect(results).toHaveCount(1);
    await expect(results).toContainText('autre-jour-fictif.jpg');
    await query.fill('photos du 31/02/2024');
    await query.press('Enter');
    await expect(results).toHaveCount(0);
    await expect(status).toContainText("La date indiquée n'est pas valide.");
  });
}

test('recherche unifiée : annotations photo corrigibles, détail conservé et suppression confirmée', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReady(page, 'recherche');
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    const { createDocumentIndexRecord } = await import('/document-index.js');
    const photo = {
      id: 'unified-photo-management',
      type: 'Image',
      name: 'Souvenir fictif.jpg',
      isLocal: true,
      importedAt: '2024-07-14T10:00:00.000Z',
      photoAnnotations: {
        schemaVersion: 1, personIds: [], eventTags: ['Vacances'],
        captureDateOverride: {
          localDateTime: '2024-07-14T10:00:00', offsetMinutes: null, source: 'user'
        },
        placeLabel: 'Québec', placeSource: 'user', source: 'user'
      }
    };
    photo.indexRecord = await createDocumentIndexRecord(photo);
    await put('documents', photo);
  });
  await openReady(page, 'recherche', true);

  const query = page.locator('#experimental-index-query');
  const submit = page.locator('#experimental-index-form .submit-button');
  const results = page.locator('#moments-life-search-results .moments-life-result');
  await query.fill('Photos des vacances à Québec en 2024');
  await submit.click();
  await expect(results).toHaveCount(1);
  await expect(results).toContainText('Souvenir fictif.jpg');

  await results.getByRole('button', { name: 'Corriger les annotations' }).click();
  const annotations = page.locator('#photo-annotations-dialog');
  await expect(annotations).toBeVisible();
  await page.locator('#photo-event-tags-input').fill('Voyage fictif');
  await page.locator('#photo-place-input').fill('Lyon');
  await page.getByRole('button', { name: 'Enregistrer les associations' }).click();
  await expect(annotations).toBeHidden();
  await expect(results).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    const photo = (await getAll('documents')).find(document => document.id === 'unified-photo-management');
    return photo.photoAnnotations;
  })).toMatchObject({ eventTags: ['Voyage fictif'], placeLabel: 'Lyon', placeSource: 'user' });

  await query.fill('Photos à Lyon en 2024');
  await submit.click();
  await expect(results).toHaveCount(1);
  await expect(results).toContainText('Événements saisis : Voyage fictif');
  await results.getByRole('button', { name: 'Voir le détail de Souvenir fictif.jpg' }).click();
  const detail = page.locator('#photo-detail-dialog');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Lyon (saisi manuellement)');
  await expect(detail).toContainText('Voyage fictif');
  await expect(detail).toContainText('ne conserve pas le fichier original');
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  await page.locator('#moments-life-search-results [data-photo-select]').check();
  await page.locator('#moments-life-delete-selected').click();
  const confirmation = page.locator('#photo-delete-confirmation');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Les fichiers originaux ne seront pas supprimés');
  await page.locator('#cancel-photo-delete').click();
  await expect(confirmation).toBeHidden();
  await expect(results).toHaveCount(1);
  await page.locator('#moments-life-search-results [data-photo-select]').check();
  await page.locator('#moments-life-delete-selected').click();
  await page.locator('#confirm-photo-delete').click();
  await expect(confirmation).toBeHidden();
  await expect(page.locator('#moments-life-search-status')).toContainText('Les fichiers originaux sont préservés');
  await expect(results).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/db.js')).getAll('documents')))
    .not.toContainEqual(expect.objectContaining({ id: 'unified-photo-management' }));
});

for (const width of [390, 768, 1280, 1920]) {
    test(`accueil harmonisé et découverte sans écriture à ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
      await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
      await openReady(page, 'accueil');
      await expect(page.locator('#onboarding-wizard')).toBeHidden();
      await expect(page.locator('#view-accueil')).toHaveAccessibleName('Accueil');
      await expect(page.locator('body')).toHaveClass(/ui-theme/);
      await expect(page.locator('body')).toHaveClass(/ui-warm/);
      await expect(page.locator('#dashboard-title')).toHaveText('Bienvenue chez vous');
      await expect(page.locator('.home-reminders-empty')).toContainText('Aucun rappel actif enregistré');
      await expectUsable(page.locator('#view-accueil'));
      await expect(page.locator('#dashboard-data-note')).toContainText('exemples fictifs');
      await expect(page.locator('#view-accueil [role="search"]')).toHaveCount(0);
      await expect(page.locator('.fab-add-document')).toHaveCount(0);
      const form = await page.getByRole('button', { name: 'Ouvrir la recherche', exact: true }).boundingBox();
      const main = await page.locator('.main-content').boundingBox();
      expect(form.y + form.height).toBeLessThanOrEqual(main.y + main.height);
      const hierarchy = await page.locator('#view-accueil').evaluate(root => {
        const hero = root.querySelector('.home-actions-panel');
        const reminders = root.querySelector('.verify-panel');
        const inventory = root.querySelector('.home-inventory');
        return Boolean(hero.compareDocumentPosition(reminders) & Node.DOCUMENT_POSITION_FOLLOWING)
          && Boolean(reminders.compareDocumentPosition(inventory) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(hierarchy).toBe(true);
      const before = await page.evaluate(async () => {
        const { getAll } = await import('/db.js');
        return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
      });
      await page.locator('[data-replay-demo]').click();
      await expect(page.locator('#step-3-title')).toBeFocused();
      await expect(page.locator('.onboarding-page-white')).toHaveCount(1);
      expect(await page.evaluate(async () => {
        const { getAll } = await import('/db.js');
        return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
      })).toEqual(before);
      await page.locator('#finish-onboarding-demo').click();
      await page.getByRole('button', { name: 'Ouvrir la recherche', exact: true }).click();
      await expect(page.locator('body')).toHaveClass(/ui-warm/);
      await expect(page.locator('#experimental-index-query')).toBeFocused();
      await expect(page.locator('#view-recherche [data-open-import]')).toHaveCount(1);
      await page.locator('#view-recherche [data-open-import]').click();
      await expect(page.locator('#import-title')).toBeFocused();
      await expect(page.locator('body')).toHaveClass(/ui-warm/);
      await expectUsable(page.locator('#view-importer'));
      await page.locator('#return-from-import').click();
      await expect(page.locator('#view-recherche [data-open-import]')).toBeFocused();
    });
  }

  test('accueil restauré : nom littéral et compteurs cohérents avec leurs destinations', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
    await openReady(page, 'accueil');
    const name = `<b>Alex & ${'Famille'.repeat(16)}</b>`;
    await page.evaluate(async ({ name, stateUrl }) => {
      const { getCurrentUser } = await import(stateUrl);
      const { put } = await import('/db.js');
      await put('users', { ...getCurrentUser(), name });
      for (const [id, type] of [['home-garantie', 'Garantie'], ['home-contrat', 'Contrat'], ['home-photo', 'Image']]) {
        await put('documents', { id, type, name: `${id}.txt`, isLocal: true, content: '' });
      }
    }, { name, stateUrl: await stateModuleUrl(page) });
    await openReady(page, 'accueil', true);
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.locator('#dashboard-user-name')).toHaveText(name);
    await expect(page.locator('#dashboard-title b')).toHaveCount(0);
    await expectUsable(page.locator('#view-accueil'));
    await expect(page.locator('#home-file-count')).toHaveText('3');
    await expect(page.locator('#home-warranty-count')).toHaveText('1');
    await expect(page.locator('#home-contract-count')).toHaveText('1');
    await expect(page.locator('#dashboard-data-note')).toContainText('3 fichiers enregistrés');
    await page.locator('.stat-card').filter({ has: page.locator('#home-warranty-count') }).click();
    await expect(page.locator('.data-file-row')).toHaveCount(1);
    await expect(page.locator('.data-file-row')).toContainText('home-garantie.txt');
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await page.locator('.stat-card').filter({ has: page.locator('#home-contract-count') }).click();
    await expect(page.locator('.data-file-row')).toHaveCount(1);
    await expect(page.locator('.data-file-row')).toContainText('home-contrat.txt');
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await page.locator('.stat-card').filter({ has: page.locator('#home-file-count') }).click();
    await expect(page.locator('.data-file-row')).toHaveCount(3);
  });

  test('accueil chaleureux : rappels enregistrés préservés et accès au foyer sans écriture', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
    await openReady(page, 'accueil');
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      await put('alerts', {
        id: 'home-personal-reminder',
        title: '<b>Vérifier le contrat</b>',
        detail: 'Rappel saisi pour le foyer',
        status: 'active',
        dueDate: '2027-06-12'
      });
      await put('alerts', {
        id: 'home-completed-reminder',
        title: 'Rappel déjà terminé',
        status: 'completed'
      });
    });
    await openReady(page, 'accueil', true);
    const stored = await page.evaluate(async () => (await import('/db.js')).getAll('alerts'));
    await expect(page.locator('.home-reminders-empty')).toHaveCount(0);
    await expect(page.locator('.verify-panel .verify-row')).toHaveCount(1);
    await expect(page.locator('.verify-panel')).toContainText('<b>Vérifier le contrat</b>');
    await expect(page.locator('.verify-panel b')).toHaveCount(0);
    await expect(page.locator('.verify-panel')).not.toContainText('Rappel déjà terminé');
    await page.locator('.verify-row').click();
    await expect(page).toHaveURL(/#\/alertes$/);
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await page.getByRole('button', { name: 'Ma maison', exact: true }).click();
    await expect(page).toHaveURL(/#\/maison$/);
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await page.getByRole('button', { name: 'Ma famille', exact: true }).click();
    await expect(page).toHaveURL(/#\/famille$/);
    expect(await page.evaluate(async () => (await import('/db.js')).getAll('alerts'))).toEqual(stored);
  });

  test('filtres au clavier, absence de résultat et remise à zéro avec retour du focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openReady(page, 'recherche');
    await expect(page.locator('#search-start')).toBeVisible();
    await expect(page.locator('#moments-life-search')).toBeHidden();
    const summary = page.locator('#search-filters-panel > summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.locator('#experimental-index-source').selectOption('local');
    await page.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
    await expect(page.locator('#search-filter-count')).toHaveText('(1)');
    await page.locator('#experimental-index-query').fill('introuvable-fictif-519');
    await page.locator('#experimental-index-query').press('Enter');
    await expect(page.locator('#experimental-index-status')).toContainText('Aucun résultat');
    await page.locator('#reset-search-filters').click();
    await expect(page.locator('#experimental-index-query')).toBeFocused();
    await expect(page.locator('#experimental-index-query')).toHaveValue('introuvable-fictif-519');
    await expect(page.locator('#search-filter-count')).toBeEmpty();
    await page.locator('#reset-empty-search').click();
    await expect(page.locator('#experimental-index-query')).toBeFocused();
    await expect(page.locator('#experimental-index-query')).toBeEmpty();
    await expect(page.locator('#search-start')).toBeVisible();
    await expect(page.locator('#reset-empty-search')).toBeHidden();
    await page.locator('#search-source-panel > summary').click();
    await expect(page.locator('#experimental-source-status')).toContainText('accès actuel');
    await expectUsable(page.locator('#view-recherche'));
  });
test('Vos données ne propose plus un raccourci vers une recherche photo distincte', async ({ page }) => {
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/vos-donnees');
  await initialized;
  await expect(page.getByRole('button', { name: 'Ouvrir la recherche photo' })).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`recherche chaleureuse : preuve littérale et provenance consultable à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openReady(page, 'recherche');
    await page.locator('#local-files-input').setInputFiles({
      name: 'notice-pergola.txt', mimeType: 'text/plain',
      buffer: Buffer.from('Entretien pergola : <b>nettoyer le filtre</b> tous les mois.')
    });
    await expect(page.locator('#scan-progress-text')).toContainText('1/1 fichiers indexés');
    const snapshot = () => page.evaluate(async () => {
      const { getAll } = await import('/db.js');
      return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
    });
    const before = await snapshot();
    const query = page.locator('#experimental-index-query');
    await query.fill('nettoyer');
    await query.press('Enter');
    const result = page.locator('#experimental-index-results .experimental-result');
    await expect(result).toHaveCount(1);
    await expect(result.locator('.search-result-proof')).toContainText('Extrait correspondant');
    await expect(result.locator('mark')).toHaveText('Entretien pergola : <b>nettoyer le filtre</b> tous les mois.');
    await expect(result.locator('mark b')).toHaveCount(0);
    await expect(result.locator('.search-result-origin')).toContainText("Local · texte partiellement recherché · accès à l'original non garanti");
    const provenance = result.locator('.search-result-details');
    await expect(provenance.locator('.search-evidence')).toBeHidden();
    await provenance.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(provenance.locator('.search-evidence')).toBeVisible();
    await expect(provenance).toContainText('Emplacement enregistré');
    await expectUsable(page.locator('#view-recherche'));
    await result.getByRole('button', { name: 'Voir la copie dans Famili-IA', exact: true }).click();
    await expect(page.locator('#source-dialog')).toContainText('<b>nettoyer le filtre</b>');
    await page.locator('#close-dialog').click();
    await query.fill('notice');
    await query.press('Enter');
    await expect(result.locator('.search-result-proof')).toContainText('Nom correspondant');
    await expect(result.locator('mark')).toHaveText('notice-pergola.txt');
    expect(await snapshot()).toEqual(before);
  });
}

test('ajout depuis Recherche : retour, filtres et question conserves, puis import local', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('famili-ia-source-choice-complete', 'true');
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/recherche?q=question-initiale');
  await initialized;
  await page.locator('#search-filters-panel > summary').click();
  await page.locator('#experimental-index-source').selectOption('local');
  await page.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
  await page.locator('#experimental-index-query').fill('filtre');
  await page.locator('#experimental-index-query').press('Enter');
  const snapshot = () => page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
  });
  const before = await snapshot();
  const add = page.locator('#view-recherche [data-open-import]');
  await add.click();
  await expect(page).toHaveURL(/#\/importer$/);
  await expect(page.locator('#source-choice-dialog')).toBeHidden();
  await page.locator('#return-from-import').click();
  await expect(add).toBeFocused();
  await expect(page.locator('#experimental-index-query')).toHaveValue('filtre');
  await expect(page.locator('#experimental-index-source')).toHaveValue('local');
  expect(await snapshot()).toEqual(before);
  await add.click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#choose-import-files').click();
  await (await chooser).setFiles({
    name: 'filtre-fictif.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Notice fictive : nettoyer le filtre.')
  });
  await expect(page.locator('#scan-progress-text')).toContainText('1/1 fichiers indexés');
  await expect(page.locator('#view-recherche')).toBeVisible();
  await expect(page.locator('#experimental-index-query')).toHaveValue('filtre');
  await expect(page.locator('#experimental-index-source')).toHaveValue('local');
  await expect(page.locator('#return-from-import')).toBeHidden();
  expect(errors).toEqual([]);
  await expect(page.locator('#search-mode')).toHaveCount(0);
});
