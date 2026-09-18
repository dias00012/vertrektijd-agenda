import { expect, test, type Page, type Route } from "@playwright/test";
import { AGENDA, WERK, zaai } from "./agenda";

/**
 * Marge per activiteit.
 *
 * `Activity.bufferMinutes` bestond al en `bufferFor` gebruikte hem al, maar er
 * was nergens een veld om hem in te vullen -- dus gold één marge voor alles.
 * Voor de sportschool is vijf minuten genoeg, voor school wil je er twintig.
 *
 * Precies het soort gat dat een rekentest niet vindt: de berekening werd al
 * getest, alleen kon niemand er iets in stoppen.
 */

/** Vaste reistijd, zodat alleen de marge het verschil maakt. */
function vasteReis(page: Page, minuten: number) {
  page.route("**/api/travel", async (route: Route) => {
    await route.fulfill({
      json: { durationMinutes: minuten, distanceKm: 30, provider: "test", mode: "transit" },
    });
  });
}

const venster = (page: Page) => page.locator('[role="dialog"]');
const kaart = (page: Page) => page.getByRole("region", { name: "Eerstvolgende activiteit" });

/*
 * De eerste drie delen dezelfde agenda. De vierde niet -- die heeft een vaste
 * plek nodig -- en dat kan niet in dezelfde opzet: `zaai` zet een script klaar
 * dat bij het laden draait en zichzelf daarna afschermt, dus een tweede aanroep
 * in de test zelf wordt gewoon overgeslagen. Vandaar een eigen blok.
 */
test.describe("met de standaardagenda", () => {
  test.beforeEach(async ({ page }) => {
    vasteReis(page, 54);
    await zaai(page);
  });

test("zonder eigen marge geldt die uit de instellingen", async ({ page }) => {
  await page.goto("/");
  // 09:00 min 54 minuten reizen min de algemene marge van 5.
  await expect(kaart(page)).toContainText("08:01");
});

test("een eigen marge verschuift de vertrektijd, en blijft na herladen staan", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("button", { name: /Werken bewerken/ }).first().click();

  const veld = venster(page).getByLabel("Marge voor deze activiteit");
  // Leeg, want deze activiteit volgt nog de instellingen. Het veld toont de
  // algemene waarde alleen als hint -- opslaan mag hem niet vastzetten.
  await expect(veld).toHaveValue("");
  await expect(veld).toHaveAttribute("placeholder", /5/);

  await veld.fill("20");
  await venster(page).getByRole("button", { name: "Opslaan" }).click();
  await expect(venster(page)).toHaveCount(0);

  // 09:00 min 54 minuten reizen min 20 marge.
  await page.goto("/");
  await expect(kaart(page)).toContainText("07:46");

  // En het blijft staan: dit wordt bewaard, niet alleen getoond.
  await page.reload();
  await expect(kaart(page)).toContainText("07:46");
});

test("de marge is terug te zetten op de algemene", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("button", { name: /Werken bewerken/ }).first().click();
  await venster(page).getByLabel("Marge voor deze activiteit").fill("20");
  await venster(page).getByRole("button", { name: "Opslaan" }).click();

  await page.getByRole("button", { name: /Werken bewerken/ }).first().click();
  const veld = venster(page).getByLabel("Marge voor deze activiteit");
  await expect(veld).toHaveValue("20");

  // Leegmaken betekent: volg de instellingen weer.
  await veld.fill("");
  await venster(page).getByRole("button", { name: "Opslaan" }).click();

  await page.goto("/");
  await expect(kaart(page)).toContainText("08:01");
});

});

test("een nieuwe activiteit krijgt de marge die je invult", async ({ page }) => {
  vasteReis(page, 54);
  /*
   * Aanmaken is een ander pad dan bewerken, en dat bleek ongedekt: haalde ik
   * de marge weg bij het aanmaken, dan bleven de andere tests groen. Dit is
   * het geval waarin je hem meteen goed zet in plaats van eerst opslaan en
   * daarna nog een keer bewerken.
   *
   * Met een vaste plek voor "werk", want het margeveld hoort bij reizen en
   * verschijnt pas zodra er een bestemming is.
   */
  await zaai(page, {
    ...AGENDA,
    settings: {
      ...AGENDA.settings,
      savedPlaces: [{ id: "p1", name: WERK.label, location: WERK }],
      // Op "school", want dat is de categorie waarmee het formulier opent en
      // die bepaalt de bestemming. Een andere categorie aanklikken haalt er
      // geen plek bij.
      categoryPlaces: { school: "p1" },
    },
    activities: [],
  });
  await page.goto("/agenda");
  await page.getByRole("button", { name: /Activiteit toevoegen|Toevoegen/ }).first().click();

  const form = venster(page);
  await form.getByLabel(/^Naam$/).first().fill("Wiskunde");
  await form.getByLabel("Marge voor deze activiteit").fill("25");
  // Bij een nieuwe activiteit heet de knop "Toevoegen", niet "Opslaan".
  await form.getByRole("button", { name: "Toevoegen" }).click();
  await expect(form).toHaveCount(0);

  // Terug in het formulier moet die 25 er nog staan -- opgeslagen, niet alleen
  // even getoond.
  await page.reload();
  await page.getByRole("button", { name: /Wiskunde bewerken/ }).first().click();
  await expect(venster(page).getByLabel("Marge voor deze activiteit")).toHaveValue("25");
});
