import type { Activity, ActivityOccurrence, Settings } from "./types";
import { computeDeparture, computeReturn, departureDateTime, nextOccurrenceDate } from "./travel";
import { addDaysToKey, timeToMinutes, toDateKey, toDateTime } from "./time";
import { occurrencesOnDate, toOccurrence } from "./recurrence";
import { assignTravelRoles } from "./stays";

/**
 * Activiteiten van één dag (herhalingen meegerekend), op starttijd gesorteerd.
 *
 * Meteen met de reisrollen erbij: pas als je de hele dag ziet, weet je of een
 * activiteit het begin van een verblijf is, het eind, of een uur ertussenin.
 */
export function activitiesOnDate(activities: Activity[], dateKey: string): ActivityOccurrence[] {
  return assignTravelRoles(
    occurrencesOnDate(activities, dateKey).sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    ),
  );
}

/**
 * Moet er voor deze activiteit een reis berekend worden?
 *
 * Voor de uren midden in een verblijf niet: je bent er al. Dat scheelt bij een
 * gekoppeld rooster tientallen routeaanvragen per week.
 */
export function travelIsRelevant(
  activity: Activity,
  activities: Activity[],
  now: Date = new Date(),
): boolean {
  if (!activity.location) return false;
  const day = activitiesOnDate(activities, nextOccurrenceDate(activity, now));
  const mine = day.find((item) => item.id === activity.id);
  if (!mine) return true;
  return mine.travelRole.outbound || mine.travelRole.inbound;
}

/** Activiteiten binnen een reeks dagen, gegroepeerd per dag. */
export function groupByDate(
  activities: Activity[],
  dateKeys: string[],
): { dateKey: string; items: ActivityOccurrence[] }[] {
  return dateKeys.map((dateKey) => ({ dateKey, items: activitiesOnDate(activities, dateKey) }));
}

/**
 * Zoeken in je agenda.
 *
 * Zoekt in de reeks, niet in losse dagen: een wekelijks college is één
 * resultaat en niet honderd. Van een herhaling tonen we de eerstvolgende keer,
 * want daar gaat je vraag bijna altijd over.
 *
 * `categoryLabel` komt van buiten omdat eigen types alleen de app zelf kent;
 * zo kun je ook op "werk" of "bijbaan" zoeken.
 */
export function searchActivities(
  activities: Activity[],
  query: string,
  now: Date,
  categoryLabel: (id: string) => string,
): ActivityOccurrence[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const today = toDateKey(now);
  /** Dagen die we al uitgerekend hebben; een reeks treffers deelt vaak een dag. */
  const days = new Map<string, ActivityOccurrence[]>();

  return activities
    .filter((activity) =>
      [activity.title, activity.location?.label ?? "", categoryLabel(activity.category)].some(
        (field) => field.toLowerCase().includes(needle),
      ),
    )
    .map((activity) => {
      // Via de dag zelf, zodat een resultaat dezelfde reisrol krijgt als in de
      // agenda: geen "vertrekken om" bij een uur midden op een schooldag.
      const dateKey = nextOccurrenceDate(activity, now);
      const day = days.get(dateKey) ?? activitiesOnDate(activities, dateKey);
      days.set(dateKey, day);
      return day.find((item) => item.id === activity.id) ?? toOccurrence(activity, dateKey);
    })
    .sort((a, b) => {
      // Wat nog komt eerst, oplopend; daarna wat geweest is, met het meest
      // recente bovenaan. Zo staat het antwoord op "wanneer is dat ook alweer"
      // altijd boven.
      const aPast = a.date < today;
      const bPast = b.date < today;
      if (aPast !== bPast) return aPast ? 1 : -1;
      if (a.date !== b.date) return aPast ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
}

export type TimelineKind = "departure" | "activity" | "return";

export interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  time: string;
  minutes: number;
  activity: ActivityOccurrence;
  /** Alleen bij kind "return": de reistijd terug naar huis in minuten. */
  returnMinutes?: number;
}

/** Volgorde op hetzelfde tijdstip: eerst vertrekken, dan de activiteit, dan terug. */
const KIND_ORDER: Record<TimelineKind, number> = { departure: 0, activity: 1, return: 2 };

/**
 * Dagoverzicht waarin vertrekmomenten als eigen regel tussen de activiteiten
 * staan, chronologisch gesorteerd. Dit is de kern van het dashboard:
 * "wat moet ik doen en wanneer moet ik vertrekken?".
 */
export function buildTimeline(
  activities: Activity[],
  settings: Settings,
  dateKey: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const activity of activitiesOnDate(activities, dateKey)) {
    const departure = computeDeparture(activity, settings);
    // Een vertrek dat op de vorige dag valt hoort niet in dit dagoverzicht.
    if (departure && !departure.previousDay) {
      entries.push({
        kind: "departure",
        id: `${activity.occurrenceId}:departure`,
        time: departure.time,
        minutes: departure.minutes,
        activity,
      });
    }
    entries.push({
      kind: "activity",
      id: activity.occurrenceId,
      time: activity.startTime,
      minutes: timeToMinutes(activity.startTime),
      activity,
    });

    const back = computeReturn(activity, settings);
    // Ben je pas na middernacht thuis, dan hoort dat niet meer in deze dag.
    if (back && !back.nextDay) {
      entries.push({
        kind: "return",
        id: `${activity.occurrenceId}:return`,
        time: activity.endTime,
        minutes: timeToMinutes(activity.endTime),
        activity,
        returnMinutes: back.travelMinutes,
      });
    }
  }

  return entries.sort(
    (a, b) => a.minutes - b.minutes || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}

/** Hoe ver vooruit we zoeken naar de eerstvolgende activiteit. */
const LOOKAHEAD_DAYS = 21;

/**
 * De eerstvolgende activiteit die nog niet is afgelopen. Kijkt een aantal weken
 * vooruit, zodat ook een herhalende reeks de juiste eerstvolgende dag oplevert.
 */
export function findNextActivity(
  activities: Activity[],
  settings: Settings,
  now: Date,
): ActivityOccurrence | null {
  const today = toDateKey(now);

  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const dateKey = addDaysToKey(today, offset);
    const upcoming = activitiesOnDate(activities, dateKey).filter(
      (activity) => toDateTime(activity.date, activity.endTime).getTime() > now.getTime(),
    );
    // Bewust settings meegenomen: later kan hier voorrang gegeven worden aan de
    // activiteit waarvoor je als eerste moet vertrekken.
    void settings;
    if (upcoming[0]) return upcoming[0];
  }

  return null;
}

