import { test, expect } from '@playwright/test';

async function openHousehold(page, view = 'famille') {
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto(`http://127.0.0.1:5179/#/${view}`);
  await ready;
  await page.evaluate(async () => {
    const { put } = await import('/db.js');
    const members = [
      { id: 'u1', name: 'Profil principal fictif', role: 'Admin', avatar: 'P', access: 'full' },
      { id: 'u2', name: 'Profil fictif B', role: 'Member', avatar: 'B', access: 'limited' },
      { id: 'u3', name: 'Profil fictif C', role: 'Member', avatar: 'C', access: 'limited' },
      { id: 'u4', name: 'Profil fictif D', role: 'Member', avatar: 'D', access: 'limited' },
      { id: 'u5', name: 'Profil fictif E', role: 'Member', avatar: 'E', access: 'limited' }
    ];
    const equipment = [
      { id: 'eq-piscine-pompe', category: 'pompe', name: 'Pompe de piscine - modele fictif', status: 'Bon etat', docs: ['piscine-garantie'] },
      { id: 'eq-piscine-filtre', category: 'piscine', name: 'Filtre de piscine - modele fictif', status: 'A nettoyer', docs: ['maison-notice'] },
      { id: 'eq-imprimante', category: 'imprimante', name: 'Imprimante - modele fictif', status: 'Operationnelle', docs: ['imprimante-facture'] },
      { id: 'eq-assurance-hab', category: 'assurance', name: 'Contrat habitation fictif', status: 'Actif', docs: ['habitation-contrat'] }
    ];
    await Promise.all([
      ...members.map(member => put('family', member)),
      ...equipment.map(item => put('equipment', item))
    ]);
  });
  await reloadHousehold(page);
}

async function reloadHousehold(page) {
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
  expect(await panel.evaluate(root => {
    const undersized = [...root.querySelectorAll('button, input:not([type="hidden"]), select')]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && (rect.width < 47.5 || rect.height < 47.5);
      }).map(el => el.id || el.textContent);
    const rect = root.getBoundingClientRect();
    return {
      undersized,
      overflow: root.scrollWidth > root.clientWidth + 1,
      outside: rect.left < 0 || rect.right > innerWidth + 1
        || (root.tagName === 'DIALOG' && (rect.top < 0 || rect.bottom > innerHeight + 1))
    };
  })).toEqual({ undersized: [], overflow: false, outside: false });
}

