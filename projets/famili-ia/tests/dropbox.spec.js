import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:5192";
const file = { ".tag": "file", id: "id:facture-fictive", name: "facture-piscine.txt",
  path_display: "/Maison/facture-piscine.txt", size: 64, rev: "version-1", server_modified: "2026-01-03T10:00:00Z" };

async function setup({ page, context }, { invalidState = false, writeScope = false, cancelPopup = false } = {}) {
  const calls = [];
  let account = "compte-fictif-a";
  let revision = "version-1";
  let content = "Facture piscine fictive\nMontant : 120 euros\nÉchéance : 04/05/2028";
  let photoMediaInfo = null;
  let downloadStatus = 200;
  let listStatus = 200;
  let continueStatus = 200;
  let holdContinue = null;
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
      if (url.pathname === "/2/files/list_folder/continue" && holdContinue) await holdContinue;
      if (url.pathname === "/2/files/list_folder") {
        if (listStatus !== 200) return route.fulfill({ status: listStatus, body: "", headers: { "Retry-After": "3" } });
        return route.fulfill({ json: { entries: [{ ...file, rev: revision }], cursor: "suite", has_more: true } });
      }
      if (url.pathname === "/2/files/list_folder/continue") {
        if (continueStatus !== 200) return route.fulfill({ status: continueStatus, body: JSON.stringify({ error_summary: "reset" }) });
        return route.fulfill({
          json: { entries: [{ ".tag": "file", id: "id:photo-fictive", name: "souvenir-piscine.jpg",
            path_display: "/Photos/souvenir-piscine.jpg", size: 500, rev: "photo-1",
            ...(photoMediaInfo ? { media_info: photoMediaInfo } : {}) }], cursor: "fin", has_more: false }
        });
      }
      if (url.pathname === "/2/files/download") {
        if (downloadStatus !== 200) return route.fulfill({ status: downloadStatus, body: "" });
        return route.fulfill({
          headers: { "Dropbox-API-Result": JSON.stringify({ ...file, rev: revision }), "Access-Control-Expose-Headers": "Dropbox-API-Result" },
          body: content
        });
      }
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
    content: value => { content = value; },
    photoMediaInfo: value => { photoMediaInfo = value; },
    downloadStatus: value => { downloadStatus = value; },
    listStatus: value => { listStatus = value; },
    continueStatus: value => { continueStatus = value; },
    holdContinue: value => { holdContinue = value; }
  };
}

test("Dropbox : date photo indexée et GPS uniquement avec consentement, puis purgé au retrait", async ({ page, context }) => {
  const mock = await setup({ page, context });
  mock.photoMediaInfo({
    ".tag": "metadata",
    metadata: {
      time_taken: "2024-06-07T08:09:10Z",
      location: { latitude: 48.8566, longitude: 2.3522 }
    }
  });
  await page.evaluate(async () => (await import("/state.js")).updatePhotoLocationConsent(true));
  await connect(page);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Parcours Dropbox terminé");
  let photo = (await documents(page)).find(document => document.type === "Image");
  expect(photo.photoMetadata.captureDate.localDateTime).toBe("2024-06-07T08:09:10");
  expect(photo.photoMetadata.location.latitude).toBe(48.8566);
  expect(photo.photoFacts.facts.some(fact => fact.kind === "location"
    && fact.provenance.providerId === "dropbox")).toBe(true);
  expect(mock.calls.filter(path => path === "/2/files/download")).toHaveLength(1);

  const initialized = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.reload();
  await initialized;
  await page.evaluate(() => { location.hash = "#/recherche"; });
  await page.locator("#experimental-index-query").fill("Photos prises à 48.8566, 2.3522");
  await page.locator("#experimental-index-form .submit-button").click();
  await expect(page.locator("#moments-life-search-status")).toContainText("1 photo trouvée");
  await expect(page.locator("#moments-life-search-results")).toContainText("souvenir-piscine.jpg");

  await page.evaluate(async () => (await import("/state.js")).updatePhotoLocationConsent(false));
  photo = (await documents(page)).find(document => document.type === "Image");
  expect(photo.photoMetadata.location.status).toBe("cleared");
  expect(photo.photoMetadata.location.latitude).toBeNull();
  expect(photo.photoFacts.facts.some(fact => fact.kind === "location")).toBe(false);
  expect(JSON.stringify(photo)).not.toContain("48.8566");
  expect(mock.errors).toEqual([]);
});

const documents = page => page.evaluate(async () => (await import("/db.js")).getAll("documents"));
const checkpoints = page => page.evaluate(async () => (await import("/db.js")).getAll("source_sync")
  .then(records => records.filter(record => record.id.startsWith("dropbox-index-"))));
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

