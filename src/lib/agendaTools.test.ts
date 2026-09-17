import { describe, expect, it } from "vitest";
import {
  deleteActivities,
  moveOccurrence,
  readAgenda,
  saveActivities,
  skipOccurrence,
  updateSchoolwork,
  type AgendaData,
} from "./agendaTools";
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
    location: { label: "Voorbeeldweg 184, Lelystad", lat: 52.5, lon: 5.47 },
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

describe("vrije ruimte", () => {
  // Jouw woensdag opnieuw: werken in Lelystad 09:00-17:00, reis 54 minuten heen
  // en terug. Op de klok lijkt de dag om 17:00 vrij; in werkelijkheid begint
  // hij om 17:54 en loopt hij tot de avondgrens.
  const rit = {
    durationMinutes: 54,
    distanceKm: 30,
    mode: "transit",
    provider: "motis",
    computedAt: "2026-09-15T06:00:00.000Z",
    key: "k",
  };
  const werk = activity({
    id: "werk",
    category: "werk",
    title: "Werken",
    date: "2026-09-16",
    startTime: "09:00",
    endTime: "17:00",
    location: { label: "Voorbeeldweg 184, Lelystad", lat: 52.5, lon: 5.47 },
    travel: rit,
    returnTravel: rit,
  } as unknown as Partial<Activity>);

  const gamen = activity({
    id: "gamen",
    category: "hobby",
    title: "Gamen",
    date: "2026-09-16",
    startTime: "19:30",
    endTime: "21:30",
  });

  const wereld = data({
    activities: [werk, gamen],
    settings: settings({ bufferMinutes: 2 }),
  });

  const dag = () => readAgenda(wereld, { from: "2026-09-16", to: "2026-09-16" }, NOW).days[0];

  it("begint de avond pas als je thuis bent", () => {
    // Niet om 17:00 (eindtijd) maar om 17:54 (thuiskomst).
    expect(dag().free.some((slot) => slot.from === "17:54")).toBe(true);
    expect(dag().free.some((slot) => slot.from === "17:00")).toBe(false);
  });

  it("houdt op bij de avondgrens", () => {
    const laatste = dag().free[dag().free.length - 1];
    expect(laatste.to).toBe("22:00");
  });

  it("stopt het ochtendgat op het moment dat je vertrekt", () => {
    // Van 07:00 tot 08:04 ben je nog thuis: dat uur is echt bruikbaar. Maar
    // niet tot 09:00, want dan zit je al in de trein.
    const ochtend = dag().free[0];
    expect(ochtend.from).toBe("07:00");
    expect(ochtend.to).toBe("08:04");
  });

  it("knipt het gamen eruit maar biedt het aan als verzetbaar", () => {
    const vrij = dag().free;
    // Het gamen van 19:30 tot 21:30 zit er niet in.
    expect(vrij.map((slot) => `${slot.from}-${slot.to}`)).toEqual([
      "07:00-08:04",
      "17:54-19:30",
      "21:30-22:00",
    ]);
    expect(dag().movable.map((blok) => blok.title)).toEqual(["Gamen"]);
  });

  it("vertelt binnen welke uren er gepland mag worden", () => {
    const uitkomst = readAgenda(wereld, { from: "2026-09-16", to: "2026-09-16" }, NOW);
    expect(uitkomst.rules.planUntil).toBe("22:00");
    expect(uitkomst.rules.movableCategories).toContain("hobby");
    expect(uitkomst.rules.note).toContain("wacht op antwoord");
  });
});

