import { describe, expect, it } from "vitest";
import { bikeOrNone, isValidPoint, isoOrUndefined, travelModeOrUndefined } from "./input";

/**
 * Wat er uit een verzoek mag komen.
 *
 * Deze controles stonden in twee routes los van elkaar, woord voor woord
 * hetzelfde -- en zonder test. Dat is de combinatie waarin ze uit elkaar gaan
 * lopen zonder dat iemand het merkt.
 */

describe("isValidPoint", () => {
  it("laat een gewoon punt door", () => {
    expect(isValidPoint({ lat: 52.37, lon: 5.21, label: "Thuis" })).toBe(true);
  });

  it("weigert niets", () => {
    expect(isValidPoint(undefined)).toBe(false);
  });

  it("weigert een punt zonder coördinaten", () => {
    expect(isValidPoint({ label: "Ergens" })).toBe(false);
  });

  it("weigert tekst in plaats van getallen", () => {
    expect(isValidPoint({ lat: "52" as unknown as number, lon: 5 })).toBe(false);
  });

  it("weigert NaN en oneindig", () => {
    expect(isValidPoint({ lat: NaN, lon: 5 })).toBe(false);
    expect(isValidPoint({ lat: 52, lon: Infinity })).toBe(false);
  });

  /** Een lengtegraad van 500 is geen plek, en gaat anders door naar de kaartdienst. */
  it("weigert een punt buiten de aarde", () => {
    expect(isValidPoint({ lat: 91, lon: 5 })).toBe(false);
    expect(isValidPoint({ lat: 52, lon: 181 })).toBe(false);
    expect(isValidPoint({ lat: -91, lon: 5 })).toBe(false);
  });

  it("laat de randen zelf wel door", () => {
    expect(isValidPoint({ lat: 90, lon: 180 })).toBe(true);
    expect(isValidPoint({ lat: -90, lon: -180 })).toBe(true);
  });

  it("laat het nulpunt door", () => {
    expect(isValidPoint({ lat: 0, lon: 0 })).toBe(true);
  });
});

describe("isoOrUndefined", () => {
  it("normaliseert een geldige tijd", () => {
    expect(isoOrUndefined("2026-09-20T08:00:00+02:00")).toBe("2026-09-20T06:00:00.000Z");
  });

  /** Geen tijd betekent "vanaf nu", en dat is bruikbaarder dan een foutmelding. */
  it("geeft niets terug bij onzin in plaats van een fout", () => {
    expect(isoOrUndefined("morgenvroeg")).toBeUndefined();
    expect(isoOrUndefined("")).toBeUndefined();
    expect(isoOrUndefined(undefined)).toBeUndefined();
    expect(isoOrUndefined(12345)).toBeUndefined();
    expect(isoOrUndefined(null)).toBeUndefined();
  });
});

describe("travelModeOrUndefined", () => {
  it("kent de vier vervoermiddelen", () => {
    for (const mode of ["car", "bike", "walk", "transit"]) {
      expect(travelModeOrUndefined(mode)).toBe(mode);
    }
  });

  it("geeft niets terug bij iets anders", () => {
    expect(travelModeOrUndefined("vliegtuig")).toBeUndefined();
    expect(travelModeOrUndefined(undefined)).toBeUndefined();
  });
});

describe("bikeOrNone", () => {
  it("kent de drie kanten waar een fiets kan staan", () => {
    expect(bikeOrNone("origin")).toBe("origin");
    expect(bikeOrNone("destination")).toBe("destination");
    expect(bikeOrNone("both")).toBe("both");
  });

  it("betekent lopen bij alles wat het niet kent", () => {
    expect(bikeOrNone("none")).toBe("none");
    expect(bikeOrNone("start")).toBe("none");
    expect(bikeOrNone(undefined)).toBe("none");
    expect(bikeOrNone(42)).toBe("none");
  });
});
