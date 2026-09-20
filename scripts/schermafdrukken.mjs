/*
 * Maakt de schermafdrukken die in `manifest.webmanifest` staan.
 *
 * Android laat ze zien in de installatieprompt, en een PWA-listing heeft ze
 * nodig. Ze worden uit de echte app gehaald in plaats van met de hand gemaakt,
 * zodat ze niet stilletjes achterlopen op hoe de app eruitziet.
 *
 *   npm run build && npx next start -p 3210 &
 *   node scripts/schermafdrukken.mjs
 *
 * De agenda die je ziet is dezelfde verzonnen agenda als in de browsertests:
 * verzonnen adressen, echte vorm.
 */
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASIS = process.env.SCREENSHOT_URL ?? "http://localhost:3210";
const UIT = "public/screenshots";

const AGENDA = {
  settings: {
    // Bewust een station als vertrekpunt en niet de coördinaten uit de
    // browsertests: deze afbeeldingen gaan publiek de repo in, en een
    // vertrekpunt verraadt via de dichtstbijzijnde halte waar iemand woont.
    home: { label: "Almere Centrum", lat: 52.375, lon: 5.218 },
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    categoryOverrides: {},
    bufferMinutes: 5,
    travelMode: "transit",
  },
  activities: [
    {
      id: "werk",
      category: "werk",
      title: "Werken",
      date: "2026-09-17",
      startTime: "09:00",
      endTime: "17:00",
      location: { label: "Voorbeeldweg 184, Lelystad", lat: 52.5, lon: 5.47 },
      color: null,
      travelMode: null,
      recurrence: null,
      exceptions: [],
      travel: { durationMinutes: 54, distanceKm: 30, mode: "transit", provider: "motis" },
      returnTravel: { durationMinutes: 42, distanceKm: 30, mode: "transit", provider: "motis" },
      travelError: null,
      bufferMinutes: null,
      linkedTaskId: null,
      linkedExamId: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  tasks: [],
  exams: [],
};

const SCHERMEN = [
  { naam: "vandaag", pad: "/" },
  { naam: "agenda", pad: "/agenda" },
  { naam: "reisplanner", pad: "/reizen" },
];

async function maak(browser, { naam, breedte, hoogte, apparaat }) {
  const context = await browser.newContext({
    ...(apparaat ?? {}),
    viewport: { width: breedte, height: hoogte },
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-09-17T07:30:00+02:00"));
  await page.addInitScript((data) => {
    window.localStorage.setItem("agenda.settings.v1", JSON.stringify(data.settings));
    window.localStorage.setItem("agenda.activities.v1", JSON.stringify(data.activities));
    window.localStorage.setItem("agenda.tasks.v1", JSON.stringify(data.tasks));
    window.localStorage.setItem("agenda.exams.v1", JSON.stringify(data.exams));
    window.localStorage.setItem("agenda.language.v1", "nl");
    window.localStorage.setItem("agenda.intro.v1", JSON.stringify({ seen: true, tourSeen: true }));
  }, AGENDA);

  for (const scherm of SCHERMEN) {
    await page.goto(`${BASIS}${scherm.pad}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${UIT}/${naam}-${scherm.naam}.png` });
    console.log(`  ${UIT}/${naam}-${scherm.naam}.png`);
  }
  await context.close();
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
await mkdir(UIT, { recursive: true });
console.log("Schermafdrukken:");
await maak(browser, { naam: "telefoon", breedte: 412, hoogte: 915, apparaat: devices["Pixel 7"] });
await maak(browser, { naam: "breed", breedte: 1280, hoogte: 800 });
await browser.close();
