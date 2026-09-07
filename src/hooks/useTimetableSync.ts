"use client";

import { useEffect, useRef } from "react";
import { headers } from "@/lib/api";
import { useAgenda } from "./useAgenda";
import { parseIcs } from "@/lib/ical";
import { compareTimetable } from "@/lib/timetableChanges";
import { saveChanges } from "@/lib/changeLog";
import { track } from "@/lib/stats";
import { todayKey } from "@/lib/time";
import type { ActivityDraft, CalendarSubscription, Settings } from "@/lib/types";

/**
 * Houdt je gekoppelde agenda's bij: je lesrooster en de agenda's waarop je je
 * hebt geabonneerd.
 *
 * Een rooster verandert: een les vervalt, een uur verschuift, er komt een toets
 * bij. Zonder dit zou je dat elke keer zelf moeten ophalen, en precies dan is
 * de kans het grootst dat je vertrektijd niet meer klopt.
 *
 * Bewust stil op de achtergrond en hoogstens één keer per dag per agenda: het
 * is een extraatje, geen reden om de app te laten wachten of een server te
 * belasten. Mislukt het, dan blijft staan wat er al stond.
 */

/** Herkomst van alles wat via het gekoppelde lesrooster binnenkomt. */
const TIMETABLE_SOURCE = "rooster";
/** Herkomst per geabonneerde agenda; het id houdt ze uit elkaar. */
export function subscriptionSource(id: string): string {
  return `agenda:${id}`;
}
/** Zo ver vooruit halen we afspraken op; gelijk aan het importscherm. */
const WEEKS_AHEAD = 8;
/** Niet vaker dan dit; een rooster verandert hooguit een paar keer per week. */
const MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Eén agenda die opgehaald kan worden, ongeacht waar hij vandaan komt. */
interface Feed {
  source: string;
  url: string;
  category: string;
  location: CalendarSubscription["location"];
  syncedAt: string | null;
}

/** Het rooster en je eigen agenda's, in dezelfde vorm. */
function feedsOf(settings: Settings): Feed[] {
  const feeds: Feed[] = [];
  if (settings.timetable?.url) {
    feeds.push({
      source: TIMETABLE_SOURCE,
      url: settings.timetable.url,
      category: settings.timetable.category,
      location: settings.timetable.location,
      syncedAt: settings.timetable.syncedAt,
    });
  }
  for (const calendar of settings.calendars ?? []) {
    if (!calendar.url) continue;
    feeds.push({
      source: subscriptionSource(calendar.id),
      url: calendar.url,
      category: calendar.category,
      location: calendar.location,
      syncedAt: calendar.syncedAt,
    });
  }
  return feeds;
}

/** Is deze agenda toe aan een verversing? */
function isDue(feed: Feed): boolean {
  const last = feed.syncedAt ? Date.parse(feed.syncedAt) : 0;
  return !Number.isFinite(last) || Date.now() - last >= MIN_INTERVAL_MS;
}

export function useTimetableSync(): void {
  const { settings, hydrated, activities, replaceActivities, updateSettings } = useAgenda();
  /** Bronnen die op dit moment al opgehaald worden. */
  const running = useRef(new Set<string>());

  // Alleen de links en tijdstippen als afhankelijkheid: `activities` verandert
  // door deze verversing zelf en zou hem anders meteen opnieuw starten.
  const fingerprint = feedsOf(settings)
    .map((feed) => `${feed.source}|${feed.url}|${feed.syncedAt ?? ""}`)
    .join("\n");

  useEffect(() => {
    if (!hydrated) return;

    const due = feedsOf(settings).filter((feed) => isDue(feed) && !running.current.has(feed.source));
    if (due.length === 0) return;

    let active = true;

    for (const feed of due) {
      running.current.add(feed.source);

      void (async () => {
        try {
          const response = await fetch("/api/rooster", {
            method: "POST",
            headers: headers({ "Content-Type": "application/json" }),
            body: JSON.stringify({ url: feed.url }),
          });
          if (!response.ok) return;

          const payload = (await response.json()) as { text?: string };
          if (!payload.text || !active) return;

          const from = new Date();
          from.setHours(0, 0, 0, 0);
          const to = new Date(from.getTime() + WEEKS_AHEAD * 7 * 86_400_000);
          const found = parseIcs(payload.text, { from, to });
          // Een lege agenda is verdacht (vakantie, of een link die stukging).
          // Dan liever niets doen dan alles weggooien.
          if (found.length === 0 || !active) return;

          const drafts: ActivityDraft[] = found.map((event) => ({
            category: feed.category,
            title: event.location ? `${event.title} (${event.location})` : event.title,
            date: event.date,
            endDate: event.endDate,
            allDay: event.allDay,
            startTime: event.startTime,
            endTime: event.endTime,
            location: feed.location,
            color: null,
            travelMode: null,
            recurrence: null,
            source: feed.source,
          }));

          // Vergelijken vóór vervangen: dit is het enige moment waarop de app
          // iets weet dat jij nog niet weet. Een vervallen eerste uur meldt
          // Magister zelf niet.
          const mine = activities.filter((item) => item.source === feed.source);
          const changes = compareTimetable(mine, drafts, todayKey());
          if (changes.length > 0) {
            saveChanges(changes);
            track("rooster_gewijzigd");
          }

          replaceActivities({
            remove: mine.map((item) => item.id),
            add: drafts,
            source: feed.source,
          });
        } catch {
          // Geen bereik of een haperende server: morgen weer een dag.
        } finally {
          if (active) markSynced(feed.source);
          running.current.delete(feed.source);
        }
      })();
    }

    /** Zet het tijdstip weg waarop deze agenda voor het laatst is geprobeerd. */
    function markSynced(source: string) {
      const now = new Date().toISOString();
      // Op de huidige instellingen rekenen, niet op de momentopname van toen
      // dit effect begon. Twee agenda's die vlak na elkaar klaar zijn schreven
      // anders allebei hun eigen versie van de lijst terug, en dan raakte de
      // eerste zijn tijdstip kwijt — waarna hij bij de volgende tik meteen
      // opnieuw ging ophalen, eindeloos.
      if (source === TIMETABLE_SOURCE) {
        updateSettings((current) =>
          current.timetable ? { timetable: { ...current.timetable, syncedAt: now } } : {},
        );
        return;
      }
      updateSettings((current) => ({
        calendars: (current.calendars ?? []).map((calendar) =>
          subscriptionSource(calendar.id) === source ? { ...calendar, syncedAt: now } : calendar,
        ),
      }));
    }

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, fingerprint]);
}
