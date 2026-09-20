import { describe, expect, it } from "vitest";
import { routeCacheKey } from "./routing";
import type { GeoLocation } from "@/lib/types";

/**
 * Onder welke sleutel een berekende route wordt bewaard.
 *
 * Dit is de stilste fout die er is: een sleutel die te weinig onderscheidt
 * geeft gewoon een antwoord terug, alleen is het dat van een andere vraag. Je
 * krijgt dan een vertrektijd die klopt -- voor gisteren, of voor lopen terwijl
 * je fietst.
 */

const THUIS: GeoLocation = { label: "Thuis", lat: 52.3874, lon: 5.2653 };
const WERK: GeoLocation = { label: "Werk", lat: 52.5, lon: 5.47 };

describe("routeCacheKey", () => {
  it("geeft dezelfde vraag dezelfde sleutel", () => {
    const a = routeCacheKey("osm", THUIS, WERK, { mode: "car" });
    const b = routeCacheKey("osm", THUIS, WERK, { mode: "car" });

    expect(a).toBe(b);
  });

  it("houdt heen en terug uit elkaar", () => {
    expect(routeCacheKey("osm", THUIS, WERK, { mode: "car" })).not.toBe(
      routeCacheKey("osm", WERK, THUIS, { mode: "car" }),
    );
  });

  it("houdt vervoermiddelen uit elkaar", () => {
    const auto = routeCacheKey("osm", THUIS, WERK, { mode: "car" });
    const fiets = routeCacheKey("osm", THUIS, WERK, { mode: "bike" });
    const ov = routeCacheKey("osm", THUIS, WERK, { mode: "transit" });

    expect(new Set([auto, fiets, ov]).size).toBe(3);
  });

  it("houdt twee aanbieders uit elkaar", () => {
    expect(routeCacheKey("osm", THUIS, WERK, { mode: "car" })).not.toBe(
      routeCacheKey("ors", THUIS, WERK, { mode: "car" }),
    );
  });

  /** Bij OV is een andere dag of tijd een andere rit. */
  it("zet de tijd in de sleutel bij OV", () => {
    const ochtend = routeCacheKey("osm", THUIS, WERK, {
      mode: "transit",
      departAt: "2026-09-20T08:00:00Z",
    });
    const middag = routeCacheKey("osm", THUIS, WERK, {
      mode: "transit",
      departAt: "2026-09-20T14:00:00Z",
    });

    expect(ochtend).not.toBe(middag);
  });

  it("houdt vertrekken om en aankomen om uit elkaar", () => {
    const vertrek = routeCacheKey("osm", THUIS, WERK, {
      mode: "transit",
      departAt: "2026-09-20T08:00:00Z",
    });
    const aankomst = routeCacheKey("osm", THUIS, WERK, {
      mode: "transit",
      arriveBy: "2026-09-20T08:00:00Z",
    });

    expect(vertrek).not.toBe(aankomst);
  });

  it("zet geen tijd in de sleutel bij de auto, want die rijdt altijd", () => {
    const nu = routeCacheKey("osm", THUIS, WERK, {
      mode: "car",
      departAt: "2026-09-20T08:00:00Z",
    });
    const zonder = routeCacheKey("osm", THUIS, WERK, { mode: "car" });

    expect(nu).toBe(zonder);
  });

  /**
   * De fietskeuze hoorde er niet in, en dan kreeg je bij "fiets naar het
   * station" gewoon de eerder berekende looproute terug -- twintig minuten
   * verschil, zonder dat er iets op fout wees.
   */
  it("houdt fietsen naar het station apart van lopen", () => {
    const lopen = routeCacheKey("osm", THUIS, WERK, { mode: "transit", bike: "none" });
    const heen = routeCacheKey("osm", THUIS, WERK, { mode: "transit", bike: "origin" });
    const beide = routeCacheKey("osm", THUIS, WERK, { mode: "transit", bike: "both" });

    expect(new Set([lopen, heen, beide]).size).toBe(3);
  });

  it("behandelt geen fiets hetzelfde als de keuze 'lopen'", () => {
    expect(routeCacheKey("osm", THUIS, WERK, { mode: "transit", bike: "none" })).toBe(
      routeCacheKey("osm", THUIS, WERK, { mode: "transit" }),
    );
  });

  it("negeert de fietskeuze als je niet met het OV gaat", () => {
    expect(routeCacheKey("osm", THUIS, WERK, { mode: "car", bike: "both" })).toBe(
      routeCacheKey("osm", THUIS, WERK, { mode: "car" }),
    );
  });

  /**
   * Vijf decimalen is ongeveer een meter. Verder afronden zou twee verschillende
   * voordeuren dezelfde sleutel geven.
   */
  it("onderscheidt plekken die een paar meter uit elkaar liggen", () => {
    const ernaast: GeoLocation = { label: "Buren", lat: 52.3875, lon: 5.2653 };

    expect(routeCacheKey("osm", THUIS, WERK, { mode: "car" })).not.toBe(
      routeCacheKey("osm", ernaast, WERK, { mode: "car" }),
    );
  });

  it("trekt zich niets aan van het label, alleen van de plek", () => {
    const zelfdePlek: GeoLocation = { label: "Andere naam", lat: THUIS.lat, lon: THUIS.lon };

    expect(routeCacheKey("osm", THUIS, WERK, { mode: "car" })).toBe(
      routeCacheKey("osm", zelfdePlek, WERK, { mode: "car" }),
    );
  });
});