for (const width of [390, 768, 1280, 1920]) {
  test(`foyer et modales partages a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    await openHousehold(page);
    await expect(page.locator('body')).toHaveClass(/ui-theme/);
    await expect(page.locator('body')).toHaveClass(/ui-warm/);
    await expect(page.locator('#family-members-count')).toHaveText('5 membres');
    await expectUsable(page.locator('#view-famille'));
    const manage = page.locator('#manage-family-btn');
    await manage.focus();
    await page.keyboard.press('Enter');
    await expectUsable(page.locator('#manage-members-dialog'));
    const add = page.locator('#open-add-member-from-manager');
    await add.click();
    await expect(page.locator('#member-name-input')).toBeFocused();
    await expectUsable(page.locator('#add-member-dialog'));
    await page.keyboard.press('Escape');
    await expect(add).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(manage).toBeFocused();
    await page.evaluate(() => { location.hash = '#/maison'; });
    await expect(page.locator('#house-title')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/ui-warm/);
    await expectUsable(page.locator('#view-maison'));
    const housePhoto = page.locator('.property-photo');
    await expect(housePhoto).toBeVisible();
    expect(await housePhoto.evaluate(async image => {
      await image.decode();
      return image.naturalWidth > 0;
    })).toBe(true);
    const pumpPhoto = page.locator('[data-equipment="eq-piscine-pompe"] img');
    await pumpPhoto.scrollIntoViewIfNeeded();
    expect(await pumpPhoto.evaluate(async image => {
      await image.decode();
      return image.naturalWidth > 0;
    })).toBe(true);
    await expect(page.locator('[data-equipment="eq-imprimante"] svg')).toBeVisible();
    await expect(page.locator('#view-maison')).toContainText("pas des photos de vos équipements");
    await page.locator('#add-equipment-btn').click();
    await expect(page.locator('#eq-name-input')).toBeFocused();
    await expectUsable(page.locator('#equipment-dialog'));
    await page.keyboard.press('Escape');
    await expect(page.locator('#add-equipment-btn')).toBeFocused();
    await page.locator('[data-equipment="eq-piscine-pompe"]').click();
    await expect(page.locator('#detail-title')).toHaveText('Pompe de piscine - modele fictif');
    await expect(page.locator('.equipment-overview')).toContainText("pas une photo de votre équipement");
    const detailPhoto = page.locator('.equipment-cover img');
    await detailPhoto.scrollIntoViewIfNeeded();
    expect(await detailPhoto.evaluate(async image => {
      await image.decode();
      return image.naturalWidth > 0;
    })).toBe(true);
    await expect(page.locator('#view-detail [data-demo-action]')).toHaveCount(0);
    await expectUsable(page.locator('#view-detail'));
    await page.locator('#edit-equipment').click();
    await expect(page.locator('#equipment-dialog-title')).toHaveText('Modifier un équipement');
    await page.keyboard.press('Escape');
    await expect(page.locator('#edit-equipment')).toBeFocused();
  });
}

test('maison vide : premier équipement accompagné et fiche absente sans contenu résiduel', async ({ page }) => {
    await page.route('https://**/*', route => route.abort());
    await page.setViewportSize({ width: 390, height: 844 });
    const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
    await page.goto('http://127.0.0.1:5179/#/maison');
    await ready;
    const snapshot = () => page.evaluate(async () => {
      const { getAll } = await import('/db.js');
      return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
    });
    const before = await snapshot();
    await expect(page.locator('#equipment-empty-title')).toHaveText('Votre carnet commence ici');
    await expect(page.locator('#show-all-equipment')).toBeHidden();
    await page.locator('#add-first-equipment').click();
    await expect(page.locator('#equipment-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#add-first-equipment')).toBeFocused();
    await page.evaluate(() => { location.hash = '#/detail'; });
    await expect(page.locator('#detail-title')).toHaveText('Équipement non trouvé');
    await expect(page.locator('#detail-breadcrumb')).toHaveText('Équipement');
    await page.getByRole('button', { name: 'Retour à la maison', exact: true }).click();
    await expect(page.locator('#equipment-empty')).toBeVisible();
    await expectUsable(page.locator('#view-maison'));
    expect(await snapshot()).toEqual(before);
  });

for (const width of [390, 1280]) {
    test(`fiche chaleureuse : papiers, rappels sourcés et reports sans écriture à ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'));
      await openHousehold(page, 'maison');
      await page.evaluate(async () => {
        const { put } = await import('/db.js');
        const { getEquipmentDetail } = await import('/state.js');
        await put('equipment', {
          ...getEquipmentDetail('eq-piscine-pompe'),
          status: '<b>À vérifier</b>',
          docs: ['notice-test', 'notice-absente']
        });
        await put('documents', {
          id: 'notice-test', name: 'Notice <b>pompe</b>.txt', isLocal: true,
          type: 'Texte', content: 'Nettoyer le filtre.'
        });
        for (const alert of [
          { id: 'rappel-fiche', title: '<b>Vérifier le filtre</b>', sourceReview: 'source-changed',
            sourceExcerpt: 'Preuve <img src=x> saisie', dueDate: '2027-01-15', docId: 'notice-test' },
          { id: 'rappel-reporte', title: 'Rappel reporté', dueDate: '2026-11-17',
            snoozedUntil: '2026-12-01', docId: 'notice-test' },
          { id: 'rappel-date-absente', title: 'Date à confirmer', dueDate: 'date invalide', docId: 'notice-absente' },
          { id: 'rappel-termine', title: 'Rappel terminé', status: 'resolved', docId: 'notice-test' },
          { id: 'rappel-autre', title: 'Rappel sans lien', docId: 'autre-document' }
        ]) await put('alerts', { status: 'active', source: 'manual', ...alert });
      });
      await reloadHousehold(page);
      const snapshot = () => page.evaluate(async () => {
        const { getAll } = await import('/db.js');
        return Promise.all(['users', 'documents', 'equipment', 'family', 'alerts'].map(getAll));
      });
      const before = await snapshot();
      await page.locator('[data-equipment="eq-piscine-pompe"]').click();
      await expect(page.locator('.equipment-specs')).toContainText('<b>À vérifier</b>');
      await expect(page.locator('.equipment-specs b')).toHaveCount(0);
      await expect(page.locator('.status-pill')).toHaveCount(0);
      await expect(page.locator('.equipment-documents')).toContainText('2 documents associés');
      await expect(page.locator('[data-doc-id="notice-test"]')).toContainText('Local · copie dans Famili-IA');
      await page.locator('[data-doc-id="notice-test"]').click();
      await expect(page.locator('#source-dialog')).toContainText('Nettoyer le filtre.');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-doc-id="notice-test"]')).toBeFocused();
      await page.locator('[data-doc-id="notice-absente"]').click();
      await expect(page.locator('#toast-message')).toHaveText("Ce document n'est pas disponible sur cet appareil.");
      const reminders = page.locator('.equipment-reminder');
      await expect(reminders).toHaveCount(3);
      const proofReminder = reminders.filter({ hasText: 'Vérifier le filtre' });
      await expect(proofReminder).toContainText('15/01/2027');
      await expect(proofReminder).toContainText('Source à vérifier');
      await expect(proofReminder.locator('blockquote')).toHaveText('Preuve <img src=x> saisie');
      await expect(proofReminder.locator('img, b')).toHaveCount(0);
      await expect(reminders.filter({ hasText: 'Date à confirmer' })).toContainText('date à vérifier');
      await expectUsable(page.locator('#view-detail'));
      await reminders.filter({ hasText: 'Rappel reporté' }).getByRole('button').click();
      await expect(page).toHaveURL(/filter=report/);
      await expect(page.locator('[data-alert-card]').filter({ hasText: 'Rappel reporté' })).toBeVisible();
      await expect(page.locator('body')).toHaveClass(/ui-warm/);
      await page.goBack();
      await page.getByRole('button', { name: 'Rechercher ses documents', exact: true }).click();
      await expect(page.locator('#experimental-index-query')).toHaveValue('Pompe de piscine - modele fictif');
      await page.goBack();
      await page.evaluate(() => { location.hash = '#/detail?id=absent'; });
      await expect(page.locator('#detail-title')).toHaveText('Équipement non trouvé');
      await expect(page.locator('#detail-breadcrumb')).toHaveText('Équipement');
      await expect(page.locator('.equipment-reminder')).toHaveCount(0);
      expect(await snapshot()).toEqual(before);
    });
}

