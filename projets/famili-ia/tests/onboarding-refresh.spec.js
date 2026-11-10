import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 }
]) {
  test(`onboarding lisible et utilisable à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://accounts.google.com/**', route => route.abort());
    await page.route('https://apis.google.com/**', route => route.abort());
    const initialized = page.waitForEvent('console', message => message.text().includes('initOnboardingWizard called'));
    await page.goto('http://127.0.0.1:5179/#/accueil');
    await initialized;
    const wizard = page.locator('#onboarding-wizard');
    await expect(wizard).toBeVisible();
    const logo = page.locator('.onboarding-logo');
    await expect(logo).toBeVisible();
    const logoImage = logo.locator('image');
    await expect(logoImage).toHaveAttribute('href', /Logo\.svg$/);
    expect(await logoImage.evaluate(async element => {
      const image = new Image();
      image.src = element.getAttribute('href');
      await image.decode();
      return image.naturalWidth > 0;
    })).toBe(true);

    async function checkButtons(selector) {
      const buttons = page.locator(selector);
      for (let i = 0; i < await buttons.count(); i++) {
        await expect(buttons.nth(i)).toBeVisible();
        const box = await buttons.nth(i).boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
      expect(await wizard.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await checkButtons('#start-onboarding');
    await page.locator('#start-onboarding').click();
    await expect(page.locator('#step-1')).toBeVisible();
    await checkButtons('#step-1 button');
    await page.locator('#skip-personalization').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await checkButtons('#step-2 button');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    expect(await wizard.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

}

test('composants bouton et champ réutilisables hors onboarding', async ({ page }) => {
  const initialized = page.waitForEvent('console', message => message.text().includes('initOnboardingWizard called'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'ui-test-fixture';
    fixture.innerHTML = `
      <label class="ui-label" for="ui-test-input">Nom</label>
      <input class="ui-input" id="ui-test-input">
      <button class="ui-button ui-button--primary" type="button">Action principale</button>
      <button class="ui-button ui-button--secondary ui-button--full" type="button">Action secondaire</button>
      <button class="ui-button ui-button--text" type="button" disabled>Indisponible</button>`;
    document.body.append(fixture);
  });
  const fixture = page.locator('#ui-test-fixture');
  const input = fixture.getByLabel('Nom');
  await input.fill('Test');
  await page.keyboard.press('Tab');
  const primary = fixture.getByRole('button', { name: 'Action principale' });
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS('outline-style', 'solid');
  const secondary = fixture.getByRole('button', { name: 'Action secondaire' });
  for (const control of [input, primary, secondary, fixture.getByRole('button', { name: 'Indisponible' })]) {
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
  expect((await secondary.boundingBox()).width).toBeCloseTo((await fixture.boundingBox()).width, 0);
  await expect(fixture.getByRole('button', { name: 'Indisponible' })).toBeDisabled();
});

test('annuler le choix du dossier conserve le parcours personnel', async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { throw new DOMException('Annulé', 'AbortError'); };
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('initOnboardingWizard called'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await page.locator('#start-onboarding').click();
  await page.locator('#skip-personalization').click();
  await page.locator('#start-scan-mode').click();
  await expect(page.locator('#step-2')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('famili-ia-source-choice-complete'))).toBeNull();
});

test('focus, prénom facultatif et découverte sans accès aux comptes', async ({ page }) => {
  let cloudRequests = 0;
  await page.route('https://**/*', route => {
    cloudRequests++;
    return route.abort();
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('initOnboardingWizard called'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  await expect(page.locator('#onboarding-wizard')).toBeVisible();
  const initialRequests = cloudRequests;
  await page.locator('#start-onboarding').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#step-1-title')).toBeFocused();
  await page.getByLabel('Votre prénom (facultatif)').fill('Camille');
  await expect(page.locator('#step-1 .onboarding-progress')).toHaveText('Étape 1 sur 3 · Personnalisation');
  await page.getByLabel('Votre prénom (facultatif)').press('Enter');
  await expect(page.locator('#step-2-title')).toBeFocused();
  await expect(page.locator('#step-2 .onboarding-progress')).toHaveText('Étape 2 sur 3 · Choix du parcours');
  await expect(page.locator('#wizard-greeting')).toContainText('Camille');
  await page.locator('#step-2 [data-wizard-prev]').click();
  await page.locator('#skip-personalization').click();
  await expect(page.locator('#wizard-greeting')).toBeHidden();
  await expect(page.locator('#step-2')).toContainText('résultats fictifs');
  await expect(page.locator('#step-2 [data-wizard-next="3"]')).toBeEnabled();
  expect(cloudRequests).toBe(initialRequests);
});

test('la démo est rejouable sans modifier les données existantes', async ({ page }) => {
  let cloudRequests = 0;
  await page.route('https://**/*', route => {
    cloudRequests++;
    return route.abort();
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('initOnboardingWizard called'));
  await page.goto('http://127.0.0.1:5179/#/accueil');
  await initialized;
  const initialRequests = cloudRequests;
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', { id: 'preservation-test', name: 'document-fictif.txt', isLocal: true });
    await put('equipment', { id: 'equipement-test', name: 'équipement fictif' });
    await put('family', { id: 'personne-test', name: 'personne fictive' });
    await put('alerts', { id: 'alerte-test', title: 'alerte fictive' });
  });
  const snapshot = () => page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
  });
  const before = await snapshot();
  await page.locator('#start-onboarding').click();
  await page.locator('#wizard-user-name').fill('Camille');
  await page.locator('#step-1 [data-wizard-next="2"]').click();
  await page.locator('#step-2 [data-wizard-next="3"]').click();
  await expect(page.locator('#demo-result-heading')).toContainText('Facture de piscine');
  for (const [question, heading] of [['garantie-pompe', 'garantie'], ['photos-aaron', 'Photos'], ['facture-piscine', 'Facture']]) {
    await page.locator(`[data-demo-question="${question}"]`).click();
    await expect(page.locator('#demo-result-heading')).toContainText(heading);
  }
  await expect(page.locator('#demo-document-list')).toContainText('exemple fictif');
  expect(await snapshot()).toEqual(before);
  expect(cloudRequests).toBe(initialRequests);
  await page.locator('#finish-onboarding-demo').click();
  await expect(page.locator('#onboarding-wizard')).toBeHidden();
  await expect(page.locator('#dashboard-title')).toBeFocused();
  const reinitialized = page.waitForEvent('console', message => message.text().includes('initOnboardingWizard called'));
  await page.reload();
  await reinitialized;
  await expect(page.locator('#onboarding-wizard')).toBeHidden();
  const afterReload = await snapshot();
  expect(afterReload[1].some(document => document.id === 'preservation-test')).toBe(true);
  await page.goto('http://127.0.0.1:5179/#/profil');
  await expect(page.locator('#reset-onboarding-btn')).toHaveClass(/ui-button--secondary/);
  await page.locator('#reset-onboarding-btn').click();
  await expect(page.locator('#step-0')).toBeVisible();
  await expect(page.locator('#step-0-title')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('famili-ia-source-choice-complete'))).toBe('true');
  await page.locator('#start-onboarding').click();
  await page.locator('#skip-personalization').click();
  await page.locator('#step-2 [data-wizard-next="3"]').click();
  await page.locator('#finish-onboarding-demo').click();
  expect(await snapshot()).toEqual(afterReload);
  await page.reload();
  await expect(page.locator('#onboarding-wizard')).toBeHidden();
  expect((await snapshot())[1].some(document => document.id === 'preservation-test')).toBe(true);
});
