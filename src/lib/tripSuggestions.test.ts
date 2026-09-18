import { describe, expect, it } from "vitest";
import { MAX_SUGGESTIONS, SUGGESTION_HORIZON_DAYS, upcomingTrips } from "./tripSuggestions";
import type { Activity, GeoLocation, Settings } from "./types";

/**
 * De reisplanner wist niets van je agenda, terwijl dat juist is wat deze app
 * onderscheidt: hij kent je bestemming en je aankomsttijd al. Toch typte je ze
 * elke keer opnieuw.
 */

const THUIS: GeoLocation = { label: "Thuis", lat: 52.37, lon: 5.21 };
const SCHOOL: GeoLocation = { label: "School", lat: 52.49, lon: 6.07 };
const WERK: GeoLocation = { label: "Werk", lat: 52.5, lon: 5.47 };

/** Dinsdag 15 september 2026, 10:00 in Amsterdam. */
const NU = new Date(2026, 8, 15, 10, 0);

const settings = (patch: Partial<Settings> = {}): Settings =>
  ({
    home: THUIS,
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    bufferMinutes: 10,
    travelMode: "transit",
    ...patch,
  }) as Settings;

const activiteit = (patch: Partial<Activity> = {}): Activity =>
  ({
    id: "a1",
    category: "school",
    title: "School",
    date: "2026-09-16",
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
    ...patch,
  }) as Activity;

const klok = (iso: string) =>
  new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });

describe("upcomingTrips", () => {
  it("stelt je eerstvolgende rit voor", () => {
    const uit = upcomingTrips([activiteit()], settings(), NU);
    expect(uit).toHaveLength(1);
    expect(uit[0].label).toBe("School");
    expect(uit[0].to).toEqual(SCHOOL);
  });

  it("houdt dezelfde aankomsttijd aan als de agenda", () => {
    /*
     * Starttijd min je marge. Zou de planner een ander tijdstip nemen, dan
     * geeft hij een ander antwoord dan je agenda op precies dezelfde vraag --
     * en dan weet je niet meer welke klopt.
     */
    const uit = upcomingTrips([activiteit()], settings({ bufferMinutes: 10 }), NU);
    expect(klok(uit[0].arriveBy)).toBe("08:50");
  });

  it("gebruikt de marge van de activiteit zelf als die er is", () => {
    // School twintig minuten, sportschool vijf: dat is precies waarvoor die
    // marge per activiteit bestaat.
    const uit = upcomingTrips([activiteit({ bufferMinutes: 20 })], settings(), NU);
    expect(klok(uit[0].arriveBy)).toBe("08:40");
  });

  it("slaat een activiteit zonder bestemming over", () => {
    expect(upcomingTrips([activiteit({ location: null })], settings(), NU)).toEqual([]);
  });

  it("slaat een rit over waarvan het moment al voorbij is", () => {
    // Vandaag om 09:00 beginnen terwijl het al 10:00 is: daar helpt geen
    // reisadvies meer bij.
    const vanochtend = activiteit({ date: "2026-09-15", startTime: "09:00" });
    expect(upcomingTrips([vanochtend], settings(), NU)).toEqual([]);
  });

  it("kijkt niet verder dan een week vooruit", () => {
    expect(SUGGESTION_HORIZON_DAYS).toBe(7);
    const ver = activiteit({ date: "2026-09-23" });
    expect(upcomingTrips([ver], settings(), NU)).toEqual([]);
  });

  it("zet wat het eerst komt vooraan", () => {
    // Dat is bijna altijd degene die je bedoelt.
    const later = activiteit({ id: "werk", title: "Werk", date: "2026-09-18", location: WERK });
    const eerder = activiteit({ id: "school", title: "School", date: "2026-09-16" });
    expect(upcomingTrips([later, eerder], settings(), NU).map((s) => s.label)).toEqual([
      "School",
      "Werk",
    ]);
  });

  it("toont er hoogstens een handjevol", () => {
    // Meer wordt een lijst om te lezen in plaats van een snelkeuze.
    const veel = Array.from({ length: 8 }, (_, i) =>
      activiteit({ id: `a${i}`, date: `2026-09-${16 + (i % 6)}` }),
    );
    expect(upcomingTrips(veel, settings(), NU)).toHaveLength(MAX_SUGGESTIONS);
  });
});
