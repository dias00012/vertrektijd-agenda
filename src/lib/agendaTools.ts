import { activitiesOnDate, clashesOnDate } from "./agenda";
import { occursOn } from "./recurrence";
import { normalizeActivity } from "./backup";
import {
  DAY_STARTS,
  MIN_GAP,
  MOVABLE,
  PLAN_UNTIL,
  awaySpans,
  freeOnDate,
  movableOnDate,
} from "./planning";
import type { FreeSlot, MovableBlock } from "./planning";
import {
  addDaysToKey,
  daysBetween,
  isDateKey,
  minutesToTime,
  timeToMinutes,
  todayKey,
} from "./time";
import { bufferFor, computeDeparture, computeReturn, travelMinutesEither } from "./travel";
import { activityMinutes, statusAfterSteps } from "./schoolwork";
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
  /**
   * true wanneer `departure` een schatting is: de heenreis was nog niet
   * berekend, dus is de thuisreis aangehouden.
   *
   * Dit ontbrak, en dat was geen detail. Zonder heenreis stond er gewoon géén
   * vertrektijd in dit antwoord -- geen "onbekend", maar stilte. En stilte
   * vult een planner in met iets plausibels. Vandaar deze twee velden: liever
   * een schatting die zichzelf zo noemt, of een eerlijk "ik weet het niet".
   */
  departureEstimated?: boolean;
  /** true wanneer de app geen enkele reistijd voor dit blok kent. */
  travelUnknown?: boolean;
  /** Waarom de reis niet uitgerekend kon worden; alleen als de app dat weet. */
  travelNote?: string;
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
  /**
   * true wanneer `backHome` een schatting is: de app had de thuisreis nog niet
   * berekend, dus is de heenreis aangehouden. Goed genoeg om op te plannen,
   * niet goed genoeg om op te zweren.
   */
  backHomeEstimated?: boolean;
  /** "leerplan" voor blokken die uit een leerplan komen, anders afwezig. */
  source?: string;
  linkedTaskId?: string;
  /** De stap binnen die taak waar dit blok voor is. */
  linkedStepId?: string;
  linkedExamId?: string;
  /** true wanneer deze dag uit een herhalende reeks komt. */
  recurring?: boolean;
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
  /** Wat er die dag botst: op de klok, of alleen via de reistijd. */
  clashes: ReadClash[];
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
  /**
   * Wat er dubbel lijkt te staan. Alleen een signaal: noem het, ruim het niet
   * zelf op. Welke van de twee weg mag is aan de gebruiker.
   */
  duplicates: Duplicate[];
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
 * Twee dingen die hetzelfde lijken.
 *
 * Bewust alleen een signaal, nooit een handeling: "Lezen" naast "Lezen (voor
 * het slapen)" kan een vergissing zijn of precies de bedoeling, en dat weet
 * alleen de gebruiker. Opruimen is een besluit, geen berekening.
 */
interface Duplicate {
  kind: "taak" | "activiteit";
  titles: [string, string];
  ids: [string, string];
  /** Waar het op lijkt: dezelfde dag, dezelfde deadline. */
  note: string;
}

/** Een botsing zoals de app hem op je scherm ook laat zien. */
interface ReadClash {
  between: [string, string];
  /** true wanneer alleen de reistijd eroverheen valt; de klok lijkt dan te kloppen. */
  travelOnly: boolean;
  note: string;
}

/** Kale woorden van een titel, zonder leestekens en emoji. */
function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean),
  );
}

/**
 * Lijken deze twee titels op hetzelfde?
 *
 * Gemeten aan de kortste van de twee: staat het grootste deel van de woorden
 * daarvan ook in de andere, dan is het waarschijnlijk hetzelfde werk onder een
 * andere naam. "Excel week 2 - H2 Afronden" naast "Excel week 2 - H2 (Opdracht
 * 2.5 en 2.6)" haalt die drempel; "BE week 3 - H5" naast "Excel week 3 - H3"
 * niet.
 */
function looksTheSame(a: string, b: string): boolean {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return false;
  const [shorter, longer] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const word of shorter) if (longer.has(word)) shared += 1;
  // Zeventig procent en niet zestig: bij zestig gingen "BE week 4 - H4 + H5
  // opgaven + Casus deel 1" en "Excel week 4 - H5 Grafieken" voor hetzelfde
  // door, alleen omdat ze "week", "4" en "h5" delen. Een valse melding is hier
  // duurder dan een gemiste: hij zet je aan het twijfelen over werk dat klopt.
  return shared / shorter.size >= 0.7;
}

