import { expect, test } from "@playwright/test";

const onboardingKey = "famili-ia-source-choice-complete";
const routes = [
  ["accueil", "/#/accueil"],
  ["recherche", "/#/recherche"],
  ["maison", "/#/maison"],
  ["famille", "/#/famille"],
  ["alertes", "/#/alertes"],
  ["detail", "/#/detail?id=playwright-missing"],
  ["assistant", "/#/assistant"],
  ["importer", "/#/importer"],
  ["profil", "/#/profil"],
  ["vos-donnees", "/#/vos-donnees"],
  ["plus", "/#/plus"]
];

async function useIsolatedProfile(page) {
  await page.addInitScript(key => localStorage.setItem(key, "true"), onboardingKey);
}

async function openView(page, hash) {
  await page.goto(hash);
  await expect(page.locator("#app-splash")).toBeHidden({ timeout: 15_000 });
}

async function expectAuroreActionPill(page, selector, name) {
  const action = page.locator(selector);
  await expect(action).toBeVisible();
  await expect(action).toHaveAccessibleName(name);
  const reference = page.locator('#view-maison [data-house-category="tout"]');
  const referenceBackground = await reference.evaluate(element => getComputedStyle(element).backgroundColor);
  await expect(action).toHaveCSS("background-color", referenceBackground);
  const styles = async button => button.evaluate(element => {
    const style = getComputedStyle(element);
    return ["padding", "borderRadius", "borderColor", "backgroundColor", "color"]
      .map(property => style[property]);
  });
  expect(await styles(action)).toEqual(await styles(reference));
}

test("les vues et le sélecteur d’apparence restent utilisables sur mobile et ordinateur", async ({ page }) => {
  await useIsolatedProfile(page);
  const uncaughtErrors = [];
  page.on("pageerror", error => uncaughtErrors.push(error.message));

  for (const [view, hash] of routes) {
    await openView(page, hash);
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    const appearance = page.getByRole("combobox", { name: "Apparence de Famili-IA" });

    for (const width of [320, 390, 1400]) {
      await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
      await expect(appearance).toBeVisible();
      await appearance.selectOption("dark");
      await expect(page.locator("html")).toHaveAttribute("data-aurore", "dark");
      await expect(page.locator(".appearance-control .moon")).toHaveCSS("display", "inline");
      if (view === "alertes" && width === 390) {
        await page.locator("#experimental-deadline-title").click();
      }
      if (width === 390 && view === "importer") {
        await expectAuroreActionPill(page, "#view-importer .aurore-action-pill", "Voir mes fichiers");
      }
      if (width === 390 && view === "alertes") {
        await expectAuroreActionPill(page, "#experimental-deadline-refresh", "Actualiser les propositions");
      }
      const darkButtons = await page.locator(`#view-${view} .ui-button:visible`).evaluateAll(buttons =>
        buttons.map(button => {
          const style = getComputedStyle(button);
          const variant = [...button.classList].find(name => name.startsWith("ui-button--"));
          return { variant, color: style.color, background: style.backgroundColor };
        })
      );
      for (const button of darkButtons) {
        if (button.variant === "ui-button--primary") expect(button.color).toBe("rgb(255, 255, 255)");
        if (button.variant === "ui-button--secondary") {
          expect(button.color).toBe("rgb(240, 239, 255)");
          expect(button.background).not.toBe("rgb(255, 255, 255)");
        }
        if (button.variant === "ui-button--text") expect(button.color).toBe("rgb(196, 188, 255)");
        if (button.variant === "ui-button--danger") {
          expect(button.color).toBe("rgb(255, 231, 226)");
          expect(button.background).not.toBe("rgb(255, 255, 255)");
        }
      }
      if (width === 390 && ["accueil", "recherche", "maison"].includes(view)) {
        const main = page.locator(".main-content");
        await expect(main).toHaveCSS("color", "rgb(240, 239, 255)");
        const background = await main.evaluate(element => getComputedStyle(element).backgroundImage);
        expect(background).toContain("rgb(16, 18, 38)");
      }
      if (width === 390 && view === "recherche") {
        const searchAdd = page.locator("#view-recherche .aurore-kit .addbtn");
        await expect(searchAdd).toHaveAccessibleName("Ajouter des fichiers");
        const buttonStyles = await page.evaluate(() => {
          const styles = selector => {
            const button = document.querySelector(selector);
            const computed = getComputedStyle(button);
            return ["width", "height", "borderRadius", "backgroundImage", "color", "boxShadow"]
              .map(property => computed[property]);
          };
          return {
            search: styles("#view-recherche .aurore-kit .addbtn"),
            foyer: styles("#view-maison .addbtn")
          };
        });
        expect(buttonStyles.search).toEqual(buttonStyles.foyer);
      }
      await appearance.selectOption("light");
      await expect(page.locator("html")).toHaveAttribute("data-aurore", "light");
      await expect(page.locator(".appearance-control .sun")).toHaveCSS("display", "inline");

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(horizontalOverflow, `${view} déborde à ${width}px`).toBeLessThanOrEqual(1);
      if (width < 500) await expect(page.locator(".bottom-nav")).toBeVisible();
      else await expect(page.locator(".sidebar")).toBeVisible();
    }

    if (view === "accueil") {
      await page.emulateMedia({ colorScheme: "dark" });
      await appearance.selectOption("system");
      await expect(page.locator("html")).toHaveAttribute("data-aurore", "dark");
      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.locator("html")).toHaveAttribute("data-aurore", "light");
    }
  }

  expect(uncaughtErrors).toEqual([]);
});

