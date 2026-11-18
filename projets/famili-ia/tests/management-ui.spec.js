import { test, expect } from '@playwright/test';

async function openView(page, view) {
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto(`http://127.0.0.1:5179/#/${view}`);
  await ready;
}

async function reloadView(page) {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await ready;
}

async function expectUsable(panel) {
  expect(await panel.evaluate(root => {
    const small = [...root.querySelectorAll('button, input:not([type="hidden"]):not(.visually-hidden), select, textarea, summary')]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && (rect.width < 47.5 || rect.height < 47.5);
      }).map(el => el.id || el.textContent);
    const rect = root.getBoundingClientRect();
    return {
      small,
      overflow: root.scrollWidth > root.clientWidth + 1,
      outside: rect.left < 0 || rect.right > innerWidth + 1
        || (root.tagName === 'DIALOG' && (rect.top < 0 || rect.bottom > innerHeight + 1))
    };
  })).toEqual({ small: [], overflow: false, outside: false });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
  });
}

for (const width of [390, 768, 1280, 1920]) {
  test(`gestion : trois vues et saisie accessibles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    const errors = [];
    let externalRequests = 0;
    page.on('request', request => { if (request.url().startsWith('https://')) externalRequests++; });
    page.on('pageerror', error => errors.push(error.message));
    await openView(page, 'importer');
    await expect(page.locator('body')).toHaveClass(/ui-theme/);
    await expect(page.locator('body')).toHaveClass(/ui-warm/);
    await expect(page.locator('.plus-item').first()).toBeHidden();
    await expectUsable(page.locator('#view-importer'));
    const add = page.locator('#choose-import-files');
    const bounds = await add.boundingBox();
    const viewport = await page.locator('.main-content').boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.y + viewport.height);
    await page.locator('#import-library-title').scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => {
      const main = document.querySelector('.main-content');
      main.scrollTop = main.scrollHeight;
      window.scrollTo(0, document.scrollingElement.scrollHeight);
      const mainBounds = main.getBoundingClientRect();
      const lastAction = document.querySelector('#view-importer [data-open-view="recherche"]').getBoundingClientRect();
      const menu = document.querySelector('.bottom-nav').getBoundingClientRect();
      return {
        outerOverflow: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
        outerScroll: window.scrollY,
        innerScroll: main.scrollTop,
        lastActionWithinMain: lastAction.top >= mainBounds.top && lastAction.bottom <= mainBounds.bottom,
        menuBottom: menu.height > 0 ? menu.bottom : null,
        viewportHeight: innerHeight
      };
    });
    expect(scroll.outerOverflow, 'pas de page vide sous le menu').toBeLessThanOrEqual(1);
    expect(scroll.outerScroll, 'seul le contenu principal doit défiler').toBe(0);
    expect(scroll.innerScroll).toBeGreaterThan(0);
    expect(scroll.lastActionWithinMain, 'dernière action accessible en bas du contenu').toBe(true);
    if (scroll.menuBottom !== null) expect(scroll.menuBottom).toBe(scroll.viewportHeight);
    const manual = page.locator('[data-action="manual"]');
    await manual.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Saisie manuelle', exact: true });
    await expect(page.getByLabel('Titre du document', { exact: true })).toBeFocused();
    await expectUsable(dialog);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(manual).toBeFocused();
    await manual.click();
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(manual).toBeFocused();
    await expect(page.locator('#manual-entry-dialog')).toHaveCount(0);
    const before = await snapshot(page);
    const requestsBeforeOptions = externalRequests;
    await expect(page.locator('#import-google-availability')).not.toHaveText('Vérification de la disponibilité…');
    await expect(page.locator('#import-onedrive-availability')).not.toHaveText('Vérification de la disponibilité…');
    const sources = page.getByRole('button', { name: 'Options OneDrive', exact: true });
    await sources.click();
    await expect(page.locator('#source-choice-dialog')).toBeVisible();
    await expect(page.locator('#source-choice-dialog .source-choice:visible')).toHaveCount(1);
    await expect(page.locator('#source-choice-dialog')).toContainText('Files.Read');
    await expect(page.locator('#close-source-choice')).toBeFocused();
    await expectUsable(page.locator('#source-choice-dialog'));
    await page.keyboard.press('Escape');
    await expect(sources).toBeFocused();
    const google = page.getByRole('button', { name: 'Options Google Drive', exact: true });
    await google.click();
    await expect(page.locator('#connect-google-drive')).toBeVisible();
    await expect(page.locator('#onedrive-options')).toBeHidden();
    await expectUsable(page.locator('#source-choice-dialog'));
    await page.keyboard.press('Escape');
    await expect(google).toBeFocused();
    const dropbox = page.getByRole('button', { name: 'Options Dropbox', exact: true });
    await dropbox.click();
    await expect(page.locator('#dropbox-options')).toBeVisible();
    await expect(page.locator('#source-choice-dialog .source-choice:visible')).toHaveCount(1);
    await expect(page.locator('#source-choice-dialog')).toContainText('Full Dropbox');
    await expectUsable(page.locator('#source-choice-dialog'));
    await page.keyboard.press('Escape');
    await expect(dropbox).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
    expect(externalRequests).toBe(requestsBeforeOptions);
    await page.evaluate(() => { location.hash = '#/profil'; });
    await expect(page.locator('#profile-title')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/ui-warm/);
    await expectUsable(page.locator('#view-profil'));
    await expect(page.locator('#pref-auto-scan')).toHaveCount(0);
    await expect(page.locator('.profile-address')).not.toHaveAttribute('open', '');
    await page.locator('.profile-address summary').click();
    await expectUsable(page.locator('#view-profil'));
    for (const view of ['profil', 'plus']) {
      await page.evaluate(view => { location.hash = `#/${view}`; }, view);
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      const scroll = await page.evaluate(() => {
        const main = document.querySelector('.main-content');
        main.scrollTop = main.scrollHeight;
        window.scrollTo(0, document.scrollingElement.scrollHeight);
        const last = document.querySelector(location.hash.endsWith('profil')
          ? '#start-view-tour-profile' : '#view-plus [data-nav="vos-donnees"]').getBoundingClientRect();
        const bounds = main.getBoundingClientRect();
        return {
          overflow: document.scrollingElement.scrollHeight - innerHeight,
          scroll: window.scrollY,
          lastVisible: last.top >= bounds.top && last.bottom <= bounds.bottom
        };
      });
      expect(scroll.overflow).toBeLessThanOrEqual(1);
      expect(scroll.scroll).toBe(0);
      expect(scroll.lastVisible).toBe(true);
    }
    await page.evaluate(() => { location.hash = '#/plus'; });
    await expect(page.locator('#plus-title')).toBeVisible();
    await expect(page.locator('#view-plus .plus-item')).toHaveCount(5);
    await expectUsable(page.locator('#view-plus'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('saisie manuelle : annuler sans ecriture, enregistrer, retrouver et recharger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  let external = 0;
  await page.route('https://**/*', route => { external++; return route.abort(); });
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/importer');
  await ready;
  const before = await snapshot(page);
  const requests = external;
  await page.locator('[data-action="manual"]').click();
  await page.locator('#manual-title').fill('Ne pas enregistrer');
  await page.keyboard.press('Escape');
  expect(await snapshot(page)).toEqual(before);
  await page.locator('[data-action="manual"]').click();
  await expectUsable(page.locator('#manual-entry-dialog'));
  const name = '<Fiche & Test> ' + 'Long'.repeat(30);
  await page.locator('#manual-title').fill(name);
  await page.locator('#manual-type').selectOption('Notice');
  await page.locator('#manual-content').fill('Notice fictive : nettoyer le filtre chaque mois.');
  await page.locator('#manual-form [type="submit"]').click();
  await expect(page.locator('#manual-entry-dialog')).toHaveCount(0);
  await expect(page.locator('[data-action="manual"]')).toBeFocused();
  await expect(page.locator('#import-feedback')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#import-feedback-status')).toContainText(name);
  await expect(page.locator('#import-progress')).toBeHidden();
  await page.getByRole('button', { name: 'Voir mes fichiers', exact: true }).click();
  await expect(page.locator('.data-file-name')).toHaveText(`${name}.pdf`);
  await page.locator('.data-file-row button').click();
  await expect(page.locator('#source-dialog')).toContainText('nettoyer le filtre');
  await page.keyboard.press('Escape');
  expect(external).toBe(requests);
  await reloadView(page);
  await expect(page.locator('.data-file-name')).toHaveText(`${name}.pdf`);
  const after = await snapshot(page);
  expect(after[1]).toHaveLength(1);
  for (const index of [0, 2, 3]) expect(after[index]).toEqual(before[index]);
});

test('saisie manuelle : stockage indisponible garde la saisie et permet de reessayer', async ({ page }) => {
  await openView(page, 'importer');
  await page.locator('[data-action="manual"]').click();
  await page.locator('#manual-title').fill('Fiche fictive');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'documents') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Stockage de test indisponible', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.locator('#manual-form [type="submit"]').click();
  await expect(page.locator('#manual-form-status')).toContainText("n'a pas pu être terminé");
  await expect(page.locator('#manual-title')).toHaveValue('Fiche fictive');
  await expect(page.locator('#manual-form [type="submit"]')).toBeEnabled();
  expect((await snapshot(page))[1]).toHaveLength(0);
  await page.locator('#manual-form [type="submit"]').click();
  await expect(page.locator('#manual-entry-dialog')).toHaveCount(0);
  expect((await snapshot(page))[1]).toHaveLength(1);
});

test('import : selecteurs uniques, annulation et fichier local toujours indexes', async ({ page }) => {
  await openView(page, 'importer');
  const before = await snapshot(page);
  for (const selector of ['#choose-import-files', '#btn-folder', '#btn-camera']) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator(selector).click();
    const control = await chooser;
    expect(await control.element().getAttribute('id')).toBe(selector === '#btn-folder' ? 'folder-input' : selector === '#btn-camera' ? 'camera-input' : 'import-input');
    if (selector !== '#btn-folder') await control.setFiles([]);
  }
  expect(await snapshot(page)).toEqual(before);
  await expect(page.locator('#import-feedback')).toBeHidden();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function () {
      File.prototype.text = original;
      await new Promise(resolve => { window.releaseImportRead = resolve; });
      return original.call(this);
    };
  });
  await page.clock.install();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#choose-import-files').click();
  await (await chooser).setFiles({
    name: 'notice-fictive.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Notice fictive. Nettoyer le filtre chaque mois.')
  });
  await expect(page.locator('#view-recherche')).toBeVisible();
  await expect(page.locator('#import-progress')).toHaveJSProperty('value', 0);
  await page.clock.fastForward(5000);
  await expect(page.locator('#import-progress')).toHaveJSProperty('value', 0);
  expect((await snapshot(page))[1]).toHaveLength(0);
  await page.evaluate(() => window.releaseImportRead());
  await expect(page.locator('#scan-progress-text')).toContainText('1/1 fichiers indexés');
  await page.clock.fastForward(5100);
  await expect(page.locator('#scan-progress-container')).toBeHidden();
  await page.evaluate(() => { location.hash = '#/importer'; });
  await expect(page.locator('#import-feedback-status')).toContainText('1/1 fichiers indexés');
  await expect(page.locator('#import-feedback')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#import-progress')).toHaveJSProperty('value', 1);
  await reloadView(page);
  await expect(page.locator('#import-feedback')).toBeHidden();
  await page.evaluate(() => { location.hash = '#/vos-donnees'; });
  await expect(page.locator('.data-file-name')).toHaveText('notice-fictive.txt');
});

