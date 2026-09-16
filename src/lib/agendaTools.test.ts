import { describe, expect, it } from "vitest";
import { deleteActivities, readAgenda, saveActivities, type AgendaData } from "./agendaTools";
import type { Activity, Exam, Settings, Task } from "./types";

const NOW = new Date("2026-09-14T08:00:00+02:00");

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

const data = (patch: Partial<AgendaData> = {}): AgendaData => ({
  settings: settings(),
  activities: [],
  tasks: [],
  exams: [],
  deletions: [],
  ...patch,
});

describe("readAgenda", () => {
  it("geeft standaard veertien dagen vanaf vandaag", () => {
    const result = readAgenda(data(), {}, NOW);
    expect(result.today).toBe("2026-09-14");
    expect(result.from).toBe("2026-09-14");
    expect(result.to).toBe("2026-09-27");
    expect(result.days).toHaveLength(14);
  });

  it("rekent een herhaling uit tot losse dagen", () => {
    // Elke maandag: in een periode van drie weken hoort dat drie keer te staan,
    // niet één reeks waar de planner zelf iets van moet maken.
    const weekly = activity({
      recurrence: { freq: "weekly", weekdays: [1], until: null },
    });
    const result = readAgenda(
      data({ activities: [weekly] }),
      { from: "2026-09-14", to: "2026-09-28" },
      NOW,
    );
    const withActivity = result.days.filter((day) => day.activities.length > 0);
    expect(withActivity.map((day) => day.date)).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
    expect(withActivity[1].activities[0].recurring).toBe(true);
  });

  it("noemt de weekdag bij elke dag", () => {
    const result = readAgenda(data(), { from: "2026-09-14", to: "2026-09-15" }, NOW);
    expect(result.days.map((day) => day.weekday)).toEqual(["maandag", "dinsdag"]);
  });

  it("zet de vertrektijd erbij, niet alleen de reisduur", () => {
    // Waar de planner mee moet rekenen is het moment dat je de deur uit moet:
    // 09:00 min 25 minuten reizen min 10 minuten marge.
    const withTravel = activity({
      location: { label: "Windesheim, Almere", lat: 52.4, lon: 5.25 },
      travel: {
        durationMinutes: 25,
        distanceKm: 8,
        mode: "transit",
        provider: "motis",
        computedAt: "2026-09-13T20:00:00.000Z",
        key: "x",
      },
    });
    const result = readAgenda(data({ activities: [withTravel] }), { from: "2026-09-14" }, NOW);
    const entry = result.days[0].activities[0];
    expect(entry.departure).toBe("08:25");
    expect(entry.travelMinutes).toBe(25);
    expect(entry.location).toBe("Windesheim, Almere");
  });

  it("laat afgerond werk en verlopen toetsen weg", () => {
    const result = readAgenda(
      data({
        tasks: [task(), task({ id: "t2", status: "done" })],
        exams: [exam(), exam({ id: "e2", date: "2026-09-01" })],
      }),
      {},
      NOW,
    );
    expect(result.tasks.map((entry) => entry.id)).toEqual(["t1"]);
    expect(result.exams.map((entry) => entry.id)).toEqual(["e1"]);
  });

  it("trekt een omgekeerde of buitensporige periode recht", () => {
    const backwards = readAgenda(data(), { from: "2026-09-14", to: "2026-09-01" }, NOW);
    expect(backwards.to).toBe("2026-09-14");

    const huge = readAgenda(data(), { from: "2026-09-14", to: "2027-09-14" }, NOW);
    expect(huge.days).toHaveLength(62);
  });

  it("werkt zonder instellingen", () => {
    // Een account waarin nog niets staat mag geen uitzondering opleveren.
    const result = readAgenda(data({ settings: null }), {}, NOW);
    expect(result.home).toBeNull();
    expect(result.defaults.bufferMinutes).toBe(10);
  });
});

