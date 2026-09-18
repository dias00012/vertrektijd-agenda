"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { fetchJourneys, type JourneyDiagnostics } from "@/lib/api";
import { placeChoices } from "@/lib/places";
import { track } from "@/lib/stats";
import { LocationInput } from "@/components/LocationInput";
import { JourneyCard } from "@/components/JourneyCard";
import { endOfDay, latestOnTime } from "@/lib/journeyList";
import { ActivityForm } from "@/components/ActivityForm";
import { minutesToTime, timeToMinutes, toDateKey } from "@/lib/time";
import { legTime } from "@/lib/travelModes";
import { useNow } from "@/hooks/useNow";
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

/**
 * De id van de kortste rit, of null als alle opties even lang duren: dan zegt
 * een merkje "snelste" niets en is het alleen maar ruis.
 */
function fastestJourneyId(journeys: Journey[]): string | null {
  if (journeys.length < 2) return null;
  const fastest = journeys.reduce((best, journey) =>
    journey.durationMinutes < best.durationMinutes ? journey : best,
  );
  const shared = journeys.every(
    (journey) => journey.durationMinutes === fastest.durationMinutes,
  );
  return shared ? null : fastest.id;
}

/** Eén regel in de technische details. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium">{label}</dt>
      <dd className="min-w-0 break-words tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Naam plus coordinaten. Juist die coordinaten doen ertoe: kies je in de lijst
 * de straat in plaats van het huisnummer, dan rekent de planner vanaf het
 * midden van die straat en kan hij bij een andere halte uitkomen.
 */
function pointLabel(point: GeoLocation | null): string {
  if (!point) return "—";
  return `${point.label} (${point.lat.toFixed(5)}, ${point.lon.toFixed(5)})`;
}

