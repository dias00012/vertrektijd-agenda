"use client";

import { useEffect, useRef } from "react";
import { useAgenda } from "./useAgenda";
import { plannedReminders } from "@/lib/reminders";

/**
 * Herinneringen: "over 15 minuten vertrekken".
 *
 * Wat dit wél doet: zolang de app open staat (ook als tabblad op de achtergrond
 * of als geïnstalleerde app) krijg je op tijd een melding op je scherm.
 *
 * Voor als de app helemaal dicht is bestaat `usePushQueue`; die zet dezelfde
 * berichten kant-en-klaar op de server. Allebei rekenen ze met
 * `plannedReminders`, zodat ze nooit iets anders kunnen zeggen.
 */

/** Zo ver vooruit plannen we meldingen; verder is een timer niet betrouwbaar. */
const HORIZON_MS = 6 * 60 * 60 * 1000;

export function useReminders(): void {
  const { activities, settings, hydrated } = useAgenda();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Wat we al gemeld hebben, zodat je het niet twee keer krijgt. */
  const announced = useRef<Set<string>>(new Set());

  const minutesBefore = settings.reminderMinutes;

  useEffect(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];

    if (!hydrated) return;
    if (minutesBefore === null || minutesBefore === undefined) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const now = new Date();

    for (const reminder of plannedReminders(activities, settings, now, 1)) {
      const delay = reminder.at.getTime() - now.getTime();
      if (delay <= 0 || delay > HORIZON_MS) continue;
      if (announced.current.has(reminder.key)) continue;

      timers.current.push(
        setTimeout(() => {
          announced.current.add(reminder.key);
          try {
            new Notification(reminder.title, {
              body: reminder.body,
              tag: reminder.key,
              icon: "/icon-192.png",
            });
          } catch {
            // Sommige browsers staan een losse Notification alleen via de
            // service worker toe; dan valt de melding stil weg.
          }
        }, delay),
      );
    }

    return () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    };
  }, [activities, settings, hydrated, minutesBefore]);
}
