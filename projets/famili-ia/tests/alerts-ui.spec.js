import { test, expect } from '@playwright/test';

const viewports = [390, 768, 1280, 1920];

async function openAlerts(page, hash = '#/alertes') {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto(`http://127.0.0.1:5179/${hash}`);
  await ready;
}

async function reloadReady(page) {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await ready;
}

async function auditLayout(scope) {
  return scope.evaluate(root => {
    const undersized = [...root.querySelectorAll('button, summary, input, select')]
      .filter(el => {
        const closedDetails = el.closest('details:not([open])');
        if (closedDetails && !closedDetails.querySelector('summary').contains(el)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 47.5 || rect.height < 47.5);
      })
      .map(el => el.id || el.textContent.trim());
    return { undersized, overflow: root.scrollWidth > root.clientWidth + 1 };
  });
}

for (const width of viewports) {
  test(`alertes : cartes compactes, actions et réglages accessibles à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    await openAlerts(page);
    const card = page.locator('#alert-list .alert-card.ui-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.alert-demo-label')).toHaveText('Source non renseignée');
    const box = await card.boundingBox();
    expect(box.y + box.height).toBeLessThan(width < 600 ? 728 : 900);
    await expect(page.locator('.ui-brand-logo')).toBeVisible();
    await expect(page.locator('.ui-brand-logo image')).toHaveAttribute('href', 'assets/Logo.svg');
    await expect(card.getByRole('button', { name: 'Terminée', exact: true })).toBeHidden();
    await card.locator('.alert-management > summary').click();
    await expect(card.getByRole('button', { name: 'Terminée', exact: true })).toBeVisible();
    expect(await auditLayout(page.locator('#view-alertes'))).toEqual({ undersized: [], overflow: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.locator('#open-alert-preferences').click();
    const dialog = page.getByRole('dialog', { name: 'Réglages des alertes' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#close-alert-preferences')).toBeFocused();
    expect(await auditLayout(dialog)).toEqual({ undersized: [], overflow: false });
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(width < 600 ? 800 : 900);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#open-alert-preferences')).toBeFocused();
  });
}

test('report, historique, réactivation et retour navigateur conservent le filtre et le focus', async ({ page }) => {
  await openAlerts(page);
  await page.locator('[data-filter="à-anticiper"]').click();
  await expect(page.locator('[data-alert-id="a1"] .alert-demo-label')).toHaveText('Exemple fictif');
  await expect(page.locator('[data-alert-id="a3"] .alert-demo-label')).toHaveText('Source non renseignée');
  await page.locator('[data-filter="à-traiter"]').click();

  const alert = page.locator('#alert-list .alert-card').first();
  const alertId = await alert.getAttribute('data-alert-id');
  const tracked = page.locator(`[data-alert-id="${alertId}"]`);
  await alert.locator('.alert-management > summary').click();
  await alert.getByRole('button', { name: 'Reporter 7 jours' }).click();
  await expect(tracked).toHaveCount(0);
  await expect(page.locator('[data-filter="à-traiter"]')).toBeFocused();
  await page.locator('[data-filter="reportées"]').click();
  await expect(tracked).toContainText('Reportée jusqu');
  await tracked.locator('.alert-management > summary').click();
  await tracked.getByRole('button', { name: 'Réactiver maintenant' }).click();
  await expect(page.locator('.alerts-empty')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-filter="à-traiter"]')).toHaveAttribute('aria-pressed', 'true');
  await tracked.locator('.alert-management > summary').click();
  await tracked.getByRole('button', { name: 'Terminée', exact: true }).click();
  await expect(tracked).toHaveCount(0);

  const historyFilter = page.locator('.alert-filter-tab[data-filter="historique"]');
  await historyFilter.click();
  await expect(historyFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(tracked).toBeVisible();
  await reloadReady(page);
  await expect(historyFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-filter="à-traiter"]')).toHaveAttribute('aria-pressed', 'false');
  await tracked.locator('.alert-management > summary').click();
  await tracked.getByRole('button', { name: 'Réactiver', exact: true }).click();
  await page.locator('[data-filter="à-traiter"]').click();
  await expect(tracked).toBeVisible();
});

test('réglages : aucune permission automatique, refus explicite et préférences conservées', async ({ page }) => {
  await page.addInitScript(() => {
    window.alertPermissionRequests = 0;
    class TestNotification {
      static permission = 'default';
      static async requestPermission() {
        window.alertPermissionRequests++;
        this.permission = 'denied';
        return 'denied';
      }
    }
    Object.defineProperty(window, 'Notification', { value: TestNotification });
  });
  await openAlerts(page);
  await page.locator('#open-alert-preferences').click();
  expect(await page.evaluate(() => window.alertPermissionRequests)).toBe(0);
  await page.locator('#enable-alert-notifications').click();
  await expect(page.locator('#enable-alert-notifications')).toBeDisabled();
  await expect(page.locator('#enable-alert-notifications')).toHaveText('Notifications bloquées dans le navigateur');
  expect(await page.evaluate(() => window.alertPermissionRequests)).toBe(1);
  await page.locator('[data-disabled-category="garantie"]').check();
  await page.locator('#alert-max-per-day').selectOption('1');
  await page.locator('[name="quietHoursEnabled"]').check();
  await page.locator('#alert-quiet-start').fill('21:00');
  await page.getByRole('button', { name: 'Enregistrer les préférences' }).click();
  await expect(page.locator('#alert-preferences-status')).toHaveText('Préférences enregistrées sur cet appareil.');
  await page.locator('#close-alert-preferences').click();
  await expect(page.locator('#open-alert-preferences')).toBeFocused();
  await reloadReady(page);
  await page.locator('#open-alert-preferences').click();
  await expect(page.locator('[data-disabled-category="garantie"]')).toBeChecked();
  await expect(page.locator('#alert-max-per-day')).toHaveValue('1');
  await expect(page.locator('#alert-quiet-start')).toHaveValue('21:00');
  await expect(page.locator('[name="quietHoursEnabled"]')).toBeChecked();
  await page.mouse.click(1, 1);
  await expect(page.locator('#alert-preferences-dialog')).toBeHidden();
});

test('correction de date, preuves, lecture clavier et navigation hors de la page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openAlerts(page);
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', {
      id: 'e5-document', name: `Contrat fictif ${'assurance'.repeat(18)}.txt`, type: 'assurance', isLocal: true,
      expiryDate: '2026-11-10', expiryDateEvidence: 'Fin du contrat le 10/11/2026',
      alertSourceId: 'local'
    });
  });
  await reloadReady(page);
  const card = page.locator('[data-alert-id="alert-e5-document"]');
  await expect(card).toContainText('Fin du contrat le 10/11/2026');
  await expect(card).toContainText('Source — Local');
  await expect(card.locator('.alert-demo-label')).toHaveCount(0);
  const management = card.locator('.alert-management > summary');
  await management.focus();
  await page.keyboard.press('Enter');
  await expect(management).toHaveCSS('outline-style', 'solid');
  const readButton = card.locator('[data-toggle-alert-read]');
  await readButton.click();
  await expect(readButton).toHaveAttribute('aria-pressed', 'true');
  await card.getByText('Corriger la date', { exact: true }).click();
  await expect(card).toHaveClass(/is-read/);
  expect(await auditLayout(page.locator('#view-alertes'))).toEqual({ undersized: [], overflow: false });
  await card.getByLabel("Date d'échéance confirmée").fill('2026-11-12');
  await card.getByRole('button', { name: 'Enregistrer la date' }).click();
  await page.locator('[data-filter="à-anticiper"]').click();
  await expect(card).toContainText('Échéance : 12/11/2026');
  await expect(card).toContainText('Échéance corrigée manuellement');
  await card.getByRole('button', { name: /Voir le détail de/ }).click();
  await expect(page.locator('#source-dialog')).toBeVisible();
  await page.locator('#close-dialog').click();
  await page.locator('.topbar .brand').click();
  await expect(page.locator('body')).toHaveClass(/ui-theme/);
});

test('couleurs lisibles et mouvement réduit dans les cartes et leurs actions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAlerts(page);
  const card = page.locator('.alert-card').first();
  await card.locator('.alert-management > summary').click();
  const ratios = await card.evaluate(root => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const tint = getComputedStyle(root).getPropertyValue('--alert-tint').trim();
    const colors = [...root.querySelectorAll('.alert-header strong, .alert-state, .alert-date, p, summary, button')];
    return colors.map(el => {
      const style = getComputedStyle(el);
      const foreground = luminance(style.color);
      const canvas = document.createElement('canvas').getContext('2d');
      canvas.fillStyle = tint;
      canvas.fillRect(0, 0, 1, 1);
      const rgb = canvas.getImageData(0, 0, 1, 1).data;
      const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : style.backgroundColor;
      const backdrop = luminance(background);
      return (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05);
    });
  });
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
  expect(await card.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.01);
});
