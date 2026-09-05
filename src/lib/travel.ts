import type { Activity, GeoLocation, Settings, TravelMode } from "./types";
import {
  MINUTES_PER_DAY,
  addDaysToKey,
  minutesToTime,
  timeToMinutes,
  toDateKey,
  toDateTime,
} from "./time";
import { occursOn } from "./recurrence";

/** Het vervoermiddel voor deze activiteit: eigen keuze, anders de standaard. */
export function travelModeFor(activity: Activity, settings: Settings): TravelMode {
  return activity.travelMode ?? settings.travelMode;
}

/**
 * Sleutel waarmee we bepalen of een opgeslagen reis nog geldig is. Bij OV hoort
 * het tijdstip erbij: een andere dag of tijd betekent een andere dienstregeling.
 */
export function travelKey(
  home: GeoLocation | null,
  destination: GeoLocation | null,
  mode: TravelMode,
  timeSlot?: string | null,
): string | null {
  if (!home || !destination) return null;
  const round = (n: number) => n.toFixed(5);
  const slot = mode === "transit" && timeSlot ? `@${timeSlot}` : "";
  return `${round(home.lat)},${round(home.lon)}>${round(destination.lat)},${round(destination.lon)}@${mode}${slot}`;
}

/** Hoe ver vooruit we zoeken naar de eerstvolgende dag van een reeks. */
const OCCURRENCE_LOOKAHEAD_DAYS = 60;

/**
 * De eerstvolgende dag waarop deze activiteit plaatsvindt, vanaf vandaag.
 * Voor een eenmalige activiteit is dat gewoon zijn eigen datum. Bij OV plannen
 * we op die dag, zodat de dienstregeling klopt.
 */
export function nextOccurrenceDate(activity: Activity, now: Date = new Date()): string {
  if (!activity.recurrence) return activity.date;

  const today = toDateKey(now);
  for (let offset = 0; offset <= OCCURRENCE_LOOKAHEAD_DAYS; offset += 1) {
    const dateKey = addDaysToKey(today, offset);
    if (occursOn(activity, dateKey)) return dateKey;
  }
  return activity.date;
}

export function bufferFor(activity: Activity, settings: Settings): number {
  return activity.bufferMinutes ?? settings.bufferMinutes;
}

/**
 * Alles wat nodig is om de reis van een activiteit op te halen: het
 * vervoermiddel, de sleutels voor heen en terug en (bij OV) de tijdstippen.
 */
export interface TravelPlan {
  mode: TravelMode;
  outboundKey: string;
  returnKey: string;
  /** Uiterlijke aankomst voor de heenreis (ISO); alleen bij OV. */
  arriveBy?: string;
  /** Vroegste vertrek voor de terugreis (ISO); alleen bij OV. */
  departAt?: string;
}

export function travelPlanFor(
  activity: Activity,
  settings: Settings,
  now: Date = new Date(),
): TravelPlan | null {
  return travelPlanForDate(activity, settings, nextOccurrenceDate(activity, now));
}

/**
 * Dezelfde reis, maar voor één specifieke dag. Bij een herhalende activiteit
 * rijdt er op dinsdag een andere trein dan op maandag, dus de dag hoort bij de
 * berekening — anders staat er een vertrektijd die op die dag niet klopt.
 */
export function travelPlanForDate(
  activity: Activity,
  settings: Settings,
  dateKey: string,
): TravelPlan | null {
  if (!settings.home || !activity.location) return null;

  const mode = travelModeFor(activity, settings);

  // Bij OV rekenen we met echte ritten: heen "uiterlijk aankomen om
  // starttijd - marge", terug "vertrekken vanaf de eindtijd".
  const arriveByDate =
    mode === "transit"
      ? new Date(
          toDateTime(dateKey, activity.startTime).getTime() -
            bufferFor(activity, settings) * 60_000,
        )
      : null;
  const departAtDate = mode === "transit" ? toDateTime(dateKey, activity.endTime) : null;

  const outboundSlot = arriveByDate ? `${dateKey}T${activity.startTime}` : null;
  const returnSlot = departAtDate ? `${dateKey}T${activity.endTime}` : null;

  const outboundKey = travelKey(settings.home, activity.location, mode, outboundSlot);
  const returnKey = travelKey(activity.location, settings.home, mode, returnSlot);
  if (!outboundKey || !returnKey) return null;

  return {
    mode,
    outboundKey,
    returnKey,
    arriveBy: arriveByDate?.toISOString(),
    departAt: departAtDate?.toISOString(),
  };
}

