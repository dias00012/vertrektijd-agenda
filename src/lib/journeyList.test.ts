import { describe, expect, it } from "vitest";
import { arrivesNextDay, departureDay, endOfDay, latestOnTime } from "./journeyList";
import type { Journey } from "./types";

const rit = (patch: Partial<Journey> = {}): Journey => ({
  id: "r1",
  departure: "2026-09-18T07:00:00.000Z",
  arrival: "2026-09-18T08:00:00.000Z",
  durationMinutes: 60,
  transfers: 0,
  legs: [],
  delayMinutes: 0,
  realTime: false,
  cancelled: false,
  ...patch,
});

/** 18 september 2026, 12:00 in Amsterdam. */
const VANDAAG = new Date(2026, 8, 18, 12, 0);

describe("departureDay", () => {
  it("zegt niets als de rit vandaag vertrekt", () => {
    expect(departureDay(rit(), VANDAAG)).toBeNull();
  });

  it("geeft de dag terug als de rit morgen vertrekt", () => {
    /*
     * Dit is het geval waar het om begonnen is: zoek je 's avonds laat, dan
     * zijn de meeste opties van morgen, en op de kaart stond alleen "05:40".
     */
    const morgenvroeg = new Date(2026, 8, 19, 5, 40).toISOString();
    expect(departureDay(rit({ departure: morgenvroeg }), VANDAAG)).toBe("2026-09-19");
  });

  it("kijkt naar de kalenderdag en niet naar het aantal uren ertussen", () => {
    // Om 23:00 vandaag gezocht, rit om 00:10: dat is anderhalf uur later maar
    // wel een andere dag, en dat is precies wat je wilt zien.
    const laat = new Date(2026, 8, 18, 23, 0);
    const naMiddernacht = new Date(2026, 8, 19, 0, 10).toISOString();
    expect(departureDay(rit({ departure: naMiddernacht }), laat)).toBe("2026-09-19");
  });

  it("valt niet om over een onleesbare tijd", () => {
    expect(departureDay(rit({ departure: "banaan" }), VANDAAG)).toBeNull();
  });
});

describe("arrivesNextDay", () => {
  it("herkent een rit die over middernacht heen gaat", () => {
    expect(
      arrivesNextDay(
        rit({
          departure: new Date(2026, 8, 18, 23, 40).toISOString(),
          arrival: new Date(2026, 8, 19, 0, 29).toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it("zegt nee bij een gewone rit binnen één dag", () => {
    expect(arrivesNextDay(rit())).toBe(false);
  });

  it("kijkt niet naar de kloktijd maar naar de dag", () => {
    // Een nachtrit van 00:10 tot 06:00 blijft binnen dezelfde dag, ook al
    // begint hij na middernacht.
    expect(
      arrivesNextDay(
        rit({
          departure: new Date(2026, 8, 19, 0, 10).toISOString(),
          arrival: new Date(2026, 8, 19, 6, 0).toISOString(),
        }),
      ),
    ).toBe(false);
  });
});

describe("latestOnTime", () => {
  /** Vijf ritten naar Zwolle, zoals de planner ze teruggaf. */
  const lijst = [
    rit({ id: "a", arrival: new Date(2026, 8, 18, 11, 48).toISOString() }),
    rit({ id: "b", arrival: new Date(2026, 8, 18, 12, 17).toISOString() }),
    rit({ id: "c", arrival: new Date(2026, 8, 18, 12, 48).toISOString() }),
    rit({ id: "d", arrival: new Date(2026, 8, 18, 13, 17).toISOString() }),
    rit({ id: "e", arrival: new Date(2026, 8, 18, 13, 48).toISOString() }),
  ];

  it("wijst de laatste rit aan die het nog haalt", () => {
    // Moet om 14:00 binnen zijn: dan is die van 13:48 het antwoord, niet die
    // van 11:48 die bovenaan staat.
    expect(latestOnTime(lijst, new Date(2026, 8, 18, 14, 0))).toBe("e");
  });

  it("telt een rit mee die precies op tijd aankomt", () => {
    // "Uiterlijk om 13:48" betekent dat 13:48 nog goed is.
    expect(latestOnTime(lijst, new Date(2026, 8, 18, 13, 48))).toBe("e");
  });

  it("slaat ritten over die te laat zijn", () => {
    expect(latestOnTime(lijst, new Date(2026, 8, 18, 12, 30))).toBe("b");
  });

  it("geeft niets terug als er geen enkele op tijd is", () => {
    // Dan is markeren misleidend: er is niets dat het haalt.
    expect(latestOnTime(lijst, new Date(2026, 8, 18, 10, 0))).toBeNull();
  });

  it("slaat een uitgevallen rit over", () => {
    // Die haalt het per definitie niet, hoe mooi de tijd ook staat.
    const metUitval = [...lijst, rit({ id: "x", arrival: new Date(2026, 8, 18, 13, 55).toISOString(), cancelled: true })];
    expect(latestOnTime(metUitval, new Date(2026, 8, 18, 14, 0))).toBe("e");
  });

  it("valt niet om over een lege lijst of een onleesbare tijd", () => {
    expect(latestOnTime([], new Date(2026, 8, 18, 14, 0))).toBeNull();
    expect(latestOnTime(lijst, new Date("banaan"))).toBeNull();
  });
});

describe("endOfDay", () => {
  it("geeft het laatste moment van dezelfde dag", () => {
    const eind = endOfDay(new Date(2026, 8, 18, 14, 30));
    expect(eind.getFullYear()).toBe(2026);
    expect(eind.getMonth()).toBe(8);
    expect(eind.getDate()).toBe(18);
    expect(eind.getHours()).toBe(23);
    expect(eind.getMinutes()).toBe(59);
  });

  it("blijft op vandaag, ook vlak voor middernacht", () => {
    // Om 23:50 is "vanavond" nog steeds vanavond, geen tien minuten later.
    expect(endOfDay(new Date(2026, 8, 18, 23, 50)).getDate()).toBe(18);
  });

  it("raakt de meegegeven datum niet aan", () => {
    // Een functie die zijn invoer verandert is een val: de aanroeper rekent
    // daarna met een ander moment dan hij dacht.
    const nu = new Date(2026, 8, 18, 14, 30);
    endOfDay(nu);
    expect(nu.getHours()).toBe(14);
  });
});
