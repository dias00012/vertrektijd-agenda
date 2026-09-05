"use client";

import { useState } from "react";
import { activityColor, getCategory } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { computeDeparture, computeReturn } from "@/lib/travel";
import { formatDistance, formatDuration } from "@/lib/time";
import { describeRecurrence } from "@/lib/recurrence";
import { ActivityForm } from "./ActivityForm";
import { ErrorNote, Spinner } from "./ui";
import type { ActivityOccurrence } from "@/lib/types";

/**
 * Eén activiteit in de agenda, inclusief reistijd en vertrektijd.
 * Klikken opent hetzelfde formulier als bij toevoegen, in bewerkmodus.
 */
export function ActivityCard({ activity }: { activity: ActivityOccurrence }) {
  const { settings, calculatingIds, retryTravel } = useAgenda();
  const [editing, setEditing] = useState(false);

  const category = getCategory(activity.category);
  const color = activityColor(activity);
  const departure = computeDeparture(activity, settings);
  const back = computeReturn(activity, settings);
  const calculating = calculatingIds.has(activity.id);

  return (
    <>
      <article
        className="card overflow-hidden"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full px-4 py-3.5 text-left"
          aria-label={`${category.label}: ${activity.title} bewerken`}
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-lg leading-none">
              {category.emoji}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="truncate text-[0.95rem] font-semibold">{activity.title}</h3>
                <span
                  className="text-[0.7rem] font-semibold uppercase tracking-wide"
                  style={{ color }}
                >
                  {category.label}
                </span>
                {activity.source === "leerplan" ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium"
                    style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
                  >
                    📚 leerplan
                  </span>
                ) : null}
              </div>

              <p className="mt-0.5 text-sm tabular-nums" style={{ color: "var(--muted)" }}>
                {activity.startTime} &ndash; {activity.endTime}
              </p>

              {activity.recurrence ? (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  &#128257; {describeRecurrence(activity.recurrence)}
                </p>
              ) : null}

              {activity.location ? (
                <p className="mt-1.5 truncate text-xs" style={{ color: "var(--muted)" }}>
                  &#128205; {activity.location.label}
                </p>
              ) : null}

              {activity.location ? (
                <div className="mt-2 space-y-1">
                  {calculating ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      <Spinner size={12} label="Reistijd berekenen…" />
                    </p>
                  ) : activity.travelError ? (
                    <ErrorNote
                      onRetry={() => {
                        retryTravel(activity.id);
                      }}
                    >
                      {activity.travelError}
                    </ErrorNote>
                  ) : !settings.home ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      Stel je thuislocatie in voor de vertrektijd.
                    </p>
                  ) : departure && activity.travel ? (
                    <>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        &#128663; Reistijd: {formatDuration(activity.travel.durationMinutes)}
                        <span className="opacity-70">
                          {" "}
                          &middot; {formatDistance(activity.travel.distanceKm)}
                        </span>
                      </p>
                      <p className="text-sm font-semibold tabular-nums">
                        &#127968; Vertrekken om {departure.time}
                        {departure.previousDay ? (
                          <span className="ml-1 text-xs font-normal" style={{ color: "var(--muted)" }}>
                            (dag ervoor)
                          </span>
                        ) : null}
                      </p>
                      {back ? (
                        <p className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                          &#8617;&#65039; Terug: {formatDuration(back.travelMinutes)} &middot; thuis om{" "}
                          {back.time}
                          {back.nextDay ? " (volgende dag)" : ""}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </button>
      </article>

      {editing ? (
        <ActivityForm
          activity={activity}
          occurrenceDate={activity.date}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
