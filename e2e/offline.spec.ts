import { expect, test, type Page } from "@playwright/test";
import { zaai } from "./agenda";

/**
 * De app opent zonder bereik.
 *
 * Dat is geen extraatje maar de kern: dit is een reis-app, en juist in de
 * trein, in een tunnel of op een station met slecht bereik wil je zien hoe
 * laat je moet vertrekken. De service worker doet dat al -- er stond alleen
 * niets op dat bewaakte dat het zo blijft. Eén verkeerde wijziging en het is
 * stil kapot; je merkt het pas ondergronds, precies wanneer je er niets meer
 * aan kunt doen.
 *
 * De lijst met voor te laden schermen wordt apart bewaakt, in
 * `src/lib/nav.test.ts`: die staat noodgedwongen op twee plekken.
 */

/** Wacht tot de service worker de pagina echt bestuurt. */
async function workerKlaar(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  });
}

test("je agenda opent zonder bereik", async ({ page, context }) => {
  await zaai(page);
  // Eerst met bereik, zodat de worker zich installeert en de schermen
  // voorlaadt.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Vandaag" })).toBeVisible();
  await workerKlaar(page);

  // En dan de tunnel in.
  await context.setOffline(true);
  await page.goto("/agenda");

  // Niet alleen "de pagina laadt": je gegevens staan er ook. Die komen uit je
  // eigen opslag, dus zonder bereik verandert daar niets aan.
  await expect(page.getByRole("heading", { name: "Werken" })).toBeVisible({ timeout: 20_000 });
});

test("ook een scherm dat je nog niet geopend had", async ({ page, context }) => {
  /*
   * Dit is waar het eerder op misging: binnen de app wisselt een tab zonder
   * echte navigatie, dus de worker zag die schermen nooit langskomen en had ze
   * niet bewaard. Wie zijn agenda altijd via het menu opende, kreeg zonder
   * bereik de offline-pagina -- terwijl zijn gegevens gewoon op het apparaat
   * stonden. Vandaar de voorlaadlijst, en vandaar deze test.
   */
  await zaai(page);
  await page.goto("/");
  await workerKlaar(page);

  await context.setOffline(true);
  // Schoolwerk is in deze test nooit geopend geweest.
  await page.goto("/schoolwerk");
  await expect(page.getByRole("heading", { name: "Hoofdstuk 4" })).toBeVisible({
    timeout: 20_000,
  });
});
