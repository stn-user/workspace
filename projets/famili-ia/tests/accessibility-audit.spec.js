import { test, expect } from '@playwright/test';

const views = ['accueil', 'recherche', 'maison', 'famille', 'alertes', 'assistant', 'importer', 'profil', 'vos-donnees'];
const viewports = [390, 768, 1280, 1920];
const interactive = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]';

async function openView(page, width, view) {
  await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
  await page.route('https://**/*', route => route.abort());
  await page.goto(`http://127.0.0.1:5179/#/${view}`);
  await page.waitForLoadState('networkidle');
}

function audit() {
  return ({ selector, minSize }) => {
    const label = el => {
      const labelled = el.getAttribute('aria-label') || el.getAttribute('title');
      const byId = el.getAttribute('aria-labelledby');
      const fromIds = byId ? byId.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') : '';
      const fromLabel = el.labels ? [...el.labels].map(l => l.textContent).join(' ') : '';
      return (labelled || fromIds || fromLabel || el.textContent || el.getAttribute('placeholder') || '').trim();
    };
    const visible = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0 && !el.closest('[hidden]');
    };
    const describe = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
    const small = [];
    const unnamed = [];
    for (const el of document.querySelectorAll(selector)) {
      const hiddenVisually = el.classList.contains('visually-hidden');
      if (!hiddenVisually && !visible(el)) continue;
      if (el.closest('[hidden]')) continue;
      const isToggle = el.matches('input[type=checkbox], input[type=radio]');
      const target = isToggle && el.closest('label') ? el.closest('label') : el;
      const rect = target.getBoundingClientRect();
      if (!hiddenVisually && (rect.width < minSize - 0.5 || rect.height < minSize - 0.5)) {
        small.push(`${describe(el)} ${Math.round(rect.width)}x${Math.round(rect.height)} « ${label(el).slice(0, 40)} »`);
      }
      if (!label(el)) unnamed.push(describe(el));
    }
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    return { small, unnamed, overflow };
  };
}

for (const width of viewports) {
  for (const view of views) {
    test(`accessibilité ${view} à ${width}px : cibles ≥ 48 px, noms et absence de débordement`, async ({ page }) => {
      await openView(page, width, view);
      const result = await page.evaluate(audit(), { selector: interactive, minSize: 48 });
      expect.soft(result.overflow, 'débordement horizontal').toBe(false);
      expect.soft(result.unnamed, 'contrôles sans nom accessible').toEqual([]);
      expect.soft(result.small, 'cibles inférieures à 48 px').toEqual([]);
    });
  }
}

test('mouvement réduit : transitions et animations neutralisées', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openView(page, 390, 'accueil');
  const slow = await page.evaluate(() => [...document.querySelectorAll('button, a, input, .view, .chip')]
    .filter(el => parseFloat(getComputedStyle(el).transitionDuration) > 0.01
      || parseFloat(getComputedStyle(el).animationDuration) > 0.01)
    .map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + el.className).slice(0, 10));
  expect(slow).toEqual([]);
});

test('clavier : le focus est visible et suit les contrôles de la navigation', async ({ page }) => {
  await openView(page, 1280, 'accueil');
  await page.keyboard.press('Tab');
  const outlines = new Set();
  for (let i = 0; i < 12; i += 1) {
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return { visible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2, name: el.tagName + (el.id ? '#' + el.id : '') + ' ' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) };
    });
    expect(focus, `focus perdu à la tabulation ${i + 1}`).not.toBeNull();
    expect(focus.visible, `focus invisible sur ${focus.name}`).toBe(true);
    outlines.add(focus.name);
    await page.keyboard.press('Tab');
  }
  expect(outlines.size).toBeGreaterThan(3);
});