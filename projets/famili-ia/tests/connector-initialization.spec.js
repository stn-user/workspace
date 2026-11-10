import { test, expect } from '@playwright/test';

for (const scenario of [
  { name: 'sans configuration Google', port: 5188 },
  { name: 'avec bibliothèques Google indisponibles', port: 5189 }
]) {
  test(`OneDrive et la purge fonctionnent ${scenario.name}`, async ({ page }) => {
    await page.route('https://accounts.google.com/**', route => route.abort());
    await page.route('https://apis.google.com/**', route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${scenario.port}/#/recherche`);
    await expect(page.locator('#onedrive-status')).toContainText('OneDrive prêt à être connecté');
    await expect(page.locator('#connect-onedrive')).toBeEnabled();
    await page.locator('#local-files-input').setInputFiles({
      name: 'fictif.txt', mimeType: 'text/plain', buffer: Buffer.from('contenu fictif')
    });
    await page.evaluate(() => { location.hash = '#/vos-donnees'; });
    await page.locator('#purge-all-data').click();
    await page.locator('#confirm-purge').click();
    await expect(page.locator('#purge-status')).toContainText('supprimées');
    expect(errors).toEqual([]);
  });
}

test('explique pourquoi OneDrive reste indisponible sans identifiant configuré', async ({ page }) => {
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5190/#/recherche');
  await initialized;
  await page.getByRole('button', { name: 'Ajouter un document' }).click();
  await expect(page.locator('#source-choice-dialog')).toBeVisible();
  await expect(page.locator('#connect-onedrive')).toBeDisabled();
  await expect(page.locator('#onedrive-status')).toContainText('VITE_MICROSOFT_CLIENT_ID');
  await expect(page.locator('#onedrive-status')).toContainText('.env.local');
});

test('fait examiner et confirmer les changements OneDrive avant de remplacer une copie', async ({ page }) => {
  await page.route('**/onedrive-auth.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export class OneDriveAuth {
      connected = false;
      accountId = "compte-fictif";
      async initialize() {}
      async connect() { this.connected = true; }
      async getToken() { return "jeton-fictif"; }
      async disconnect() { this.connected = false; }
    }`
  }));
  let version = '"v1"';
  let content = 'texte initial';
  let itemAvailable = true;
  let failMetadata = false;
  let releaseFirstScan;
  const firstScanGate = new Promise(resolve => { releaseFirstScan = resolve; });
  let graphRequests = 0;
  await page.route('https://graph.microsoft.com/**', async route => {
    graphRequests++;
    const url = new URL(route.request().url());
    if (url.pathname === '/v1.0/me/drive/root/children') {
      if (graphRequests === 1) await firstScanGate;
      await route.fulfill({ json: { value: itemAvailable
        ? [{ id: 'element-fictif', name: 'document.txt', size: 20, file: {}, eTag: version }]
        : [] } });
      return;
    }
    if (failMetadata) {
      await route.fulfill({ status: 429, body: '' });
      return;
    }
    await route.fulfill({
      json: { id: 'element-fictif', '@microsoft.graph.downloadUrl': 'https://files.1drv.com/synthetic' }
    });
  });
  await page.route('https://files.1drv.com/**', route => route.fulfill({ body: content }));
  await page.goto('http://127.0.0.1:5188/#/recherche');
  await expect(page.locator('#connect-onedrive')).toBeEnabled();
  await page.locator('[data-open-source-dialog]').click();
  await expect(page.locator('#source-choice-dialog')).toBeVisible();
  await expect(page.locator('#start-onedrive')).toBeDisabled();
  await expect(page.locator('#stop-onedrive')).toBeHidden();
  await page.locator('#connect-onedrive').click();
  await expect(page.locator('#start-onedrive')).toBeEnabled();
  expect(graphRequests).toBe(0);
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#stop-onedrive')).toBeVisible();
  await expect(page.locator('#start-onedrive')).toBeDisabled();
  releaseFirstScan();
  await expect(page.locator('#onedrive-status')).toContainText('Parcours terminé.');
  await expect(page.locator('#stop-onedrive')).toBeHidden();
  await expect(page.locator('#onedrive-status')).toContainText('1 copie(s) ajoutée(s)');
  await expect(page.locator('#start-onedrive')).toBeEnabled();
  version = '"v2"';
  content = 'texte actualisé';
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-review-panel')).toBeVisible();
  await expect(page.locator('#onedrive-review-list')).toContainText('version fournisseur différente');
  await expect(page.locator('#onedrive-review-list input')).not.toBeChecked();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const reviewLayout = await page.locator('#onedrive-review-list label').evaluate(label => ({
      height: label.getBoundingClientRect().height,
      right: label.getBoundingClientRect().right,
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(reviewLayout.height).toBeGreaterThanOrEqual(44);
    expect(reviewLayout.right).toBeLessThanOrEqual(reviewLayout.viewportWidth);
  }
  const documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  const copy = documents.find(document => document.name === 'document.txt');
  expect(copy.content).toBe('texte initial');
  expect(copy.oneDriveETag).toBe('"v1"');
  expect(documents.filter(document => document.name === 'document.txt')).toHaveLength(1);
  await page.locator('#onedrive-review-list input').check();
  await page.locator('#apply-onedrive-updates').click();
  await expect(page.locator('#onedrive-status')).toContainText('1 copie(s) remplacée(s)');
  const updated = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  const refreshedCopy = updated.find(document => document.name === 'document.txt');
  expect(refreshedCopy.content).toBe('texte actualisé');
  expect(refreshedCopy.oneDriveETag).toBe('"v2"');
  expect(updated.filter(document => document.name === 'document.txt')).toHaveLength(1);

  version = '"v3"';
  content = 'version suivante';
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-review-panel')).toBeVisible();
  await page.locator('#onedrive-review-list input').check();
  failMetadata = true;
  await page.locator('#apply-onedrive-updates').click();
  await expect(page.locator('#onedrive-status')).toContainText('1 échec(s)');
  const afterFailedUpdate = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  const unchangedCopy = afterFailedUpdate.find(document => document.name === 'document.txt');
  expect(unchangedCopy.content).toBe('texte actualisé');
  expect(unchangedCopy.oneDriveETag).toBe('"v2"');
  failMetadata = false;
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    const originalPut = prototype.put;
    prototype.put = function (...args) {
      if (this.name === 'documents') {
        prototype.put = originalPut;
        throw new DOMException('échec de stockage synthétique', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
  });
  await page.locator('#onedrive-review-list input').check();
  await page.locator('#apply-onedrive-updates').click();
  await expect(page.locator('#onedrive-status')).toContainText('1 échec(s)');
  const afterStorageFailure = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  const copyAfterStorageFailure = afterStorageFailure.find(document => document.name === 'document.txt');
  expect(copyAfterStorageFailure.content).toBe('texte actualisé');
  expect(copyAfterStorageFailure.oneDriveETag).toBe('"v2"');
  await page.locator('#onedrive-review-list input').check();
  await page.locator('#apply-onedrive-updates').click();
  await expect(page.locator('#onedrive-status')).toContainText('1 copie(s) remplacée(s)');

  itemAvailable = false;
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-status')).toContainText('Les éléments absents ne sont pas déclarés supprimés.');
  const afterOmission = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  const finalCopy = afterOmission.find(document => document.name === 'document.txt');
  expect(finalCopy.content).toBe('version suivante');
  expect(finalCopy.oneDriveETag).toBe('"v3"');
});

test('préserve et recherche les copies OneDrive après le changement de compte', async ({ page }) => {
  await page.route('https://accounts.google.com/**', route => route.abort());
  await page.route('https://apis.google.com/**', route => route.abort());
  await page.route('**/onedrive-auth.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `let account = "compte-fictif-a";
    export class OneDriveAuth {
      connected = false;
      get accountId() { return account; }
      async initialize() {}
      async connect() { this.connected = true; }
      async getToken() { return "jeton-fictif"; }
      async disconnect() { this.connected = false; account = "compte-fictif-b"; }
    }`
  }));
  await page.route('https://graph.microsoft.com/**', route => route.fulfill({
    json: { value: [{ id: 'meme-element', name: 'photo-fictive.jpg', file: {}, eTag: '"v1"' }] }
  }));
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5188/#/recherche');
  await initialized;

  const connectAndIndex = async () => {
    await page.getByRole('button', { name: 'Ajouter un document' }).click();
    await page.locator('#connect-onedrive').click();
    await expect(page.locator('#onedrive-status')).toContainText('Compte connecté');
    await expect(page.locator('#start-onedrive')).toBeEnabled();
    await page.locator('#start-onedrive').click();
    await expect(page.locator('#onedrive-status')).toContainText('Parcours terminé.');
  };
  await connectAndIndex();
  await page.locator('#close-source-choice').click();
  const firstFingerprint = await page.evaluate(async () => {
    const { getOneDriveAccountFingerprint } = await import('/onedrive-account.js');
    return getOneDriveAccountFingerprint('compte-fictif-a');
  });

  await page.evaluate(() => { location.hash = '#/vos-donnees'; });
  await page.locator('#disconnect-onedrive').click();
  await expect(page.locator('#disconnect-onedrive')).toBeHidden();
  await page.evaluate(() => { location.hash = '#/recherche'; });
  await connectAndIndex();
  const secondFingerprint = await page.evaluate(async () => {
    const { getOneDriveAccountFingerprint } = await import('/onedrive-account.js');
    return getOneDriveAccountFingerprint('compte-fictif-b');
  });
  expect(secondFingerprint).not.toBe(firstFingerprint);
  await expect(page.locator('#experimental-source-status')).toContainText(
    `Compte actuellement connecté (empreinte locale) : …${secondFingerprint.slice(0, 16)}`
  );

  await page.locator('#close-source-choice').click();
  await page.locator('#experimental-index-query').fill('photo-fictive');
  await page.locator('#experimental-index-form button[type="submit"]').click();
  const results = page.locator('#experimental-index-results');
  await expect(results.locator('li')).toHaveCount(2);
  await expect(results).toContainText(`Compte OneDrive d'origine (empreinte locale) : …${firstFingerprint.slice(0, 16)}`);
  await expect(results).toContainText(`Compte OneDrive d'origine (empreinte locale) : …${secondFingerprint.slice(0, 16)}`);

  const documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  const copies = documents.filter(document => document.name === 'photo-fictive.jpg');
  expect(copies).toHaveLength(2);
  expect(copies.map(document => document.oneDriveAccountFingerprint).sort())
    .toEqual([firstFingerprint, secondFingerprint].sort());
  expect(JSON.stringify(copies)).not.toContain('compte-fictif-');
});

test('conserve les copies partielles après une erreur et permet de relancer le parcours', async ({ page }) => {
  await page.route('**/onedrive-auth.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export class OneDriveAuth {
      connected = false;
      accountId = "compte-fictif";
      async initialize() {}
      async connect() { this.connected = true; }
      async getToken() { return "jeton-fictif"; }
      async disconnect() { this.connected = false; }
    }`
  }));
  let scan = 0;
  let accessDenied = false;
  await page.route('https://graph.microsoft.com/**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('$skiptoken') === 'second') {
      await route.fulfill({ status: 429, body: '' });
      return;
    }
    if (url.pathname.endsWith('/root/children')) {
      if (accessDenied) {
        await route.fulfill({ status: 403, body: '' });
        return;
      }
      scan += 1;
      await route.fulfill({ json: {
        value: [{ id: 'fichier-partiel', name: 'partiel.txt', size: 20, file: {}, eTag: '"v1"' }],
        ...(scan === 1 ? {
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=second'
        } : {})
      } });
      return;
    }
    await route.fulfill({
      json: { id: 'fichier-partiel', '@microsoft.graph.downloadUrl': 'https://files.1drv.com/synthetic' }
    });
  });
  await page.route('https://files.1drv.com/**', route => route.fulfill({ body: 'contenu fictif conservé' }));
  await page.goto('http://127.0.0.1:5188/#/recherche');
  await expect(page.locator('#connect-onedrive')).toBeEnabled();
  await page.locator('[data-open-source-dialog]').click();
  await page.locator('#connect-onedrive').click();
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-status')).toContainText('HTTP 429');
  await expect(page.locator('#onedrive-status')).toContainText('Les copies déjà enregistrées sont conservées.');
  await expect(page.locator('#start-onedrive')).toBeEnabled();
  let documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  expect(documents.find(document => document.name === 'partiel.txt').content).toBe('contenu fictif conservé');

  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-status')).toContainText('Parcours terminé.');
  expect(scan).toBe(2);
  documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  expect(documents.filter(document => document.name === 'partiel.txt')).toHaveLength(1);
  accessDenied = true;
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-status')).toContainText('HTTP 403');
  documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  expect(documents.find(document => document.name === 'partiel.txt').content).toBe('contenu fictif conservé');
});

test('ne réattribue pas et ne remplace pas une copie historique sans empreinte de compte', async ({ page }) => {
  await page.route('**/onedrive-auth.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export class OneDriveAuth {
      connected = false;
      accountId = "compte-fictif";
      async initialize() {}
      async connect() { this.connected = true; }
      async getToken() { return "jeton-fictif"; }
      async disconnect() { this.connected = false; }
    }`
  }));
  await page.route('https://graph.microsoft.com/**', route => route.fulfill({
    json: { value: [{ id: 'legacy-item', name: 'historique.jpg', file: {}, eTag: '"v2"' }] }
  }));
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5188/#/recherche');
  await initialized;
  await page.evaluate(async () => {
    const { oneDriveDocumentId } = await import('/onedrive-document.js');
    const { put } = await import('/db.js');
    await put('documents', {
      id: await oneDriveDocumentId('compte-fictif', 'legacy-item'),
      name: 'historique.jpg', type: 'Document', isLocal: true, oneDriveSource: true,
      oneDriveETag: '"v1"', content: 'copie historique', summary: '', keywords: ''
    });
  });
  await page.reload();
  await expect(page.locator('#connect-onedrive')).toBeEnabled();
  await page.locator('[data-open-source-dialog]').click();
  await page.locator('#connect-onedrive').click();
  await page.locator('#start-onedrive').click();
  await expect(page.locator('#onedrive-status')).toContainText('1 version inconnue');
  await expect(page.locator('#onedrive-review-panel')).toBeHidden();
  const documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  expect(documents).toHaveLength(1);
  expect(documents[0].content).toBe('copie historique');
  expect(documents[0].oneDriveETag).toBe('"v1"');
  expect(documents[0].oneDriveAccountFingerprint).toBeUndefined();
});

