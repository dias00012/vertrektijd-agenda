import { activitiesOnDate } from "./agenda";
import { normalizeActivity } from "./backup";
import { addDaysToKey, daysBetween, isDateKey, timeToMinutes, todayKey } from "./time";
import { computeDeparture, computeReturn } from "./travel";
import { activityMinutes } from "./schoolwork";
import type { Activity, Exam, Settings, Task } from "./types";

/**
 * De drie handelingen die de connector aanbiedt: de agenda lezen, blokken
 * bewaren, blokken weggooien. Bewust losgekoppeld van HTTP en van Supabase,
 * zodat ze zonder netwerk te testen zijn.
 *
 * Alles draait om precies dezelfde vorm als de import/export (`backup.ts`) en
 * de synchronisatie (`sync.ts`). De planner die hier binnenkomt krijgt dus de
 * data die de app zelf ook gebruikt, en schrijft terug wat de app zelf ook
 * inleest — geen tweede waarheid die na een half jaar uit de pas loopt.
 */

/**
 * Wat er in één rij van `user_data` staat. Structureel gelijk aan `SyncPayload`
 * uit `sync.ts`; hier apart getypt omdat die module alleen in de browser draait
 * en deze code op de server.
 */
export interface AgendaData {
  settings: Settings | null;
  activities: Activity[];
  tasks: Task[];
  exams: Exam[];
  /** Grafstenen van weggegooide items, zodat ze niet terugkomen bij de sync. */
  deletions?: { id: string; at: string }[];
}

/** Hoeveel dagen `read_agenda` teruggeeft als er geen periode wordt gevraagd. */
const DEFAULT_DAYS = 14;

/**
 * Harde bovengrens op de gevraagde periode. Een jaar aan dagen opsturen helpt
 * geen enkele planning en vult wel het hele gesprek.
 */
const MAX_DAYS = 62;

/** Hoeveel activiteiten er in één keer bewaard mogen worden. */
const MAX_SAVE = 100;

/**
 * Het venster waarbinnen een planner iets mag voorstellen.
 *
 * Niet omdat de agenda daarbuiten leeg is, maar omdat een planning die om
 * 23:00 nog een uur schoolwerk neerzet geen planning is maar een wens. De
 * grens hoort bij de gebruiker, niet bij het model -- vandaar dat hij in het
 * antwoord meegaat, zodat je hem kunt zien en erover kunt praten.
 */
const DAY_STARTS = 7 * 60;
const PLAN_UNTIL = 22 * 60;

/** Korter dan dit is geen werkblok maar een gaatje. */
const MIN_GAP = 20;

/**
 * Categorieën die mogen wijken als het krap wordt.
 *
 * Alleen als vóórstel: gamen en lezen zijn te verzetten, maar of dat vanavond
 * ook mag is niet aan een planner. En "Gitaar les" staat in diezelfde categorie
 * terwijl die juist vastligt -- reden te meer om het altijd te vragen.
 */
const MOVABLE = ["hobby"];

const WEEKDAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

/** Een activiteit zoals de planner hem te zien krijgt: plat en zonder ruis. */
interface ReadActivity {
  id: string;
  title: string;
  category: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  /** Adres van de bestemming; ontbreekt bij iets zonder plek (thuis, online). */
  location?: string;
  /** Hoe laat je van huis moet, als de app dat heeft uitgerekend. */
  departure?: string;
  travelMinutes?: number;
  /** Hoe laat je er bent met de gevonden rit. */
  arrival?: string;
  /** true wanneer je met de gevonden rit ná de begintijd aankomt. */
  arrivesLate?: boolean;
  /**
   * Hoe laat je weer thuis bent, eindtijd plus de reis terug.
   *
   * Dit is het getal waar een planning op stukloopt als je het weglaat. Werk je
   * tot 17:00 in Lelystad, dan ben je pas om 17:54 thuis -- en een leerblok om
   * 17:20 bestaat alleen op papier.
   */
  backHome?: string;
  /** Duur van de reis terug in minuten. */
  returnMinutes?: number;
  /** "leerplan" voor blokken die uit een leerplan komen, anders afwezig. */
  source?: string;
  linkedTaskId?: string;
  /** De stap binnen die taak waar dit blok voor is. */
  linkedStepId?: string;
  linkedExamId?: string;
  /** true wanneer deze dag uit een herhalende reeks komt. */
  recurring?: boolean;
}

