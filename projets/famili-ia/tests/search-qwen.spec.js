import { expect, test } from "@playwright/test";
import { gateLocalQwenResponse } from "./helpers/qwen-route.js";

test("Qwen répond depuis les extraits vérifiés des résultats locaux sans recevoir le document", async ({ page }) => {
  await page.route("https://**/*", route => route.abort());
  const ready = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto("http://127.0.0.1:5179/#/recherche");
  await ready;
  await page.locator("#local-files-input").setInputFiles({
    name: "Facture piscine fictive.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("FACTURE PISCINE FICTIVE\nMontant total : 321 euros TTC\nDossier de demonstration pour tests Famili-IA uniquement.")
  });
  await expect(page.locator("#scan-progress-text")).toHaveText("Indexation terminée : 1/1 fichiers indexés");

  const origin = new URL(page.url()).origin;
  const calls = [];
  await page.route("http://127.0.0.1:11434/**", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
      return;
    }
    const body = JSON.parse(route.request().postData());
    const input = JSON.parse(body.messages[1].content);
    calls.push({ body, input });
    await route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": origin, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          role: "assistant",
          content: JSON.stringify({
            status: "answered",
            answer: "Montant total : 321 euros TTC",
            claims: [{
              text: "Montant total : 321 euros TTC",
              citations: [{ evidenceId: "evidence-1", quote: "Montant total : 321 euros TTC" }]
            }]
          })
        }
      })
    });
  });

  const qwenToggle = page.locator("#search-use-qwen");
  await expect(qwenToggle).not.toBeChecked();
  await qwenToggle.check();
  await page.locator("#experimental-index-query").fill("Quel est le montant de la piscine ?");
  await page.locator("#experimental-index-form .submit-button").click();
  await expect(page.locator("#search-qwen-status")).toContainText("Réponse expérimentale Qwen");
  await expect(page.locator("#search-qwen-answer")).toContainText("Montant total : 321 euros TTC");
  await expect(page.locator("#search-qwen-answer")).toContainText("Facture piscine fictive.txt");
  await expect(page.locator("#experimental-index-results li")).toContainText("Facture piscine fictive.txt");
  expect(calls).toHaveLength(1);
  expect(calls[0].body.model).toBe("qwen3:8b");
  expect(calls[0].input.question).toBe("Quel est le montant de la piscine ?");
  expect(calls[0].input.evidence).toEqual([{
    id: "evidence-1",
    text: "Montant total : 321 euros TTC",
    verified: true
  }]);
  expect(JSON.stringify(calls[0].input)).not.toContain("FACTURE PISCINE FICTIVE");
  expect(JSON.stringify(calls[0].input)).not.toContain("Facture piscine fictive.txt");
});

test("Qwen Recherche reste bloqué sur navigateur mobile même si son contrôle est forcé", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
    });
  });
  await page.route("https://**/*", route => route.abort());
  const ready = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto("http://127.0.0.1:5179/#/recherche");
  await ready;
  const toggle = page.locator("#search-use-qwen");
  await expect(toggle).toBeDisabled();
  let modelCalled = false;
  page.on("request", request => {
    if (request.url().startsWith("http://127.0.0.1:11434/")) modelCalled = true;
  });
  await toggle.evaluate(element => {
    element.disabled = false;
    element.checked = true;
  });
  await page.locator("#experimental-index-query").fill("piscine");
  await page.locator("#experimental-index-form .submit-button").click();
  await expect(page.locator("#search-qwen-status")).toContainText("uniquement dans le navigateur sur PC");
  expect(modelCalled).toBe(false);
});

test("annuler Qwen dans Recherche conserve la requête et les résultats locaux", async ({ page }) => {
  await page.route("https://**/*", route => route.abort());
  const ready = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto("http://127.0.0.1:5179/#/recherche");
  await ready;
  await page.locator("#local-files-input").setInputFiles({
    name: "Facture piscine fictive.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("FACTURE PISCINE FICTIVE\nMontant total : 321 euros TTC\nDossier de demonstration pour tests Famili-IA uniquement.")
  });
  await expect(page.locator("#scan-progress-text")).toHaveText("Indexation terminée : 1/1 fichiers indexés");
  const origin = new URL(page.url()).origin;
  await page.route("http://127.0.0.1:11434/**", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": origin, "content-type": "application/json" },
      body: JSON.stringify({ message: { role: "assistant", content: "{}" } })
    });
  });
  await page.locator("#search-use-qwen").check();
  const query = page.locator("#experimental-index-query");
  await query.fill("Quel est le montant de la piscine ?");
  await page.locator("#experimental-index-form .submit-button").click();
  const cancel = page.locator("#search-cancel-qwen");
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(page.locator("#search-qwen-status")).toContainText("Recherche Qwen annulée");
  await expect(query).toHaveValue("Quel est le montant de la piscine ?");
  await expect(page.locator("#search-qwen-answer")).toBeEmpty();
  await expect(page.locator("#experimental-index-results li")).toContainText("Facture piscine fictive.txt");
});

test("Qwen Recherche écarte une réponse si le document change pendant la génération", async ({ page }) => {
  await page.route("https://**/*", route => route.abort());
  const ready = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto("http://127.0.0.1:5179/#/recherche");
  await ready;
  await page.locator("#local-files-input").setInputFiles({
    name: "Facture piscine fictive.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("FACTURE PISCINE FICTIVE\nMontant total : 321 euros TTC\nDossier de demonstration pour tests Famili-IA uniquement.")
  });
  await expect(page.locator("#scan-progress-text")).toHaveText("Indexation terminée : 1/1 fichiers indexés");

  const response = await gateLocalQwenResponse(page);
  await page.locator("#search-use-qwen").check();
  await page.locator("#experimental-index-query").fill("Quel est le montant de la piscine ?");
  await page.locator("#experimental-index-form .submit-button").click();
  await response.requestStarted;
  await page.evaluate(async () => {
    const { getDocuments } = await import("/state.js");
    const { put } = await import("/db.js");
    const { createContentProvenance } = await import("/content-index.js");
    const document = getDocuments().find(entry => entry.name === "Facture piscine fictive.txt");
    if (!document) throw new Error("Fixture de test introuvable.");
    document.content = "FACTURE PISCINE FICTIVE\nMontant total : 999 euros TTC\nDossier de demonstration pour tests Famili-IA uniquement.";
    document.contentProvenance = await createContentProvenance(document, [document.content], "local-text");
    await put("documents", document);
    window.document.querySelector("#experimental-deadline-refresh").click();
  });
  await response.release();

  await expect(page.locator("#search-qwen-status")).toContainText("sources ont changé");
  await expect(page.locator("#search-qwen-answer")).toBeEmpty();
  await expect(page.locator("#experimental-index-status")).toContainText("Aucun résultat");
});
