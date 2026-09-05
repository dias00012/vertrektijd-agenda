import type { Activity, GeoLocation, Settings, TravelMode } from "./types";
import { MINUTES_PER_DAY, minutesToTime, timeToMinutes, toDateTime } from "./time";

/**
 * Sleutel waarmee we bepalen of een opgeslagen reistijd nog geldig is.
 * Verandert de thuislocatie, de bestemming of het vervoersmiddel, dan wijzigt
 * de sleutel en wordt de reistijd opnieuw berekend.
 */
export function travelKey(
  home: GeoLocation | null,
  destination: GeoLocation | null,
  mode: TravelMode,
): string | null {
  if (!home || !destination) return null;
  const round = (n: number) => n.toFixed(5);
  return `${round(home.lat)},${round(home.lon)}>${round(destination.lat)},${round(destination.lon)}@${mode}`;
}

/**
 * Heeft deze activiteit een (nieuwe) reistijdberekening nodig? Heen- en
 * terugreis worden samen opgehaald, dus één verouderde sleutel is genoeg.
 */
export function needsTravelRefresh(activity: Activity, settings: Settings): boolean {
  const outbound = travelKey(settings.home, activity.location, settings.travelMode);
  if (!outbound) return false;
  const inbound = travelKey(activity.location, settings.home, settings.travelMode);
  return activity.travel?.key !== outbound || activity.returnTravel?.key !== inbound;
}

export function bufferFor(activity: Activity, settings: Settings): number {
  return activity.bufferMinutes ?? settings.bufferMinutes;
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
 */
export function computeDeparture(activity: Activity, settings: Settings): DepartureInfo | null {
  if (!activity.location || !activity.travel) return null;
  const buffer = bufferFor(activity, settings);
  const travelMinutes = activity.travel.durationMinutes;
  const minutes = timeToMinutes(activity.startTime) - travelMinutes - buffer;
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
  return new Date(start.getTime() - (departure.travelMinutes + departure.bufferMinutes) * 60_000);
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
 * om een schatting van je thuiskomst op te rekken.
 */
export function computeReturn(activity: Activity, settings: Settings): ReturnInfo | null {
  if (!activity.location || !activity.returnTravel) return null;
  void settings;
  const travelMinutes = activity.returnTravel.durationMinutes;
  const minutes = timeToMinutes(activity.endTime) + travelMinutes;
  return {
    time: minutesToTime(minutes),
    minutes,
    travelMinutes,
    nextDay: minutes >= MINUTES_PER_DAY,
  };
}
