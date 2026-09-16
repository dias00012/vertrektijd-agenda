import { describe, expect, it } from "vitest";
import { builtinCategories, getCategory, resolveCategory } from "./categories";
import type { CustomCategory } from "./types";

const EIGEN: CustomCategory[] = [
  { id: "bijbaan", label: "Bijbaan", emoji: "\u{1F3EA}", color: "#f43f5e" },
];

describe("resolveCategory", () => {
  it("vindt een ingebouwd type", () => {
    expect(resolveCategory("gym").id).toBe("gym");
  });

  it("vindt een zelfgemaakt type", () => {
    expect(resolveCategory("bijbaan", EIGEN).label).toBe("Bijbaan");
  });

  /**
   * Dit gebeurt echt: een agenda van buiten met `"sport"` in plaats van
   * `"gym"`, of een eigen type dat je hebt weggegooid terwijl er nog
   * activiteiten op stonden.
   */
  it("doet zich bij een onbekend type niet voor als School", () => {
    const onbekend = resolveCategory("sport", EIGEN);
    const school = builtinCategories()[0];

    expect(onbekend.id).toBe("sport");
    expect(onbekend.label).toBe("sport");
    expect(onbekend.emoji).not.toBe(school.emoji);
    expect(onbekend.color).not.toBe(school.color);
  });

  it("houdt zo'n activiteit wel toonbaar", () => {
    const onbekend = resolveCategory("weggegooid");
    expect(onbekend.label.length).toBeGreaterThan(0);
    expect(onbekend.emoji.length).toBeGreaterThan(0);
    expect(onbekend.color).toMatch(/^#/);
  });

  it("geldt ook voor getCategory, dat alleen de ingebouwde kent", () => {
    expect(getCategory("bijbaan").color).not.toBe(builtinCategories()[0].color);
  });
});
