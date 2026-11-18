import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { stateModuleUrl } from './helpers/app-state.js';

async function reload(page) {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await ready;
}

async function open(page) {
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/maison');
  await ready;
  await page.evaluate(async url => {
    const { addEquipment } = await import(url);
    await addEquipment({ id: 'photo-pump', name: 'Pompe fictive', category: 'pompe', status: 'Saisi', docs: ['document-absent'], custom: 'conserver' });
    await addEquipment({ id: 'photo-printer', name: 'Imprimante fictive', category: 'imprimante', status: 'Saisi', docs: [] });
  }, await stateModuleUrl(page));
  await reload(page);
  await page.locator('[data-equipment="photo-pump"]').click();
  await expect(page.locator('#detail-title')).toHaveText('Pompe fictive');
}

async function photoFile(page, color = '#b33535') {
  const data = await page.evaluate(color => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 400;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return { name: 'equipement-fictif.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

async function choose(page, file) {
  await page.locator('#house-photo-input').setInputFiles(file || await photoFile(page));
  await expect(page.locator('#save-house-photo')).toBeEnabled();
}

async function save(page) {
  await page.locator('#save-house-photo').click();
  await expect(page.locator('#house-photo-dialog')).toBeHidden();
  await expect(page.locator('.equipment-cover .equipment-photo-origin')).toHaveText('Photo personnelle · cet appareil');
}

async function records(page) {
  return page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['equipment', 'users', 'documents', 'family', 'alerts'].map(name => getAll(name)));
  });
}