test('import : selection invalide sans ecriture, bilan partiel et nouvel ajout sans erreur residuelle', async ({ page }) => {
  await openView(page, 'importer');
  const before = await snapshot(page);
  for (const file of [
    { name: 'refuse.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('test') },
    { name: 'trop-grand.txt', mimeType: 'text/plain', buffer: Buffer.alloc(1024 * 1024 + 1) }
  ]) {
    await page.locator('#import-input').setInputFiles(file);
    await expect(page.locator('#import-feedback')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#import-feedback-status')).toContainText("Aucun fichier de cette sélection n'a été ajouté");
    await expect(page.locator('#import-progress')).toBeHidden();
    expect(await snapshot(page)).toEqual(before);
  }
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'documents') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Stockage de test indisponible', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.locator('#import-input').setInputFiles(
    ['notice-a.txt', 'notice-b.txt'].map(name => ({
      name, mimeType: 'text/plain', buffer: Buffer.from('Nettoyer le filtre.')
    }))
  );
  await expect(page.locator('#scan-progress-text')).toContainText('1/2 fichiers indexés');
  await page.evaluate(() => { location.hash = '#/importer'; });
  await expect(page.locator('#import-feedback')).toHaveAttribute('data-state', 'warning');
  await expect(page.locator('#import-feedback-status')).toContainText('1 échec');
  await expect(page.locator('#import-progress')).toHaveJSProperty('value', 2);
  await expect(page.locator('#import-progress')).toHaveJSProperty('max', 2);
  expect((await snapshot(page))[1]).toHaveLength(1);
  await page.locator('#import-input').setInputFiles({
    name: 'nouvel-ajout.txt', mimeType: 'text/plain', buffer: Buffer.from('Notice suivante.')
  });
  await expect(page.locator('#scan-progress-text')).toContainText('1/1 fichiers indexés');
  await page.evaluate(() => { location.hash = '#/importer'; });
  await expect(page.locator('#import-feedback')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#import-feedback-status')).not.toContainText('échec');
  expect((await snapshot(page))[1]).toHaveLength(2);
});

test('import : photo conservee avec avertissements sans annoncer un succes complet', async ({ page }) => {
  await openView(page, 'importer');
  await page.locator('#import-input').setInputFiles({
    name: 'photo-abimee.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a photo')
  });
  await expect(page.locator('#scan-progress-text')).toContainText('Indexation terminée');
  await page.evaluate(() => { location.hash = '#/importer'; });
  await expect(page.locator('#import-feedback')).toHaveAttribute('data-state', 'warning');
  await expect(page.locator('#import-feedback-status')).toContainText('1/1 fichiers indexés');
  await expect(page.locator('#import-feedback-status')).toContainText('vignette indisponible');
  await expect(page.locator('#import-feedback-warnings')).toContainText('métadonnées photo');
  expect((await snapshot(page))[1]).toHaveLength(1);
});

