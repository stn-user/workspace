import { test, expect } from '@playwright/test';

test.describe('Famili-IA Onboarding & Sync (Phase 13.4 & 13.5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5179');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('13.1 & 13.4.c - Le wizard apparaît au premier lancement et persiste après complétion', async ({ page }) => {
    await page.reload();

    const wizard = page.locator('#onboarding-wizard');
    await expect(wizard).not.toHaveAttribute('hidden');

    // 1. Étape 0 -> Étape 1
    const nextBtn1 = page.locator('#step-0 .primary-button');
    await nextBtn1.waitFor({ state: 'visible' });
    await nextBtn1.click();

    // 2. Remplir les champs de l'étape 1 (Prénom & Ville)
    await page.fill('#wizard-user-name', 'Marie');
    await page.fill('#wizard-user-city', 'Lyon');

    // Cliquer sur le bouton "Continuer" de l'étape 1
    const nextBtn2 = page.locator('#step-1 [data-wizard-next]');
    await nextBtn2.waitFor({ state: 'visible' });
    await nextBtn2.click();

    // 3. Étape 2 -> Lancer la démo
    const demoBtn = page.locator('#start-demo-mode');
    await demoBtn.waitFor({ state: 'visible' });
    await demoBtn.click();

    // Attendre que le mode démo soit complètement initialisé et l'onboarding marqué comme complet
    await page.waitForTimeout(2000);

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

    // Gérer le dialog confirm
    page.on('dialog', async dialog => {
      expect(dialog.type()).toContain('confirm');
      await dialog.accept();
    });

    const resetBtn = page.locator('#reset-onboarding-btn');
    await resetBtn.waitFor({ state: 'visible' });
    await resetBtn.click();

    await page.waitForLoadState('networkidle');
    const isComplete = await page.evaluate(() => {
      return localStorage.getItem('famili-ia-source-choice-complete');
    });
    expect(isComplete).toBeNull();
  });

  test('13.5.a - Ergonomie Mobile & Cibles Tactiles', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const wizard = page.locator('#onboarding-wizard');
    await expect(wizard).not.toHaveAttribute('hidden');

    const primaryButton = page.locator('#step-0 .primary-button');
    const box = await primaryButton.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40);
  });
});
