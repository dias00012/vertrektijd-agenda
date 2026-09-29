import { expect, test } from "@playwright/test";
import { AGENDA, DAG, zaai } from "./agenda";

/**
 * Werk dat af is, hoort doorgestreept in het weekrooster te staan.
 *
 * Dat werkte, maar alleen bij blokken die hoog genoeg zijn voor tekst. Onder de
 * 34 pixels toont een blok alleen de emoji van zijn type, en dan is er niets om
 * door te strepen -- bij 56 pixels per uur is dat alles korter dan ongeveer
 * 36 minuten. Een leerblok van een half uur is de gewoonste zaak van de wereld,
 * dus in de praktijk zag je bij de helft van je blokken niet dat je klaar was.
 */

/** Een afgevinkte opdracht met twee leerblokken: een lang en een kort. */
const MET_AFGEROND = {
  ...AGENDA,
  tasks: [
    {
      id: "af",
      subject: "Bedrijfseconomie",
      title: "Hoofdstuk 4",
      deadline: "2026-09-25",
      estimatedMinutes: 90,
      priority: "high",
      status: "done",
      steps: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "open",
      subject: "Communicatie",
      title: "Rapport",
      deadline: "2026-09-30",
      estimatedMinutes: 60,
      priority: "medium",
      status: "todo",
      steps: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  exams: [],
  activities: [
    {
      ...AGENDA.activities[0],
      id: "lang",
      title: "Lang leerblok",
      category: "school",
      date: DAG,
      startTime: "10:00",
      endTime: "11:30",
      location: null,
      travel: null,
      returnTravel: null,
      source: "leerplan",
      linkedTaskId: "af",
    },
    {
      ...AGENDA.activities[0],
      id: "kort-open",
      title: "Kort en nog niet af",
      category: "school",
      date: DAG,
      startTime: "15:00",
      endTime: "15:30",
      location: null,
      travel: null,
      returnTravel: null,
      source: "leerplan",
      linkedTaskId: "open",
    },
    {
      ...AGENDA.activities[0],
      id: "kort",
      title: "Kort leerblok",
      category: "school",
      date: DAG,
      startTime: "13:00",
      endTime: "13:30",
      location: null,
      travel: null,
      returnTravel: null,
      source: "leerplan",
      linkedTaskId: "af",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await zaai(page, MET_AFGEROND);
  await page.goto("/agenda");
  await page.getByRole("tab", { name: "Week" }).click();
});

/**
 * Is aan dit blok te zien dat het werk af is?
 *
 * Twee manieren, want een kort blok heeft geen tekst: een streep door de titel,
 * of een vinkje in plaats van de emoji van het type. Allebei tellen -- het gaat
 * erom dát je het ziet.
 */
async function ziekAf(page: import("@playwright/test").Page, naam: RegExp) {
  return page.evaluate((patroon) => {
    const knop = [...document.querySelectorAll("button")].find((b) =>
      new RegExp(patroon).test(b.getAttribute("aria-label") ?? ""),
    );
    if (!knop) return "geen blok gevonden";
    const tekst = knop.textContent?.trim() ?? "";
    const gestreept = [...knop.querySelectorAll<HTMLElement>("*")].some(
      (el) => getComputedStyle(el).textDecorationLine === "line-through",
    );
    if (gestreept) return "af";
    if (tekst.includes("\u2713")) return "af";
    return `niet af (inhoud: "${tekst}")`;
  }, naam.source);
}

test("een lang leerblok van een afgeronde opdracht is doorgestreept", async ({ page }) => {
  expect(await ziekAf(page, /Lang leerblok/)).toBe("af");
});

test("een kort leerblok van een afgeronde opdracht óók", async ({ page }) => {
  expect(await ziekAf(page, /Kort leerblok/)).toBe("af");
});

/** En een schermlezer hoort het ook: die ziet geen streep en geen vinkje. */
test("een schermlezer hoort dat het werk af is", async ({ page }) => {
  for (const naam of ["Lang leerblok", "Kort leerblok"]) {
    await expect(page.getByRole("button", { name: new RegExp(`${naam}.*af`) })).toBeVisible();
  }
});

/** Andersom: werk dat nog niet af is hoort er gewoon uit te zien. */
test("een kort blok van werk dat nog moet, ziet er niet uit als af", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Kort en nog niet af/ })).toBeVisible();
  expect(await ziekAf(page, /Kort en nog niet af/)).toContain("niet af");
});
