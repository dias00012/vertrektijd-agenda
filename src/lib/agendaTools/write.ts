/**
 * De agenda veranderen: blokken bewaren, weggooien, overslaan en verplaatsen.
 *
 * Apart van het lezen (`read.ts`). Alles hier geeft een resultaat terug met wat
 * er veranderd is en wat er tegenhield, zodat de aanroeper nooit hoeft te raden
 * of het gelukt is.
 */

import { occursOn } from "../recurrence";
import { normalizeActivity } from "../backup";
import { awaySpans } from "../planning";
import { isDateKey, timeToMinutes } from "../time";
import { statusAfterSteps } from "../schoolwork";
import type { Activity, Exam, Task } from "../types";
import { MAX_SAVE } from "./types";
import type { AgendaData, SaveResult } from "./types";

/**
 * Hetzelfde blok dat er al staat: zelfde dag, zelfde begintijd, zelfde titel.
 *
 * Een planner die twee keer draait stuurt twee keer dezelfde blokken op, en
 * zonder id komt elk blok er gewoon bij. Zo stond na een tweede poging je hele
 * week dubbel. Herkennen we het, dan werken we het bij in plaats van het
 * ernaast te zetten.
 */
function sameBlock(activities: Activity[], date: string, startTime: string, title: string) {
  const naam = title.trim().toLowerCase();
  return activities.find(
    (item) =>
      item.date === date &&
      item.startTime === startTime &&
      item.title.trim().toLowerCase() === naam,
  );
}

/**
 * Activiteiten bewaren: bestaat de id al, dan wordt die bijgewerkt, anders komt
 * er een nieuwe bij. Dat is hetzelfde als wat "importeren → samenvoegen" doet,
 * zodat verplaatsen precies zo werkt als de planner verwacht: stuur hetzelfde
 * blok met dezelfde id en een andere tijd terug.
 *
 * Bewust streng op de klok en de datum. Een blok zonder geldige begintijd komt
 * in de app terecht als iets wat je niet kunt lezen en niet kunt weghalen.
 */
export function saveActivities(data: AgendaData, raw: unknown, now: Date = new Date()): SaveResult {
  const at = now.toISOString();
  const skipped: { index: number; reason: string }[] = [];

  if (!Array.isArray(raw)) {
    return { data, added: 0, updated: 0, skipped: [{ index: 0, reason: "geen lijst" }] };
  }
  if (raw.length > MAX_SAVE) {
    return {
      data,
      added: 0,
      updated: 0,
      skipped: [{ index: 0, reason: `meer dan ${MAX_SAVE} activiteiten in één keer` }],
    };
  }

  const byId = new Map(data.activities.map((activity) => [activity.id, activity]));
  let added = 0;
  let updated = 0;

  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      skipped.push({ index, reason: "geen object" });
      return;
    }
    const input = entry as Record<string, unknown>;
    if (typeof input.title !== "string" || input.title.trim().length === 0) {
      skipped.push({ index, reason: "titel ontbreekt" });
      return;
    }
    if (!isDateKey(input.date)) {
      skipped.push({ index, reason: "datum ontbreekt of is niet JJJJ-MM-DD" });
      return;
    }

    // Vanaf hier doet `normalizeActivity` het werk: dezelfde functie die de
    // import gebruikt, dus dezelfde standaardwaarden en dezelfde strengheid.
    const existing =
      (typeof input.id === "string" ? byId.get(input.id) : undefined) ??
      // Geen id, maar wel een blok dat er al precies zo staat: bijwerken.
      (typeof input.startTime === "string"
        ? sameBlock([...byId.values()], input.date, input.startTime, input.title)
        : undefined);
    const normalized = normalizeActivity({
      ...(existing ?? {}),
      ...input,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    });

    if (!normalized.allDay && normalized.endTime < normalized.startTime) {
      skipped.push({ index, reason: "eindtijd ligt vóór de begintijd" });
      return;
    }

    // Een blok zonder plek doe je thuis. Dan moet je er wel zijn: niet onderweg
    // naar je werk, en niet nog in de trein terug.
    if (!normalized.allDay && !normalized.location) {
      const start = timeToMinutes(normalized.startTime);
      const end = timeToMinutes(normalized.endTime);
      const clash = awaySpans(data.activities, data.settings, normalized.date, normalized.id).find(
        (span) => start < span.to && end > span.from,
      );
      if (clash) {
        // Alleen "dat kan niet" is een doodlopende weg: de planner weet dan wel
        // dat het niet mag maar niet wat er dan wel kan. Daarom het id erbij,
        // en bij een reeks de zin dat juist die ene dag eruit kan.
        skipped.push({
          index,
          reason:
            `je bent dan niet thuis: ${clash.title} (id ${clash.id}) loopt tot ` +
            `${clash.home} inclusief de reis terug` +
            (clash.recurring
              ? ". Dit is een herhalende reeks: met `skip_occurrence` kun je " +
                "alleen díe ene dag overslaan, of hem met `move_occurrence` " +
                "verzetten. Vraag dat eerst."
              : ""),
        });
        return;
      }
    }

    if (existing) {
      byId.set(normalized.id, normalized);
      updated += 1;
    } else {
      byId.set(normalized.id, normalized);
      added += 1;
    }
  });

  if (added === 0 && updated === 0) return { data, added, updated, skipped };

  const saved = new Set(byId.keys());
  return {
    data: {
      ...data,
      activities: [...byId.values()],
      // Een blok dat terugkomt is geen weggegooid blok meer: laat de grafsteen
      // staan en de eerstvolgende sync gooit het meteen weer weg.
      deletions: (data.deletions ?? []).filter((tombstone) => !saved.has(tombstone.id)),
    },
    added,
    updated,
    skipped,
  };
}

