import { test, expect } from '@playwright/test';
import { stateModuleUrl } from './helpers/app-state.js';

async function openAssistant(page) {
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/assistant');
  await ready;
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

async function expectUsable(panel) {
  expect(await panel.evaluate(root => ({
    small: [...root.querySelectorAll('button, input:not([type=hidden]), summary')]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && (rect.width < 47.5 || rect.height < 47.5);
      }).map(el => el.id || el.textContent.trim()),
    overflow: root.scrollWidth > root.clientWidth + 1
  }))).toEqual({ small: [], overflow: false });
}

async function seedDocuments(page, entries) {
  await page.evaluate(async entries => {
    const { put } = await import('/db.js');
    const { createContentProvenance } = await import('/content-index.js');
    for (const entry of entries) {
      const doc = { type: 'Texte', isLocal: true, ...entry };
      if (doc.content) doc.contentProvenance = await createContentProvenance(doc, [doc.content], 'local-text');
      await put('documents', doc);
    }
  }, entries);
  await reloadReady(page);
}

for (const width of [390, 768, 1280, 1920]) {
  test(`assistant et aperçu du scan accessibles sans écriture à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openAssistant(page);
    await expect(page.locator('body')).toHaveClass(/ui-theme/);
    await expect(page.locator('body')).toHaveClass(/ui-warm/);
    await expect(page.locator('#assistant-context')).toContainText('exemples fictifs');
    await expect(page.locator('#assistant-chat')).toHaveAccessibleName("Conversation avec l'assistant");
    const form = await page.locator('#assistant-form').boundingBox();
    const main = await page.locator('.main-content').boundingBox();
    expect(form.y + form.height).toBeLessThanOrEqual(main.y + main.height);
    await expectUsable(page.locator('#view-assistant'));
    const before = await snapshot(page);
    const external = [];
    page.on('request', request => {
      if (request.url().startsWith('https://')) external.push(request.url());
    });

    await page.locator('.assistant-ideas > summary').focus();
    await page.keyboard.press('Enter');
    await expectUsable(page.locator('#view-assistant'));
    await page.locator('.assistant-suggestion-chip').first().click();
    const input = page.locator('#assistant-input');
    await expect(input).toHaveValue("Quel est le montant de ma facture d'électricité ?");
    await expect(input).toBeFocused();
    await expect(page.locator('#experimental-index-query')).toBeEmpty();
    await expect(page.locator('.chat-message')).toHaveCount(1);
    await input.fill('Combien ai-je payé pour ma piscine ?');
    await input.press('Enter');
    await expect(page.locator('.chat-message')).toHaveCount(3);
    await expect(page.locator('.chat-message.ai').last()).toContainText('8 900');
    await expect(page.locator('.assistant-source').first()).toContainText('document fictif');
    await expect(input).toBeFocused();
    const copy = page.locator('.assistant-source').first().getByRole('button', { name: /Voir la copie de/ });
    await copy.click();
    await expect(page.locator('#source-dialog')).toBeVisible();
    await expect(page.locator('#dialog-content')).toContainText(/exemple fictif/i);
    await page.keyboard.press('Escape');
    await expect(copy).toBeFocused();
    await expectUsable(page.locator('#view-assistant'));
    await page.locator('.assistant-limits > summary').click();
    await expect(page.locator('.assistant-limits')).toContainText('sans IA distante ni synthèse de plusieurs documents');
    await expectUsable(page.locator('#view-assistant'));
    await page.locator('#assistant-form').scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => {
      const main = document.querySelector('.main-content');
      main.scrollTop = main.scrollHeight;
      window.scrollTo(0, document.scrollingElement.scrollHeight);
      const lastAction = [...document.querySelectorAll('.assistant-next-question')].at(-1).getBoundingClientRect();
      const bounds = main.getBoundingClientRect();
      return {
        overflow: document.scrollingElement.scrollHeight - innerHeight,
        outer: window.scrollY, bottomVisible: lastAction.bottom <= bounds.bottom && lastAction.top >= bounds.top
      };
    });
    expect(scroll.overflow).toBeLessThanOrEqual(1);
    expect(scroll.outer).toBe(0);
    expect(scroll.bottomVisible).toBe(true);
    await page.locator('.assistant-next-question').last().click();
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();

    // This dormant preview has no application entry point or scan handler.
    await input.focus();
    await page.locator('#onboarding-scan-dialog').evaluate(dialog => dialog.showModal());
    const preview = page.getByRole('dialog', { name: 'Indexation automatique', exact: true });
    await expect(preview.getByRole('button', { name: "Fermer l'aperçu du scan" })).toBeFocused();
    await expect(preview).toContainText("n'est pas relié à un scan fonctionnel");
    await expect(page.locator('#onboarding-dirs')).toBeDisabled();
    await expect(page.locator('#onboarding-auto-scan')).toBeDisabled();
    await expect(page.locator('#onboarding-auto-scan')).not.toBeChecked();
    await expectUsable(preview);
    await page.locator('#assistant-input').evaluate(input => input.focus());
    await expect(input).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(input).toBeFocused();
    await page.locator('#onboarding-scan-dialog').evaluate(dialog => dialog.showModal());
    await preview.getByRole('button', { name: "Fermer l'aperçu", exact: true }).click();
    await expect(preview).toBeHidden();
    await expect(input).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('fichiers locaux restaurés : preuve, nom littéral long, copie et conversation non persistée', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openAssistant(page);
  const name = `<b>Facture piscine & ${'archive'.repeat(22)}</b>.txt`;
  await seedDocuments(page, [{
    id: 'assistant-local', name,
    content: 'FACTURE PISCINE FICTIVE\nMontant total : 1 234 euros TTC <b>à vérifier</b>'
  }]);
  await expect(page.locator('#assistant-context')).toContainText('1 fichier chargé');
  const before = await snapshot(page);
  await page.locator('#assistant-input').fill('Combien ai-je payé pour la piscine ?');
  await page.locator('#assistant-input').press('Enter');
  const response = page.locator('.chat-message.ai').last();
  await expect(response).toContainText('1 234');
  await expect(response.locator('.assistant-response-label')).toContainText('EXTRAIT');
  await expect(response.locator('.assistant-source-name')).toHaveText(`Source : ${name}`);
  await expect(response.locator('.assistant-answer').first()).toHaveText('Montant total : 1 234 euros TTC <b>à vérifier</b>');
  await expect(response.locator('.assistant-evidence mark')).toHaveText('Montant total : 1 234 euros TTC <b>à vérifier</b>');
  expect(await response.locator('.assistant-source').evaluate(source => {
    const proof = source.querySelector('.assistant-evidence');
    const name = source.querySelector('.assistant-source-name');
    const action = source.querySelector('button');
    return Boolean(proof.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(name.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(response.locator('b')).toHaveCount(0);
  await expect(response.locator('.assistant-source')).toContainText('Fichier local');
  await expectUsable(page.locator('#view-assistant'));
  await response.getByRole('button', { name: `Voir la copie de ${name}`, exact: true }).click();
  await expect(page.locator('#dialog-content')).toContainText('1 234 euros');
  await expect(page.locator('#source-dialog')).toContainText("Ce n'est pas l'original");
  await page.keyboard.press('Escape');
  expect(await snapshot(page)).toEqual(before);
  await reloadReady(page);
  await expect(page.locator('.chat-message')).toHaveCount(1);
  await expect(page.locator('#assistant-input')).toBeEmpty();
  expect(await snapshot(page)).toEqual(before);
});

test('incertitude, métadonnées seules et saisie littérale ne deviennent pas des réponses inventées', async ({ page }) => {
  await openAssistant(page);
  await seedDocuments(page, [
    { id: 'assistant-a', name: 'Facture installation piscine.txt', content: 'FACTURE PISCINE\nMontant total : 1 000 euros TTC' },
    { id: 'assistant-b', name: 'Facture terrasse piscine.txt', content: 'FACTURE PISCINE\nMontant total : 2 000 euros TTC' }
  ]);
  const input = page.locator('#assistant-input');
  await input.fill('Quel montant ai-je payé pour la piscine ?');
  await input.press('Enter');
  await expect(page.locator('.chat-message.ai').last()).toContainText('ne peux pas retenir une réponse unique');
  await expect(page.locator('.chat-message.ai').last().locator('.assistant-source')).toHaveCount(2);
  const question = '<img src=x onerror=alert(1)> introuvable-519';
  await input.fill(question);
  await input.press('Enter');
  await expect(page.locator('.chat-message.user').last().locator('.assistant-answer')).toHaveText(question);
  await expect(page.locator('.chat-message.user img')).toHaveCount(0);
  await expect(page.locator('.chat-message.ai').last()).toContainText("n'ai pas trouvé");
  await expect(page.locator('.chat-message.ai').last().locator('.assistant-source')).toHaveCount(0);

  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', { id: 'assistant-metadata', name: 'Assurance drone.txt', type: 'Texte', isLocal: true, content: '' });
  });
  await reloadReady(page);
  await input.fill('Quand se termine mon assurance drone ?');
  await input.press('Enter');
  const metadataResponse = page.locator('.chat-message.ai').last();
  await expect(metadataResponse).toContainText('preuve suffisante');
  await expect(metadataResponse).toContainText('Assurance drone.txt');
  await expect(metadataResponse.getByRole('button', { name: /Voir la copie/ })).toHaveCount(0);
  await expect(metadataResponse.locator('.assistant-proof-missing')).toHaveText('Aucun extrait textuel disponible pour cette source.');
  await expect(metadataResponse.locator('mark')).toHaveCount(0);
  const before = await snapshot(page);
  await metadataResponse.getByRole('button', { name: 'Explorer dans Recherche', exact: true }).click();
  await expect(page.locator('#view-recherche')).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});

test('question blanche et erreur locale explicites, saisie conservée pour réessayer', async ({ page }) => {
  await openAssistant(page);
  await seedDocuments(page, [{ id: 'assistant-error', name: 'Facture piscine.txt', content: 'Montant total : 123 euros TTC' }]);
  const input = page.locator('#assistant-input');
  await input.fill('   ');
  await input.press('Enter');
  await expect(page.locator('#assistant-status')).toContainText('Saisissez une question');
  await expect(page.locator('.chat-message')).toHaveCount(1);
  await page.evaluate(async stateUrl => {
    const doc = (await import(stateUrl)).getDocuments()[0];
    const name = doc.name;
    Object.defineProperty(doc, 'name', {
      configurable: true,
      get() {
        Object.defineProperty(doc, 'name', { value: name, writable: true, configurable: true });
        throw new Error('Erreur de lecture fictive');
      }
    });
  }, await stateModuleUrl(page));
  await input.fill('Combien ai-je payé pour ma piscine ?');
  await input.press('Enter');
  await expect(page.locator('#assistant-status')).toContainText('n’a pas pu être préparée');
  await expect(input).toHaveValue('Combien ai-je payé pour ma piscine ?');
  await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(page.locator('.chat-message.ai').last()).toContainText('123 euros');
  await expect(input).toBeEmpty();
});

test('petite hauteur et navigation : champ atteignable et conversation conservée seulement dans la page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await openAssistant(page);
  const input = page.locator('#assistant-input');
  await input.fill('question fictive introuvable-519');
  await input.press('Enter');
  await expect(page.locator('.chat-message')).toHaveCount(3);
  await expect(page.locator('#assistant-question-hint')).toContainText('Chaque question est indépendante');
  const before = await snapshot(page);
  await page.locator('.chat-message.ai').last().getByRole('button', { name: 'Explorer dans Recherche', exact: true }).click();
  await expect(page.locator('#view-recherche')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#view-assistant')).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await expectUsable(page.locator('#view-assistant'));
  await page.getByRole('button', { name: 'Ouvrir la recherche unifiée' }).click();
  await expect(page.locator('#view-recherche')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#view-assistant')).toBeVisible();
  await expect(page.locator('.chat-message')).toHaveCount(3);
  await input.focus();
  await expect(input).toBeInViewport();
});

test('copie devenue indisponible : une ancienne réponse annonce le problème sans ouvrir un faux aperçu', async ({ page }) => {
  await openAssistant(page);
  await seedDocuments(page, [{ id: 'assistant-stale', name: 'Facture piscine.txt', content: 'Montant total : 123 euros TTC' }]);
  await page.locator('#assistant-input').fill('facture piscine');
  await page.locator('#assistant-input').press('Enter');
  const copy = page.locator('.assistant-source').first().getByRole('button', { name: /Voir la copie de/ });
  await expect(copy).toBeVisible();
  await page.evaluate(async stateUrl => {
    const doc = (await import(stateUrl)).getDocuments().find(doc => doc.id === 'assistant-stale');
    doc.content = '';
  }, await stateModuleUrl(page));
  await copy.click();
  await expect(page.locator('#assistant-status')).toContainText('n’est plus disponible');
  await expect(page.locator('#source-dialog')).toBeHidden();
});

test('texte modifié sans provenance valide : aucune réponse factuelle ni preuve inventée', async ({ page }) => {
  await openAssistant(page);
  await seedDocuments(page, [{ id: 'assistant-unverified', name: 'Facture piscine.txt', content: 'Montant total : 123 euros TTC' }]);
  await page.evaluate(async () => {
    const { getAll, put } = await import('/db.js');
    const document = (await getAll('documents'))[0];
    document.content = 'Montant total : 9 999 euros TTC';
    await put('documents', document);
  });
  await reloadReady(page);
  const before = await snapshot(page);
  const external = [];
  page.on('request', request => {
    if (request.url().startsWith('https://')) external.push(request.url());
  });
  await page.locator('#assistant-input').fill('Quel est le montant de ma piscine ?');
  await page.locator('#assistant-input').press('Enter');
  const response = page.locator('.chat-message.ai').last();
  await expect(response).toContainText('preuve suffisante');
  await expect(response.locator('.assistant-proof-missing')).toContainText("n'est pas vérifié");
  await expect(response.locator('.assistant-answer')).not.toContainText('9 999');
  await expect(response.locator('mark')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  expect(external).toEqual([]);
});

test("index partagé : sujet visible, recherche laissée intacte et réponses conservées sans changement de corpus", async ({ page }) => {
  await openAssistant(page);
  await seedDocuments(page, [{ id: 'assistant-common-index', name: 'Facture piscine.txt', content: 'Montant total : 321 euros TTC' }]);
  await page.evaluate(() => { location.hash = '#/recherche'; });
  await expect(page.locator('#view-recherche')).toBeVisible();
  await page.locator('#search-filters-panel > summary').click();
  await page.locator('#experimental-index-source').selectOption('drive');
  await page.locator('#experimental-index-query').fill('piscine');
  await page.locator('#experimental-index-query').press('Enter');
  const search = await page.locator('#experimental-index-results').innerHTML();
  const before = await snapshot(page);
  await page.evaluate(() => { location.hash = '#/assistant'; });
  await expect(page.locator('#view-assistant')).toBeVisible();
  await expect(page.locator('#assistant-context')).toContainText('Même index local que Recherche');
  for (let index = 0; index < 2; index += 1) {
    await page.locator('#assistant-input').fill('Quel montant pour la piscine ?');
    await page.locator('#assistant-input').press('Enter');
    await expect(page.locator('.chat-message.ai').last().locator('.assistant-answer')).toHaveText('Montant total : 321 euros TTC');
  }
  await expect(page.locator('.assistant-query').last()).toContainText('Sujet recherché : piscine');
  await expect(page.locator('.assistant-query').last()).toContainText('sans les filtres de Recherche');
  await expect(page.locator('.assistant-evidence mark')).toHaveCount(2);
  await expect(page.locator('#experimental-index-query')).toHaveValue('piscine');
  await expect(page.locator('#experimental-index-source')).toHaveValue('drive');
  expect(await page.locator('#experimental-index-results').innerHTML()).toEqual(search);
  expect(await snapshot(page)).toEqual(before);
});

test('suppression locale confirmée : les preuves sont retirées avant le rechargement prévu', async ({ page }) => {
  await openAssistant(page);
  await seedDocuments(page, [{ id: 'assistant-purge-proof', name: 'Facture piscine privée.txt', content: 'Montant total : 321 euros TTC' }]);
  await page.locator('#assistant-input').fill('Quel montant pour la piscine ?');
  await page.locator('#assistant-input').press('Enter');
  await expect(page.locator('.assistant-evidence mark')).toHaveText('Montant total : 321 euros TTC');
  await page.clock.install({ time: new Date('2026-11-18T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-18T10:00:01Z'));
  await page.evaluate(() => { location.hash = '#/vos-donnees'; });
  await expect(page.locator('#view-vos-donnees')).toBeVisible();
  await page.locator('#purge-all-data').click();
  await page.locator('#confirm-purge').click();
  await expect(page.locator('#purge-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('.assistant-response-label').last()).toHaveText('SOURCES À ACTUALISER');
  await expect(page.locator('.assistant-source')).toHaveCount(0);
  await expect(page.locator('.chat-message.ai').last()).not.toContainText('321 euros');
  await expect(page.locator('.chat-message.ai').last()).not.toContainText('Facture piscine privée');
});

async function seedReminder(page, estimated = false) {
  const dates = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    const due = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    date.setFullYear(date.getFullYear() - 1);
    return { due, purchase: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` };
  });
  const content = estimated
    ? `CERTIFICAT DE GARANTIE CHAUDIÈRE FICTIF\nDate d'achat : ${dates.purchase}\nDurée de garantie : 1 an`
    : `CERTIFICAT DE GARANTIE CHAUDIÈRE FICTIF\nFin de garantie : ${dates.due}`;
  await seedDocuments(page, [{ id: 'assistant-reminder', name: 'Garantie chaudière fictive.txt', content }]);
  return dates;
}

