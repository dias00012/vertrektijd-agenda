import { describe, expect, it } from "vitest";
import {
  DAY_STARTS,
  MAX_BLOCK,
  fitSteps,
  freeOnDate,
  freeUntil,
  movableOnDate,
  openMinutes,
  openSteps,
  planStudy,
  workload,
} from "./planning";
import type { Activity, Exam, Settings, Task, TaskStep } from "./types";

const settings = (patch: Partial<Settings> = {}): Settings => ({
  home: { label: "Thuisstraat 1, Almere", lat: 52.37, lon: 5.22 },
  savedPlaces: [],
  categoryPlaces: {},
  customCategories: [],
  bufferMinutes: 10,
  travelMode: "transit",
  ...patch,
});

const activity = (patch: Partial<Activity> = {}): Activity => ({
  id: "a1",
  category: "school",
  title: "Wiskunde",
  date: "2026-09-14",
  endDate: null,
  allDay: false,
  startTime: "09:00",
  endTime: "10:30",
  location: null,
  color: null,
  source: null,
  recurrence: null,
  exceptions: [],
  travel: null,
  returnTravel: null,
  travelError: null,
  bufferMinutes: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

const step = (patch: Partial<TaskStep> = {}): TaskStep => ({
  id: "s1",
  title: "Samenvatten",
  done: false,
  ...patch,
});

/** Eén dag met precies de gaten die de test nodig heeft. */
const dag = (date: string, ...gaten: [string, string][]) => ({
  date,
  slots: gaten.map(([from, to]) => ({ from, to, minutes: 0 })),
});

describe("freeOnDate", () => {
  it("houdt de reis terug vrij, niet alleen de afspraak", () => {
    // Werken in Lelystad tot 17:00, maar pas om 17:54 thuis. Het gat begint
    // daarna -- dit was precies het getal dat een planner overzag.
    const werk = activity({
      title: "Werk",
      startTime: "09:00",
      endTime: "17:00",
      location: { label: "Lelystad", lat: 52.51, lon: 5.48 },
      returnTravel: { durationMinutes: 54 } as Activity["returnTravel"],
      travel: { durationMinutes: 54 } as Activity["travel"],
    });
    const slots = freeOnDate([werk], settings(), "2026-09-14");
    const avond = slots.find((slot) => slot.from > "12:00");
    expect(avond?.from).toBe("17:54");
    expect(avond?.to).toBe("22:00");
  });

  it("plant niets na tweeëntwintig uur", () => {
    const slots = freeOnDate([], settings(), "2026-09-14");
    expect(slots).toEqual([{ from: "07:00", to: "22:00", minutes: 900 }]);
  });

  it("laat gaatjes korter dan twintig minuten weg", () => {
    const een = activity({ id: "a1", startTime: "07:00", endTime: "12:00" });
    const twee = activity({ id: "a2", startTime: "12:15", endTime: "22:00" });
    expect(freeOnDate([een, twee], settings(), "2026-09-14")).toEqual([]);
  });

  it("slaat met notBefore het stuk over dat al voorbij is", () => {
    // Om kwart over drie 's middags heb je niets aan het gat van vanochtend.
    const slots = freeOnDate([], settings(), "2026-09-14", 15 * 60 + 15);
    expect(slots).toEqual([{ from: "15:15", to: "22:00", minutes: 405 }]);
  });

  it("negeert een notBefore dat vóór het begin van de dag ligt", () => {
    expect(freeOnDate([], settings(), "2026-09-14", 3 * 60)).toEqual(
      freeOnDate([], settings(), "2026-09-14", DAY_STARTS),
    );
  });

  it("knipt een gat af dat over tweeëntwintig uur heen loopt", () => {
    const avond = activity({ startTime: "19:00", endTime: "23:30" });
    const slots = freeOnDate([avond], settings(), "2026-09-14");
    expect(slots).toEqual([{ from: "07:00", to: "19:00", minutes: 720 }]);
  });
});

describe("movableOnDate", () => {
  it("noemt alleen wat thuis is en mag wijken", () => {
    const gamen = activity({ id: "a1", category: "hobby", title: "Gamen" });
    const les = activity({ id: "a2", category: "hobby", title: "Gitaar", location: { label: "Almere", lat: 52.37, lon: 5.22 } });
    const school = activity({ id: "a3", category: "school" });
    expect(movableOnDate([gamen, les, school], "2026-09-14").map((item) => item.id)).toEqual(["a1"]);
  });
});

describe("fitSteps", () => {
  it("zet de stappen op volgorde in het eerste gat dat past", () => {
    const stappen = [
      step({ id: "s1", title: "Lezen", estimatedMinutes: 30 }),
      step({ id: "s2", title: "Samenvatten", estimatedMinutes: 45 }),
    ];
    const { blocks, leftoverMinutes } = fitSteps(stappen, [dag("2026-09-14", ["18:00", "22:00"])]);
    expect(leftoverMinutes).toBe(0);
    // Vijfenzeventig minuten aan één stuk: geen pauze nodig, dus ze sluiten
    // op elkaar aan.
    expect(blocks).toEqual([
      {
        date: "2026-09-14",
        startTime: "18:00",
        endTime: "18:30",
        stepId: "s1",
        stepTitle: "Lezen",
        minutes: 30,
        split: false,
      },
      {
        date: "2026-09-14",
        startTime: "18:30",
        endTime: "19:15",
        stepId: "s2",
        stepTitle: "Samenvatten",
        minutes: 45,
        split: false,
      },
    ]);
  });

  it("slaat afgevinkte stappen over", () => {
    const stappen = [
      step({ id: "s1", estimatedMinutes: 30, done: true }),
      step({ id: "s2", title: "Opgaven", estimatedMinutes: 30 }),
    ];
    const { blocks } = fitSteps(stappen, [dag("2026-09-14", ["18:00", "22:00"])]);
    expect(blocks.map((block) => block.stepId)).toEqual(["s2"]);
  });

  it("gebruikt de standaardduur voor een stap zonder schatting", () => {
    const { blocks } = fitSteps([step()], [dag("2026-09-14", ["18:00", "22:00"])], { defaultMinutes: 25 });
    expect(blocks[0].minutes).toBe(25);
  });

  it("splitst een lange stap over twee gaten", () => {
    const stappen = [step({ id: "s1", title: "Verslag", estimatedMinutes: 90 })];
    const { blocks, leftoverMinutes } = fitSteps(stappen, [
      dag("2026-09-14", ["18:00", "19:00"]),
      dag("2026-09-15", ["18:00", "22:00"]),
    ]);
    expect(leftoverMinutes).toBe(0);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ date: "2026-09-14", minutes: 60, split: true });
    expect(blocks[1]).toMatchObject({
      date: "2026-09-15",
      startTime: "18:00",
      minutes: 30,
      split: true,
    });
  });

  it("laat een restje van tien minuten liever staan dan het op te vullen", () => {
    // Na het eerste blok blijft er een kwartier over. Daar een stuk van de
    // volgende stap in wringen levert een blok op waar niets in past.
    const stappen = [
      step({ id: "s1", title: "Lezen", estimatedMinutes: 45 }),
      step({ id: "s2", title: "Opgaven", estimatedMinutes: 60 }),
    ];
    const { blocks } = fitSteps(stappen, [
      dag("2026-09-14", ["18:00", "19:00"]),
      dag("2026-09-15", ["18:00", "22:00"]),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ stepId: "s1", minutes: 45, split: false });
    expect(blocks[1]).toMatchObject({ date: "2026-09-15", stepId: "s2", minutes: 60 });
  });

  it("past een korte stap wél in een klein restje", () => {
    const stappen = [
      step({ id: "s1", title: "Lezen", estimatedMinutes: 45 }),
      step({ id: "s2", title: "Nakijken", estimatedMinutes: 15 }),
    ];
    const { blocks } = fitSteps(stappen, [dag("2026-09-14", ["18:00", "19:00"])]);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ startTime: "18:45", minutes: 15, split: false });
  });

  it("telt op wat er niet meer past", () => {
    const stappen = [
      step({ id: "s1", title: "Lezen", estimatedMinutes: 60 }),
      step({ id: "s2", title: "Opgaven", estimatedMinutes: 90 }),
    ];
    const { blocks, leftoverMinutes } = fitSteps(stappen, [dag("2026-09-14", ["18:00", "19:00"])]);
    expect(blocks).toHaveLength(1);
    expect(leftoverMinutes).toBe(90);
  });

  it("telt de helft mee die nog niet ingepland is", () => {
    const stappen = [step({ id: "s1", title: "Verslag", estimatedMinutes: 120 })];
    const { blocks, leftoverMinutes } = fitSteps(stappen, [dag("2026-09-14", ["18:00", "19:00"])]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].minutes).toBe(60);
    expect(leftoverMinutes).toBe(60);
  });

  it("laat korte stappen op elkaar aansluiten in plaats van een pauze ertussen", () => {
    // Tien minuten werken en dan een kwartier pauze is geen planning.
    const stappen = [
      step({ id: "s1", title: "Mailen", estimatedMinutes: 10 }),
      step({ id: "s2", title: "Opzetten", estimatedMinutes: 25 }),
    ];
    const { blocks } = fitSteps(stappen, [dag("2026-09-14", ["20:00", "22:00"])]);
    expect(blocks.map((block) => [block.startTime, block.endTime])).toEqual([
      ["20:00", "20:10"],
      ["20:10", "20:35"],
    ]);
  });

  it("neemt de pauze wanneer er van het uur bijna niets meer over is", () => {
    // Na tachtig minuten past er binnen de grens nog tien minuten. Dat blokje
    // maakt niemand blij; de avond erna verspelen is erger.
    const stappen = [
      step({ id: "s1", title: "Samenvatten", estimatedMinutes: 80 }),
      step({ id: "s2", title: "Opgaven", estimatedMinutes: 60 }),
    ];
    const { blocks, leftoverMinutes } = fitSteps(stappen, [dag("2026-09-14", ["18:00", "22:00"])]);
    expect(leftoverMinutes).toBe(0);
    expect(blocks.map((block) => [block.startTime, block.endTime])).toEqual([
      ["18:00", "19:20"],
      ["19:35", "20:35"],
    ]);
  });

  it("knipt een lange stap op in blokken met pauze ertussen", () => {
    // Dit is waar het misging: drie uur leren werd één blok van drie uur.
    const stappen = [step({ id: "s1", title: "Leren", estimatedMinutes: 180 })];
    const { blocks, leftoverMinutes } = fitSteps(stappen, [dag("2026-09-14", ["17:00", "22:00"])]);
    expect(leftoverMinutes).toBe(0);
    expect(blocks.map((block) => [block.startTime, block.endTime])).toEqual([
      ["17:00", "18:30"],
      ["18:45", "20:15"],
    ]);
    expect(blocks.every((block) => block.minutes <= MAX_BLOCK)).toBe(true);
    expect(blocks.every((block) => block.split)).toBe(true);
  });

  it("houdt zich aan een eigen bovengrens en pauze", () => {
    const stappen = [step({ id: "s1", estimatedMinutes: 120 })];
    const { blocks } = fitSteps(stappen, [dag("2026-09-14", ["18:00", "22:00"])], {
      maxBlock: 50,
      breakMinutes: 10,
    });
    expect(blocks.map((block) => [block.startTime, block.minutes])).toEqual([
      ["18:00", 50],
      ["19:00", 50],
      ["20:00", 20],
    ]);
  });

  it("geeft niets terug zonder vrije ruimte", () => {
    const stappen = [step({ id: "s1", estimatedMinutes: 30 })];
    expect(fitSteps(stappen, [])).toEqual({ blocks: [], leftoverMinutes: 30 });
  });
});

