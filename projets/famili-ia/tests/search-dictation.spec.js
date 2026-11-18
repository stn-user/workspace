import { test, expect } from '@playwright/test';

async function open(page, supported = true) {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(supported => {
    window.speechInstances = [];
    window.webkitSpeechRecognition = undefined;
    window.SpeechRecognition = supported ? class {
      constructor() { window.speechInstances.push(this); }
      start() { this.started = true; this.onstart?.(); }
      stop() { this.stopped = true; }
      abort() { this.aborted = true; this.onend?.(); }
    } : undefined;
    window.speechResult = (text, index = 0) => {
      const current = window.speechInstances.at(-1);
      const results = Array.from({ length: index + 1 }, (_, i) =>
        ({ 0: { transcript: i === index ? text : 'ancien résultat' }, isFinal: true }));
      current.onresult({ resultIndex: index, results });
    };
  }, supported);
  const ready = page.waitForEvent('console', message => message.text().includes('Async init - COMPLETE'));
  await page.goto('http://127.0.0.1:5179/#/recherche');
  await ready;
  await page.evaluate(() => {
    window.searchSubmits = 0;
    document.querySelector('#experimental-index-form').addEventListener('submit', () => window.searchSubmits++);
  });
}

async function begin(page) {
  await page.locator('#search-dictation').click();
  await expect(page.locator('#search-dictation-dialog')).toBeVisible();
  await expect(page.locator('#search-dictation-privacy')).toContainText('envoyés à son fournisseur');
  expect(await page.evaluate(() => window.speechInstances.length)).toBe(0);
  await page.locator('#start-search-dictation').click();
  await expect(page.locator('#search-dictation')).toHaveAttribute('aria-pressed', 'true');
}

test('accord préalable, annulation et transcription française sans recherche automatique', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await open(page);
  const query = page.locator('#experimental-index-query');
  const button = page.locator('#search-dictation');
  await query.fill('facture');
  await button.click();
  await page.locator('#cancel-search-dictation').click();
  expect(await page.evaluate(() => window.speechInstances.length)).toBe(0);
  await expect(button).toBeFocused();
  await begin(page);
  expect(await page.evaluate(() => {
    const current = window.speechInstances[0];
    return { lang: current.lang, continuous: current.continuous, interim: current.interimResults };
  })).toEqual({ lang: 'fr-FR', continuous: false, interim: false });
  await page.evaluate(() => window.speechResult('de la piscine'));
  await expect(query).toHaveValue('facture de la piscine');
  await page.evaluate(() => window.speechResult('de la piscine'));
  await expect(query).toHaveValue('facture de la piscine');
  await button.click();
  expect(await page.evaluate(() => window.speechInstances[0].stopped)).toBe(true);
  await page.evaluate(() => window.speechInstances[0].onend());
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(query).toBeFocused();
  expect(await page.evaluate(() => window.searchSubmits)).toBe(0);
  await query.fill('facture piscine corrigée');
  await query.press('Enter');
  expect(await page.evaluate(() => window.searchSubmits)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await button.evaluate(button => {
    const box = button.getBoundingClientRect();
    return box.width >= 48 && box.height >= 48;
  })).toBe(true);
});

test('la saisie manuelle, la recherche et la navigation bloquent les résultats tardifs', async ({ page }) => {
  await open(page);
  await begin(page);
  const query = page.locator('#experimental-index-query');
  await query.fill('ma saisie');
  expect(await page.evaluate(() => window.speechInstances[0].aborted)).toBe(true);
  await page.evaluate(() => window.speechResult('ne doit pas être ajouté'));
  await expect(query).toHaveValue('ma saisie');
  await page.locator('#search-dictation').click();
  await expect(page.locator('#search-dictation-dialog')).toBeHidden();
  await query.press('Enter');
  expect(await page.evaluate(() => window.speechInstances[1].aborted)).toBe(true);
  await page.evaluate(() => window.speechResult('ne doit pas être ajouté'));
  await expect(query).toHaveValue('ma saisie');
  await page.locator('#search-dictation').click();
  await page.evaluate(() => { location.hash = '/maison'; });
  await expect(page.locator('#view-maison')).toBeVisible();
  expect(await page.evaluate(() => window.speechInstances[2].aborted)).toBe(true);
  await page.evaluate(() => window.speechResult('ne doit pas être ajouté'));
  await expect(query).toHaveValue('ma saisie');
});

test('permission refusée et panne réseau sont explicites, sans perte de saisie', async ({ page }) => {
  await open(page);
  await page.locator('#experimental-index-query').fill('texte conservé');
  await begin(page);
  for (const [error, message] of [['not-allowed', 'Accès au micro refusé'], ['network', 'hors connexion']]) {
    await page.evaluate(error => window.speechInstances.at(-1).onerror({ error }), error);
    await expect(page.locator('#search-dictation-status')).toContainText(message);
    await expect(page.locator('#search-dictation')).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => window.speechResult('résultat tardif'));
    await expect(page.locator('#experimental-index-query')).toHaveValue('texte conservé');
    await page.locator('#search-dictation').click();
  }
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.speechInstances.at(-1).aborted)).toBe(true);
});

test('service non compatible : explication sur demande, sans accès au micro', async ({ page }) => {
  await open(page, false);
  await page.locator('#search-dictation').click();
  await expect(page.locator('#search-dictation-availability')).toContainText("n'est pas disponible");
  await expect(page.locator('#start-search-dictation')).toBeHidden();
  expect(await page.evaluate(() => window.speechInstances.length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#search-dictation')).toBeFocused();
  await page.locator('#experimental-index-query').fill('recherche au clavier');
  await page.locator('#experimental-index-query').press('Enter');
  expect(await page.evaluate(() => window.searchSubmits)).toBe(1);
});

test('arrêt annulable et absence de parole ne donnent pas de faux succès', async ({ page }) => {
  await open(page);
  await begin(page);
  await page.evaluate(() => {
    window.speechResult('');
    window.speechInstances.at(-1).onend();
  });
  await expect(page.locator('#search-dictation-status')).toContainText('Aucune parole reconnue');
  const button = page.locator('#search-dictation');
  await button.click();
  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Annuler la dictée');
  await button.click();
  expect(await page.evaluate(() => window.speechInstances.at(-1).aborted)).toBe(true);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.speechResult('résultat tardif'));
  await expect(page.locator('#experimental-index-query')).toHaveValue('');
});
