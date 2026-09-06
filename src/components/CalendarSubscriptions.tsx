"use client";

import { useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { parseIcs } from "@/lib/ical";
import { formatDateLabel } from "@/lib/time";
import { placeChoices } from "@/lib/places";
import { subscriptionSource } from "@/hooks/useTimetableSync";
import { LocationInput } from "./LocationInput";
import { Spinner } from "./ui";
import type { ActivityDraft, CalendarSubscription, GeoLocation } from "@/lib/types";

/** Zo ver vooruit halen we afspraken op; gelijk aan het rooster. */
const WEEKS_AHEAD = 8;

/**
 * Je eigen agenda erbij.
 *
 * Je lesrooster staat in Magister of Zermelo, maar de rest van je leven staat
 * in Google, Apple of Outlook. Die kunnen allemaal een ical-link geven. Door
 * daarop te abonneren staan je eigen afspraken ook in je vertrektijden, en
 * blijven ze vanzelf bijgewerkt.
 *
 * Een plek is hier optioneel, anders dan bij het rooster: veel van wat in je
 * eigen agenda staat is thuis of online, en dan valt er niets te reizen.
 */
export function CalendarSubscriptions() {
  const { settings, activities, categories, replaceActivities, updateSettings } = useAgenda();
  const t = useT();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("hobby");
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const calendars = settings.calendars ?? [];

  function reset() {
    setAdding(false);
    setName("");
    setUrl("");
    setCategory("hobby");
    setLocation(null);
    setError(null);
  }

  /** Haalt de agenda op, zet de afspraken erin en bewaart het abonnement. */
  async function add() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const response = await fetch("/api/rooster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !payload.text) {
        setError(payload.error ?? t("calendars.fetchFailed"));
        return;
      }

      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + WEEKS_AHEAD * 7 * 86_400_000);
      const found = parseIcs(payload.text, { from, to });
      if (found.length === 0) {
        setError(t("calendars.none", { weeks: WEEKS_AHEAD }));
        return;
      }

      const subscription: CalendarSubscription = {
        id: crypto.randomUUID(),
        name: name.trim() || t("calendars.defaultName"),
        url: trimmed,
        category,
        location,
        syncedAt: new Date().toISOString(),
      };

      const drafts: ActivityDraft[] = found.map((event) => ({
        category,
        title: event.location ? `${event.title} (${event.location})` : event.title,
        date: event.date,
        endDate: event.endDate,
        allDay: event.allDay,
        startTime: event.startTime,
        endTime: event.endTime,
        location,
        color: null,
        travelMode: null,
        recurrence: null,
        source: subscriptionSource(subscription.id),
      }));

      replaceActivities({ remove: [], add: drafts, source: subscriptionSource(subscription.id) });
      updateSettings({ calendars: [...calendars, subscription] });
      setDone(
        found.length === 1
          ? t("calendars.addedOne", { name: subscription.name })
          : t("calendars.added", { name: subscription.name, count: found.length }),
      );
      reset();
    } catch {
      setError(t("calendars.offline"));
    } finally {
      setBusy(false);
    }
  }

  /** Haalt het abonnement weg, inclusief alles wat eruit kwam. */
  function forget(calendar: CalendarSubscription) {
    const source = subscriptionSource(calendar.id);
    replaceActivities({
      remove: activities.filter((item) => item.source === source).map((item) => item.id),
      add: [],
      source,
    });
    updateSettings({ calendars: calendars.filter((item) => item.id !== calendar.id) });
    setDone(t("calendars.removed", { name: calendar.name }));
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128197; {t("calendars.title")}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("calendars.body")}
      </p>

      {calendars.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {calendars.map((calendar) => {
            const count = activities.filter(
              (item) => item.source === subscriptionSource(calendar.id),
            ).length;
            return (
              <li
                key={calendar.id}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "var(--surface-soft)" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{calendar.name}</span>
                  <span className="block text-xs" style={{ color: "var(--muted)" }}>
                    {t("calendars.status", {
                      count,
                      when: calendar.syncedAt
                        ? formatDateLabel(calendar.syncedAt.slice(0, 10), new Date())
                        : t("calendars.never"),
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs underline"
                  style={{ color: "var(--muted)" }}
                  onClick={() => forget(calendar)}
                >
                  {t("calendars.remove")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {adding ? (
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="calendar-name">
              {t("calendars.name")}
            </label>
            <input
              id="calendar-name"
              type="text"
              className="field"
              placeholder={t("calendars.namePlaceholder")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="calendar-url">
              {t("calendars.url")}
            </label>
            <input
              id="calendar-url"
              type="url"
              className="field"
              placeholder="https://calendar.google.com/calendar/ical/..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {t("calendars.urlHint")}
            </p>
          </div>

          <div>
            <span className="label">{t("calendars.asType")}</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((item) => {
                const active = category === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(item.id)}
                    className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--surface-soft)" : "transparent",
                      color: active ? "var(--ink)" : "var(--muted)",
                    }}
                  >
                    {item.emoji} {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <LocationInput
            label={t("calendars.where")}
            value={location}
            onChange={setLocation}
            places={placeChoices(settings)}
            placeholder={t("calendars.wherePlaceholder")}
            hint={t("calendars.whereHint")}
          />

          {error ? (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || url.trim().length === 0}
              onClick={add}
            >
              {busy ? <Spinner size={16} /> : t("calendars.add")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost mt-3"
          onClick={() => {
            setDone(null);
            setAdding(true);
          }}
        >
          {calendars.length === 0 ? t("calendars.addFirst") : t("calendars.addAnother")}
        </button>
      )}

      {done ? (
        <p className="mt-3 text-xs" style={{ color: "var(--accent)" }}>
          {done}
        </p>
      ) : null}

      <p className="mt-3 text-[0.7rem]" style={{ color: "var(--muted)" }}>
        {t("calendars.privacy")}
      </p>
    </section>
  );
}