describe("ingeplande tijd per opdracht", () => {
  it("telt wat er al staat en wat er nog bij moet", () => {
    // Zonder dit plant een planner er elke keer een nieuwe stapel bovenop.
    const wereld = data({
      settings: settings(),
      tasks: [task({ id: "be", estimatedMinutes: 180 })],
      activities: [
        activity({ id: "b1", date: "2026-09-16", startTime: "19:00", endTime: "20:00", linkedTaskId: "be" }),
        activity({ id: "b2", date: "2026-09-17", startTime: "19:00", endTime: "19:30", linkedTaskId: "be" }),
      ],
    });
    const gevonden = readAgenda(wereld, {}, NOW).tasks.find((item) => item.id === "be");
    expect(gevonden?.plannedMinutes).toBe(90);
    expect(gevonden?.remainingMinutes).toBe(90);
  });

  it("gaat niet onder nul als er ruim genoeg staat", () => {
    const wereld = data({
      settings: settings(),
      tasks: [task({ id: "be", estimatedMinutes: 30 })],
      activities: [
        activity({ id: "b1", date: "2026-09-16", startTime: "19:00", endTime: "21:00", linkedTaskId: "be" }),
      ],
    });
    const gevonden = readAgenda(wereld, {}, NOW).tasks.find((item) => item.id === "be");
    expect(gevonden?.remainingMinutes).toBe(0);
  });
});

describe("dubbel en botsend", () => {
  it("herkent twee keer dezelfde opdracht onder een andere naam", () => {
    // Deze twee stonden echt zo in de agenda, allebei open.
    const wereld = data({
      settings: settings(),
      tasks: [
        task({
          id: "t-excel-wk2",
          subject: "Bedrijfseconomie",
          title: "Excel week 2 - H2 (Opdracht 2.5 en 2.6)",
          deadline: "2026-09-18",
        }),
        task({
          id: "ex2",
          subject: "Bedrijfseconomie",
          title: "Excel week 2 - H2 Afronden",
          deadline: "2026-09-18",
        }),
      ],
    });
    const dubbel = readAgenda(wereld, {}, NOW).duplicates;
    expect(dubbel).toHaveLength(1);
    expect(dubbel[0].kind).toBe("taak");
    expect(dubbel[0].ids).toEqual(["t-excel-wk2", "ex2"]);
  });

  it("laat twee verschillende opdrachten met dezelfde deadline met rust", () => {
    const wereld = data({
      settings: settings(),
      tasks: [
        task({ id: "be3", subject: "Bedrijfseconomie", title: "BE week 3 - H5", deadline: "2026-09-25" }),
        task({
          id: "ex3",
          subject: "Bedrijfseconomie",
          title: "Excel week 3 - H3 Functie ALS",
          deadline: "2026-09-25",
        }),
      ],
    });
    expect(readAgenda(wereld, {}, NOW).duplicates).toHaveLength(0);
  });

  it("ziet twee leesblokken op dezelfde dag", () => {
    const wereld = data({
      settings: settings(),
      activities: [
        activity({ id: "l1", title: "Lezen", date: "2026-09-16", startTime: "21:15", endTime: "22:15" }),
        activity({
          id: "l2",
          title: "Lezen (voor het slapen)",
          date: "2026-09-16",
          startTime: "23:05",
          endTime: "23:35",
        }),
      ],
    });
    const dubbel = readAgenda(wereld, { from: "2026-09-16", to: "2026-09-16" }, NOW).duplicates;
    expect(dubbel).toHaveLength(1);
    expect(dubbel[0].kind).toBe("activiteit");
    expect(dubbel[0].note).toContain("2026-09-16");
  });

  it("meldt een botsing op de klok", () => {
    const wereld = data({
      settings: settings(),
      activities: [
        activity({ id: "a", title: "Sporten", date: "2026-09-16", startTime: "18:00", endTime: "19:30" }),
        activity({ id: "b", title: "Koken", date: "2026-09-16", startTime: "19:00", endTime: "19:45" }),
      ],
    });
    const dag = readAgenda(wereld, { from: "2026-09-16", to: "2026-09-16" }, NOW).days[0];
    expect(dag.clashes).toHaveLength(1);
    expect(dag.clashes[0].travelOnly).toBe(false);
    expect(dag.clashes[0].between).toContain("Sporten");
  });
});

