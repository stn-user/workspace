import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import exifr from 'exifr';
import { stateModuleUrl } from './helpers/app-state.js';
import { createJpegExifFixture } from './photo-exif-fixtures.js';

async function open(page) {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/maison');
  await ready;
}

async function reload(page) {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await ready;
}

async function file(page, color = '#b33535', noise = false) {
  const base64 = await page.evaluate(({ color, noise }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const context = canvas.getContext('2d');
    if (noise) {
      const pixels = context.createImageData(canvas.width, canvas.height);
      let seed = 41;
      for (let i = 0; i < pixels.data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          pixels.data[i + channel] = seed >>> 24;
        }
        pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
    } else {
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { color, noise });
  return { name: 'maison-fictive.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function select(page, image) {
  await page.locator('#house-photo-input').setInputFiles(image);
  await expect(page.locator('#save-house-photo')).toBeEnabled();
  await expect(page.locator('#house-photo-preview')).toBeVisible();
}

async function save(page) {
  await page.locator('#save-house-photo').click();
  await expect(page.locator('#house-photo-dialog')).toBeHidden();
  await expect(page.locator('#house-photo-origin')).toHaveText('Photo personnelle · cet appareil');
}

async function stored(page) {
  return page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(store => getAll(store)));
  });
}

async function failNextWrite(page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'users') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Échec synthétique de sauvegarde', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
}

