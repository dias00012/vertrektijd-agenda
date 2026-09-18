import { defineConfig, devices } from "@playwright/test";

/**
 * Browsertests: de app zoals een gebruiker hem gebruikt.
 *
 * Alle andere tests in deze app rekenen: tijden, herhalingen, samenvoegen. Die
 * vangen veel, maar niet dit soort fouten -- een formulier dat een emoji eist,
 * een knop die te klein is om te raken, een type dat niet te bewerken is. Die
 * kwamen tot nu toe alleen boven water als iemand het toevallig zelf probeerde.
 *
 * Bewust een handjevol, geen dekking-om-de-dekking. Wat hier staat zijn de
 * dingen die kapot gaan zonder dat een unittest piept.
 */

const PORT = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: "./e2e",
  // Tests delen geen gegevens: elke test zaait zijn eigen localStorage.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "dot" : "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    // Alleen bewaren wat je nodig hebt als er iets misgaat.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    /*
     * Dezelfde tijdzone als de rekentests (`vitest.config.mts`).
     *
     * Stond vrij, en dat werkt zolang je niets over tijden toetst. Zodra dat
     * wel gebeurt -- en dat is precies waar deze app over gaat -- rekent de
     * browser in de tijdzone van de machine en de app in die van de gebruiker,
     * en dan zegt een test iets anders op een laptop dan op een server.
     */
    timezoneId: "Europe/Amsterdam",
    locale: "nl-NL",
  },

  projects: [
    {
      // Een echte telefoonmaat, want daar wordt de app op gebruikt. De smalste
      // die er nog toe doet: wat hier past, past overal.
      name: "telefoon",
      use: {
        ...devices["Pixel 7"],
        launchOptions: {
          // Sommige omgevingen hebben Chromium al staan op een vaste plek.
          // Zonder deze uitweg wil Playwright er zelf een downloaden.
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],

  // De productiebuild, niet `next dev`: die laadt anders en verbergt fouten
  // die alleen in de echte build opduiken.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
