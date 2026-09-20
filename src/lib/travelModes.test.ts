import { describe, expect, it } from "vitest";
import { describeLeg, legTime, travelModeMeta, travelModes } from "./travelModes";
import { setLanguage } from "./i18n/locale";
import type { TravelLeg } from "./types";

/**
 * De tekst die je bij elk onderdeel van een rit leest. Kleine logica, veel
 * zichtbaarheid: dit staat op elke reiskaart, bij elk loopstuk en elke trein.
 */

const leg = (patch: Partial<TravelLeg> = {}): TravelLeg => ({
  mode: "rail",
  durationMinutes: 10,
  from: "A",
  to: "B",
  ...patch,
});

describe("describeLeg", () => {
  it("zegt waar je heen loopt", () => {
    setLanguage("nl");
    expect(describeLeg(leg({ mode: "walk", to: "Almere Centrum" }))).toContain("Almere Centrum");
  });

  it("zegt alleen 'lopen' als er geen plek bekend is", () => {
    // Bij een loopstuk binnen dezelfde halte zegt een plaatsnaam niets.
    expect(describeLeg(leg({ mode: "walk", to: "" }))).not.toContain("undefined");
  });

  it("zet het ritnummer achter de lijnnaam", () => {
    expect(describeLeg(leg({ line: "Intercity", trip: "831" }))).toContain("Intercity 831");
  });

  it("verdubbelt het ritnummer niet als het al in de lijnnaam staat", () => {
    /*
     * Sommige vervoerders geven de lijn al mét nummer terug ("ICD 2422"). Zonder
     * deze controle stond er "ICD 2422 2422" op je scherm.
     */
    expect(describeLeg(leg({ line: "ICD 2422", trip: "2422" }))).not.toContain("2422 2422");
  });

  it("noemt de richting erbij, zoals op het bord", () => {
    // Daar zoek je op het perron op: niet het ritnummer maar waar hij heen gaat.
    const uit = describeLeg(leg({ line: "Intercity", headsign: "Leeuwarden" }));
    expect(uit).toContain("Intercity");
    expect(uit).toContain("Leeuwarden");
  });

  it("valt terug op de bestemming als er geen lijn is", () => {
    expect(describeLeg(leg({ line: undefined, trip: undefined, to: "Zwolle" }))).toBe("Zwolle");
  });

  it("zegt nog steeds iets als er helemaal niets bekend is", () => {
    // Een lege regel op je scherm is erger dan een vaag woord.
    expect(describeLeg(leg({ line: undefined, trip: undefined, to: "" })).length).toBeGreaterThan(
      0,
    );
  });
});

describe("legTime", () => {
  it("geeft de kloktijd in de tijdzone van de gebruiker", () => {
    // De tests draaien op Europe/Amsterdam; 06:03 UTC is hier 08:03.
    expect(legTime("2026-09-18T06:03:00.000Z")).toBe("08:03");
  });

  it("vult aan tot twee cijfers", () => {
    expect(legTime("2026-09-18T06:05:00.000Z")).toBe("08:05");
  });

  it("geeft niets terug zonder of bij een onleesbare tijd", () => {
    expect(legTime(undefined)).toBeNull();
    expect(legTime("banaan")).toBeNull();
  });
});

describe("travelModes", () => {
  it("biedt lopen niet aan als keuze", () => {
    /*
     * Bewust: voor de afstanden waar deze app over gaat is het OV of de fiets,
     * en een looproute van tien kilometer helpt niemand. `walk` blijft wel in
     * het model, zodat oude activiteiten hun naam en icoon houden.
     */
    expect(travelModes().map((m) => m.id)).not.toContain("walk");
    expect(travelModeMeta("walk").id).toBe("walk");
  });

  it("geeft elk vervoermiddel een naam en een icoon", () => {
    for (const mode of travelModes()) {
      expect(mode.label.length, mode.id).toBeGreaterThan(0);
      expect(mode.emoji.length, mode.id).toBeGreaterThan(0);
    }
  });
});