test("Dropbox : reprise locale explicite après rechargement, réservée au même compte", async ({ page, context }) => {
  const mock = await setup({ page, context });
  await connect(page);
  let releaseContinue;
  mock.holdContinue(new Promise(resolve => { releaseContinue = resolve; }));
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#stop-dropbox")).toBeVisible();
  await expect.poll(() => mock.calls.filter(path => path === "/2/files/list_folder/continue").length).toBe(1);
  await expect.poll(async () => (await checkpoints(page)).map(checkpoint => checkpoint.cursor)).toEqual(["suite"]);
  await page.locator("#stop-dropbox").click();
  releaseContinue();
  mock.holdContinue(null);
  await expect(page.locator("#dropbox-status")).toContainText("Indexation Dropbox arrêtée");
  await expect(page.locator("#resume-dropbox")).toBeVisible();
  expect(await documents(page)).toHaveLength(1);

  const initialized = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.reload();
  await initialized;
  await page.getByRole("button", { name: "Options Dropbox", exact: true }).click();
  mock.account("compte-fictif-b");
  await connect(page);
  await expect(page.locator("#resume-dropbox")).toBeHidden();
  expect(mock.calls.filter(path => path === "/2/files/list_folder")).toHaveLength(1);

  await page.locator("#disconnect-dropbox").click();
  mock.account("compte-fictif-a");
  await connect(page);
  await expect(page.locator("#resume-dropbox")).toBeVisible();
  await page.locator("#resume-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Reprise Dropbox terminée");
  expect(mock.calls.filter(path => path === "/2/files/list_folder")).toHaveLength(1);
  expect(mock.calls.filter(path => path === "/2/files/list_folder/continue")).toHaveLength(2);
  expect(await documents(page)).toHaveLength(2);
  expect(await checkpoints(page)).toEqual([]);

  const continuationCalls = mock.calls.filter(path => path === "/2/files/list_folder/continue").length;
  let releaseAfterResume;
  mock.holdContinue(new Promise(resolve => { releaseAfterResume = resolve; }));
  await page.locator("#start-dropbox").click();
  await expect.poll(() => mock.calls.filter(path => path === "/2/files/list_folder/continue").length)
    .toBe(continuationCalls + 1);
  await expect.poll(async () => (await checkpoints(page)).length).toBe(1);
  await page.locator("#stop-dropbox").click();
  releaseAfterResume();
  mock.holdContinue(null);
  await expect(page.locator("#dropbox-status")).toContainText("Indexation Dropbox arrêtée");
  mock.continueStatus(409);
  await page.locator("#resume-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("HTTP 409");
  await expect(page.locator("#resume-dropbox")).toBeHidden();
  expect(await checkpoints(page)).toEqual([]);
  mock.continueStatus(200);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Parcours Dropbox terminé");
  expect(mock.calls.filter(path => path === "/2/files/list_folder")).toHaveLength(3);
  expect(await documents(page)).toHaveLength(2);
  expect(mock.errors).toEqual([]);
});

test("Dropbox : supprimer une copie invalide le point de reprise du compte", async ({ page, context }) => {
  const mock = await setup({ page, context });
  await connect(page);
  let releaseContinue;
  mock.holdContinue(new Promise(resolve => { releaseContinue = resolve; }));
  await page.locator("#start-dropbox").click();
  await expect.poll(() => mock.calls.filter(path => path === "/2/files/list_folder/continue").length).toBe(1);
  await expect.poll(async () => (await checkpoints(page)).length).toBe(1);
  const [document] = await documents(page);
  expect(document.dropboxSource).toBe(true);

  await page.locator("#stop-dropbox").click();
  releaseContinue();
  mock.holdContinue(null);
  await expect(page.locator("#dropbox-status")).toContainText("Indexation Dropbox arrêtée");
  await page.evaluate(async id => (await import("/state.js")).deleteDocument(id), document.id);
  expect(await documents(page)).toEqual([]);
  expect(await checkpoints(page)).toEqual([]);

  const initialized = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.reload();
  await initialized;
  await page.getByRole("button", { name: "Options Dropbox", exact: true }).click();
  await connect(page);
  await expect(page.locator("#resume-dropbox")).toBeHidden();
  expect(mock.calls.filter(path => path === "/2/files/list_folder")).toHaveLength(1);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Parcours Dropbox terminé");
  expect(mock.calls.filter(path => path === "/2/files/list_folder")).toHaveLength(2);
  expect(await documents(page)).toHaveLength(2);
  expect(mock.errors).toEqual([]);
});

test("Dropbox : migration IndexedDB ajoute les points de reprise sans perdre les copies existantes", async ({ page }) => {
  await page.goto(`${origin}/dropbox-redirect.html`);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("FamiliIADatabase", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["users", "family", "equipment", "documents", "alerts"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("access_logs")) {
        db.createObjectStore("access_logs", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("documents", "readwrite");
      transaction.objectStore("documents").put({
        id: "document-v3", name: "document-v3.txt", type: "Texte",
        isLocal: true, content: "Contenu antérieur", summary: "", keywords: "", date: "Date inconnue"
      });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
  const initialized = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto(`${origin}/#/importer`);
  await initialized;
  expect((await documents(page)).some(document => document.id === "document-v3")).toBe(true);
  const database = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("FamiliIADatabase");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      resolve({ version: db.version, hasSourceSync: db.objectStoreNames.contains("source_sync") });
      db.close();
    };
  }));
  expect(database).toEqual({ version: 4, hasSourceSync: true });
});