/** Een gat waarin echt iets past: thuis, wakker, en niets anders gepland. */
interface FreeSlot {
  from: string;
  to: string;
  minutes: number;
}

/** Een blok dat zou kunnen wijken, als de gebruiker dat goedvindt. */
interface MovableBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  minutes: number;
}

interface ReadDay {
  date: string;
  weekday: string;
  activities: ReadActivity[];
  /**
   * De gaten waarin werkelijk iets kan. Uitgerekend met de reistijden erin
   * verwerkt, dus dit is de dag zoals je hem beleeft -- niet de lijst rijen
   * waar je die dag zelf uit moet afleiden.
   */
  free: FreeSlot[];
  /** Wat er zou kunnen wijken als `free` te weinig oplevert. Altijd vragen. */
  movable: MovableBlock[];
}

export interface ReadResult {
  today: string;
  from: string;
  to: string;
  /** Thuisadres; zonder dit kan de app geen vertrektijd uitrekenen. */
  home: string | null;
  defaults: { bufferMinutes: number; travelMode: string };
  /** De afspraken waar een planning zich aan hoort te houden. */
  rules: {
    /** Niet vóór dit tijdstip iets voorstellen. */
    planFrom: string;
    /** En niet ná dit tijdstip. De avond is van de gebruiker. */
    planUntil: string;
    /** Korter dan dit heeft geen zin als werkblok. */
    minimumMinutes: number;
    /** Wat er mag wijken -- maar nooit zonder het te vragen. */
    movableCategories: string[];
    note: string;
  };
  days: ReadDay[];
  tasks: {
    id: string;
    subject: string;
    title: string;
    deadline: string;
    estimatedMinutes: number;
    /** Wat er al voor deze opdracht in de agenda staat. */
    plannedMinutes: number;
    /** Wat er nog ingepland moet worden; nul als je er al genoeg tijd voor hebt. */
    remainingMinutes: number;
    priority: string;
    status: string;
    /** De stappen van deze opdracht, met hun `id` voor `linkedStepId`. */
    steps?: { id: string; title: string; estimatedMinutes?: number; done: boolean }[];
  }[];
  exams: {
    id: string;
    subject: string;
    title?: string;
    date: string;
    prepMinutes?: number;
    priority: string;
    status: string;
    topics?: string[];
  }[];
}

/**
 * De dag als bezette stukken: alles waarin je niet thuis aan iets anders kunt
 * zitten. Een uitstapje telt van vertrek tot thuiskomst, niet van begin tot
 * eind -- dat verschil was precies wat er miste.
 */
