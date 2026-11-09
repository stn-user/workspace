import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 480 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 }
]) {
  test(`modale d'extrait accessible et lisible à ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', route => route.abort());
    const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
    await page.goto('http://127.0.0.1:5179/#/recherche');
    await initialized;
    const name = `contrat-test-${'a'.repeat(160)}.txt`;
    const content = `Début de l'extrait ${'motlong'.repeat(700)} fin de l'extrait`;
    await page.evaluate(async ({ name, content }) => {
      const { put } = await import('/db.js');
      await put('documents', {
        id: 'dialog-test', name, type: 'Texte', date: 'Date inconnue',
        content, isLocal: true, driveSource: true, keywords: '', summary: ''
      });
    }, { name, content });
    const reinitialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
    await page.reload();
    await reinitialized;
    await page.locator('#experimental-index-query').fill('contrat-test');
    await page.locator('#experimental-index-form button').click();
    const result = page.locator('#experimental-index-results li').filter({ hasText: name });
    const open = result.getByRole('button', { name: 'Voir la copie dans Famili-IA' });
    await open.click();

    const dialog = page.getByRole('dialog', { name });
    const close = dialog.getByRole('button', { name: "Fermer l'extrait" });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expect(dialog).toContainText("Ce n'est pas l'original");
    await expect(dialog.locator('#dialog-content')).toHaveText(content);
    const box = await dialog.boundingBox();
    const closeBox = await close.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(closeBox.width).toBeGreaterThanOrEqual(48);
    expect(closeBox.height).toBeGreaterThanOrEqual(48);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await dialog.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await dialog.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await page.locator('#experimental-index-query').evaluate(el => el.focus());
    await expect(page.locator('#experimental-index-query')).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await page.mouse.click(1, 1);
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
  });
}
