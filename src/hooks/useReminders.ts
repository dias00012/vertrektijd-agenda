"use client";

import { useEffect, useRef } from "react";
import { useAgenda } from "./useAgenda";
import { activitiesOnDate } from "@/lib/agenda";
import { computeDeparture, departureDateTime } from "@/lib/travel";
import { todayKey } from "@/lib/time";

/**
 * Herinneringen: "over 15 minuten vertrekken".
 *
 * Wat dit wél doet: zolang de app open staat (ook als tabblad op de achtergrond
 * of als geïnstalleerde app) krijg je op tijd een melding op je scherm.
 *
 * Wat dit níét doet: je wekken terwijl de app helemaal dicht is. Daarvoor is een
 * pushserver nodig die jouw agenda kent en op het juiste moment iets stuurt —
 * dat is een aparte stap, en die vraagt dat je agenda op een server leesbaar is.
 * Die keuze is bewust nog niet gemaakt.
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
    const today = activitiesOnDate(activities, todayKey(now));

    for (const occurrence of today) {
      const departure = computeDeparture(occurrence, settings);
      const departAt = departureDateTime(occurrence, settings);
      if (!departure || !departAt) continue;

      const fireAt = departAt.getTime() - minutesBefore * 60_000;
      const delay = fireAt - now.getTime();
      if (delay <= 0 || delay > HORIZON_MS) continue;

      const key = `${occurrence.occurrenceId}@${departure.time}`;
      if (announced.current.has(key)) continue;

      timers.current.push(
        setTimeout(() => {
          announced.current.add(key);
          try {
            new Notification(`Vertrek om ${departure.time}`, {
              body: `${occurrence.title} begint om ${occurrence.startTime}. Over ${minutesBefore} minuten moet je weg.`,
              tag: occurrence.occurrenceId,
              icon: "/icon.svg",
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
