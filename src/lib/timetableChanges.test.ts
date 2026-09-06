import { describe, expect, it } from "vitest";
import { becameFree, compareTimetable, startsEarlier, startsLater } from "./timetableChanges";
import type { Activity, ActivityDraft } from "./types";

/** Een les zoals hij uit een gekoppeld rooster komt. */
function les(date: string, startTime: string, endTime: string, title: string): Activity {
  return {
    id: `${title}-${date}-${startTime}`,
    category: "school",
    title,
    date,
    startTime,
    endTime,
    location: null,
    color: null,
    travelMode: null,
    bufferMinutes: null,
    recurrence: null,
    exceptions: [],
    travel: null,
    returnTravel: null,
    travelError: null,
    source: "rooster",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as Activity;
}

/** Dezelfde vorm, maar zoals hij binnenkomt bij een nieuwe verversing. */
function nieuw(date: string, startTime: string, endTime: string, title: string): ActivityDraft {
  return {
    category: "school",
    title,
    date,
    startTime,
    endTime,
    location: null,
    color: null,
    travelMode: null,
    recurrence: null,
    source: "rooster",
  };
}

const VANDAAG = "2026-09-07";

describe("compareTimetable", () => {
  it("ziet niets als er niets veranderd is", () => {
    const was = [les("2026-09-08", "08:30", "09:10", "Wiskunde")];
    const nu = [nieuw("2026-09-08", "08:30", "09:10", "Wiskunde")];
    expect(compareTimetable(was, nu, VANDAAG)).toEqual([]);
  });

  it("merkt op dat je eerste uur vervalt en je dus later begint", () => {
    const was = [
      les("2026-09-08", "08:30", "09:10", "Wiskunde"),
      les("2026-09-08", "10:10", "11:00", "Nederlands"),
    ];
    const nu = [nieuw("2026-09-08", "10:10", "11:00", "Nederlands")];

    const [change] = compareTimetable(was, nu, VANDAAG);
    expect(change.removed).toEqual(["Wiskunde"]);
    expect(change.added).toEqual([]);
    expect(change.firstStartBefore).toBe("08:30");
    expect(change.firstStartAfter).toBe("10:10");
    expect(startsLater(change)).toBe(true);
    expect(startsEarlier(change)).toBe(false);
  });

  it("merkt op dat je juist eerder moet beginnen", () => {
    const was = [les("2026-09-08", "10:10", "11:00", "Nederlands")];
    const nu = [
      nieuw("2026-09-08", "08:30", "09:10", "Wiskunde"),
      nieuw("2026-09-08", "10:10", "11:00", "Nederlands"),
    ];

    const [change] = compareTimetable(was, nu, VANDAAG);
    expect(change.added).toEqual(["Wiskunde"]);
    expect(startsEarlier(change)).toBe(true);
  });

  it("merkt een hele vrije dag op", () => {
    const was = [les("2026-09-08", "08:30", "09:10", "Wiskunde")];
    const [change] = compareTimetable(was, [], VANDAAG);
    expect(becameFree(change)).toBe(true);
    expect(change.firstStartAfter).toBeNull();
  });

  it("meldt niets over dagen die al geweest zijn", () => {
    const was = [les("2026-09-01", "08:30", "09:10", "Wiskunde")];
    expect(compareTimetable(was, [], VANDAAG)).toEqual([]);
  });

  it("ziet een verschoven les als weg en erbij, op dezelfde dag", () => {
    const was = [les("2026-09-08", "08:30", "09:10", "Wiskunde")];
    const nu = [nieuw("2026-09-08", "13:30", "14:10", "Wiskunde")];

    const [change] = compareTimetable(was, nu, VANDAAG);
    expect(change.removed).toEqual(["Wiskunde"]);
    expect(change.added).toEqual(["Wiskunde"]);
    expect(startsLater(change)).toBe(true);
  });

  it("houdt de dagen uit elkaar en zet ze op volgorde", () => {
    const was = [
      les("2026-09-10", "08:30", "09:10", "Frans"),
      les("2026-09-08", "08:30", "09:10", "Wiskunde"),
    ];
    const changes = compareTimetable(was, [], VANDAAG);
    expect(changes.map((c) => c.dateKey)).toEqual(["2026-09-08", "2026-09-10"]);
  });

  it("laat hele dagen buiten beschouwing: die hebben geen begintijd", () => {
    const vakantie = { ...les("2026-09-08", "00:00", "23:59", "Herfstvakantie"), allDay: true };
    expect(compareTimetable([vakantie], [], VANDAAG)).toEqual([]);
  });
});
