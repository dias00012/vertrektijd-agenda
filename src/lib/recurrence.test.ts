import { describe, expect, it } from "vitest";
import { describeRecurrence, occurrencesOnDate, occursOn, sortWeekdays } from "./recurrence";
import type { Activity } from "./types";

/** Kale activiteit; per test overschrijven we alleen wat ertoe doet. */
function activity(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    category: "school",
    title: "College",
    date: "2026-09-07", // een maandag
    startTime: "09:00",
    endTime: "17:00",
    location: null,
    color: null,
    travelMode: null,
    bufferMinutes: null,
    recurrence: null,
    exceptions: [],
    travel: null,
    returnTravel: null,
    travelError: null,
    source: null,
    linkedTaskId: null,
    linkedExamId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  } as Activity;
}

describe("occursOn", () => {
  it("valt zonder herhaling alleen op de eigen datum", () => {
    const item = activity();
    expect(occursOn(item, "2026-09-07")).toBe(true);
    expect(occursOn(item, "2026-09-08")).toBe(false);
  });

  it("herhaalt op de gekozen weekdagen", () => {
    const item = activity({
      recurrence: { freq: "weekly", weekdays: [1, 3], until: null },
    });
    expect(occursOn(item, "2026-09-07")).toBe(true); // maandag
    expect(occursOn(item, "2026-09-09")).toBe(true); // woensdag
    expect(occursOn(item, "2026-09-08")).toBe(false); // dinsdag
  });

  it("bestaat niet vóór de startdatum", () => {
    const item = activity({
      recurrence: { freq: "weekly", weekdays: [1], until: null },
    });
    expect(occursOn(item, "2026-08-31")).toBe(false);
  });

  it("stopt na de einddatum", () => {
    const item = activity({
      recurrence: { freq: "weekly", weekdays: [1], until: "2026-09-14" },
    });
    expect(occursOn(item, "2026-09-14")).toBe(true);
    expect(occursOn(item, "2026-09-21")).toBe(false);
  });

  it("slaat een uitzonderingsdag over", () => {
    const item = activity({
      recurrence: { freq: "weekly", weekdays: [1], until: null },
      exceptions: ["2026-09-14"],
    });
    expect(occursOn(item, "2026-09-07")).toBe(true);
    expect(occursOn(item, "2026-09-14")).toBe(false);
    expect(occursOn(item, "2026-09-21")).toBe(true);
  });
});

describe("occurrencesOnDate", () => {
  it("houdt de id van de reeks maar zet de dag van de gevraagde datum", () => {
    const item = activity({
      recurrence: { freq: "weekly", weekdays: [1], until: null },
    });
    const [occurrence] = occurrencesOnDate([item], "2026-09-14");
    expect(occurrence.id).toBe("a1");
    expect(occurrence.date).toBe("2026-09-14");
    expect(occurrence.occurrenceId).toBe("a1:2026-09-14");
    expect(occurrence.recurring).toBe(true);
  });
});

describe("sortWeekdays", () => {
  it("zet ze op maandag-eerst en gooit dubbele weg", () => {
    expect(sortWeekdays([0, 3, 1, 1])).toEqual([1, 3, 0]);
  });
});

describe("describeRecurrence", () => {
  it("herkent de werkweek", () => {
    expect(describeRecurrence({ freq: "weekly", weekdays: [1, 2, 3, 4, 5], until: null })).toBe(
      "Elke werkdag",
    );
  });

  it("herkent elke dag", () => {
    expect(
      describeRecurrence({ freq: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], until: null }),
    ).toBe("Elke dag");
  });

  it("vat een aaneengesloten reeks samen", () => {
    expect(describeRecurrence({ freq: "weekly", weekdays: [1, 2, 3], until: null })).toBe(
      "Elke ma t/m wo",
    );
  });

  it("somt losse dagen op", () => {
    expect(describeRecurrence({ freq: "weekly", weekdays: [1, 4], until: null })).toBe(
      "Elke ma, do",
    );
  });

  it("noemt de einddatum", () => {
    expect(describeRecurrence({ freq: "weekly", weekdays: [1], until: "2026-12-31" })).toBe(
      "Elke maandag, t/m 31-12-2026",
    );
  });
});
