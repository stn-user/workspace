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

test('filtres multi-sources disponibles par source, type, couverture, date, personne et lieu', async ({ page }) => {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://localhost:5179/#/recherche');
  await ready;
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    const { createContentProvenance } = await import('/content-index.js');
    const { createIndexRecord } = await import('/index-record.js');
    const photo = {
      id: 'filters-photo',
      name: 'Souvenir vacances.jpg',
      type: 'Image',
      isLocal: true,
      content: 'Souvenir vacances en famille'
    };
    photo.contentProvenance = await createContentProvenance(
      photo, [photo.content], 'local-text'
    );
    photo.indexRecord = createIndexRecord('local', photo.id, {
      type: 'photo',
      name: { value: photo.name, source: 'provider' },
      dates: { priseDeVue: { value: '2024-07-14', source: 'provider' } },
      coverage: 'partial',
      fields: [
        { name: 'personIds', value: 'member-filter-test', source: 'user-input' },
        { name: 'place', value: 'Québec', source: 'user-input' }
      ]
    });
    const drive = {
      id: 'filters-drive',
      name: 'Souvenir contrat.txt',
      type: 'Texte',
      isLocal: true,
      driveSource: true,
      content: ''
    };
    drive.indexRecord = createIndexRecord('drive', drive.id, {
      type: 'document',
      name: { value: drive.name, source: 'provider' },
      dates: { modification: { value: '2024-07-14', source: 'provider' } },
      coverage: 'metadata'
    });
    await Promise.all([put('documents', photo), put('documents', drive)]);
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;

  await page.locator('#experimental-index-query').fill('souvenir');
  await page.locator('#experimental-index-form button[type="submit"]').click();
  const results = page.locator('#experimental-index-results li');
  await expect(results).toHaveCount(2);

  await page.locator('#experimental-index-source').selectOption('local');
  await page.locator('#experimental-index-type').selectOption('photo');
  await page.locator('#experimental-index-coverage').selectOption('partial');
  await page.locator('#experimental-index-date-type').selectOption('priseDeVue');
  await page.locator('#experimental-index-date-from').fill('2024-07-01');
  await page.locator('#experimental-index-date-to').fill('2024-07-31');
  await page.locator('#experimental-index-person').selectOption('member-filter-test');
  await page.locator('#experimental-index-place').selectOption({ label: 'Québec' });
  await page.locator('#experimental-index-form button[type="submit"]').click();
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('Souvenir vacances.jpg');
  await expect(results.first()).toContainText('Prise de vue : 2024-07-14');
});

