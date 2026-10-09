import { expect, test } from "@playwright/test";
import { AGENDA, zaai } from "./agenda";

/**
 * Zoeken in je schoolwerk.
 *
 * De knoppenfilters helpen zolang je weet in welk hokje iets zit. De vraag die
 * je werkelijk stelt is een andere: "waar stond die casus ook alweer". Met een
 * semester aan opdrachten scrol je daar anders aan voorbij.
 */

const SCHOOLWERK = {
  ...AGENDA,
  tasks: [
    ...AGENDA.tasks,
    {
      id: "be5",
      subject: "Bedrijfseconomie",
      title: "BE week 5 – Eigen vermogen",
      deadline: "2026-09-25",
      estimatedMinutes: 120,
      priority: "medium",
      status: "doing",
      steps: [{ id: "a", title: "T8.4 Aandelenkapitaal", done: false }],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  exams: [
    {
      id: "nltoets",
      subject: "Nederlands",
      title: "Toets congruentie",
      date: "2026-09-30",
      topics: ["Samenstellingen"],
      priority: "high",
      status: "todo",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await zaai(page, SCHOOLWERK);
  await page.goto("/schoolwerk");
});

const zoekveld = (page: import("@playwright/test").Page) =>
  page.getByRole("textbox", { name: "Zoeken in je schoolwerk" });

test("zoeken laat alleen houden wat erbij past", async ({ page }) => {
  await expect(page.locator("article")).toHaveCount(4);

  await zoekveld(page).fill("excel");

  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText("Excel week 1");
});

test("je mag ook op een stap zoeken", async ({ page }) => {
  // Daar zit het detail dat je je herinnert; de opdracht heet heel anders.
  await zoekveld(page).fill("aandelenkapitaal");

  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText("BE week 5");
});

test("en toetsen doen gewoon mee", async ({ page }) => {
  await zoekveld(page).fill("congruentie");

  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText("Toets congruentie");
});

test("de tellingen op de knoppen volgen je zoekopdracht", async ({ page }) => {
  // Een knop die (4) belooft terwijl er één overblijft, liegt.
  const statusfilter = page.getByRole("group", { name: "Waar wil je naar kijken?" });
  await expect(statusfilter.getByRole("button", { name: "Alles (4)" })).toBeVisible();
  await expect(statusfilter.getByRole("button", { name: "Te doen (3)" })).toBeVisible();

  await zoekveld(page).fill("excel");

  await expect(statusfilter.getByRole("button", { name: "Alles (1)" })).toBeVisible();
  await expect(statusfilter.getByRole("button", { name: "Te doen (1)" })).toBeVisible();
});

test("niets gevonden zegt dat, en is met één tik weer weg", async ({ page }) => {
  await zoekveld(page).fill("scheikunde");

  await expect(page.getByText(/Niets gevonden voor/)).toBeVisible();
  // Geen letterlijke \u{...} op het scherm. Een JSX-attribuut verwerkt geen
  // escapes, dus `icon="\u{1F50D}"` zet die tekens er gewoon neer -- en dat
  // zie je pas als je ernaar kijkt, niet in een test die alleen tekst leest.
  await expect(page.getByText(/\\u\{/)).toHaveCount(0);
  // Met de filters erbij genoemd: dat is de echte valkuil.
  await expect(page.getByText(/filters hierboven/)).toBeVisible();

  await page.getByRole("button", { name: "Zoekopdracht wissen" }).first().click();

  await expect(page.locator("article")).toHaveCount(4);
  await expect(zoekveld(page)).toHaveValue("");
});

test("Escape wist het veld", async ({ page }) => {
  await zoekveld(page).fill("excel");
  await zoekveld(page).press("Escape");

  await expect(zoekveld(page)).toHaveValue("");
  await expect(page.locator("article")).toHaveCount(4);
});
