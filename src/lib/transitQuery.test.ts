import { describe, expect, it } from "vitest";
import { DEFAULT_WALK_SPEED, transitParams, WALK_SPEEDS } from "./transitQuery";

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

  it("vraagt de agenda een klein venster op om zelf uit te kiezen", () => {
    // Niet timetableView=false: dan geeft MOTIS één rit terug en die is bij
    // "uiterlijk aankomen om" de laatste die het haalt — desnoods met een half
    // uur wachten erin en aankomst op de deadline. Met een paar opties kan
    // `pickItinerary` bij een gelijke vertrektijd de kortste rit nemen.
    const params = ask({ arriveBy: true, time: "2026-09-07T09:00:00.000Z" });
    expect(params.get("timetableView")).toBeNull(); // standaard is true
    expect(params.get("numItineraries")).toBe("3");
    expect(params.get("arriveBy")).toBe("true");
  });

  it("vraagt de reisplanner om een vertrekbord met meer opties", () => {
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
    const params = ask({ bike: "origin" });
    expect(params.get("preTransitModes")).toBe("WALK,BIKE");
  });

  it("zet de fiets op de heenreis aan het begin", () => {
    const params = ask({ bike: "origin" });
    expect(params.get("preTransitModes")).toBe("WALK,BIKE");
    expect(params.get("maxPreTransitTime")).toBe(String(30 * 60));
    expect(params.get("postTransitModes")).toBe("WALK");
    expect(params.get("maxPostTransitTime")).toBe(String(20 * 60));
  });

  it("zet dezelfde fiets op de terugreis aan het eind", () => {
    // Je fiets staat thuis. Naar huis toe is dat het laatste stuk, niet het
    // eerste. Zonder dat onderscheid mocht je heen een half uur fietsen maar
    // terug alleen twintig minuten lopen, en viel je huis buiten bereik.
    const params = ask({ bike: "destination" });
    expect(params.get("preTransitModes")).toBe("WALK");
    expect(params.get("maxPreTransitTime")).toBe(String(20 * 60));
    expect(params.get("postTransitModes")).toBe("WALK,BIKE");
    expect(params.get("maxPostTransitTime")).toBe(String(30 * 60));
  });

  it("rekt de looptijd naar de halte op tot twintig minuten", () => {
    // MOTIS staat zelf op 900 seconden; wie verder loopt kreeg een omweg.
    const params = ask();
    expect(params.get("maxPreTransitTime")).toBe(String(20 * 60));
    expect(params.get("maxPostTransitTime")).toBe(String(20 * 60));
  });

  it("geeft het fietsdeel aan beide kanten een halfuur", () => {
    const params = ask({ bike: "both" });
    expect(params.get("preTransitModes")).toBe("WALK,BIKE");
    expect(params.get("postTransitModes")).toBe("WALK,BIKE");
    expect(params.get("maxPreTransitTime")).toBe(String(30 * 60));
    expect(params.get("maxPostTransitTime")).toBe(String(30 * 60));
  });

  it("laat overstappen over de echte straat berekenen", () => {
    // De vaste looppaden bij de dienstregeling zijn niet compleet: ontbreekt
    // er een tussen het perron en het busstation ernaast, dan bestaat die
    // overstap voor de planner niet en kom je op een latere bus uit.
    expect(ask().get("useRoutedTransfers")).toBe("true");
    expect(ask({ shape: "timetable" }).get("useRoutedTransfers")).toBe("true");
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

  /**
   * De loopsnelheid raakt elk loopstuk: naar de halte, de overstap en het
   * laatste stuk naar de deur. Bij "normaal" mag er niets meegestuurd worden,
   * anders schuift de app stilletjes alle bestaande reistijden op.
   */
  it("stuurt geen loopsnelheid mee bij normaal lopen", () => {
    expect(ask().get("pedestrianSpeed")).toBeNull();
    expect(ask({ walk: "normal" }).get("pedestrianSpeed")).toBeNull();
  });

  it("stuurt de loopsnelheid mee zodra je zegt hoe je loopt", () => {
    expect(ask({ walk: "fast" }).get("pedestrianSpeed")).toBe("1.4");
    expect(ask({ walk: "slow" }).get("pedestrianSpeed")).toBe("0.9");
  });

  it("gaat standaard uit van stevig doorlopen, net als 9292", () => {
    // Deze standaard bepaalt elke reistijd in de app. Gaat hij per ongeluk
    // terug naar de voorzichtige snelheid van de planner, dan wordt elke rit
    // met drie loopstukken stilletjes tien minuten langer.
    expect(DEFAULT_WALK_SPEED).toBe("fast");
    expect(ask({ walk: DEFAULT_WALK_SPEED }).get("pedestrianSpeed")).toBe("1.4");
  });

  it("houdt stevig doorlopen sneller dan rustig aan", () => {
    expect(WALK_SPEEDS.fast).toBeGreaterThan(WALK_SPEEDS.slow as number);
    // 5 km/h, waar 9292 mee rekent.
    expect(WALK_SPEEDS.fast).toBeCloseTo(5000 / 3600, 1);
  });
});