test('rapproche les noms identiques sans fusionner les copies ni leurs sources', async ({ page }) => {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://localhost:5179/#/recherche');
  await ready;
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    await Promise.all([
      put('documents', {
        id: 'duplicate-local', name: 'Contrat maison.pdf', type: 'PDF',
        isLocal: true, content: '', keywords: '', summary: ''
      }),
      put('documents', {
        id: 'duplicate-drive', name: 'Contrat maison.pdf', type: 'PDF',
        isLocal: true, driveSource: true, content: '', keywords: '', summary: ''
      })
    ]);
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;

  await page.locator('#experimental-index-query').fill('contrat maison');
  await page.locator('#experimental-index-form button[type="submit"]').click();
  const group = page.locator('#experimental-index-results .experimental-result-duplicate-group');
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('Rapprochement à vérifier');
  await expect(group).toContainText('Local');
  await expect(group).toContainText('Google Drive');
  await expect(group.locator('.experimental-result')).toHaveCount(2);
  await expect(group).toContainText("aucune fusion n'a été effectuée");
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

test('une alerte sourcée nécessite une confirmation explicite et conserve le choix utilisateur', async ({ page }) => {
  await page.goto('http://localhost:5179/#/recherche');
  const dates = await page.evaluate(async () => {
    const { put } = await import('/db.js');
    const { createContentProvenance } = await import('/content-index.js');
    const dateAfter = offset => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const dates = [dateAfter(5), dateAfter(6), dateAfter(7), dateAfter(8)];
    for (const [index, id] of ['confirm-deadline', 'cancel-deadline', 'sentence-deadline', 'estimated-deadline'].entries()) {
      let content = `CERTIFICAT DE GARANTIE\nFin de garantie : ${dates[index]}`;
      if (id === 'sentence-deadline') {
        content = `CERTIFICAT DE GARANTIE\nDate d'achat pergola au 15/11/2025 et date de fin de garantie au ${dates[index]}`;
      } else if (id === 'estimated-deadline') {
        const purchaseDate = new Date(`${dates[index]}T12:00:00`);
        purchaseDate.setFullYear(purchaseDate.getFullYear() - 1);
        const purchaseDateText = `${String(purchaseDate.getDate()).padStart(2, '0')}/${String(purchaseDate.getMonth() + 1).padStart(2, '0')}/${purchaseDate.getFullYear()}`;
        content = `CERTIFICAT DE GARANTIE\nDate d'achat : ${purchaseDateText}\nDurée de garantie : 1 an`;
      }
      const document = {
        id, name: `${id}.txt`, type: 'Texte', isLocal: true,
        content, keywords: '', summary: ''
      };
      document.contentProvenance = await createContentProvenance(document, [content], 'local-text');
      await put('documents', document);
    }
    return dates;
  });
  const initialized = page.waitForEvent('console', message => message.text().includes('dialogs initialized'));
  await page.reload();
  await initialized;

  const results = page.locator('#experimental-deadline-results li');
  const confirmed = results.filter({ hasText: 'confirm-deadline.txt' });
  const cancelled = results.filter({ hasText: 'cancel-deadline.txt' });
  const sentence = results.filter({ hasText: 'sentence-deadline.txt' });
  const estimated = results.filter({ hasText: 'estimated-deadline.txt' });
  await expect(confirmed.getByRole('button', { name: 'Confirmer la date et créer l’alerte' })).toBeVisible();
  await expect(cancelled.getByRole('button', { name: 'Confirmer la date et créer l’alerte' })).toBeVisible();
  await expect(sentence.getByRole('button', { name: 'Confirmer la date et créer l’alerte' })).toBeVisible();
  await expect(estimated).toContainText('Échéance estimée');
  await expect(estimated.getByRole('button', { name: 'Confirmer l’estimation et créer l’alerte' })).toBeVisible();
  await expect(sentence).toContainText("Date d'achat pergola au 15/11/2025 et date de fin de garantie au");

  page.once('dialog', dialog => dialog.accept());
  await confirmed.getByRole('button', { name: 'Confirmer la date et créer l’alerte' }).click();
  await expect(page.locator('#experimental-deadline-status')).toContainText('Échéance confirmée et alerte créée');
  const persisted = await page.evaluate(async () => {
    const database = await import('/db.js');
    return {
      alert: (await database.getAll('alerts')).find(alert => alert.docId === 'confirm-deadline'),
      document: (await database.getAll('documents')).find(document => document.id === 'confirm-deadline')
    };
  });
  expect(persisted.alert, JSON.stringify(persisted)).toMatchObject({
    source: 'document', sourceId: 'local', sourceExcerpt: `Fin de garantie : ${dates[0]}`,
    dueDate: dates[0], documentType: 'garantie', confidence: 'confirmed'
  });
  expect(persisted.document).toMatchObject({
    expiryDate: dates[0], expiryDateEvidence: `Fin de garantie : ${dates[0]}`,
    expiryDateSource: 'user', alertSourceId: 'local'
  });
  await expect(confirmed).toHaveCount(0);

  page.once('dialog', dialog => dialog.dismiss());
  await cancelled.getByRole('button', { name: 'Confirmer la date et créer l’alerte' }).click();
  await expect(page.locator('#experimental-deadline-status')).toContainText('laissée en proposition');
  const rejected = await page.evaluate(async () => {
    const database = await import('/db.js');
    return {
      alert: (await database.getAll('alerts')).find(alert => alert.docId === 'cancel-deadline'),
      document: (await database.getAll('documents')).find(document => document.id === 'cancel-deadline')
    };
  });
  expect(rejected.alert).toBeUndefined();
  expect(rejected.document.expiryDateSource).toBeUndefined();

  let estimateConfirmation = '';
  page.once('dialog', dialog => {
    estimateConfirmation = dialog.message();
    dialog.accept();
  });
  await estimated.getByRole('button', { name: 'Confirmer l’estimation et créer l’alerte' }).click();
  expect(estimateConfirmation).toContain('estimation');
  const estimatePersisted = await page.evaluate(async () => {
    const database = await import('/db.js');
    return {
      alert: (await database.getAll('alerts')).find(alert => alert.docId === 'estimated-deadline'),
      document: (await database.getAll('documents')).find(document => document.id === 'estimated-deadline')
    };
  });
  const estimateEvidence = estimatePersisted.document.content
    .split(/\r\n|\n|\r/)
    .slice(1)
    .join('\n');
  expect(estimatePersisted.alert).toMatchObject({
    source: 'document', sourceId: 'local', sourceExcerpt: estimateEvidence,
    dueDate: dates[3], documentType: 'garantie', confidence: 'confirmed'
  });
  expect(estimatePersisted.document).toMatchObject({
    expiryDate: dates[3], expiryDateEvidence: estimateEvidence,
    expiryDateSource: 'user', alertSourceId: 'local'
  });

  await page.evaluate(() => { location.hash = '#/alertes'; });
  const alertCard = page.locator('[data-alert-card]').filter({ hasText: 'confirm-deadline.txt' });
  await expect(alertCard).toContainText('Source — Local');
  await expect(alertCard).toContainText(`Fin de garantie : ${dates[0]}`);
  const estimateAlertCard = page.locator('[data-alert-card]').filter({ hasText: 'estimated-deadline.txt' });
  await expect(estimateAlertCard).toContainText("Date d'achat");
  await expect(estimateAlertCard).toContainText('Durée de garantie : 1 an');
});
