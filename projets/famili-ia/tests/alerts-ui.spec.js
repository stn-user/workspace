import { test, expect } from '@playwright/test';

const viewports = [390, 768, 1280, 1920];

async function openAlerts(page, hash = '#/alertes', seedAlerts = true) {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto(`http://127.0.0.1:5179/${hash}`);
  await ready;
  if (!seedAlerts) return;
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await Promise.all([
      put('alerts', {
        id: 'a2',
        title: 'Rappel fictif à traiter',
        detail: 'Rappel de test arrivé à échéance.',
        type: 'red',
        docId: 'source-absente',
        dueDate: '2026-11-10'
      }),
      put('alerts', {
        id: 'a1',
        title: 'Garantie fictive',
        detail: 'Rappel de test sans effet réel.',
        type: 'red',
        docId: 'piscine-garantie',
        dueDate: '2026-11-15'
      }),
      put('alerts', {
        id: 'a3',
        title: 'Rappel sans source',
        detail: 'Exemple de test.',
        type: 'amber',
        docId: 'source-absente',
        dueDate: '2026-12-08'
      })
    ]);
  });
  await reloadReady(page);
}

async function reloadReady(page) {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await ready;
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { getAll } = await import('/db.js');
    return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
  });
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
    await expect(page.locator('body')).toHaveClass(/ui-warm/);
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
    expect(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1)).toBe(true);
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
      expiryDate: '2026-11-10', expiryDateEvidence: 'Fin du contrat le 10/11/2026 <preuve & date>',
      alertSourceId: 'local'
    });
  });
  await reloadReady(page);
  const card = page.locator('[data-alert-id="alert-e5-document"]');
  await expect(card).toContainText('Fin du contrat le 10/11/2026');
  await expect(card.locator('.alert-evidence mark')).toHaveText('Fin du contrat le 10/11/2026 <preuve & date>');
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
  await card.getByRole('button', { name: /Voir la copie/ }).click();
  await expect(page.locator('#source-dialog')).toBeVisible();
  await page.locator('#close-dialog').click();
  await page.locator('.topbar .brand').click();
  await expect(page.locator('body')).toHaveClass(/ui-theme/);
});

