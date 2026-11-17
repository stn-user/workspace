import { test, expect } from '@playwright/test';

for (const consent of [false, true]) {
test(`photo Drive choisie : recherche et retrait GPS (consentement ${consent})`, async ({ page }) => {
  const requests = [];
  await page.addInitScript(() => {
    const tokenClient = {
      requestAccessToken() { this.callback({ access_token: 'fictif' }); }
    };
    class DocsView {
      setIncludeFolders() { return this; }
      setMimeTypes(types) { window.__pickerMimeTypes = types; return this; }
    }
    class PickerBuilder {
      setAppId() { return this; }
      setDeveloperKey() { return this; }
      setOAuthToken() { return this; }
      setOrigin() { return this; }
      setMaxItems() { return this; }
      enableFeature() { return this; }
      addView() { return this; }
      setCallback(callback) { this.callback = callback; return this; }
      build() {
        return { setVisible: () => this.callback({
          action: 'picked', docs: [{ id: 'photo-fictive', name: 'souvenir-test.jpg' }]
        }) };
      }
    }
    window.google = {
      accounts: { oauth2: {
        initTokenClient: () => tokenClient,
        hasGrantedAllScopes: () => true
      } },
      picker: {
        DocsView, PickerBuilder, ViewId: { DOCS: 'docs' },
        Feature: { MULTISELECT_ENABLED: 'multi' },
        Action: { PICKED: 'picked', CANCEL: 'cancel', ERROR: 'error' }
      }
    };
    window.gapi = { load: (_name, options) => options.callback() };
  });
  await page.route('https://**/*', route => route.abort());
  await page.route('https://www.googleapis.com/drive/v3/files/**', route => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    return route.fulfill({ json: {
      id: 'photo-fictive', name: 'souvenir-test.jpg', mimeType: 'image/jpeg',
      modifiedTime: '2026-10-09T12:00:00Z',
      imageMediaMetadata: {
        time: '2024:05:06 12:30:45', width: 1200, height: 800, cameraMake: 'Fictif',
        location: { latitude: 48.8566, longitude: 2.3522 }
      }
    } });
  });
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5201/#/importer');
  await ready;
  if (consent) await page.evaluate(async () => (await import('/state.js')).updatePhotoLocationConsent(true));
  await page.getByRole('button', { name: 'Options Google Drive', exact: true }).click();
  await expect(page.locator('#source-choice-permissions')).toContainText("sans télécharger l'image");
  await page.locator('#connect-google-drive').click();
  const readPhoto = () => page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return (await getAll('documents')).find(document => document.id === 'drive-photo-fictive');
  });
  await expect.poll(readPhoto).toBeTruthy();
  expect(await page.evaluate(() => window.__pickerMimeTypes)).toContain('image/jpeg');
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get('fields').includes('location')).toBe(consent);
  expect(new URL(requests[0]).searchParams.has('alt')).toBe(false);

  let photo = await readPhoto();
  expect(photo.photoMetadata.captureDate.offsetMinutes).toBeNull();
  expect(photo.indexRecord.dates.priseDeVue.value).toBe('2024-05-06');
  expect(photo.indexRecord.coverage).toBe('metadata');
  expect(photo.photoFacts.facts.find(fact => fact.kind === 'captureDate').provenance.providerId).toBe('drive');
  expect(photo.photoMetadata.location.status).toBe(consent ? 'available' : 'not_requested');
  const restored = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await restored;
  photo = await readPhoto();
  expect(photo.indexRecord.dates.priseDeVue.value).toBe('2024-05-06');
  await page.locator('#experimental-index-query').fill('photos du 06/05/2024');
  await page.locator('#experimental-index-form .submit-button').click();
  await expect(page.getByRole('region', { name: 'Photos correspondantes' })).toContainText('souvenir-test.jpg');
  if (consent) {
    expect(photo.photoFacts.facts.find(fact => fact.kind === 'location').provenance.providerId).toBe('drive');
    await page.locator('#experimental-index-query').fill('Photos prises à 48.8566, 2.3522');
    await page.locator('#experimental-index-form .submit-button').click();
    await expect(page.locator('#moments-life-search-results')).toContainText('souvenir-test.jpg');
    await page.evaluate(() => { location.hash = '#/profil'; });
    await page.locator('#consent-photo-gps').uncheck();
    await page.locator('#save-profile').click();
    await expect(page.locator('#profile-save-status')).toContainText('Préférences enregistrées');
    photo = await readPhoto();
    expect(JSON.stringify(photo)).not.toContain('48.8566');
    expect(photo.photoFacts.facts.some(fact => fact.kind === 'location')).toBe(false);
    expect(photo.indexRecord.fields.some(field => field.name === 'coordinates')).toBe(false);
    await page.evaluate(() => { location.hash = '#/recherche'; });
    await page.locator('#experimental-index-query').fill('Photos prises à 48.8566, 2.3522');
    await page.locator('#experimental-index-form .submit-button').click();
    await expect(page.locator('#moments-life-search-status')).toContainText('avec le consentement actif');
    await expect(page.locator('#moments-life-search-results')).not.toContainText('souvenir-test.jpg');
  }
  expect(requests).toHaveLength(1);
});
}

