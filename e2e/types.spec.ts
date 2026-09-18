import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

/**
 * Het activiteitstype. Twee dingen die hier eerder misgingen en die geen enkele
 * rekentest kon vinden: een emoji was verplicht, en een gemaakt type was daarna
 * nergens meer te bewerken.
 */

test.beforeEach(async ({ page }) => {
  await zaai(page);
  await page.goto("/agenda");
  await page.getByRole("button", { name: /Activiteit toevoegen|Toevoegen/ }).first().click();
});

/** Het formulier, zodat we nooit per ongeluk een knop erachter raken. */
const venster = (page: import("@playwright/test").Page) => page.locator('[role="dialog"]');

test("een eigen type maken kan zonder emoji", async ({ page }) => {
  const form = venster(page);
  await form.getByRole("button", { name: /Eigen/ }).click();
  await form.getByLabel(/^Naam$/).first().fill("Bijbaan");
  await form.getByRole("button", { name: "Type toevoegen" }).click();

  // Geen icoon gekozen: dan de eerste letter van de naam.
  const types = form.getByRole("group", { name: "Type" });
  await expect(types.getByRole("button", { name: "Bijbaan", exact: true })).toContainText("B");
});

test("een eigen type is daarna te hernoemen, en het icoon verandert mee", async ({ page }) => {
  const form = venster(page);
  await form.getByRole("button", { name: /Eigen/ }).click();
  await form.getByLabel(/^Naam$/).first().fill("Huiswerk");
  await form.getByRole("button", { name: "Type toevoegen" }).click();

  await form.getByRole("button", { name: /bewerken/ }).first().click();
  await form.getByLabel(/^Naam$/).first().fill("Schoolwerk");
  await form.getByRole("button", { name: "Opslaan" }).click();

  const types = form.getByRole("group", { name: "Type" });
  await expect(types.getByRole("button", { name: "Schoolwerk", exact: true })).toContainText("S");
  await expect(types.getByRole("button", { name: "Huiswerk", exact: true })).toHaveCount(0);
});

test("ook een standaardtype is te hernoemen en weer te herstellen", async ({ page }) => {
  const form = venster(page);
  const types = form.getByRole("group", { name: "Type" });

  await types.getByRole("button", { name: "Gym", exact: true }).click();
  await form.getByRole("button", { name: /bewerken/ }).first().click();
  await form.getByLabel(/^Naam$/).first().fill("Sporten");
  await form.getByRole("button", { name: "Opslaan" }).click();
  await expect(types.getByRole("button", { name: "Sporten", exact: true })).toBeVisible();

  await form.getByRole("button", { name: /bewerken/ }).first().click();
  await form.getByRole("button", { name: "Standaard herstellen" }).click();
  await expect(types.getByRole("button", { name: "Gym", exact: true })).toBeVisible();
});

test("de knoppen zijn groot genoeg om met een duim te raken", async ({ page }) => {
  // De kleurstippen waren 24 pixels; dat is kleiner dan een vingertop.
  const form = venster(page);
  const knoppen = form.getByRole("group", { name: "Type" }).getByRole("button");

  for (const knop of await knoppen.all()) {
    const doos = await knop.boundingBox();
    expect(doos, "elke typeknop heeft een raakvlak").not.toBeNull();
    expect(doos!.height).toBeGreaterThanOrEqual(44);
  }
});
