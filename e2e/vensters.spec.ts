import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

/**
 * Vensters zonder muis.
 *
 * Van de zeven vensters in de app reageerden er drie op Escape, zette er één de
 * focus naar binnen, hield er geen enkele de focus vast en bracht er geen
 * enkele hem terug. Dat laatste merk je het meest: je sluit een venster en
 * staat weer bovenaan de pagina in plaats van bij de knop waar je vandaan kwam.
 *
 * De rondleiding (`Tour`) doet hier bewust niet mee: die is `aria-modal="false"`
 * en navigeert juist door de app heen, dus een focusval zou hem breken.
 */

test.beforeEach(async ({ page }) => {
  await zaai(page);
});

test("het activiteitenformulier sluit met Escape", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Activiteit toevoegen" }).first().click();

  const venster = page.locator('[role="dialog"]');
  await expect(venster).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(venster).toHaveCount(0);
});

test("de focus staat in het venster zodra het opengaat", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Activiteit toevoegen" }).first().click();
  // Het formulier wordt pas opgehaald als je het opent, dus even wachten tot
  // het er is -- net als een gebruiker doet.
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  const inVenster = await page.evaluate(() => {
    const venster = document.querySelector('[role="dialog"]');
    return !!venster && venster.contains(document.activeElement);
  });
  expect(inVenster).toBe(true);
});

/**
 * De randen van de val, niet het midden.
 *
 * Eerst tabde deze test zestig keer en keek daarna of de focus nog binnen was.
 * Dat bewees niets: bij het muteren bleek hij ook te slagen met een kapotte
 * val, omdat je na genoeg keer tabben vanzelf weer ergens binnen uitkomt. De
 * vraag is wat er bij de láátste knop gebeurt, en bij de eerste.
 */
test("Tab springt van de laatste knop terug naar de eerste", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Activiteit toevoegen" }).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  const randen = async () =>
    page.evaluate(() => {
      const venster = document.querySelector('[role="dialog"]');
      if (!venster) return null;
      const velden = [
        ...venster.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      return { aantal: velden.length };
    });

  const info = await randen();
  expect(info?.aantal ?? 0).toBeGreaterThan(1);

  // Naar het laatste veld toe, dan één keer verder.
  await page.evaluate(() => {
    const venster = document.querySelector('[role="dialog"]')!;
    const velden = [
      ...venster.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
    velden[velden.length - 1].focus();
  });
  await page.keyboard.press("Tab");

  const opEerste = await page.evaluate(() => {
    const venster = document.querySelector('[role="dialog"]')!;
    const velden = [
      ...venster.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
    return velden[0] === document.activeElement;
  });
  expect(opEerste, "na de laatste knop hoort Tab op de eerste uit te komen").toBe(true);

  // En andersom: Shift+Tab vanaf de eerste hoort op de laatste te landen.
  await page.keyboard.press("Shift+Tab");
  const opLaatste = await page.evaluate(() => {
    const venster = document.querySelector('[role="dialog"]')!;
    const velden = [
      ...venster.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
    return velden[velden.length - 1] === document.activeElement;
  });
  expect(opLaatste, "voor de eerste knop hoort Shift+Tab op de laatste uit te komen").toBe(true);
});

test("de focus komt terug op de knop waarmee je het opende", async ({ page }) => {
  await page.goto("/schoolwerk");

  const bewerk = page.getByRole("button", { name: /bewerken/ }).first();
  await bewerk.focus();
  await bewerk.click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  const terug = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  expect(terug).toMatch(/bewerken/);
});

test("een blok in het weekrooster verschuift met Shift en de pijltjes", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("tab", { name: "Week" }).click();

  const blok = page.getByRole("button", { name: /Werken · 09:00 tot 17:00/ });
  await expect(blok).toBeVisible();
  await blok.focus();
  await page.keyboard.press("Shift+ArrowDown");

  // Een kwartier later, en de duur blijft gelijk.
  await expect(page.getByRole("button", { name: /Werken · 09:15 tot 17:15/ })).toBeVisible();
});
