import type { Activity, Settings } from "./types";
import { activitiesOnDate } from "./agenda";
import { computeDeparture, departureDateTime } from "./travel";
import { addDaysToKey, todayKey } from "./time";
import { getLanguage } from "./i18n/locale";
import { translate } from "./i18n/dictionary";

/**
 * Welke herinneringen er aankomen: "over 15 minuten vertrekken".
 *
 * Eén berekening voor twee gebruikers. Zolang de app openstaat zet
 * `useReminders` hier timers op; voor als de app dicht is zet `usePushQueue`
 * dezelfde berichten kant-en-klaar in een wachtrij op de server. Zo kan het
 * nooit uit elkaar lopen, en hoeft de server je agenda niet te kennen.
 */
export interface PlannedReminder {
  /** Stabiele sleutel, zodat hetzelfde bericht niet twee keer komt. */
  key: string;
  /** Wanneer de melding moet verschijnen. */
  at: Date;
  title: string;
  body: string;
}

export function plannedReminders(
  activities: Activity[],
  settings: Settings,
  now: Date,
  days: number,
): PlannedReminder[] {
  const minutesBefore = settings.reminderMinutes;
  if (minutesBefore === null || minutesBefore === undefined) return [];

  const language = getLanguage();
  const planned: PlannedReminder[] = [];
  const from = todayKey(now);

  for (let offset = 0; offset < days; offset += 1) {
    for (const occurrence of activitiesOnDate(activities, addDaysToKey(from, offset))) {
      const departure = computeDeparture(occurrence, settings);
      const departAt = departureDateTime(occurrence, settings);
      if (!departure || !departAt) continue;

      const at = new Date(departAt.getTime() - minutesBefore * 60_000);
      if (at.getTime() <= now.getTime()) continue;

      planned.push({
        key: `${occurrence.occurrenceId}@${departure.time}`,
        at,
        title: translate(language, "reminders.notification.title", { time: departure.time }),
        body: translate(language, "reminders.notification.body", {
          title: occurrence.title,
          start: occurrence.startTime,
          count: minutesBefore,
        }),
      });
    }
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime());
}