/** Reisplanner: zoek een rit met trein, bus, tram of metro. */
export default function TravelPlannerPage() {
  const { settings, hydrated } = useAgenda();
  const t = useT();

  const [from, setFrom] = useState<GeoLocation | null>(null);
  const [to, setTo] = useState<GeoLocation | null>(null);
  const [when, setWhen] = useState<WhenMode>("now");
  const [dateTime, setDateTime] = useState(() => toLocalInput(new Date()));

  const now = useNow(60_000);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  /*
   * De aankomsttijd waarop de lijst die er nú staat gezocht is.
   *
   * Apart van het formulier, want daar mag je in blijven typen zonder opnieuw
   * te zoeken -- dan hoort het merkje nog bij de vorige vraag. Bij bladeren
   * blijft hij staan: "eerder" en "later" veranderen het tijdvenster, niet de
   * vraag hoe laat je er moet zijn.
   */
  const [arrivalTarget, setArrivalTarget] = useState<string | null>(null);
  /** De rit die je in je agenda wilt zetten; null = het formulier is dicht. */
  const [toAgenda, setToAgenda] = useState<Journey | null>(null);
  const [cursors, setCursors] = useState<{ previous?: string; next?: string }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // Losstaand van `error`: het einde van de dienstregeling is geen storing.
  const [notice, setNotice] = useState<string | null>(null);
  /** Wat de planner deed; alleen zichtbaar als je erom vraagt. */
  const [details, setDetails] = useState<JourneyDiagnostics | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [locating, setLocating] = useState(false);

  const places = hydrated ? placeChoices(settings) : [];
  // De lijst staat op vertrektijd; de snelste rit hoeft dus niet bovenaan te
  // staan. Alleen merken als er echt iets te kiezen valt.
  const fastestId = fastestJourneyId(journeys);
  // Bij "uiterlijk aankomen om" is dit de rit die je zocht: de laatste die het
  // nog haalt. Hij staat onderaan, want de lijst is een vertrekbord.
  const latestId = arrivalTarget ? latestOnTime(journeys, new Date(arrivalTarget)) : null;

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
    async (
      cursor?: string,
      direction: "next" | "previous" = "next",
      /*
       * Een vraag die niet uit het formulier komt, zoals "laatste rit
       * vanavond". Meegeven en niet eerst de velden aanpassen: dan hoeft er
       * niet gewacht te worden tot React die verandering verwerkt heeft, en
       * blijft staan wat jij had ingevuld.
       */
      override?: { time: string; arriveBy: boolean },
    ) => {
      if (!from || !to) {
        setError(t("travel.needBoth"));
        return;
      }
      setLoading(true);
      setError(null);
      setNotice(null);
      setSearched(true);
      const vraag = override ?? {
        time: when === "now" ? "" : new Date(dateTime).toISOString(),
        arriveBy: when === "arrive",
      };
      if (!cursor) {
        setArrivalTarget(vraag.arriveBy && vraag.time ? vraag.time : null);
      }

      try {
        const result = await fetchJourneys(from, to, {
          // Bij bladeren bepaalt de cursor het tijdvenster.
          ...(cursor
            ? { cursor }
            : {
                time: vraag.time || undefined,
                arriveBy: vraag.arriveBy,
              }),
          count: 5,
          // In de reisplanner kies je zelf van en naar; het vertrekpunt staat
          // standaard op thuis, dus daar staat je fiets.
          bike:
            settings.transitBike === "both"
              ? "both"
              : settings.transitBike === "start"
                ? "origin"
                : "none",
        });
        track("reis_gezocht");
        setCursors({ previous: result.previousCursor, next: result.nextCursor });
        setDetails(result.meta ?? null);

        // Voorbij de laatste rit van de dag geeft de planner een lege pagina
        // terug. Die niet tonen als "geen verbinding" en vooral: de lijst die
        // er staat laten staan, zodat je niet opnieuw hoeft te zoeken.
        if (cursor && result.journeys.length === 0) {
          setNotice(t(direction === "previous" ? "travel.noEarlier" : "travel.noLater"));
          return;
        }
        setJourneys(result.journeys);
      } catch (err) {
        // Mislukt het bladeren, dan blijft staan wat je al had.
        if (!cursor) {
          setJourneys([]);
          setCursors({});
        }
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

        {/*
          "Hoe laat moet ik uiterlijk weg om vanavond nog thuis te komen" is
          een andere vraag dan een tijdstip invullen, en het is de vraag die je
          's avonds op school stelt. Onder water is het gewoon een zoekopdracht
          op aankomst, met middernacht als grens -- dus wijst het merkje
          "laatste op tijd" vanzelf de goede rit aan.
        */}
        <button
          type="button"
          className="btn btn-ghost w-full text-sm"
          onClick={() => {
            const grens = endOfDay(now);
            setWhen("arrive");
            setDateTime(toLocalInput(grens));
            void search(undefined, "next", { time: grens.toISOString(), arriveBy: true });
          }}
          disabled={loading || !from || !to}
          title={t("travel.lastTonightHint")}
        >
          {t("travel.lastTonight")}
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
              onClick={() => void search(cursors.previous, "previous")}
              disabled={loading}
            >
              &#8593; {t("travel.earlier")}
            </button>
          ) : null}

          <div className="space-y-2.5">
            {journeys.map((journey) => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                fastest={journey.id === fastestId}
                latestOnTime={journey.id === latestId}
                now={now}
                onToAgenda={() => setToAgenda(journey)}
              />
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

          {notice ? (
            <p className="mt-2.5 text-center text-xs" style={{ color: "var(--muted)" }}>
              {notice}
            </p>
          ) : null}

          {/* Klopt een rit niet, dan is dit het antwoord op "hoe kom ik erachter
              waarom". Eén schermafbeelding hiervan vertelt waar het misgaat:
              welke planner antwoordde, hoeveel opties er binnenkwamen, en van
              welk punt er precies gerekend is. */}
          {details ? (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                aria-expanded={showDetails}
                className="text-xs underline underline-offset-2"
                style={{ color: "var(--muted)" }}
              >
                {showDetails ? t("travel.why.hide") : t("travel.why")}
              </button>

              {showDetails ? (
                <dl
                  className="card mt-2 space-y-1 px-4 py-3 text-left text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  <p className="mb-2">{t("travel.why.intro")}</p>
                  <Detail label={t("travel.why.from")} value={pointLabel(from)} />
                  <Detail label={t("travel.why.to")} value={pointLabel(to)} />
                  <Detail
                    label={t("travel.why.planner")}
                    value={details.planVersion ?? "?"}
                  />
                  <Detail
                    label={t("travel.why.transfers")}
                    value={t(details.routedTransfers ? "travel.why.on" : "travel.why.off")}
                  />
                  <Detail
                    label="—"
                    value={t("travel.why.options", {
                      received: details.received,
                      shown: details.shown,
                    })}
                  />
                  {details.directOnly ? <p>{t("travel.why.directOnly")}</p> : null}
                </dl>
              ) : null}
            </div>
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

      {/*
        Het gewone activiteitenformulier, met de rit er al in.
        
        Bewust geen activiteit die stilletjes wordt aangemaakt: welk type het
        is en hoe het heet weet alleen jij. Wat de app wél weet vult hij in --
        de bestemming en hoe laat je er bent.

        De begintijd is je aankomst, niet je vertrek. De agenda rekent de
        vertrektijd zelf uit en houdt hem bij met de vertragingen van dat
        moment; zou de rit er als blok in staan, dan stond er straks een tijd
        van vandaag bij een dag van volgende week.
      */}
      {toAgenda ? (
        <ActivityForm
          preset={{
            date: toDateKey(new Date(toAgenda.arrival)),
            startTime: legTime(toAgenda.arrival) ?? "09:00",
            endTime: minutesToTime(
              timeToMinutes(legTime(toAgenda.arrival) ?? "09:00") + 60,
            ),
            location: to,
            title: t("journey.toAgendaTitle"),
            travelMode: "transit",
          }}
          onClose={() => setToAgenda(null)}
        />
      ) : null}
    </div>
  );
}
