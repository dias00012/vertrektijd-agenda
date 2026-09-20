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
