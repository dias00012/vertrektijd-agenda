import { describe, expect, it } from "vitest";
import { secretEquals } from "./secretEquals";

describe("secretEquals", () => {
  it("herkent gelijk en ongelijk", () => {
    expect(secretEquals("abc", "abc")).toBe(true);
    expect(secretEquals("abc", "abd")).toBe(false);
  });

  it("valt niet om bij een andere lengte", () => {
    expect(secretEquals("abc", "abcdef")).toBe(false);
    expect(secretEquals("", "abc")).toBe(false);
  });

  it("vergelijkt bytes, niet tekens", () => {
    // Twee strings die er in een terminal hetzelfde uitzien maar anders
    // opgeslagen zijn, zijn niet hetzelfde geheim.
    expect(secretEquals("é", "é")).toBe(false);
  });
});
