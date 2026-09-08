"use client";

import { useEffect, useRef, useState } from "react";
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
/**
 * En zo vaak kijken we opnieuw. Zonder dit werd een vertrek van vanmiddag om
 * 17:00 's ochtends overgeslagen (verder weg dan de horizon) en daarna nooit
 * meer bekeken: laat je de app openstaan, dan kwam die melding gewoon niet.
 */
const REPLAN_MS = 15 * 60 * 1000;

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
    for (const reminder of plannedReminders(activities, settings, now, 2)) {
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
  }, [activities, settings, hydrated, minutesBefore, tick]);
}
