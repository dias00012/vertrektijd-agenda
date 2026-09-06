"use client";

import { useEffect, useRef } from "react";
import { useAgenda } from "./useAgenda";
import { parseIcs } from "@/lib/ical";
import type { ActivityDraft } from "@/lib/types";

/**
 * Houdt je gekoppelde rooster bij.
 *
 * Een rooster verandert: een les vervalt, een uur verschuift, er komt een toets
 * bij. Zonder dit zou je dat elke keer zelf moeten ophalen, en precies dan is
 * de kans het grootst dat je vertrektijd niet meer klopt.
 *
 * Bewust stil op de achtergrond en hoogstens één keer per dag: het is een
 * extraatje, geen reden om de app te laten wachten of de roosterserver te
 * belasten. Mislukt het, dan blijft je bestaande rooster gewoon staan.
 */

/** Alles wat via het gekoppelde rooster binnenkomt krijgt deze herkomst. */
const SOURCE = "rooster";
/** Zo ver vooruit halen we lessen op; gelijk aan het importscherm. */
const WEEKS_AHEAD = 8;
/** Niet vaker dan dit; een rooster verandert hooguit een paar keer per week. */
const MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function useTimetableSync(): void {
  const { settings, hydrated, activities, replaceActivities, updateSettings } = useAgenda();
  /** Voorkomt dat een tweede weergave dezelfde verversing nog eens start. */
  const running = useRef(false);

  const timetable = settings.timetable;

  useEffect(() => {
    if (!hydrated || !timetable?.url || running.current) return;

    const last = timetable.syncedAt ? Date.parse(timetable.syncedAt) : 0;
    if (Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS) return;

    running.current = true;
    let active = true;

    (async () => {
      try {
        const response = await fetch("/api/rooster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: timetable.url }),
        });
        if (!response.ok) return;

        const payload = (await response.json()) as { text?: string };
        if (!payload.text || !active) return;

        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date(from.getTime() + WEEKS_AHEAD * 7 * 86_400_000);
        const found = parseIcs(payload.text, { from, to });
        // Een leeg rooster is verdacht (vakantie, of een link die stukging).
        // Dan liever niets doen dan alles weggooien.
        if (found.length === 0 || !active) return;

        const drafts: ActivityDraft[] = found.map((event) => ({
          category: timetable.category,
          title: event.location ? `${event.title} (${event.location})` : event.title,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          location: timetable.location,
          color: null,
          travelMode: null,
          recurrence: null,
          source: SOURCE,
        }));

        replaceActivities({
          remove: activities.filter((item) => item.source === SOURCE).map((item) => item.id),
          add: drafts,
          source: SOURCE,
        });
      } catch {
        // Geen bereik of een haperende roosterserver: morgen weer een dag.
      } finally {
        if (active) {
          updateSettings({ timetable: { ...timetable, syncedAt: new Date().toISOString() } });
        }
        running.current = false;
      }
    })();

    return () => {
      active = false;
    };
    // Alleen op de link en het tijdstip reageren: `activities` verandert door
    // deze verversing zelf, en zou hem anders meteen opnieuw starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, timetable?.url, timetable?.syncedAt]);
}
