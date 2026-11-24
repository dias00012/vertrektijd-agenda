import { describe, expect, it } from "vitest";
import { badgeValue, departureCountdown } from "./countdown";

describe("departureCountdown", () => {
  it("telt af zolang je nog tijd hebt", () => {
    expect(departureCountdown(42)).toEqual({ state: "soon", minutes: 42 });
    expect(departureCountdown(1)).toEqual({ state: "soon", minutes: 1 });
  });

  it("zegt 'nu' op het moment zelf en de vijf minuten erna", () => {
    // Je staat je jas aan te trekken; dan is "te laat" geen behulpzaam woord.
    expect(departureCountdown(0)).toEqual({ state: "now" });
    expect(departureCountdown(-4)).toEqual({ state: "now" });
  });

  it("zegt daarna dat het voorbij is", () => {
    expect(departureCountdown(-5)).toEqual({ state: "passed" });
    expect(departureCountdown(-120)).toEqual({ state: "passed" });
  });

  it("zwijgt zonder vertrektijd en voorbij de horizon", () => {
    expect(departureCountdown(null)).toBeNull();
    // Morgenochtend aftellen vanaf vanavond zegt niets; daar staat de datum.
    expect(departureCountdown(13 * 60)).toBeNull();
  });
});

describe("badgeValue", () => {
  it("zet de minuten op het icoon binnen het uur", () => {
    expect(badgeValue(60)).toBe(60);
    expect(badgeValue(7)).toBe(7);
  });

  it("houdt het op 1 zodra je moet gaan", () => {
    // Nul betekent bij de browser "haal het cijfer weg", dus dat kan niet.
    expect(badgeValue(0)).toBe(1);
    expect(badgeValue(-4)).toBe(1);
  });

  it("haalt het cijfer weg als het niets meer zegt", () => {
    expect(badgeValue(null)).toBeNull();
    expect(badgeValue(61)).toBeNull();
    // Een icoon dat blijft roepen voor een bus die weg is, leer je negeren.
    expect(badgeValue(-30)).toBeNull();
  });
});