describe("thuisreis nog niet berekend", () => {
  // Precies wat er live stond: Werken in Lelystad met een heenreis van 54
  // minuten, maar zonder berekende thuisreis. Zwijgen daarover betekent dat
  // 17:00 als thuiskomst geldt -- en dat is de fout waar het om begonnen was.
  const werk = activity({
    id: "werk",
    category: "werk",
    title: "Werken",
    date: "2026-09-17",
    startTime: "09:00",
    endTime: "17:00",
    location: { label: "Voorbeeldweg 184, Lelystad", lat: 52.5, lon: 5.47 },
    travel: {
      durationMinutes: 54,
      distanceKm: 30,
      mode: "transit",
      provider: "motis",
      computedAt: "2026-09-16T06:00:00.000Z",
      key: "heen",
    },
    returnTravel: null,
  } as unknown as Partial<Activity>);

  const wereld = data({ activities: [werk], settings: settings({ bufferMinutes: 5 }) });

  it("schat de thuiskomst op de heenreis en zegt dat het een schatting is", () => {
    const dag = readAgenda(wereld, { from: "2026-09-17", to: "2026-09-17" }, NOW).days[0];
    expect(dag.activities[0].backHome).toBe("17:54");
    expect(dag.activities[0].backHomeEstimated).toBe(true);
  });

  it("laat de vrije tijd pas na die schatting beginnen", () => {
    const dag = readAgenda(wereld, { from: "2026-09-17", to: "2026-09-17" }, NOW).days[0];
    expect(dag.free.some((slot) => slot.from === "17:00")).toBe(false);
    expect(dag.free.some((slot) => slot.from === "17:54")).toBe(true);
  });

  it("weigert een leerblok dat in die geschatte reis valt", () => {
    const uitkomst = saveActivities(
      wereld,
      [{ title: "Leren", date: "2026-09-17", startTime: "17:20", endTime: "18:00" }],
      NOW,
    );
    expect(uitkomst.added).toBe(0);
    expect(uitkomst.skipped[0].reason).toContain("niet thuis");
  });
});

describe("geen valse dubbelmelding", () => {
  it("houdt twee verschillende weekopdrachten uit elkaar", () => {
    // Deze twee werden ten onrechte als dubbel gemeld: ze delen alleen "week",
    // "4" en "h5".
    const wereld = data({
      settings: settings(),
      tasks: [
        task({
          id: "be4",
          subject: "Bedrijfseconomie",
          title: "BE week 4 - H4 + H5 opgaven + Casus deel 1",
          deadline: "2026-10-02",
        }),
        task({
          id: "ex4",
          subject: "Bedrijfseconomie",
          title: "Excel week 4 - H5 Grafieken",
          deadline: "2026-10-02",
        }),
      ],
    });
    expect(readAgenda(wereld, {}, NOW).duplicates).toHaveLength(0);
  });

  it("blijft de echte dubbele opdracht wél zien", () => {
    const wereld = data({
      settings: settings(),
      tasks: [
        task({
          id: "t-excel-wk2",
          subject: "Bedrijfseconomie",
          title: "Excel week 2 - H2 (Opdracht 2.5 en 2.6)",
          deadline: "2026-09-18",
        }),
        task({
          id: "ex2",
          subject: "Bedrijfseconomie",
          title: "Excel week 2 - H2 Afronden",
          deadline: "2026-09-18",
        }),
      ],
    });
    expect(readAgenda(wereld, {}, NOW).duplicates).toHaveLength(1);
  });
});

