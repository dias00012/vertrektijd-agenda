"use client";

import { useEffect, useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { getCategory } from "@/lib/categories";
import { categoriesUsingPlace, placeForCategory, sortedPlaces } from "@/lib/places";
import {
  PLAN_LOCATION_CATEGORIES,
  WEEK_PLAN_SOURCE,
  buildWeekPlanDrafts,
  isWeekPlanActivity,
  weekPlanByDay,
} from "@/lib/weekPlan";
import { startOfWeekKey, todayKey } from "@/lib/time";
import { LocationInput } from "@/components/LocationInput";
import { AccountSection } from "@/components/AccountSection";
import { BackupSection } from "@/components/BackupSection";
import { Spinner } from "@/components/ui";
import type { GeoLocation } from "@/lib/types";

const MAX_BUFFER_MINUTES = 120;

/** Instellingen: thuislocatie en veiligheidsmarge. */
export default function SettingsPage() {
  const { settings, hydrated, updateSettings, activities } = useAgenda();
  const [home, setHome] = useState<GeoLocation | null>(null);
  const [buffer, setBuffer] = useState("10");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    setHome(settings.home);
    setBuffer(String(settings.bufferMinutes));
  }, [hydrated, settings.home, settings.bufferMinutes]);

  const activitiesWithLocation = activities.filter((activity) => activity.location).length;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);

    if (!home) {
      setError("Kies een locatie uit de suggesties, zodat de app het adres kan vinden.");
      return;
    }
    const parsed = Number(buffer);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_BUFFER_MINUTES) {
      setError(`Vul een marge in tussen 0 en ${MAX_BUFFER_MINUTES} minuten.`);
      return;
    }

    setError(null);
    // Wijzigt de thuislocatie? Dan herberekent de store alle reistijden zelf.
    updateSettings({ home, bufferMinutes: Math.round(parsed) });
    setSaved(true);
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Instellingen</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Vanaf deze plek worden alle reistijden berekend.
        </p>
      </header>

      {!hydrated ? (
        <div className="card px-5 py-10 text-center">
          <Spinner size={18} label="Instellingen laden…" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="card space-y-5 px-5 py-5">
          <div>
            <h2 className="mb-3 text-base font-semibold">&#127968; Mijn thuislocatie</h2>
            <LocationInput
              label="Adres of plaats"
              value={home}
              onChange={(value) => {
                setHome(value);
                setSaved(false);
              }}
              required
              placeholder="Bijv. Stationsplein 1, Almere"
              hint="Typ je adres en kies een van de suggesties."
            />
          </div>

          <div>
            <label className="label" htmlFor="buffer">
              Veiligheidsmarge
            </label>
            <div className="flex items-center gap-2">
              <input
                id="buffer"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_BUFFER_MINUTES}
                className="field w-28"
                value={buffer}
                onChange={(event) => {
                  setBuffer(event.target.value);
                  setSaved(false);
                }}
              />
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                minuten extra voor vertrek
              </span>
            </div>
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              Vertrektijd = starttijd &minus; reistijd &minus; marge.
            </p>
          </div>

          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
              &#9888;&#65039; {error}
            </p>
          ) : null}

          {saved ? (
            <p className="text-sm" style={{ color: "var(--accent)" }} role="status">
              &#10003; Opgeslagen.
              {activitiesWithLocation > 0
                ? ` De reistijden van ${activitiesWithLocation} ${
                    activitiesWithLocation === 1 ? "activiteit" : "activiteiten"
                  } worden opnieuw berekend.`
                : ""}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary w-full sm:w-auto">
            Opslaan
          </button>
        </form>
      )}

      {hydrated ? <AccountSection /> : null}
      {hydrated ? <SavedPlaces /> : null}
      {hydrated ? <WeekPlanner /> : null}
      {hydrated ? <BackupSection /> : null}

      <section className="card mt-4 px-5 py-4">
        <h2 className="text-sm font-semibold">Over de reistijden</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          Reistijden worden met de auto berekend via een routeservice op de server, zonder rekening
          te houden met actuele drukte. Je gegevens blijven lokaal op dit apparaat opgeslagen.
        </p>
      </section>
    </div>
  );
}