/** Minuten tot vertrek; negatief betekent dat je al had moeten gaan. */
export function minutesUntilDeparture(
  activity: ActivityOccurrence,
  settings: Settings,
  now: Date,
): number | null {
  const departure = departureDateTime(activity, settings);
  if (!departure) return null;
  return Math.round((departure.getTime() - now.getTime()) / 60_000);
}

/**
 * Waar staat een activiteit-dag t.o.v. nu?
 * - "past": helemaal afgelopen (eindtijd voorbij)
 * - "now": bezig (gestart, nog niet afgelopen)
 * - "upcoming": moet nog beginnen
 * Alleen zinvol op de dag zelf; voor andere dagen altijd "upcoming".
 */
export type TimeStatus = "past" | "now" | "upcoming";

export function timeStatusFor(occurrence: ActivityOccurrence, now: Date): TimeStatus {
  const start = toDateTime(occurrence.date, occurrence.startTime).getTime();
  const end = toDateTime(occurrence.date, occurrence.endTime).getTime();
  const t = now.getTime();
  if (t >= end) return "past";
  if (t >= start) return "now";
  return "upcoming";
}

/* --- Positionering voor het weekraster --------------------------------- */

export interface PositionedActivity {
  occurrence: ActivityOccurrence;
  /** Minuten sinds middernacht. */
  startMinutes: number;
  endMinutes: number;
  /** Vertrekmoment, of null zonder reis of wanneer dat op de vorige dag valt. */
  departureMinutes: number | null;
  /** Moment van thuiskomst, of null zonder terugreis of pas na middernacht. */
  returnMinutes: number | null;
  /** Kolom binnen een groep overlappende activiteiten. */
  lane: number;
  /** Aantal kolommen in die groep. */
  lanes: number;
}

/**
 * Legt de activiteiten van één dag naast elkaar wanneer ze overlappen.
 * De reistijd telt mee als aanloop, zodat een vertrekblok nooit over een
 * andere activiteit heen valt.
 */
export function layoutDay(
  activities: Activity[],
  settings: Settings,
  dateKey: string,
): PositionedActivity[] {
  const items = activitiesOnDate(activities, dateKey).map((occurrence) => {
    const departure = computeDeparture(occurrence, settings);
    const back = computeReturn(occurrence, settings);
    return {
      occurrence,
      startMinutes: timeToMinutes(occurrence.startTime),
      endMinutes: timeToMinutes(occurrence.endTime),
      departureMinutes: departure && !departure.previousDay ? departure.minutes : null,
      returnMinutes: back && !back.nextDay ? back.minutes : null,
    };
  });

  // Sorteren op het moment waarop de activiteit ruimte gaat innemen.
  const sorted = [...items].sort(
    (a, b) =>
      (a.departureMinutes ?? a.startMinutes) - (b.departureMinutes ?? b.startMinutes) ||
      a.endMinutes - b.endMinutes,
  );

  const positioned: PositionedActivity[] = [];
  let cluster: PositionedActivity[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  function flushCluster() {
    for (const entry of cluster) {
      entry.lanes = laneEnds.length;
      positioned.push(entry);
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  }

  for (const item of sorted) {
    const from = item.departureMinutes ?? item.startMinutes;
    const until = item.returnMinutes ?? item.endMinutes;

    // Geen overlap meer met de vorige groep? Dan begint een nieuwe groep.
    if (cluster.length > 0 && from >= clusterEnd) flushCluster();

    let lane = laneEnds.findIndex((end) => end <= from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = until;
    clusterEnd = Math.max(clusterEnd, until);
    cluster.push({ ...item, lane, lanes: 1 });
  }
  if (cluster.length > 0) flushCluster();

  return positioned;
}

/** Standaardvenster van het raster wanneer er niets gepland staat. */
const DEFAULT_RANGE = { start: 7 * 60, end: 22 * 60 };

/**
 * Het tijdvenster dat het raster moet tonen: ruim genoeg voor alles wat er
 * staat, met een uur lucht erboven en eronder.
 */
export function timeRangeFor(days: PositionedActivity[][]): { start: number; end: number } {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;

  for (const day of days) {
    for (const item of day) {
      earliest = Math.min(earliest, item.departureMinutes ?? item.startMinutes);
      latest = Math.max(latest, item.returnMinutes ?? item.endMinutes);
    }
  }

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return DEFAULT_RANGE;

  return {
    start: Math.max(0, Math.floor(earliest / 60) * 60 - 60),
    end: Math.min(24 * 60, Math.ceil(latest / 60) * 60 + 60),
  };
}
