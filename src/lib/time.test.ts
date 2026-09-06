import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  formatDuration,
  isoWeekNumber,
  minutesToTime,
  timeToMinutes,
  toDateKey,
  toDateTime,
} from "./time";

describe("tijdsleutels", () => {
  it("schrijft maand en dag met een voorloopnul", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("springt netjes over een maandgrens", () => {
    expect(addDaysToKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("houdt rekening met een schrikkeljaar", () => {
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("overleeft de overgang naar zomertijd", () => {
    // In NL gaat de klok in de nacht van 28 op 29 maart 2026 een uur vooruit.
    expect(addDaysToKey("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDaysToKey("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("minuten en klokstanden", () => {
  it("rekent heen en weer", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(minutesToTime(540)).toBe("09:00");
  });

  it("wrapt een negatieve tijd naar de vorige dag", () => {
    // Vertrek om 00:15 met 30 min reistijd: 23:45 de dag ervoor.
    expect(minutesToTime(-15)).toBe("23:45");
  });

  it("wrapt voorbij middernacht", () => {
    expect(minutesToTime(24 * 60 + 30)).toBe("00:30");
  });
});

describe("toDateTime", () => {
  it("zet datum en tijd samen in lokale tijd", () => {
    const result = toDateTime("2026-09-07", "09:00");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);
    expect(result.getDate()).toBe(7);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });
});

describe("formatDuration", () => {
  it("toont minuten onder een uur", () => {
    expect(formatDuration(32)).toBe("32 min");
  });

  it("toont uren en minuten daarboven", () => {
    expect(formatDuration(83)).toBe("1 u 23 min");
  });

  it("wordt nooit negatief", () => {
    expect(formatDuration(-5)).toBe("0 min");
  });
});

describe("isoWeekNumber", () => {
  it("telt de eerste week van het jaar volgens ISO", () => {
    // 1 januari 2026 is een donderdag, dus die hoort al bij week 1.
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2026-01-05")).toBe(2);
  });

  it("laat 1 januari bij het vorige jaar horen als die vroeg in de week valt", () => {
    // 1 januari 2027 is een vrijdag: die week begon in 2026 en is week 53.
    expect(isoWeekNumber("2027-01-01")).toBe(53);
  });

  it("blijft kloppen over de zomertijdgrens heen", () => {
    // De klok gaat op 25 oktober 2026 een uur terug.
    expect(isoWeekNumber("2026-10-19")).toBe(43);
    expect(isoWeekNumber("2026-10-26")).toBe(44);
    expect(isoWeekNumber("2026-11-02")).toBe(45);
  });

  it("geeft elke dag van dezelfde week hetzelfde nummer", () => {
    const week = ["2026-09-07", "2026-09-08", "2026-09-11", "2026-09-13"];
    expect(new Set(week.map(isoWeekNumber)).size).toBe(1);
  });
});