async function askReminder(page) {
  await page.locator('#assistant-input').fill('Quand se termine la garantie chaudière ?');
  await page.locator('#assistant-input').press('Enter');
  return page.locator('.assistant-alert-action').last().getByRole('button', { name: /Confirmer/ });
}

async function reminderProposal(page) {
  return page.evaluate(async stateUrl => {
    const { getDocuments } = await import(stateUrl);
    const { restoreContentSegments } = await import('/content-index.js');
    const { findDocumentDeadlines } = await import('/index-deadline-search.js');
    const { prepareDocumentAlertAction } = await import('/document-alert-action.js');
    const document = getDocuments().find(entry => entry.id === 'assistant-reminder');
    const record = document.indexRecord;
    const { segments } = await restoreContentSegments(document);
    const content = { sourceId: record.sourceId, accountRef: record.accountRef, itemId: record.itemId, segments };
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const candidate = findDocumentDeadlines([record], [content], today, 90).candidates[0];
    return prepareDocumentAlertAction(candidate, document, record, content, now);
  }, await stateModuleUrl(page));
}

test('rappel Assistant : consultation et annulation sans écriture, confirmation unique et choix préservés', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openAssistant(page);
  const { due } = await seedReminder(page);
  const before = await snapshot(page);
  const button = await askReminder(page);
  await expect(button).toBeVisible();
  await expectUsable(page.locator('#view-assistant'));
  expect(await snapshot(page)).toEqual(before);
  const proposal = await reminderProposal(page);
  page.once('dialog', dialog => dialog.dismiss());
  await button.click();
  await expect(page.locator('#assistant-status')).toContainText('laissée en proposition');
  expect(await snapshot(page)).toEqual(before);
  let confirmation;
  page.once('dialog', dialog => { confirmation = dialog.message(); return dialog.accept(); });
  await button.click();
  await expect(page.locator('#assistant-status')).toContainText('Échéance confirmée et alerte créée');
  expect(confirmation).toContain(`Preuve : « Fin de garantie : ${due} »`);
  expect(confirmation).toContain('L’original dans la source ne sera pas modifié');
  const committed = await snapshot(page);
  expect(committed[1][0]).toMatchObject({ expiryDate: due, expiryDateSource: 'user', expiryDateEstimated: false });
  expect(committed[4]).toHaveLength(1);
  expect(committed[4][0]).toMatchObject({ sourceId: 'local', sourceAccountRef: null, sourceReview: null, confidence: 'confirmed' });
  await expect(page.locator('.assistant-alert-action')).toHaveCount(0);
  const stateUrl = await stateModuleUrl(page);
  const repeated = await page.evaluate(async ({ stateUrl, proposal }) => {
    const { confirmDocumentDeadline, getAlerts, updateAlert } = await import(stateUrl);
    const alert = getAlerts()[0];
    await updateAlert({ ...alert, status: 'ignored', snoozedUntil: '2099-01-01', notificationSentFor: alert.dueDate });
    const results = await Promise.all([confirmDocumentDeadline(proposal), confirmDocumentDeadline(proposal)]);
    return { repeated: results.map(result => result.alreadyConfirmed), alerts: getAlerts() };
  }, { stateUrl, proposal });
  expect(repeated.repeated).toEqual([true, true]);
  expect(repeated.alerts).toHaveLength(1);
  expect(repeated.alerts[0]).toMatchObject({ status: 'ignored', snoozedUntil: '2099-01-01', notificationSentFor: due });
  await reloadReady(page);
  expect((await snapshot(page))[4][0]).toMatchObject({ status: 'ignored', sourceReview: null, dueDate: due });
  await page.evaluate(async () => { await (await import('/db.js')).remove('documents', 'assistant-reminder'); });
  const staleRepeat = await page.evaluate(async ({ stateUrl, proposal }) => {
    try { await (await import(stateUrl)).confirmDocumentDeadline(proposal); return null; }
    catch (error) { return error.message; }
  }, { stateUrl: await stateModuleUrl(page), proposal });
  expect(staleRepeat).toContain('a changé');
  expect((await snapshot(page))[1]).toHaveLength(0);
});