test('membres : ajout, modification, roles, persistance et suppression confirmee', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await openHousehold(page);
  await page.locator('#manage-family-btn').click();
  await page.locator('.edit-member-item[data-id="u1"]').click();
  await page.locator('#member-name-input').fill('Admin fictif');
  await page.locator('#add-member-form [type="submit"]').click();
  expect(await page.evaluate(async () => {
    const { getFamilyMembers } = await import('/state.js');
    return getFamilyMembers().find(member => member.id === 'u1').role;
  })).toBe('Admin');
  await page.locator('#open-add-member-from-manager').click();
  const name = '<Test & Famille> ' + 'Long'.repeat(35);
  await page.locator('#member-name-input').fill(name);
  await expect(page.locator('#member-access-input')).toHaveCount(0);
  await expectUsable(page.locator('#add-member-dialog'));
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('#family-members-count')).toHaveText('6 membres');
  await expect(page.locator('#member-list')).toContainText(name);
  await expect(page.locator('#open-add-member-from-manager')).toBeFocused();
  const memberId = await page.evaluate(async name => {
    const { getFamilyMembers, addDocument } = await import('/state.js');
    const member = getFamilyMembers().find(item => item.name === name);
    await addDocument({
      id: 'family-photo', name: 'souvenir.jpg', type: 'Image', isLocal: true,
      photoAnnotations: {
        schemaVersion: 1, personIds: [member.id, 'u2'], eventTags: ['Jardin'],
        captureDateOverride: null, placeLabel: null, placeSource: null, source: 'user'
      }
    });
    return member.id;
  }, name);
  const row = page.locator('.managed-member').filter({ hasText: name });
  await expectUsable(page.locator('#manage-members-dialog'));
  await row.locator('.edit-member-item').click();
  await expect(page.locator('#add-member-title')).toHaveText('Modifier un membre');
  await page.locator('#member-name-input').fill('Membre fictif');
  await page.locator('#member-birth-date-input').fill('2015-03-12');
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('.managed-member').filter({ hasText: 'Membre fictif' }).locator('.edit-member-item')).toBeFocused();
  await page.locator('#close-manage-members').click();
  await reloadHousehold(page);
  await expect(page.locator('#member-list')).toContainText('Membre fictif');
  expect(await page.evaluate(async () => {
    const { getFamilyMembers } = await import('/state.js');
    const member = getFamilyMembers().find(item => item.name === 'Membre fictif');
    return { role: member.role, access: member.access, birthDate: member.birthDate, avatar: member.avatar };
  })).toEqual({ role: 'Member', access: 'limited', birthDate: '2015-03-12', avatar: 'M' });
  const photoMembers = () => page.evaluate(async () =>
    (await (await import('/db.js')).getAll('documents')).find(document => document.id === 'family-photo').photoAnnotations.personIds);
  expect(await photoMembers()).toEqual([memberId, 'u2']);
  await page.locator('#manage-family-btn').click();
  const remove = page.locator('.managed-member').filter({ hasText: 'Membre fictif' }).locator('.delete-member-item');
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  await expect(remove).toBeVisible();
  expect(await photoMembers()).toEqual([memberId, 'u2']);
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect(page.locator('#family-members-count')).toHaveText('5 membres');
  await expect(page.locator('#open-add-member-from-manager')).toBeFocused();
  expect(await photoMembers()).toEqual(['u2']);
});

