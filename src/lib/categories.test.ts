import { describe, expect, it } from "vitest";
import {
  allCategories,
  builtinCategories,
  getCategory,
  initialOf,
  isBuiltin,
  resolveCategory,
} from "./categories";
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

describe("een standaardtype dat je zelf hebt aangepast", () => {
  /*
   * De vijf standaardtypes lagen vast in de code. "Gym" heet bij de een
   * Sporten en bij de ander Fitness, en de kleur is smaak. Het `id` blijft
   * staan -- daar hangen alle activiteiten aan.
   */
  it("neemt je eigen naam over", () => {
    const gym = getCategory("gym", { gym: { label: "Sporten" } });
    expect(gym.label).toBe("Sporten");
    expect(gym.id).toBe("gym");
  });

  it("laat de rest ongemoeid wanneer je alleen de kleur verandert", () => {
    const standaard = getCategory("gym");
    const mijn = getCategory("gym", { gym: { color: "#ec4899" } });
    expect(mijn.color).toBe("#ec4899");
    expect(mijn.label).toBe(standaard.label);
    expect(mijn.emoji).toBe(standaard.emoji);
  });

  it("valt terug op de standaard bij een lege waarde", () => {
    // Een leeggemaakt veld is geen naam, dus dan weer die van de app.
    const standaard = getCategory("koken");
    expect(getCategory("koken", { koken: { label: "   " } }).label).toBe(standaard.label);
    expect(getCategory("koken", { koken: { emoji: "" } }).emoji).toBe(standaard.emoji);
  });

  it("raakt de andere types niet", () => {
    const alle = builtinCategories({ gym: { label: "Sporten" } });
    expect(alle.map((item) => item.label)).toEqual([
      getCategory("school").label,
      getCategory("werk").label,
      "Sporten",
      getCategory("koken").label,
      getCategory("hobby").label,
    ]);
  });

  it("werkt ook via resolveCategory en allCategories", () => {
    const eigen = [{ id: "hw", label: "Huiswerk", emoji: "", color: "#3b82f6" }];
    expect(resolveCategory("werk", eigen, { werk: { label: "Bijbaan" } }).label).toBe("Bijbaan");
    expect(allCategories(eigen, { werk: { label: "Bijbaan" } })[1].label).toBe("Bijbaan");
  });
});

describe("isBuiltin", () => {
  it("kent de vijf van de app", () => {
    expect(["school", "werk", "gym", "koken", "hobby"].every(isBuiltin)).toBe(true);
  });

  it("herkent een eigen type niet als standaard", () => {
    expect(isBuiltin("hw")).toBe(false);
  });
});