test('échec après les écritures avant commit : annulation complète et reprise sans confirmation partielle', async ({ page }) => {
  await openAssistant(page);
  await seedReminder(page, true);
  const before = await snapshot(page);
  const button = await askReminder(page);
  await expect(button).toHaveText('Confirmer l’estimation et créer l’alerte');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'documents') {
        request.addEventListener('success', () => { window.a4FirstWriteSucceeded = true; });
      }
      if (this.name === 'alerts') {
        IDBObjectStore.prototype.put = original;
        request.addEventListener('success', () => this.transaction.abort());
      }
      return request;
    };
  });
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#assistant-status')).toContainText('Échec de l\'enregistrement');
  expect(await page.evaluate(() => window.a4FirstWriteSucceeded)).toBe(true);
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(async stateUrl => {
    const state = await import(stateUrl);
    return { expiry: state.getDocuments()[0].expiryDateSource, alerts: state.getAlerts().length };
  }, await stateModuleUrl(page))).toEqual({ expiry: undefined, alerts: 0 });
  await expect(button).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.locator('#assistant-status')).toContainText('Échéance confirmée et alerte créée');
  const committed = await snapshot(page);
  expect(committed[1][0].expiryDateEstimated).toBe(true);
  expect(committed[4]).toHaveLength(1);
  await page.evaluate(() => { location.hash = '#/alertes'; });
  await expect(page.locator('[data-alert-card]')).toContainText('Date estimée');
});

