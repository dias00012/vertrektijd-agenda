import { describe, expect, it } from "vitest";
import { decodePolyline, metersBetween, pathMeters } from "./polyline";

describe("decodePolyline", () => {
  it("pakt het voorbeeld uit de beschrijving van Google uit", () => {
    // `_p~iF~ps|U_ulLnnqC_mqNvxq`@` staat in de documentatie van Google als de
    // route (38.5, -120.2) -> (40.7, -120.95) -> (43.252, -126.453).
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it("houdt rekening met het aantal decimalen dat de planner gebruikt", () => {
    // Dezelfde tekst met een andere precisie is een andere plek op aarde;
    // MOTIS levert 6 of 7 decimalen, niet de 5 van Google.
    const [first] = decodePolyline("_p~iF~ps|U", 6);
    expect(first).toEqual([3.85, -12.02]);
  });

  it("geeft een lege lijst bij lege invoer", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("stopt bij onzin in plaats van door te blijven rekenen", () => {
    // Een afgekapt antwoord mag geen oneindige lus of een punt in de oceaan
    // opleveren; wat er wél in zat is genoeg.
    expect(decodePolyline("_p~iF~ps|U_ulL")).toEqual([[38.5, -120.2]]);
  });
});

describe("pathMeters", () => {
  it("meet een graad noordwaarts als ruim honderd kilometer", () => {
    const meters = metersBetween([52, 5], [53, 5]);
    expect(Math.round(meters / 1000)).toBe(111);
  });

  it("telt de stukjes van een route bij elkaar op", () => {
    const path = pathMeters([
      [52.0, 5.0],
      [52.1, 5.0],
      [52.2, 5.0],
    ]);
    const straight = metersBetween([52.0, 5.0], [52.2, 5.0]);
    expect(Math.round(path)).toBe(Math.round(straight));
  });

  it("is nul bij minder dan twee punten", () => {
    expect(pathMeters([])).toBe(0);
    expect(pathMeters([[52, 5]])).toBe(0);
  });
});
