import { afterEach, describe, expect, it } from "vitest";
import { plannedReminders } from "./reminders";
import { setLanguage } from "./i18n/locale";
import { loadTable } from "./i18n/dictionary";
import type { Activity, GeoLocation, Settings, TravelInfo } from "./types";

/**
 * De wekker van de app.
 *
 * Dit is de functie die bepaalt wanneer je te horen krijgt dat je weg moet, en
 * hij had geen enkele test. Dat is de verkeerde plek om op goed vertrouwen te
 * draaien: een melding die niet komt merk je pas als je te laat bent, en een
 * melding die dubbel komt leer je wegklikken -- waarna je de echte ook mist.
 *
 * Twee gebruikers rekenen hiermee: `useReminders` zet er timers op zolang de
 * app open staat, en `usePushQueue` zet dezelfde berichten op de server voor
 * als hij dicht is. Wat hier verandert, verandert op allebei de plekken.
 */

const THUIS: GeoLocation = { label: "Thuis", lat: 52.37, lon: 5.21 };
const SCHOOL: GeoLocation = { label: "School", lat: 52.49, lon: 6.07 };

/** Donderdag 17 september 2026, 06:00 lokale tijd. */
const NU = new Date(2026, 8, 17, 6, 0);

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    home: THUIS,
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    bufferMinutes: 10,
    travelMode: "car",
    reminderMinutes: 15,
    ...patch,
  } as Settings;
}

/** Een reis van een half uur, zonder dienstregeling: puur aftrekken. */
function reis(durationMinutes = 30): TravelInfo {
  return {
    durationMinutes,
    distanceKm: 25,
    mode: "car",
    provider: "test",
  } as TravelInfo;
}

function activiteit(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    category: "school",
    title: "College",
    date: "2026-09-17",
    startTime: "09:00",
    endTime: "17:00",
    location: SCHOOL,
    color: null,
    travelMode: null,
    bufferMinutes: null,
    recurrence: null,
    exceptions: [],
    travel: reis(),
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

afterEach(() => setLanguage("nl"));

describe("plannedReminders", () => {
  it("meldt een kwartier voor je vertrektijd", () => {
    // 09:00 beginnen, 10 minuten marge, 30 minuten reizen -> 08:20 weg.
    const [melding] = plannedReminders([activiteit()], settings(), NU, 2);

    expect(melding.at).toEqual(new Date(2026, 8, 17, 8, 5));
    expect(melding.title).toBe("Vertrek om 08:20");
    expect(melding.body).toBe("College begint om 09:00. Over 15 minuten moet je weg.");
  });

  it("zwijgt helemaal als je herinneringen uit hebt staan", () => {
    expect(plannedReminders([activiteit()], settings({ reminderMinutes: null }), NU, 2)).toEqual(
      [],
    );
    expect(
      plannedReminders([activiteit()], settings({ reminderMinutes: undefined }), NU, 2),
    ).toEqual([]);
  });

  /**
   * Nul is iets anders dan uit: "waarschuw me precies op het moment dat je weg
   * moet" is een geldige keuze, en die mag niet als "niet waarschuwen" gelezen
   * worden. Een `if (!minutesBefore)` zou dat wel doen.
   */
  it("behandelt nul minuten als een keuze, niet als uit", () => {
    const [melding] = plannedReminders([activiteit()], settings({ reminderMinutes: 0 }), NU, 2);

    expect(melding.at).toEqual(new Date(2026, 8, 17, 8, 20));
  });

  it("laat een moment dat al voorbij is weg", () => {
    // Om 08:30 is het vertrek van 08:20 al geweest, en de melding van 08:05
    // helemaal.
    const laat = new Date(2026, 8, 17, 8, 30);

    expect(plannedReminders([activiteit()], settings(), laat, 2)).toEqual([]);
  });

  it("zegt niets over een activiteit zonder plek om heen te reizen", () => {
    expect(plannedReminders([activiteit({ location: null })], settings(), NU, 2)).toEqual([]);
  });

  it("zegt niets zolang er geen reistijd berekend is", () => {
    expect(plannedReminders([activiteit({ travel: null })], settings(), NU, 2)).toEqual([]);
  });

  it("kijkt niet verder vooruit dan het aantal dagen dat je vraagt", () => {
    const overmorgen = activiteit({ id: "a2", date: "2026-09-19", title: "Toets" });

    expect(plannedReminders([overmorgen], settings(), NU, 2)).toEqual([]);
    expect(plannedReminders([overmorgen], settings(), NU, 3)).toHaveLength(1);
  });

  it("zet de vroegste melding voorop, ongeacht de volgorde van je agenda", () => {
    // Een andere plek dan het college, en na afloop: anders telt het als één
    // verblijf en vertrek je maar één keer.
    const laat = activiteit({
      id: "laat",
      title: "Werk",
      location: { label: "Werk", lat: 52.51, lon: 5.48 },
      startTime: "18:00",
      endTime: "21:00",
    });
    const vroeg = activiteit({ id: "vroeg", title: "College" });

    const meldingen = plannedReminders([laat, vroeg], settings(), NU, 2);

    expect(meldingen.map((m) => m.title)).toEqual(["Vertrek om 08:20", "Vertrek om 17:20"]);
  });

  /**
   * De sleutel houdt de vertrektijd vast. Dat is geen toeval: schuift je
   * vertrek op omdat de trein anders rijdt, dan is dat een ander bericht en
   * hoor je het opnieuw. Bleef de sleutel gelijk, dan zou je alleen het oude
   * tijdstip te horen krijgen.
   */
  it("geeft elke vertrektijd een eigen sleutel", () => {
    const [eerst] = plannedReminders([activiteit()], settings(), NU, 2);
    const [later] = plannedReminders([activiteit({ travel: reis(45) })], settings(), NU, 2);

    expect(eerst.key).toContain("08:20");
    expect(later.key).toContain("08:05");
    expect(eerst.key).not.toBe(later.key);
  });

  it("geeft elke dag van een herhaling een eigen sleutel", () => {
    const wekelijks = activiteit({
      date: "2026-09-17",
      recurrence: { freq: "weekly", weekdays: [4, 5], until: null },
    });

    const sleutels = plannedReminders([wekelijks], settings(), NU, 2).map((m) => m.key);

    expect(sleutels).toHaveLength(2);
    expect(new Set(sleutels).size).toBe(2);
  });

  it("volgt de taal die je gekozen hebt", async () => {
    // De Engelse tabel staat sinds de splitsing in een eigen bestand en wordt
    // pas opgehaald als je die taal kiest. In de app doet `LanguageProvider`
    // dat; hier moet de test het zelf doen.
    await loadTable("en");
    setLanguage("en");
    const [melding] = plannedReminders([activiteit()], settings(), NU, 2);

    expect(melding.title).toBe("Leave at 08:20");
    expect(melding.body).toBe("College starts at 09:00. You need to leave in 15 minutes.");
  });

  it("rekent de marge per activiteit mee als die is ingevuld", () => {
    const ruim = activiteit({ bufferMinutes: 40 });

    const [melding] = plannedReminders([ruim], settings(), NU, 2);

    // 09:00 - 40 marge - 30 reizen = 07:50 weg, dus 07:35 melden.
    expect(melding.title).toBe("Vertrek om 07:50");
    expect(melding.at).toEqual(new Date(2026, 8, 17, 7, 35));
  });
});
