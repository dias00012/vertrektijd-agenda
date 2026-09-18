import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

/**
 * Tekst die op een telefoon nergens staat.
 *
 * Een `title` is een tooltip: je ziet hem door met een muis stil te blijven
 * hangen. Op de telefoon waar deze app voor gemaakt is bestaat dat gebaar niet,
 * en een schermlezer leest hem hooguit als er verder niets is. Op twee plekken
 * was dat de enige plek waar de informatie stond.
 *
 * Deze tests draaien op een Pixel 7, dus zonder muis -- precies het geval dat
 * misging.
 */

test.describe("in het weekrooster", () => {
  test.beforeEach(async ({ page }) => {
    await zaai(page);
    await page.goto("/agenda");
    await page.getByRole("tab", { name: "Week" }).click();
  });

  /**
   * Het reisblokje toont de vertrektijd alleen als het hoog genoeg is voor
   * tekst. Bij een korte rit is het te laag, en dan bleef er een knop over met
   * helemaal niets erin -- geen tekst om te lezen, geen naam om voor te lezen.
   */
  test("heeft het reisblok een naam met de vertrektijd erin", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Vertrekken om \d\d:\d\d/ }).first()).toBeVisible();
  });

  /** Een kort blok toont alleen een emoji, en die telt niet als naam. */
  test("heeft elk blok in het rooster een naam", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Werken · \d\d:\d\d tot \d\d:\d\d/ })).toBeVisible();
  });
});

test.describe("in de reisplanner", () => {
  /**
   * "Laatste rit vanavond" doet iets anders dan een tijd invullen, en wat het
   * precies doet stond alleen in een tooltip. Dus las je op je telefoon alleen
   * de knoptekst en moest je maar gokken.
   */
  test("staat de uitleg bij 'laatste rit vanavond' gewoon op het scherm", async ({ page }) => {
    await zaai(page);
    await page.goto("/reizen");

    const knop = page.getByRole("button", { name: "Laatste rit vanavond" });
    await expect(knop).toBeVisible();
    await expect(page.getByText(/laatste rit die je vóór middernacht/)).toBeVisible();
  });
});
