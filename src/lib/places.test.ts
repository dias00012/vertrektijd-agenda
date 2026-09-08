import { describe, expect, it } from "vitest";
import { missesStreet, relocatePoint, samePoint } from "./places";
import type { Activity, GeoLocation, Settings } from "./types";

/**
 * Een adres zonder straatnaam is geen adres. De app rekende er wel gewoon mee,
 * en dat kostte op één rit tien minuten die nergens uit bleken.
 */
describe("missesStreet", () => {
  it("herkent een los huisnummer", () => {
    for (const label of ["60, Almere", "184, Lelystad", "12", "184-A, Lelystad"]) {
      expect(missesStreet({ label }), label).toBe(true);
    }
  });

  it("laat een straatnaam die met een cijfer begint met rust", () => {
    for (const label of ["1e Kruisstraat 4, Amsterdam", "2e Weteringdwarsstraat 10"]) {
      expect(missesStreet({ label }), label).toBe(false);
    }
  });

  it("laat een volledig adres met rust", () => {
    for (const label of [
      "Gran Canariastraat 60, Almere",
      "Donaustraat 184, Lelystad",
      "Basic-Fit Almere Buiten",
      "Treinstation Lelystad Centrum",
      "'s-Gravenhage",
    ]) {
      expect(missesStreet({ label }), label).toBe(false);
    }
  });

  it("doet niets zonder locatie of zonder naam", () => {
    expect(missesStreet(null)).toBe(false);
    expect(missesStreet({ label: "" })).toBe(false);
    expect(missesStreet({ label: "   " })).toBe(false);
  });
});

/* --- Een adres verbeteren ------------------------------------------------ */

const OUD: GeoLocation = { label: "184, Lelystad", lat: 52.5168, lon: 5.4712 };
const NIEUW: GeoLocation = { label: "Donaustraat 184, Lelystad", lat: 52.5104, lon: 5.4801 };
const ELDERS: GeoLocation = { label: "Basic-Fit, Almere", lat: 52.3702, lon: 5.2166 };

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    home: null,
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    bufferMinutes: 10,
    travelMode: "transit",
    ...patch,
  };
}

function activity(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    category: "work",
    title: "Werk",
    date: "2026-09-08",
    startTime: "09:00",
    endTime: "17:00",
    location: OUD,
    color: null,
    travelMode: null,
    bufferMinutes: null,
    recurrence: null,
    exceptions: [],
    travel: {
      durationMinutes: 57,
      distanceKm: 22,
      mode: "transit",
      provider: "motis",
      computedAt: "2026-09-01T00:00:00.000Z",
      key: "oud",
    },
    returnTravel: null,
    travelError: null,
    source: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  } as Activity;
}

describe("samePoint", () => {
  it("kijkt naar de plek, niet naar de naam", () => {
    expect(samePoint(OUD, { ...OUD, label: "anders" })).toBe(true);
    expect(samePoint(OUD, NIEUW)).toBe(false);
    expect(samePoint(null, OUD)).toBe(false);
  });
});

describe("relocatePoint", () => {
  it("verhuist de bewaarde plek en alles wat op dat punt stond", () => {
    const before = settings({
      home: ELDERS,
      savedPlaces: [
        { id: "p1", name: "184, Lelystad", location: OUD, createdAt: "2026-09-01T00:00:00.000Z" },
      ],
      timetable: { url: "https://x/y.ics", location: OUD, category: "school", syncedAt: null },
      calendars: [
        { id: "c1", name: "Werk", url: "https://x/w.ics", category: "work", location: OUD, syncedAt: null },
      ],
    });

    const result = relocatePoint(before, [activity(), activity({ id: "a2", location: ELDERS })], OUD, NIEUW);

    expect(result.settings.savedPlaces[0].location).toEqual(NIEUW);
    // De plek heette naar zijn adres, dus de naam gaat mee.
    expect(result.settings.savedPlaces[0].name).toBe(NIEUW.label);
    expect(result.settings.timetable?.location).toEqual(NIEUW);
    expect(result.settings.calendars?.[0].location).toEqual(NIEUW);
    // Thuis stond ergens anders en blijft staan.
    expect(result.settings.home).toEqual(ELDERS);
    expect(result.movedActivities).toBe(1);
  });

  it("gooit de reistijd van een verhuisde activiteit weg", () => {
    const result = relocatePoint(settings(), [activity()], OUD, NIEUW, "2026-09-08T20:00:00.000Z");
    expect(result.activities[0].location).toEqual(NIEUW);
    // De oude reistijd hoorde bij het oude punt; laten staan zou de fout die
    // je net verbeterde gewoon op het scherm houden.
    expect(result.activities[0].travel).toBeNull();
    expect(result.activities[0].updatedAt).toBe("2026-09-08T20:00:00.000Z");
  });

  it("laat een zelfgekozen naam met rust", () => {
    const before = settings({
      savedPlaces: [
        {
          id: "p1",
          name: "184, Lelystad",
          customName: "Werk",
          location: OUD,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const result = relocatePoint(before, [], OUD, NIEUW);
    expect(result.settings.savedPlaces[0].customName).toBe("Werk");
  });

  it("doet niets wanneer je dezelfde plek opnieuw kiest", () => {
    const before = settings({ savedPlaces: [] });
    const activities = [activity()];
    const result = relocatePoint(before, activities, OUD, { ...OUD });
    expect(result.settings).toBe(before);
    expect(result.activities).toBe(activities);
    expect(result.movedActivities).toBe(0);
  });
});