test('confirmation concurrente et suppression externe : pas de doublon ni de résurrection', async ({ page }) => {
  await openAssistant(page);
  await seedReminder(page);
  const proposal = await reminderProposal(page);
  const stateUrl = await stateModuleUrl(page);
  const results = await page.evaluate(async ({ stateUrl, proposal }) => {
    const { confirmDocumentDeadline } = await import(stateUrl);
    return Promise.all([confirmDocumentDeadline(proposal), confirmDocumentDeadline(proposal)])
      .then(results => results.map(result => result.alreadyConfirmed));
  }, { stateUrl, proposal });
  expect(results).toEqual([false, true]);
  expect((await snapshot(page))[4]).toHaveLength(1);

  await page.evaluate(async () => {
    const { getAll, put } = await import('/db.js');
    const document = (await getAll('documents'))[0];
    delete document.expiryDateSource;
    delete document.expiryDate;
    delete document.expiryDateEvidence;
    delete document.alertType;
    delete document.indexRecord;
    await put('documents', document);
  });
  await reloadReady(page);
  const stale = await reminderProposal(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
      if (mode === 'readwrite' && Array.isArray(stores) && stores.includes('documents') && stores.includes('alerts')) {
        IDBDatabase.prototype.transaction = original;
        original.call(this, 'documents', 'readwrite').objectStore('documents').delete('assistant-reminder');
      }
      return original.call(this, stores, mode, ...rest);
    };
  });
  const error = await page.evaluate(async ({ stateUrl, proposal }) => {
    const { confirmDocumentDeadline } = await import(stateUrl);
    try { await confirmDocumentDeadline(proposal); return null; }
    catch (error) { return error.message; }
  }, { stateUrl: await stateModuleUrl(page), proposal: stale });
  expect(error).toContain('a changé');
  expect((await snapshot(page))[1]).toHaveLength(0);
});
