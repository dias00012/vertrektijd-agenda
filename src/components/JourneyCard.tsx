"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/time";
import { LEG_EMOJI, describeLeg, legTime } from "@/lib/travelModes";
import { useT } from "@/hooks/useLanguage";
import type { Journey, TravelLeg } from "@/lib/types";

/**
 * Eén reismogelijkheid: vertrek, aankomst, duur en overstappen in één oogopslag,
 * met live vertraging in het rood. Uitklappen toont de hele rit.
 */
export function JourneyCard({ journey }: { journey: Journey }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const delayed = journey.delayMinutes > 0;
  const accent = journey.cancelled
    ? "var(--danger)"
    : delayed
      ? "#f97316"
      : "var(--accent)";

  // De onderdelen waar je echt iets moet doen: instappen, overstappen, lopen.
  const transitLegs = journey.legs.filter((leg) => leg.line);

  return (
    <article className="card overflow-hidden" style={{ borderLeft: `4px solid ${accent}` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-4 py-3.5 text-left"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">
            {legTime(journey.departure)}
          </span>
          <span aria-hidden style={{ color: "var(--muted)" }}>
            →
          </span>
          <span className="text-xl font-semibold tabular-nums">{legTime(journey.arrival)}</span>

          <span className="ml-auto text-right text-xs" style={{ color: "var(--muted)" }}>
            {formatDuration(journey.durationMinutes)}
            <br />
            {journey.transfers === 0
              ? t("journey.direct")
              : `${journey.transfers} ${t(
                  journey.transfers === 1 ? "journey.transfer" : "journey.transfers",
                )}`}
          </span>
        </div>

        {journey.cancelled ? (
          <p className="mt-1 text-xs font-semibold" style={{ color: "var(--danger)" }}>
            &#9888;&#65039; {t("journey.cancelled")}
          </p>
        ) : delayed ? (
          <p className="mt-1 text-xs font-semibold" style={{ color: "#f97316" }}>
            &#9200; {t("journey.delay", { count: journey.delayMinutes })}
            <span className="ml-1 font-normal" style={{ color: "var(--muted)" }}>
              {" ("}
              {t("journey.scheduled", {
                time:
                  legTime(journey.legs.find((l) => l.scheduledDeparture)?.scheduledDeparture) ?? "",
              })}
              {")"}
            </span>
          </p>
        ) : journey.realTime ? (
          <p className="mt-1 text-xs" style={{ color: "#22c55e" }}>
            &#9679; {t("journey.onTime")} &middot; {t("journey.live")}
          </p>
        ) : null}

        {/* Compacte route: welke vervoermiddelen je pakt */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {journey.legs.map((leg, index) => (
            <span key={index} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden className="text-[0.6rem]" style={{ color: "var(--muted)" }}>
                  ›
                </span>
              ) : null}
              <span
                className="rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium"
                style={{
                  background: leg.line ? "var(--surface-soft)" : "transparent",
                  color: leg.line ? "var(--ink)" : "var(--muted)",
                }}
              >
                {LEG_EMOJI[leg.mode]}
                {leg.line ? ` ${leg.line}` : ""}
              </span>
            </span>
          ))}
          <span className="ml-auto text-[0.7rem]" style={{ color: "var(--muted)" }}>
            {open ? t("journey.hide") : t("journey.show")}
          </span>
        </div>
      </button>

      {open ? (
        <ol className="space-y-3 border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
          {journey.legs.map((leg, index) => (
            <li key={index}>
              <LegRow leg={leg} />
            </li>
          ))}
        </ol>
      ) : null}

      {/* Voor schermlezers: de kern van de rit ook zonder uitklappen. */}
      <span className="sr-only">
        {transitLegs.map((leg) => `${leg.line ?? ""} van ${leg.from} naar ${leg.to}`).join(", ")}
      </span>
    </article>
  );
}

function LegRow({ leg }: { leg: TravelLeg }) {
  const t = useT();
  const delayed = (leg.delayMinutes ?? 0) > 0;

  return (
    <div className="flex gap-3 text-xs">
      <span className="w-11 shrink-0 tabular-nums">
        <span className={delayed ? "font-semibold" : ""} style={delayed ? { color: "#f97316" } : undefined}>
          {legTime(leg.departure)}
        </span>
        {delayed && leg.scheduledDeparture ? (
          <span className="block line-through" style={{ color: "var(--muted)" }}>
            {legTime(leg.scheduledDeparture)}
          </span>
        ) : null}
      </span>

      <span aria-hidden className="shrink-0">
        {LEG_EMOJI[leg.mode]}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-medium">{describeLeg(leg)}</span>
        {/* Bij een loopstuk binnen dezelfde halte zegt "X → X" niets; toon
            dan alleen hoe lang het duurt. */}
        {leg.from && leg.to && leg.from !== leg.to ? (
          <span className="block" style={{ color: "var(--muted)" }}>
            {leg.from}
            {leg.track ? ` · spoor ${leg.track}` : ""}
            {` → ${leg.to}`}
            {leg.arrival ? ` (${legTime(leg.arrival)})` : ""}
          </span>
        ) : (
          <span className="block" style={{ color: "var(--muted)" }}>
            {formatDuration(leg.durationMinutes)}
            {leg.track ? ` · spoor ${leg.track}` : ""}
          </span>
        )}
        {leg.cancelled ? (
          <span className="block font-semibold" style={{ color: "var(--danger)" }}>
            {t("journey.cancelledShort")}
          </span>
        ) : null}
      </span>
    </div>
  );
}
