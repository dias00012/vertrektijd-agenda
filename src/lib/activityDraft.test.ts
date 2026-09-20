import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DURATION_MINUTES, initialDraft, seriesStart } from "./activityDraft";
import type { Activity, Settings } from "./types";

/**
 * Waarmee het activiteitenformulier begint.
 *
 * Dit stond in een bestand van 1144 regels en was daardoor alleen via een
 * browser te bekijken -- terwijl er drie gemelde fouten in zitten die je in de
 * uitkomst ziet en niet op het scherm:
 *
 *  - een reeks bewerken schreef de aangeklikte dag terug als startdatum, en
 *    dan verdween alles wat daarvóór lag;
 *  - dupliceren maakte van een vakantie van vijf dagen stil één dag van 09:00
 *    tot 10:00;
 *  - en de marge hoort juist wél een "volg de instellingen"-stand te houden,
 *    anders zet opslaan hem vast op deze activiteit.
 */

const NU = new Date(2026, 8, 17, 14, 7);

function instellingen(patch: Partial<Settings> = {}): Settings {
  return {
    home: { label: "Thuis", lat: 52.37, lon: 5.21 },
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    categoryOverrides: {},
    bufferMinutes: 10,
    travelMode: "transit",
    ...patch,
  } as Settings;
}

function activiteit(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    category: "school",
    title: "College",
    date: "2026-09-17",
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

afterEach(() => vi.useRealTimers());

describe("seriesStart", () => {
  it("geeft de eigen datum bij een losse activiteit", () => {
    expect(seriesStart(activiteit())).toBe("2026-09-17");
  });

  /**
   * Bij een reeks is dit het hele punt: de startdatum van de reeks, niet de
   * dag die je toevallig aanklikte.
   */
  it("geeft de startdatum van de reeks, niet de aangeklikte dag", () => {
    const dag = { ...activiteit(), date: "2026-11-05", seriesDate: "2026-09-01" };
    expect(seriesStart(dag as Activity)).toBe("2026-09-01");
  });
});

describe("initialDraft voor een nieuwe activiteit", () => {
  it("rondt de begintijd af op het volgende kwartier", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NU);

    const concept = initialDraft(instellingen());

    expect(concept.startTime).toBe("14:15");
  });

  it("maakt er standaard een uur van", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NU);

    const concept = initialDraft(instellingen());

    expect(concept.endTime).toBe("15:15");
    expect(DEFAULT_DURATION_MINUTES).toBe(60);
  });

  it("begint op vandaag met een lege naam", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NU);

    const concept = initialDraft(instellingen());

    expect(concept.date).toBe("2026-09-17");
    expect(concept.title).toBe("");
  });

  it("neemt het vervoermiddel uit je instellingen over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NU);

    expect(initialDraft(instellingen({ travelMode: "bike" })).travelMode).toBe("bike");
  });

  /** Leeg betekent "volg de algemene marge"; nul zou die vastzetten. */
  it("laat de marge leeg, zodat hij de instellingen volgt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NU);

    expect(initialDraft(instellingen()).bufferMinutes).toBeNull();
  });

  it("laat een meegegeven beginwaarde voorgaan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NU);

    const concept = initialDraft(instellingen(), undefined, {
      title: "Naar school",
      startTime: "08:00",
    });

    expect(concept.title).toBe("Naar school");
    expect(concept.startTime).toBe("08:00");
  });
});

describe("initialDraft bij bewerken", () => {
  it("neemt de tijden en de naam over", () => {
    const concept = initialDraft(instellingen(), activiteit());

    expect(concept.title).toBe("College");
    expect(concept.startTime).toBe("09:00");
    expect(concept.endTime).toBe("17:00");
  });

  /**
   * Zonder deze twee klopte het formulier bij bewerken toevallig nog wel, maar
   * dupliceren maakte van een vakantie van vijf dagen stil één dag.
   */
  it("houdt 'hele dag' en een einddatum vast", () => {
    const vakantie = activiteit({ allDay: true, endDate: "2026-10-25" });
    const concept = initialDraft(instellingen(), vakantie);

    expect(concept.allDay).toBe(true);
    expect(concept.endDate).toBe("2026-10-25");
  });

  it("zet 'hele dag' op nee als het veld ontbreekt", () => {
    expect(initialDraft(instellingen(), activiteit()).allDay).toBe(false);
    expect(initialDraft(instellingen(), activiteit()).endDate).toBeNull();
  });

  it("gebruikt de startdatum van de reeks, niet de aangeklikte dag", () => {
    const dag = { ...activiteit(), date: "2026-11-05", seriesDate: "2026-09-01" };

    expect(initialDraft(instellingen(), dag as Activity).date).toBe("2026-09-01");
  });

  /** Geen "standaard"-optie: laat zien wat er nú geldt. */
  it("vult de kleur van het type in als de activiteit er geen heeft", () => {
    const concept = initialDraft(instellingen(), activiteit({ color: null }));

    expect(concept.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("laat een eigen kleur staan", () => {
    expect(initialDraft(instellingen(), activiteit({ color: "#123456" })).color).toBe("#123456");
  });

  it("houdt de marge leeg als de activiteit er geen eigen heeft", () => {
    expect(initialDraft(instellingen(), activiteit()).bufferMinutes).toBeNull();
  });

  it("houdt een eigen marge vast", () => {
    expect(initialDraft(instellingen(), activiteit({ bufferMinutes: 25 })).bufferMinutes).toBe(25);
  });

  it("neemt de herhaling mee", () => {
    const reeks = activiteit({ recurrence: { freq: "weekly", weekdays: [4], until: null } });

    expect(initialDraft(instellingen(), reeks).recurrence).toEqual({
      freq: "weekly",
      weekdays: [4],
      until: null,
    });
  });
});
