"use client";

import { useCallback, useEffect, useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { fetchJourneys } from "@/lib/api";
import { placeChoices } from "@/lib/places";
import { LocationInput } from "@/components/LocationInput";
import { JourneyCard } from "@/components/JourneyCard";
import { EmptyState, Spinner } from "@/components/ui";
import type { GeoLocation, Journey } from "@/lib/types";

type WhenMode = "now" | "depart" | "arrive";

/** "2026-09-08T09:00" — de vorm die <input type="datetime-local"> verwacht. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Reisplanner: zoek een rit met trein, bus, tram of metro. */
export default function TravelPlannerPage() {
  const { settings, hydrated } = useAgenda();

  const [from, setFrom] = useState<GeoLocation | null>(null);
  const [to, setTo] = useState<GeoLocation | null>(null);
  const [when, setWhen] = useState<WhenMode>("now");
  const [dateTime, setDateTime] = useState(() => toLocalInput(new Date()));

  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [cursors, setCursors] = useState<{ previous?: string; next?: string }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [locating, setLocating] = useState(false);

  const places = hydrated ? placeChoices(settings) : [];

  // Vertrekpunt standaard op thuis: dat is bijna altijd waar je vandaan gaat.
  useEffect(() => {
    if (hydrated && !from && settings.home) setFrom(settings.home);
  }, [hydrated, from, settings.home]);

  // Vanuit de agenda kun je doorlinken: /reizen?toLat=..&toLon=..&toLabel=..&arriveBy=ISO
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const lat = Number(params.get("toLat"));
    const lon = Number(params.get("toLon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;

    setTo({ label: params.get("toLabel") ?? "Bestemming", lat, lon });
    const arriveBy = params.get("arriveBy");
    if (arriveBy) {
      const parsed = new Date(arriveBy);
      if (!Number.isNaN(parsed.getTime())) {
        setWhen("arrive");
        setDateTime(toLocalInput(parsed));
      }
    }
  }, [hydrated]);

  const search = useCallback(
    async (cursor?: string) => {
      if (!from || !to) {
        setError("Kies een vertrekpunt en een bestemming.");
        return;
      }
      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const result = await fetchJourneys(from, to, {
          // Bij bladeren bepaalt de cursor het tijdvenster.
          ...(cursor
            ? { cursor }
            : {
                time: when === "now" ? undefined : new Date(dateTime).toISOString(),
                arriveBy: when === "arrive",
              }),
          count: 5,
        });
        setJourneys(result.journeys);
        setCursors({ previous: result.previousCursor, next: result.nextCursor });
      } catch (err) {
        setJourneys([]);
        setCursors({});
        setError(err instanceof Error ? err.message : "De reis kon niet worden gepland.");
      } finally {
        setLoading(false);
      }
    },
    [from, to, when, dateTime],
  );

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Je browser ondersteunt locatiebepaling niet.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFrom({
          label: "Mijn locatie",
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setError("Kon je locatie niet bepalen. Geef de app toestemming of vul een adres in.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Reisplanner</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Plan je rit met trein, bus, tram of metro, inclusief live vertragingen.
        </p>
      </header>

      <section className="card space-y-4 px-5 py-5" aria-label="Reis zoeken">
        <LocationInput
          label="Van"
          value={from}
          onChange={setFrom}
          required
          includeStops
          places={places}
          placeholder="Station, halte of adres"
          extraActions={
            // Thuis, gym en school staan al bij de snelkeuzes hieronder.
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="rounded-full border px-2.5 py-1 text-xs transition-colors"
              style={{ borderColor: "var(--line)", color: "var(--muted)" }}
            >
              {locating ? "Zoeken…" : "\u{1F4CD} Mijn locatie"}
            </button>
          }
        />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={swap}
            aria-label="Vertrek en bestemming omwisselen"
            className="rounded-full border px-3 py-1 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
          >
            &#8645;
          </button>
        </div>

        <LocationInput
          label="Naar"
          value={to}
          onChange={setTo}
          required
          includeStops
          places={places}
          placeholder="Station, halte of adres"
        />

        <div>
          <span className="label">Wanneer</span>
          <div
            className="flex rounded-xl border p-0.5"
            style={{ borderColor: "var(--line)" }}
            role="group"
            aria-label="Tijdstip"
          >
            {(
              [
                { id: "now", label: "Nu" },
                { id: "depart", label: "Vertrek" },
                { id: "arrive", label: "Aankomst" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={when === option.id}
                onClick={() => setWhen(option.id)}
                className="flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: when === option.id ? "var(--surface-soft)" : "transparent",
                  color: when === option.id ? "var(--ink)" : "var(--muted)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {when !== "now" ? (
            <input
              type="datetime-local"
              className="field mt-2"
              value={dateTime}
              onChange={(event) => setDateTime(event.target.value)}
            />
          ) : null}
        </div>

        {error ? (
          <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
            &#9888;&#65039; {error}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => void search()}
          disabled={loading || !from || !to}
        >
          {loading ? <Spinner size={16} /> : "Zoek reis"}
        </button>
      </section>

      {loading && journeys.length === 0 ? (
        <div className="card mt-4 px-5 py-10 text-center">
          <Spinner size={18} label="Ritten zoeken…" />
        </div>
      ) : journeys.length > 0 ? (
        <section className="mt-4" aria-label="Reismogelijkheden">
          {cursors.previous ? (
            <button
              type="button"
              className="btn btn-ghost mb-2.5 w-full text-xs"
              onClick={() => void search(cursors.previous)}
              disabled={loading}
            >
              &#8593; Eerdere ritten
            </button>
          ) : null}

          <div className="space-y-2.5">
            {journeys.map((journey) => (
              <JourneyCard key={journey.id} journey={journey} />
            ))}
          </div>

          {cursors.next ? (
            <button
              type="button"
              className="btn btn-ghost mt-2.5 w-full text-xs"
              onClick={() => void search(cursors.next)}
              disabled={loading}
            >
              &#8595; Latere ritten
            </button>
          ) : null}
        </section>
      ) : searched && !error ? (
        <div className="mt-4">
          <EmptyState
            icon="🚉"
            title="Geen ritten gevonden"
            description="Probeer een ander tijdstip, of een halte in de buurt."
          />
        </div>
      ) : null}
    </div>
  );
}
