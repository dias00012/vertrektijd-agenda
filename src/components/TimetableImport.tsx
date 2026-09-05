"use client";

import { useRef, useState } from "react";
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
  const { settings, replaceActivities, activities, categories } = useAgenda();

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<IcsEvent[] | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [category, setCategory] = useState("school");
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
      setError(
        `Geen lessen gevonden in de komende ${WEEKS_AHEAD} weken. Klopt de link, en staat je rooster er al in?`,
      );
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
        setError(payload.error ?? "Het rooster kon niet worden opgehaald.");
        return;
      }
      read(payload.text);
    } catch {
      setError("Het rooster kon niet worden opgehaald. Controleer je internetverbinding.");
    } finally {
      setLoading(false);
    }
  }

  async function readFile(file: File) {
    setError(null);
    setDone(null);
    try {
      read(await file.text());
    } catch {
      setError("Dit bestand kon niet worden gelezen.");
    }
  }

  function importAll() {
    if (!events) return;

    const drafts: ActivityDraft[] = events.map((event) => ({
      category,
      // Het lokaal erbij, want dat is precies wat je wilt weten als je er staat.
      title: event.location ? `${event.title} (${event.location})` : event.title,
      date: event.date,
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

    setDone(
      `${drafts.length} ${drafts.length === 1 ? "les" : "lessen"} in je agenda gezet` +
        (existing.length > 0 ? `, ${existing.length} uit de vorige import vervangen.` : "."),
    );
    setEvents(null);
  }

  const preview = events?.slice(0, 6) ?? [];
  const lastDate = events?.[events.length - 1]?.date;

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#127979; Schoolrooster koppelen</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Haal je rooster op uit Magister, Somtoday, Zermelo, Google Agenda of Outlook, zodat je het
        niet hoeft over te typen. Je hebt de <strong>iCal-link</strong> nodig; die vind je in dat
        systeem onder &ldquo;agenda exporteren&rdquo;, &ldquo;abonneren&rdquo; of
        &ldquo;agenda delen&rdquo;.
      </p>

      <div className="mt-3">
        <label className="label" htmlFor="rooster-url">
          Link naar je rooster
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
          {loading ? <Spinner size={16} /> : "Rooster ophalen"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInput.current?.click()}
          disabled={loading}
        >
          Of kies een .ics-bestand
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
            {events.length} {events.length === 1 ? "les" : "lessen"} gevonden
            <span className="font-normal" style={{ color: "var(--muted)" }}>
              {lastDate ? ` tot en met ${formatDateLabel(lastDate, new Date())}` : ""}
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
              <li>en nog {events.length - preview.length} andere.</li>
            ) : null}
          </ul>

          <div className="mt-4">
            <LocationInput
              label="Waar vinden deze lessen plaats?"
              value={location}
              onChange={setLocation}
              required
              places={placeChoices(settings)}
              placeholder="Adres van je school"
              hint="Het lokaal uit je rooster is geen adres; hiermee kan de app wel je reistijd berekenen."
            />
          </div>

          <div className="mt-3">
            <span className="label">Als welk type?</span>
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
              Je hebt al {existing.length} lessen uit een eerder rooster staan. Die worden
              vervangen, zodat verschoven en uitgevallen uren vanzelf kloppen. Activiteiten die je
              zelf hebt toegevoegd blijven staan.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={importAll}
              disabled={!location}
            >
              In mijn agenda zetten
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEvents(null)}>
              Annuleren
            </button>
          </div>
          {!location ? (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Kies eerst het adres van je school.
            </p>
          ) : null}
        </div>
      ) : null}

      {existing.length > 0 && !events ? (
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          &#128197; Er staan nu {existing.length} lessen uit je rooster in de agenda, tot en met{" "}
          {formatDateLabel(
            existing.map((item) => item.date).sort().at(-1) ?? todayKey(),
            new Date(),
          )}
          . Haal je rooster opnieuw op zodra er iets verandert.
        </p>
      ) : null}

      <p className="mt-3 text-[0.7rem]" style={{ color: "var(--muted)" }}>
        We halen lessen op tot {WEEKS_AHEAD} weken vooruit (nu tot{" "}
        {formatDateLabel(addDaysToKey(todayKey(), WEEKS_AHEAD * 7), new Date())}).
      </p>
    </section>
  );
}
