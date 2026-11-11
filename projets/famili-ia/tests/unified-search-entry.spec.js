import { test, expect } from '@playwright/test';

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

for (const width of [390, 768, 1280, 1920]) {
    test(`accueil harmonisé et découverte sans écriture à ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
      await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
      await openReady(page, 'accueil');
      await expect(page.locator('#onboarding-wizard')).toBeHidden();
      await expect(page.locator('#view-accueil')).toHaveAccessibleName('Accueil');
      await expect(page.locator('body')).toHaveClass(/ui-theme/);
      await expectUsable(page.locator('#view-accueil'));
      await expect(page.locator('#dashboard-data-note')).toContainText('exemples fictifs');
      const form = await page.locator('#quick-search-form').boundingBox();
      const main = await page.locator('.main-content').boundingBox();
      expect(form.y + form.height).toBeLessThanOrEqual(main.y + main.height);
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
    });
  }

  test('accueil restauré : nom littéral et compteurs cohérents avec leurs destinations', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('famili-ia-source-choice-complete', 'true'));
    await openReady(page, 'accueil');
    const name = `<b>Alex & ${'Famille'.repeat(16)}</b>`;
    await page.evaluate(async name => {
      const { getCurrentUser } = await import('/state.js');
      const { put } = await import('/db.js');
      await put('users', { ...getCurrentUser(), name });
      for (const [id, type] of [['home-garantie', 'Garantie'], ['home-contrat', 'Contrat'], ['home-photo', 'Image']]) {
        await put('documents', { id, type, name: `${id}.txt`, isLocal: true, content: '' });
      }
    }, name);
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

test('la recherche rapide de l’accueil ouvre le formulaire multisource unique', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('famili-ia-source-choice-complete', 'true');
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await expect(page.locator('#quick-search-form label')).toHaveText('Rechercher dans Famili-IA');
  await page.locator('#experimental-index-form').evaluate(form => {
    form.dataset.submits = '0';
    form.addEventListener('submit', () => { form.dataset.submits = String(Number(form.dataset.submits) + 1); });
  });
  await page.locator('#quick-question').fill('facture pergola');
  await page.locator('#quick-search-form [type="submit"]').click();
  await expect(page).toHaveURL(/#\/recherche\?q=/);
  await expect(page.locator('#experimental-index-query')).toHaveValue('facture pergola');
  await expect(page.locator('#experimental-index-query')).toBeFocused();
  await expect(page.locator('#experimental-index-form')).toHaveAttribute('data-submits', '1');
  expect(errors).toEqual([]);
  await expect(page.locator('#search-mode')).toHaveCount(0);
});