async function failNextWrite(page, method = 'put') {
  await page.evaluate(method => {
    const original = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function (...args) {
      if (this.name === 'equipment') {
        IDBObjectStore.prototype[method] = original;
        throw new DOMException('Échec synthétique de stockage', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  }, method);
}

for (const width of [390, 768, 1280, 1920]) {
  test(`photo équipement facultative, fiche et carte à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 660 : 900 });
    await open(page);
    const before = await records(page);
    const frame = page.locator('.equipment-cover-frame');
    const originalBox = await frame.boundingBox();
    const edit = page.locator('[data-edit-equipment-photo]');
    await expect(frame.locator('img')).toHaveAttribute('src', /pompe-photo/);
    await edit.click();
    await expect(page.locator('#house-photo-title')).toHaveText("Photo de l'équipement");
    await page.keyboard.press('Escape');
    await expect(edit).toBeFocused();
    expect(await records(page)).toEqual(before);
    await edit.click();
    await choose(page);
    await page.locator('#house-photo-x').focus();
    await page.keyboard.press('Home');
    await page.locator('#house-photo-y').focus();
    await page.keyboard.press('End');
    const previewBox = await page.locator('.house-photo-preview').boundingBox();
    expect(previewBox.width / previewBox.height).toBeCloseTo(originalBox.width / originalBox.height, 2);
    expect(await records(page)).toEqual(before);
    expect(await page.locator('#house-photo-dialog').evaluate(root => {
      const bounds = root.getBoundingClientRect();
      const controls = [...root.querySelectorAll('button, input')].map(element => element.getBoundingClientRect());
      return root.scrollWidth <= root.clientWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1
        && controls.every(rect => !rect.width || !rect.height || rect.width >= 47.5 && rect.height >= 47.5);
    })).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({ path: test.info().outputPath('equipment-photo-dialog.png') });
    }
    await save(page);
    await expect(page.locator('[data-edit-equipment-photo]')).toBeFocused();
    const after = await records(page);
    expect(after.slice(1)).toEqual(before.slice(1));
    const equipment = after[0].find(eq => eq.id === 'photo-pump');
    const { coverPhoto, ...rest } = equipment;
    expect(rest).toEqual(before[0].find(eq => eq.id === 'photo-pump'));
    expect(after[0].find(eq => eq.id === 'photo-printer')).toEqual(before[0].find(eq => eq.id === 'photo-printer'));
    expect(coverPhoto.positionX).toBe(0);
    expect(coverPhoto.positionY).toBe(100);
    await reload(page);
    await expect(frame.locator('img')).toHaveAttribute('src', coverPhoto.dataUrl);
    await expect(frame.locator('img')).toHaveCSS('object-position', '0% 100%');
    await frame.locator('img').evaluate(image => image.decode());
    expect(await frame.locator('img').evaluate(image => [image.naturalWidth, image.naturalHeight])).toEqual([120, 400]);
    expect((await frame.boundingBox()).height).toBeCloseTo(originalBox.height, 1);
    await page.evaluate(() => { location.hash = '/maison'; });
    const card = page.locator('[data-equipment="photo-pump"]');
    await expect(card.locator('img')).toHaveAttribute('src', coverPhoto.dataUrl);
    await expect(card.locator('.equipment-photo-origin')).toContainText('Photo personnelle');
    expect(await card.locator('.row-icon').evaluate(element => element.getBoundingClientRect().height)).toBe(160);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.click();
    await page.locator('#edit-equipment').click();
    await page.locator('#eq-name-input').fill('Pompe renommée');
    await page.locator('#equipment-form button[type=submit]').click();
    await expect(page.locator('#equipment-dialog')).toBeHidden();
    const renamed = (await records(page))[0].find(eq => eq.id === 'photo-pump');
    expect(renamed).toEqual({ ...equipment, name: 'Pompe renommée' });
  });
}

test('remplacement annulé, refus et quotas préservent la copie puis permettent de réessayer', async ({ page }) => {
  await open(page);
  await page.locator('[data-edit-equipment-photo]').click();
  await choose(page);
  await save(page);
  const original = (await records(page))[0].find(eq => eq.id === 'photo-pump').coverPhoto;
  const blue = await photoFile(page, '#3355bb');
  await page.locator('[data-edit-equipment-photo]').click();
  await choose(page, blue);
  await page.locator('#cancel-house-photo').click();
  await expect(page.locator('.equipment-cover img')).toHaveAttribute('src', original.dataUrl);
  await page.locator('[data-edit-equipment-photo]').click();
  await page.locator('#house-photo-input').setInputFiles({ name: 'test.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('#house-photo-dialog-status')).toContainText('JPEG, PNG ou WebP');
  await expect(page.locator('#save-house-photo')).toBeDisabled();
  await choose(page, blue);
  await failNextWrite(page);
  await page.locator('#save-house-photo').click();
  await expect(page.locator('#house-photo-dialog-status')).toContainText("n'a pas pu être enregistrée");
  await expect(page.locator('.equipment-cover img')).toHaveAttribute('src', original.dataUrl);
  expect((await records(page))[0].find(eq => eq.id === 'photo-pump').coverPhoto).toEqual(original);
  expect(await page.evaluate(async url => (await import(url)).getEquipmentDetail('photo-pump').coverPhoto, await stateModuleUrl(page))).toEqual(original);
  await save(page);
  await page.locator('[data-edit-equipment-photo]').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#remove-house-photo').click();
  await expect(page.locator('#house-photo-dialog')).toBeVisible();
  await failNextWrite(page);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#remove-house-photo').click();
  await expect(page.locator('#house-photo-dialog-status')).toContainText("n'a pas pu être enregistrée");
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#remove-house-photo').click();
  await expect(page.locator('#house-photo-dialog')).toBeHidden();
  await reload(page);
  await expect(page.locator('.equipment-cover img')).toHaveAttribute('src', /pompe-photo/);
  expect((await records(page))[0].find(eq => eq.id === 'photo-pump').coverPhoto).toBeUndefined();
});

for (const change of ['modification', 'suppression', 'purge']) {
  test(`un brouillon périmé après ${change} ne recrée ni équipement ni photo`, async ({ page }) => {
    await open(page);
    await page.locator('[data-edit-equipment-photo]').click();
    await choose(page);
    await page.evaluate(async ({ url, change }) => {
      const state = await import(url);
      if (change === 'purge') await state.resetState();
      else if (change === 'suppression') await state.deleteEquipment('photo-pump');
      else await state.updateEquipment({ ...state.getEquipmentDetail('photo-pump'), name: 'Modifié ailleurs' });
    }, { url: await stateModuleUrl(page), change });
    await page.locator('#save-house-photo').click();
    await expect(page.locator('#house-photo-dialog-status')).toContainText('a changé');
    const equipment = (await records(page))[0];
    expect(equipment.every(eq => !eq.coverPhoto)).toBe(true);
    expect(equipment.some(eq => eq.id === 'photo-pump')).toBe(change === 'modification');
  });
}

test('copie corrompue signalée, suppression volontaire puis retour au repère de catégorie', async ({ page }) => {
  await open(page);
  for (const [coverPhoto, message] of [
    [{ schemaVersion: 999 }, 'ne peut pas être affichée'],
    [{
      schemaVersion: 1, mimeType: 'image/jpeg', width: 2, height: 2, byteLength: 4,
      dataUrl: 'data:image/jpeg;base64,/9j/2Q==', positionX: 50, positionY: 50
    }, 'illisible']
  ]) {
    await page.evaluate(async coverPhoto => {
      const { getAll, put } = await import('/db.js');
      const printer = (await getAll('equipment')).find(eq => eq.id === 'photo-printer');
      await put('equipment', { ...printer, coverPhoto });
    }, coverPhoto);
    await reload(page);
    await page.evaluate(() => { location.hash = '/maison'; });
    const card = page.locator('[data-equipment="photo-printer"]');
    await expect(card.locator('.equipment-photo-error')).toContainText(message);
    await expect(card.locator('svg')).toBeVisible();
    await card.click();
    await expect(page.locator('.equipment-cover .equipment-photo-error')).toContainText(message);
  }
  expect((await records(page))[0].find(eq => eq.id === 'photo-printer').coverPhoto).toBeDefined();
  await page.locator('[data-edit-equipment-photo]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#remove-house-photo').click();
  await expect(page.locator('#house-photo-dialog')).toBeHidden();
  await expect(page.locator('.equipment-cover .equipment-photo-origin')).toHaveText('Repère de catégorie');
  await expect(page.locator('.equipment-cover svg')).toBeVisible();
});

test('export, suppression de fiche et purge emportent seulement les copies concernées', async ({ page }) => {
  await open(page);
  const requests = [];
  page.on('request', request => { if (request.url().startsWith('https://')) requests.push(request.url()); });
  await page.locator('[data-edit-equipment-photo]').click();
  await choose(page);
  await save(page);
  await page.evaluate(async url => {
    const state = await import(url);
    await state.updateEquipmentPhoto(state.getEquipmentDetail('photo-pump').coverPhoto,
      state.getEquipmentDetail('photo-printer'), state.getCurrentUser());
  }, await stateModuleUrl(page));
  await page.evaluate(() => { location.hash = '/vos-donnees'; });
  const download = page.waitForEvent('download');
  await page.locator('#export-all-data').click();
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(exported.homeEquipment.filter(eq => eq.coverPhoto)).toHaveLength(2);
  expect(exported.documents).toEqual([]);
  expect(requests).toEqual([]);
  await page.evaluate(() => { location.hash = '/detail?id=photo-pump'; });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#delete-equipment').click();
  await expect(page.locator('#view-maison')).toBeVisible();
  const remaining = (await records(page))[0];
  expect(remaining).toHaveLength(1);
  expect(remaining[0].id).toBe('photo-printer');
  expect(remaining[0].coverPhoto).toBeDefined();
  await page.evaluate(() => { location.hash = '/vos-donnees'; });
  await page.locator('#purge-all-data').click();
  await page.locator('#confirm-purge').click();
  await expect(page.locator('#purge-status')).toHaveAttribute('data-state', 'success');
  expect((await records(page))[0]).toEqual([]);
});

test("les mutations de fiche en échec ne publient aucun changement ni perte de couverture", async ({ page }) => {
  await open(page);
  await page.locator('[data-edit-equipment-photo]').click();
  await choose(page);
  await save(page);
  const before = await records(page);
  for (const [action, method] of [['ajout', 'put'], ['modification', 'put'], ['suppression', 'delete']]) {
    await failNextWrite(page, method);
    const result = await page.evaluate(async ({ url, action }) => {
      const state = await import(url);
      const equipment = state.getEquipmentDetail('photo-pump');
      try {
        if (action === 'ajout') await state.addEquipment({ id: 'fantome', category: 'pompe', name: 'Ne doit pas rester', docs: [] });
        else if (action === 'modification') await state.updateEquipment({ ...equipment, name: 'Ne doit pas rester' });
        else await state.deleteEquipment(equipment.id);
        return { failed: false };
      } catch (error) {
        return {
          failed: error.name === 'QuotaExceededError',
          sameEquipment: state.getEquipmentDetail('photo-pump') === equipment,
          equipment: state.getFullState().homeEquipment
        };
      }
    }, { url: await stateModuleUrl(page), action });
    expect(result.failed).toBe(true);
    expect(result.sameEquipment).toBe(true);
    expect(result.equipment.sort((a, b) => a.id.localeCompare(b.id))).toEqual(before[0]);
    expect(await records(page)).toEqual(before);
  }
});