export interface DeleteResult {
  data: AgendaData;
  removed: number;
  /** Ids die er niet waren; zo weet de planner dat hij iets anders bedoelde. */
  unknown: string[];
}

/**
 * Activiteiten weggooien, met een grafsteen erbij.
 *
 * Zonder dat spoor is samenvoegen een optelsom: de telefoon die nog niet heeft
 * gesynchroniseerd kent het blok nog wel, en zet het bij de eerstvolgende
 * gelegenheid gewoon terug.
 */
export function deleteActivities(
  data: AgendaData,
  raw: unknown,
  now: Date = new Date(),
): DeleteResult {
  const at = now.toISOString();
  const ids = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  if (ids.length === 0) return { data, removed: 0, unknown: [] };

  const wanted = new Set(ids);
  const present = new Set(data.activities.map((activity) => activity.id));
  const unknown = ids.filter((id) => !present.has(id));
  const remaining = data.activities.filter((activity) => !wanted.has(activity.id));
  const removed = data.activities.length - remaining.length;
  if (removed === 0) return { data, removed: 0, unknown };

  const tombstones = (data.deletions ?? []).filter((tombstone) => !wanted.has(tombstone.id));
  for (const id of wanted) {
    if (present.has(id)) tombstones.push({ id, at });
  }

  return {
    data: { ...data, activities: remaining, deletions: tombstones },
    removed,
    unknown,
  };
}

/**
 * Eén dag uit een herhalende reeks.
 *
 * Dit was het gat waar een gesprek op stukliep: je sportavond staat elke week,
 * er komt één keer fysio tussen, en het enige wat er kon was de hele reeks
 * weggooien. Een agenda waarin je alleen alles of niets kunt weghalen is geen
 * agenda. De app kon dit al vanaf het scherm -- de connector niet.
 */
export interface OccurrenceResult {
  data: AgendaData;
  ok: boolean;
  /** Waarom het niet kon. Alleen gevuld wanneer `ok` false is. */
  reason?: string;
  /** Wat er is gebeurd, in gewone taal, om aan de gebruiker terug te geven. */
  note?: string;
  /** Het id van het losse blok dat na verzetten op de nieuwe tijd staat. */
  newId?: string;
}

/**
 * De reeks opzoeken en nakijken of die dag er werkelijk in zit.
 *
 * Een dag die er niet in zit overslaan lijkt te lukken -- er komt een datum in
 * `exceptions` die nergens op slaat -- en dan staat de activiteit er de
 * volgende dag gewoon nog. Beter meteen zeggen dat de datum niet klopt.
 */
function findSeries(
  data: AgendaData,
  raw: Record<string, unknown>,
): { series: Activity; date: string } | { reason: string } {
  const id = typeof raw.id === "string" ? raw.id : "";
  const series = data.activities.find((activity) => activity.id === id);
  if (!series) return { reason: `geen activiteit met id ${id || "(leeg)"}` };
  if (!isDateKey(raw.date)) return { reason: "datum ontbreekt of is niet JJJJ-MM-DD" };
  if (!series.recurrence) {
    return {
      reason:
        `"${series.title}" is geen herhalende reeks maar één losse afspraak; ` +
        "gebruik `delete_activities` of `save_activities` met hetzelfde id",
    };
  }
  return { series, date: raw.date };
}

/**
 * Eén dag overslaan, of een eerder overgeslagen dag terugzetten.
 *
 * Terugzetten hoort erbij: via het scherm kun je een overgeslagen dag alleen
 * terughalen zolang de "ongedaan maken"-balk nog staat. Zonder deze weg zou een
 * verkeerd overgeslagen dinsdag voorgoed weg zijn.
 */
