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
    page.on('pageerror', error => errors.push(error.message));
    await openView(page, 'importer');
    await expect(page.locator('body')).toHaveClass(/ui-theme/);
    await expect(page.locator('.plus-item').first()).toBeHidden();
    await expectUsable(page.locator('#view-importer'));
    const add = page.locator('#choose-import-files');
    const bounds = await add.boundingBox();
    const viewport = await page.locator('.main-content').boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.y + viewport.height);
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
    const sources = page.getByRole('button', { name: 'Choisir une autre source', exact: true });
    await sources.click();
    await expect(page.locator('#source-choice-dialog')).toBeVisible();
    await expect(page.locator('#close-source-choice')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sources).toBeFocused();
    await page.evaluate(() => { location.hash = '#/profil'; });
    await expect(page.locator('#profile-title')).toBeVisible();
    await expectUsable(page.locator('#view-profil'));
    await expect(page.locator('#pref-auto-scan')).toBeDisabled();
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
  for (const selector of ['#choose-import-files', '[data-action="drag-drop"]', '#btn-folder', '#btn-camera']) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator(selector).click();
    const control = await chooser;
    expect(await control.element().getAttribute('id')).toBe(selector === '#btn-folder' ? 'folder-input' : selector === '#btn-camera' ? 'camera-input' : 'import-input');
    if (selector !== '#btn-folder') await control.setFiles([]);
  }
  expect(await snapshot(page)).toEqual(before);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#choose-import-files').click();
  await (await chooser).setFiles({
    name: 'notice-fictive.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Notice fictive. Nettoyer le filtre chaque mois.')
  });
  await expect(page.locator('#scan-progress-text')).toContainText('1/1 fichiers indexés');
  await page.evaluate(() => { location.hash = '#/vos-donnees'; });
  await expect(page.locator('.data-file-name')).toHaveText('notice-fictive.txt');
});

test('profil : routes directes, sauvegarde clavier, champs vides et preferences conservees', async ({ page }) => {
  await openView(page, 'profil');
  const { preferences: initialPreferences, role: initialRole } = await page.evaluate(async () => {
    const { getCurrentUser } = await import('/state.js');
    return getCurrentUser();
  });
  const name = '<Profil & Test> ' + 'Long'.repeat(30);
  await page.locator('#edit-name').fill(name);
  await page.locator('#edit-profile-address').fill('');
  await page.locator('#edit-profile-postal').fill('');
  await page.locator('#edit-profile-city').fill('');
  await page.locator('#consent-telemetry').check();
  await page.locator('#consent-sharing').check();
  await page.locator('#consent-photo-gps').check();
  await page.locator('#edit-name').press('Enter');
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  await expect(page.locator('#profile-name')).toHaveText(name);
  await expectUsable(page.locator('#view-profil'));
  await reloadView(page);
  await expect(page.locator('#edit-name')).toHaveValue(name);
  await expect(page.locator('#edit-profile-address')).toHaveValue('');
  await expect(page.locator('#consent-telemetry')).toBeChecked();
  await expect(page.locator('#consent-sharing')).toBeChecked();
  await expect(page.locator('#consent-photo-gps')).toBeChecked();
  await page.locator('#consent-photo-gps').uncheck();
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  const saved = await page.evaluate(async () => {
    const { getCurrentUser } = await import('/state.js');
    return getCurrentUser();
  });
  expect(saved.role).toBe(initialRole);
  expect(saved.preferences).toEqual(initialPreferences);
  expect(saved.privacy.photoLocationConsent).toBe(false);
  await page.locator('#edit-name').fill('   ');
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toContainText("nom d'affichage");
  await expect(page.locator('#edit-name')).toBeFocused();
  await page.evaluate(() => { location.hash = '#/maison'; });
  await page.locator('.property-edit-btn').click();
  await expect(page.locator('#edit-name')).toHaveValue(name);
  await expect(page.locator('#profile-role-readonly')).toHaveText('Administrateur');
  await page.getByRole('button', { name: 'Gérer mes données', exact: true }).click();
  await expect(page.locator('#view-vos-donnees')).toBeVisible();
});

test('Plus : chaque destination et retour restent accessibles sans changer les donnees', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openView(page, 'plus');
  const before = await snapshot(page);
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
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'users') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Stockage de test indisponible', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toContainText("n'ont pas pu être enregistrées");
  await expect(page.locator('#edit-name')).toHaveValue('Profil fictif');
  expect((await snapshot(page))[0]).toEqual(before[0]);
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-save-status')).toHaveText('Préférences enregistrées.');
  await reloadView(page);
  await expect(page.locator('#edit-name')).toHaveValue('Profil fictif');
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