test("Dropbox : changements soumis à confirmation, comptes distincts, quotas, arrêt et purge sans original", async ({ page, context }) => {
  const mock = await setup({ page, context });
  await connect(page);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("Parcours Dropbox terminé");
  const initial = await documents(page);
  mock.revision("version-2");
  mock.content("Version modifiée de la facture piscine fictive");
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("1 changement(s)");
  await expect(page.locator("#dropbox-review-panel")).toBeVisible();
  await expect(page.locator("#dropbox-review-list")).toContainText("version Dropbox différente");
  await expect(page.locator("#dropbox-review-list input")).not.toBeChecked();
  expect(mock.calls.filter(path => path === "/2/files/download")).toHaveLength(1);
  expect(await documents(page)).toEqual(initial);
  await page.locator("#keep-dropbox-copies").click();
  await expect(page.locator("#dropbox-review-panel")).toBeHidden();
  await expect(page.locator("#dropbox-review-status")).toContainText("aucun contenu Dropbox n'a été relu");
  expect(await documents(page)).toEqual(initial);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-review-panel")).toBeVisible();
  mock.downloadStatus(500);
  await page.locator("#dropbox-review-list input").check();
  await page.locator("#apply-dropbox-updates").click();
  await expect(page.locator("#dropbox-status")).toContainText("1 échec(s)");
  expect(mock.calls.filter(path => path === "/2/files/download")).toHaveLength(2);
  expect(await documents(page)).toEqual(initial);
  await expect(page.locator("#dropbox-review-panel")).toBeVisible();
  mock.downloadStatus(200);
  await page.locator("#dropbox-review-list input").check();
  await page.locator("#apply-dropbox-updates").click();
  await expect(page.locator("#dropbox-status")).toContainText("Actualisation Dropbox terminée : 1 copie(s) remplacée(s)");
  expect(mock.calls.filter(path => path === "/2/files/download")).toHaveLength(3);
  const updated = await documents(page);
  expect(updated.find(doc => doc.name === file.name).dropboxRev).toBe("version-2");
  expect(updated.find(doc => doc.name === file.name).content).toContain("Version modifiée");
  expect(updated.find(doc => doc.type === "Image")).toEqual(initial.find(doc => doc.type === "Image"));
  mock.revision(undefined);
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#dropbox-status")).toContainText("1 version(s) inconnue(s)");
  await expect(page.locator("#dropbox-review-panel")).toBeHidden();
  expect(await documents(page)).toEqual(updated);
  mock.revision("version-2");
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
  const previousContinueCalls = mock.calls.filter(path => path === "/2/files/list_folder/continue").length;
  let release;
  mock.holdContinue(new Promise(resolve => { release = resolve; }));
  await page.locator("#start-dropbox").click();
  await expect(page.locator("#stop-dropbox")).toBeVisible();
  await expect.poll(() => mock.calls.filter(path => path === "/2/files/list_folder/continue").length)
    .toBe(previousContinueCalls + 1);
  await expect.poll(async () => (await checkpoints(page)).length).toBe(1);
  await page.locator("#stop-dropbox").click();
  release();
  mock.holdContinue(null);
  await expect(page.locator("#dropbox-status")).toContainText("arrêtée");
  expect(await documents(page)).toEqual(bothAccounts);
  expect(await checkpoints(page)).toHaveLength(1);
  await page.locator("#close-source-choice").click();
  await page.evaluate(() => { location.hash = "#/vos-donnees"; });
  await expect(page.locator("#summary-dropbox")).toContainText("4 copie(s)");
  await page.locator("#purge-all-data").click();
  await page.locator("#confirm-purge").click();
  await expect(page.locator("#purge-status")).toContainText("supprimées");
  expect(await documents(page)).toEqual([]);
  expect(await checkpoints(page)).toEqual([]);
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
