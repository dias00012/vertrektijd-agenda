import type { Activity, ActivityOccurrence, Settings, TravelRole } from "./types";
import {
  computeDeparture,
  computeOnward,
  computeReturn,
  departureDateTime,
  nextOccurrenceDate,
  type OnwardInfo,
} from "./travel";
import { addDaysToKey, MINUTES_PER_DAY, timeToMinutes, toDateKey, toDateTime } from "./time";
import { lastOccurrenceDate, occurrencesOnDate, toOccurrence } from "./recurrence";
import { assignTravelRoles } from "./stays";

/**
 * Activiteiten van één dag (herhalingen meegerekend), op starttijd gesorteerd.
 *
 * Meteen met de reisrollen erbij: pas als je de hele dag ziet, weet je of een
 * activiteit het begin van een verblijf is, het eind, of een uur ertussenin.
 */
export function activitiesOnDate(activities: Activity[], dateKey: string): ActivityOccurrence[] {
  return assignTravelRoles(
    occurrencesOnDate(activities, dateKey).sort((a, b) => {
      // Wat de hele dag duurt staat bovenaan: dat is de context waarbinnen de
      // rest van je dag valt, geen moment op de klok.
      if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    }),
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
  const role = dayRoleFor(activity, activities, now);
  if (!activity.location) return false;
  if (!role) return true;
  return role.outbound || role.inbound;
}

/**
 * De reisrol van deze activiteit op de eerstvolgende dag dat hij plaatsvindt.
 * `null` wanneer die dag niets oplevert; dan telt de activiteit als losstaand.
 */
export function dayRoleFor(
  activity: Activity,
  activities: Activity[],
  now: Date = new Date(),
): TravelRole | null {
  const day = activitiesOnDate(activities, nextOccurrenceDate(activity, now));
  return day.find((item) => item.id === activity.id)?.travelRole ?? null;
}

/** Activiteiten binnen een reeks dagen, gegroepeerd per dag. */
export function groupByDate(
  activities: Activity[],
  dateKeys: string[],
): { dateKey: string; items: ActivityOccurrence[] }[] {
  return dateKeys.map((dateKey) => ({ dateKey, items: activitiesOnDate(activities, dateKey) }));
}

/**
 * De dag die je in een zoekresultaat wilt zien.
 *
 * Normaal de eerstvolgende keer. Is de reeks al afgelopen, dan is de vraag
 * "wanneer was dat ook alweer" en hoort daar de laatste keer bij —
 * `nextOccurrenceDate` valt in dat geval terug op de startdatum, en dan wees
 * een practicum dat in juni ophield naar februari.
 */
function searchDateFor(activity: Activity, now: Date): string {
  const next = nextOccurrenceDate(activity, now);
  if (next >= toDateKey(now)) return next;
  return lastOccurrenceDate(activity, toDateKey(now)) ?? next;
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
      const dateKey = searchDateFor(activity, now);
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

export type TimelineKind = "departure" | "activity" | "return" | "onward";

export interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  time: string;
  minutes: number;
  activity: ActivityOccurrence;
  /** Alleen bij kind "return": de reistijd terug naar huis in minuten. */
  returnMinutes?: number;
  /**
   * Alleen bij kind "return": hoe laat je thuis bent, in minuten sinds
   * middernacht. Bewust apart van "eindtijd plus reistijd": bij OV vertrekt je
   * bus niet op het moment dat je les uit is. Zonder dit stond op hetzelfde
   * scherm twee keer een andere thuiskomst — de kaart rekende met de echte
   * rit, het dagoverzicht met de optelsom.
   */
  homeMinutes?: number;
  /** Alleen bij kind "onward": waar je rechtstreeks heen gaat. */
  onward?: OnwardInfo;
  /** Alleen bij kind "departure": true wanneer je hiermee te laat aankomt. */
  late?: boolean;
  /** Alleen bij kind "departure": hoe laat je dan aankomt (HH:mm). */
  lateArrival?: string;
}

/** Volgorde op hetzelfde tijdstip: eerst vertrekken, dan de activiteit, dan terug. */
const KIND_ORDER: Record<TimelineKind, number> = {
  departure: 0,
  activity: 1,
  return: 2,
  onward: 2,
};

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
  const day = activitiesOnDate(activities, dateKey);

  for (const [index, activity] of day.entries()) {
    const departure = computeDeparture(activity, settings);
    // Een vertrek dat op de vorige dag valt hoort niet in dit dagoverzicht.
    if (departure && !departure.previousDay) {
      entries.push({
        kind: "departure",
        id: `${activity.occurrenceId}:departure`,
        time: departure.time,
        minutes: departure.minutes,
        activity,
        late: departure.late,
        lateArrival: departure.arrival,
      });
    }
    entries.push({
      kind: "activity",
      id: activity.occurrenceId,
      time: activity.startTime,
      minutes: timeToMinutes(activity.startTime),
      activity,
    });

    // Ga je rechtstreeks door, dan is dat één regel in plaats van thuiskomen
    // en daarna weer vertrekken.
    const next = nextOnDirectRoute(day, index);
    const onward = computeOnward(activity, next?.startTime ?? null);
    if (onward) {
      entries.push({
        kind: "onward",
        id: `${activity.occurrenceId}:onward`,
        time: onward.time,
        minutes: timeToMinutes(onward.time),
        activity,
        onward,
      });
    }

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
        homeMinutes: back.minutes,
      });
    }
  }

  return entries.sort(
    (a, b) => a.minutes - b.minutes || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}

