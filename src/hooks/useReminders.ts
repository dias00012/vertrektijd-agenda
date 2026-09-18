"use client";

import { useEffect, useRef, useState } from "react";
import { useAgenda } from "./useAgenda";
import { plannedReminders } from "@/lib/reminders";
import { REPLAN_MS, dueReminders } from "@/lib/reminderTimers";

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

export function useReminders(): void {
  const { activities, settings, hydrated } = useAgenda();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Wat we al gemeld hebben, zodat je het niet twee keer krijgt. */
  const announced = useRef<Set<string>>(new Set());

  const minutesBefore = settings.reminderMinutes;
  /** Tikt door zodat de planning opnieuw wordt gemaakt, ook zonder wijziging. */
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), REPLAN_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];

    if (!hydrated) return;
    if (minutesBefore === null || minutesBefore === undefined) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const now = new Date();

    // Twee dagen: een vertrek vlak na middernacht hoort bij de activiteit van
    // morgen, maar valt vanavond al binnen de horizon.
    const planned = plannedReminders(activities, settings, now, 2);

    for (const { reminder, delay } of dueReminders(planned, now, announced.current)) {
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
  }, [activities, settings, hydrated, minutesBefore, tick]);
}
