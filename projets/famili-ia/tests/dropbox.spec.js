import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:5192";
const file = { ".tag": "file", id: "id:facture-fictive", name: "facture-piscine.txt",
  path_display: "/Maison/facture-piscine.txt", size: 64, rev: "version-1", server_modified: "2026-01-03T10:00:00Z" };

async function setup({ page, context }, { invalidState = false, writeScope = false, cancelPopup = false } = {}) {
  const calls = [];
  let account = "compte-fictif-a";
  let revision = "version-1";
  let listStatus = 200;
  let hold = null;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin === "https://www.dropbox.com" && url.pathname === "/oauth2/authorize") {
      if (cancelPopup) return route.fulfill({ contentType: "text/html", body: "<script>window.close()</script>" });
      const state = invalidState ? "mauvais-etat" : url.searchParams.get("state");
      expect(url.searchParams.get("scope")).toBe("files.metadata.read files.content.read");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.has("client_secret")).toBe(false);
      return route.fulfill({ contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(`${origin}/dropbox-redirect.html?code=code-fictif&state=${encodeURIComponent(state)}`)})</script>` });
    }
    if (url.origin === "https://api.dropboxapi.com" && url.pathname === "/oauth2/token") {
      const body = new URLSearchParams(route.request().postData());
      expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(body.has("client_secret")).toBe(false);
      return route.fulfill({ json: { access_token: "jeton-fictif-dropbox", token_type: "bearer",
        account_id: account, expires_in: 3600,
        scope: `files.metadata.read files.content.read${writeScope ? " files.content.write" : ""}` } });
    }
    if (["https://api.dropboxapi.com", "https://content.dropboxapi.com"].includes(url.origin)) {
      calls.push(url.pathname);
      if (hold) await hold;
      if (url.pathname === "/2/files/list_folder") {
        if (listStatus !== 200) return route.fulfill({ status: listStatus, body: "", headers: { "Retry-After": "3" } });
        return route.fulfill({ json: { entries: [{ ...file, rev: revision }], cursor: "suite", has_more: true } });
      }
      if (url.pathname === "/2/files/list_folder/continue") return route.fulfill({
        json: { entries: [{ ".tag": "file", id: "id:photo-fictive", name: "souvenir-piscine.jpg",
          path_display: "/Photos/souvenir-piscine.jpg", size: 500, rev: "photo-1" }], cursor: "fin", has_more: false }
      });
      if (url.pathname === "/2/files/download") return route.fulfill({
        headers: { "Dropbox-API-Result": JSON.stringify({ ...file, rev: revision }), "Access-Control-Expose-Headers": "Dropbox-API-Result" },
        body: "Facture piscine fictive\nMontant : 120 euros\nÉchéance : 04/05/2028"
      });
      throw new Error(`Appel Dropbox inattendu : ${url.pathname}`);
    }
    return route.abort();
  });
  const initialized = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto(`${origin}/#/importer`);
  await initialized;
  expect(await page.locator("#view-importer").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Options Dropbox", exact: true }).click();
  return {
    calls, errors,
    account: value => { account = value; }, revision: value => { revision = value; },
    listStatus: value => { listStatus = value; },
    hold: value => { hold = value; }
  };
}

const documents = page => page.evaluate(async () => (await import("/db.js")).getAll("documents"));
async function connect(page) {
  await page.locator("#connect-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Dropbox connecté");
}

