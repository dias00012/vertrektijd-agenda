import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

/**
 * "Leertijd inplannen" zette vroeger één blok van uren neer, midden in een dag
 * waarop je aan het werk was. Dat het voorstel nu binnen je vrije tijd blijft
 * en pas op de knop in je agenda komt, is precies het soort ding dat je alleen
 * ziet door het te doen.
 */

test.beforeEach(async ({ page }) => {
  await zaai(page);
  await page.goto("/schoolwerk");
});

const venster = (page: import("@playwright/test").Page) => page.locator('[role="dialog"]');

test("het voorstel is eerst te zien en komt pas op de knop in je agenda", async ({ page }) => {
  await page
    .locator("article")
    .filter({ hasText: "Hoofdstuk 4" })
    .getByRole("button", { name: /Leertijd inplannen/ })
    .click();

  const form = venster(page);
  await expect(form).toContainText("Voorstel");
  // Alleen de open stap; "Theorie lezen" staat al af.
  await expect(form).toContainText("Opgaven maken");
  await expect(form).not.toContainText("Theorie lezen");

  await form.getByRole("button", { name: "Annuleren" }).click();
  await expect(form).toHaveCount(0);

  // Geannuleerd betekent: er staat nog niets in je agenda.
  await page.goto("/agenda");
  await expect(page.getByText("Opgaven maken")).toHaveCount(0);
});

test("bevestigen zet de blokken er wel in, en een tweede keer niet nog eens", async ({ page }) => {
  const kaart = page.locator("article").filter({ hasText: "Hoofdstuk 4" });
  await kaart.getByRole("button", { name: /Leertijd inplannen/ }).click();
  await venster(page).getByRole("button", { name: "Zet in agenda" }).click();
  await expect(venster(page)).toHaveCount(0);

  await kaart.getByRole("button", { name: /Leertijd inplannen/ }).click();
  // Er staat al genoeg tijd voor: geen tweede stapel erbovenop.
  await expect(venster(page)).toContainText("al genoeg tijd");
});

test("een blok belandt nooit in de tijd dat je van huis bent", async ({ page }) => {
  await page
    .locator("article")
    .filter({ hasText: "Hoofdstuk 4" })
    .getByRole("button", { name: /Leertijd inplannen/ })
    .click();

  const regels = await venster(page).locator("li").allInnerTexts();
  expect(regels.length).toBeGreaterThan(0);

  for (const regel of regels) {
    const begin = regel.match(/(\d{2}):(\d{2})/);
    if (!begin) continue;
    const minuten = Number(begin[1]) * 60 + Number(begin[2]);
    // Werken tot 17:00 in Lelystad, 42 minuten terug: vóór 17:42 ben je er niet.
    // En na 22:00 plant de app niets meer.
    const overdag = minuten > 8 * 60 && minuten < 17 * 60 + 42;
    expect(overdag, `blok om ${begin[0]} valt in de tijd dat je van huis bent`).toBe(false);
    expect(minuten).toBeLessThan(22 * 60);
  }
});
