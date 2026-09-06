import type { Activity, ActivityOccurrence, Recurrence } from "./types";
import { parseDateKey } from "./time";
import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";

function word(key: TranslationKey, values?: Record<string, string | number>): string {
  return translate(getLanguage(), key, values);
}

/**
 * Wekelijkse herhaling. Een activiteit met een `recurrence` gebruikt zijn eigen
 * `date` als startdatum en verschijnt daarna op elke gekozen weekdag.
 */

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

/** Valt deze activiteit op de opgegeven dag? */
export function occursOn(activity: Activity, dateKey: string): boolean {
  if (!activity.recurrence) return activity.date === dateKey;

  // Vóór de startdatum of na de einddatum bestaat de reeks niet.
  if (dateKey < activity.date) return false;
  if (activity.recurrence.until && dateKey > activity.recurrence.until) return false;
  if (activity.exceptions.includes(dateKey)) return false;

  return activity.recurrence.weekdays.includes(parseDateKey(dateKey).getDay());
}

/** Maakt de concrete dag-versie van een activiteit. */
export function toOccurrence(activity: Activity, dateKey: string): ActivityOccurrence {
  return {
    ...activity,
    date: dateKey,
    occurrenceId: `${activity.id}:${dateKey}`,
    recurring: Boolean(activity.recurrence),
  };
}

/** Alle activiteiten die op deze dag vallen, herhalingen meegerekend. */
export function occurrencesOnDate(activities: Activity[], dateKey: string): ActivityOccurrence[] {
  return activities
    .filter((activity) => occursOn(activity, dateKey))
    .map((activity) => toOccurrence(activity, dateKey));
}

/** Leesbare samenvatting, bv. "Elke werkdag" of "Elke ma, wo t/m 31 dec". */
export function describeRecurrence(recurrence: Recurrence): string {
  const chosen = sortWeekdays(recurrence.weekdays);
  if (chosen.length === 0) return word("recurrence.none");

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
    // Aaneengesloten reeks korter weergeven: "ma t/m do". Bij twee dagen is
    // "za, zo" korter en leesbaarder dan "za t/m zo".
    const positions = chosen.map((value) => WEEK_ORDER.indexOf(value));
    const contiguous =
      chosen.length >= 3 &&
      positions.every((pos, index) => index === 0 || pos === positions[index - 1] + 1);
    days = contiguous
      ? word("recurrence.range", { from: labels[0], to: labels[labels.length - 1] })
      : word("recurrence.every", { days: labels.join(", ") });
  }

  if (!recurrence.until) return days;
  const end = parseDateKey(recurrence.until);
  const date =
    getLanguage() === "en"
      ? `${end.getFullYear()}-${end.getMonth() + 1}-${end.getDate()}`
      : `${end.getDate()}-${end.getMonth() + 1}-${end.getFullYear()}`;
  return word("recurrence.until", { days, date });
}

/** Standaardpatroon zodra de gebruiker herhaling aanzet: dezelfde weekdag. */
export function defaultRecurrence(dateKey: string): Recurrence {
  return { freq: "weekly", weekdays: [parseDateKey(dateKey).getDay()], until: null };
}