/** Wat er dubbel lijkt te staan: opdrachten en blokken op dezelfde dag. */
function findDuplicates(data: AgendaData, from: string, to: string): Duplicate[] {
  const found: Duplicate[] = [];

  const open = data.tasks.filter((task) => task.status !== "done");
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      const a = open[i];
      const b = open[j];
      if (a.subject !== b.subject || a.deadline !== b.deadline) continue;
      if (!looksTheSame(a.title, b.title)) continue;
      found.push({
        kind: "taak",
        titles: [a.title, b.title],
        ids: [a.id, b.id],
        note: `zelfde vak en zelfde deadline (${a.deadline})`,
      });
    }
  }

  // Blokken vergelijken we per dag: twee keer hetzelfde op één dag valt op,
  // twee keer op verschillende dagen is gewoon een gewoonte.
  const perDay = new Map<string, Set<string>>();
  for (const activity of data.activities) {
    if (activity.date < from || activity.date > to) continue;
    const day = perDay.get(activity.date) ?? new Set<string>();
    day.add(activity.id);
    perDay.set(activity.date, day);
  }
  const seen = new Set<string>();
  for (const [date, ids] of perDay) {
    const items = data.activities.filter((item) => ids.has(item.id));
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (!looksTheSame(a.title, b.title)) continue;
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          kind: "activiteit",
          titles: [a.title, b.title],
          ids: [a.id, b.id],
          note: `staan allebei op ${date}`,
        });
      }
    }
  }

  return found;
}

/** De botsingen van één dag, ontdubbeld tot één regel per paar. */
function clashesForDay(data: AgendaData, date: string): ReadClash[] {
  const settings = data.settings;
  if (!settings) return [];
  const map = clashesOnDate(data.activities, settings, date);
  if (map.size === 0) return [];
  const seen = new Set<string>();
  const out: ReadClash[] = [];
  for (const occurrence of activitiesOnDate(data.activities, date)) {
    for (const clash of map.get(occurrence.occurrenceId) ?? []) {
      const key = [occurrence.id, clash.other.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        between: [occurrence.title, clash.other.title],
        travelOnly: clash.travelOnly,
        note: clash.travelOnly
          ? "de reis naar de een valt over de ander heen"
          : "ze overlappen op de klok",
      });
    }
  }
  return out;
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
      free: freeOnDate(data.activities, settings, date),
      movable: movableOnDate(data.activities, date),
      clashes: clashesForDay(data, date),
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
        // Hoort er hier überhaupt een heenreis bij? Zit je er al, of kom je van
        // een andere plek, dan is er niets te vertrekken -- dat is geen
        // ontbrekende reistijd maar een reis die ergens anders staat.
        const heenreisHoortErbij =
          Boolean(occurrence.location) &&
          !occurrence.allDay &&
          occurrence.travelRole.outbound &&
          !occurrence.travelRole.arrivesFrom;

        if (!departure && heenreisHoortErbij && settings) {
          // Geen berekende heenreis. Dan de thuisreis aanhouden, met een vlag
          // erbij -- precies zoals het andersom al ging.
          const geschat = occurrence.returnTravel?.durationMinutes;
          if (geschat) {
            const minutes =
              timeToMinutes(occurrence.startTime) - geschat - bufferFor(occurrence, settings);
            entry.departure = minutesToTime(minutes);
            entry.travelMinutes = geschat;
            entry.departureEstimated = true;
          }
        }

        const back = settings ? computeReturn(occurrence, settings) : null;
        if (back) {
          entry.backHome = back.time;
          entry.returnMinutes = back.travelMinutes;
        } else if (occurrence.location && !occurrence.allDay) {
          // Nog geen berekende thuisreis. Zwijgen zou betekenen dat de eindtijd
          // als thuiskomst geldt, en dat is de fout waar het om begonnen was.
          // Dan liever de andere kant als schatting, met een vlag erbij.
          const geschat = travelMinutesEither(occurrence, "back");
          if (geschat > 0) {
            const minutes = timeToMinutes(occurrence.endTime) + geschat;
            entry.backHome = minutesToTime(minutes);
            entry.returnMinutes = geschat;
            entry.backHomeEstimated = true;
          }
        }

        // Niets bekend, en er hoort wel een reis bij: dat moet er met zoveel
        // woorden staan. Anders ziet dit blok eruit als iets om de hoek.
        if (
          occurrence.location &&
          !occurrence.allDay &&
          entry.travelMinutes === undefined &&
          entry.returnMinutes === undefined
        ) {
          entry.travelUnknown = true;
          if (occurrence.travelError) entry.travelNote = occurrence.travelError;
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
      planFrom: minutesToTime(DAY_STARTS),
      planUntil: minutesToTime(PLAN_UNTIL),
      minimumMinutes: MIN_GAP,
      movableCategories: MOVABLE,
      note:
        "Plan alleen in `free`. Staat er te weinig ruimte, stel dan voor om een " +
        "blok uit `movable` te verzetten en wacht op antwoord -- verzet het nooit " +
        "uit jezelf. Alles buiten `movable` ligt vast. Staat er `recurring: true` " +
        "bij, dan kan alleen díe ene dag eruit met `skip_occurrence` of naar een " +
        "ander tijdstip met `move_occurrence`; de rest van de reeks blijft dan " +
        "staan. Staat er `away: true` bij, dan hangt er een plek aan en verandert " +
        "ook de reis. Vraag het altijd eerst.",
    },
    days: result,
    duplicates: findDuplicates(data, from, to),
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
