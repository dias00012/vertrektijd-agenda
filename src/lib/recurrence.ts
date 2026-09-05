import type { Activity, ActivityOccurrence, Recurrence } from "./types";
import { parseDateKey } from "./time";

/**
 * Wekelijkse herhaling. Een activiteit met een `recurrence` gebruikt zijn eigen
 * `date` als startdatum en verschijnt daarna op elke gekozen weekdag.
 */

/** Weekdagen in Nederlandse volgorde; `value` volgt Date#getDay(). */
export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "ma", long: "maandag" },
  { value: 2, short: "di", long: "dinsdag" },
  { value: 3, short: "wo", long: "woensdag" },
  { value: 4, short: "do", long: "donderdag" },
  { value: 5, short: "vr", long: "vrijdag" },
  { value: 6, short: "za", long: "zaterdag" },
  { value: 0, short: "zo", long: "zondag" },
];

const WORKWEEK = [1, 2, 3, 4, 5];

/** Weekdagen op vaste (ma-eerst) volgorde, zonder duplicaten. */
export function sortWeekdays(weekdays: number[]): number[] {
  const order = WEEKDAYS.map((day) => day.value);
  return [...new Set(weekdays)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
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
  const weekdays = sortWeekdays(recurrence.weekdays);
  if (weekdays.length === 0) return "Herhaalt niet";

  let days: string;
  if (weekdays.length === 7) {
    days = "Elke dag";
  } else if (
    weekdays.length === WORKWEEK.length &&
    WORKWEEK.every((day) => weekdays.includes(day))
  ) {
    days = "Elke werkdag";
  } else if (weekdays.length === 1) {
    days = `Elke ${WEEKDAYS.find((day) => day.value === weekdays[0])?.long ?? ""}`;
  } else {
    const labels = weekdays.map(
      (value) => WEEKDAYS.find((day) => day.value === value)?.short ?? "",
    );
    // Aaneengesloten reeks korter weergeven: "ma t/m do". Bij twee dagen is
    // "za, zo" korter en leesbaarder dan "za t/m zo".
    const positions = weekdays.map((value) => WEEKDAYS.findIndex((day) => day.value === value));
    const contiguous =
      weekdays.length >= 3 &&
      positions.every((pos, index) => index === 0 || pos === positions[index - 1] + 1);
    days = contiguous
      ? `Elke ${labels[0]} t/m ${labels[labels.length - 1]}`
      : `Elke ${labels.join(", ")}`;
  }

  if (!recurrence.until) return days;
  const end = parseDateKey(recurrence.until);
  return `${days}, t/m ${end.getDate()}-${end.getMonth() + 1}-${end.getFullYear()}`;
}

/** Standaardpatroon zodra de gebruiker herhaling aanzet: dezelfde weekdag. */
export function defaultRecurrence(dateKey: string): Recurrence {
  return { freq: "weekly", weekdays: [parseDateKey(dateKey).getDay()], until: null };
}
