import { describe, expect, it } from "vitest";
import { examFields, matchesSearch, taskFields } from "./schoolworkSearch";
import type { Exam, Task } from "./types";

const task = (patch: Partial<Task> = {}): Task => ({
  id: "be5",
  subject: "Bedrijfseconomie",
  title: "BE week 5 – H8 Eigen vermogen",
  deadline: "2026-10-09",
  estimatedMinutes: 90,
  priority: "medium",
  status: "doing",
  steps: [
    { id: "a", title: "Samenvatting H8.1 t/m 8.4", done: false },
    { id: "b", title: "T8.4 Aandelenkapitaal", done: true },
  ],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

const exam = (patch: Partial<Exam> = {}): Exam => ({
  id: "e1",
  subject: "Nederlands",
  title: "Toets congruentie",
  date: "2026-10-16",
  topics: ["Samenstellingen", "Die/dat/wat"],
  priority: "high",
  status: "todo",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

describe("matchesSearch", () => {
  it("laat alles door bij een lege zoekopdracht", () => {
    // Anders moet elke aanroeper eraan denken; dat is de `if` die je vergeet.
    expect(matchesSearch(taskFields(task()), "")).toBe(true);
    expect(matchesSearch(taskFields(task()), "   ")).toBe(true);
  });

  it("vindt een opdracht op haar vak", () => {
    expect(matchesSearch(taskFields(task()), "bedrijfseconomie")).toBe(true);
    expect(matchesSearch(taskFields(task()), "nederlands")).toBe(false);
  });

  it("trekt zich niets aan van hoofdletters of accenten", () => {
    const met = task({ subject: "Franse Taal", title: "Opgaven cafés" });
    expect(matchesSearch(taskFields(met), "FRANSE")).toBe(true);
    expect(matchesSearch(taskFields(met), "cafes")).toBe(true);
  });

  it("zoekt ook in de stappen", () => {
    // Daar zit het detail dat je je herinnert: "Aandelenkapitaal" is een stap,
    // geen opdracht.
    expect(matchesSearch(taskFields(task()), "aandelenkapitaal")).toBe(true);
  });

  it("zoekt in de onderwerpen van een toets", () => {
    expect(matchesSearch(examFields(exam()), "samenstellingen")).toBe(true);
  });

  it("vindt een nummer met een punt erin", () => {
    // "H8.1" en "h8 1" zijn dezelfde vraag.
    expect(matchesSearch(taskFields(task()), "H8.1")).toBe(true);
    expect(matchesSearch(taskFields(task()), "T8.4")).toBe(true);
  });

  it("wil elk woord terugzien, ook uit een ander veld", () => {
    // Vak uit het ene veld, titel uit het andere: zo zoekt een mens.
    expect(matchesSearch(taskFields(task()), "bedrijfseconomie vermogen")).toBe(true);
    expect(matchesSearch(taskFields(task()), "bedrijfseconomie scheikunde")).toBe(false);
  });

  it("plakt twee velden niet aan elkaar", () => {
    // Zonder scheidingsteken ontstaat er een treffer op de naad: vak
    // "Nederlands" plus titel "Opgaven" zou "ndsopgaven" vinden.
    const los = task({ subject: "Nederlands", title: "Opgaven", steps: [], description: "" });
    expect(matchesSearch(taskFields(los), "ndsopgaven")).toBe(false);
    expect(matchesSearch(taskFields(los), "nederlands")).toBe(true);
  });

  it("vindt werk op zijn stand en op zijn prioriteit", () => {
    // "wat stond er ook alweer op bezig" is een zoekopdracht als elke andere.
    expect(matchesSearch(taskFields(task()), "bezig")).toBe(true);
    expect(matchesSearch(taskFields(task({ status: "done" })), "bezig")).toBe(false);
    expect(matchesSearch(examFields(exam()), "hoog")).toBe(true);
  });

  it("vindt een deadline op datum", () => {
    expect(matchesSearch(taskFields(task()), "2026-10-09")).toBe(true);
  });

  it("valt niet om op een opdracht zonder stappen of omschrijving", () => {
    const kaal = task({ steps: undefined, description: undefined });
    expect(matchesSearch(taskFields(kaal), "bedrijfseconomie")).toBe(true);
    const kaleToets = exam({ title: undefined, topics: undefined });
    expect(matchesSearch(examFields(kaleToets), "nederlands")).toBe(true);
  });
});
