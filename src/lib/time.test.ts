import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  formatDuration,
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