test('cercle vide : ajout direct, annulation, nom explicite et erreur de stockage sans perte de saisie', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/famille');
  await ready;
  const before = await snapshot(page);
  const first = page.getByRole('button', { name: 'Ajouter un proche', exact: true });
  await expect(page.locator('.member-card')).toHaveCount(0);
  await first.click();
  await expect(page.locator('#member-name-input')).toBeFocused();
  await expect(page.locator('#member-access-input')).toHaveCount(0);
  await expectUsable(page.locator('#add-member-dialog'));
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
  await first.click();
  await page.locator('#member-name-input').fill('   ');
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('#member-form-status')).toContainText('Indiquez le nom');
  await expect(page.locator('#member-name-input')).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
  const name = 'Éléna & <famille>';
  await page.locator('#member-name-input').fill(`  ${name}  `);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'family') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Stockage de test indisponible', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('#member-form-status')).toContainText('Stockage de test indisponible');
  await expect(page.locator('#member-name-input')).toHaveValue(`  ${name}  `);
  expect(await snapshot(page)).toEqual(before);
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('#add-member-dialog')).toBeHidden();
  await expect(page.locator('#manage-family-btn')).toBeFocused();
  await expect(page.locator('.member-card h3')).toHaveText(name);
  await expect(page.locator('.member-card .member-avatar')).toHaveText('É');
  await reloadHousehold(page);
  await expect(page.locator('.member-card h3')).toHaveText(name);
  const saved = (await snapshot(page))[3];
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name, avatar: 'É', birthDate: null, role: 'Member', access: 'limited' });
});

test('cercle personnel : noms litteraux, avatars existants et metadonnees preserves sans faux droits', async ({ page }) => {
  await openHousehold(page);
  const name = '<Proche & Test> ' + 'Long'.repeat(30);
  await page.evaluate(async name => {
    const { getFamilyMembers } = await import('/state.js');
    const { put } = await import('/db.js');
    await put('family', {
      ...getFamilyMembers().find(member => member.id === 'u2'),
      name, avatar: '🌿', role: 'CustomRole', access: 'full', birthDate: '2011-06-02', customLabel: 'Repère choisi'
    });
    await put('family', { ...getFamilyMembers().find(member => member.id === 'u3'), name: 'Émile', avatar: '' });
  }, name);
  await reloadHousehold(page);
  const before = await snapshot(page);
  const card = page.locator('[data-family-member="u2"]');
  await expect(card.locator('h3')).toHaveText(name);
  await expect(card.locator('.member-avatar')).toHaveText('🌿');
  await expect(page.locator('[data-family-member="u3"] .member-avatar')).toHaveText('É');
  await expect(page.locator('[data-family-member="u1"] .member-you')).toHaveText('Vous');
  await expect(page.locator('#view-famille')).not.toContainText(/Accès complet|Accès limité|Mode urgence|CustomRole/);
  await expect(page.locator('#view-famille [data-demo-action]')).toHaveCount(0);
  await expectUsable(page.locator('#view-famille'));
  await page.locator('#manage-family-btn').click();
  await expect(page.locator('#manage-members-dialog')).not.toContainText(/Accès complet|Accès limité|CustomRole/);
  expect(await snapshot(page)).toEqual(before);
  await page.locator('.edit-member-item[data-id="u2"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.edit-member-item[data-id="u2"]')).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
  await page.locator('.edit-member-item[data-id="u2"]').click();
  await page.locator('#member-name-input').fill('Nouveau nom choisi');
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('.edit-member-item[data-id="u2"]')).toBeFocused();
  const after = await snapshot(page);
  expect(after[3].find(member => member.id === 'u2')).toEqual({
    ...before[3].find(member => member.id === 'u2'), name: 'Nouveau nom choisi'
  });
  for (const index of [0, 1, 2, 4]) expect(after[index]).toEqual(before[index]);
  await page.locator('#close-manage-members').click();
  await page.locator('.family-memories').getByRole('button', { name: 'Ouvrir Recherche', exact: true }).click();
  await expect(page.locator('#view-recherche')).toBeVisible();
  expect(await snapshot(page)).toEqual(after);
  await page.evaluate(() => { location.hash = '#/profil'; });
  await expect(page.locator('#view-profil')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/ui-warm/);
});

