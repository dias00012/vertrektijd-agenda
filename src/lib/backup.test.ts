import { describe, expect, it } from "vitest";
import { APP_ID, normalizeActivity, parseBackup } from "./backup";

/**
 * Import en cloud-sync lopen allebei door deze normalisatie heen. Wat hier
 * wegvalt, valt dus stil weg uit de agenda van de gebruiker.
 */
describe("normalizeActivity", () => {
  it("houdt een zelfgemaakt activiteitstype overeind", () => {
    // "Bijbaan" werd stil "School" — bij import, maar ook elke keer dat de
    // app de agenda uit de cloud haalde.
    const activity = normalizeActivity({
      id: "a1",
      category: "bijbaan",
      title: "Werken",
      date: "2026-09-07",
    });

    expect(activity.category).toBe("bijbaan");
  });

  it("houdt de ingebouwde types gewoon zoals ze zijn", () => {
    for (const category of ["school", "werk", "gym", "koken", "hobby"]) {
      expect(normalizeActivity({ category }).category).toBe(category);
    }
  });

  it("valt terug op school als er geen type staat", () => {
    expect(normalizeActivity({}).category).toBe("school");
    expect(normalizeActivity({ category: "" }).category).toBe("school");
    expect(normalizeActivity({ category: 42 }).category).toBe("school");
  });

  it("vult ontbrekende velden aan in plaats van te struikelen", () => {
    const activity = normalizeActivity({ title: "Los" });

    expect(activity.title).toBe("Los");
    expect(activity.startTime).toBe("09:00");
    expect(activity.endTime).toBe("10:00");
    expect(activity.exceptions).toEqual([]);
    expect(activity.id).toBeTruthy();
  });
});

describe("parseBackup", () => {
  function file(patch: Record<string, unknown> = {}) {
    return JSON.stringify({
      app: APP_ID,
      version: 2,
      settings: null,
      activities: [],
      tasks: [],
      exams: [],
      ...patch,
    });
  }

  it("leest een bestand van de app zelf", () => {
    const result = parseBackup(file({ activities: [{ id: "a1", title: "College" }] }));

    expect(result.ok).toBe(true);
    expect(result.data?.activities).toHaveLength(1);
  });

  it("weigert een bestand van een andere app", () => {
    expect(parseBackup(file({ app: "iets-anders" })).ok).toBe(false);
  });

  it("weigert tekst die geen JSON is", () => {
    expect(parseBackup("dit is geen bestand").ok).toBe(false);
  });

  it("laat eigen activiteitstypes door de import heen", () => {
    const result = parseBackup(
      file({
        settings: { customCategories: [{ id: "bijbaan", label: "Bijbaan", emoji: "💶", color: "#f00" }] },
        activities: [{ id: "a1", category: "bijbaan", title: "Werken" }],
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data?.activities[0]?.category).toBe("bijbaan");
    expect(result.data?.settings?.customCategories?.[0]?.id).toBe("bijbaan");
  });
});
