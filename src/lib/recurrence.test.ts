import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  occurrencesOnDate,
  occursOn,
  shiftRecurrence,
  sortWeekdays,
} from "./recurrence";
import type { Activity, Recurrence } from "./types";

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

describe("om de week", () => {
  const practicum = activity({
    date: "2026-09-07", // maandag
    recurrence: { freq: "biweekly", weekdays: [1], until: null },
  });

  it("slaat de tussenliggende week over", () => {
    expect(occursOn(practicum, "2026-09-07")).toBe(true);
    expect(occursOn(practicum, "2026-09-14")).toBe(false);
    expect(occursOn(practicum, "2026-09-21")).toBe(true);
    expect(occursOn(practicum, "2026-09-28")).toBe(false);
  });

  it("blijft in het ritme over de zomertijdgrens heen", () => {
    // De klok gaat op 25 oktober 2026 een uur terug.
    expect(occursOn(practicum, "2026-10-19")).toBe(true);
    expect(occursOn(practicum, "2026-11-02")).toBe(true);
    expect(occursOn(practicum, "2026-10-26")).toBe(false);
  });

  it("telt de weken vanaf de startweek, ook op een andere weekdag", () => {
    const woensdag = activity({
      date: "2026-09-07", // maandag: de reeks begint in deze week
      recurrence: { freq: "biweekly", weekdays: [3], until: null },
    });
    expect(occursOn(woensdag, "2026-09-09")).toBe(true);
    expect(occursOn(woensdag, "2026-09-16")).toBe(false);
    expect(occursOn(woensdag, "2026-09-23")).toBe(true);
  });
});

describe("elke maand", () => {
  const huur = activity({
    date: "2026-09-12",
    recurrence: { freq: "monthly", weekdays: [], until: null },
  });

  it("valt elke maand op dezelfde dag van de maand", () => {
    expect(occursOn(huur, "2026-09-12")).toBe(true);
    expect(occursOn(huur, "2026-10-12")).toBe(true);
    expect(occursOn(huur, "2026-12-12")).toBe(true);
    expect(occursOn(huur, "2026-10-13")).toBe(false);
  });

  it("slaat maanden over die deze dag niet hebben", () => {
    const laat = activity({
      date: "2026-01-31",
      recurrence: { freq: "monthly", weekdays: [], until: null },
    });
    expect(occursOn(laat, "2026-01-31")).toBe(true);
    expect(occursOn(laat, "2026-03-31")).toBe(true);
    expect(occursOn(laat, "2026-02-28")).toBe(false);
  });

  it("houdt zich aan de einddatum", () => {
    const tot = activity({
      date: "2026-09-12",
      recurrence: { freq: "monthly", weekdays: [], until: "2026-11-30" },
    });
    expect(occursOn(tot, "2026-11-12")).toBe(true);
    expect(occursOn(tot, "2026-12-12")).toBe(false);
  });
});

describe("describeRecurrence voor de nieuwe patronen", () => {
  it("schrijft om de week met de dagnamen erbij", () => {
    expect(describeRecurrence({ freq: "biweekly", weekdays: [1], until: null })).toBe(
      "Om de week op maandag",
    );
    expect(describeRecurrence({ freq: "biweekly", weekdays: [1, 3], until: null })).toBe(
      "Om de week op ma, wo",
    );
    expect(describeRecurrence({ freq: "biweekly", weekdays: [1, 2, 3, 4, 5], until: null })).toBe(
      "Om de week op werkdagen",
    );
  });

  it("schrijft de dag van de maand uit", () => {
    expect(describeRecurrence({ freq: "monthly", weekdays: [], until: null }, "2026-09-12")).toBe(
      "Elke maand op de 12e",
    );
  });

  it("zet de einddatum er ook bij de nieuwe patronen achter", () => {
    expect(
      describeRecurrence({ freq: "monthly", weekdays: [], until: "2026-12-31" }, "2026-09-12"),
    ).toBe("Elke maand op de 12e, t/m 31-12-2026");
  });
});

describe("shiftRecurrence", () => {
  it("verschuift elke weekdag mee", () => {
    const week: Recurrence = { freq: "weekly", weekdays: [1, 3], until: null };
    expect(shiftRecurrence(week, 1).weekdays).toEqual([2, 4]);
  });

  it("loopt netjes om het weekeinde heen", () => {
    const vrijdag: Recurrence = { freq: "weekly", weekdays: [5], until: null };
    expect(shiftRecurrence(vrijdag, 2).weekdays).toEqual([0]);
    const zondag: Recurrence = { freq: "weekly", weekdays: [0], until: null };
    expect(shiftRecurrence(zondag, -1).weekdays).toEqual([6]);
  });

  it("houdt de rest van het patroon ongemoeid", () => {
    const omDeWeek: Recurrence = { freq: "biweekly", weekdays: [1], until: "2026-12-31" };
    const verschoven = shiftRecurrence(omDeWeek, 1);
    expect(verschoven.freq).toBe("biweekly");
    expect(verschoven.until).toBe("2026-12-31");
  });

  it("laat een maandelijkse reeks met rust: die hangt aan de startdatum", () => {
    const maand: Recurrence = { freq: "monthly", weekdays: [], until: null };
    expect(shiftRecurrence(maand, 3)).toEqual(maand);
  });
});