for (const width of [390, 768, 1280, 1920]) {
  test(`Dropbox : connexion séparée, indexation et recherche persistée à ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    const mock = await setup({ page, context });
    const dialog = page.locator("#source-choice-dialog");
    await expect(dialog).toContainText("Full Dropbox");
    await expect(page.locator("#connect-onedrive")).toBeHidden();
    await expect(page.locator("#start-dropbox")).toBeDisabled();
    expect(mock.calls).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Options Dropbox", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Options Dropbox", exact: true }).click();
    await connect(page);
    expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain("jeton-fictif-dropbox");
    expect(mock.calls).toEqual([]);
    expect(await documents(page)).toEqual([]);
    await page.locator("#start-dropbox").click();
    await expect(page.locator("#dropbox-status")).toContainText("Parcours Dropbox terminé");
    expect(mock.calls.filter(path => path === "/2/files/download")).toHaveLength(1);
    let stored = await documents(page);
    expect(stored).toHaveLength(2);
    expect(stored.every(doc => doc.indexRecord.sourceId === "dropbox")).toBe(true);
    expect(stored.find(doc => doc.type === "Image").photoMetadata).toBeUndefined();
    for (const button of await dialog.locator("button:visible").all()) {
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator("#disconnect-dropbox").click();
    await expect(page.locator("#dropbox-status")).toContainText("n'est pas révoquée");
    expect(await documents(page)).toEqual(stored);
    if ([390, 1280].includes(width)) {
      await page.screenshot({ path: test.info().outputPath("dropbox-options.png") });
    }
    const initialized = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
    await page.reload();
    await initialized;
    await page.evaluate(() => { location.hash = "#/recherche"; });
    await page.locator("#experimental-index-query").fill("piscine");
    await page.locator("#search-filters-panel > summary").click();
    await page.locator("#experimental-index-source").selectOption("dropbox");
    await page.locator("#experimental-index-form .submit-button").click();
    await expect(page.locator("#experimental-index-results")).toContainText("facture-piscine.txt");
    await expect(page.locator("#experimental-index-results")).toContainText("Source : Dropbox");
    expect(await documents(page)).toEqual(stored);
    expect(mock.errors).toEqual([]);
  });
}

test("Dropbox : changements signalés, comptes distincts, quotas, arrêt et purge sans original", async ({ page, context }) => {
  const mock = await setup({ page, context });
  await connect(page);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Parcours Dropbox terminé");
  const initial = await documents(page);
  mock.revision("version-2");
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("1 changement(s)");
  expect(await documents(page)).toEqual(initial);
  await page.locator("#disconnect-dropbox").click();
  mock.account("compte-fictif-b");
  await connect(page);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Parcours Dropbox terminé");
  const bothAccounts = await documents(page);
  expect(bothAccounts).toHaveLength(4);
  expect(new Set(bothAccounts.map(doc => doc.id)).size).toBe(4);
  mock.listStatus(429);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Quota Dropbox");
  expect(await documents(page)).toEqual(bothAccounts);
  mock.listStatus(200);
  let release;
  mock.hold(new Promise(resolve => { release = resolve; }));
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#stop-dropbox")).toBeVisible();
  await page.locator("#stop-dropbox").click();
  release();
  mock.hold(null);
  await expect(page.locator("#dropbox-status")).toContainText("arrêtée");
  expect(await documents(page)).toEqual(bothAccounts);
  await page.locator("#close-source-choice").click();
  await page.evaluate(() => { location.hash = "#/vos-donnees"; });
  await expect(page.locator("#summary-dropbox")).toContainText("4 copie(s)");
  await page.locator("#purge-all-data").click();
  await page.locator("#confirm-purge").click();
  await expect(page.locator("#purge-status")).toContainText("supprimées");
  expect(await documents(page)).toEqual([]);
  expect(mock.calls.some(path => /delete|upload|move/.test(path))).toBe(false);
  expect(mock.errors).toEqual([]);
});

for (const option of [{ invalidState: true }, { writeScope: true }, { cancelPopup: true }]) {
  test(`Dropbox refuse un retour ou des permissions incohérentes : ${JSON.stringify(option)}`, async ({ page, context }) => {
    const mock = await setup({ page, context }, option);
    await page.locator("#connect-dropbox").click();
    await expect(page.locator("#dropbox-status")).toContainText("Connexion Dropbox non aboutie");
    await expect(page.locator("#dropbox-status")).toContainText(option.invalidState
      ? "état de connexion incohérent" : option.writeScope ? "permissions différentes de la lecture seule attendue" : "annulée");
    await expect(page.locator("#start-dropbox")).toBeDisabled();
    expect(mock.calls).toEqual([]);
    expect(await documents(page)).toEqual([]);
  });
}

test("Dropbox non configuré reste explicitement indisponible, sans autorisation ni lecture", async ({ page }) => {
  await page.route("https://**/*", route => route.abort());
  const initialized = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto("http://127.0.0.1:5179/#/importer");
  await initialized;
  await page.getByRole("button", { name: "Options Dropbox", exact: true }).click();
  await expect(page.locator("#connect-dropbox")).toBeDisabled();
  await expect(page.locator("#start-dropbox")).toBeDisabled();
  await expect(page.locator("#dropbox-status")).toContainText("VITE_DROPBOX_APP_KEY");
});
