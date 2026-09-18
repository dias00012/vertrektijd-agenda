import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

test.beforeEach(async ({ page }) => {
  await zaai(page);
});

test("achterstallig werk valt op en is met één tik te vinden", async ({ page }) => {
  await page.goto("/schoolwerk");

  const melding = page.getByRole("button", { name: /over tijd/i }).first();
  await expect(melding).toBeVisible();

  await melding.click();
  // Alleen wat over tijd is blijft staan.
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText("Excel week 1");
});

test("een stap afvinken zet de opdracht op bezig", async ({ page }) => {
  await page.goto("/schoolwerk");

  const kaart = page.locator("article").filter({ hasText: "Hoofdstuk 4" });
  await expect(kaart).toContainText("1/2");

  await kaart.getByRole("checkbox", { name: /Opgaven maken/ }).check();

  await expect(kaart).toContainText("2/2");
  // Alle stappen af: de opdracht gaat vanzelf naar "klaar".
  await expect(kaart.getByRole("button", { name: "Klaar", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("het filter onthoudt je keuze na een herlading", async ({ page }) => {
  await page.goto("/schoolwerk");
  await page.getByRole("button", { name: /^Te doen/ }).first().click();
  await expect(page.getByRole("button", { name: /^Te doen/ }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.getByRole("button", { name: /^Te doen/ }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("de prioriteit is voor te lezen, niet alleen een bolletje", async ({ page }) => {
  /*
   * De prioriteit stond alleen in een gekleurd bolletje, met de uitleg in een
   * `title`. Op een telefoon zie je een tooltip nooit, en `aria-hidden` hield
   * hem ook bij een schermlezer weg -- terwijl "hoog" of "later" juist bepaalt
   * waar je aan begint. De informatie was er dus voor niemand behalve wie met
   * een muis stil bleef hangen.
   */
  await page.goto("/schoolwerk");

  const kaart = page.locator("article").filter({ hasText: "Hoofdstuk 4" });
  // Onzichtbaar op het scherm, maar wel in de toegankelijkheidsboom.
  await expect(kaart.getByText(/Prioriteit:/)).toBeAttached();
});