test("l’onboarding personnalise le profil et sa démo reste fictive", async ({ page }) => {
  const uncaughtErrors = [];
  page.on("pageerror", error => uncaughtErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/accueil");

  const onboarding = page.getByRole("dialog", { name: "Découvrir Famili-IA" });
  await expect(onboarding).toBeVisible();
  await onboarding.getByRole("button", { name: "Commencer" }).click();
  await expect(onboarding.getByRole("heading", { name: "Comment vous appeler ?" })).toBeVisible();
  await expect(onboarding.getByText("Aperçu", { exact: true })).toHaveCount(0);
  const name = onboarding.getByRole("textbox", { name: "Prénom ou surnom" });
  await name.fill("Test Famili-IA");
  await name.press("Enter");

  await onboarding.getByRole("button", { name: /Créer mon espace/ }).click();
  const drive = onboarding.locator('[data-source="1"]');
  await drive.click();
  await expect(drive).toHaveAttribute("aria-pressed", "true");
  await onboarding.getByRole("button", { name: "Continuer" }).click();
  await expect(onboarding.getByText("Aucun accès accordé")).toBeVisible();
  await onboarding.getByRole("button", { name: "Ouvrir mon espace" }).click();
  await expect(onboarding).toBeHidden();
  await expect(page.locator("#dashboard-user-name")).toHaveText("Test Famili-IA");

  await page.reload();
  await expect(page.locator("#app-splash")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("#dashboard-user-name")).toHaveText("Test Famili-IA");
  await page.goto("/#/plus");
  await page.locator("#view-plus [data-replay-demo]").click();
  await expect(onboarding.getByRole("heading", { name: "Posez-la comme à un proche" })).toBeVisible();
  await expect.poll(() => onboarding.locator("[data-question-text]").textContent())
    .toBe("Quand se termine le contrat habitation ?");
  await onboarding.getByRole("button", { name: "Voir la réponse" }).click();
  await expect(onboarding.getByText("Échéance : 12 décembre 2026.")).toBeVisible();
  await onboarding.getByRole("button", { name: "Continuer" }).click();
  await onboarding.getByRole("button", { name: "Simuler le rappel" }).click();
  await expect(onboarding.getByRole("status")).toContainText("aucun rappel ajouté");
  await onboarding.getByRole("button", { name: "Terminer la démo" }).click();
  await expect(page).toHaveURL(/#\/plus$/);
  await page.goto("/#/profil");
  await expect(page.locator("#profile-name")).toHaveText("Test Famili-IA");
  expect(uncaughtErrors).toEqual([]);
});

test("les paramètres regroupent le profil et gardent les accès adaptés au mobile et au web", async ({ page }) => {
  await useIsolatedProfile(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openView(page, "/#/maison");
  const appSettings = page.locator("#open-app-settings");
  await expect(appSettings).toHaveClass(/(?:^|\s)round(?:\s|$)/);
  await expect(appSettings).toHaveCSS("width", "44px");
  await expect(appSettings).toHaveCSS("height", "44px");
  await expect(appSettings.locator(".i")).toHaveCSS("width", "22px");
  await expect(appSettings.locator(".i")).toHaveCSS("height", "22px");
  await expect(appSettings.locator(".i")).toHaveCSS("fill", "none");
  await expect(appSettings.locator(".i")).toHaveCSS("stroke-width", "1.8px");
  await expect(appSettings.locator(".i")).toHaveCSS("stroke-linecap", "round");

  const profileLink = page.locator('#view-maison nav [data-open-view="profil"]');
  await profileLink.click();
  await expect(page).toHaveURL(/#\/plus\?section=profile$/);
  await expect(page.locator("#view-plus")).toBeVisible();
  await expect(page.locator("#settings-profile")).toHaveAttribute("open", "");
  await expect(page.locator("#settings-profile > summary")).toBeFocused();
  await expect(page.locator("#open-app-settings")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sidebar [data-nav='profil']")).toHaveCount(0);
  await page.locator("#edit-name").fill("Alex Famili-IA");
  await page.locator("#save-profile").click();
  await expect(page.locator("#profile-save-status")).toContainText("Préférences enregistrées.");
  await page.locator("#view-plus [data-appearance='dark']").click();
  await expect(page.locator("#aurore-theme")).toHaveValue("dark");
  await page.locator("#view-plus [data-appearance='light']").click();
  await page.locator("#view-plus").getByText("Découvrir les offres", { exact: true }).click();
  await expect(page.locator("#view-plus")).toContainText("Aucun achat ni abonnement n’est proposé.");

  await page.locator("#open-app-settings").click();
  await expect(page).toHaveURL(/#\/maison$/);
  await expect(profileLink).toBeFocused();

  await openView(page, "/#/alertes");
  await page.locator("#view-alertes .alerts-data-link").click();
  await expect(page.locator("#view-vos-donnees")).toBeVisible();
  const mobileData = page.locator(".bottom-nav [data-nav='vos-donnees']");
  await expect(mobileData).toHaveAccessibleName("Vos données");
  await expect(mobileData).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".bottom-nav .nav-item")).toHaveCount(5);

  await page.locator("#open-app-settings").click();
  await expect(page.locator("#view-plus")).toBeVisible();
  await expect(page.locator(".bottom-nav [aria-current='page']")).toHaveCount(0);

  await page.setViewportSize({ width: 1400, height: 900 });
  await openView(page, "/#/maison");
  await expect(page.locator("#open-app-settings")).toBeVisible();
  await page.locator("#open-app-settings").click();
  await expect(page.getByRole("heading", { name: "Paramètres" })).toBeVisible();
  await expect(page.locator(".sidebar [data-nav='profil']")).toHaveCount(0);
  await expect(page.locator("#settings-profile")).toBeVisible();
  await page.goto("/#/profil");
  await expect(page).toHaveURL(/#\/plus\?section=profile$/);
  await expect(page.locator("#profile-name")).toBeVisible();
});

test("sans rappel actif, Rappels affiche une tuile datée et explique l’état vide", async ({ page }) => {
  await useIsolatedProfile(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openView(page, "/#/alertes");

  const emptyCard = page.locator("#alert-list .alert-empty-date");
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await expect(emptyCard).toBeVisible();
  await expect(emptyCard.locator("time")).toHaveAttribute("datetime", todayIso);
  await expect(emptyCard.locator(".bigday")).toHaveText(String(today.getDate()));
  await expect(emptyCard.locator(".mo")).toContainText(today.toLocaleDateString("fr-FR", { month: "long" }));
  await expect(emptyCard.getByRole("heading", { name: "Aucune alerte disponible" })).toBeVisible();
  await expect(emptyCard).toContainText("Les rappels confirmés apparaîtront ici.");
  await expect(emptyCard).toContainText("L’absence d’alerte ne prouve pas l’absence d’échéance.");

  await emptyCard.getByRole("button", { name: "Ajouter un document" }).click();
  await expect(page).toHaveURL(/#\/importer$/);
});

test("un fichier fictif passe par Recherche, preuve Assistant et confirmation d’alerte", async ({ page }) => {
  await useIsolatedProfile(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const uncaughtErrors = [];
  page.on("pageerror", error => uncaughtErrors.push(error.message));
  await openView(page, "/#/importer");

  const unsupported = {
    name: "non-pris-en-charge.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("fichier fictif")
  };
  await page.locator("#import-input").setInputFiles(unsupported);
  await expect(page.locator("#import-feedback")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#import-feedback")).toContainText("n'est pas dans un format pris en charge");

  const due = new Date();
  due.setDate(due.getDate() + 14);
  const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  const contract = {
    name: "contrat-habitation-fictif.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`Contrat habitation fictif\nFin de garantie : ${dueDate}\nAucun bénéficiaire réel.`)
  };
  await page.locator("#import-input").setInputFiles(contract);
  await expect(page.locator("#import-feedback")).toHaveAttribute("data-state", "success", { timeout: 30_000 });
  await expect(page.locator("#import-feedback-status")).toContainText("1/1 fichiers indexés");

  await page.goto("/#/recherche");
  const search = page.getByRole("searchbox", { name: "Rechercher dans vos sources" });
  await search.fill("Fin de garantie");
  await search.press("Enter");
  const results = page.locator("#experimental-index-results");
  await expect(results).toContainText("contrat-habitation-fictif.txt");
  await expect(results).toContainText(dueDate);

  await page.locator("#view-recherche .assistant").click();
  await expect(page.locator("#view-assistant")).toBeVisible();
  const question = page.getByRole("textbox", { name: "Votre question" });
  await question.fill("Quand se termine mon contrat habitation ?");
  await question.press("Enter");
  const chat = page.getByRole("log", { name: "Conversation avec l'assistant" });
  await expect(chat).toContainText(dueDate);
  await expect(chat).toContainText("Passage du document");
  await expect(chat).toContainText("contrat-habitation-fictif.txt");

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Confirmer la date et créer l’alerte" }).click();
  await expect(page.locator("#assistant-status")).toContainText("Échéance confirmée et alerte créée");
  await page.goto("/#/alertes");
  await expect(page.locator("#alert-list")).toContainText("contrat-habitation-fictif.txt");
  await expect(page.locator("#alert-list")).toContainText(dueDate);
  await page.reload();
  await expect(page.locator("#app-splash")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("#alert-list")).toContainText("contrat-habitation-fictif.txt");
  expect(uncaughtErrors).toEqual([]);
});
