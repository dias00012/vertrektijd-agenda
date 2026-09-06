"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
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
  const t = useT();

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

    setTo({ label: params.get("toLabel") ?? t("travel.destination"), lat, lon });
    const arriveBy = params.get("arriveBy");
    if (arriveBy) {
      const parsed = new Date(arriveBy);
      if (!Number.isNaN(parsed.getTime())) {
        setWhen("arrive");
        setDateTime(toLocalInput(parsed));
      }
    }
  }, [hydrated, t]);

  const search = useCallback(
    async (cursor?: string) => {
      if (!from || !to) {
        setError(t("travel.needBoth"));
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
          transitBike: settings.transitBike ?? "none",
        });
        setJourneys(result.journeys);
        setCursors({ previous: result.previousCursor, next: result.nextCursor });
      } catch (err) {
        setJourneys([]);
        setCursors({});
        setError(err instanceof Error ? err.message : t("travel.failed"));
      } finally {
        setLoading(false);
      }
    },
    [from, to, when, dateTime, t, settings.transitBike],
  );

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError(t("travel.noGeolocation"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFrom({
          label: t("travel.myLocation"),
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setError(t("travel.locationFailed"));
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
        <h1 className="text-2xl font-semibold tracking-tight">{t("travel.title")}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("travel.subtitle")}
        </p>
      </header>

      <section className="card space-y-4 px-5 py-5" aria-label={t("travel.search")}>
        {/* Op een laptop stonden van, wisselen en naar onder elkaar met een
            lege rechterhelft ernaast. Naast elkaar lees je de rit als één regel. */}
        <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start lg:gap-3 lg:space-y-0">
        <LocationInput
          label={t("travel.from")}
          value={from}
          onChange={setFrom}
          required
          includeStops
          places={places}
          placeholder={t("travel.placeholder")}
          extraActions={
            // Thuis, gym en school staan al bij de snelkeuzes hieronder.
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="rounded-full border px-2.5 py-1 text-xs transition-colors"
              style={{ borderColor: "var(--line)", color: "var(--muted)" }}
            >
              {locating ? t("travel.locating") : `📍 ${t("travel.myLocation")}`}
            </button>
          }
        />

        <div className="flex justify-center lg:pt-7">
          <button
            type="button"
            onClick={swap}
            aria-label={t("travel.swap")}
            className="rounded-full border px-3 py-1 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
          >
            <span aria-hidden className="block lg:rotate-90">
              &#8645;
            </span>
          </button>
        </div>

        <LocationInput
          label={t("travel.to")}
          value={to}
          onChange={setTo}
          required
          includeStops
          places={places}
          placeholder={t("travel.placeholder")}
        />
        </div>

        <div>
          <span className="label">{t("travel.when")}</span>
          <div
            className="flex rounded-xl border p-0.5"
            style={{ borderColor: "var(--line)" }}
            role="group"
            aria-label={t("travel.time")}
          >
            {(
              [
                { id: "now", key: "travel.now" },
                { id: "depart", key: "travel.depart" },
                { id: "arrive", key: "travel.arrive" },
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
                {t(option.key)}
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
          {loading ? <Spinner size={16} /> : t("travel.go")}
        </button>
      </section>

      {loading && journeys.length === 0 ? (
        <div className="card mt-4 px-5 py-10 text-center">
          <Spinner size={18} label={t("travel.searching")} />
        </div>
      ) : journeys.length > 0 ? (
        <section className="mt-4" aria-label={t("journey.options")}>
          {cursors.previous ? (
            <button
              type="button"
              className="btn btn-ghost mb-2.5 w-full text-xs"
              onClick={() => void search(cursors.previous)}
              disabled={loading}
            >
              &#8593; {t("travel.earlier")}
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
              &#8595; {t("travel.later")}
            </button>
          ) : null}
        </section>
      ) : searched && !error ? (
        <div className="mt-4">
          <EmptyState
            icon="🚉"
            title={t("travel.empty.title")}
            description={t("travel.empty.body")}
          />
        </div>
      ) : null}
    </div>
  );
}
