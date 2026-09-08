import { describe, expect, it } from "vitest";
import { missesStreet } from "./places";

/**
 * Een adres zonder straatnaam is geen adres. De app rekende er wel gewoon mee,
 * en dat kostte op één rit tien minuten die nergens uit bleken.
 */
describe("missesStreet", () => {
  it("herkent een los huisnummer", () => {
    for (const label of ["60, Almere", "184, Lelystad", "12", "184-A, Lelystad"]) {
      expect(missesStreet({ label }), label).toBe(true);
    }
  });

  it("laat een straatnaam die met een cijfer begint met rust", () => {
    for (const label of ["1e Kruisstraat 4, Amsterdam", "2e Weteringdwarsstraat 10"]) {
      expect(missesStreet({ label }), label).toBe(false);
    }
  });

  it("laat een volledig adres met rust", () => {
    for (const label of [
      "Gran Canariastraat 60, Almere",
      "Donaustraat 184, Lelystad",
      "Basic-Fit Almere Buiten",
      "Treinstation Lelystad Centrum",
      "'s-Gravenhage",
    ]) {
      expect(missesStreet({ label }), label).toBe(false);
    }
  });

  it("doet niets zonder locatie of zonder naam", () => {
    expect(missesStreet(null)).toBe(false);
    expect(missesStreet({ label: "" })).toBe(false);
    expect(missesStreet({ label: "   " })).toBe(false);
  });
});
