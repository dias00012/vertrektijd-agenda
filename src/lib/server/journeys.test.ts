import { describe, expect, it } from "vitest";
import { clampCount, dedupe, toJourney } from "./journeys";
import type { Journey } from "@/lib/types";

/**
 * Wat er van een MOTIS-antwoord overblijft voor de reisplanner.
 *
 * Het ophalen zelf is netwerk en wordt hier niet nagedaan; dit gaat over de
 * beslissingen die daarna genomen worden en die je op het scherm terugziet:
 * hoeveel ritten we vragen, welke reis dezelfde is als een andere, en wat een
 * reis "vertraagd" of "uitgevallen" maakt.
 */

function rit(patch: Record<string, unknown> = {}) {
  return {
    startTime: "2026-09-20T08:22:00Z",
    endTime: "2026-09-20T08:54:00Z",
    duration: 1920,
    transfers: 1,
    legs: [
      {
        mode: "TRANSIT",
        startTime: "2026-09-20T08:22:00Z",
        endTime: "2026-09-20T08:54:00Z",
        duration: 1920,
        routeShortName: "IC 1234",
        realTime: true,
      },
    ],
    ...patch,
  } as never;
}

describe("clampCount", () => {
  it("vraagt er vijf als je niets opgeeft", () => {
    expect(clampCount(undefined)).toBe(5);
  });

  it("houdt zich aan wat je vraagt binnen de grenzen", () => {
    expect(clampCount(3)).toBe(3);
    expect(clampCount(10)).toBe(10);
  });

  /** Zonder bovengrens vraagt een verkeerd getal er honderden bij de gratis dienst. */
  it("gaat nooit boven de tien", () => {
    expect(clampCount(500)).toBe(10);
  });

  it("gaat nooit onder de een", () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-5)).toBe(1);
  });
});

describe("dedupe", () => {
  const maak = (id: string) => ({ id }) as Journey;

  it("laat verschillende ritten staan", () => {
    expect(dedupe([maak("a"), maak("b")]).map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("houdt de eerste van twee dezelfde", () => {
    expect(dedupe([maak("a"), maak("a"), maak("b")]).map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("redt zich met een lege lijst", () => {
    expect(dedupe([])).toEqual([]);
  });
});

describe("toJourney", () => {
  it("zegt niets terug over een rit zonder tijden", () => {
    expect(toJourney(rit({ startTime: undefined }), "Thuis", "Werk")).toBeNull();
    expect(toJourney(rit({ endTime: undefined }), "Thuis", "Werk")).toBeNull();
    expect(toJourney(rit({ duration: undefined }), "Thuis", "Werk")).toBeNull();
  });

  it("neemt vertrek, aankomst en overstappen over", () => {
    const uit = toJourney(rit(), "Thuis", "Werk")!;

    expect(uit.departure).toBe("2026-09-20T08:22:00Z");
    expect(uit.arrival).toBe("2026-09-20T08:54:00Z");
    expect(uit.transfers).toBe(1);
  });

  /**
   * Twee ritten van 8:22 tot 8:54 met evenveel onderdelen zijn niet dezelfde
   * rit als de bus verschilt. Daarom staat de lijn in de sleutel.
   */
  it("geeft twee ritten met dezelfde tijden maar een andere lijn een eigen sleutel", () => {
    const een = toJourney(rit(), "Thuis", "Werk")!;
    const ander = toJourney(
      rit({
        legs: [
          {
            mode: "TRANSIT",
            startTime: "2026-09-20T08:22:00Z",
            endTime: "2026-09-20T08:54:00Z",
            duration: 1920,
            routeShortName: "IC 5678",
            realTime: true,
          },
        ],
      }),
      "Thuis",
      "Werk",
    )!;

    expect(een.id).not.toBe(ander.id);
  });

  /** De reis is zo vertraagd als het meest vertraagde onderdeel, niet de som. */
  it("neemt de grootste vertraging van alle onderdelen", () => {
    const traag = toJourney(
      rit({
        legs: [
          { mode: "TRANSIT", startTime: "2026-09-20T08:22:00Z", endTime: "2026-09-20T08:40:00Z", duration: 1080, routeShortName: "A", realTime: true, scheduledStartTime: "2026-09-20T08:20:00Z" },
          { mode: "TRANSIT", startTime: "2026-09-20T08:44:00Z", endTime: "2026-09-20T08:54:00Z", duration: 600, routeShortName: "B", realTime: true, scheduledStartTime: "2026-09-20T08:37:00Z" },
        ],
      }),
      "Thuis",
      "Werk",
    )!;

    expect(traag.delayMinutes).toBe(7);
  });

  it("noemt de reis uitgevallen zodra één onderdeel uitvalt", () => {
    const uit = toJourney(
      rit({
        legs: [
          { mode: "TRANSIT", startTime: "2026-09-20T08:22:00Z", endTime: "2026-09-20T08:54:00Z", duration: 1920, routeShortName: "A", cancelled: true },
        ],
      }),
      "Thuis",
      "Werk",
    )!;

    expect(uit.cancelled).toBe(true);
  });

  it("noemt de reis live zodra één onderdeel live is", () => {
    expect(toJourney(rit(), "Thuis", "Werk")!.realTime).toBe(true);
  });

  it("telt geen overstappen als het veld ontbreekt", () => {
    expect(toJourney(rit({ transfers: undefined }), "Thuis", "Werk")!.transfers).toBe(0);
  });
});
