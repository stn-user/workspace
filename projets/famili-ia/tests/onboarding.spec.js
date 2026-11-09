import { test, expect } from '@playwright/test';

test.describe('Famili-IA Onboarding & Sync (Phase 13.4 & 13.5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5179');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('15.5bis.a - Wizard apparaît au premier lancement et persiste après complétion', async ({ page }) => {
    await page.reload();

    const wizard = page.locator('#onboarding-wizard');
    await expect(wizard).not.toHaveAttribute('hidden');

    // 1. Étape 0 (Bienvenue) -> Étape 1 (Personnalisation)
    const nextBtn1 = page.locator('#start-onboarding');
    await nextBtn1.waitFor({ state: 'visible' });
    await nextBtn1.click();

    // 2. Étape 1 - Saisie prénom optionnel (peut être vide)
    await page.fill('#wizard-user-name', 'Marie');

    // Cliquer sur le bouton "Continuer" de l'étape 1
    const nextBtn2 = page.locator('#step-1 [data-wizard-next]');
    await nextBtn2.waitFor({ state: 'visible' });
    await nextBtn2.click();

    // 3. Étape 2 -> Lancer la démo
    const demoBtn = page.locator('#step-2 [data-wizard-next="3"]');
    await demoBtn.waitFor({ state: 'visible' });
    await demoBtn.click();

    await expect(page.locator('#demo-result-heading')).toContainText('Facture de piscine');
    await page.locator('#finish-onboarding-demo').click();

    // Vérifier que le localStorage a bien stocké la fin de l'onboarding
    const isComplete = await page.evaluate(() => {
      return localStorage.getItem('famili-ia-source-choice-complete');
    });
    expect(isComplete).toBe('true');

    // Recharger la page -> Le wizard ne doit PLUS s'afficher
    await page.reload();
    await expect(wizard).toHaveAttribute('hidden');
  });

  test('13.4.b - Bouton de réinitialisation dans le profil', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('famili-ia-source-choice-complete', 'true');
    });
    await page.reload();

    // Naviguer vers le profil
    await page.goto('http://localhost:5179/#profil');

    const resetBtn = page.locator('#reset-onboarding-btn');
    await resetBtn.waitFor({ state: 'visible' });
    await resetBtn.click();

    await expect(page.locator('#step-0')).toBeVisible();
    const isComplete = await page.evaluate(() => {
      return localStorage.getItem('famili-ia-source-choice-complete');
    });
    expect(isComplete).toBe('true');
  });

  test('13.5.a - Ergonomie Mobile & Cibles Tactiles', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const wizard = page.locator('#onboarding-wizard');
    await expect(wizard).not.toHaveAttribute('hidden');

    const primaryButton = page.locator('#start-onboarding');
    const box = await primaryButton.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44); // Minimum tactile sur mobile
  });

  test('15.5bis.a - Continuer sans prénom (saute directement)', async ({ page }) => {
    await page.reload();

    const wizard = page.locator('#onboarding-wizard');
    await expect(wizard).not.toHaveAttribute('hidden');

    // 1. Étape 0 (Bienvenue) -> Étape 1 (Personnalisation)
    const nextBtn1 = page.locator('#start-onboarding');
    await nextBtn1.waitFor({ state: 'visible' });
    await nextBtn1.click();

    // 2. Cliquer sur "Continuer sans prénom" - saute directement à l'étape 2 (choix du parcours)
    const skipBtn = page.locator('#skip-personalization');
    await skipBtn.waitFor({ state: 'visible' });
    await skipBtn.click();

    // Vérifier qu'on est bien à l'étape 2 (choix du parcours)
    const step2 = page.locator('#step-2');
    await expect(step2).not.toHaveAttribute('hidden');

    // 3. Lancer la démo
    const demoBtn = page.locator('#step-2 [data-wizard-next="3"]');
    await demoBtn.waitFor({ state: 'visible' });
    await demoBtn.click();

    await page.locator('#finish-onboarding-demo').click();

    const isComplete = await page.evaluate(() => {
      return localStorage.getItem('famili-ia-source-choice-complete');
    });
    expect(isComplete).toBe('true');

    // Le wizard ne doit plus s'afficher
    await page.reload();
    await expect(wizard).toHaveAttribute('hidden');
  });

  test('15.5bis.a - Bouton Découvrir ≥ 48x48px sur différents viewports', async ({ page }) => {
    // Test Web (1920px)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();

    const wizard = page.locator('#onboarding-wizard');
    await expect(wizard).not.toHaveAttribute('hidden');

    const discoverButton = page.locator('#start-onboarding');
    await discoverButton.waitFor({ state: 'visible' });

    let box = await discoverButton.boundingBox();
    // Bouton principal ≥ 48px de hauteur sur desktop
    expect(box.height).toBeGreaterThanOrEqual(48);

    // Test Tablette (768px)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();

    await expect(wizard).not.toHaveAttribute('hidden');
    box = await page.locator('#start-onboarding').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);

    // Test Mobile (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    await expect(wizard).not.toHaveAttribute('hidden');
    box = await page.locator('#start-onboarding').boundingBox();
    // Bouton principal ≥ 44px de hauteur (Apple HIG minimum) sur mobile
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('15.5bis.a - Parcours utilisateur complet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    // Étape 0 -> Bienvenue
    const step0 = page.locator('#step-0');
    await expect(step0).not.toHaveAttribute('hidden');
    await expect(step0.locator('h2')).toContainText('Retrouvez ce qui compte');

    // Clic sur "Découvrir Famili-IA"
    await page.locator('#start-onboarding').click();

    // Étape 1 -> Personnalisation
    const step1 = page.locator('#step-1');
    await expect(step1).not.toHaveAttribute('hidden');
    await expect(step1.locator('h2')).toContainText('Comment pouvons-nous vous appeler');

    // Saisie prénom optionnel
    await page.fill('#wizard-user-name', 'Alex');

    // Clic sur "Continuer"
    await page.locator('#step-1 [data-wizard-next="2"]').click();

    // Étape 2 -> Choix du parcours
    const step2 = page.locator('#step-2');
    await expect(step2).not.toHaveAttribute('hidden');
    await expect(page.locator('#wizard-greeting')).toContainText('Bonjour Alex');

    // Clic sur "Explorer la démo"
    await page.locator('#step-2 [data-wizard-next="3"]').click();
    await page.locator('#finish-onboarding-demo').click();

    // Vérifier la complétion
    const isComplete = await page.evaluate(() => {
      return localStorage.getItem('famili-ia-source-choice-complete');
    });
    expect(isComplete).toBe('true');

    // Vérifier la redirection vers l'accueil
    await page.waitForURL(/#\/accueil/);
  });
});
