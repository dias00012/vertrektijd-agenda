import { describe, expect, it } from "vitest";
import { transitParams } from "./transitQuery";

/**
 * Deze parameters bepalen het antwoord van de OV-planner. Een verkeerde stand
 * geeft geen foutmelding maar een te lange reis, dus staan ze hier vast.
 * De standaardwaarden in het commentaar komen uit de OpenAPI-beschrijving van
 * MOTIS v2 (`@motis-project/motis-client` 2.11.2).
 */
const HOME = { label: "Thuis", lat: 52.3874, lon: 5.2647 };
const WORK = { label: "Werk", lat: 52.5168, lon: 5.4714 };

function ask(patch = {}) {
  return transitParams({ from: HOME, to: WORK, shape: "best", ...patch });
}

describe("transitParams", () => {
  it("geeft de coordinaten door zoals MOTIS ze verwacht", () => {
    const params = ask();
    expect(params.get("fromPlace")).toBe("52.3874,5.2647");
    expect(params.get("toPlace")).toBe("52.5168,5.4714");
  });

  it("vraagt de agenda om één beste rit, niet om een vertrekbord", () => {
    // timetableView=false laat MOTIS wachttijd meerekenen en levert bij
    // "uiterlijk aankomen om" de laatst mogelijke vertrektijd.
    const params = ask({ arriveBy: true, time: "2026-09-07T09:00:00.000Z" });
    expect(params.get("timetableView")).toBe("false");
    expect(params.get("arriveBy")).toBe("true");
    expect(params.get("numItineraries")).toBeNull();
  });

  it("vraagt de reisplanner wél om een vertrekbord met meerdere opties", () => {
    const params = ask({ shape: "timetable", options: 5 });
    expect(params.get("timetableView")).toBeNull(); // standaard is true
    expect(params.get("numItineraries")).toBe("5");
  });

  it("laat altijd lopen toe naar en van de halte", () => {
    const params = ask();
    expect(params.get("preTransitModes")).toBe("WALK");
    expect(params.get("postTransitModes")).toBe("WALK");
  });

  it("laat met een fiets zowel lopen als fietsen toe", () => {
    // Alleen BIKE zou de halte om de hoek uitsluiten en je naar een verder
    // station sturen; de planner moet per rit kunnen kiezen.
    const start = ask({ bike: "start" });
    expect(start.get("preTransitModes")).toBe("WALK,BIKE");
    expect(start.get("postTransitModes")).toBe("WALK");

    const both = ask({ bike: "both" });
    expect(both.get("preTransitModes")).toBe("WALK,BIKE");
    expect(both.get("postTransitModes")).toBe("WALK,BIKE");
  });

  it("rekt de looptijd naar de halte op tot twintig minuten", () => {
    // MOTIS staat zelf op 900 seconden; wie verder loopt kreeg een omweg.
    const params = ask();
    expect(params.get("maxPreTransitTime")).toBe(String(20 * 60));
    expect(params.get("maxPostTransitTime")).toBe(String(20 * 60));
  });

  it("geeft het fietsdeel een halfuur", () => {
    const params = ask({ bike: "both" });
    expect(params.get("maxPreTransitTime")).toBe(String(30 * 60));
    expect(params.get("maxPostTransitTime")).toBe(String(30 * 60));
  });

  it("staat een directe loop- of fietsroute van drie kwartier toe", () => {
    // MOTIS staat zelf op 1800 seconden.
    expect(ask().get("maxDirectTime")).toBe(String(45 * 60));
  });

  it("zet arriveBy expliciet op false als er niet om gevraagd is", () => {
    expect(ask({ time: "2026-09-07T17:00:00.000Z" }).get("arriveBy")).toBe("false");
  });

  it("laat de cursor het tijdvenster bepalen bij bladeren", () => {
    const params = ask({
      shape: "timetable",
      cursor: "later|2026-09-07T08:00:00Z",
      time: "2026-09-07T06:00:00.000Z",
      arriveBy: true,
    });
    expect(params.get("pageCursor")).toBe("later|2026-09-07T08:00:00Z");
    // Tijd en richting zouden het venster van de cursor overrulen.
    expect(params.get("time")).toBeNull();
    expect(params.get("arriveBy")).toBeNull();
  });

  it("laat de tijd weg als er geen gegeven is, zodat MOTIS 'nu' pakt", () => {
    expect(ask().get("time")).toBeNull();
  });
});