/**
 * Hoe ver vooruit we zoeken naar de eerstvolgende activiteit.
 *
 * Ruim twee maanden, want een maandelijkse reeks kan verder weg liggen dan drie
 * weken: staat er iets op de 31e, dan is de eerstvolgende keer na januari pas
 * in maart. Met een kortere blik zei de kaart "niets gepland" terwijl er wel
 * degelijk iets stond.
 */
const LOOKAHEAD_DAYS = 62;

/**
 * De eerstvolgende activiteit die nog niet is afgelopen. Kijkt twee maanden
 * vooruit, zodat ook een herhalende reeks de juiste eerstvolgende dag oplevert.
 */
export function findNextActivity(
  activities: Activity[],
  settings: Settings,
  now: Date,
): ActivityOccurrence | null {
  const today = toDateKey(now);
  // Bewust settings meegenomen: later kan hier voorrang gegeven worden aan de
  // activiteit waarvoor je als eerste moet vertrekken.
  void settings;

  /** Een hele dag telt pas mee als er verder niets staat; zie hieronder. */
  let allDayFallback: ActivityOccurrence | null = null;

  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const dateKey = addDaysToKey(today, offset);
    const upcoming = activitiesOnDate(activities, dateKey).filter(
      (activity) => toDateTime(activity.date, activity.endTime).getTime() > now.getTime(),
    );

    // Iets dat de hele dag duurt ("Herfstvakantie") staat in het dagoverzicht
    // bovenaan als context, maar heeft geen tijdstip en dus geen vertrektijd.
    // Als antwoord op "waar moet ik straks heen" verdrong het de afspraak
    // eronder — precies de vraag waar deze app voor is.
    const timed = upcoming.find((activity) => !activity.allDay);
    if (timed) return timed;
    if (!allDayFallback && upcoming[0]) allDayFallback = upcoming[0];
  }

  return allDayFallback;
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
  const t = now.getTime();
  if (t >= endOfOccurrence(occurrence)) return "past";
  if (t >= start) return "now";
  return "upcoming";
}

/**
 * Het moment waarop deze activiteit klaar is.
 *
 * Loopt hij over middernacht heen — een nachtdienst van 23:00 tot 01:00 — dan
 * ligt de eindtijd op de kalender vóór de begintijd. Wie dat letterlijk neemt,
 * noemt zo'n dienst de hele dag "geweest": om negen uur 's ochtends stond je
 * nachtdienst al afgevinkt in je agenda.
 */
function endOfOccurrence(occurrence: ActivityOccurrence): number {
  const start = toDateTime(occurrence.date, occurrence.startTime).getTime();
  const end = toDateTime(occurrence.date, occurrence.endTime).getTime();
  return end < start ? end + MINUTES_PER_DAY * 60_000 : end;
}

/**
 * De activiteit waar je na deze rechtstreeks heen reist.
 *
 * Eén regel, op één plek, want hij bepaalt of er "je komt te laat" bij komt te
 * staan. Stond die regel in het dagoverzicht wel en op de kaart niet, dan zeiden
 * twee schermen iets anders over dezelfde dag.
 */
function nextOnDirectRoute(
  day: ActivityOccurrence[],
  index: number,
): ActivityOccurrence | undefined {
  return day.slice(index + 1).find((item) => item.travelRole.arrivesFrom);
}

/** Waar je na deze activiteit rechtstreeks heen gaat, of null. */
export function onwardTarget(
  occurrence: ActivityOccurrence,
  activities: Activity[],
): ActivityOccurrence | null {
  const day = activitiesOnDate(activities, occurrence.date);
  const index = day.findIndex((item) => item.occurrenceId === occurrence.occurrenceId);
  if (index === -1) return null;
  return nextOnDirectRoute(day, index) ?? null;
}

/* --- Wat er tegelijk staat ---------------------------------------------- */

/** Eén botsing: met welke activiteit, en of alleen je reistijd eroverheen valt. */
export interface Clash {
  other: ActivityOccurrence;
  /**
   * true wanneer de activiteiten zelf niet overlappen, maar je reis ernaartoe
   * of ervandaan wel over de andere heen valt. Dat is een ander probleem: je
   * bent niet op twee plekken tegelijk, je moet weg terwijl je nog ergens zit.
   */
  travelOnly: boolean;
}