test('copie modifiée : date et choix conservés, puis correction explicite durable même hors seuil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openAlerts(page);
  await page.evaluate(async () => {
    const { addDocument, getDocuments, getAlerts, updateAlert } = await import('/state.js');
    const { createContentProvenance } = await import('/content-index.js');
    const document = {
      id: 'lifecycle-document', name: 'contrat-fictif.txt', isLocal: true, type: 'assurance',
      expiryDate: '2026-11-12', expiryDateEvidence: 'Fin du contrat : 12/11/2026',
      content: 'Fin du contrat : 12/11/2026'
    };
    document.contentProvenance = await createContentProvenance(document, [document.content], 'local-text');
    await addDocument(document);
    await updateAlert({
      ...getAlerts().find(alert => alert.docId === document.id),
      status: 'ignored', snoozedUntil: '2026-11-20', notificationSentFor: '2026-11-12', read: true
    });
    const changed = {
      ...getDocuments().find(entry => entry.id === document.id),
      content: 'Fin du contrat : 13/11/2026',
      expiryDate: '2026-11-13', expiryDateEvidence: 'Fin du contrat : 13/11/2026'
    };
    changed.contentProvenance = await createContentProvenance(changed, [changed.content], 'local-text');
    await addDocument(changed);
  });
  await reloadReady(page);
  await page.locator('[data-filter="historique"]').click();
  const card = page.locator('[data-alert-id="alert-lifecycle-document"]');
  await expect(card).toContainText('Source à vérifier');
  await expect(card).toContainText('Échéance : 12/11/2026');
  await expect(card).toContainText('Fin du contrat : 12/11/2026');
  await expect(card).toContainText('Notifications suspendues');
  await card.locator('.alert-management > summary').click();
  await card.getByText('Corriger la date', { exact: true }).click();
  await card.getByLabel("Date d'échéance confirmée").fill('2027-11-13');
  await card.getByRole('button', { name: 'Enregistrer la date' }).click();
  await expect(card).toContainText('Échéance : 13/11/2027');
  await expect(card.locator('.alert-source-review')).toHaveCount(0);
  await reloadReady(page);
  await expect(card).toContainText('Échéance : 13/11/2027');
  await expect(card.locator('.alert-source-review')).toHaveCount(0);
  const persisted = await page.evaluate(async () =>
    (await (await import('/db.js')).getAll('alerts')).find(alert => alert.docId === 'lifecycle-document'));
  expect(persisted).toMatchObject({
    status: 'ignored', read: true, snoozedUntil: '2026-11-20', sourceReview: null, dueDate: '2027-11-13'
  });
  expect(persisted.notificationSentFor).toBeUndefined();
  await card.locator('.alert-management > summary').click();
  await card.getByRole('button', { name: 'Réexaminer les preuves dans Recherche' }).click();
  await expect(page.locator('#view-recherche')).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`preuve invalide et copie absente : alerte préservée avec avertissement à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openAlerts(page);
    await page.evaluate(async () => {
      const { addDocument } = await import('/state.js');
      const { createContentProvenance } = await import('/content-index.js');
      const document = {
        id: 'missing-proof', name: 'garantie-fictive.txt', isLocal: true, type: 'garantie',
        expiryDate: '2026-11-12', expiryDateEvidence: 'Fin de garantie : 12/11/2026',
        content: 'Fin de garantie : 12/11/2026'
      };
      document.contentProvenance = await createContentProvenance(document, [document.content], 'local-text');
      await addDocument(document);
      await addDocument({ ...document, content: 'Copie altérée sans nouvelle provenance.' });
    });
    await reloadReady(page);
    const card = page.locator('[data-alert-id="alert-missing-proof"]');
    await expect(card).toContainText("La preuve de l'échéance n'est plus vérifiable");
    await expect(card).toContainText('Échéance : 12/11/2026');
    const eligibility = await page.evaluate(async () => {
      const { getAlerts, getDocuments, confirmDocumentAlert } = await import('/state.js');
      const { getAlertsToNotify } = await import('/alert-engine.js');
      let confirmationError;
      try { await confirmDocumentAlert('missing-proof'); } catch (error) { confirmationError = error.message; }
      return {
        notifications: getAlertsToNotify(getAlerts(), new Date()).map(alert => alert.docId),
        confirmationError, documentPresent: getDocuments().some(document => document.id === 'missing-proof')
      };
    });
    expect(eligibility.notifications).not.toContain('missing-proof');
    expect(eligibility.confirmationError).toContain("n'est plus vérifiable");
    expect(eligibility.documentPresent).toBe(true);
    await page.evaluate(async () => (await import('/db.js')).remove('documents', 'missing-proof'));
    await reloadReady(page);
    await expect(card).toContainText('Copie source absente de Famili-IA');
    await expect(card).toContainText('Échéance : 12/11/2026');
    expect(await auditLayout(page.locator('#view-alertes'))).toEqual({ undersized: [], overflow: false });
    const persisted = await page.evaluate(async () =>
      (await (await import('/db.js')).getAll('alerts')).find(alert => alert.docId === 'missing-proof'));
    expect(persisted).toMatchObject({ dueDate: '2026-11-12', sourceReview: 'source-missing', status: 'active' });
    await page.evaluate(async () => (await import('/state.js')).deleteDocument('missing-proof'));
    await reloadReady(page);
    await expect(card).toHaveCount(0);
  });
}

test('chronologie : dates normalisees, reperes relatifs et dates inconnues sans modifier les donnees', async ({ page }) => {
  await openAlerts(page);
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    for (const alert of [
      { id: 'a0', title: 'Aujourd’hui', dueDate: '2026-11-11', type: 'red' },
      { id: 'a4', title: 'Premier rappel', dueDate: '05/11/2026', type: 'red' },
      { id: 'watch-valid', title: 'À long terme', dueDate: '2027-11-11', type: 'blue' },
      { id: 'watch-missing', title: 'Sans date', type: 'blue' },
      { id: 'watch-invalid', title: 'Date invalide', dueDate: '2026-02-30', type: 'muted' }
    ]) await put('alerts', { ...alert, detail: 'Rappel de test.', status: 'active' });
  });
  await reloadReady(page);
  const before = await snapshot(page);
  await expect(page.locator('#alert-period-title')).toHaveText('À traiter en premier');
  expect(await page.locator('.alert-timeline [data-alert-id]').evaluateAll(cards => cards.map(card => card.dataset.alertId)))
    .toEqual(['a4', 'a2', 'a0']);
  await expect(page.locator('[data-alert-id="a4"] time')).toHaveAttribute('datetime', '2026-11-05');
  await expect(page.locator('[data-alert-id="a4"] .alert-time-hint')).toHaveText('Il y a 6 jours');
  await expect(page.locator('[data-alert-id="a0"] .alert-time-hint')).toHaveText("Aujourd'hui");
  await page.locator('[data-filter="à-surveiller"]').click();
  const watchIds = await page.locator('.alert-timeline [data-alert-id]').evaluateAll(cards => cards.map(card => card.dataset.alertId));
  expect(watchIds[0]).toBe('watch-valid');
  expect(watchIds.slice(1).sort()).toEqual(['watch-invalid', 'watch-missing']);
  await expect(page.locator('[data-alert-id="watch-missing"] .alert-date')).toHaveText('Date non renseignée');
  await expect(page.locator('[data-alert-id="watch-invalid"] .alert-date')).toHaveText('Date à vérifier');
  await expect(page.locator('[data-alert-id="watch-invalid"] time')).toHaveCount(0);
  await expect(page.locator('[data-alert-id="watch-invalid"] .alert-time-hint')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  await page.evaluate(() => { location.hash = '#/profil'; });
  await expect(page.locator('#view-profil')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/ui-warm/);
});

test('chronologie des reports : reprise prioritaire, echeance conservee et lecture temporaire', async ({ page }) => {
  await openAlerts(page);
  await page.evaluate(async () => {
    const { getAlerts, updateAlert } = await import('/state.js');
    await updateAlert({ ...getAlerts().find(alert => alert.id === 'a2'), snoozedUntil: '2026-11-20' });
    await updateAlert({ ...getAlerts().find(alert => alert.id === 'a1'), snoozedUntil: '2026-11-12' });
  });
  await reloadReady(page);
  const before = await snapshot(page);
  await page.locator('[data-filter="reportées"]').click();
  expect(await page.locator('.alert-timeline [data-alert-id]').evaluateAll(cards => cards.map(card => card.dataset.alertId)))
    .toEqual(['a1', 'a2']);
  await expect(page.locator('[data-alert-id="a1"] .alert-time-hint')).toHaveText('Reprise · Demain');
  await expect(page.locator('[data-alert-id="a1"] .alert-date')).toContainText('15/11/2026');
  await expect(page.locator('[data-alert-id="a1"] .alert-snooze-note')).toContainText('12/11/2026');
  await page.locator('#mark-alerts-read').click();
  await expect(page.locator('.alert-timeline .alert-card.is-read')).toHaveCount(2);
  expect(await snapshot(page)).toEqual(before);
  await reloadReady(page);
  await expect(page.locator('.alert-timeline .alert-card.is-read')).toHaveCount(0);
});

test('etat vide accompagne : ajout, recherche ou autre categorie sans ecriture ni fausse couverture', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openAlerts(page, '#/alertes', false);
  const empty = page.locator('.alerts-empty');
  const before = await snapshot(page);
  await expect(empty).toContainText('Seuls les rappels enregistrés');
  await empty.getByRole('button', { name: 'Ajouter un document', exact: true }).click();
  await expect(page.locator('#view-importer')).toBeVisible();
  await page.goBack();
  await expect(empty).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page.evaluate(async () => {
    const { addDocument } = await import('/state.js');
    await addDocument({ id: 'notice-sans-date', name: 'notice.txt', type: 'Texte', isLocal: true, content: 'Nettoyer le filtre.' });
  });
  await reloadReady(page);
  const withDocument = await snapshot(page);
  await empty.getByRole('button', { name: 'Rechercher une échéance', exact: true }).click();
  await expect(page.locator('#view-recherche')).toBeVisible();
  await page.goBack();
  await expect(empty).toBeVisible();
  expect(await snapshot(page)).toEqual(withDocument);
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('alerts', {
      id: 'rappel-sans-copie', title: 'Contrat à prévoir', detail: 'Rappel de test.', dueDate: '2026-11-15',
      docId: 'absent', type: 'amber', status: 'active'
    });
  });
  await reloadReady(page);
  const withAlert = await snapshot(page);
  await empty.getByRole('button', { name: 'Voir « À anticiper »', exact: true }).click();
  await expect(page.locator('[data-filter="à-anticiper"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-alert-id="rappel-sans-copie"]').getByRole('button', { name: /Voir mes fichiers/ }).click();
  await expect(page.locator('#view-vos-donnees')).toBeVisible();
  await expect(page.locator('#source-dialog')).toBeHidden();
  expect(await snapshot(page)).toEqual(withAlert);
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
    const colors = [...root.querySelectorAll('.alert-header h3, .alert-state, .alert-date, p, summary, button')];
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
