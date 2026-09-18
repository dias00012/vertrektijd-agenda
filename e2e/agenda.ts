import type { Page } from "@playwright/test";

/**
 * Een agenda om mee te beginnen.
 *
 * Verzonnen adressen, met de coördinaten die ertoe doen: de app rekent op de
 * coördinaten, dus een verzonnen straatnaam verandert niets aan wat er getest
 * wordt. Zie ook de regel daarover in README.md.
 */

const iso = "2026-09-01T00:00:00.000Z";

export const THUIS = { label: "Voorbeeldstraat 1, Almere", lat: 52.3874, lon: 5.2653 };
export const WERK = { label: "Voorbeeldweg 184, Lelystad", lat: 52.5, lon: 5.47 };
export const SPORT = { label: "Voorbeeldlaan 19, Almere", lat: 52.37, lon: 5.24 };

/** De dag waarop deze tests spelen. Vast, zodat "vandaag" niets uitmaakt. */
export const DAG = "2026-09-17";

/**
 * Het moment waarop de tests spelen: die donderdag om 07:00 in Amsterdam.
 *
 * Alleen de dag vastzetten was niet genoeg. De klok van de browser liep gewoon
 * door, dus "vandaag" was de echte dag en "nu" het echte tijdstip -- en dan
 * zegt een test iets anders om half acht 's ochtends dan om tien uur. Eén test
 * over leertijd slaagde daardoor alleen zolang hij vóór achten draaide.
 *
 * 07:00, omdat de app vanaf dat uur plant en de eerste activiteit om 09:00
 * begint: zo is er een ochtend om in te plannen en staat de rit naar het werk
 * nog te wachten.
 */
export const NU = `${DAG}T07:00:00+02:00`;

const activiteit = (patch: Record<string, unknown> = {}) => ({
  id: "werk",
  category: "werk",
  title: "Werken",
  date: DAG,
  endDate: null,
  allDay: false,
  startTime: "09:00",
  endTime: "17:00",
  location: WERK,
  color: null,
  source: null,
  travelMode: null,
  recurrence: null,
  exceptions: [],
  travel: { durationMinutes: 54, distanceKm: 30, mode: "transit", provider: "motis", computedAt: iso, key: "h" },
  returnTravel: { durationMinutes: 42, distanceKm: 30, mode: "transit", provider: "motis", computedAt: iso, key: "t" },
  onwardTravel: null,
  travelError: null,
  bufferMinutes: null,
  linkedTaskId: null,
  linkedStepId: null,
  linkedExamId: null,
  createdAt: iso,
  updatedAt: iso,
  ...patch,
});

const taak = (patch: Record<string, unknown> = {}) => ({
  id: "t1",
  subject: "Bedrijfseconomie",
  title: "Hoofdstuk 4",
  deadline: "2026-09-25",
  estimatedMinutes: 90,
  priority: "high",
  status: "todo",
  createdAt: iso,
  updatedAt: iso,
  ...patch,
});

export const AGENDA = {
  settings: {
    home: THUIS,
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    categoryOverrides: {},
    bufferMinutes: 5,
    travelMode: "transit",
  },
  activities: [
    activiteit(),
    activiteit({
      id: "sport",
      category: "gym",
      title: "Sporten",
      startTime: "18:15",
      endTime: "19:30",
      location: SPORT,
      recurrence: { freq: "weekly", weekdays: [4], until: null },
      travel: { durationMinutes: 20, distanceKm: 4, mode: "transit", provider: "motis", computedAt: iso, key: "s1" },
      returnTravel: { durationMinutes: 20, distanceKm: 4, mode: "transit", provider: "motis", computedAt: iso, key: "s2" },
    }),
  ],
  tasks: [
    taak({
      steps: [
        { id: "a", title: "Theorie lezen", estimatedMinutes: 30, done: true },
        { id: "b", title: "Opgaven maken", estimatedMinutes: 60, done: false },
      ],
    }),
    // Eentje die over tijd is, want dat is een eigen geval op Schoolwerk.
    taak({ id: "t2", title: "Excel week 1", deadline: "2026-09-10", estimatedMinutes: 40 }),
  ],
  exams: [],
};

/**
 * Zet de agenda klaar vóórdat de pagina laadt.
 *
 * `addInitScript` draait bij élke navigatie, ook bij het wisselen van tab. De
 * vlag voorkomt dat je wijzigingen halverwege een test worden teruggedraaid --
 * daar ben ik eerder ingetrapt.
 */
export async function zaai(
  page: Page,
  agenda: unknown = AGENDA,
  nu: string = NU,
  taal: "nl" | "en" = "nl",
) {
  // De klok eerst: zetten ná het laden is te laat, dan heeft de app al met de
  // echte tijd gerekend.
  await page.clock.setFixedTime(new Date(nu));

  await page.addInitScript((data) => {
    if (window.localStorage.getItem("e2e-gezaaid")) return;
    const { agenda: gegevens, taal: taalkeuze } = data as { agenda: unknown; taal: string };
    const payload = gegevens as Record<string, unknown>;
    window.localStorage.setItem("agenda.settings.v1", JSON.stringify(payload.settings));
    window.localStorage.setItem("agenda.activities.v1", JSON.stringify(payload.activities));
    window.localStorage.setItem("agenda.tasks.v1", JSON.stringify(payload.tasks));
    window.localStorage.setItem("agenda.exams.v1", JSON.stringify(payload.exams));
    window.localStorage.setItem("agenda.language.v1", taalkeuze);
    // De rondleiding hoort bij een eerste keer, niet bij elke test.
    window.localStorage.setItem("agenda.intro.v1", JSON.stringify({ seen: true, tourSeen: true }));
    window.localStorage.setItem("e2e-gezaaid", "ja");
  }, { agenda, taal });
}
