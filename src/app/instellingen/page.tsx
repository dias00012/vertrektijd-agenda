"use client";

import { useEffect, useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { categoriesUsingPlace, sortedPlaces } from "@/lib/places";
import { LocationInput } from "@/components/LocationInput";
import { AccountSection } from "@/components/AccountSection";
import { BackupSection } from "@/components/BackupSection";
import { Spinner } from "@/components/ui";
import { TRAVEL_MODES } from "@/lib/travelModes";
import type { GeoLocation, TravelMode } from "@/lib/types";

const MAX_BUFFER_MINUTES = 120;

/** Instellingen: thuislocatie en veiligheidsmarge. */
export default function SettingsPage() {
  const { settings, hydrated, updateSettings, activities } = useAgenda();
  const [home, setHome] = useState<GeoLocation | null>(null);
  const [buffer, setBuffer] = useState("10");
  const [mode, setMode] = useState<TravelMode>("car");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    setHome(settings.home);
    setBuffer(String(settings.bufferMinutes));
    setMode(settings.travelMode);
  }, [hydrated, settings.home, settings.bufferMinutes, settings.travelMode]);

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
    updateSettings({ home, bufferMinutes: Math.round(parsed), travelMode: mode });
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

      {hydrated ? <AccountSection /> : null}

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

          <fieldset>
            <legend className="label">Standaard vervoermiddel</legend>
            <div className="grid grid-cols-4 gap-2">
              {TRAVEL_MODES.map((item) => {
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    title={item.hint}
                    onClick={() => {
                      setMode(item.id);
                      setSaved(false);
                    }}
                    className="flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active
                        ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {item.emoji}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              Geldt voor nieuwe activiteiten; per activiteit kun je hiervan afwijken.
            </p>
          </fieldset>

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

      {hydrated ? <SavedPlaces /> : null}
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
  const { settings, forgetPlace, categoryFor } = useAgenda();
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
                        const category = categoryFor(id);
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
