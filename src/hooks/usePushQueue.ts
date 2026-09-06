"use client";

import { useEffect, useRef } from "react";
import { useAgenda } from "./useAgenda";
import { plannedReminders } from "@/lib/reminders";
import { pushEnabled, replaceQueue } from "@/lib/push";

/**
 * Houdt de wachtrij op de server gelijk aan wat je agenda zegt.
 *
 * Je telefoon rekent zelf uit wanneer je moet vertrekken en zet die berichten
 * kant-en-klaar klaar. De server hoeft je agenda daardoor niet te kennen; hij
 * weet alleen "stuur deze zin om 07:04".
 *
 * Bewust rustig: hooguit een paar keer per sessie, en alleen als er echt iets
 * veranderd is. De wachtrij hoeft niet bij de seconde te kloppen.
 */

/** Zo ver vooruit vullen we de wachtrij. */
const DAYS_AHEAD = 14;
/** Niet vaker dan dit opnieuw versturen. */
const MIN_INTERVAL_MS = 5 * 60_000;

export function usePushQueue(): void {
  const { activities, settings, hydrated } = useAgenda();
  /** Wat we het laatst hebben doorgegeven, zodat we niet hetzelfde herhalen. */
  const lastSent = useRef<{ fingerprint: string; at: number } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (settings.reminderMinutes === null || settings.reminderMinutes === undefined) return;

    let active = true;

    void (async () => {
      if (!(await pushEnabled()) || !active) return;

      const messages = plannedReminders(activities, settings, new Date(), DAYS_AHEAD).map(
        (reminder) => ({
          sendAt: reminder.at.toISOString(),
          title: reminder.title,
          body: reminder.body,
        }),
      );

      const fingerprint = messages.map((m) => `${m.sendAt}|${m.title}`).join("\n");
      const previous = lastSent.current;
      if (previous && previous.fingerprint === fingerprint) return;
      if (previous && Date.now() - previous.at < MIN_INTERVAL_MS) return;

      lastSent.current = { fingerprint, at: Date.now() };
      if (active) await replaceQueue(messages);
    })();

    return () => {
      active = false;
    };
  }, [activities, settings, hydrated]);
}