test('import : interruption entre deux lots garde les compteurs atteints sans annoncer la fin', async ({ page }) => {
  await openView(page, 'importer');
  await page.evaluate(async () => {
    const { BackgroundSyncWorker } = await import('/background-sync.js');
    const original = BackgroundSyncWorker.prototype.start;
    BackgroundSyncWorker.prototype.start = function () {
      BackgroundSyncWorker.prototype.start = original;
      const report = this.onProgress;
      this.onProgress = info => {
        report(info);
        if (info.status === 'indexing' && info.processed === 5) this.stop();
      };
      return original.call(this);
    };
  });
  await page.locator('#import-input').setInputFiles(
    Array.from({ length: 6 }, (_, index) => ({
      name: `notice-${index}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Notice filtre.')
    }))
  );
  await expect(page.locator('#scan-progress-text')).toContainText('Indexation interrompue');
  await page.evaluate(() => { location.hash = '#/importer'; });
  await expect(page.locator('#import-feedback')).toHaveAttribute('data-state', 'warning');
  await expect(page.locator('#import-feedback-status')).toContainText('5/6 fichiers traités');
  await expect(page.locator('#import-feedback-status')).toContainText('5 indexés');
  await expect(page.locator('#import-progress')).toHaveJSProperty('value', 5);
  await expect(page.locator('#import-progress')).toHaveJSProperty('max', 6);
  expect((await snapshot(page))[1]).toHaveLength(5);
});

test('profil : routes directes, sauvegarde clavier, champs vides et preferences conservees', async ({ page }) => {
  await openView(page, 'profil');
  const initial = await page.evaluate(async () => {
    const { getCurrentUser } = await import('/state.js');
    const { put } = await import('/db.js');
    const user = {
      ...getCurrentUser(), avatar: '🌿', customMetadata: { preserved: true },
      preferences: { ...getCurrentUser().preferences, enableAutoScan: true, scanDirectories: ['Archives'] },
      privacy: { ...getCurrentUser().privacy, telemetryEnabled: true, dataSharingConsent: true,
        photoLocationConsent: true, lastConsentDate: '2025-01-02T03:04:05.000Z' }
    };
    await put('users', user);
    return user;
  });
  await reloadView(page);
  await expect(page.locator('#consent-telemetry, #consent-sharing, #profile-role-readonly, #pref-auto-scan')).toHaveCount(0);
  const name = '<Profil & Test> ' + 'Long'.repeat(30);
  await page.locator('#edit-name').fill(name);
  await page.locator('.profile-address summary').click();
  await page.locator('#edit-profile-address').fill('');
  await page.locator('#edit-profile-postal').fill('');
  await page.locator('#edit-profile-city').fill('');
  await page.locator('#edit-name').press('Enter');
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  await expect(page.locator('#profile-name')).toHaveText(name);
  await expectUsable(page.locator('#view-profil'));
  await reloadView(page);
  await expect(page.locator('#edit-name')).toHaveValue(name);
  await expect(page.locator('#edit-profile-address')).toHaveValue('');
  await expect(page.locator('#consent-photo-gps')).toBeChecked();
  const unchanged = (await snapshot(page))[0][0];
  expect(unchanged).toEqual({ ...initial, name, address: '', postalCode: '', city: '' });
  await expect(page.locator('#profile-avatar')).toHaveText('🌿');
  await page.locator('.profile-address summary').click();
  await page.locator('#edit-profile-address').fill('12 rue du Test');
  await page.locator('#edit-profile-postal').fill('75000');
  await page.locator('#edit-profile-city').fill('Ville choisie');
  await page.locator('#consent-photo-gps').uncheck();
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  const saved = await page.evaluate(async () => {
    const { getCurrentUser } = await import('/state.js');
    return getCurrentUser();
  });
  expect(saved.role).toBe(initial.role);
  expect(saved.preferences).toEqual(initial.preferences);
  expect(saved.privacy.telemetryEnabled).toBe(true);
  expect(saved.privacy.dataSharingConsent).toBe(true);
  expect(saved.privacy.photoLocationConsent).toBe(false);
  await page.locator('#edit-name').fill('   ');
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toContainText("nom d'affichage");
  await expect(page.locator('#edit-name')).toBeFocused();
  await page.evaluate(() => { location.hash = '#/maison'; });
  await expect(page.locator('#view-maison')).toContainText('12 rue du Test');
  await expect(page.locator('#view-maison')).toContainText('Ville choisie');
  await page.locator('.property-edit-btn').click();
  await expect(page.locator('#edit-name')).toHaveValue(name);
  await page.getByRole('button', { name: 'Gérer mes données', exact: true }).click();
  await expect(page.locator('#view-vos-donnees')).toBeVisible();
});

test('Plus : chaque destination et retour restent accessibles sans changer les donnees', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openView(page, 'plus');
  const before = await snapshot(page);
  await expect(page.locator('.plus-group')).toHaveCount(2);
  for (const destination of ['alertes', 'famille', 'assistant', 'profil', 'vos-donnees']) {
    const button = page.locator(`#view-plus [data-nav="${destination}"]`);
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`#view-${destination}`)).toBeVisible();
    await expect(page.locator('.plus-item').first()).toBeHidden();
    await page.goBack();
    await expect(page.locator('#view-plus')).toBeVisible();
  }
  expect(await snapshot(page)).toEqual(before);
});

test('profil : erreur de stockage annoncee sans perdre la saisie', async ({ page }) => {
  await openView(page, 'profil');
  const before = await snapshot(page);
  await page.locator('#edit-name').fill('Profil fictif');
  await page.locator('#consent-photo-gps').check();
  const failNextUserWrite = () => page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'users') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Stockage de test indisponible', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await failNextUserWrite();
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toContainText("n'ont pas pu être enregistrées");
  await expect(page.locator('#edit-name')).toHaveValue('Profil fictif');
  await expect(page.locator('#consent-photo-gps')).not.toBeChecked();
  expect((await snapshot(page))[0]).toEqual(before[0]);
  expect(await page.evaluate(async () => (await import('/state.js')).getCurrentUser())).toEqual(before[0][0]);
  await failNextUserWrite();
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toContainText("n'ont pas pu être enregistrées");
  await expect(page.locator('#edit-name')).toHaveValue('Profil fictif');
  expect((await snapshot(page))[0]).toEqual(before[0]);
  expect(await page.evaluate(async () => (await import('/state.js')).getCurrentUser())).toEqual(before[0][0]);
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  await reloadView(page);
  await expect(page.locator('#edit-name')).toHaveValue('Profil fictif');
});