function busyOnDate(data: AgendaData, date: string): { from: number; to: number }[] {
  const settings = data.settings;
  const spans: { from: number; to: number }[] = [];

  for (const occurrence of activitiesOnDate(data.activities, date)) {
    if (occurrence.allDay) continue;
    const start = timeToMinutes(occurrence.startTime);
    const end = timeToMinutes(occurrence.endTime);
    if (!occurrence.location || !settings) {
      spans.push({ from: start, to: end < start ? end + 1440 : end });
      continue;
    }
    const departure = computeDeparture(occurrence, settings);
    const back = computeReturn(occurrence, settings);
    spans.push({
      from: departure ? departure.minutes : start,
      to: back ? back.minutes : end < start ? end + 1440 : end,
    });
  }

  // Samenvoegen wat elkaar raakt, zodat er geen schijngaatjes overblijven
  // tussen twee blokken die op elkaar aansluiten.
  spans.sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

/** Wat er overblijft binnen het venster waarin een planner mag voorstellen. */
function freeOnDate(data: AgendaData, date: string): FreeSlot[] {
  const slots: FreeSlot[] = [];
  let cursor = DAY_STARTS;
  for (const span of busyOnDate(data, date)) {
    if (span.to <= cursor) continue;
    if (span.from > cursor) {
      const to = Math.min(span.from, PLAN_UNTIL);
      if (to - cursor >= MIN_GAP) {
        slots.push({ from: minutesToClock(cursor), to: minutesToClock(to), minutes: to - cursor });
      }
    }
    cursor = Math.max(cursor, span.to);
    if (cursor >= PLAN_UNTIL) return slots;
  }
  if (PLAN_UNTIL - cursor >= MIN_GAP) {
    slots.push({
      from: minutesToClock(cursor),
      to: minutesToClock(PLAN_UNTIL),
      minutes: PLAN_UNTIL - cursor,
    });
  }
  return slots;
}

/** De blokken die zouden kunnen wijken; alleen om voor te stellen. */
function movableOnDate(data: AgendaData, date: string): MovableBlock[] {
  return activitiesOnDate(data.activities, date)
    .filter((item) => !item.allDay && !item.location && MOVABLE.includes(item.category))
    .map((item) => ({
      id: item.id,
      title: item.title,
      startTime: item.startTime,
      endTime: item.endTime,
      minutes: activityMinutes(item),
    }));
}

/** Minuten sinds middernacht als kloktijd; loopt netjes over middernacht heen. */
function minutesToClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/** Een datum uit de invoer, of null wanneer hij onbruikbaar is. */
function dateOrNull(value: unknown): string | null {
  return isDateKey(value) ? value : null;
}

/**
 * De agenda over een periode, met de herhalingen al uitgerekend.
 *
 * De planner krijgt dagen, geen reeksen: "elke dinsdag" zegt niets over de
 * dinsdag waarop hij iets wil inplannen. Wat hij hier ziet is wat er die dag
 * werkelijk staat.
 */
export function readAgenda(
  data: AgendaData,
  options: { from?: unknown; to?: unknown } = {},
  now: Date = new Date(),
): ReadResult {
  const today = todayKey(now);
  const from = dateOrNull(options.from) ?? today;
  const requested = dateOrNull(options.to);
  const span = requested ? daysBetween(from, requested) : DEFAULT_DAYS - 1;
  // Een omgekeerde of buitensporige periode is geen reden om niets terug te
  // geven; hem stilletjes rechttrekken levert altijd nog een bruikbaar antwoord.
  const days = Math.min(Math.max(span, 0), MAX_DAYS - 1);
  const to = addDaysToKey(from, days);

  const settings = data.settings;
  const result: ReadDay[] = [];

  for (let i = 0; i <= days; i += 1) {
    const date = addDaysToKey(from, i);
    const occurrences = activitiesOnDate(data.activities, date);
    result.push({
      date,
      weekday: WEEKDAYS[new Date(`${date}T12:00:00`).getDay()],
      free: freeOnDate(data, date),
      movable: movableOnDate(data, date),
      activities: occurrences.map((occurrence) => {
        const entry: ReadActivity = {
          id: occurrence.id,
          title: occurrence.title,
          category: occurrence.category,
          allDay: Boolean(occurrence.allDay),
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
        };
        if (occurrence.location) entry.location = occurrence.location.label;
        // De vertrektijd is geen veld maar een sommetje van rit, marge en
        // begintijd — precies het sommetje dat de app zelf op het scherm zet.
        // Die hier overdoen zou betekenen dat de planner met andere tijden
        // werkt dan wat de gebruiker leest.
        const departure = settings ? computeDeparture(occurrence, settings) : null;
        if (departure) {
          entry.departure = departure.time;
          entry.travelMinutes = departure.travelMinutes;
          if (departure.arrival) entry.arrival = departure.arrival;
          if (departure.late) entry.arrivesLate = true;
        }
        // En de reis terug. Zonder dit weet een planner wel hoe laat je weg
        // moet, maar niet wanneer je weer beschikbaar bent -- en plant hij een
        // leerblok in het uur dat je nog in de trein zit.
        const back = settings ? computeReturn(occurrence, settings) : null;
        if (back) {
          entry.backHome = back.time;
          entry.returnMinutes = back.travelMinutes;
        }
        if (occurrence.source) entry.source = occurrence.source;
        if (occurrence.linkedTaskId) entry.linkedTaskId = occurrence.linkedTaskId;
        if (occurrence.linkedStepId) entry.linkedStepId = occurrence.linkedStepId;
        if (occurrence.linkedExamId) entry.linkedExamId = occurrence.linkedExamId;
        if (occurrence.recurring) entry.recurring = true;
        return entry;
      }),
    });
  }

  return {
    today,
    from,
    to,
    home: settings?.home?.label ?? null,
    defaults: {
      bufferMinutes: settings?.bufferMinutes ?? 10,
      travelMode: settings?.travelMode ?? "car",
    },
    rules: {
      planFrom: minutesToClock(DAY_STARTS),
      planUntil: minutesToClock(PLAN_UNTIL),
      minimumMinutes: MIN_GAP,
      movableCategories: MOVABLE,
      note:
        "Plan alleen in `free`. Staat er te weinig ruimte, stel dan voor om een " +
        "blok uit `movable` te verzetten en wacht op antwoord -- verzet het nooit " +
        "uit jezelf. Alles buiten `movable` ligt vast.",
    },
    days: result,
    // Afgeronde taken zijn ruis voor wie een planning maakt; de toetsen en
    // taken die nog moeten gebeuren zijn precies waar het om draait.
    tasks: data.tasks
      .filter((task) => task.status !== "done")
      .map((task) => {
        // Wat er al staat telt mee: zonder dit plant een planner er elke keer
        // een nieuwe stapel bovenop, want hij ziet niet dat het er al is.
        const plannedMinutes = data.activities
          .filter((item) => item.linkedTaskId === task.id)
          .reduce((sum, item) => sum + activityMinutes(item), 0);
        return {
        id: task.id,
        subject: task.subject,
        title: task.title,
        deadline: task.deadline,
        estimatedMinutes: task.estimatedMinutes,
        plannedMinutes,
        remainingMinutes: Math.max(0, task.estimatedMinutes - plannedMinutes),
        priority: task.priority,
        status: task.status,
        // Met de stappen erbij kan een planning per stap een blok zetten, en
        // weet de planner welke delen al af zijn.
        steps: task.steps?.map((step) => ({
          id: step.id,
          title: step.title,
          estimatedMinutes: step.estimatedMinutes,
          done: step.done,
        })),
        };
      }),
    exams: data.exams
      .filter((exam) => exam.status !== "done" && exam.date >= today)
      .map((exam) => ({
        id: exam.id,
        subject: exam.subject,
        title: exam.title,
        date: exam.date,
        prepMinutes: exam.prepMinutes,
        priority: exam.priority,
        status: exam.status,
        topics: exam.topics,
      })),
  };
}

export interface SaveResult {
  data: AgendaData;
  added: number;
  updated: number;
  /** Wat er is overgeslagen en waarom; leeg wanneer alles klopte. */
  skipped: { index: number; reason: string }[];
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
/**
 * Wanneer je die dag van huis bent, per uitstapje: van het moment dat je
 * vertrekt tot het moment dat je weer binnenstapt.
 *
 * Dit is het venster waarin een blok thuis niet kan bestaan. Precies daar ging
 * het mis: een planner ziet "werken tot 17:00" en zet er om 17:20 een leerblok
 * achter, terwijl de terugreis uit Lelystad bijna een uur duurt.
 */
interface AwaySpan {
  title: string;
  /** Minuten sinds middernacht; kan negatief zijn bij vertrek de dag ervoor. */
  from: number;
  /** Minuten sinds middernacht; kan boven 1440 uitkomen. */
  to: number;
  /** Thuiskomst als kloktijd, voor de uitleg aan de planner. */
  home: string;
}

function awaySpans(data: AgendaData, date: string, exclude?: string): AwaySpan[] {
  const settings = data.settings;
  if (!settings) return [];
  const spans: AwaySpan[] = [];
  for (const occurrence of activitiesOnDate(data.activities, date)) {
    if (occurrence.id === exclude) continue;
    if (!occurrence.location || occurrence.allDay) continue;
    const departure = computeDeparture(occurrence, settings);
    const back = computeReturn(occurrence, settings);
    // Zonder berekende reis blijft het uitstapje zelf over: nog altijd een
    // periode waarin je niet thuis aan je huiswerk zit.
    const from = departure ? departure.minutes : timeToMinutes(occurrence.startTime);
    const to = back ? back.minutes : timeToMinutes(occurrence.endTime);
    spans.push({ title: occurrence.title, from, to, home: back?.time ?? occurrence.endTime });
  }
  return spans;
}

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

export function saveActivities(
  data: AgendaData,
  raw: unknown,
  now: Date = new Date(),
): SaveResult {
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
      const clash = awaySpans(data, normalized.date, normalized.id).find(
        (span) => start < span.to && end > span.from,
      );
      if (clash) {
        skipped.push({
          index,
          reason:
            `je bent dan niet thuis: ${clash.title} loopt tot ${clash.home} ` +
            `inclusief de reis terug`,
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
