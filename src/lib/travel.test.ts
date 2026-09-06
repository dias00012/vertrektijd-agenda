import { describe, expect, it } from "vitest";
import { computeDeparture, computeReturn, nextOccurrenceDate, travelPlanForDate } from "./travel";
import type { ActivityOccurrence, Settings, TravelInfo } from "./types";

const HOME = { label: "Thuis", lat: 52.37, lon: 5.21 };
const SCHOOL = { label: "School", lat: 52.49, lon: 6.07 };

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    home: HOME,
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    bufferMinutes: 10,
    travelMode: "car",
    ...patch,
  };
}

function travel(patch: Partial<TravelInfo> = {}): TravelInfo {
  return {
    durationMinutes: 25,
    distanceKm: 12,
    mode: "car",
    provider: "osrm",
    computedAt: "2026-09-07T06:00:00.000Z",
    key: "k",
    ...patch,
  };
}

function activity(patch: Partial<ActivityOccurrence> = {}): ActivityOccurrence {
  return {
    id: "a1",
    category: "school",
    title: "College",
    date: "2026-09-07",
    startTime: "09:00",
    endTime: "17:00",
    location: SCHOOL,
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
    occurrenceId: "a1:2026-09-07",
    recurring: false,
    // Een losse activiteit reist heen en terug; verblijven worden apart getest.
    travelRole: { outbound: true, inbound: true },
    ...patch,
  } as ActivityOccurrence;
}

describe("computeDeparture", () => {
  it("rekent starttijd - reistijd - marge", () => {
    // 09:00 - 25 min reizen - 10 min marge = 08:25
    const result = computeDeparture(activity({ travel: travel() }), settings());
    expect(result?.time).toBe("08:25");
    expect(result?.previousDay).toBe(false);
  });

  it("gebruikt de marge van de activiteit boven die van de instellingen", () => {
    const result = computeDeparture(
      activity({ travel: travel(), bufferMinutes: 30 }),
      settings({ bufferMinutes: 10 }),
    );
    expect(result?.time).toBe("08:05");
  });

  it("valt terug op de dag ervoor bij een lange reis in de vroege ochtend", () => {
    const result = computeDeparture(
      activity({ startTime: "06:00", travel: travel({ durationMinutes: 420 }) }),
      settings(),
    );
    expect(result?.time).toBe("22:50");
    expect(result?.previousDay).toBe(true);
  });

  it("neemt bij OV de vertrektijd uit de dienstregeling, niet uit een rekensom", () => {
    const result = computeDeparture(
      activity({
        travel: travel({
          mode: "transit",
          durationMinutes: 83,
          // De trein gaat om 07:19, ook al zou de rekensom iets anders zeggen.
          plannedDeparture: new Date(2026, 8, 7, 7, 19).toISOString(),
        }),
      }),
      settings({ travelMode: "transit" }),
    );
    expect(result?.time).toBe("07:19");
  });

  it("geeft niets terug zonder locatie of zonder reis", () => {
    expect(computeDeparture(activity({ location: null }), settings())).toBeNull();
    expect(computeDeparture(activity({ travel: null }), settings())).toBeNull();
  });
});

describe("computeReturn", () => {
  it("telt de terugreis bij de eindtijd op, zonder marge", () => {
    const result = computeReturn(
      activity({ returnTravel: travel({ durationMinutes: 25 }) }),
      settings(),
    );
    expect(result?.time).toBe("17:25");
    expect(result?.nextDay).toBe(false);
  });

  it("merkt op dat je pas na middernacht thuis bent", () => {
    const result = computeReturn(
      activity({ endTime: "23:30", returnTravel: travel({ durationMinutes: 60 }) }),
      settings(),
    );
    expect(result?.time).toBe("00:30");
    expect(result?.nextDay).toBe(true);
  });

  it("neemt bij OV de aankomst uit de dienstregeling", () => {
    const result = computeReturn(
      activity({
        returnTravel: travel({
          mode: "transit",
          plannedArrival: new Date(2026, 8, 7, 18, 40).toISOString(),
        }),
      }),
      settings({ travelMode: "transit" }),
    );
    expect(result?.time).toBe("18:40");
  });
});

describe("nextOccurrenceDate", () => {
  it("geeft bij een losse activiteit gewoon zijn eigen datum", () => {
    expect(nextOccurrenceDate(activity(), new Date(2026, 8, 1))).toBe("2026-09-07");
  });

  it("zoekt bij een reeks de eerstvolgende dag vanaf vandaag", () => {
    const item = activity({
      date: "2026-09-07",
      recurrence: { freq: "weekly", weekdays: [1, 3], until: null },
    });
    // Dinsdag 8 september -> de eerstvolgende is woensdag de 9e.
    expect(nextOccurrenceDate(item, new Date(2026, 8, 8))).toBe("2026-09-09");
  });

  it("telt vandaag mee als de reeks vandaag valt", () => {
    const item = activity({
      recurrence: { freq: "weekly", weekdays: [1], until: null },
    });
    expect(nextOccurrenceDate(item, new Date(2026, 8, 14))).toBe("2026-09-14");
  });
});

describe("travelPlanForDate", () => {
  it("zet bij OV de aankomsttijd op starttijd min marge, op de gevraagde dag", () => {
    const plan = travelPlanForDate(
      activity({ travelMode: "transit" }),
      settings({ bufferMinutes: 10 }),
      "2026-09-09",
    );
    expect(plan?.mode).toBe("transit");
    expect(new Date(plan!.arriveBy!).getTime()).toBe(new Date(2026, 8, 9, 8, 50).getTime());
    expect(new Date(plan!.departAt!).getTime()).toBe(new Date(2026, 8, 9, 17, 0).getTime());
  });

  it("geeft per dag een andere sleutel, zodat een reeks niet één rit hergebruikt", () => {
    const item = activity({ travelMode: "transit" });
    const monday = travelPlanForDate(item, settings(), "2026-09-07");
    const wednesday = travelPlanForDate(item, settings(), "2026-09-09");
    expect(monday?.outboundKey).not.toBe(wednesday?.outboundKey);
  });

  it("gebruikt bij auto één sleutel voor alle dagen: de dienstregeling doet niet mee", () => {
    const item = activity({ travelMode: "car" });
    const monday = travelPlanForDate(item, settings(), "2026-09-07");
    const wednesday = travelPlanForDate(item, settings(), "2026-09-09");
    expect(monday?.outboundKey).toBe(wednesday?.outboundKey);
  });

  it("geeft niets terug zonder thuislocatie", () => {
    expect(travelPlanForDate(activity(), settings({ home: null }), "2026-09-07")).toBeNull();
  });
});
