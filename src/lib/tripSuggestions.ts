import { bufferFor } from "./travel";
import { nextOccurrenceDate } from "./travel";
import { daysBetween, toDateTime, todayKey } from "./time";
import type { Activity, GeoLocation, Settings } from "./types";

/**
 * Je eerstvolgende ritten, als snelkeuze voor de reisplanner.
 *
 * Dit is wat deze app onderscheidt van elke andere reisplanner: hij weet al
 * waar je heen moet en hoe laat je er moet zijn. Toch begon je op de reispagina
 * met een leeg "naar"-veld en typte je elke keer opnieuw je bestemming.
 *
 * De aankomsttijd is dezelfde als die de agenda aanhoudt -- starttijd min je
 * marge. Zou de planner een andere tijd nemen, dan geeft hij een ander antwoord
 * dan je agenda voor precies dezelfde vraag, en dan weet je niet meer welke
 * klopt.
 */

/** Zo ver vooruit kijken we; verder is het geen "eerstvolgende" meer. */
export const SUGGESTION_HORIZON_DAYS = 7;

/** Zoveel snelkeuzes tonen we hoogstens; meer wordt een lijst om te lezen. */
export const MAX_SUGGESTIONS = 3;

export interface TripSuggestion {
  /** De activiteit waar deze rit bij hoort. */
  id: string;
  /** Hoe de activiteit heet, bv. "School". */
  label: string;
  to: GeoLocation;
  /** De dag van de rit (jjjj-mm-dd). */
  date: string;
  /** Uiterlijk aankomen, als ISO-tijd. */
  arriveBy: string;
}

export function upcomingTrips(
  activities: readonly Activity[],
  settings: Settings,
  now: Date,
  limit: number = MAX_SUGGESTIONS,
): TripSuggestion[] {
  const today = todayKey(now);
  const uit: TripSuggestion[] = [];

  for (const activity of activities) {
    if (!activity.location) continue;

    const date = nextOccurrenceDate(activity, now);
    const dagen = daysBetween(today, date);
    if (dagen < 0 || dagen > SUGGESTION_HORIZON_DAYS) continue;

    // Uiterlijk aankomen: starttijd min je marge, net als in de agenda.
    const aankomst = toDateTime(date, activity.startTime).getTime() - bufferFor(activity, settings) * 60_000;
    // Een rit waarvan het vertrek al voorbij is helpt niet meer.
    if (aankomst <= now.getTime()) continue;

    uit.push({
      id: activity.id,
      label: activity.title,
      to: activity.location,
      date,
      arriveBy: new Date(aankomst).toISOString(),
    });
  }

  // Eerst wat als eerste komt; dat is bijna altijd degene die je bedoelt.
  uit.sort((a, b) => a.arriveBy.localeCompare(b.arriveBy));
  return uit.slice(0, Math.max(0, limit));
}
