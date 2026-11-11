import { test, expect } from '@playwright/test';

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
      const photo = {
        id: 'unified-search-photo',
        type: 'Image',
        name: 'Vacances Québec.jpg',
        isLocal: true,
        importedAt: '2024-07-14T10:00:00.000Z',
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

    await page.locator('#experimental-index-query').fill('photos importées en 2024');
    await page.locator('#experimental-index-form .submit-button').click();
    await expect(page.locator('#moments-life-search-status')).toContainText('1 photo trouvée');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test('Vos données ne propose plus un raccourci vers une recherche photo distincte', async ({ page }) => {
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/vos-donnees');
  await initialized;
  await expect(page.getByRole('button', { name: 'Ouvrir la recherche photo' })).toHaveCount(0);
});

test('la recherche rapide de l’accueil ouvre le formulaire multisource unique', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('famili-ia-source-choice-complete', 'true');
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await expect(page.locator('#quick-search-form label')).toHaveText('Rechercher dans Famili-IA');
  await page.locator('#quick-question').fill('facture pergola');
  await page.locator('#quick-search-form [type="submit"]').click();
  await expect(page).toHaveURL(/#\/recherche\?q=/);
  await expect(page.locator('#experimental-index-query')).toHaveValue('facture pergola');
  await expect(page.locator('#search-mode')).toHaveCount(0);
});