test('equipements : filtres, modification sans perte de documents et ajout persistant', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await openHousehold(page, 'maison?filter=pompe');
  await expect(page.locator('[data-house-category="pompe"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.equipment-row')).toHaveCount(1);
  await page.locator('.equipment-row').click();
  await page.locator('#edit-equipment').click();
  const name = '<Equipement & Test> ' + 'Long'.repeat(30);
  await page.locator('#eq-name-input').fill(name);
  await page.locator('#equipment-form [type="submit"]').click();
  await expect(page.locator('#detail-title')).toHaveText(name);
  await expect(page.locator('#edit-equipment')).toBeFocused();
  await expectUsable(page.locator('#view-detail'));
  await expect(page.locator('[data-doc-id="piscine-garantie"]')).toBeVisible();
  await reloadHousehold(page);
  await expect(page.locator('#detail-title')).toHaveText(name);
  await expect(page.locator('[data-doc-id="piscine-garantie"]')).toBeVisible();
  await page.locator('[data-doc-id="piscine-garantie"]').click();
  await expect(page.locator('#source-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/maison?filter=volets'; });
  await expect(page.locator('#equipment-empty')).toBeVisible();
  await page.locator('#show-all-equipment').click();
  await expect(page.locator('[data-house-category="tout"]')).toBeFocused();
  await expect(page.locator('.equipment-row')).toHaveCount(4);
  await page.locator('#add-equipment-btn').click();
  await page.locator('#eq-name-input').fill('Volet fictif');
  await page.locator('#eq-category-input').selectOption('volets');
  await page.locator('#eq-status-input').fill('A verifier');
  await expectUsable(page.locator('#equipment-dialog'));
  await page.locator('#equipment-form [type="submit"]').click();
  await page.locator('[data-house-category="volets"]').click();
  await reloadHousehold(page);
  await expect(page.locator('.equipment-row')).toHaveCount(1);
  await expect(page.locator('.equipment-row')).toContainText('Volet fictif');
  await page.locator('.equipment-row').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#delete-equipment').click();
  await expect(page.locator('#view-detail')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#delete-equipment').click();
  await expect(page.locator('#view-maison')).toBeVisible();
  await expect(page.locator('.equipment-row')).toHaveCount(4);
});

test('filtres valides et invalides, historique et raccourcis documentaires', async ({ page }) => {
  await openHousehold(page, 'maison?filter=inconnu');
  await expect(page.locator('[data-house-category="tout"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.equipment-row')).toHaveCount(4);
  await page.locator('[data-house-category="pompe"]').click();
  await page.locator('[data-house-category="assurance"]').click();
  await page.goBack();
  await expect(page.locator('[data-house-category="pompe"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.equipment-row')).toHaveCount(1);
  await page.evaluate(() => { location.hash = '#/famille'; });
  await page.getByRole('button', { name: 'Garanties', exact: false }).click();
  await expect(page.locator('.data-file-name')).toHaveText('Fictif - garantie pompe piscine.pdf');
  await page.goBack();
  await page.getByRole('button', { name: 'Voir tout', exact: true }).click();
  await expect(page.locator('.data-file-name')).toHaveCount(5);
});

test('equipement absent : erreur explicite sans fermeture ni faux succes', async ({ page }) => {
  await openHousehold(page, 'detail?id=eq-piscine-pompe');
  await page.locator('#edit-equipment').click();
  await page.evaluate(async () => {
    const { deleteEquipment } = await import('/state.js');
    await deleteEquipment('eq-piscine-pompe');
  });
  await page.locator('#equipment-form [type="submit"]').click();
  await expect(page.locator('#equipment-form-status')).toHaveText("Cet équipement n'existe plus.");
  await expect(page.locator('#equipment-dialog')).toBeVisible();
});
