import { test, expect } from '@playwright/test';

async function openHousehold(page, view = 'famille') {
  await page.route('https://**/*', route => route.abort());
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto(`http://127.0.0.1:5179/#/${view}`);
  await ready;
}

async function reloadHousehold(page) {
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.reload();
  await ready;
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
    await expectUsable(page.locator('#view-maison'));
    await page.locator('#add-equipment-btn').click();
    await expect(page.locator('#eq-name-input')).toBeFocused();
    await expectUsable(page.locator('#equipment-dialog'));
    await page.keyboard.press('Escape');
    await expect(page.locator('#add-equipment-btn')).toBeFocused();
    await page.locator('[data-equipment="eq-piscine-pompe"]').click();
    await expect(page.locator('#detail-title')).toHaveText('Pompe Hayward Modèle 2022');
    await expectUsable(page.locator('#view-detail'));
    await page.locator('#edit-equipment').click();
    await expect(page.locator('#equipment-dialog-title')).toHaveText('Modifier un équipement');
    await page.keyboard.press('Escape');
    await expect(page.locator('#edit-equipment')).toBeFocused();
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
  await page.locator('#member-access-input').selectOption('limited');
  await expectUsable(page.locator('#add-member-dialog'));
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('#family-members-count')).toHaveText('6 membres');
  await expect(page.locator('#member-list')).toContainText(name);
  await expect(page.locator('#open-add-member-from-manager')).toBeFocused();
  const row = page.locator('.managed-member').filter({ hasText: name });
  await expectUsable(page.locator('#manage-members-dialog'));
  await row.locator('.edit-member-item').click();
  await expect(page.locator('#add-member-title')).toHaveText('Modifier un membre');
  await page.locator('#member-name-input').fill('Membre fictif');
  await page.locator('#member-birth-date-input').fill('2015-03-12');
  await page.locator('#member-access-input').selectOption('full');
  await page.locator('#add-member-form [type="submit"]').click();
  await expect(page.locator('.managed-member').filter({ hasText: 'Membre fictif' }).locator('.edit-member-item')).toBeFocused();
  await page.locator('#close-manage-members').click();
  await reloadHousehold(page);
  await expect(page.locator('#member-list')).toContainText('Membre fictif');
  expect(await page.evaluate(async () => {
    const { getFamilyMembers } = await import('/state.js');
    const member = getFamilyMembers().find(item => item.name === 'Membre fictif');
    return { role: member.role, access: member.access, birthDate: member.birthDate };
  })).toEqual({ role: 'Member', access: 'full', birthDate: '2015-03-12' });
  await page.locator('#manage-family-btn').click();
  const remove = page.locator('.managed-member').filter({ hasText: 'Membre fictif' }).locator('.delete-member-item');
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  await expect(remove).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect(page.locator('#family-members-count')).toHaveText('5 membres');
  await expect(page.locator('#open-add-member-from-manager')).toBeFocused();
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
  await expect(page.locator('.data-file-name')).toHaveText('Garantie - Pompe piscine.pdf');
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