for (const width of [390, 768, 1280, 1920]) {
  test(`photo Maison facultative, cadrage et persistance à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 660 : 900 });
    await open(page);
    const image = page.locator('#house-photo');
    await expect(image).toHaveAttribute('src', /maison-photo\.jpg/);
    const before = await stored(page);
    const frameBefore = await page.locator('.property-illustration').boundingBox();
    await page.locator('#edit-house-photo').click();
    await expect(page.locator('#cancel-house-photo')).toBeFocused();
    await expect(page.locator('#remove-house-photo')).toBeHidden();
    await page.keyboard.press('Escape');
    expect(await stored(page)).toEqual(before);
    await expect(page.locator('#edit-house-photo')).toBeFocused();

    await page.locator('#edit-house-photo').click();
    await select(page, await file(page, '#b33535', width === 1280));
    await page.locator('#house-photo-x').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.locator('#house-photo-y').focus();
    await page.keyboard.press('End');
    expect(await stored(page)).toEqual(before);
    await expect(image).toHaveAttribute('src', /maison-photo\.jpg/);
    const modal = page.locator('#house-photo-dialog');
    const previewBox = await page.locator('.house-photo-preview').boundingBox();
    expect(previewBox.width / previewBox.height).toBeCloseTo(frameBefore.width / frameBefore.height, 2);
    const small = await modal.evaluate(root =>
      [...root.querySelectorAll('button, input')].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height && (rect.width < 47.5 || rect.height < 47.5);
      }).map(element => element.id));
    expect(small).toEqual([]);
    if (width === 390 || width === 1280) {
      await page.screenshot({ path: test.info().outputPath('house-photo-dialog.png') });
    }
    expect(await modal.evaluate(root => {
      const bounds = root.getBoundingClientRect();
      return {
        overflow: root.scrollWidth > root.clientWidth + 1,
        outside: bounds.top < 0 || bounds.bottom > innerHeight + 1
          || bounds.left < 0 || bounds.right > innerWidth + 1
      };
    })).toEqual({ overflow: false, outside: false });
    await save(page);
    const after = await stored(page);
    expect(after.slice(1)).toEqual(before.slice(1));
    const { housePhoto, ...user } = after[0][0];
    expect(user).toEqual(before[0][0]);
    expect(housePhoto.width).toBeLessThanOrEqual(1280);
    expect(housePhoto.height).toBeLessThanOrEqual(1280);
    expect(housePhoto.byteLength).toBeLessThanOrEqual(256 * 1024);
    expect(Buffer.from(housePhoto.dataUrl.split(',')[1], 'base64').length).toBe(housePhoto.byteLength);
    expect(housePhoto.positionX).toBe(1);
    expect(housePhoto.positionY).toBe(100);
    await image.evaluate(image => image.decode());
    expect(await image.evaluate(image => [image.naturalWidth, image.naturalHeight])).toEqual([housePhoto.width, housePhoto.height]);
    await reload(page);
    await expect(image).toHaveAttribute('src', housePhoto.dataUrl);
    await expect(image).toHaveCSS('object-position', '1% 100%');
    const frameAfter = await page.locator('.property-illustration').boundingBox();
    expect(frameAfter.height).toBeCloseTo(frameBefore.height, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (width === 390) {
      await page.evaluate(() => { location.hash = '/profil'; });
      await page.locator('#edit-name').fill('Profil fictif');
      await page.locator('#save-profile').click();
      await expect(page.locator('#profile-save-status')).toContainText('enregistrées');
      expect((await stored(page))[0][0].housePhoto).toEqual(housePhoto);
      await page.evaluate(() => { location.hash = '/vos-donnees'; });
      const download = page.waitForEvent('download');
      await page.locator('#export-all-data').click();
      const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
      expect(exported.currentUser.housePhoto).toEqual(housePhoto);
      expect(exported.documents).toEqual([]);
      await page.locator('#purge-all-data').click();
      await page.locator('#confirm-purge').click();
      await expect(page.locator('#purge-status')).toHaveAttribute('data-state', 'success');
      await reload(page);
      await page.evaluate(() => { location.hash = '/maison'; });
      await expect(image).toHaveAttribute('src', /maison-photo\.jpg/);
      expect((await stored(page))[0][0]?.housePhoto).toBeUndefined();
    }
  });
}

test('remplacement, refus et échecs de stockage ne changent pas la photo enregistrée', async ({ page }) => {
  await open(page);
  const red = await file(page);
  const blue = await file(page, '#3355bb');
  await page.locator('#edit-house-photo').click();
  await select(page, red);
  await save(page);
  const original = (await stored(page))[0][0].housePhoto;
  await page.locator('#edit-house-photo').click();
  await select(page, blue);
  await page.locator('#cancel-house-photo').click();
  expect((await stored(page))[0][0].housePhoto).toEqual(original);
  await page.locator('#edit-house-photo').click();
  for (const [invalid, message] of [
    [{ name: 'test.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }, /JPEG, PNG ou WebP/],
    [{ name: 'grand.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }, /10 Mio/],
    [{ name: 'illisible.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('pas une photo') }, /photo est illisible/]
  ]) {
    await page.locator('#house-photo-input').setInputFiles(invalid);
    await expect(page.locator('#choose-house-photo')).toBeEnabled();
    await expect(page.locator('#save-house-photo')).toBeDisabled();
    await expect(page.locator('#house-photo-dialog-status')).toContainText(message);
    expect((await stored(page))[0][0].housePhoto).toEqual(original);
  }
  await select(page, blue);
  await failNextWrite(page);
  await page.locator('#save-house-photo').click();
  await expect(page.locator('#house-photo-dialog-status')).toContainText("n'a pas pu être enregistrée");
  await expect(page.locator('#house-photo')).toHaveAttribute('src', original.dataUrl);
  expect((await stored(page))[0][0].housePhoto).toEqual(original);
  expect(await page.evaluate(async url => (await import(url)).getCurrentUser().housePhoto, await stateModuleUrl(page))).toEqual(original);
  await save(page);
  const replacement = (await stored(page))[0][0].housePhoto;
  expect(replacement.dataUrl).not.toBe(original.dataUrl);
  await page.locator('#edit-house-photo').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#remove-house-photo').click();
  expect((await stored(page))[0][0].housePhoto).toEqual(replacement);
  await failNextWrite(page);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#remove-house-photo').click();
  await expect(page.locator('#house-photo-dialog-status')).toContainText("n'a pas pu être enregistrée");
  await expect(page.locator('#house-photo')).toHaveAttribute('src', replacement.dataUrl);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#remove-house-photo').click();
  await expect(page.locator('#house-photo-dialog')).toBeHidden();
  await expect(page.locator('#house-photo')).toHaveAttribute('src', /maison-photo\.jpg/);
  await expect(page.locator('#house-photo-origin')).toContainText("illustration · IA");
  await reload(page);
  expect((await stored(page))[0][0].housePhoto).toBeUndefined();
});

test('annuler pendant le décodage ignore le résultat tardif, sans écriture', async ({ page }) => {
  await open(page);
  const image = await file(page);
  const before = await stored(page);
  await page.evaluate(() => {
    const original = window.createImageBitmap;
    window.createImageBitmap = (...args) => new Promise((resolve, reject) => {
      window.releaseHouseDecode = () => original(...args).then(resolve, reject);
    });
  });
  await page.locator('#edit-house-photo').click();
  await page.locator('#house-photo-input').setInputFiles(image);
  await expect(page.locator('#house-photo-dialog-status')).toContainText('Préparation locale');
  await expect.poll(() => page.evaluate(() => typeof window.releaseHouseDecode)).toBe('function');
  await page.locator('#cancel-house-photo').click();
  await page.locator('#edit-house-photo').click();
  await page.evaluate(() => window.releaseHouseDecode());
  await expect(page.locator('#save-house-photo')).toBeDisabled();
  await expect(page.locator('#house-photo-dialog-status')).toBeEmpty();
  expect(await stored(page)).toEqual(before);
});

test('un brouillon antérieur à une purge ne peut pas recréer la photo', async ({ page }) => {
  await open(page);
  await page.locator('#edit-house-photo').click();
  await select(page, await file(page));
  await page.evaluate(async url => (await import(url)).resetState(), await stateModuleUrl(page));
  await page.locator('#save-house-photo').click();
  await expect(page.locator('#house-photo-dialog-status')).toContainText('Votre espace a changé');
  expect((await stored(page))[0]).toEqual([]);
});

test('orientation respectée, EXIF retirés et aucune analyse ni connexion déclenchée', async ({ page }) => {
  await open(page);
  const frameBefore = await page.locator('.property-illustration').boundingBox();
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 100;
    canvas.getContext('2d').fillRect(0, 0, 300, 100);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  const tagged = createJpegExifFixture(Buffer.from(base64, 'base64'), {
    dateTimeOriginal: '2001:01:01 12:00:00', latitude: 0.75, longitude: 0.25
  });
  expect(await exifr.parse(tagged)).toMatchObject({ latitude: 0.75, longitude: 0.25 });
  const requests = [];
  page.on('request', request => { if (request.url().startsWith('https://')) requests.push(request.url()); });
  const before = await stored(page);
  await page.locator('#edit-house-photo').click();
  await select(page, { name: 'original-fictif-avec-exif.jpg', mimeType: 'image/jpeg', buffer: tagged });
  await save(page);
  const after = await stored(page);
  const photo = after[0][0].housePhoto;
  expect([photo.width, photo.height]).toEqual([100, 300]);
  const metadata = await exifr.parse(Buffer.from(photo.dataUrl.split(',')[1], 'base64'));
  expect(metadata?.latitude).toBeUndefined();
  expect(metadata?.longitude).toBeUndefined();
  expect(metadata?.DateTimeOriginal).toBeUndefined();
  expect(metadata?.Orientation).toBeUndefined();
  expect(Object.keys(photo).sort()).toEqual(['schemaVersion', 'mimeType', 'width', 'height', 'byteLength', 'dataUrl', 'positionX', 'positionY'].sort());
  expect(after.slice(1)).toEqual(before.slice(1));
  expect(requests).toEqual([]);
  await reload(page);
  await page.locator('#house-photo').evaluate(image => image.decode());
  const frameAfter = await page.locator('.property-illustration').boundingBox();
  expect(frameAfter.height).toBeCloseTo(frameBefore.height, 1);
});

test('une copie enregistrée invalide ou indécodable est signalée et peut être retirée', async ({ page }) => {
  await open(page);
  for (const [housePhoto, message] of [
    [{ schemaVersion: 999 }, /ne peut pas être affichée/],
    [{
      schemaVersion: 1, mimeType: 'image/jpeg', width: 2, height: 2, byteLength: 4,
      dataUrl: 'data:image/jpeg;base64,/9j/2Q==', positionX: 50, positionY: 50
    }, /illisible/]
  ]) {
    await page.evaluate(async ({ url, housePhoto }) => {
      const { getCurrentUser } = await import(url);
      const { put } = await import('/db.js');
      await put('users', { ...getCurrentUser(), housePhoto });
    }, { url: await stateModuleUrl(page), housePhoto });
    await reload(page);
    await expect(page.locator('#house-photo-status')).toContainText(message);
    await expect(page.locator('#house-photo-origin')).toContainText("illustration · IA");
    await expect(page.locator('#house-photo')).toHaveAttribute('src', /maison-photo\.jpg/);
  }
  await page.locator('#edit-house-photo').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#remove-house-photo').click();
  await expect(page.locator('#house-photo-dialog')).toBeHidden();
  expect((await stored(page))[0][0].housePhoto).toBeUndefined();
});
