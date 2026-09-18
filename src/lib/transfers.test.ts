import { describe, expect, it } from "vitest";
import { TIGHT_TRANSFER_MINUTES, tightestTransfer, transfersOf } from "./transfers";
import type { TravelLeg } from "./types";

/**
 * De echte rit die dit aan het licht bracht, Almere Buiten naar Maastricht:
 * aankomst Utrecht 13:05, drie minuten lopen, vertrek 13:09. Eén minuut
 * speling, en op het scherm stond daar niets over.
 */

const t = (klok: string) => `2026-09-18T${klok}:00.000Z`;

const loop = (van: string, naar: string, minuten: number, aan?: string, af?: string): TravelLeg => ({
  mode: "walk",
  durationMinutes: minuten,
  from: van,
  to: naar,
  departure: aan,
  arrival: af,
});

const rit = (
  lijn: string,
  van: string,
  naar: string,
  vertrek: string,
  aankomst: string,
): TravelLeg => ({
  mode: "rail",
  durationMinutes: 0,
  from: van,
  to: naar,
  line: lijn,
  departure: t(vertrek),
  arrival: t(aankomst),
});

/** De rit uit het voorbeeld hierboven. */
const NAAR_MAASTRICHT: TravelLeg[] = [
  loop("Almere Buiten", "Molenbuurt", 7, t("11:54"), t("12:01")),
  rit("M2", "Molenbuurt", "Station Centrum", "12:01", "12:13"),
  loop("Station Centrum", "Almere Centrum", 1, t("12:13"), t("12:14")),
  rit("Sprinter", "Almere Centrum", "Utrecht Centraal", "12:21", "13:05"),
  loop("Utrecht Centraal", "Utrecht Centraal", 3, t("13:05"), t("13:08")),
  rit("Intercity", "Utrecht Centraal", "Maastricht", "13:09", "15:03"),
];

describe("transfersOf", () => {
  it("vindt beide overstappen van de echte rit", () => {
    const uit = transfersOf(NAAR_MAASTRICHT);
    expect(uit).toHaveLength(2);
  });

  it("rekent de speling uit: lopen telt niet als speling", () => {
    // Utrecht: 13:05 aankomst, 13:09 vertrek = 4 minuten, waarvan 3 lopen.
    const utrecht = transfersOf(NAAR_MAASTRICHT)[1];
    expect(utrecht.at).toBe("Utrecht Centraal");
    expect(utrecht.minutes).toBe(4);
    expect(utrecht.walkMinutes).toBe(3);
    expect(utrecht.slackMinutes).toBe(1);
    expect(utrecht.tight).toBe(true);
  });

  it("noemt een ruime overstap niet krap", () => {
    // Almere: 12:13 aankomst, 12:21 vertrek = 8 minuten, waarvan 1 lopen.
    const almere = transfersOf(NAAR_MAASTRICHT)[0];
    expect(almere.slackMinutes).toBe(7);
    expect(almere.tight).toBe(false);
  });

  it("telt de tijd vóór je eerste rit niet mee", () => {
    /*
     * Je loopt zeven minuten naar de halte en vertrekt dan. Dat is geen
     * aansluiting die je kunt missen -- te laat op je eerste trein is iets wat
     * jij doet. Zou dit wel meetellen, dan zou elke reis "krap" heten zodra je
     * strak op tijd van huis gaat.
     */
    const uit = transfersOf(NAAR_MAASTRICHT);
    expect(uit.map((o) => o.at)).toEqual(["Station Centrum", "Utrecht Centraal"]);
  });

  it("geeft niets terug voor een rit zonder overstap", () => {
    const direct = [
      loop("Thuis", "Station", 2),
      rit("Intercity", "Station", "Zwolle", "08:03", "08:44"),
      loop("Zwolle", "School", 5),
    ];
    expect(transfersOf(direct)).toEqual([]);
  });

  it("valt niet om zonder tijden", () => {
    // Een fiets- of looproute heeft geen dienstregeling.
    expect(transfersOf([loop("A", "B", 20), loop("B", "C", 10)])).toEqual([]);
  });

  it("kan om met twee ritten direct achter elkaar", () => {
    // Overstappen op hetzelfde perron: geen loopstuk ertussen.
    const perron = [
      rit("Sprinter", "A", "B", "08:00", "08:30"),
      rit("Intercity", "B", "C", "08:33", "09:00"),
    ];
    const uit = transfersOf(perron);
    expect(uit).toHaveLength(1);
    expect(uit[0].walkMinutes).toBe(0);
    expect(uit[0].slackMinutes).toBe(3);
    expect(uit[0].tight).toBe(true);
  });

  it("legt de grens bij vijf minuten", () => {
    expect(TIGHT_TRANSFER_MINUTES).toBe(5);
    const krap = [
      rit("A", "x", "y", "08:00", "08:30"),
      rit("B", "y", "z", "08:34", "09:00"),
    ];
    const net = [
      rit("A", "x", "y", "08:00", "08:30"),
      rit("B", "y", "z", "08:35", "09:00"),
    ];
    expect(transfersOf(krap)[0].tight).toBe(true);
    expect(transfersOf(net)[0].tight).toBe(false);
  });
});

describe("tightestTransfer", () => {
  it("wijst de krapste aan", () => {
    // Niet de eerste of de laatste, maar die met de minste speling.
    expect(tightestTransfer(NAAR_MAASTRICHT)?.at).toBe("Utrecht Centraal");
  });

  it("geeft niets terug zonder overstap", () => {
    expect(tightestTransfer([rit("IC", "A", "B", "08:00", "09:00")])).toBeNull();
  });
});
