import { expect, test, type Page, type Route } from "@playwright/test";
import { AGENDA, DAG, THUIS, zaai } from "./agenda";

/**
 * "Hoe laat moet ik weg" -- waar deze app voor bestaat.
 *
 * Er waren tien browsertests en geen enkele raakte dit. Ze gingen over
 * schoolwerk, types en leertijd, terwijl juist hier de fouten zaten die gemeld
 * werden: een vertrektijd die er niet stond, een tijd van gisteravond die
 * bleef staan, een reistijd die de app zelf invulde.
 *
 * De OV-dienst wordt hier niet echt gebeld. Dat is geen versimpeling maar een
 * voorwaarde: een test die van een dienstregeling afhangt zegt morgen iets
 * anders, en dan weet je bij rood niet of jouw app stuk is of hun trein.
 */

/** Wat uit de opgeslagen reis volgt: 54 minuten heen, 5 minuten marge. */
const OPGESLAGEN_VERTREK = "08:01";

/**
 * De sleutels van de rit naar het werk op de testdag.
 *
 * Letterlijk overgenomen uit `travelPlanForDate`. Dat lijkt broos, en dat is
 * het ook -- met opzet: klopt de sleutel niet meer, dan valt deze test om, en
 * dat wil je weten. De sleutel bepaalt namelijk of de app denkt dat een
 * opgeslagen reis nog over dezelfde rit gaat.
 *
 * Hiermee staat de gemelde situatie exact na: een reis waarvan de sleutel nog
 * klopt, maar die van gisteravond is.
 *
 * Wat deze test níét doet: aanwijzen wélke laag hem ververst heeft. Twee lagen
 * doen dit werk -- de achtergrondberekening in `useAgenda` en de dag-hook
 * `useOccurrenceTravel` -- en allebei verversen ze op ouderdom. Zet er één uit
 * en de ander doet het; op het scherm zie je hetzelfde. Dat is hier ook precies
 * goed: dit toetst wat de gebruiker ziet. De losse beslissing ("moet deze rit
 * opgehaald worden") staat als `refreshDecision` in de rekentests.
 */
const HEEN = "52.38740,5.26530>52.50000,5.47000@transit@2026-09-17T06:55:00.000Z";
const TERUG = "52.50000,5.47000>52.38740,5.26530@transit@2026-09-17T15:00:00.000Z";

/** Gisteravond uitgerekend: de sleutel klopt nog, de tijden zijn oud. */
const GISTERAVOND = "2026-09-16T20:00:00.000Z";

function agendaMetOudeRit() {
  const [werk, ...rest] = AGENDA.activities;
  return {
    ...AGENDA,
    activities: [
      {
        ...werk,
        travel: { ...werk.travel, key: HEEN, computedAt: GISTERAVOND },
        returnTravel: { ...werk.returnTravel, key: TERUG, computedAt: GISTERAVOND },
      },
      ...rest,
    ],
  };
}

/**
 * Onderschept `/api/travel` en antwoordt met vaste reistijden.
 *
 * Heen of terug is te zien aan de bestemming: de terugreis gaat naar huis.
 * Geeft een teller terug, zodat een test ook kan vaststellen dat er juist
 * *niet* gebeld is.
 */
function vangReis(page: Page, minuten: { heen: number; terug: number }) {
  const geteld = { aantal: 0 };
  page.route("**/api/travel", async (route: Route) => {
    geteld.aantal += 1;
    const body = route.request().postDataJSON() as { to?: { label?: string } };
    const naarHuis = body?.to?.label === THUIS.label;
    await route.fulfill({
      json: {
        durationMinutes: naarHuis ? minuten.terug : minuten.heen,
        distanceKm: 30,
        provider: "test",
        mode: "transit",
      },
    });
  });
  return geteld;
}

/** Laat de mislukking zien die de app moet opvangen. */
function laatReisMislukken(page: Page) {
  const geteld = { aantal: 0 };
  page.route("**/api/travel", async (route: Route) => {
    geteld.aantal += 1;
    await route.fulfill({ status: 500, json: { error: "de planner ligt eruit" } });
  });
  return geteld;
}