test('termine la purge avant toute écriture tardive du parcours OneDrive', async ({ page }) => {
  await page.route('**/onedrive-auth.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export class OneDriveAuth {
      connected = false;
      accountId = "compte-fictif";
      async initialize() {}
      async connect() { this.connected = true; }
      async getToken() { return "jeton-fictif"; }
      async disconnect() { this.connected = false; }
    }`
  }));
  let releaseGraphResponse;
  const graphResponseGate = new Promise(resolve => { releaseGraphResponse = resolve; });
  let requestStarted;
  const graphRequestStarted = new Promise(resolve => { requestStarted = resolve; });
  await page.route('https://graph.microsoft.com/**', async route => {
    requestStarted();
    await graphResponseGate;
    await route.fulfill({
      json: { value: [{ id: 'fichier-concurrent', name: 'concurrent.jpg', file: {}, eTag: '"v1"' }] }
    });
  });
  await page.goto('http://127.0.0.1:5188/#/recherche');
  await expect(page.locator('#connect-onedrive')).toBeEnabled();
  await page.locator('[data-open-source-dialog]').click();
  await page.locator('#connect-onedrive').click();
  await page.locator('#start-onedrive').click();
  await graphRequestStarted;

  await page.evaluate(() => {
    location.hash = '#/vos-donnees';
    document.querySelector('#purge-all-data').click();
  });
  await expect(page.locator('#purge-confirmation')).toBeVisible();
  await page.locator('#confirm-purge').click();
  releaseGraphResponse();
  await expect(page.locator('#purge-status')).toContainText('supprimées');
  const documents = await page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return getAll('documents');
  });
  expect(documents).toHaveLength(0);
});
