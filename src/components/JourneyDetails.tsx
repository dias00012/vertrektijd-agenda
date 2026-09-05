"use client";

import { formatDuration } from "@/lib/time";
import {
  LEG_EMOJI,
  describeLeg,
  journeySteps,
  legTime,
  meaningfulLegs,
  walkingMinutes,
} from "@/lib/travelModes";
import type { TravelInfo } from "@/lib/types";

/**
 * De onderdelen van een OV-reis: lopen naar de halte, welke trein of bus, van
 * welk spoor en hoe laat. De samenvatting staat altijd in beeld — welke lijnen
 * je pakt en hoe lang je loopt — de hele rit staat een tik verderop.
 *
 * Bewust een <details>-element: de activiteitkaart is zelf al een knop, en een
 * knop in een knop mag niet in HTML.
 */
export function JourneyDetails({
  travel,
  label,
  defaultOpen = false,
}: {
  travel: TravelInfo;
  label: string;
  defaultOpen?: boolean;
}) {
  const legs = meaningfulLegs(travel.legs);
  if (legs.length === 0) return null;

  const transfers = travel.transfers ?? 0;
  const steps = journeySteps(travel.legs);
  const walking = walkingMinutes(travel.legs);
  const start = legTime(travel.plannedDeparture);
  const end = legTime(travel.plannedArrival);

  return (
    <details
      open={defaultOpen}
      className="mt-2 rounded-xl px-3 py-2"
      style={{ background: "var(--surface-soft)" }}
    >
      <summary className="cursor-pointer text-xs font-medium" style={{ color: "var(--muted)" }}>
        {label}
        {start && end ? (
          <span className="tabular-nums"> &middot; {start} &rarr; {end}</span>
        ) : null}{" "}
        &middot; {formatDuration(travel.durationMinutes)}
        {transfers > 0
          ? ` · ${transfers} ${transfers === 1 ? "overstap" : "overstappen"}`
          : " · zonder overstappen"}
      </summary>

      {/* Altijd zichtbaar zodra je de reis opent: wat pak je, hoe lang loop je. */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {steps.map((step, index) => (
          <span key={index} className="flex items-center gap-1">
            {index > 0 ? (
              <span aria-hidden className="text-[0.6rem]" style={{ color: "var(--muted)" }}>
                &rsaquo;
              </span>
            ) : null}
            <span
              className="rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium"
              style={{
                background: step.onFoot ? "transparent" : "var(--surface)",
                color: step.onFoot ? "var(--muted)" : "var(--ink)",
              }}
            >
              {step.emoji} {step.label}
            </span>
          </span>
        ))}
      </div>

      {walking >= 1 ? (
        <p className="mt-1.5 text-[0.7rem]" style={{ color: "var(--muted)" }}>
          &#128694; In totaal {formatDuration(Math.round(walking))} lopen.
        </p>
      ) : null}

      <ol className="mt-2 space-y-2">
        {legs.map((leg, index) => {
          const legStart = legTime(leg.departure);
          const legEnd = legTime(leg.arrival);
          const onFoot = leg.mode === "walk" || leg.mode === "bike";
          return (
            <li key={`${leg.from}-${leg.to}-${index}`} className="flex gap-2 text-xs">
              <span className="w-10 shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
                {legStart ?? ""}
              </span>
              <span aria-hidden className="shrink-0">
                {LEG_EMOJI[leg.mode]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {describeLeg(leg)}
                  {onFoot ? (
                    <span className="font-normal" style={{ color: "var(--muted)" }}>
                      {" "}
                      &middot; {formatDuration(leg.durationMinutes)}
                    </span>
                  ) : null}
                </span>
                {onFoot ? null : (
                  <span className="block" style={{ color: "var(--muted)" }}>
                    {leg.from}
                    {leg.track ? ` · spoor ${leg.track}` : ""}
                    {legEnd ? ` → ${leg.to} (${legEnd})` : leg.to ? ` → ${leg.to}` : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
