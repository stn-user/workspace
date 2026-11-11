import { test, expect } from '@playwright/test';

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
    await expect(input).toHaveValue('Combien ai-je payé pour ma piscine ?');
    await expect(input).toBeFocused();
    await expect(page.locator('#experimental-index-query')).toBeEmpty();
    await expect(page.locator('.chat-message')).toHaveCount(1);
    await input.press('Enter');
    await expect(page.locator('.chat-message')).toHaveCount(3);
    await expect(page.locator('.chat-message.ai').last()).toContainText('8 900');
    await expect(page.locator('.assistant-source').first()).toContainText('document fictif');
    await expect(input).toBeFocused();
    const copy = page.locator('.assistant-source').first().getByRole('button', { name: /Voir la copie de/ });
    await copy.click();
    await expect(page.locator('#source-dialog')).toBeVisible();
    await expect(page.locator('#dialog-content')).toContainText('Exemple fictif');
    await page.keyboard.press('Escape');
    await expect(copy).toBeFocused();
    await expectUsable(page.locator('#view-assistant'));

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
    content: 'FACTURE PISCINE FICTIVE\nMontant total : 1 234 euros TTC'
  }]);
  await expect(page.locator('#assistant-context')).toContainText('1 fichier chargé');
  const before = await snapshot(page);
  await page.locator('#assistant-input').fill('Combien ai-je payé pour la piscine ?');
  await page.locator('#assistant-input').press('Enter');
  const response = page.locator('.chat-message.ai').last();
  await expect(response).toContainText('1 234');
  await expect(response.locator('.assistant-response-label')).toContainText('EXTRAIT');
  await expect(response.locator('.assistant-source-name')).toHaveText(`Source : ${name}`);
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
});

test('question blanche et erreur locale explicites, saisie conservée pour réessayer', async ({ page }) => {
  await openAssistant(page);
  await seedDocuments(page, [{ id: 'assistant-error', name: 'Facture piscine.txt', content: 'Montant total : 123 euros TTC' }]);
  const input = page.locator('#assistant-input');
  await input.fill('   ');
  await input.press('Enter');
  await expect(page.locator('#assistant-status')).toContainText('Saisissez une question');
  await expect(page.locator('.chat-message')).toHaveCount(1);
  await page.evaluate(async () => {
    const doc = (await import('/state.js')).getDocuments()[0];
    const name = doc.name;
    Object.defineProperty(doc, 'name', {
      configurable: true,
      get() {
        Object.defineProperty(doc, 'name', { value: name, writable: true, configurable: true });
        throw new Error('Erreur de lecture fictive');
      }
    });
  });
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
  await page.evaluate(async () => {
    const doc = (await import('/state.js')).getDocuments().find(doc => doc.id === 'assistant-stale');
    doc.content = '';
  });
  await copy.click();
  await expect(page.locator('#assistant-status')).toContainText('n’est plus disponible');
  await expect(page.locator('#source-dialog')).toBeHidden();
});