const kaart = (page: Page) => page.getByRole("region", { name: "Eerstvolgende activiteit" });

test("de rit van vanochtend wint van een berekening van gisteravond", async ({ page }) => {
  /*
   * De gemelde fout: de sleutel klopte nog, dus er werd niets meer opgehaald,
   * en de vertrektijd van gisteravond stond er vanochtend nog -- met "op tijd"
   * erbij, terwijl de trein een kwartier later reed. Juist de eerstvolgende
   * activiteit, waar je op afgaat, raakte zo nooit ververst.
   */
  const geteld = vangReis(page, { heen: 70, terug: 40 });
  await zaai(page, agendaMetOudeRit());
  await page.goto("/");

  // 09:00 min 70 minuten reizen min 5 minuten marge.
  await expect(kaart(page)).toContainText("07:45");
  await expect(kaart(page)).not.toContainText(OPGESLAGEN_VERTREK);
  expect(geteld.aantal).toBeGreaterThan(0);
});

test("een mislukte ophaalpoging laat de opgeslagen tijd staan, met een notitie erbij", async ({
  page,
}) => {
  /*
   * Deze test vond een echte fout, en dat was precies waarvoor hij geschreven
   * is. Bij een hapering van de planner gooide de app de laatst bekende
   * reistijden wég (`travel: null`) en toonde alleen een rode regel. Omdat dat
   * bewaard en gesynchroniseerd wordt, was je vertrektijd daarmee echt weg.
   *
   * Dat is het slechtst denkbare moment om niets te tonen -- 's ochtends, als
   * je naar je trein moet. De oude tijd klopt meestal nog prima; wat eraan
   * ontbreekt is de mededeling dat hij van eerder is.
   */
  const geteld = laatReisMislukken(page);
  await zaai(page);
  await page.goto("/");

  // De tijd blijft staan...
  await expect(kaart(page)).toContainText(OPGESLAGEN_VERTREK);
  // ...maar niet alsof er niets aan de hand is.
  await expect(kaart(page)).toContainText("tijd van de vorige berekening");
  expect(geteld.aantal).toBeGreaterThan(0);
});

test("een rit die al vertrokken is wordt niet meer opgehaald", async ({ page }) => {
  /*
   * Na afloop heeft de planner geen dienstregeling meer voor die rit. Wat hij
   * dan teruggeeft ziet er echt uit en klopt niet -- dus wordt er niet gevraagd.
   *
   * Op de agendapagina en niet op het dashboard: daar staat de activiteit van
   * vanochtend er 's avonds nog gewoon. Op het dashboard verdwijnt hij, en dan
   * slaagt deze test omdat er niets getekend wordt in plaats van omdat er niets
   * opgehaald wordt -- daar ben ik ingetrapt.
   *
   * En alleen werk in deze agenda: sporten begint om 18:15 en moet dus nog
   * komen, dus daarvoor wordt terecht wél opgehaald. Dat telt mee in dezelfde
   * teller en maakt de uitkomst betekenisloos.
   */
  const geteld = vangReis(page, { heen: 70, terug: 40 });
  /*
   * Bewust de gewone zaai, met sleutels die *niet* kloppen. Met kloppende
   * sleutels vindt de app de reis al exact genoeg en haalt hij sowieso niets
   * op -- dan slaagt deze test zonder dat `tripHasLeft` er iets aan doet.
   */
  const alleenWerk = { ...AGENDA, activities: [AGENDA.activities[0]] };
  await zaai(page, alleenWerk, `${DAG}T18:00:00+02:00`);
  await page.goto("/agenda");

  await expect(page.getByRole("heading", { name: "Werken" })).toBeVisible();
  // Even de kans geven om alsnog te bellen; het punt is dat dat niet gebeurt.
  await page.waitForTimeout(1500);
  expect(geteld.aantal).toBe(0);
});
