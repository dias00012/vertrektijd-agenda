import { expect, test, type Page, type Route } from "@playwright/test";
import { AGENDA, DAG, NU, THUIS, zaai } from "./agenda";

/**
 * De reisplanner. Drie dingen die pas opvielen toen ik hem tegen de echte
 * dienst hield en de antwoorden naast het scherm legde.
 *
 * De OV-dienst wordt hier niet gebeld: met een echte dienstregeling zegt deze
 * test morgen iets anders, en dan weet je bij rood niet of jouw app stuk is of
 * hun trein. Wat hier binnenkomt is nagemaakt, maar wel precies zoals de echte
 * planner het teruggaf.
 */

const ZWOLLE = { lat: 52.5047, lon: 6.0913 };

/** Eén rit, in de vorm die `/api/journeys` teruggeeft. */
function rit(id: string, vertrek: string, aankomst: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    departure: vertrek,
    arrival: aankomst,
    durationMinutes: Math.round(
      (Date.parse(aankomst) - Date.parse(vertrek)) / 60_000,
    ),
    transfers: 0,
    legs: [
      {
        mode: "rail",
        durationMinutes: 41,
        from: "Almere Centrum",
        to: "Zwolle",
        departure: vertrek,
        arrival: aankomst,
        line: "Intercity",
        track: "4",
        realTime: true,
        cancelled: false,
      },
    ],
    delayMinutes: 0,
    realTime: true,
    cancelled: false,
    ...patch,
  };
}

function vangRitten(page: Page, journeys: unknown[]) {
  /** Wat er gevraagd is; zo kan een test ook de vraag zelf toetsen. */
  const gevraagd: { body?: { time?: string; arriveBy?: boolean } } = {};
  page.route("**/api/journeys", async (route: Route) => {
    gevraagd.body = route.request().postDataJSON();
    await route.fulfill({ json: { journeys, meta: { received: journeys.length } } });
  });
  return gevraagd;
}

/** Naar de planner, met de bestemming en de aankomsttijd al ingevuld. */
async function open(page: Page, arriveBy?: string) {
  const q = new URLSearchParams({
    toLat: String(ZWOLLE.lat),
    toLon: String(ZWOLLE.lon),
    toLabel: "Zwolle",
    ...(arriveBy ? { arriveBy } : {}),
  });
  await page.goto(`/reizen?${q}`);
  await page.getByRole("button", { name: "Zoek reis" }).click();
}

const opties = (page: Page) => page.getByRole("region", { name: "Reismogelijkheden" });

test("bij 'uiterlijk aankomen om' is de laatste rit die het haalt aangewezen", async ({
  page,
}) => {
  /*
   * De lijst staat op vertrektijd, zoals een vertrekbord. Bij "ik moet om
   * 14:00 in Zwolle zijn" betekent dat: bovenaan staat de rit die je er twee
   * uur te vroeg afzet, en onderaan staat het antwoord op je vraag.
   *
   * Niet omgedraaid maar gemarkeerd: de volgorde van een vertrekbord is
   * vertrouwd, en "eerder" en "later" blijven kloppen.
   */
  vangRitten(page, [
    rit("a", `${DAG}T09:01:00.000Z`, `${DAG}T09:48:00.000Z`),
    rit("b", `${DAG}T10:01:00.000Z`, `${DAG}T10:48:00.000Z`),
    rit("c", `${DAG}T11:01:00.000Z`, `${DAG}T11:48:00.000Z`),
    // Deze zou het niet meer halen.
    rit("d", `${DAG}T12:01:00.000Z`, `${DAG}T12:48:00.000Z`),
  ]);
  await zaai(page);
  // Uiterlijk om 14:00 lokaal binnen zijn.
  await open(page, `${DAG}T12:00:00.000Z`);

  const kaarten = opties(page).locator("article");
  await expect(kaarten).toHaveCount(4);

  // De derde haalt het nog (13:48 lokaal), de vierde niet meer (14:48).
  await expect(kaarten.nth(2)).toContainText("laatste op tijd");
  await expect(kaarten.nth(0)).not.toContainText("laatste op tijd");
  await expect(kaarten.nth(3)).not.toContainText("laatste op tijd");
});

test("een rit van morgen laat zien dat hij van morgen is", async ({ page }) => {
  /*
   * Zoek je 's avonds om kwart over elf een rit terug, dan zijn vijf van de
   * zes opties van morgen. Op de kaart stond alleen "05:40", en dat leest als
   * een vroege trein in plaats van als een rit over zes uur.
   */
  const morgen = "2026-09-18";
  vangRitten(page, [
    // Vanavond, en hij komt na middernacht aan.
    rit("vanavond", `${DAG}T21:40:00.000Z`, `${DAG}T22:29:00.000Z`),
    // Morgenochtend.
    rit("morgen", `${morgen}T03:40:00.000Z`, `${morgen}T04:29:00.000Z`),
  ]);
  // Gezocht om kwart over elf 's avonds.
  await zaai(page, AGENDA, `${DAG}T23:15:00+02:00`);
  await open(page);

  const kaarten = opties(page).locator("article");
  // De rit van vanavond komt na middernacht aan: dat hoort erbij te staan.
  await expect(kaarten.nth(0)).toContainText("+1");
  await expect(kaarten.nth(0)).not.toContainText("Morgen");
  // En die van morgenochtend draagt de dag.
  await expect(kaarten.nth(1)).toContainText("Morgen");
});

