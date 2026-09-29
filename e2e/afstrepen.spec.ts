import { expect, test } from "@playwright/test";
import { AGENDA, DAG, zaai } from "./agenda";

/**
 * Afstrepen in je agenda.
 *
 * Doorstrepen kon de app al, maar alleen van één kant: je vinkte een stap af op
 * de schoolwerkpagina en dan streepte de agenda het bijbehorende blok door. In
 * de praktijk bleef daardoor bijna alles onafgestreept staan -- je bent klaar
 * met een blok, je kijkt naar je dag, en het enige wat je wilt is het aantikken.
 * En voor de helft van een agenda (boodschappen, de was, een leerblok waar geen
 * opdracht achter zit) bestond afstrepen helemaal niet.
 */

/** Een dag met werk dat aan een opdracht vastzit, en werk dat dat niet doet. */
const AGENDA_MET_LOSSE_BLOKKEN = {
  ...AGENDA,
  activities: [
    ...AGENDA.activities,
    {
      ...AGENDA.activities[0],
      id: "boodschappen",
      category: "hobby",
      title: "Boodschappen",
      date: DAG,
      startTime: "20:00",
      endTime: "20:30",
      location: null,
      travel: null,
      returnTravel: null,
      recurrence: null,
      linkedTaskId: null,
    },
    {
      ...AGENDA.activities[0],
      id: "leren",
      category: "school",
      title: "Opgaven maken",
      date: DAG,
      startTime: "21:00",
      endTime: "22:00",
      location: null,
      travel: null,
      returnTravel: null,
      recurrence: null,
      source: "leerplan",
      linkedTaskId: "t1",
      linkedStepId: "b",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await zaai(page, AGENDA_MET_LOSSE_BLOKKEN);
});

/** Het rondje naast een blok. */
const vinkje = (page: import("@playwright/test").Page, titel: string) =>
  page.getByRole("button", { name: `${titel} afstrepen` });

/** Staat er een streep door de titel van dit blok? */
async function gestreept(page: import("@playwright/test").Page, titel: string) {
  return page.evaluate((naam) => {
    const spans = [...document.querySelectorAll<HTMLElement>("span")].filter(
      (el) => el.textContent?.trim() === naam,
    );
    return spans.some((el) => getComputedStyle(el).textDecorationLine === "line-through");
  }, titel);
}

test("een blok zonder schoolwerk is met één tik afgestreept", async ({ page }) => {
  await page.goto("/");

  const rondje = vinkje(page, "Boodschappen");
  await expect(rondje).toHaveAttribute("aria-pressed", "false");
  expect(await gestreept(page, "Boodschappen")).toBe(false);

  await rondje.click();

  await expect(rondje).toHaveAttribute("aria-pressed", "true");
  expect(await gestreept(page, "Boodschappen")).toBe(true);
});

test("dat blijft zo na een herlading", async ({ page }) => {
  await page.goto("/");
  await vinkje(page, "Boodschappen").click();

  await page.reload();

  await expect(vinkje(page, "Boodschappen")).toHaveAttribute("aria-pressed", "true");
});

test("nog een tik en het staat weer open", async ({ page }) => {
  await page.goto("/");
  await vinkje(page, "Boodschappen").click();
  await expect(vinkje(page, "Boodschappen")).toHaveAttribute("aria-pressed", "true");

  await vinkje(page, "Boodschappen").click();

  await expect(vinkje(page, "Boodschappen")).toHaveAttribute("aria-pressed", "false");
  expect(await gestreept(page, "Boodschappen")).toBe(false);
});

test("een leerblok aantikken vinkt de stap in je schoolwerk af", async ({ page }) => {
  await page.goto("/");
  await vinkje(page, "Opgaven maken").click();
  await expect(vinkje(page, "Opgaven maken")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/schoolwerk");
  const kaart = page.locator("article").filter({ hasText: "Hoofdstuk 4" });
  // Was 1/2: de tweede stap is nu ook af, en daarmee de hele opdracht.
  await expect(kaart).toContainText("2/2");
  await expect(kaart.getByRole("checkbox", { name: /Opgaven maken/ })).toBeChecked();
});

test("een herhalend blok streep je af voor vandaag, niet voor elke week", async ({ page }) => {
  // Sporten staat er elke donderdag. Dat die van deze week gehad is, zegt niets
  // over volgende week.
  await page.goto("/");
  await vinkje(page, "Sporten").click();
  await expect(vinkje(page, "Sporten")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/agenda");
  await page.getByRole("tab", { name: "Week" }).click();
  await expect(page.getByRole("button", { name: /Sporten.*af$/ })).toBeVisible();

  await page.getByRole("button", { name: "Volgende week" }).click();
  await expect(page.getByRole("button", { name: /Sporten/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sporten.*af$/ })).toHaveCount(0);
});

test("in het weekraster gaat het via het formulier", async ({ page }) => {
  // Een blok in het weekraster is te smal voor een vinkje, en op een telefoon
  // toont het maandraster alleen stippen. Allebei openen ze het formulier, dus
  // staat het daar -- anders was het weekbeeld precies de plek waar je wél ziet
  // dat iets niet afgestreept is en er niets aan kunt doen.
  await page.goto("/agenda");
  await page.getByRole("tab", { name: "Week" }).click();

  await page.getByRole("button", { name: /Boodschappen/ }).click();
  const venster = page.getByRole("dialog");
  await expect(venster).toBeVisible();
  await venster.getByRole("checkbox", { name: "Dit is af" }).check();
  await venster.getByRole("button", { name: "Opslaan" }).click();

  await expect(page.getByRole("button", { name: /Boodschappen.*af$/ })).toBeVisible();
});

test("en dat vinkje zegt erbij welke stap het meeneemt", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("tab", { name: "Week" }).click();

  await page.getByRole("button", { name: /Opgaven maken/ }).click();
  const venster = page.getByRole("dialog");
  await expect(venster).toBeVisible();
  // Zonder deze regel verdwijnt er onverwacht een stap uit je opdracht.
  await expect(venster).toContainText("Streept ook de stap");
  await expect(venster).toContainText("Opgaven maken");
});