describe("heenreis nog niet berekend", () => {
  // Zoals Sporten in de echte agenda stond: wel een thuisreis van 20 minuten,
  // maar geen berekende heenreis. Dan gold 18:15 als vertrektijd, en bood de
  // app een gaatje van 21 minuten aan in het kwartier dat je erheen fietst.
  const sporten = activity({
    id: "gym",
    category: "gym",
    title: "Sporten",
    date: "2026-09-17",
    startTime: "18:15",
    endTime: "19:30",
    location: { label: "Voorbeeldlaan 19, Almere", lat: 52.37, lon: 5.24 },
    travel: null,
    returnTravel: {
      durationMinutes: 20,
      distanceKm: 4,
      mode: "transit",
      provider: "motis",
      computedAt: "2026-09-16T06:00:00.000Z",
      key: "terug",
    },
  } as unknown as Partial<Activity>);

  const wereld = data({ activities: [sporten], settings: settings({ bufferMinutes: 5 }) });

  it("schat het vertrek op de thuisreis", () => {
    // 18:15 min 20 minuten reis min 5 minuten marge = 17:50.
    const dag = readAgenda(wereld, { from: "2026-09-17", to: "2026-09-17" }, NOW).days[0];
    expect(dag.free.some((slot) => slot.to === "18:15")).toBe(false);
    expect(dag.free.some((slot) => slot.to === "17:50")).toBe(true);
  });

  it("weigert een blok in de tijd dat je erheen gaat", () => {
    const uitkomst = saveActivities(
      wereld,
      [{ title: "Even leren", date: "2026-09-17", startTime: "17:55", endTime: "18:15" }],
      NOW,
    );
    expect(uitkomst.added).toBe(0);
    expect(uitkomst.skipped[0].reason).toContain("niet thuis");
  });
});

/** Sporten, elke maandag, met een adres eraan. Zijn echte geval. */
const sporten = (patch: Partial<Activity> = {}): Activity =>
  activity({
    id: "gym",
    category: "gym",
    title: "Sporten",
    date: "2026-09-07",
    startTime: "18:15",
    endTime: "19:30",
    location: { label: "Voorbeeldlaan 19, Almere", lat: 52.37, lon: 5.24 },
    recurrence: { freq: "weekly", weekdays: [1], until: null },
    ...patch,
  });

