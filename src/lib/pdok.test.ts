import { describe, expect, it } from "vitest";
import { parsePoint, toGeocodeResults } from "./pdok";

/**
 * Deze vertaalslag bepaalt waar de app naartoe rekent. Een punt dat er
 * geloofwaardig uitziet maar zeshonderd meter naast je voordeur ligt, levert
 * een reistijd op die nergens uit blijkt — vandaar dat het hier vastligt.
 */
describe("parsePoint", () => {
  it("leest lengte- en breedtegraad in de goede volgorde", () => {
    // De Locatieserver zet de lengtegraad eerst; omdraaien zou je in Duitsland
    // laten uitkomen.
    expect(parsePoint("POINT(5.47139 52.51683)")).toEqual({
      lat: 52.51683,
      lon: 5.47139,
    });
  });

  it("verdraagt extra spaties", () => {
    expect(parsePoint("POINT( 4.9 52.37 )")).toEqual({ lat: 52.37, lon: 4.9 });
  });

  it("weigert wat niet leesbaar is", () => {
    for (const raw of [undefined, "", "5.47 52.51", "POINT()", "POINT(a b)"]) {
      expect(parsePoint(raw), String(raw)).toBeNull();
    }
  });

  it("weigert een punt dat buiten Nederland valt", () => {
    // Omgedraaide coordinaten leveren zoiets op; die moeten eruit.
    expect(parsePoint("POINT(52.51683 5.47139)")).toBeNull();
  });
});

describe("toGeocodeResults", () => {
  const adres = {
    type: "adres",
    weergavenaam: "Donaustraat 184, 8226LL Lelystad",
    straatnaam: "Donaustraat",
    huis_nlt: "184",
    postcode: "8226LL",
    woonplaatsnaam: "Lelystad",
    gemeentenaam: "Lelystad",
    centroide_ll: "POINT(5.47139 52.51683)",
  };

  it("maakt van een huisadres een bruikbare suggestie", () => {
    const [result] = toGeocodeResults({ response: { docs: [adres] } }, 5);

    expect(result).toMatchObject({
      name: "Donaustraat 184",
      label: "Donaustraat 184, Lelystad",
      lat: 52.51683,
      lon: 5.47139,
    });
    expect(result.context).toContain("8226LL");
  });

  it("herhaalt de plaatsnaam niet in de tweede regel", () => {
    const [result] = toGeocodeResults(
      { response: { docs: [{ ...adres, type: "woonplaats", straatnaam: undefined, huis_nlt: undefined }] } },
      5,
    );

    expect(result.name).toBe("Lelystad");
    expect(result.context).not.toContain("Lelystad");
  });

  it("kent ook een straat zonder huisnummer", () => {
    const [result] = toGeocodeResults(
      { response: { docs: [{ ...adres, type: "weg", huis_nlt: undefined, postcode: undefined }] } },
      5,
    );

    expect(result.name).toBe("Donaustraat");
    expect(result.label).toBe("Donaustraat, Lelystad");
  });

  it("slaat resultaten zonder bruikbaar punt over", () => {
    const results = toGeocodeResults(
      { response: { docs: [{ ...adres, centroide_ll: "onzin" }, adres] } },
      5,
    );

    expect(results).toHaveLength(1);
  });

  it("houdt zich aan het gevraagde aantal", () => {
    const results = toGeocodeResults(
      { response: { docs: [adres, adres, adres, adres] } },
      2,
    );

    expect(results).toHaveLength(2);
  });

  it("struikelt niet over een leeg of onverwacht antwoord", () => {
    expect(toGeocodeResults({}, 5)).toEqual([]);
    expect(toGeocodeResults({ response: {} }, 5)).toEqual([]);
    expect(toGeocodeResults({ response: { docs: [] } }, 5)).toEqual([]);
  });
});
