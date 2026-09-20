import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

/**
 * Twee talen, maar niet allebei tegelijk ophalen.
 *
 * Ze stonden in één bestand, dus haalde elke gebruiker ze allebei op --
 * ongeveer 45 kB die een Nederlandse gebruiker nooit leest. Engels zit nu in
 * een eigen bestand dat pas wordt geladen als je die taal kiest.
 *
 * Dat is precies het soort wijziging waarbij het scherm stilletjes in de
 * verkeerde taal kan blijven staan, dus staat hier dat allebei de kanten nog
 * werken.
 */

test("een Nederlandse gebruiker haalt de Engelse teksten niet op", async ({ page }) => {
  const opgehaald: string[] = [];
  page.on("response", async (r) => {
    if (!r.url().endsWith(".js")) return;
    try {
      const tekst = (await r.body()).toString("utf8");
      // Een zin die alleen in de Engelse tabel staat.
      if (tekst.includes("Always know when to leave")) opgehaald.push(r.url());
    } catch {}
  });

  await zaai(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Vandaag" })).toBeVisible();
  expect(opgehaald, "de Engelse tabel hoort er niet bij te zitten").toEqual([]);
});

test("in het Engels staat het scherm ook echt in het Engels", async ({ page }) => {
  await zaai(page, undefined, undefined, "en");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  // En niet half: de ondertitel hoort mee te gaan.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("van taal wisselen werkt binnen het scherm", async ({ page }) => {
  await zaai(page);
  await page.goto("/instellingen");

  // De instellingen staan in uitklapbare rijen; eerst die van de taal opendoen.
  await page.getByRole("button", { name: /Taal/ }).click();
  await page.getByRole("button", { name: /English/ }).click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