test('ajout photo concurrent au retrait GPS et erreur : état, stockage et file restent cohérents', async ({ page }) => {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5201/#/recherche');
  await ready;
  const result = await page.evaluate(async () => {
    const { addDocument, deleteDocument, getDocuments, updatePhotoLocationConsent } = await import('/state.js');
    const { createPhotoMetadata } = await import('/photo-metadata.js');
    const { getAll } = await import('/db.js');
    const makePhoto = id => ({
      id, type: 'Image', name: `${id}.jpg`, isLocal: true,
      photoMetadata: createPhotoMetadata(id, { location: {
        status: 'available', latitude: 48.8566, longitude: 2.3522,
        source: { kind: 'exif', field: 'GPS' }
      } })
    });

    await updatePhotoLocationConsent(true);
    await Promise.all([addDocument(makePhoto('concurrent-first')), updatePhotoLocationConsent(false)]);
    await updatePhotoLocationConsent(true);
    await Promise.all([updatePhotoLocationConsent(false), addDocument(makePhoto('concurrent-last'))]);
    await updatePhotoLocationConsent(true);
    await addDocument(makePhoto('deleted-concurrently'));
    await Promise.all([updatePhotoLocationConsent(false), deleteDocument('deleted-concurrently')]);
    let failed = false;
    try { await addDocument({ id: 'invalid', type: 'Image', photoMetadata: { schemaVersion: 999 } }); }
    catch { failed = true; }
    await addDocument(makePhoto('after-error'));
    const inMemory = getDocuments().filter(doc => ['concurrent-first', 'concurrent-last', 'after-error'].includes(doc.id));
    const persisted = (await getAll('documents')).filter(doc => ['concurrent-first', 'concurrent-last', 'after-error'].includes(doc.id));
    return { failed, inMemory, persisted,
      deletedInMemory: getDocuments().some(doc => doc.id === 'deleted-concurrently'),
      deletedInStorage: (await getAll('documents')).some(doc => doc.id === 'deleted-concurrently') };
  });
  expect(result.failed).toBe(true);
  expect(result.deletedInMemory).toBe(false);
  expect(result.deletedInStorage).toBe(false);
  expect(result.inMemory).toHaveLength(3);
  expect(result.persisted).toHaveLength(3);
  for (const photo of [...result.inMemory, ...result.persisted]) {
    expect(JSON.stringify(photo)).not.toContain('48.8566');
    expect(photo.photoFacts.facts.some(fact => fact.kind === 'location')).toBe(false);
    expect(photo.indexRecord.fields.some(field => field.name === 'coordinates')).toBe(false);
  }
});

for (const consent of [false, true]) {
  test(`photo OneDrive : recherche et retrait GPS (consentement ${consent})`, async ({ page }) => {
    const calls = [];
    await page.route('**/onedrive-auth.js*', route => route.fulfill({
      contentType: 'application/javascript',
      body: `export class OneDriveAuth {
        connected = false; accountId = "compte-fictif";
        async initialize() {} async connect() { this.connected = true; }
        async getToken() { return "jeton-fictif"; }
        async disconnect() { this.connected = false; }
      }`
    }));
    await page.route('https://graph.microsoft.com/**', route => {
      const url = new URL(route.request().url());
      calls.push(url.href);
      if (url.pathname === '/v1.0/me/drive/root/children') {
        return route.fulfill({ json: { value: [{
          id: 'photo-onedrive', name: 'souvenir-onedrive.jpg', size: 500,
          file: { mimeType: 'image/jpeg' }, photo: { takenDateTime: '2024-05-06T12:30:45Z' }
        }] } });
      }
      expect(url.searchParams.get('$select')).toBe('id,location');
      return route.fulfill({ json: {
        id: 'photo-onedrive', location: { latitude: 48.8566, longitude: 2.3522 }
      } });
    });
    const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://127.0.0.1:5201/#/importer');
    await ready;
    if (consent) await page.evaluate(async () => (await import('/state.js')).updatePhotoLocationConsent(true));
    await page.getByRole('button', { name: 'Options OneDrive', exact: true }).click();
    await page.locator('#connect-onedrive').click();
    await page.locator('#start-onedrive').click();
    await expect(page.locator('#onedrive-status')).toContainText('Parcours terminé.');
    expect(calls.filter(url => new URL(url).searchParams.get('$select') === 'id,location')).toHaveLength(consent ? 1 : 0);
    const readPhoto = () => page.evaluate(async () =>
      (await (await import('/db.js')).getAll('documents')).find(doc => doc.name === 'souvenir-onedrive.jpg'));
    let photo = await readPhoto();
    expect(photo.photoMetadata.location.status).toBe(consent ? 'available' : 'not_requested');
    const restored = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.reload();
    await restored;
    photo = await readPhoto();
    if (consent) {
      expect(photo.photoFacts.facts.find(fact => fact.kind === 'location').provenance.providerId).toBe('onedrive');
      await page.evaluate(() => { location.hash = '#/recherche'; });
      await page.locator('#experimental-index-query').fill('Photos prises à 48.8566, 2.3522');
      await page.locator('#experimental-index-form .submit-button').click();
      await expect(page.locator('#moments-life-search-results')).toContainText('souvenir-onedrive.jpg');
      await page.evaluate(() => { location.hash = '#/profil'; });
      await page.locator('#consent-photo-gps').uncheck();
      await page.locator('#save-profile').click();
      await expect(page.locator('#profile-save-status')).toContainText('Préférences enregistrées');
      photo = await readPhoto();
      expect(JSON.stringify(photo)).not.toContain('48.8566');
      expect(photo.photoFacts.facts.some(fact => fact.kind === 'location')).toBe(false);
      expect(photo.indexRecord.fields.some(field => field.name === 'coordinates')).toBe(false);
      await page.evaluate(() => { location.hash = '#/recherche'; });
      await page.locator('#experimental-index-query').fill('Photos prises à 48.8566, 2.3522');
      await page.locator('#experimental-index-form .submit-button').click();
      await expect(page.locator('#moments-life-search-status')).toContainText('avec le consentement actif');
      await expect(page.locator('#moments-life-search-results')).not.toContainText('souvenir-onedrive.jpg');
    }
    expect(calls).toHaveLength(consent ? 2 : 1);
  });
}
