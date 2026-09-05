"use client";

import { formatDuration } from "@/lib/time";
import { LEG_EMOJI, describeLeg, legTime, meaningfulLegs } from "@/lib/travelModes";
import type { TravelInfo } from "@/lib/types";

/**
 * De onderdelen van een OV-reis: lopen naar de halte, welke trein of bus, van
 * welk spoor en hoe laat. Uitklapbaar, zodat de agenda rustig blijft.
 *
 * Bewust een <details>-element: de activiteitkaart is zelf al een knop, en een
 * knop in een knop mag niet in HTML.
 */
export function JourneyDetails({ travel, label }: { travel: TravelInfo; label: string }) {
  const legs = meaningfulLegs(travel.legs);
  if (legs.length === 0) return null;

  const transfers = travel.transfers ?? 0;

  return (
    <details className="mt-2 rounded-xl px-3 py-2" style={{ background: "var(--surface-soft)" }}>
      <summary className="cursor-pointer text-xs font-medium" style={{ color: "var(--muted)" }}>
        {label} &middot; {formatDuration(travel.durationMinutes)}
        {transfers > 0
          ? ` · ${transfers} ${transfers === 1 ? "overstap" : "overstappen"}`
          : " · zonder overstappen"}
      </summary>

      <ol className="mt-2 space-y-2">
        {legs.map((leg, index) => {
          const start = legTime(leg.departure);
          const end = legTime(leg.arrival);
          return (
            <li key={`${leg.from}-${leg.to}-${index}`} className="flex gap-2 text-xs">
              <span className="w-10 shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
                {start ?? ""}
              </span>
              <span aria-hidden className="shrink-0">
                {LEG_EMOJI[leg.mode]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{describeLeg(leg)}</span>
                {leg.line || leg.mode === "rail" || leg.mode === "bus" || leg.mode === "tram" ? (
                  <span className="block" style={{ color: "var(--muted)" }}>
                    {leg.from}
                    {leg.track ? ` · spoor ${leg.track}` : ""}
                    {end ? ` → ${leg.to} (${end})` : leg.to ? ` → ${leg.to}` : ""}
                  </span>
                ) : (
                  <span className="block" style={{ color: "var(--muted)" }}>
                    {formatDuration(leg.durationMinutes)}
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