test('profil : retrait GPS partiel signale puis purge persistante sans toucher aux originaux', async ({ page }) => {
  await openView(page, 'profil');
  await page.locator('#consent-photo-gps').check();
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  await page.evaluate(async () => {
    const { addDocument } = await import('/state.js');
    const { createPhotoMetadata } = await import('/photo-metadata.js');
    for (const id of ['gps-first', 'gps-second']) {
      await addDocument({
        id, type: 'Image', name: `${id}.jpg`, isLocal: true,
        originalUrl: `https://example.invalid/${id}.jpg`,
        photoMetadata: createPhotoMetadata(id, { location: {
          status: 'available', latitude: 48.8566, longitude: 2.3522,
          source: { kind: 'exif', field: 'GPS' }
        } })
      });
    }
  });
  const before = await snapshot(page);
  expect(before[1].filter(doc => doc.id.startsWith('gps-')).every(doc =>
    doc.photoFacts.facts.some(fact => fact.kind === 'location')
      && doc.indexRecord.fields.some(field => field.name === 'coordinates'))).toBe(true);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'documents' && ++writes === 2) {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Purge de test interrompue', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.locator('#consent-photo-gps').uncheck();
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toContainText('déjà effacées ne sont pas restaurées');
  await expect(page.locator('#consent-photo-gps')).toBeChecked();
  const partial = (await snapshot(page))[1].filter(doc => doc.id.startsWith('gps-'));
  expect(partial.filter(doc => doc.photoMetadata.location.status === 'available')).toHaveLength(1);
  await page.locator('#consent-photo-gps').uncheck();
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  await reloadView(page);
  await expect(page.locator('#consent-photo-gps')).not.toBeChecked();
  const after = await snapshot(page);
  for (const doc of after[1].filter(doc => doc.id.startsWith('gps-'))) {
    expect(doc.originalUrl).toBe(before[1].find(item => item.id === doc.id).originalUrl);
    expect(JSON.stringify(doc)).not.toContain('48.8566');
    expect(doc.photoFacts.facts.some(fact => fact.kind === 'location')).toBe(false);
    expect(doc.indexRecord.fields.some(field => field.name === 'coordinates')).toBe(false);
  }
  for (const index of [2, 3, 4]) expect(after[index]).toEqual(before[index]);
});

