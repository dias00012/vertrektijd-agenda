import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  findNextActivity,
  layoutDay,
  searchActivities,
  timeRangeFor,
  timeStatusFor,
} from "./agenda";
import type { Activity, Settings } from "./types";

/**
 * "Eerstvolgende" is het antwoord op waar je straks heen moet en hoe laat je
 * daarvoor weg moet. Wat hier niet uitkomt, ziet de gebruiker dus niet.
 */
function settings(): Settings {
  return {
    home: { label: "Thuis", lat: 52.37, lon: 5.21 },
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    bufferMinutes: 10,
    travelMode: "car",
  };
}

function activity(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    category: "school",
    title: "College",
    date: "2026-09-07",
    endDate: null,
    allDay: false,
    startTime: "09:00",
    endTime: "17:00",
    location: null,
    color: null,
    travelMode: null,
    bufferMinutes: null,
    recurrence: null,
    exceptions: [],
    travel: null,
    returnTravel: null,
    travelError: null,
    source: null,
    linkedTaskId: null,
    linkedExamId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  } as Activity;
}

describe("findNextActivity", () => {
  const NU = new Date(2026, 8, 7, 7, 0);

  it("geeft de eerstvolgende afspraak van vandaag", () => {
    const next = findNextActivity([activity()], settings(), NU);

    expect(next?.title).toBe("College");
    expect(next?.date).toBe("2026-09-07");
  });

  it("slaat over wat al afgelopen is", () => {
    const next = findNextActivity(
      [
        activity({ id: "a1", title: "Ochtend", startTime: "05:00", endTime: "06:00" }),
        activity({ id: "a2", title: "Middag", startTime: "13:00", endTime: "14:00" }),
      ],
      settings(),
      NU,
    );

    expect(next?.title).toBe("Middag");
  });

  it("laat een vrije dag de echte afspraak niet verdringen", () => {
    // Een hele dag heeft geen tijdstip en dus geen vertrektijd; als antwoord
    // op "waar moet ik straks heen" hoort hij niet bovenaan.
    const next = findNextActivity(
      [
        activity({ id: "a1", title: "Herfstvakantie", allDay: true, endTime: "23:59" }),
        activity({ id: "a2", title: "Tandarts", startTime: "10:00", endTime: "10:30" }),
      ],
      settings(),
      NU,
    );

    expect(next?.title).toBe("Tandarts");
  });

  it("toont een vrije dag wel als er verder niets staat", () => {
    const next = findNextActivity(
      [activity({ title: "Herfstvakantie", allDay: true, endTime: "23:59" })],
      settings(),
      NU,
    );

    expect(next?.title).toBe("Herfstvakantie");
  });

  it("vindt een maandelijkse reeks die verder weg ligt dan drie weken", () => {
    // Huur op de 1e: vanaf 7 september is dat 24 dagen wachten. Met de oude
    // blik van drie weken zei de kaart "niets gepland".
    const next = findNextActivity(
      [
        activity({
          title: "Huur betalen",
          date: "2026-08-01",
          startTime: "10:00",
          endTime: "10:15",
          recurrence: { freq: "monthly", weekdays: [], until: null },
        }),
      ],
      settings(),
      NU,
    );

    expect(next?.title).toBe("Huur betalen");
    expect(next?.date).toBe("2026-10-01");
  });

  it("geeft niets terug als er echt niets is", () => {
    expect(findNextActivity([], settings(), NU)).toBeNull();
  });
});

describe("searchActivities", () => {
  const NU = new Date(2026, 8, 6, 12, 0);

  it("toont bij een afgelopen reeks de laatste keer, niet de eerste", () => {
    // "Wanneer was dat practicum ook alweer?" — dat was 29 juni, niet
    // 2 februari. De app gaf de startdatum van de reeks.
    const resultaten = searchActivities(
      [
        activity({
          title: "Practicum scheikunde",
          date: "2026-02-02",
          startTime: "13:00",
          endTime: "17:00",
          recurrence: { freq: "weekly", weekdays: [1], until: "2026-06-29" },
        }),
      ],
      "practicum",
      NU,
      (id) => id,
    );

    expect(resultaten).toHaveLength(1);
    expect(resultaten[0]?.date).toBe("2026-06-29");
  });

  it("houdt bij een lopende reeks de eerstvolgende keer", () => {
    const resultaten = searchActivities(
      [
        activity({
          title: "College",
          date: "2026-02-02",
          recurrence: { freq: "weekly", weekdays: [1], until: null },
        }),
      ],
      "college",
      NU,
      (id) => id,
    );

    expect(resultaten[0]?.date).toBe("2026-09-07");
  });

  it("laat een losse activiteit uit het verleden op zijn eigen dag staan", () => {
    const resultaten = searchActivities(
      [activity({ title: "Tandarts", date: "2026-08-12" })],
      "tandarts",
      NU,
      (id) => id,
    );

    expect(resultaten[0]?.date).toBe("2026-08-12");
  });
});