test("het spoor staat er in de taal van de app", async ({ page }) => {
  /*
   * In de lijst stond `spoor ${leg.track}` hardgecodeerd, terwijl de vertaling
   * bestond en het detailscherm hem gewoon gebruikte. Een Engelse gebruiker
   * las dus "spoor 4" in de lijst en "platform 4" als hij doorklikte.
   *
   * Daarom in het Engels: in het Nederlands is de hardgecodeerde tekst
   * toevallig gelijk aan de vertaling, en dan slaagt deze test ook met de
   * fout er nog in -- dat had ik eerst staan.
   */
  vangRitten(page, [rit("a", `${DAG}T07:01:00.000Z`, `${DAG}T07:48:00.000Z`)]);
  await zaai(page, { ...AGENDA, settings: { ...AGENDA.settings, home: THUIS } }, NU, "en");
  await page.goto(
    `/reizen?toLat=${ZWOLLE.lat}&toLon=${ZWOLLE.lon}&toLabel=Zwolle`,
  );
  await page.getByRole("button", { name: "Find journeys" }).click();

  const lijst = page.getByRole("region", { name: "Journey options" });
  // Uitklappen: de onderdelen van de rit staan onder de kaart.
  await lijst.locator("article").first().getByRole("button").first().click();
  await expect(lijst).toContainText("platform 4");
  await expect(lijst).not.toContainText("spoor");
});

test("'laatste rit vanavond' vraagt om aankomst vóór middernacht", async ({ page }) => {
  /*
   * "Hoe laat moet ik uiterlijk weg om vanavond nog thuis te komen" is de
   * vraag die je 's avonds op school stelt, en daarvoor moest je zelf een
   * tijdstip invullen.
   *
   * Onder water is het een gewone zoekopdracht op aankomst met middernacht
   * als grens -- dus wijst het merkje "laatste op tijd" vanzelf de goede rit
   * aan. Deze test kijkt naar allebei: de vraag én het antwoord.
   */
  const gevraagd = vangRitten(page, [
    rit("vroeg", `${DAG}T18:00:00.000Z`, `${DAG}T18:47:00.000Z`),
    // Komt om 23:47 lokaal aan: haalt het net.
    rit("laatste", `${DAG}T21:00:00.000Z`, `${DAG}T21:47:00.000Z`),
    // Komt na middernacht aan: haalt het niet meer.
    rit("teLaat", `${DAG}T22:30:00.000Z`, `${DAG}T23:17:00.000Z`),
  ]);
  await zaai(page);
  await page.goto(`/reizen?toLat=${ZWOLLE.lat}&toLon=${ZWOLLE.lon}&toLabel=Zwolle`);
  await page.getByRole("button", { name: "Laatste rit vanavond" }).click();

  // Er is om aankomst gevraagd, met het einde van vandaag als grens.
  await expect.poll(() => gevraagd.body?.arriveBy).toBe(true);
  expect(gevraagd.body?.time?.startsWith(DAG.slice(0, 8))).toBe(true);

  const kaarten = opties(page).locator("article");
  await expect(kaarten).toHaveCount(3);
  await expect(kaarten.nth(1)).toContainText("laatste op tijd");
  await expect(kaarten.nth(2)).not.toContainText("laatste op tijd");
});

test("een gevonden rit is vanuit de planner in je agenda te zetten", async ({ page }) => {
  /*
   * Van de agenda naar de planner kon al; deze kant niet. Een rit die je net
   * gevonden had tikte je alsnog met de hand over.
   *
   * Het gewone formulier gaat open met de bestemming en de aankomsttijd erin.
   * Niet stilletjes een activiteit aanmaken: welk type het is en hoe het heet
   * weet alleen jij.
   */
  vangRitten(page, [rit("a", `${DAG}T06:01:00.000Z`, `${DAG}T06:48:00.000Z`)]);
  await zaai(page);
  await page.goto(`/reizen?toLat=${ZWOLLE.lat}&toLon=${ZWOLLE.lon}&toLabel=Zwolle`);
  await page.getByRole("button", { name: "Zoek reis" }).click();

  // De knop zit in het uitgeklapte deel: op de dichte kaart telt elke regel.
  const kaart = opties(page).locator("article").first();
  await expect(kaart.getByRole("button", { name: "Zet in agenda" })).toHaveCount(0);
  await kaart.getByRole("button").first().click();
  await kaart.getByRole("button", { name: "Zet in agenda" }).click();

  // Begintijd is je aankomst (08:48 lokaal), bestemming staat er al in.
  const form = page.locator('[role="dialog"]');
  await expect(form.getByLabel("Starttijd")).toHaveValue("08:48");
  await expect(form.getByRole("textbox", { name: /Locatie/ })).toHaveValue("Zwolle");

  await form.getByLabel(/^Naam$/).first().fill("Open dag");
  await form.getByRole("button", { name: "Toevoegen" }).click();
  await expect(form).toHaveCount(0);

  // En hij staat er echt in.
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Open dag" })).toBeVisible();
});
