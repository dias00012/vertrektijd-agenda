import { describe, expect, it } from "vitest";
import {
  activityMinutes,
  daysUntil,
  linkedWorkDone,
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

describe("linkedWorkDone", () => {
  const taken = [task({ id: "t1", status: "done" }), task({ id: "t2", status: "doing" })];
  const toetsen = [
    { id: "e1", status: "done" } as Exam,
    { id: "e2", status: "todo" } as Exam,
  ];

  it("streept een blok door waarvan de taak af is", () => {
    expect(linkedWorkDone({ title: "Leerblok", linkedTaskId: "t1", linkedExamId: null }, taken, toetsen)).toBe(true);
  });

  it("laat een blok staan waarvan de taak nog loopt", () => {
    expect(linkedWorkDone({ title: "Leerblok", linkedTaskId: "t2", linkedExamId: null }, taken, toetsen)).toBe(false);
  });

  it("doet hetzelfde voor een toets", () => {
    expect(linkedWorkDone({ title: "Leerblok", linkedTaskId: null, linkedExamId: "e1" }, taken, toetsen)).toBe(true);
    expect(linkedWorkDone({ title: "Leerblok", linkedTaskId: null, linkedExamId: "e2" }, taken, toetsen)).toBe(false);
  });

  it("laat een leerblok zonder koppeling met rust", () => {
    // Uit een leerplan: de app weet niet of dat werk gedaan is.
    expect(linkedWorkDone({ title: "Leerblok", linkedTaskId: null, linkedExamId: null }, taken, toetsen)).toBe(false);
  });

  it("streept niets door als de taak niet meer bestaat", () => {
    // Verwijderd schoolwerk laat een blok achter; dat is geen "af".
    expect(linkedWorkDone({ title: "Leerblok", linkedTaskId: "weg", linkedExamId: null }, taken, toetsen)).toBe(false);
  });
});

describe("linkedWorkDone per stap", () => {
  // Een echte opdracht uit de app: zes stappen, de eerste twee afgevinkt, de
  // opdracht zelf nog op "te doen".
  const bedrijfseconomie = task({
    id: "be",
    subject: "Bedrijfseconomie",
    title: "BE week 2 - H3 + H4.1 t/m 4.4",
    status: "todo",
    steps: [
      { id: "s1", title: "Samenvatting H3", done: true },
      { id: "s2", title: "Samenvatting H4.1 t/m 4.4", done: true },
      { id: "s3", title: "MC-vragen H3 + H4", done: false },
      { id: "s4", title: "T4.1 Gouda + T4.2 Van Dam", done: false },
      { id: "s5", title: "Foute onderwerpen herlezen", done: false },
    ],
  });
  const taken = [bedrijfseconomie];
  const toetsen: Exam[] = [];

  const leerblok = (title: string, patch: Record<string, unknown> = {}) =>
    ({ title, linkedTaskId: "be", linkedExamId: null, ...patch }) as unknown as Activity;

  it("streept een blok door waarvan de stap af is", () => {
    // Waar het om begonnen was: je werkt door, vinkt de stap af, en ziet dat
    // meteen terug in je agenda — ook al is de hele opdracht nog niet af.
    expect(linkedWorkDone(leerblok("BE - samenvatting H3"), taken, toetsen)).toBe(true);
    expect(linkedWorkDone(leerblok("BE - samenvatting H4.1 t/m 4.4"), taken, toetsen)).toBe(true);
  });

  it("laat een blok staan waarvan de stap nog open is", () => {
    expect(linkedWorkDone(leerblok("BE - MC-vragen H3 + H4"), taken, toetsen)).toBe(false);
  });

  it("gebruikt linkedStepId wanneer die er is, en niet de titel", () => {
    // Een expliciete koppeling gaat altijd voor; zo kan een blok heten wat je wilt.
    expect(linkedWorkDone(leerblok("Blokje leren", { linkedStepId: "s1" }), taken, toetsen)).toBe(true);
    expect(linkedWorkDone(leerblok("BE - samenvatting H3", { linkedStepId: "s3" }), taken, toetsen)).toBe(false);
  });

  it("negeert een linkedStepId die niet bestaat", () => {
    expect(linkedWorkDone(leerblok("BE - samenvatting H3", { linkedStepId: "weg" }), taken, toetsen)).toBe(false);
  });

  it("valt terug op de opdracht wanneer geen stap past", () => {
    // Een blok met een eigen naam hoort bij de opdracht als geheel.
    expect(linkedWorkDone(leerblok("BE leren"), taken, toetsen)).toBe(false);
    const af = [task({ ...bedrijfseconomie, status: "done" })];
    expect(linkedWorkDone(leerblok("BE leren"), af, toetsen)).toBe(true);
  });

  it("kijkt naar hele woorden, niet naar letterreeksen", () => {
    // "H3" mag niet matchen op "H30".
    expect(linkedWorkDone(leerblok("BE - samenvatting H30"), taken, toetsen)).toBe(false);
  });

  it("trekt zich niets aan van hoofdletters, streepjes of accenten", () => {
    expect(linkedWorkDone(leerblok("BE — SAMENVATTING h3!"), taken, toetsen)).toBe(true);
  });

  it("kiest de langste passende stap", () => {
    // Anders zou "T4.1 Gouda + T4.2 Van Dam" doorgestreept worden zodra alleen
    // het eerste deel af is.
    const metDeelstap = [
      task({
        ...bedrijfseconomie,
        steps: [
          { id: "a", title: "T4.1 Gouda", done: true },
          { id: "b", title: "T4.1 Gouda + T4.2 Van Dam", done: false },
        ],
      }),
    ];
    expect(linkedWorkDone(leerblok("BE - T4.1 Gouda + T4.2 Van Dam"), metDeelstap, toetsen)).toBe(false);
    expect(linkedWorkDone(leerblok("BE - T4.1 Gouda"), metDeelstap, toetsen)).toBe(true);
  });

  it("valt niet om op een blok zonder titel", () => {
    expect(linkedWorkDone({ title: "Leerblok", linkedTaskId: "be", linkedExamId: null } as unknown as Activity, taken, toetsen)).toBe(false);
  });
});
