"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
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
  const t = useT();

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

  /**
   * De belofte van de app als plaatje. Een uitgewerkt voorbeeld overtuigt sneller
   * dan een alinea uitleg: je ziet meteen dat de vertrektijd uit een echte rit
   * komt, inclusief het fietsen ernaartoe en de vertraging van dat moment.
   */
  const example: {
    time: string;
    label: string;
    emoji: string;
    /** Begin en eind van de reis; die krijgen de accentkleur. */
    anchor?: boolean;
    delay?: string;
  }[] = [
    { time: "08:23", label: t("intro.exDepart"), emoji: "🚪", anchor: true },
    { time: "", label: t("intro.exBike"), emoji: "🚲" },
    { time: "", label: t("intro.exTrain"), emoji: "🚆", delay: t("intro.exDelay") },
    { time: "09:00", label: t("intro.exArrive"), emoji: "🎓", anchor: true },
  ];

  /** Wat deze app anders maakt dan de agenda die je al hebt. Drie punten, niet meer. */
  const points = [
    { emoji: "🚉", title: t("intro.point1.title"), body: t("intro.point1.body") },
    { emoji: "🚲", title: t("intro.point2.title"), body: t("intro.point2.body") },
    { emoji: "📚", title: t("intro.point3.title"), body: t("intro.point3.body") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("intro.label")}
    >
      <div className="card animate-sheet-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none px-5 py-6 sm:rounded-2xl">
        {/* Voortgang: drie stappen, zodat je weet hoe lang dit duurt. */}
        <div className="mb-4 flex gap-1.5" aria-hidden>
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
            <h2 className="text-xl leading-snug font-semibold">{t("intro.pitch1")}</h2>
            <p className="text-xl leading-snug font-semibold" style={{ color: "var(--accent)" }}>
              {t("intro.pitch2")}
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {t("intro.body")}
            </p>

            <div
              className="mt-3 rounded-xl border px-3 py-2.5"
              style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}
            >
              {example.map((row, index) => {
                const last = index === example.length - 1;
                return (
                  <div key={row.label} className="flex items-stretch gap-2.5">
                    <span
                      className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums"
                      style={{ color: row.anchor ? "var(--accent)" : "var(--muted)" }}
                    >
                      {row.time}
                    </span>
                    {/* Het lijntje van vertrek naar aankomst: het is één reis. */}
                    <span aria-hidden className="relative flex w-2 shrink-0 justify-center">
                      <span
                        className="absolute w-px"
                        style={{
                          background: "var(--line)",
                          top: index === 0 ? "0.4rem" : 0,
                          bottom: last ? "auto" : 0,
                          height: last ? "0.4rem" : undefined,
                        }}
                      />
                      <span
                        className="relative mt-1.5 h-1.5 w-1.5 rounded-full"
                        style={{ background: row.anchor ? "var(--accent)" : "var(--line)" }}
                      />
                    </span>
                    <span className={last ? "text-xs" : "pb-2.5 text-xs"}>
                      <span aria-hidden className="mr-1">
                        {row.emoji}
                      </span>
                      <span style={row.anchor ? undefined : { color: "var(--muted)" }}>
                        {row.label}
                      </span>
                      {row.delay ? (
                        <span
                          className="ml-1.5 rounded px-1 py-px text-[10px] font-semibold whitespace-nowrap"
                          style={{
                            background: "color-mix(in srgb, #f97316 18%, transparent)",
                            color: "#f97316",
                          }}
                        >
                          {row.delay}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>

            <ul className="mt-3 space-y-2.5">
              {points.map((point) => (
                <li key={point.title} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                    style={{ background: "var(--surface-soft)" }}
                  >
                    {point.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{point.title}</span>
                    <span
                      className="block text-xs leading-relaxed"
                      style={{ color: "var(--muted)" }}
                    >
                      {point.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              {t("intro.twoQuestions")}
            </p>
          </>
        ) : step === 1 ? (
          <>
            <h2 className="text-lg font-semibold">{t("intro.whereFrom")}</h2>
            <p className="mt-1 mb-4 text-sm" style={{ color: "var(--muted)" }}>
              {t("intro.whereFromBody")}
            </p>
            <LocationInput
              label={t("intro.homeAddress")}
              value={home}
              onChange={setHome}
              required
              placeholder={t("intro.homePlaceholder")}
            />
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">{t("intro.howTravel")}</h2>
            <p className="mt-1 mb-4 text-sm" style={{ color: "var(--muted)" }}>
              {t("intro.howTravelBody")}
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
                {t("intro.buffer")}
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
                  {t("intro.bufferUnit")}
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {t("intro.bufferBody")}
              </p>
            </div>
          </>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              {t("common.back")}
            </button>
          ) : (
            <button
              type="button"
              className="text-xs underline"
              style={{ color: "var(--muted)" }}
              onClick={skip}
            >
              {reopen ? t("common.close") : t("common.skip")}
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
                {step === 0 ? t("intro.start") : t("common.next")}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => finish(true)}>
                {t("intro.showApp")}
              </button>
            )}
          </div>
        </div>

        {step === 1 && !home ? (
          <p className="mt-2 text-right text-xs" style={{ color: "var(--muted)" }}>
            {t("intro.pickSuggestion")}
          </p>
        ) : null}
        {step === 2 ? (
          <button
            type="button"
            className="mt-3 block w-full text-center text-xs underline"
            style={{ color: "var(--muted)" }}
            onClick={() => finish(false)}
          >
            {t("intro.saveOnly")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