test('profil : acces global, initiale Unicode et raccourcis sans ecriture implicite', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
  await openView(page, 'accueil');
  await page.getByRole('button', { name: 'Ouvrir mon profil', exact: true }).click();
  await expect(page.locator('#view-profil')).toBeVisible();
  await page.locator('#edit-name').fill('Éloïse');
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  await expect(page.locator('#profile-avatar')).toHaveText('É');
  await reloadView(page);
  await expect(page.locator('#profile-avatar')).toHaveText('É');
  const before = await snapshot(page);
  for (const [label, view] of [['Ajouter des fichiers', 'importer'], ['Mes alertes', 'alertes'], ['Gérer mes données', 'vos-donnees']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    if (view === 'importer') await page.locator('#return-from-import').click();
    else await page.goBack();
    await expect(page.locator('#view-profil')).toBeVisible();
    if (view === 'importer') await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused();
  }
  expect(await snapshot(page)).toEqual(before);
});

test('dossier sur navigateur mobile simule : choix multiple explicite et sans import automatique', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
  });
  await openView(page, 'importer');
  const before = await snapshot(page);
  await expect(page.locator('#folder-selection-help')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btn-folder').click();
  const control = await chooser;
  expect(await control.element().getAttribute('id')).toBe('import-input');
  expect(control.isMultiple()).toBe(true);
  await control.setFiles([]);
  expect(await snapshot(page)).toEqual(before);
});
