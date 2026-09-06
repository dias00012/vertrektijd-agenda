import type { Activity, ActivityDraft } from "./types";
import { timeToMinutes } from "./time";

/**
 * Wat er in je rooster veranderd is sinds de vorige keer ophalen.
 *
 * Dit is het enige moment waarop de app iets weet dat jij nog niet weet. Een
 * roostersysteem meldt zelf niets: je eerste uur vervalt en je komt er 's
 * ochtends om kwart over zeven achter, in de bus. De app haalt je rooster elke
 * dag op, dus hij ziet het als eerste.
 *
 * We vergelijken per dag en alleen vooruit. Dat een les van vorige week is
 * verschoven is geen nieuws meer.
 */

/** Eén les, teruggebracht tot waar het om gaat bij vergelijken. */
interface Lesson {
  key: string;
  title: string;
  startTime: string;
  endTime: string;
}

export interface DayChange {
  dateKey: string;
  /** Lessen die van deze dag verdwenen zijn. */
  removed: string[];
  /** Lessen die erbij zijn gekomen. */
  added: string[];
  /** Begintijd van de dag, ervoor en erna; null als er die dag niets (meer) is. */
  firstStartBefore: string | null;
  firstStartAfter: string | null;
  /** Eindtijd van de dag, ervoor en erna. */
  lastEndBefore: string | null;
  lastEndAfter: string | null;
}

/** Begint deze dag later dan eerst? Dan kun je uitslapen. */
export function startsLater(change: DayChange): boolean {
  const { firstStartBefore: before, firstStartAfter: after } = change;
  return before !== null && after !== null && timeToMinutes(after) > timeToMinutes(before);
}

/** Begint deze dag eerder? Dat is het bericht dat je juist niet wilt missen. */
export function startsEarlier(change: DayChange): boolean {
  const { firstStartBefore: before, firstStartAfter: after } = change;
  return before !== null && after !== null && timeToMinutes(after) < timeToMinutes(before);
}

/** Is deze dag helemaal vrij geworden? */
export function becameFree(change: DayChange): boolean {
  return change.firstStartBefore !== null && change.firstStartAfter === null;
}

function lessonOf(item: { title: string; startTime: string; endTime: string }): Lesson {
  return {
    key: `${item.startTime}|${item.endTime}|${item.title}`,
    title: item.title,
    startTime: item.startTime,
    endTime: item.endTime,
  };
}

/** Lessen per dag, hele dagen niet meegerekend: die hebben geen begintijd. */
function byDay(
  items: { date: string; title: string; startTime: string; endTime: string; allDay?: boolean }[],
): Map<string, Lesson[]> {
  const days = new Map<string, Lesson[]>();
  for (const item of items) {
    if (item.allDay) continue;
    const list = days.get(item.date) ?? [];
    list.push(lessonOf(item));
    days.set(item.date, list);
  }
  for (const list of days.values()) {
    list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }
  return days;
}

function firstStart(lessons: Lesson[] | undefined): string | null {
  return lessons && lessons.length > 0 ? lessons[0].startTime : null;
}

function lastEnd(lessons: Lesson[] | undefined): string | null {
  if (!lessons || lessons.length === 0) return null;
  return lessons.reduce(
    (latest, lesson) => (timeToMinutes(lesson.endTime) > timeToMinutes(latest) ? lesson.endTime : latest),
    lessons[0].endTime,
  );
}

/**
 * Vergelijkt het oude en het nieuwe rooster van één bron.
 *
 * `fromDateKey` is meestal vandaag: wat achter je ligt hoeft niet gemeld.
 */
export function compareTimetable(
  before: Activity[],
  after: ActivityDraft[],
  fromDateKey: string,
): DayChange[] {
  const oldDays = byDay(before);
  const newDays = byDay(after);

  const dates = [...new Set([...oldDays.keys(), ...newDays.keys()])]
    .filter((date) => date >= fromDateKey)
    .sort();

  const changes: DayChange[] = [];

  for (const dateKey of dates) {
    const was = oldDays.get(dateKey) ?? [];
    const now = newDays.get(dateKey) ?? [];

    const wasKeys = new Set(was.map((lesson) => lesson.key));
    const nowKeys = new Set(now.map((lesson) => lesson.key));

    const removed = was.filter((lesson) => !nowKeys.has(lesson.key)).map((lesson) => lesson.title);
    const added = now.filter((lesson) => !wasKeys.has(lesson.key)).map((lesson) => lesson.title);

    if (removed.length === 0 && added.length === 0) continue;

    changes.push({
      dateKey,
      removed,
      added,
      firstStartBefore: firstStart(was),
      firstStartAfter: firstStart(now),
      lastEndBefore: lastEnd(was),
      lastEndAfter: lastEnd(now),
    });
  }

  return changes;
}
