import type { PlannedReminder } from "./reminders";

/**
 * Welke herinneringen krijgen nu een timer, en over hoe lang?
 *
 * Deze beslissing zat in `useReminders` en was daarmee niet na te rekenen: een
 * hook draait alleen in een browser, en de tests hier draaien in node. Dus
 * stond de vraag "waarom kwam die melding niet?" open, terwijl het antwoord
 * altijd in deze drie regels ligt.
 */

/**
 * Zo ver vooruit zetten we een timer. Verder is `setTimeout` niet te
 * vertrouwen: een tabblad dat uren op de achtergrond staat krijgt zijn timers
 * vertraagd of helemaal niet.
 */
export const HORIZON_MS = 6 * 60 * 60 * 1000;

/**
 * En zo vaak kijken we opnieuw. Zonder dit werd een vertrek van vanmiddag om
 * 17:00 's ochtends overgeslagen -- verder weg dan de horizon -- en daarna
 * nooit meer bekeken: liet je de app openstaan, dan kwam die melding gewoon
 * niet.
 */
export const REPLAN_MS = 15 * 60 * 1000;

export interface ReminderTimer {
  reminder: PlannedReminder;
  /** Milliseconden vanaf nu. Altijd groter dan nul. */
  delay: number;
}

/**
 * @param announced Sleutels die al gemeld zijn; die komen niet nog een keer.
 */
export function dueReminders(
  planned: PlannedReminder[],
  now: Date,
  announced: ReadonlySet<string> = new Set(),
): ReminderTimer[] {
  const timers: ReminderTimer[] = [];

  for (const reminder of planned) {
    const delay = reminder.at.getTime() - now.getTime();
    // Precies nu is te laat: een timer van nul vuurt direct, en dan krijg je
    // bij elke herplanning opnieuw dezelfde melding.
    if (delay <= 0 || delay > HORIZON_MS) continue;
    if (announced.has(reminder.key)) continue;
    timers.push({ reminder, delay });
  }

  return timers;
}