const task = (patch: Partial<Task> = {}): Task => ({
  id: "t1",
  subject: "Wiskunde",
  title: "Hoofdstuk 4",
  deadline: "2026-09-18",
  estimatedMinutes: 90,
  priority: "medium",
  status: "todo",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

const exam = (patch: Partial<Exam> = {}): Exam => ({
  id: "e1",
  subject: "Nederlands",
  date: "2026-09-25",
  priority: "high",
  status: "todo",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

describe("openMinutes", () => {
  it("houdt zonder stappen gewoon de schatting aan", () => {
    expect(openMinutes(task({ estimatedMinutes: 90 }))).toBe(90);
  });

  it("telt een afgeronde opdracht zonder stappen als nul", () => {
    expect(openMinutes(task({ status: "done" }))).toBe(0);
  });

  it("telt alleen de stappen die nog open staan", () => {
    const met = task({
      estimatedMinutes: 90,
      steps: [
        step({ id: "s1", estimatedMinutes: 30, done: true }),
        step({ id: "s2", estimatedMinutes: 45, done: false }),
      ],
    });
    expect(openMinutes(met)).toBe(45);
  });

  it("verdeelt de schatting over stappen zonder eigen schatting", () => {
    const met = task({
      estimatedMinutes: 90,
      steps: [
        step({ id: "s1", done: true }),
        step({ id: "s2", done: false }),
        step({ id: "s3", done: false }),
      ],
    });
    expect(openMinutes(met)).toBe(60);
  });
});

describe("freeUntil", () => {
  it("laat de eerste dag pas beginnen waar je nu bent", () => {
    const dagen = freeUntil([], settings(), "2026-09-14", "2026-09-16", 16 * 60);
    expect(dagen.map((d) => d.date)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(dagen[0].slots[0].from).toBe("16:00");
    expect(dagen[1].slots[0].from).toBe("07:00");
  });

  it("geeft één dag terug wanneer begin en eind gelijk zijn", () => {
    expect(freeUntil([], settings(), "2026-09-14", "2026-09-14")).toHaveLength(1);
  });
});

describe("workload", () => {
  // Maandag 14 september, kwart over acht 's ochtends.
  const NU = new Date("2026-09-14T08:15:00+02:00");

  it("zegt niets te doen zonder open werk", () => {
    const stand = workload([], [], [], settings(), NU);
    expect(stand.until).toBeNull();
    expect(stand.todoMinutes).toBe(0);
  });

  it("kijkt tot de eerstvolgende deadline, niet verder", () => {
    const woensdag = task({ id: "t1", deadline: "2026-09-16", estimatedMinutes: 60 });
    const vrijdag = task({ id: "t2", deadline: "2026-09-18", estimatedMinutes: 300 });
    const stand = workload([woensdag, vrijdag], [], [], settings(), NU);
    expect(stand.until).toBe("2026-09-16");
    expect(stand.todoMinutes).toBe(60);
  });

  it("trekt af wat al een blok in de agenda heeft", () => {
    const opdracht = task({ deadline: "2026-09-16", estimatedMinutes: 120 });
    const blok = activity({
      date: "2026-09-15",
      startTime: "18:00",
      endTime: "19:00",
      linkedTaskId: "t1",
      source: "leerplan",
    });
    const stand = workload([opdracht], [], [blok], settings(), NU);
    expect(stand.todoMinutes).toBe(60);
  });

  it("telt de dag van de deadline zelf niet als werktijd mee", () => {
    // Woensdag moet het af zijn; wat er woensdagavond nog vrij is helpt niet.
    const opdracht = task({ deadline: "2026-09-16", estimatedMinutes: 60 });
    const stand = workload([opdracht], [], [], settings(), NU);
    // Maandag vanaf 08:15 en dinsdag: 825 + 900 minuten.
    expect(stand.freeMinutes).toBe(825 + 900);
  });

  it("houdt bij een deadline van vandaag de rest van vandaag aan", () => {
    const vandaag = task({ deadline: "2026-09-14", estimatedMinutes: 60 });
    const stand = workload([vandaag], [], [], settings(), NU);
    expect(stand.freeMinutes).toBe(825);
    expect(stand.todayMinutes).toBe(825);
  });

  it("neemt een toets mee met zijn voorbereidingstijd", () => {
    const toets = exam({ date: "2026-09-16", prepMinutes: 180 });
    const stand = workload([], [toets], [], settings(), NU);
    expect(stand.until).toBe("2026-09-16");
    expect(stand.todoMinutes).toBe(180);
  });

  it("negeert werk waarvan de deadline al voorbij is", () => {
    const oud = task({ deadline: "2026-09-10", estimatedMinutes: 120 });
    const nieuw = task({ id: "t2", deadline: "2026-09-18", estimatedMinutes: 60 });
    const stand = workload([oud, nieuw], [], [], settings(), NU);
    expect(stand.until).toBe("2026-09-18");
    expect(stand.todoMinutes).toBe(60);
  });
});

describe("openSteps", () => {
  it("maakt één naamloze stap van een opdracht zonder stappen", () => {
    const stappen = openSteps(task({ estimatedMinutes: 90 }), [], "Werken aan Hoofdstuk 4");
    expect(stappen).toEqual([
      { id: "", title: "Werken aan Hoofdstuk 4", estimatedMinutes: 90, done: false },
    ]);
  });

  it("trekt bij zo'n opdracht af wat er al staat", () => {
    const blok = activity({ startTime: "18:00", endTime: "19:00", linkedTaskId: "t1" });
    const stappen = openSteps(task({ estimatedMinutes: 90 }), [blok], "Werken aan");
    expect(stappen[0].estimatedMinutes).toBe(30);
  });

  it("stelt niets voor wanneer er al genoeg tijd staat", () => {
    const blok = activity({ startTime: "18:00", endTime: "20:00", linkedTaskId: "t1" });
    expect(openSteps(task({ estimatedMinutes: 90 }), [blok], "Werken aan")).toEqual([]);
  });

  it("houdt de eigen stappen met hun id, zodat het blok eraan kan hangen", () => {
    const met = task({
      estimatedMinutes: 90,
      steps: [
        step({ id: "s1", title: "Lezen", estimatedMinutes: 30, done: true }),
        step({ id: "s2", title: "Samenvatten", estimatedMinutes: 60 }),
      ],
    });
    expect(openSteps(met, [], "Werken aan")).toEqual([
      { id: "s2", title: "Samenvatten", estimatedMinutes: 60, done: false },
    ]);
  });

  it("trekt per stap af wat er voor die stap al in de agenda staat", () => {
    const met = task({
      estimatedMinutes: 120,
      steps: [
        step({ id: "s1", title: "Lezen", estimatedMinutes: 60 }),
        step({ id: "s2", title: "Opgaven", estimatedMinutes: 60 }),
      ],
    });
    const blok = activity({
      startTime: "18:00",
      endTime: "18:30",
      linkedTaskId: "t1",
      linkedStepId: "s1",
    });
    expect(openSteps(met, [blok], "Werken aan").map((s2) => s2.estimatedMinutes)).toEqual([30, 60]);
  });

  it("neemt bij een toets de voorbereidingstijd", () => {
    const stappen = openSteps(exam({ prepMinutes: 180 }), [], "Leren voor Nederlands");
    expect(stappen).toEqual([
      { id: "", title: "Leren voor Nederlands", estimatedMinutes: 180, done: false },
    ]);
  });

  it("stelt niets voor bij een toets zonder voorbereidingstijd", () => {
    expect(openSteps(exam({ prepMinutes: undefined }), [], "Leren")).toEqual([]);
  });
});

describe("planStudy", () => {
  const NU = new Date("2026-09-14T08:15:00+02:00");

  it("plant tot en met de dag vóór de deadline", () => {
    const plan = planStudy(task({ deadline: "2026-09-16" }), [], settings(), "Werken aan", NU);
    expect(plan.until).toBe("2026-09-15");
    expect(plan.blocks.every((block) => block.date <= "2026-09-15")).toBe(true);
  });

  it("plant op de dag zelf wanneer de deadline vandaag is", () => {
    const plan = planStudy(task({ deadline: "2026-09-14" }), [], settings(), "Werken aan", NU);
    expect(plan.until).toBe("2026-09-14");
    expect(plan.blocks[0].date).toBe("2026-09-14");
  });

  it("begint niet in een gat dat vanochtend al voorbij was", () => {
    const middag = new Date("2026-09-14T15:40:00+02:00");
    const plan = planStudy(task({ deadline: "2026-09-14" }), [], settings(), "Werken aan", middag);
    expect(plan.blocks[0].startTime).toBe("15:40");
  });

  it("zet negentig minuten niet in één blok van negentig minuten in de trein", () => {
    // Werken in Lelystad tot 17:00, pas om 17:54 thuis: niets ervoor.
    const werk = activity({
      id: "a9",
      title: "Werk",
      startTime: "09:00",
      endTime: "17:00",
      location: { label: "Lelystad", lat: 52.51, lon: 5.48 },
      travel: { durationMinutes: 54 } as Activity["travel"],
      returnTravel: { durationMinutes: 54 } as Activity["returnTravel"],
    });
    const opdracht = task({ deadline: "2026-09-15", estimatedMinutes: 60 });
    const plan = planStudy(opdracht, [werk], settings(), "Werken aan", NU);
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].startTime).toBe("17:54");
  });

  it("meldt wat er niet meer paste", () => {
    const opdracht = task({ deadline: "2026-09-15", estimatedMinutes: 20 * 60 });
    const plan = planStudy(opdracht, [], settings(), "Werken aan", NU);
    expect(plan.leftoverMinutes).toBeGreaterThan(0);
  });
});