describe("saveActivities", () => {
  it("voegt een blok toe en geeft het een id", () => {
    const result = saveActivities(
      data(),
      [{ title: "Leren wiskunde", date: "2026-09-15", startTime: "19:00", endTime: "20:30" }],
      NOW,
    );
    expect(result.added).toBe(1);
    expect(result.data.activities).toHaveLength(1);
    expect(result.data.activities[0].id).toBeTruthy();
    expect(result.data.activities[0].startTime).toBe("19:00");
  });

  it("werkt een bestaand blok bij op id, zodat verplaatsen werkt", () => {
    const before = data({ activities: [activity()] });
    const result = saveActivities(before, [{ id: "a1", title: "Wiskunde", date: "2026-09-16" }], NOW);
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.data.activities).toHaveLength(1);
    expect(result.data.activities[0].date).toBe("2026-09-16");
    // De aanmaakdatum hoort van het oorspronkelijke blok te blijven.
    expect(result.data.activities[0].createdAt).toBe("2026-09-01T00:00:00.000Z");
    expect(result.data.activities[0].updatedAt).toBe(NOW.toISOString());
  });

  it("slaat een blok zonder titel of datum over en zegt waarom", () => {
    const result = saveActivities(
      data(),
      [
        { title: "", date: "2026-09-15" },
        { title: "Zonder datum" },
        { title: "Goed", date: "2026-09-15" },
      ],
      NOW,
    );
    expect(result.added).toBe(1);
    expect(result.skipped).toEqual([
      { index: 0, reason: "titel ontbreekt" },
      { index: 1, reason: "datum ontbreekt of is niet JJJJ-MM-DD" },
    ]);
  });

  it("weigert een blok dat eindigt voor het begint", () => {
    const result = saveActivities(
      data(),
      [{ title: "Fout", date: "2026-09-15", startTime: "20:00", endTime: "19:00" }],
      NOW,
    );
    expect(result.added).toBe(0);
    expect(result.skipped[0].reason).toBe("eindtijd ligt vóór de begintijd");
  });

  it("weigert meer dan honderd tegelijk", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      title: `Blok ${i}`,
      date: "2026-09-15",
    }));
    const result = saveActivities(data(), many, NOW);
    expect(result.added).toBe(0);
    expect(result.data.activities).toHaveLength(0);
  });

  it("haalt de grafsteen weg als een weggegooid blok terugkomt", () => {
    // Anders gooit de eerstvolgende sync het meteen weer weg.
    const before = data({ deletions: [{ id: "a1", at: "2026-09-10T00:00:00.000Z" }] });
    const result = saveActivities(before, [{ id: "a1", title: "Terug", date: "2026-09-15" }], NOW);
    expect(result.data.deletions).toEqual([]);
  });

  it("doet niets bij invoer die geen lijst is", () => {
    const result = saveActivities(data(), "geen lijst", NOW);
    expect(result.added).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });
});

describe("deleteActivities", () => {
  it("haalt een blok weg en laat een grafsteen achter", () => {
    const result = deleteActivities(data({ activities: [activity()] }), ["a1"], NOW);
    expect(result.removed).toBe(1);
    expect(result.data.activities).toHaveLength(0);
    expect(result.data.deletions).toEqual([{ id: "a1", at: NOW.toISOString() }]);
  });

  it("meldt ids die er niet waren", () => {
    const result = deleteActivities(data({ activities: [activity()] }), ["a1", "weg"], NOW);
    expect(result.removed).toBe(1);
    expect(result.unknown).toEqual(["weg"]);
  });

  it("laat de agenda met rust wanneer er niets te halen valt", () => {
    const before = data({ activities: [activity()] });
    const result = deleteActivities(before, ["onbekend"], NOW);
    expect(result.removed).toBe(0);
    expect(result.data).toBe(before);
  });
});