/** Begin en eind in minuten, waarbij een blok over middernacht doorloopt. */
function span(occurrence: ActivityOccurrence): { from: number; to: number } {
  const from = timeToMinutes(occurrence.startTime);
  const to = timeToMinutes(occurrence.endTime);
  return { from, to: to < from ? to + MINUTES_PER_DAY : to };
}

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to;
}

/**
 * Wat er op deze dag tegelijk staat.
 *
 * Je agenda wordt niet alleen door jou gevuld: een leerplan, een gekoppeld
 * rooster en een geabonneerde agenda schrijven er alle drie in. Twee dingen op
 * hetzelfde moment zie je in het weekraster wel naast elkaar staan, maar in een
 * lijst valt het niet op — en juist dan kom je er pas achter als je er al zit.
 *
 * Twee soorten botsing, want het zijn twee verschillende problemen:
 *
 *  - de activiteiten zelf overlappen: je moet op twee plekken tegelijk zijn;
 *  - alleen je reistijd valt eroverheen: je moet vertrekken terwijl het andere
 *    nog bezig is. Dat is de stille variant, want op de klok lijkt er niets aan
 *    de hand.
 *
 * Activiteiten die de hele dag duren tellen niet mee: "herfstvakantie" botst
 * met niets. Aansluitend is geen botsing — om 15:00 uit en om 15:00 verder is
 * precies wat een schooldag doet.
 */
export function clashesOnDate(
  activities: Activity[],
  settings: Settings,
  dateKey: string,
): Map<string, Clash[]> {
  const items = activitiesOnDate(activities, dateKey)
    .filter((occurrence) => !occurrence.allDay)
    .map((occurrence) => {
      const own = span(occurrence);
      const departure = computeDeparture(occurrence, settings);
      const back = computeReturn(occurrence, settings);
      const onward = computeOnward(occurrence, null);
      // Vertrekken kan op de vorige dag vallen en thuiskomen op de volgende;
      // dan houdt de dag zelf de grens vast in plaats van een tijd van gisteren.
      const from = departure && !departure.previousDay ? Math.min(departure.minutes, own.from) : own.from;
      const until = back?.nextDay
        ? own.to + MINUTES_PER_DAY
        : Math.max(own.to, back?.minutes ?? own.to, onward ? timeToMinutes(onward.arrival) : own.to);
      return { occurrence, own, busy: { from, to: until } };
    });

  const clashes = new Map<string, Clash[]>();
  const add = (id: string, clash: Clash) => {
    const list = clashes.get(id);
    if (list) list.push(clash);
    else clashes.set(id, [clash]);
  };

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const together = overlaps(a.own, b.own);
      // Alleen de reis van de een over de ander: dan hoort de waarschuwing bij
      // degene die moet reizen, want daar is er iets te kiezen.
      const travelA = !together && overlaps(a.busy, b.own);
      const travelB = !together && overlaps(b.busy, a.own);
      if (!together && !travelA && !travelB) continue;

      if (together || travelA) add(a.occurrence.occurrenceId, { other: b.occurrence, travelOnly: !together });
      if (together || travelB) add(b.occurrence.occurrenceId, { other: a.occurrence, travelOnly: !together });
    }
  }

  return clashes;
}

/** De botsingen van één activiteit; leeg als er niets tegelijk staat. */
export function clashesFor(
  occurrence: ActivityOccurrence,
  activities: Activity[],
  settings: Settings,
): Clash[] {
  return clashesOnDate(activities, settings, occurrence.date).get(occurrence.occurrenceId) ?? [];
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
  const items = activitiesOnDate(activities, dateKey)
    .filter((occurrence) => !occurrence.allDay)
    .map((occurrence) => {
    const departure = computeDeparture(occurrence, settings);
    const back = computeReturn(occurrence, settings);
    // Reis je door naar de volgende plek, dan loopt het reisblok tot je
    // aankomst daar in plaats van tot je thuiskomst.
    const onward = computeOnward(occurrence, null);
    return {
      occurrence,
      startMinutes: timeToMinutes(occurrence.startTime),
      endMinutes: timeToMinutes(occurrence.endTime),
      departureMinutes: departure && !departure.previousDay ? departure.minutes : null,
      returnMinutes: back && !back.nextDay ? back.minutes : onward ? timeToMinutes(onward.arrival) : null,
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
      // Ook de starttijd zelf telt mee, niet alleen het eind. Bij een dienst
      // van 23:00 tot 01:00 ligt het eind (01:00) vóór het begin, en dan bleef
      // het raster gewoon bij 01:00 staan: het blok werd wél getekend, maar op
      // 23:00 — buiten het zichtbare deel. Je nachtdienst stond dus nergens.
      latest = Math.max(latest, item.returnMinutes ?? item.endMinutes, item.startMinutes);
    }
  }

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return DEFAULT_RANGE;

  return {
    start: Math.max(0, Math.floor(earliest / 60) * 60 - 60),
    end: Math.min(24 * 60, Math.ceil(latest / 60) * 60 + 60),
  };
}
