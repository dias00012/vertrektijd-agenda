import { activitiesOnDate } from "./agenda";
import { normalizeActivity } from "./backup";
import { addDaysToKey, daysBetween, isDateKey, todayKey } from "./time";
import { computeDeparture } from "./travel";
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
  /** true wanneer je met de gevonden rit ná de begintijd aankomt. */
  arrivesLate?: boolean;
  /** "leerplan" voor blokken die uit een leerplan komen, anders afwezig. */
  source?: string;
  linkedTaskId?: string;
  linkedExamId?: string;
  /** true wanneer deze dag uit een herhalende reeks komt. */
  recurring?: boolean;
}

interface ReadDay {
  date: string;
  weekday: string;
  activities: ReadActivity[];
}

export interface ReadResult {
  today: string;
  from: string;
  to: string;
  /** Thuisadres; zonder dit kan de app geen vertrektijd uitrekenen. */
  home: string | null;
  defaults: { bufferMinutes: number; travelMode: string };
  days: ReadDay[];
  tasks: {
    id: string;
    subject: string;
    title: string;
    deadline: string;
    estimatedMinutes: number;
    priority: string;
    status: string;
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
          if (departure.late) entry.arrivesLate = true;
        }
        if (occurrence.source) entry.source = occurrence.source;
        if (occurrence.linkedTaskId) entry.linkedTaskId = occurrence.linkedTaskId;
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
    days: result,
    // Afgeronde taken zijn ruis voor wie een planning maakt; de toetsen en
    // taken die nog moeten gebeuren zijn precies waar het om draait.
    tasks: data.tasks
      .filter((task) => task.status !== "done")
      .map((task) => ({
        id: task.id,
        subject: task.subject,
        title: task.title,
        deadline: task.deadline,
        estimatedMinutes: task.estimatedMinutes,
        priority: task.priority,
        status: task.status,
      })),
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
    const existing = typeof input.id === "string" ? byId.get(input.id) : undefined;
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