describe("reistijd terug", () => {
  // Jouw woensdag: werken in Lelystad tot 17:00, reis 54 minuten. Je bent dus
  // pas om 17:54 thuis -- en niet om 17:20, wat er stond.
  const werk = activity({
    id: "werk",
    category: "werk",
    title: "Werken",
    date: "2026-09-16",
    startTime: "09:00",
    endTime: "17:00",
    location: { label: "Donaustraat 184, Lelystad", lat: 52.5, lon: 5.47 },
    travel: {
      durationMinutes: 54,
      distanceKm: 30,
      mode: "transit",
      provider: "motis",
      computedAt: "2026-09-15T06:00:00.000Z",
      key: "heen",
    },
    returnTravel: {
      durationMinutes: 54,
      distanceKm: 30,
      mode: "transit",
      provider: "motis",
      computedAt: "2026-09-15T06:00:00.000Z",
      key: "terug",
    },
  } as unknown as Partial<Activity>);

  const wereld = data({ activities: [werk], settings: settings({ bufferMinutes: 2 }) });

  it("vertelt hoe laat je weer thuis bent", () => {
    // Zonder dit getal kan een planner niet weten wanneer je avond begint.
    const dag = readAgenda(wereld, { from: "2026-09-16", to: "2026-09-16" }, NOW).days[0];
    expect(dag.activities[0].backHome).toBe("17:54");
    expect(dag.activities[0].returnMinutes).toBe(54);
  });

  it("weigert een leerblok waarvoor je nog onderweg bent", () => {
    const uitkomst = saveActivities(
      wereld,
      [
        {
          title: "Nederlands - theorie",
          date: "2026-09-16",
          startTime: "17:20",
          endTime: "18:00",
          source: "leerplan",
        },
      ],
      NOW,
    );
    expect(uitkomst.added).toBe(0);
    expect(uitkomst.skipped[0].reason).toContain("niet thuis");
    expect(uitkomst.skipped[0].reason).toContain("17:54");
  });

  it("laat hetzelfde blok ná je thuiskomst wel toe", () => {
    const uitkomst = saveActivities(
      wereld,
      [
        {
          title: "Nederlands - theorie",
          date: "2026-09-16",
          startTime: "18:00",
          endTime: "18:40",
          source: "leerplan",
        },
      ],
      NOW,
    );
    expect(uitkomst.added).toBe(1);
    expect(uitkomst.skipped).toHaveLength(0);
  });

  it("weigert ook een blok in het uur dat je al onderweg heen bent", () => {
    // Vertrek 08:04 (09:00 min 54 min reis min 2 min marge): een blok van 08:00
    // tot 09:00 thuis bestaat niet.
    const uitkomst = saveActivities(
      wereld,
      [{ title: "Huiswerk", date: "2026-09-16", startTime: "08:00", endTime: "09:00" }],
      NOW,
    );
    expect(uitkomst.added).toBe(0);
    expect(uitkomst.skipped[0].reason).toContain("niet thuis");
  });

  it("houdt een blok mét eigen locatie erbuiten", () => {
    // Daar rekent de app zelf een reis voor uit; die mag best tijdens je werk
    // staan, dan is het een botsing en geen onmogelijkheid.
    const uitkomst = saveActivities(
      wereld,
      [
        {
          title: "Tandarts",
          date: "2026-09-16",
          startTime: "17:20",
          endTime: "18:00",
          location: { label: "Almere", lat: 52.37, lon: 5.22 },
        },
      ],
      NOW,
    );
    expect(uitkomst.added).toBe(1);
  });
});

describe("hetzelfde blok twee keer opsturen", () => {
  it("werkt het bij in plaats van het ernaast te zetten", () => {
    // Twee keer dezelfde planning draaien zette voorheen je hele week dubbel.
    const leeg = data({ activities: [], settings: settings() });
    const blok = {
      title: "BE - samenvatting H3",
      date: "2026-09-16",
      startTime: "19:00",
      endTime: "20:30",
      source: "leerplan",
    };

    const eerste = saveActivities(leeg, [blok], NOW);
    expect(eerste.added).toBe(1);

    const tweede = saveActivities(eerste.data, [blok], NOW);
    expect(tweede.added).toBe(0);
    expect(tweede.updated).toBe(1);
    expect(tweede.data.activities).toHaveLength(1);
  });

  it("laat een blok met een andere tijd wél een nieuw blok zijn", () => {
    const leeg = data({ activities: [], settings: settings() });
    const eerste = saveActivities(
      leeg,
      [{ title: "Leren", date: "2026-09-16", startTime: "19:00", endTime: "20:00" }],
      NOW,
    );
    const tweede = saveActivities(
      eerste.data,
      [{ title: "Leren", date: "2026-09-16", startTime: "20:30", endTime: "21:30" }],
      NOW,
    );
    expect(tweede.added).toBe(1);
    expect(tweede.data.activities).toHaveLength(2);
  });
});
