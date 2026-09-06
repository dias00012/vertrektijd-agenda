import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";

/**
 * Datum- en tijdhelpers. Alles werkt met lokale tijd en de string-formaten
 * "YYYY-MM-DD" en "HH:mm", zodat opgeslagen data leesbaar en tijdzone-stabiel is.
 *
 * De teksten volgen de gekozen taal. Deze functies worden vanuit tientallen
 * plekken aangeroepen, ook buiten componenten, dus ze lezen de taal zelf uit.
 */

/** Kort: één woord in de nu actieve taal. */
function word(key: TranslationKey): string {
  return translate(getLanguage(), key);
}

export const MINUTES_PER_DAY = 24 * 60;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM-DD" van een Date in lokale tijd. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "HH:mm" van een Date in lokale tijd. */
export function toTimeKey(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "HH:mm" naar minuten sinds middernacht. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Minuten sinds middernacht naar "HH:mm". Wrapt netjes rond middernacht. */
export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

/** Combineert datum- en tijdsleutel tot een Date in lokale tijd. */
export function toDateTime(dateKey: string, time: string): Date {
  const d = parseDateKey(dateKey);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/** "32 min" / "1 u 12 min" */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const min = word("time.minutesShort");
  const hour = word("time.hoursShort");
  if (rounded < 60) return `${rounded} ${min}`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} ${hour}` : `${h} ${hour} ${m} ${min}`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  // Nederlands schrijft een komma waar Engels een punt zet.
  const value = km.toFixed(1);
  return `${getLanguage() === "en" ? value : value.replace(".", ",")} km`;
}

/**
 * "Vandaag" / "Morgen" / "donderdag 4 september"
 *
 * In het Engels staat de dag voor de maand ("Thursday 4 September" wordt
 * "Thursday, September 4"), dus de volgorde hangt van de taal af.
 */
export function formatDateLabel(dateKey: string, now: Date = new Date()): string {
  const today = toDateKey(now);
  if (dateKey === today) return word("common.today");
  if (dateKey === addDaysToKey(today, 1)) return word("common.tomorrow");
  if (dateKey === addDaysToKey(today, -1)) return word("common.yesterday");

  const d = parseDateKey(dateKey);
  const weekday = word(`weekday.${d.getDay()}` as TranslationKey);
  const month = word(`month.${d.getMonth()}` as TranslationKey);
  return getLanguage() === "en"
    ? `${weekday}, ${month} ${d.getDate()}`
    : `${weekday} ${d.getDate()} ${month}`;
}

/** Korte variant voor kopjes in de weekweergave: "do 4 sep". */
export function formatDateShort(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const weekday = word(`weekdayShort.${d.getDay()}` as TranslationKey);
  const month = word(`monthShort.${d.getMonth()}` as TranslationKey);
  return getLanguage() === "en"
    ? `${weekday} ${month} ${d.getDate()}`
    : `${weekday} ${d.getDate()} ${month}`;
}


/* --- Week- en maandrasters --------------------------------------------- */

/** Maandag van de week waarin deze dag valt. */
export function startOfWeekKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const weekday = date.getDay();
  // getDay(): 0 = zondag, dus zondag hoort bij de week die 6 dagen eerder begon.
  date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return toDateKey(date);
}

/** De zeven dagen (ma t/m zo) van de kalenderweek rond deze dag. */
export function calendarWeekKeys(dateKey: string): string[] {
  const start = startOfWeekKey(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
}

export function addWeeksToKey(dateKey: string, weeks: number): string {
  return addDaysToKey(dateKey, weeks * 7);
}

/** Zelfde dag van de maand, of de laatste dag als die maand korter is. */
export function addMonthsToKey(dateKey: string, months: number): string {
  const date = parseDateKey(dateKey);
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return toDateKey(target);
}

export function firstOfMonthKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

/**
 * Alle dagen van het maandraster: hele weken (ma t/m zo), inclusief de dagen
 * van de vorige en volgende maand die het raster opvullen.
 */
export function monthGridKeys(dateKey: string): string[] {
  const date = parseDateKey(dateKey);
  const lastDayKey = toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));

  const keys: string[] = [];
  let cursor = startOfWeekKey(firstOfMonthKey(dateKey));
  do {
    for (let i = 0; i < 7; i += 1) {
      keys.push(cursor);
      cursor = addDaysToKey(cursor, 1);
    }
    // Sleutels in YYYY-MM-DD vergelijken lexicografisch net als chronologisch.
  } while (keys[keys.length - 1] < lastDayKey);

  return keys;
}

export function isSameMonth(dateKey: string, otherKey: string): boolean {
  return dateKey.slice(0, 7) === otherKey.slice(0, 7);
}

/** "2 sep" */
export function formatDayMonth(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const month = word(`monthShort.${date.getMonth()}` as TranslationKey);
  return getLanguage() === "en" ? `${month} ${date.getDate()}` : `${date.getDate()} ${month}`;
}

/** "september 2026" */
export function formatMonthLabel(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${word(`month.${date.getMonth()}` as TranslationKey)} ${date.getFullYear()}`;
}

/** "31 aug – 6 sep" */
export function formatRangeLabel(startKey: string, endKey: string): string {
  return `${formatDayMonth(startKey)} \u2013 ${formatDayMonth(endKey)}`;
}