describe("skipOccurrence", () => {
  it("zet één maandag uit en laat de rest van de reeks staan", () => {
    const before = data({ activities: [sporten()] });
    const result = skipOccurrence(before, { id: "gym", date: "2026-09-14" }, NOW);
    expect(result.ok).toBe(true);
    expect(result.data.activities[0].exceptions).toEqual(["2026-09-14"]);
    // De week erna staat hij er gewoon weer.
    const na = readAgenda(result.data, { from: "2026-09-14", to: "2026-09-21" }, NOW);
    expect(na.days[0].activities.map((a) => a.title)).not.toContain("Sporten");
    expect(na.days[7].activities.map((a) => a.title)).toContain("Sporten");
  });

  it("zet een overgeslagen dag weer terug", () => {
    const before = data({ activities: [sporten({ exceptions: ["2026-09-14"] })] });
    const result = skipOccurrence(before, { id: "gym", date: "2026-09-14", restore: true }, NOW);
    expect(result.ok).toBe(true);
    expect(result.data.activities[0].exceptions).toEqual([]);
  });

  it("weigert een dag waarop de reeks helemaal niet valt", () => {
    // Sporten is op maandag; 15 september is een dinsdag.
    const result = skipOccurrence(
      data({ activities: [sporten()] }),
      { id: "gym", date: "2026-09-15" },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("valt helemaal niet op");
  });

  it("stuurt je bij een losse afspraak naar het juiste gereedschap", () => {
    const los = activity({ id: "los", recurrence: null });
    const result = skipOccurrence(data({ activities: [los] }), { id: "los", date: "2026-09-14" }, NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("delete_activities");
  });

  it("doet niets moeilijks over een dag die al uit stond", () => {
    const before = data({ activities: [sporten({ exceptions: ["2026-09-14"] })] });
    const result = skipOccurrence(before, { id: "gym", date: "2026-09-14" }, NOW);
    expect(result.ok).toBe(true);
    expect(result.data.activities[0].exceptions).toEqual(["2026-09-14"]);
  });
});

describe("moveOccurrence", () => {
  it("haalt die dag uit de reeks en zet hem los op de nieuwe tijd", () => {
    const before = data({ activities: [sporten()] });
    const result = moveOccurrence(
      before,
      { id: "gym", date: "2026-09-14", startTime: "20:00", endTime: "21:15" },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.data.activities).toHaveLength(2);
    const reeks = result.data.activities.find((a) => a.id === "gym");
    const los = result.data.activities.find((a) => a.id === result.newId);
    expect(reeks?.exceptions).toEqual(["2026-09-14"]);
    expect(los).toMatchObject({
      title: "Sporten",
      date: "2026-09-14",
      startTime: "20:00",
      endTime: "21:15",
      recurrence: null,
    });
  });

  it("neemt de oude rit niet mee naar de nieuwe tijd", () => {
    // Om 18:15 rijdt er een andere bus dan om 20:00. Een vertrektijd die
    // overgeschreven wordt ziet er zelfverzekerd uit en klopt niet.
    const met = sporten({
      travel: { durationMinutes: 20 } as Activity["travel"],
      returnTravel: { durationMinutes: 20 } as Activity["returnTravel"],
    });
    const result = moveOccurrence(
      data({ activities: [met] }),
      { id: "gym", date: "2026-09-14", startTime: "20:00", endTime: "21:15" },
      NOW,
    );
    const los = result.data.activities.find((a) => a.id === result.newId);
    expect(los?.travel).toBeNull();
    expect(los?.returnTravel).toBeNull();
  });

  it("verzet naar een andere dag als je `toDate` meegeeft", () => {
    const result = moveOccurrence(
      data({ activities: [sporten()] }),
      { id: "gym", date: "2026-09-14", toDate: "2026-09-16" },
      NOW,
    );
    const los = result.data.activities.find((a) => a.id === result.newId);
    expect(los).toMatchObject({ date: "2026-09-16", startTime: "18:15", endTime: "19:30" });
  });

  it("weigert een blok zonder plek in de tijd dat je van huis bent", () => {
    const werk = activity({
      id: "werk",
      title: "Werk",
      startTime: "09:00",
      endTime: "17:00",
      location: { label: "Lelystad", lat: 52.51, lon: 5.48 },
      travel: { durationMinutes: 54 } as Activity["travel"],
      returnTravel: { durationMinutes: 54 } as Activity["returnTravel"],
    });
    const gamen = activity({
      id: "spel",
      category: "hobby",
      title: "Gamen",
      date: "2026-09-07",
      startTime: "20:00",
      endTime: "21:00",
      location: null,
      recurrence: { freq: "weekly", weekdays: [1], until: null },
    });
    const result = moveOccurrence(
      data({ activities: [werk, gamen] }),
      { id: "spel", date: "2026-09-14", startTime: "17:15", endTime: "18:15" },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("niet thuis");
    expect(result.reason).toContain("id werk");
  });

  it("zegt het wanneer er niets te verzetten valt", () => {
    const result = moveOccurrence(
      data({ activities: [sporten()] }),
      { id: "gym", date: "2026-09-14" },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("al staat");
  });
});

describe("updateSchoolwork", () => {
  const metStappen = task({
    steps: [
      { id: "s1", title: "Lezen", estimatedMinutes: 30, done: false },
      { id: "s2", title: "Opgaven", estimatedMinutes: 60, done: false },
    ],
  });

  it("vinkt een stap af", () => {
    const result = updateSchoolwork(
      data({ tasks: [metStappen] }),
      { taskId: "t1", steps: [{ id: "s1", done: true }] },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.data.tasks[0].steps?.map((s) => s.done)).toEqual([true, false]);
  });

  it("zet de opdracht vanzelf op af zodra de laatste stap af is", () => {
    const result = updateSchoolwork(
      data({ tasks: [metStappen] }),
      { taskId: "t1", steps: [{ id: "s1", done: true }, { id: "s2", done: true }] },
      NOW,
    );
    expect(result.data.tasks[0].status).toBe("done");
  });

  it("vinkt een stap ook weer uit", () => {
    const af = task({
      status: "done",
      steps: [{ id: "s1", title: "Lezen", estimatedMinutes: 30, done: true }],
    });
    const result = updateSchoolwork(
      data({ tasks: [af] }),
      { taskId: "t1", steps: [{ id: "s1", done: false }] },
      NOW,
    );
    expect(result.data.tasks[0].steps?.[0].done).toBe(false);
    expect(result.data.tasks[0].status).toBe("doing");
  });

  it("zet de stand van een opdracht zonder stappen", () => {
    const result = updateSchoolwork(data({ tasks: [task()] }), { taskId: "t1", status: "doing" }, NOW);
    expect(result.data.tasks[0].status).toBe("doing");
  });

  it("weigert een stap die niet bestaat in plaats van hem stil over te slaan", () => {
    const result = updateSchoolwork(
      data({ tasks: [metStappen] }),
      { taskId: "t1", steps: [{ id: "bestaat-niet", done: true }] },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("bestaat-niet");
  });

  it("weigert een stand die niet bestaat", () => {
    const result = updateSchoolwork(data({ tasks: [task()] }), { taskId: "t1", status: "bijna" }, NOW);
    expect(result.ok).toBe(false);
  });

  it("zet de prioriteit van een opdracht", () => {
    const result = updateSchoolwork(
      data({ tasks: [task({ priority: "high" })] }),
      { taskId: "t1", priority: "low" },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.data.tasks[0].priority).toBe("low");
  });

  it("laat de stand met rust wanneer alleen de prioriteit verandert", () => {
    const result = updateSchoolwork(
      data({ tasks: [task({ status: "doing" })] }),
      { taskId: "t1", priority: "later" },
      NOW,
    );
    expect(result.data.tasks[0].status).toBe("doing");
  });

  it("weigert een prioriteit die niet bestaat", () => {
    const result = updateSchoolwork(
      data({ tasks: [task()] }),
      { taskId: "t1", priority: "heel erg hoog" },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("prioriteit moet");
  });

  it("zet de prioriteit van een toets", () => {
    const result = updateSchoolwork(
      data({ exams: [exam({ priority: "high" })] }),
      { examId: "e1", priority: "medium" },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.data.exams[0].priority).toBe("medium");
    expect(result.data.exams[0].status).toBe("todo");
  });

  it("zet de stand van een toets", () => {
    const result = updateSchoolwork(data({ exams: [exam()] }), { examId: "e1", status: "done" }, NOW);
    expect(result.ok).toBe(true);
    expect(result.data.exams[0].status).toBe("done");
  });

  it("zegt het wanneer er niets te wijzigen valt", () => {
    const result = updateSchoolwork(data({ tasks: [task()] }), { taskId: "t1" }, NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("niets om te wijzigen");
    expect(result.reason).toContain("priority");
  });
});

/*
 * Het geval waar dit allemaal om begon: elke maandag sporten, en er komt één
 * keer fysio tussen. Daar liep een gesprek op stuk -- het enige wat kon was de
 * hele reeks weggooien. Deze drie tests lopen de weg na die er nu wél is.
 */
describe("de fysio-afspraak op de sportavond", () => {
  const met = data({
    activities: [
      sporten({
        travel: { durationMinutes: 20 } as Activity["travel"],
        returnTravel: { durationMinutes: 20 } as Activity["returnTravel"],
      }),
    ],
  });

  it("laat zien dat sporten die maandag kan wijken", () => {
    const gelezen = readAgenda(met, { from: "2026-09-14", to: "2026-09-14" }, NOW);
    expect(gelezen.days[0].movable).toEqual([
      {
        id: "gym",
        title: "Sporten",
        startTime: "18:15",
        endTime: "19:30",
        minutes: 75,
        recurring: true,
        away: true,
      },
    ]);
    expect(gelezen.rules.note).toContain("skip_occurrence");
  });

  it("slaat die ene maandag over en zet de fysio ervoor in de plaats", () => {
    const zonder = skipOccurrence(met, { id: "gym", date: "2026-09-14" }, NOW);
    expect(zonder.ok).toBe(true);

    const erbij = saveActivities(
      zonder.data,
      [
        {
          title: "Fysio",
          date: "2026-09-14",
          startTime: "18:30",
          endTime: "19:15",
          category: "gym",
          location: { label: "Almere Buiten", lat: 52.4, lon: 5.29 },
        },
      ],
      NOW,
    );
    expect(erbij.added).toBe(1);

    const gelezen = readAgenda(erbij.data, { from: "2026-09-14", to: "2026-09-21" }, NOW);
    expect(gelezen.days[0].activities.map((a) => a.title)).toEqual(["Fysio"]);
    // En de maandag erna staat sporten er gewoon weer.
    expect(gelezen.days[7].activities.map((a) => a.title)).toEqual(["Sporten"]);
  });

  it("of verzet sporten naar later op diezelfde avond", () => {
    const verzet = moveOccurrence(
      met,
      { id: "gym", date: "2026-09-14", startTime: "20:00", endTime: "21:15" },
      NOW,
    );
    expect(verzet.ok).toBe(true);
    const gelezen = readAgenda(verzet.data, { from: "2026-09-14", to: "2026-09-14" }, NOW);
    expect(gelezen.days[0].activities.map((a) => `${a.title} ${a.startTime}`)).toEqual([
      "Sporten 20:00",
    ]);
  });
});

describe("wat read_agenda over de reistijd zegt", () => {
  /*
   * Hier ging het mis in de praktijk. Was de heenreis nog niet berekend, dan
   * stond er gewoon géén vertrektijd in het antwoord -- geen "onbekend", maar
   * stilte. En stilte vult een planner in met iets plausibels.
   */
  const buiten = (patch: Partial<Activity> = {}): Activity =>
    activity({
      id: "gym",
      title: "Sporten",
      startTime: "18:15",
      endTime: "19:30",
      location: { label: "Voorbeeldlaan 19, Almere", lat: 52.37, lon: 5.24 },
      ...patch,
    });

  const lees = (item: Activity) =>
    readAgenda(data({ activities: [item] }), { from: "2026-09-14", to: "2026-09-14" }, NOW)
      .days[0].activities[0];

  it("schat de vertrektijd uit de thuisreis wanneer de heenreis ontbreekt", () => {
    const item = buiten({
      travel: null,
      returnTravel: { durationMinutes: 20 } as Activity["returnTravel"],
    });
    // 18:15 min twintig minuten reis min tien minuten marge.
    expect(lees(item)).toMatchObject({
      departure: "17:45",
      travelMinutes: 20,
      departureEstimated: true,
    });
  });

  it("schat andersom net zo goed", () => {
    const item = buiten({
      travel: { durationMinutes: 25 } as Activity["travel"],
      returnTravel: null,
    });
    expect(lees(item)).toMatchObject({ backHome: "19:55", backHomeEstimated: true });
  });

  it("zegt het met zoveel woorden wanneer er niets bekend is", () => {
    const item = buiten({ travel: null, returnTravel: null });
    expect(lees(item)).toMatchObject({ travelUnknown: true });
    expect(lees(item).departure).toBeUndefined();
  });

  it("geeft de reden mee wanneer de app die kent", () => {
    const item = buiten({ travel: null, returnTravel: null, travelError: "geen route gevonden" });
    expect(lees(item).travelNote).toBe("geen route gevonden");
  });

  it("noemt een berekende reis geen schatting", () => {
    const item = buiten({
      travel: { durationMinutes: 25 } as Activity["travel"],
      returnTravel: { durationMinutes: 20 } as Activity["returnTravel"],
    });
    const gelezen = lees(item);
    expect(gelezen.departureEstimated).toBeUndefined();
    expect(gelezen.backHomeEstimated).toBeUndefined();
    expect(gelezen.travelUnknown).toBeUndefined();
  });

  it("roept geen onbekende reistijd bij iets zonder plek", () => {
    // Thuis studeren heeft geen reis; dat is geen ontbrekend gegeven.
    const thuis = activity({ location: null, travel: null, returnTravel: null });
    expect(lees(thuis).travelUnknown).toBeUndefined();
  });
});