export function skipOccurrence(
  data: AgendaData,
  raw: unknown,
  now: Date = new Date(),
): OccurrenceResult {
  if (!raw || typeof raw !== "object") return { data, ok: false, reason: "geen object" };
  const input = raw as Record<string, unknown>;
  const found = findSeries(data, input);
  if ("reason" in found) return { data, ok: false, reason: found.reason };
  const { series, date } = found;
  const restore = input.restore === true;

  if (restore) {
    if (!series.exceptions.includes(date)) {
      return { data, ok: false, reason: `${date} was niet overgeslagen` };
    }
  } else {
    if (series.exceptions.includes(date)) {
      return { data, ok: true, note: `${series.title} stond op ${date} al uit` };
    }
    if (!occursOn(series, date)) {
      return { data, ok: false, reason: `"${series.title}" valt helemaal niet op ${date}` };
    }
  }

  const exceptions = restore
    ? series.exceptions.filter((day) => day !== date)
    : [...series.exceptions, date];

  return {
    data: {
      ...data,
      activities: data.activities.map((activity) =>
        activity.id === series.id
          ? { ...activity, exceptions, updatedAt: now.toISOString() }
          : activity,
      ),
    },
    ok: true,
    note: restore
      ? `${series.title} staat op ${date} weer in je agenda`
      : `${series.title} staat op ${date} uit; de rest van de reeks blijft staan`,
  };
}

/**
 * Eén dag uit een reeks naar een ander tijdstip of een andere dag.
 *
 * Die dag valt uit de reeks en komt er los naast te staan, net als wanneer je
 * hem op het scherm versleept. De reis gaat niet mee: op een andere tijd rijdt
 * er een andere trein, dus die rekent de app opnieuw uit.
 */
