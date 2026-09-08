import type { Activity, ActivityOccurrence, Recurrence } from "./types";
import { addDaysToKey, daysBetween, parseDateKey, startOfWeekKey } from "./time";
import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";

function word(key: TranslationKey, values?: Record<string, string | number>): string {
  return translate(getLanguage(), key, values);
}

/**
 * Herhaling. Een activiteit met een `recurrence` gebruikt zijn eigen `date` als
 * startdatum en verschijnt daarna volgens het patroon: elke week of om de week
 * op de gekozen weekdagen, of elke maand op dezelfde dag van de maand.
 */

/** Hele weken tussen twee dagen, gerekend vanaf de maandag van hun week. */
function weeksApart(fromKey: string, toKey: string): number {
  const from = parseDateKey(startOfWeekKey(fromKey)).getTime();
  const to = parseDateKey(startOfWeekKey(toKey)).getTime();
  // Afronden vangt het uur op dat de zomertijd erin of eruit haalt.
  return Math.round((to - from) / (7 * 86_400_000));
}

/**
 * Weekdagen met maandag eerst; `value` volgt Date#getDay(). De namen volgen de
 * gekozen taal, dus dit is een functie en geen vaste lijst.
 */
export function weekdays(): { value: number; short: string; long: string }[] {
  return [1, 2, 3, 4, 5, 6, 0].map((value) => ({
    value,
    short: word(`weekdayShort.${value}` as TranslationKey),
    long: word(`weekday.${value}` as TranslationKey),
  }));
}

/** Vaste volgorde (ma t/m zo), zonder namen. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Korte weekdagnamen voor de koppen van het week- en maandraster, van maandag
 * tot zondag. Volgt de taal, dus geen vaste lijst in de componenten zelf.
 */
export function weekdayHeadings(): string[] {
  return WEEK_ORDER.map((value) => word(`weekdayShort.${value}` as TranslationKey));
}

const WORKWEEK = [1, 2, 3, 4, 5];

/** Weekdagen op vaste (ma-eerst) volgorde, zonder duplicaten. */
export function sortWeekdays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
}

/** De laatste dag van een activiteit; gelijk aan de eerste bij één dag. */
export function lastDayOf(activity: Activity): string {
  // Een herhaling en een einddatum sluiten elkaar uit: bij een reeks bepaalt
  // `until` waar hij ophoudt, niet `endDate`. Bleef er een oude einddatum
  // staan (het formulier verbergt het veld maar wiste hem niet), dan telde de
  // app die dagen alsnog mee en stond er "dag 8 van 5" op de kaart.
  if (activity.recurrence) return activity.date;

  const end = activity.endDate;
  return end && end > activity.date ? end : activity.date;
}

/** Duurt deze activiteit meer dan één dag? */
export function spansDays(activity: Activity): boolean {
  return lastDayOf(activity) > activity.date;
}

/** Valt deze activiteit op de opgegeven dag? */
export function occursOn(activity: Activity, dateKey: string): boolean {
  // Iets dat meer dagen duurt staat op elke dag ertussen, niet alleen op de
  // eerste. Een vakantie hoort de hele week in je agenda te staan.
  if (!activity.recurrence) {
    return dateKey >= activity.date && dateKey <= lastDayOf(activity);
  }

  // Vóór de startdatum of na de einddatum bestaat de reeks niet.
  if (dateKey < activity.date) return false;
  if (activity.recurrence.until && dateKey > activity.recurrence.until) return false;
  if (activity.exceptions.includes(dateKey)) return false;

  if (activity.recurrence.freq === "monthly") {
    // Maanden zonder deze dag (een reeks op de 31e in februari) slaan we over,
    // net als in een ics-bestand. Dat is eerlijker dan hem stilletjes
    // verschuiven naar een dag die je niet gekozen hebt.
    return parseDateKey(dateKey).getDate() === parseDateKey(activity.date).getDate();
  }

  if (!activity.recurrence.weekdays.includes(parseDateKey(dateKey).getDay())) return false;

  if (activity.recurrence.freq === "biweekly") {
    return weeksApart(activity.date, dateKey) % 2 === 0;
  }

  return true;
}

/** Zo ver kijken we terug naar het laatste voorkomen van een afgelopen reeks. */
const LOOKBACK_DAYS = 400;

/**
 * De laatste dag waarop deze activiteit viel, op of vóór `before`.
 *
 * Nodig zodra een reeks voorbij is: de vraag is dan "wanneer was dat ook
 * alweer", en dan hoort de laatste keer erbij en niet de allereerste.
 */
export function lastOccurrenceDate(activity: Activity, before: string): string | null {
  const until = activity.recurrence?.until;
  const from = until && until < before ? until : before;

  for (let offset = 0; offset <= LOOKBACK_DAYS; offset += 1) {
    const dateKey = addDaysToKey(from, -offset);
    if (dateKey < activity.date) return null;
    if (occursOn(activity, dateKey)) return dateKey;
  }
  return null;
}

/**
 * Maakt de concrete dag-versie van een activiteit.
 *
 * Standaard hoort zowel de heen- als de terugreis erbij: dat klopt voor een
 * losse activiteit. Staat er die dag meer op dezelfde plek, dan verdeelt
 * `assignTravelRoles` de reizen over de eerste en de laatste.
 */