/**
 * Het dagoverzicht en de kaart erboven staan op hetzelfde scherm. Rekenen ze
 * verschillend, dan zie je twee keer een andere thuiskomst en weet je niet
 * welke klopt.
 */
describe("buildTimeline en de thuiskomst", () => {
  const bus = (patch = {}) => ({
    durationMinutes: 44,
    distanceKm: 22,
    mode: "transit" as const,
    provider: "motis",
    computedAt: "2026-09-07T06:00:00.000Z",
    key: "k",
    ...patch,
  });

  it("neemt de aankomsttijd van de echte rit, niet eindtijd plus reisduur", () => {
    // Je les is om 17:00 uit, maar de bus gaat pas om 17:02 en is er om 17:46.
    // De optelsom zou 17:44 zeggen.
    const item = activity({
      location: { label: "School", lat: 52.49, lon: 6.07 },
      travelMode: "transit",
      returnTravel: bus({ plannedDeparture: "2026-09-07T15:02:00.000Z", plannedArrival: "2026-09-07T15:46:00.000Z" }),
    });

    const back = buildTimeline([item], settings(), "2026-09-07").find((e) => e.kind === "return");
    expect(back?.homeMinutes).toBe(17 * 60 + 46);
  });

  it("valt terug op de optelsom zolang er geen echte rit bekend is", () => {
    const item = activity({
      location: { label: "School", lat: 52.49, lon: 6.07 },
      travelMode: "transit",
      returnTravel: bus(),
    });

    const back = buildTimeline([item], settings(), "2026-09-07").find((e) => e.kind === "return");
    expect(back?.homeMinutes).toBe(17 * 60 + 44);
  });
});

describe("timeRangeFor", () => {
  it("laat een dienst tot over middernacht binnen het raster vallen", () => {
    // 23:00 tot 01:00: het eind ligt vóór het begin. Zonder de starttijd mee
    // te wegen bleef het raster bij 01:00 hangen en stond het blok op 23:00 —
    // buiten beeld, dus onvindbaar.
    const nacht = activity({ date: "2026-09-07", startTime: "23:00", endTime: "01:00" });
    const range = timeRangeFor([layoutDay([nacht], settings(), "2026-09-07")]);

    expect(range.end).toBeGreaterThanOrEqual(23 * 60);
  });

  it("houdt een gewone dag strak om de activiteiten heen", () => {
    const les = activity({ date: "2026-09-07", startTime: "09:00", endTime: "17:00" });
    const range = timeRangeFor([layoutDay([les], settings(), "2026-09-07")]);

    expect(range.start).toBe(8 * 60);
    expect(range.end).toBe(18 * 60);
  });
});

describe("timeStatusFor bij een dienst over middernacht", () => {
  const nacht = () => ({
    ...activity({ date: "2026-09-07", startTime: "23:00", endTime: "01:00" }),
    occurrenceId: "a1:2026-09-07",
    recurring: false,
    travelRole: { outbound: true, inbound: true, onward: null, arrivesFrom: null },
  });

  it("noemt hem 's ochtends niet al geweest", () => {
    // 09:00 die dag: de dienst moet nog beginnen.
    expect(timeStatusFor(nacht() as never, new Date(2026, 8, 7, 9, 0))).toBe("upcoming");
  });

  it("zet hem op bezig zodra hij loopt", () => {
    expect(timeStatusFor(nacht() as never, new Date(2026, 8, 7, 23, 30))).toBe("now");
  });

  it("noemt hem pas geweest als hij echt om is", () => {
    expect(timeStatusFor(nacht() as never, new Date(2026, 8, 8, 1, 30))).toBe("past");
  });

  it("laat een gewone activiteit met rust", () => {
    const les = { ...activity({ date: "2026-09-07", startTime: "09:00", endTime: "17:00" }),
      occurrenceId: "a1:2026-09-07", recurring: false,
      travelRole: { outbound: true, inbound: true, onward: null, arrivesFrom: null } };
    expect(timeStatusFor(les as never, new Date(2026, 8, 7, 18, 0))).toBe("past");
    expect(timeStatusFor(les as never, new Date(2026, 8, 7, 12, 0))).toBe("now");
  });
});