export function moveOccurrence(
  data: AgendaData,
  raw: unknown,
  now: Date = new Date(),
): OccurrenceResult {
  if (!raw || typeof raw !== "object") return { data, ok: false, reason: "geen object" };
  const input = raw as Record<string, unknown>;
  const found = findSeries(data, input);
  if ("reason" in found) return { data, ok: false, reason: found.reason };
  const { series, date } = found;

  if (series.exceptions.includes(date)) {
    return { data, ok: false, reason: `${series.title} staat op ${date} al uit` };
  }
  if (!occursOn(series, date)) {
    return { data, ok: false, reason: `"${series.title}" valt helemaal niet op ${date}` };
  }

  const toDate = isDateKey(input.toDate) ? input.toDate : date;
  const startTime = typeof input.startTime === "string" ? input.startTime : series.startTime;
  const endTime = typeof input.endTime === "string" ? input.endTime : series.endTime;
  if (toDate === date && startTime === series.startTime && endTime === series.endTime) {
    return { data, ok: false, reason: "dat is precies waar hij al staat" };
  }

  const copy = normalizeActivity({
    ...series,
    // Leeg laten betekent: een nieuw id. Dit is een los blok, geen reeks meer.
    id: "",
    date: toDate,
    startTime,
    endTime,
    recurrence: null,
    exceptions: [],
    // De ritten horen bij het oude tijdstip; ze meenemen zou een vertrektijd
    // opleveren die er zelfverzekerd uitziet en niet klopt.
    travel: null,
    returnTravel: null,
    onwardTravel: null,
    travelError: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  // Dezelfde grens als bij `save_activities`: iets zonder plek doe je thuis, en
  // dan moet je er wel zijn. De reeks zelf telt niet mee -- die dag valt eruit.
  if (!copy.allDay && !copy.location) {
    const start = timeToMinutes(copy.startTime);
    const end = timeToMinutes(copy.endTime);
    const clash = awaySpans(data.activities, data.settings, copy.date, series.id).find(
      (span) => start < span.to && end > span.from,
    );
    if (clash) {
      return {
        data,
        ok: false,
        reason: `daar ben je niet thuis: ${clash.title} (id ${clash.id}) loopt tot ${clash.home}`,
      };
    }
  }

  return {
    data: {
      ...data,
      activities: [
        ...data.activities.map((activity) =>
          activity.id === series.id
            ? {
                ...activity,
                exceptions: [...activity.exceptions, date],
                updatedAt: now.toISOString(),
              }
            : activity,
        ),
        copy,
      ],
    },
    ok: true,
    newId: copy.id,
    note:
      `${series.title} staat op ${date} uit en los op ${toDate} ${startTime}-${endTime}; ` +
      "de rest van de reeks blijft staan",
  };
}

/** Wat er aan een opdracht of toets is veranderd. */
export interface SchoolworkResult {
  data: AgendaData;
  ok: boolean;
  reason?: string;
  note?: string;
}

const STATUSES = ["todo", "doing", "done"];
const PRIORITIES = ["high", "medium", "low", "later"];

/**
 * Huiswerk bijwerken vanuit het gesprek: een stap afvinken, de stand
 * veranderen of de prioriteit bijstellen.
 *
 * Dit is het andere gat. "Ik heb mijn samenvatting van H3 af" is precies wat je
 * tegen een assistent zegt, en tot nu toe kon hij het alleen aanhoren: lezen
 * mocht, wijzigen niet. Dan moest je het er zelf alsnog bij pakken, en tot dat
 * moment stond je agenda te liegen -- inclusief de leerblokken die er nog
 * ongestreept bij stonden.
 *
 * De prioriteit hoort er ook bij. Een rooster dat in één keer wordt ingevoerd
 * zet alles op "hoog", en dan is rood geen signaal meer maar behang: werk van
 * over drie weken staat er even schreeuwerig bij als wat morgen af moet. Dat
 * bijstellen is precies het soort werk dat je liever vertelt dan aanklikt.
 *
 * Alleen afvinken, de stand en de prioriteit; een opdracht aanmaken of
 * weggooien blijft handwerk. Dat is waar de dubbelingen vandaan komen, en een
 * opdracht die je niet kent kun je niet controleren.
 */
export function updateSchoolwork(
  data: AgendaData,
  raw: unknown,
  now: Date = new Date(),
): SchoolworkResult {
  if (!raw || typeof raw !== "object") return { data, ok: false, reason: "geen object" };
  const input = raw as Record<string, unknown>;
  const at = now.toISOString();
  const status = typeof input.status === "string" ? input.status : null;
  if (status !== null && !STATUSES.includes(status)) {
    return { data, ok: false, reason: `stand moet ${STATUSES.join(", ")} zijn` };
  }
  const priority = typeof input.priority === "string" ? input.priority : null;
  if (priority !== null && !PRIORITIES.includes(priority)) {
    return { data, ok: false, reason: `prioriteit moet ${PRIORITIES.join(", ")} zijn` };
  }

  if (typeof input.examId === "string") {
    const exam = data.exams.find((item) => item.id === input.examId);
    if (!exam) return { data, ok: false, reason: `geen toets met id ${input.examId}` };
    if (!status && !priority) {
      return { data, ok: false, reason: "een toets heeft alleen een stand en een prioriteit" };
    }
    return {
      data: {
        ...data,
        exams: data.exams.map((item) =>
          item.id === exam.id
            ? {
                ...item,
                status: (status as Exam["status"]) ?? item.status,
                priority: (priority as Exam["priority"]) ?? item.priority,
                updatedAt: at,
              }
            : item,
        ),
      },
      ok: true,
      note:
        `${exam.subject}: ` +
        [status ? `stand "${status}"` : null, priority ? `prioriteit "${priority}"` : null]
          .filter(Boolean)
          .join(", "),
    };
  }

  if (typeof input.taskId !== "string") {
    return { data, ok: false, reason: "geef `taskId` of `examId` mee" };
  }
  const task = data.tasks.find((item) => item.id === input.taskId);
  if (!task) return { data, ok: false, reason: `geen opdracht met id ${input.taskId}` };

  const wanted = Array.isArray(input.steps) ? input.steps : [];
  const unknown: string[] = [];
  let steps = task.steps ?? [];
  for (const entry of wanted) {
    if (!entry || typeof entry !== "object") continue;
    const step = entry as Record<string, unknown>;
    if (typeof step.id !== "string") continue;
    if (!steps.some((existing) => existing.id === step.id)) {
      unknown.push(step.id);
      continue;
    }
    steps = steps.map((existing) =>
      existing.id === step.id ? { ...existing, done: step.done !== false } : existing,
    );
  }
  if (unknown.length > 0) {
    return { data, ok: false, reason: `deze stappen bestaan niet: ${unknown.join(", ")}` };
  }
  if (wanted.length === 0 && !status && !priority) {
    return {
      data,
      ok: false,
      reason: "niets om te wijzigen: geef `steps`, `status` of `priority`",
    };
  }

  // Vink je het laatste hokje af, dan is de opdracht af en zegt hij dat ook --
  // dezelfde regel als op het scherm, zodat je agenda niet een andere stand
  // laat zien dan het gesprek.
  const gevraagd = (status as Task["status"] | null) ?? task.status;
  const nieuw = wanted.length > 0 ? statusAfterSteps(gevraagd, steps) : gevraagd;

  const klaar = steps.filter((step) => step.done).length;
  return {
    data: {
      ...data,
      tasks: data.tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              steps: task.steps ? steps : item.steps,
              status: nieuw,
              priority: (priority as Task["priority"]) ?? item.priority,
              updatedAt: at,
            }
          : item,
      ),
    },
    ok: true,
    note:
      `${task.title}: ${klaar} van ${steps.length} stappen af, stand "${nieuw}"` +
      (nieuw !== gevraagd ? " (alle stappen af, dus vanzelf op af gezet)" : "") +
      (priority ? `, prioriteit "${priority}"` : ""),
  };
}
