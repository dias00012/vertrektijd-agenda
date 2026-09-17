import { describe, expect, it } from "vitest";
import { allCategories, builtinCategories, getCategory, initialOf, resolveCategory } from "./categories";
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

describe("initialOf", () => {
  it("neemt de eerste letter, als hoofdletter", () => {
    expect(initialOf("Bijbaan")).toBe("B");
    expect(initialOf("huiswerk")).toBe("H");
  });

  it("slaat spaties aan het begin over", () => {
    expect(initialOf("  Muziekles")).toBe("M");
  });

  it("houdt een emoji heel", () => {
    // Met `label[0]` viel een emoji in tweeën uiteen en kwam er een half
    // teken uit dat als blokje werd getekend.
    expect(initialOf("\u{1F3B8} Gitaar")).toBe("\u{1F3B8}");
  });

  it("houdt een letter met een accent heel", () => {
    expect(initialOf("\u00e9\u00e9n ding")).toBe("\u00c9");
  });

  it("valt terug op een stip bij een lege naam", () => {
    expect(initialOf("   ")).toBe("\u2022");
  });
});

describe("een eigen type zonder icoon", () => {
  /*
   * Een emoji was verplicht, en dat is een rare eis aan iemand achter een
   * laptop: daar moet je een sneltoets kennen. Wie die niet kende typte maar
   * iets -- er stond hier een type "Huiswerk" met een 7 ervoor.
   */
  it("krijgt de eerste letter van zijn naam", () => {
    const eigen = [{ id: "hw", label: "Huiswerk", emoji: "", color: "#3b82f6" }];
    expect(resolveCategory("hw", eigen).emoji).toBe("H");
  });

  it("verandert mee wanneer je het type hernoemt", () => {
    // Daarom gebeurt dit bij het lezen en niet bij het opslaan.
    const eigen = [{ id: "hw", label: "Muziek", emoji: " ", color: "#3b82f6" }];
    expect(allCategories(eigen).at(-1)?.emoji).toBe("M");
  });

  it("laat een gekozen icoon met rust", () => {
    const eigen = [{ id: "hw", label: "Huiswerk", emoji: "\u{1F4DA}", color: "#3b82f6" }];
    expect(resolveCategory("hw", eigen).emoji).toBe("\u{1F4DA}");
  });
});
