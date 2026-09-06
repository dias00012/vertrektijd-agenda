"use client";

import { useRef, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { parseIcs, type IcsEvent } from "@/lib/ical";
import { addDaysToKey, formatDateLabel, todayKey } from "@/lib/time";
import { LocationInput } from "./LocationInput";
import { placeChoices } from "@/lib/places";
import { Spinner } from "./ui";
import type { ActivityDraft, GeoLocation } from "@/lib/types";

/** Alles wat via deze weg binnenkomt krijgt deze herkomst. */
const SOURCE = "rooster";
/** Zo ver vooruit halen we lessen op. Verder is een rooster zelden bekend. */
const WEEKS_AHEAD = 8;

/**
 * Je schoolrooster koppelen.
 *
 * Roostersystemen (Magister, Somtoday, Zermelo) en agenda's (Google, Outlook)
 * kunnen allemaal een iCal-link geven. Door dat formaat te lezen werkt dit voor
 * iedereen, zonder afspraken met scholen.
 *
 * De lessen krijgen allemaal dezelfde locatie: die van je school. Het lokaal uit
 * het rooster ("A1.23") is geen adres waar een routeplanner iets mee kan.
 */
export function TimetableImport() {
  const { settings, replaceActivities, activities, categories, updateSettings } = useAgenda();
  const t = useT();

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<IcsEvent[] | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [category, setCategory] = useState("school");
  /** Alleen zinvol bij een link: een los bestand kan de app niet zelf ophalen. */
  const [keepLinked, setKeepLinked] = useState(true);
  /** Onthoudt of deze lessen uit een link kwamen of uit een bestand. */
  const [fromUrl, setFromUrl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const existing = activities.filter((activity) => activity.source === SOURCE);

  function read(text: string) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + WEEKS_AHEAD * 7 * 86_400_000);

    const found = parseIcs(text, { from, to });
    if (found.length === 0) {
      setEvents(null);
      setError(t("timetable.none", { weeks: WEEKS_AHEAD }));
      return;
    }
    setError(null);
    setEvents(found);
  }

  async function fetchUrl() {
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch("/api/rooster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !payload.text) {
        setError(payload.error ?? t("timetable.fetchFailed"));
        return;
      }
      setFromUrl(true);
      read(payload.text);
    } catch {
      setError(t("timetable.offline"));
    } finally {
      setLoading(false);
    }
  }

  async function readFile(file: File) {
    setError(null);
    setDone(null);
    try {
      setFromUrl(false);
      read(await file.text());
    } catch {
      setError(t("timetable.readFailed"));
    }
  }

  function importAll() {
    if (!events) return;

    const drafts: ActivityDraft[] = events.map((event) => ({
      category,
      // Het lokaal erbij, want dat is precies wat je wilt weten als je er staat.
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
      source: SOURCE,
    }));

    // Alles van een eerdere import vervangen: zo verdwijnen uitgevallen lessen
    // en verschoven uren vanzelf, in plaats van dubbel te komen staan.
    replaceActivities({ remove: existing.map((item) => item.id), add: drafts, source: SOURCE });

    // De link onthouden, zodat de app het rooster daarna zelf kan bijhouden.
    if (fromUrl && keepLinked && location) {
      updateSettings({
        timetable: {
          url: url.trim(),
          location,
          category,
          syncedAt: new Date().toISOString(),
        },
      });
    }

    setDone(
      (drafts.length === 1
        ? t("timetable.importedOne")
        : t("timetable.imported", { count: drafts.length })) +
        (existing.length > 0 ? t("timetable.replaced", { count: existing.length }) : "."),
    );
    setEvents(null);
  }

  const preview = events?.slice(0, 6) ?? [];
  const lastDate = events?.[events.length - 1]?.date;

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#127979; {t("timetable.title")}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("timetable.body")}
      </p>

      <div className="mt-3">
        <label className="label" htmlFor="rooster-url">
          {t("timetable.urlLabel")}
        </label>
        <input
          id="rooster-url"
          type="url"
          inputMode="url"
          className="field"
          placeholder="https://... .ics"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void fetchUrl()}
          disabled={loading || url.trim().length === 0}
        >
          {loading ? <Spinner size={16} /> : t("timetable.fetch")}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInput.current?.click()}
          disabled={loading}
        >
          {t("timetable.orFile")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }} role="alert">
          &#9888;&#65039; {error}
        </p>
      ) : null}

      {done ? (
        <p className="mt-3 text-sm" style={{ color: "var(--accent)" }} role="status">
          &#10003; {done}
        </p>
      ) : null}

      {events ? (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm font-semibold">
            {events.length === 1
              ? t("timetable.foundOne")
              : t("timetable.found", { count: events.length })}
            <span className="font-normal" style={{ color: "var(--muted)" }}>
              {lastDate
                ? ` ${t("timetable.until", { date: formatDateLabel(lastDate, new Date()) })}`
                : ""}
            </span>
          </p>

          <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
            {preview.map((event) => (
              <li key={event.uid} className="tabular-nums">
                {formatDateLabel(event.date, new Date())} &middot; {event.startTime}&ndash;
                {event.endTime} &middot;{" "}
                <span style={{ color: "var(--ink)" }}>{event.title}</span>
                {event.location ? ` (${event.location})` : ""}
              </li>
            ))}
            {events.length > preview.length ? (
              <li>{t("timetable.andMore", { count: events.length - preview.length })}</li>
            ) : null}
          </ul>

          <div className="mt-4">
            <LocationInput
              label={t("timetable.where")}
              value={location}
              onChange={setLocation}
              required
              places={placeChoices(settings)}
              placeholder={t("timetable.wherePlaceholder")}
              hint={t("timetable.whereHint")}
            />
          </div>

          <div className="mt-3">
            <span className="label">{t("timetable.asType")}</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={category === item.id}
                  onClick={() => setCategory(item.id)}
                  className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                  style={{
                    borderColor: category === item.id ? item.color : "var(--line)",
                    color: category === item.id ? item.color : "var(--muted)",
                  }}
                >
                  {item.emoji} {item.label}
                </button>
              ))}
            </div>
          </div>

          {existing.length > 0 ? (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              {t("timetable.replaceNote", { count: existing.length })}
            </p>
          ) : null}

          {fromUrl ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                checked={keepLinked}
                onChange={(event) => setKeepLinked(event.target.checked)}
              />
              <span style={{ color: "var(--muted)" }}>{t("timetable.keepLink")}</span>
            </label>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={importAll}
              disabled={!location}
            >
              {t("timetable.doImport")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEvents(null)}>
              {t("common.cancel")}
            </button>
          </div>
          {!location ? (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              {t("timetable.needPlace")}
            </p>
          ) : null}
        </div>
      ) : null}

      {settings.timetable?.url && !events ? (
        <div
          className="mt-3 rounded-xl px-3 py-2.5 text-xs"
          style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
        >
          <p>
            &#128260;{" "}
            {t("timetable.linked", {
              when: settings.timetable.syncedAt
                ? formatDateLabel(settings.timetable.syncedAt.slice(0, 10), new Date())
                : t("timetable.never"),
            })}
          </p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => {
              updateSettings({ timetable: null });
              setDone(t("timetable.unlinked"));
            }}
          >
            {t("timetable.unlink")}
          </button>
        </div>
      ) : null}

      {existing.length > 0 && !events ? (
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          &#128197;{" "}
          {t("timetable.current", {
            count: existing.length,
            date: formatDateLabel(
              existing.map((item) => item.date).sort().at(-1) ?? todayKey(),
              new Date(),
            ),
          })}
        </p>
      ) : null}

      <p className="mt-3 text-[0.7rem]" style={{ color: "var(--muted)" }}>
        {t("timetable.horizon", {
          weeks: WEEKS_AHEAD,
          date: formatDateLabel(addDaysToKey(todayKey(), WEEKS_AHEAD * 7), new Date()),
        })}
      </p>
    </section>
  );
}