/** Overzicht van bewaarde locaties, met de categorieën die ze als vaste plek gebruiken. */
function SavedPlaces() {
  const { settings, forgetPlace } = useAgenda();
  const places = sortedPlaces(settings);

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128205; Opgeslagen locaties</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Locaties die je bij een activiteit bewaart, verschijnen hier. Ze staan als snelkeuze in
        het formulier, en de vaste locatie van een categorie wordt automatisch ingevuld.
      </p>

      {places.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
          Nog geen locaties bewaard. Vink bij een activiteit &ldquo;Onthouden als vaste
          locatie&rdquo; aan.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {places.map((place) => {
            const categories = categoriesUsingPlace(settings, place.id);
            return (
              <li
                key={place.id}
                className="flex items-start gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{place.name}</p>
                  {categories.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {categories.map((id) => {
                        const category = getCategory(id);
                        return (
                          <span
                            key={id}
                            className="rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
                            style={{
                              background: `color-mix(in srgb, ${category.color} 15%, transparent)`,
                              color: category.color,
                            }}
                          >
                            Vast voor {category.emoji} {category.label}
                          </span>
                        );
                      })}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      Alleen als snelkeuze
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => forgetPlace(place.id)}
                  aria-label={`${place.name} verwijderen`}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm"
                  style={{ color: "var(--danger)" }}
                >
                  &#10005;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Zet de standaardweek in één keer in de agenda: werk ma t/m do, school op
 * vrijdag, vier keer sporten, elke dag koken en de hobby's ertussendoor.
 */
function WeekPlanner() {
  const { settings, activities, replaceActivities } = useAgenda();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ added: number; replaced: number } | null>(null);

  // Wat er al uit de weekplanning in de agenda staat; dat wordt vervangen.
  const existing = activities.filter(isWeekPlanActivity);
  const own = activities.length - existing.length;

  const days = weekPlanByDay();
  const total = days.reduce((sum, day) => sum + day.items.length, 0);

  // Categorieën uit het plan waarvoor nog geen vaste locatie bekend is.
  const missing = PLAN_LOCATION_CATEGORIES.filter(
    (category) => !placeForCategory(settings, category),
  );

  function applyPlan() {
    const drafts = buildWeekPlanDrafts(settings, startOfWeekKey(todayKey()));
    replaceActivities({
      remove: existing.map((activity) => activity.id),
      add: drafts,
      source: WEEK_PLAN_SOURCE,
    });
    setResult({ added: drafts.length, replaced: existing.length });
    setOpen(false);
  }

  function clearPlan() {
    replaceActivities({ remove: existing.map((activity) => activity.id), add: [] });
    setResult({ added: 0, replaced: existing.length });
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128197; Mijn weekplanning</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Zet je vaste week in één keer klaar: werken ma t/m do en school op vrijdag (9:00&ndash;17:00),
        vier keer sporten, elke dag zelf koken, en lezen, gitaar en gamen verdeeld over de week.
        Alles komt als herhalende activiteit in je agenda, dus je kunt elk onderdeel daarna
        losstaand aanpassen.
      </p>

      {missing.length > 0 ? (
        <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--surface-soft)" }}>
          &#9888;&#65039; Nog geen vaste locatie voor{" "}
          {missing.map((id) => getCategory(id).label.toLowerCase()).join(", ")}. Die activiteiten
          komen zonder locatie in je agenda &mdash; vul ze later aan, dan rekent de app de
          vertrektijden alsnog uit.
        </p>
      ) : (
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          &#128205; Gebruikt je opgeslagen locaties voor{" "}
          {PLAN_LOCATION_CATEGORIES.map((id) => getCategory(id).label.toLowerCase()).join(", ")}.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-3 text-xs font-medium underline underline-offset-2"
        style={{ color: "var(--muted)" }}
        aria-expanded={open}
      >
        {open ? "Overzicht verbergen" : `Bekijk de week (${total} activiteiten)`}
      </button>

      {open ? (
        <ul className="mt-3 space-y-3">
          {days.map((day) => (
            <li key={day.weekday}>
              <p className="text-xs font-semibold capitalize">{day.label}</p>
              {day.items.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Vrij
                </p>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {day.items.map((item) => {
                    const category = getCategory(item.category);
                    return (
                      <li
                        key={`${item.title}-${item.startTime}`}
                        className="flex gap-2 text-xs tabular-nums"
                        style={{ color: "var(--muted)" }}
                      >
                        <span className="w-24 shrink-0">
                          {item.startTime}&ndash;{item.endTime}
                        </span>
                        <span style={{ color: category.color }}>{category.emoji}</span>
                        <span>{item.title}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {result ? (
        <p className="mt-4 text-sm" style={{ color: "var(--accent)" }} role="status">
          &#10003;{" "}
          {result.added === 0
            ? `Weekplanning verwijderd (${result.replaced} ${
                result.replaced === 1 ? "reeks" : "reeksen"
              }).`
            : result.replaced > 0
              ? `Weekplanning bijgewerkt: ${result.replaced} oude ${
                  result.replaced === 1 ? "reeks" : "reeksen"
                } vervangen door ${result.added}.`
              : `${result.added} reeksen toegevoegd. Bekijk ze in de agenda.`}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={applyPlan} className="btn btn-primary">
          {existing.length > 0 ? "Weekplanning opnieuw instellen" : "Weekplanning in mijn agenda zetten"}
        </button>
        {existing.length > 0 ? (
          <button type="button" onClick={clearPlan} className="btn btn-danger">
            Weekplanning verwijderen
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        {existing.length > 0
          ? `Er ${existing.length === 1 ? "staat" : "staan"} al ${existing.length} ${
              existing.length === 1 ? "reeks" : "reeksen"
            } uit de weekplanning in je agenda. Die worden vervangen, niet verdubbeld.`
          : "Het plan komt naast wat je zelf hebt toegevoegd."}
        {own > 0
          ? ` Je ${own === 1 ? "eigen activiteit blijft" : `${own} eigen activiteiten blijven`} staan.`
          : ""}
      </p>
    </section>
  );
}
