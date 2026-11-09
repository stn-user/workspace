import { test, expect } from '@playwright/test';

test('recherche locale et Drive simulé, puis purge sans résultats résiduels', async ({ page }) => {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://localhost:5179/#/recherche');
  await ready;
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', {
      id: 'drive-test-index', name: 'Facture Drive.txt', type: 'Texte',
      date: 'Date inconnue', isLocal: true, driveSource: true,
      content: 'Contenu fictif', keywords: '', summary: ''
    });
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;
  await page.locator('#local-files-input').setInputFiles({
    name: 'Facture locale.txt', mimeType: 'text/plain', buffer: Buffer.from('Contenu fictif')
  });
  await expect(page.locator('#scan-progress-text')).toHaveText('Indexation terminée : 1/1 fichiers indexés');
  await page.locator('#experimental-index-query').fill('facture');
  await page.locator('#experimental-index-form button').click();
  const entries = page.locator('#experimental-index-results li');
  await expect(entries).toHaveCount(2);
  await expect(entries.filter({ hasText: 'Facture locale.txt' })).toContainText('Local');
  await expect(entries.filter({ hasText: 'Facture Drive.txt' })).toContainText('Google Drive');
  await expect(page.locator('#experimental-source-status')).toContainText('1 fichier présent dans Famili-IA');
  await expect(page.locator('#experimental-source-status')).toContainText('accès actuel');
  await page.evaluate(() => { location.hash = '#/vos-donnees'; });
  await page.locator('#purge-all-data').click();
  await page.locator('#confirm-purge').click();
  await expect(page.locator('#purge-status')).toContainText('supprimées');
  await expect(entries).toHaveCount(0);
});

test('texte local extrait et preuve littérale conservés après redémarrage', async ({ page }) => {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://localhost:5179/#/recherche');
  await ready;
  await page.locator('#local-files-input').setInputFiles({
    name: 'contrat-test.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Impossible de résilier avant décembre. <img src=x onerror=alert(1)>')
  });
  await expect(page.locator('#scan-progress-text')).toHaveText('Indexation terminée : 1/1 fichiers indexés');
  await page.locator('#experimental-index-query').fill('résilier');
  await page.locator('#experimental-index-form button').click();
  const entries = page.locator('#experimental-index-results li');
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Impossible de résilier');
  await expect(entries.first()).toContainText('<img src=x onerror=alert(1)>');
  await expect(entries.locator('img')).toHaveCount(0);
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', {
      id: 'legacy-test', name: 'ancien.txt', isLocal: true,
      content: 'motancienunique', keywords: '', summary: ''
    });
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;
  await page.locator('#experimental-index-query').fill('résilier');
  await page.locator('#experimental-index-form button').click();
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Impossible de résilier');
  await expect(entries.locator('img')).toHaveCount(0);
  await page.locator('#experimental-index-query').fill('motancienunique');
  await page.locator('#experimental-index-form button').click();
  await expect(entries).toHaveCount(0);
  await page.locator('#experimental-index-query').fill('ancien.txt');
  await page.locator('#experimental-index-form button').click();
  await expect(entries).toHaveCount(1);
});

