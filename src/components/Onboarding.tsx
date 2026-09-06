"use client";

import { useEffect, useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { LocationInput } from "./LocationInput";
import { travelModes } from "@/lib/travelModes";
import type { GeoLocation, TravelMode } from "@/lib/types";

const DONE_KEY = "agenda.onboarded.v1";

/** Heeft deze gebruiker de kennismaking al gehad? */
function alreadyDone(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Privémodus: dan vraagt hij het de volgende keer nog eens. Niet erg.
  }
}

/**
 * Kennismaking bij de eerste keer openen.
 *
 * Zonder dit ziet een nieuwe gebruiker een lege app en moet hij zelf raden waar
 * hij moet beginnen. Twee vragen zijn genoeg om de app te laten werken: waar
 * woon je, en hoe reis je meestal.
 */
export function Onboarding({
  onStartTour,
  reopen = false,
  onClose,
}: {
  /** Na het instellen gaan we de app écht laten zien. */
  onStartTour: () => void;
  /** Wordt true wanneer je de introductie zelf opnieuw opent vanuit Instellingen. */
  reopen?: boolean;
  onClose?: () => void;
}) {
  const { settings, hydrated, updateSettings } = useAgenda();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [home, setHome] = useState<GeoLocation | null>(null);
  const [mode, setMode] = useState<TravelMode>("car");
  const [buffer, setBuffer] = useState("10");

  useEffect(() => {
    if (!hydrated) return;
    // Alleen bij een echt lege app: wie al een thuislocatie heeft is al op weg.
    if (settings.home || alreadyDone()) return;
    setOpen(true);
  }, [hydrated, settings.home]);

  // Opnieuw bekijken: begin bij stap 1 en vul in wat je al hebt ingesteld, zodat
  // rondkijken je bestaande instellingen niet overschrijft met standaardwaarden.
  useEffect(() => {
    if (!reopen) return;
    setHome(settings.home);
    setMode(settings.travelMode);
    setBuffer(String(settings.bufferMinutes));
    setStep(0);
    setOpen(true);
  }, [reopen, settings.home, settings.travelMode, settings.bufferMinutes]);

  if (!open) return null;

  function close() {
    setOpen(false);
    onClose?.();
  }

  function finish(withTour: boolean) {
    updateSettings({
      home,
      travelMode: mode,
      bufferMinutes: Math.min(120, Math.max(0, Number(buffer) || 10)),
    });
    markDone();
    close();
    if (withTour) onStartTour();
  }

  function skip() {
    markDone();
    close();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welkom bij Vertrektijd"
    >
      <div className="card animate-sheet-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none px-5 py-6 sm:rounded-2xl">
        {/* Voortgang: drie stappen, zodat je weet hoe lang dit duurt. */}
        <div className="mb-5 flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: index <= step ? "var(--accent)" : "var(--line)" }}
            />
          ))}
        </div>

        {step === 0 ? (
          <>
            <p aria-hidden className="text-3xl">
              🕐
            </p>
            <h2 className="mt-2 text-xl font-semibold">Je hebt om 09:00 school.</h2>
            <p className="mt-1 text-xl font-semibold" style={{ color: "var(--accent)" }}>
              Je moet om 08:23 vertrekken.
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              Dat is het hele idee. Jij zet erin wat je gaat doen en waar; de app rekent uit hoe
              laat je de deur uit moet, met de auto, de fiets of het OV, inclusief overstappen en
              vertragingen.
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              Twee vragen en je kunt beginnen.
            </p>
          </>
        ) : step === 1 ? (
          <>
            <h2 className="text-lg font-semibold">Waar vertrek je vandaan?</h2>
            <p className="mt-1 mb-4 text-sm" style={{ color: "var(--muted)" }}>
              Meestal je huis. Vanaf dit punt worden al je reistijden berekend.
            </p>
            <LocationInput
              label="Thuisadres"
              value={home}
              onChange={setHome}
              required
              placeholder="Straat en huisnummer, of plaats"
            />
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Hoe reis je meestal?</h2>
            <p className="mt-1 mb-4 text-sm" style={{ color: "var(--muted)" }}>
              Per activiteit kun je hier altijd van afwijken.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {travelModes().map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={mode === item.id}
                  onClick={() => setMode(item.id)}
                  className="rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors"
                  style={{
                    borderColor: mode === item.id ? "var(--accent)" : "var(--line)",
                    background: mode === item.id ? "var(--surface-soft)" : "transparent",
                  }}
                >
                  <span aria-hidden className="block text-lg">
                    {item.emoji}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="onboard-buffer">
                Hoeveel minuten wil je speling?
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="onboard-buffer"
                  type="number"
                  min={0}
                  max={120}
                  className="field"
                  value={buffer}
                  onChange={(event) => setBuffer(event.target.value)}
                />
                <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                  minuten extra
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Die tijd wordt van je vertrektijd afgehaald, zodat je niet op het randje aankomt.
              </p>
            </div>
          </>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Terug
            </button>
          ) : (
            <button
              type="button"
              className="text-xs underline"
              style={{ color: "var(--muted)" }}
              onClick={skip}
            >
              {reopen ? "Sluiten" : "Overslaan"}
            </button>
          )}

          <div className="ml-auto">
            {step < 2 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !home}
              >
                {step === 0 ? "Beginnen" : "Volgende"}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => finish(true)}>
                Laat de app zien
              </button>
            )}
          </div>
        </div>

        {step === 1 && !home ? (
          <p className="mt-2 text-right text-xs" style={{ color: "var(--muted)" }}>
            Kies een suggestie uit de lijst om verder te gaan.
          </p>
        ) : null}
        {step === 2 ? (
          <button
            type="button"
            className="mt-3 block w-full text-center text-xs underline"
            style={{ color: "var(--muted)" }}
            onClick={() => finish(false)}
          >
            Opslaan en zelf rondkijken, zonder rondleiding
          </button>
        ) : null}
      </div>
    </div>
  );
}
