import { describe, expect, it } from "vitest";
import {
  activityMinutes,
  daysUntil,
  plannedMinutesForTask,
  plannedProgress,
  sortExams,
  sortTasks,
  taskProgress,
} from "./schoolwork";
import type { Activity, Exam, Task } from "./types";

const task = (patch: Partial<Task> = {}): Task => ({
  id: "t1", subject: "Wiskunde", title: "Hoofdstuk 4", deadline: "2026-09-11",
  estimatedMinutes: 90, priority: "medium", status: "todo",
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...patch,
});

const blok = (startTime: string, endTime: string, linkedTaskId = "t1") =>
  ({ id: `b-${startTime}`, startTime, endTime, linkedTaskId }) as unknown as Activity;

describe("activityMinutes", () => {
  it("telt een gewoon blok", () => {
    expect(activityMinutes(blok("19:00", "20:30"))).toBe(90);
  });

  it("telt een blok dat over middernacht loopt", () => {
    // 23:00 tot 00:30 is anderhalf uur, geen nul.
    expect(activityMinutes(blok("23:00", "00:30"))).toBe(90);
  });

  it("is nul bij begin en eind op hetzelfde moment", () => {
    expect(activityMinutes(blok("19:00", "19:00"))).toBe(0);
  });
});

describe("plannedMinutesForTask", () => {
  it("telt alle gekoppelde blokken op, ook over middernacht", () => {
    const activiteiten = [blok("19:00", "20:00"), blok("23:00", "00:30"), blok("10:00", "11:00", "t2")];
    expect(plannedMinutesForTask(activiteiten, "t1")).toBe(150);
  });
});

describe("plannedProgress", () => {
  it("rekent het percentage uit", () => {
    expect(plannedProgress(45, 90).pct).toBe(50);
  });

  it("gaat nooit boven de honderd", () => {
    const uitkomst = plannedProgress(200, 90);
    expect(uitkomst.pct).toBe(100);
    expect(uitkomst.enough).toBe(true);
  });

  it("blijft heel zonder schatting", () => {
    const uitkomst = plannedProgress(60, undefined);
    expect(uitkomst.pct).toBe(0);
    expect(uitkomst.enough).toBe(false);
  });
});

describe("sortTasks", () => {
  it("zet de eerste deadline vooraan en afgeronde taken achteraan", () => {
    const lijst = sortTasks([
      task({ id: "a", deadline: "2026-09-20" }),
      task({ id: "b", deadline: "2026-09-11", status: "done" }),
      task({ id: "c", deadline: "2026-09-12" }),
    ]);
    expect(lijst.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("laat bij dezelfde deadline de hoogste prioriteit voorgaan", () => {
    const lijst = sortTasks([
      task({ id: "laag", priority: "later" }),
      task({ id: "hoog", priority: "high" }),
    ]);
    expect(lijst[0].id).toBe("hoog");
  });
});

describe("sortExams", () => {
  it("zet toetsen op datum, afgerond achteraan", () => {
    const exam = (id: string, date: string, status: Exam["status"] = "todo") =>
      ({ id, subject: "Sk", date, priority: "medium", status }) as Exam;
    const lijst = sortExams([exam("a", "2026-10-01"), exam("b", "2026-09-14", "done"), exam("c", "2026-09-20")]);
    expect(lijst.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });
});

describe("taskProgress", () => {
  it("telt afgevinkte stappen", () => {
    const met = task({ steps: [
      { id: "1", title: "a", done: true },
      { id: "2", title: "b", done: false },
    ] });
    expect(taskProgress(met)).toEqual({ done: 1, total: 2 });
  });

  it("is nul zonder stappen", () => {
    expect(taskProgress(task())).toEqual({ done: 0, total: 0 });
  });
});

describe("daysUntil", () => {
  it("telt hele dagen, ook over de zomertijdgrens", () => {
    // 25 oktober 2026 is de nacht van 25 naar 26 uur; die dag duurt 25 uur.
    expect(daysUntil("2026-10-26", new Date(2026, 9, 24, 12, 0))).toBe(2);
  });

  it("is negatief voor een datum die voorbij is", () => {
    expect(daysUntil("2026-09-07", new Date(2026, 8, 9, 8, 0))).toBe(-2);
  });
});