export function toOccurrence(activity: Activity, dateKey: string): ActivityOccurrence {
  const end = lastDayOf(activity);
  const total = daysBetween(activity.date, end) + 1;

  return {
    ...activity,
    date: dateKey,
    occurrenceId: `${activity.id}:${dateKey}`,
    recurring: Boolean(activity.recurrence),
    seriesDate: activity.date,
    span:
      total > 1
        ? {
            start: activity.date,
            end,
            index: daysBetween(activity.date, dateKey),
            total,
          }
        : null,
    travelRole: { outbound: true, inbound: true, onward: null, arrivesFrom: null },
  };
}

/** Alle activiteiten die op deze dag vallen, herhalingen meegerekend. */
export function occurrencesOnDate(activities: Activity[], dateKey: string): ActivityOccurrence[] {
  return activities
    .filter((activity) => occursOn(activity, dateKey))
    .map((activity) => toOccurrence(activity, dateKey));
}

/** Is dit een aaneengesloten reeks weekdagen, bv. ma t/m do? */
function isContiguous(chosen: number[]): boolean {
  const positions = chosen.map((value) => WEEK_ORDER.indexOf(value));
  // Bij twee dagen is "za, zo" korter en leesbaarder dan "za t/m zo".
  return (
    chosen.length >= 3 &&
    positions.every((pos, index) => index === 0 || pos === positions[index - 1] + 1)
  );
}

/** De dagen zonder "elke" ervoor, bv. "maandag", "ma, wo" of "ma t/m do". */
function dayList(chosen: number[]): string {
  if (chosen.length === 7) return word("recurrence.allDays");
  if (chosen.length === WORKWEEK.length && WORKWEEK.every((day) => chosen.includes(day))) {
    return word("recurrence.workdays");
  }
  if (chosen.length === 1) return word(`weekday.${chosen[0]}` as TranslationKey);

  const labels = chosen.map((value) => word(`weekdayShort.${value}` as TranslationKey));
  return isContiguous(chosen)
    ? word("recurrence.rangePlain", { from: labels[0], to: labels[labels.length - 1] })
    : labels.join(", ");
}

/** "12e" in het Nederlands, "12th" in het Engels. */
function ordinal(day: number): string {
  if (getLanguage() === "nl") return `${day}e`;
  const ones = day % 10;
  const tens = day % 100;
  if (ones === 1 && tens !== 11) return `${day}st`;
  if (ones === 2 && tens !== 12) return `${day}nd`;
  if (ones === 3 && tens !== 13) return `${day}rd`;
  return `${day}th`;
}

/**
 * Leesbare samenvatting, bv. "Elke werkdag", "Om de week op ma, wo" of
 * "Elke maand op de 12e". `startDateKey` is de startdatum van de reeks; bij
 * maandelijks staat daar de dag van de maand in.
 */
export function describeRecurrence(recurrence: Recurrence, startDateKey?: string): string {
  if (recurrence.freq === "monthly") {
    const monthly = startDateKey
      ? word("recurrence.monthly", { day: ordinal(parseDateKey(startDateKey).getDate()) })
      : word("recurrence.monthlyPlain");
    return withUntil(monthly, recurrence);
  }

  const chosen = sortWeekdays(recurrence.weekdays);
  if (chosen.length === 0) return word("recurrence.none");

  if (recurrence.freq === "biweekly") {
    return withUntil(word("recurrence.biweekly", { days: dayList(chosen) }), recurrence);
  }

  let days: string;
  if (chosen.length === 7) {
    days = word("recurrence.daily");
  } else if (chosen.length === WORKWEEK.length && WORKWEEK.every((day) => chosen.includes(day))) {
    days = word("recurrence.weekdays");
  } else if (chosen.length === 1) {
    days = word("recurrence.every", {
      days: word(`weekday.${chosen[0]}` as TranslationKey),
    });
  } else {
    const labels = chosen.map((value) => word(`weekdayShort.${value}` as TranslationKey));
    days = isContiguous(chosen)
      ? word("recurrence.range", { from: labels[0], to: labels[labels.length - 1] })
      : word("recurrence.every", { days: labels.join(", ") });
  }

  return withUntil(days, recurrence);
}

/** Plakt er "t/m 31-12-2026" achter zodra de reeks een einddatum heeft. */
function withUntil(days: string, recurrence: Recurrence): string {
  if (!recurrence.until) return days;
  const end = parseDateKey(recurrence.until);
  const date =
    getLanguage() === "en"
      ? `${end.getFullYear()}-${end.getMonth() + 1}-${end.getDate()}`
      : `${end.getDate()}-${end.getMonth() + 1}-${end.getFullYear()}`;
  return word("recurrence.until", { days, date });
}

/**
 * Schuift een herhaling een aantal dagen op.
 *
 * Sleep je een reeks een dag naar rechts, dan verhuist elke dag van de reeks
 * mee; anders zou "elke maandag en woensdag" na het slepen ineens iets anders
 * betekenen. Bij maandelijks zit de dag in de startdatum, dus daar valt aan
 * het patroon zelf niets te schuiven.
 */
export function shiftRecurrence(recurrence: Recurrence, days: number): Recurrence {
  if (recurrence.freq === "monthly") return recurrence;
  return {
    ...recurrence,
    weekdays: sortWeekdays(recurrence.weekdays.map((day) => (((day + days) % 7) + 7) % 7)),
  };
}

/** De dag van de maand van deze datum als "12e" of "12th". */
export function monthDayLabel(dateKey: string): string {
  return ordinal(parseDateKey(dateKey).getDate());
}

/** Standaardpatroon zodra de gebruiker herhaling aanzet: dezelfde weekdag. */
export function defaultRecurrence(dateKey: string): Recurrence {
  return { freq: "weekly", weekdays: [parseDateKey(dateKey).getDay()], until: null };
}
