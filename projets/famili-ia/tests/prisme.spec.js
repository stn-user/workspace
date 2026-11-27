import { test, expect } from "@playwright/test";

const gallery = new URL("../docs/guide/prisme.html", import.meta.url).href;

for (const width of [320, 390]) {
  test(`Prisme : galerie locale et contrôles accessibles à ${width}px`, async ({ page }) => {
    const remote = [];
    await page.route(/^https?:/, route => {
      remote.push(route.request().url());
      return route.abort();
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto(gallery);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const link of await page.locator(".prisme-nav a").all()) {
      const bounds = await link.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("link", { name: "Rappels", exact: true }).click();
    await expect(page.getByRole("link", { name: "Rappels", exact: true })).toHaveAttribute("aria-current", "location");
    await page.getByLabel("Terminés").check();
    await expect(page.locator("#empty")).toBeVisible();
    await expect(page.locator(".prisme-feature--rappel")).toBeHidden();
    await page.getByLabel("À venir").check();
    await expect(page.locator(".prisme-feature--rappel")).toBeVisible();
    const trigger = page.getByRole("button", { name: /Fiche du foyer/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Fiche du foyer" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(remote).toEqual([]);
  });
}