test('fiches de résultat, copie locale et original non vérifié', async ({ page }) => {
  await page.goto('http://localhost:5179/#/recherche');
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await put('documents', {
      id: 'drive-result-test', name: 'contrat-unique-drive.txt', type: 'Texte',
      date: '9 oct. 2026', content: '<img src=x onerror=alert(1)>',
      isLocal: true, driveSource: true, keywords: '', summary: ''
    });
    await put('documents', {
      id: 'local-result-test', name: 'contrat-unique-local.txt', type: 'Texte',
      date: 'Session locale', sourceDir: 'Dossier/contrat-unique-local.txt',
      isLocal: true, keywords: '', summary: ''
    });
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;
  await page.locator('#experimental-index-query').fill('contrat-unique');
  await page.locator('#experimental-index-form button').click();
  const results = page.locator('#experimental-index-results');
  const drive = results.locator('li').filter({ hasText: 'contrat-unique-drive.txt' });
  const local = results.locator('li').filter({ hasText: 'contrat-unique-local.txt' });
  await expect(drive).toContainText('Modification selon Google Drive : 9 oct. 2026');
  await expect(drive).toContainText("son accès n'a pas été vérifié");
  await expect(local).toContainText('Emplacement enregistré : Dossier/contrat-unique-local.txt');
  await expect(local).toContainText('Date : non disponible');
  await expect(local).toContainText('Copie textuelle indisponible');
  await expect(local.getByRole('button', { name: 'Voir la copie dans Famili-IA' })).toHaveCount(0);
  await drive.getByRole('button', { name: 'Voir la copie dans Famili-IA' }).click();
  const dialog = page.locator('#source-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Ce n'est pas l'original");
  await expect(dialog.locator('#dialog-content')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(dialog.locator('img')).toHaveCount(0);
});

test('preuve de contenu et détail photo sans ouverture de l’original', async ({ page }) => {
  await page.goto('http://localhost:5179/#/recherche');
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    const { createContentProvenance } = await import('/content-index.js');
    const doc = { id: 'local-proof-test', name: 'preuve-test.txt', type: 'Texte',
      date: 'Session locale', content: 'Assurance unique <b>preuve</b>',
      isLocal: true, keywords: '', summary: '' };
    doc.contentProvenance = await createContentProvenance(doc, [doc.content], 'local-text');
    await put('documents', doc);
    await put('documents', { id: 'local-photo-test', name: 'photo-unique.jpg', type: 'Image',
      date: 'Session locale', isLocal: true, keywords: '', summary: '' });
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;
  await page.locator('#experimental-index-query').fill('assurance');
  await page.locator('#experimental-index-form button').click();
  const result = page.locator('#experimental-index-results li');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Assurance unique <b>preuve</b>');
  await expect(result.locator('b')).toHaveCount(0);
  await page.locator('#experimental-index-query').fill('photo-unique');
  await page.locator('#experimental-index-form button').click();
  await result.getByRole('button', { name: 'Voir le détail de la photo' }).click();
  const dialog = page.locator('#photo-detail-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('photo-unique.jpg');
  await expect(dialog).toContainText("ne peut pas le rouvrir");
});

test('propositions sourcées restaurées sans modifier les alertes', async ({ page }) => {
  await page.goto('http://localhost:5179/#/recherche');
  const dueDate = await page.evaluate(async () => {
    const { put } = await import('/db.js');
    const { createContentProvenance } = await import('/content-index.js');
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (const drive of [false, true]) {
      const doc = { id: drive ? 'drive-deadline-test' : 'local-deadline-test',
        name: drive ? 'garantie-drive-test.txt' : 'garantie-local-test.txt',
        type: 'Texte', date: 'Date inconnue', isLocal: true, driveSource: drive,
        content: `Échéance : ${date}`, keywords: '', summary: '' };
      doc.contentProvenance = await createContentProvenance(doc, [doc.content], drive ? 'drive-text' : 'local-text');
      await put('documents', doc);
    }
    await put('documents', { id: 'legacy-deadline-test', name: 'ancienne-garantie.txt',
      type: 'Texte', isLocal: true, content: `Échéance : ${date}`, keywords: '', summary: '' });
    return date;
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;
  const alertsBefore = await page.evaluate(async () => (await import('/state.js')).getAlerts());
  const candidates = page.locator('#experimental-deadline-results li');
  await expect(candidates).toHaveCount(2);
  await expect(candidates.filter({ hasText: 'garantie-local-test.txt' })).toContainText('Source : Local');
  await expect(candidates.filter({ hasText: 'garantie-drive-test.txt' })).toContainText('Source : Google Drive');
  await expect(candidates.first()).toContainText(`Échéance : ${dueDate}`);
  await expect(page.locator('#experimental-deadline-review-list')).toContainText('ancienne-garantie.txt');
  await page.locator('#experimental-deadline-refresh').click();
  const alertsAfter = await page.evaluate(async () => (await import('/state.js')).getAlerts());
  expect(alertsAfter).toEqual(alertsBefore);
  await candidates.first().getByRole('button', { name: 'Voir la copie dans Famili-IA' }).click();
  await expect(page.locator('#source-dialog')).toContainText(`Échéance : ${dueDate}`);
  await expect(page.locator('#source-dialog')).toContainText("Ce n'est pas l'original");
});