/**
 * Heeft deze activiteit een (nieuwe) reisberekening nodig? Heen- en terugreis
 * worden samen opgehaald, dus één verouderde sleutel is genoeg.
 */
export function needsTravelRefresh(
  activity: Activity,
  settings: Settings,
  now: Date = new Date(),
): boolean {
  const plan = travelPlanFor(activity, settings, now);
  if (!plan) return false;
  return (
    activity.travel?.key !== plan.outboundKey || activity.returnTravel?.key !== plan.returnKey
  );
}

/** Minuten sinds middernacht van een ISO-tijdstip, in lokale tijd. */
function localMinutes(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

export interface DepartureInfo {
  /** "HH:mm" */
  time: string;
  /** Minuten sinds middernacht; kan negatief zijn als je de dag ervoor vertrekt. */
  minutes: number;
  travelMinutes: number;
  bufferMinutes: number;
  /** true wanneer het vertrek op de vorige kalenderdag valt. */
  previousDay: boolean;
}

/**
 * VERTREKTIJD = STARTTIJD - REISTIJD - VEILIGHEIDSMARGE
 *
 * Bij OV komt de vertrektijd rechtstreeks uit de geplande rit: dat is het
 * moment waarop je trein of bus echt gaat, niet een rekensom.
 */
export function computeDeparture(activity: Activity, settings: Settings): DepartureInfo | null {
  if (!activity.location || !activity.travel) return null;

  const buffer = bufferFor(activity, settings);
  const travelMinutes = activity.travel.durationMinutes;
  const startMinutes = timeToMinutes(activity.startTime);

  if (activity.travel.plannedDeparture) {
    const minutes = localMinutes(activity.travel.plannedDeparture);
    return {
      time: minutesToTime(minutes),
      minutes,
      travelMinutes,
      bufferMinutes: buffer,
      // Vertrek later op de klok dan de starttijd betekent: de dag ervoor.
      previousDay: minutes > startMinutes,
    };
  }

  const minutes = startMinutes - travelMinutes - buffer;
  return {
    time: minutesToTime(minutes),
    minutes,
    travelMinutes,
    bufferMinutes: buffer,
    previousDay: minutes < 0,
  };
}

/** Absoluut moment van vertrek, handig voor sorteren en "eerstvolgende". */
export function departureDateTime(activity: Activity, settings: Settings): Date | null {
  const departure = computeDeparture(activity, settings);
  if (!departure) return null;
  const start = toDateTime(activity.date, activity.startTime);
  return new Date(
    start.getTime() - (timeToMinutes(activity.startTime) - departure.minutes) * 60_000,
  );
}

export interface ReturnInfo {
  /** Verwachte thuiskomst, "HH:mm". */
  time: string;
  /** Minuten sinds middernacht; kan boven 1440 uitkomen. */
  minutes: number;
  travelMinutes: number;
  /** true wanneer je pas na middernacht thuis bent. */
  nextDay: boolean;
}

/**
 * THUISKOMST = EINDTIJD + REISTIJD TERUG
 *
 * Bewust zonder veiligheidsmarge: die is bedoeld om op tijd aan te komen, niet
 * om een schatting van je thuiskomst op te rekken. Bij OV komt de aankomst uit
 * de geplande rit.
 */
export function computeReturn(activity: Activity, settings: Settings): ReturnInfo | null {
  if (!activity.location || !activity.returnTravel) return null;
  void settings;

  const travelMinutes = activity.returnTravel.durationMinutes;
  const endMinutes = timeToMinutes(activity.endTime);

  if (activity.returnTravel.plannedArrival) {
    const arrival = localMinutes(activity.returnTravel.plannedArrival);
    // Wikkelt de aankomst over middernacht, dan tellen we een dag op.
    const minutes = arrival < endMinutes ? arrival + MINUTES_PER_DAY : arrival;
    return {
      time: minutesToTime(minutes),
      minutes,
      travelMinutes,
      nextDay: minutes >= MINUTES_PER_DAY,
    };
  }

  const minutes = endMinutes + travelMinutes;
  return {
    time: minutesToTime(minutes),
    minutes,
    travelMinutes,
    nextDay: minutes >= MINUTES_PER_DAY,
  };
}
