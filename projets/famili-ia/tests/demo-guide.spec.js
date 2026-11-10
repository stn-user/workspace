import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 }
]) {
  test(`guide de démo rejouable et isolé à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let cloudRequests = 0;
    await page.route('https://**/*', route => {
      cloudRequests++;
      return route.abort();
    });
    const initialized = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://127.0.0.1:5179/#/accueil');
    await initialized;
    await page.evaluate(async () => {
      const { put } = await import('/db.js');
      await put('documents', { id: 'guide-test', name: 'document fictif.txt', isLocal: true });
      await put('alerts', { id: 'guide-alert', title: 'alerte fictive' });
    });
    const snapshot = () => page.evaluate(async () => {
      const { getAll } = await import('/db.js');
      return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
    });
    const before = await snapshot();
    const initialRequests = cloudRequests;
    await page.locator('#start-onboarding').click();
    await page.locator('#skip-personalization').click();
    await page.locator('#step-2 [data-wizard-next="3"]').click();
    const progress = page.locator('#demo-guide-progress');
    const questions = page.locator('.demo-questions');
    const results = page.locator('#demo-results');
    await expect(progress).toHaveText('Guide · étape 1 sur 3');
    await expect(questions).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-result-heading')).toContainText('Facture de piscine');
    expect(await page.locator('#onboarding-wizard').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const button of await page.locator('#step-3 button').all()) {
      if (!await button.isVisible()) continue;
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }

    await page.locator('#demo-guide-next').focus();
    await page.keyboard.press('Enter');
    await expect(progress).toHaveText('Guide · étape 2 sur 3');
    await expect(results).toHaveClass(/demo-guide-highlight/);
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(results).toContainText('Google Drive · exemple fictif');
    await expect(results).toContainText('4 mars 2023');
    await page.locator('#demo-guide-prev').click();
    await expect(progress).toHaveText('Guide · étape 1 sur 3');
    await expect(page.locator('[data-demo-question="facture-piscine"]')).toBeFocused();
    await page.locator('[data-demo-question="photos-aaron"]').click();
    await expect(progress).toHaveText('Guide · étape 2 sur 3');
    await expect(page.locator('#demo-result-heading')).toContainText('Photos familiales');
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await expect(results).toContainText('Local · exemple fictif');
    await page.locator('[data-demo-question="contrat-habitation"]').click();
    await expect(progress).toHaveText('Guide · étape 2 sur 3');
    await expect(page.locator('#demo-result-heading')).toContainText('Contrat d’assurance habitation');
    await expect(results).toContainText('Google Drive · exemple fictif');
    await expect(results).toContainText('31 décembre 2027');
    await expect(results).toContainText('aucune alerte n’est créée');
    await expect(page.locator('[data-demo-question="contrat-habitation"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#demo-guide-skip').click();
    await expect(page.locator('#demo-guide')).toBeHidden();
    await expect(page.locator('#demo-guide-restart')).toBeFocused();
    await expect(results).not.toHaveClass(/demo-guide-highlight/);
    await page.locator('[data-demo-question="garantie-pompe"]').click();
    await expect(page.locator('#demo-result-heading')).toContainText('garantie');
    await expect(page.locator('#demo-guide')).toBeHidden();
    await page.locator('#demo-guide-restart').click();
    await expect(progress).toHaveText('Guide · étape 1 sur 3');
    await expect(page.locator('[data-demo-question="garantie-pompe"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#demo-guide-next').click();
    await page.locator('#demo-guide-next').click();
    await expect(progress).toHaveText('Guide · étape 3 sur 3');
    await expect(page.locator('#demo-guide-instruction')).toContainText('qu’après votre confirmation');
    await expect(page.locator('#finish-onboarding-demo')).toHaveClass(/demo-guide-highlight/);
    await page.locator('#demo-guide-prev').click();
    await expect(progress).toHaveText('Guide · étape 2 sur 3');
    await expect(page.locator('#demo-result-heading')).toBeFocused();
    await page.locator('#demo-guide-next').click();
    await page.locator('#demo-guide-next').click();
    await expect(page.locator('#demo-guide')).toBeHidden();
    await expect(page.locator('#finish-onboarding-demo')).not.toHaveClass(/demo-guide-highlight/);
    expect(await snapshot()).toEqual(before);
    expect(cloudRequests).toBe(initialRequests);
    await page.locator('#finish-onboarding-demo').click();
    expect(await snapshot()).toEqual(before);
    await page.goto('http://127.0.0.1:5179/#/profil');
    await page.locator('#reset-onboarding-btn').click();
    await page.locator('#start-onboarding').click();
    await page.locator('#skip-personalization').click();
    await page.locator('#step-2 [data-wizard-next="3"]').click();
    await expect(progress).toHaveText('Guide · étape 1 sur 3');
    await expect(page.locator('#demo-result-heading')).toContainText('Facture de piscine');
    expect(await snapshot()).toEqual(before);
  });
}
