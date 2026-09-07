"use client";

import { useEffect, useRef } from "react";
import { useAgenda } from "./useAgenda";
import { useLanguage } from "./useLanguage";
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
  // De berichten worden hier al vertaald en kant-en-klaar op de server gezet.
  // Zonder de taal in de afhankelijkheden bleven ze na het wisselen van taal
  // in de oude taal staan tot je toevallig iets aan je agenda veranderde.
  const { language } = useLanguage();
  /** Wat we het laatst hebben doorgegeven, zodat we niet hetzelfde herhalen. */
  const lastSent = useRef<{ fingerprint: string; at: number } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (settings.reminderMinutes === null || settings.reminderMinutes === undefined) return;

    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;

    async function send(): Promise<void> {
      if (!(await pushEnabled()) || !active) return;

      const messages = plannedReminders(activities, settings, new Date(), DAYS_AHEAD).map(
        (reminder) => ({
          sendAt: reminder.at.toISOString(),
          title: reminder.title,
          body: reminder.body,
        }),
      );

      // De tekst hoort erbij: na het wisselen van taal veranderen de tijden
      // niet, maar de berichten wel.
      const fingerprint = messages.map((m) => `${m.sendAt}|${m.title}|${m.body}`).join("\n");
      const previous = lastSent.current;
      if (previous && previous.fingerprint === fingerprint) return;

      // Te snel na de vorige keer? Dan even wachten in plaats van weggooien.
      // Wie binnen vijf minuten twee dingen verzette, kreeg de tweede
      // wijziging nooit op de server: dit effect draait pas weer bij een
      // volgende wijziging, en tot die tijd stonden er verkeerde meldingen
      // klaar.
      const wait = previous ? MIN_INTERVAL_MS - (Date.now() - previous.at) : 0;
      if (wait > 0) {
        retry = setTimeout(() => void send(), wait);
        return;
      }

      lastSent.current = { fingerprint, at: Date.now() };
      if (active) await replaceQueue(messages);
    }

    void send();

    return () => {
      active = false;
      if (retry) clearTimeout(retry);
    };
  }, [activities, settings, hydrated, language]);
}
