import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

/**
 * Elke knop moet met een duim te raken zijn.
 *
 * Deze test liep er eerst overheen en vond 28 knoppen kleiner dan 40 pixels,
 * waarvan de kleinste 12 bij 14 was: het kruisje om een bestemming te wissen.
 * Dat zijn niet de zeldzame knoppen maar juist de dagelijkse -- het
 * statusfilter, "Te doen / Bezig / Klaar", de snelkeuzes in de reisplanner.
 *
 * 44 is de maat die Apple aanhoudt en die `types.spec.ts` al afdwong voor de
 * typeknoppen; hier geldt hij voor de hele app. Deze test draait op een Pixel 7,
 * dus met een echte telefoonbreedte: wat hier past, past overal.
 */

/** Wat mag klein blijven, en waarom. */
const UITZONDERINGEN = [
  // Een aanvinkvakje is een vakje: het label ernaast hoort bij het raakvlak en
  // dat meten we hier niet mee.
  "checkbox",
];

const SCHERMEN = ["/", "/agenda", "/reizen", "/schoolwerk", "/instellingen"];

for (const pad of SCHERMEN) {
  test(`alle knoppen op ${pad} zijn groot genoeg`, async ({ page }) => {
    await zaai(page);
    await page.goto(pad);
    await page.waitForLoadState("networkidle");

    const teKlein: string[] = [];
    for (const knop of await page.getByRole("button").all()) {
      if (!(await knop.isVisible())) continue;
      const rol = await knop.getAttribute("role");
      if (rol && UITZONDERINGEN.includes(rol)) continue;

      const doos = await knop.boundingBox();
      if (!doos) continue;
      if (doos.width < 44 || doos.height < 44) {
        const naam =
          (await knop.getAttribute("aria-label")) ??
          (await knop.textContent())?.trim().slice(0, 40) ??
          "(naamloos)";
        teKlein.push(`"${naam}" is ${Math.round(doos.width)}x${Math.round(doos.height)}`);
      }
    }

    expect(teKlein, `te kleine knoppen op ${pad}`).toEqual([]);
  });
}

/**
 * De instellingen staan in uitklapbare rijen, en wat dicht zit meet de test
 * hierboven niet. Juist daar zitten knoppen die je zelden ziet en dus nooit
 * opvielen.
 */
test("ook de knoppen in de uitgeklapte instellingen zijn groot genoeg", async ({ page }) => {
  await zaai(page);
  await page.goto("/instellingen");
  await page.waitForLoadState("networkidle");

  // Alles opendoen wat opengaat.
  for (const rij of await page.getByRole("button", { expanded: false }).all()) {
    if (await rij.isVisible()) await rij.click().catch(() => {});
  }
  await page.waitForTimeout(300);

  const teKlein: string[] = [];
  for (const knop of await page.getByRole("button").all()) {
    if (!(await knop.isVisible())) continue;
    const doos = await knop.boundingBox();
    if (!doos) continue;
    if (doos.width < 44 || doos.height < 44) {
      const naam =
        (await knop.getAttribute("aria-label")) ??
        (await knop.textContent())?.trim().slice(0, 40) ??
        "(naamloos)";
      teKlein.push(`"${naam}" is ${Math.round(doos.width)}x${Math.round(doos.height)}`);
    }
  }

  expect(teKlein).toEqual([]);
});
