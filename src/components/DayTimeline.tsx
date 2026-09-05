"use client";

import { useState } from "react";
import { activityColor, getCategory } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { buildTimeline, type TimelineEntry } from "@/lib/agenda";
import { formatDuration, minutesToTime } from "@/lib/time";
import { ActivityForm } from "./ActivityForm";
import type { ActivityOccurrence } from "@/lib/types";

/**
 * Chronologisch dagoverzicht waarin vertrekmomenten als eigen regel tussen de
 * activiteiten staan.
 */
export function DayTimeline({ dateKey }: { dateKey: string }) {
  const { activities, settings } = useAgenda();
  const [editing, setEditing] = useState<ActivityOccurrence | null>(null);
  const entries = buildTimeline(activities, settings, dateKey);

  return (
    <>
      <ol className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id}>
            <TimelineRow entry={entry} onSelect={() => setEditing(entry.activity)} />
          </li>
        ))}
      </ol>

      {editing ? (
        <ActivityForm
          activity={editing}
          occurrenceDate={editing.date}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function TimelineRow({ entry, onSelect }: { entry: TimelineEntry; onSelect: () => void }) {
  const category = getCategory(entry.activity.category);
  const color = activityColor(entry.activity);
  const isDeparture = entry.kind === "departure";
  const isReturn = entry.kind === "return";
  // Vertrek- en terugregels zijn allebei reisregels: dezelfde ingetogen opmaak.
  const isTravel = isDeparture || isReturn;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-stretch gap-3 rounded-2xl px-1 py-1 text-left transition-colors hover:bg-[var(--surface-soft)]"
    >
      <span
        className="w-14 shrink-0 pt-3 text-right text-sm font-semibold tabular-nums"
        style={{ color: isTravel ? "var(--muted)" : "var(--ink)" }}
      >
        {entry.time}
      </span>

      <span className="relative flex w-3 shrink-0 justify-center" aria-hidden>
        <span className="absolute inset-y-0 w-px" style={{ background: "var(--line)" }} />
        <span
          className="relative mt-4 h-2.5 w-2.5 rounded-full"
          style={{
            background: isTravel ? "var(--canvas)" : color,
            border: isTravel ? `2px solid ${color}` : "none",
          }}
        />
      </span>

      {isTravel ? (
        <span className="min-w-0 flex-1 py-2.5">
          <span className="block text-sm font-medium" style={{ color: "var(--muted)" }}>
            {isDeparture ? (
              <>&#128663; Vertrekken naar {entry.activity.title.toLowerCase()}</>
            ) : (
              <>&#8617;&#65039; Terug naar huis</>
            )}
          </span>
          {isDeparture && entry.activity.travel ? (
            <span className="block text-xs" style={{ color: "var(--muted)" }}>
              {formatDuration(entry.activity.travel.durationMinutes)} rijden naar{" "}
              {entry.activity.location?.label}
            </span>
          ) : null}
          {isReturn && entry.returnMinutes !== undefined ? (
            <span className="block text-xs tabular-nums" style={{ color: "var(--muted)" }}>
              {formatDuration(entry.returnMinutes)} rijden &middot; thuis om{" "}
              {minutesToTime(entry.minutes + entry.returnMinutes)}
            </span>
          ) : null}
        </span>
      ) : (
        <span
          className="min-w-0 flex-1 rounded-2xl px-3 py-2.5"
          style={{
            background: `color-mix(in srgb, ${color} 10%, transparent)`,
          }}
        >
          <span className="flex items-baseline gap-2">
            <span aria-hidden>{category.emoji}</span>
            <span className="truncate text-sm font-semibold">{entry.activity.title}</span>
          </span>
          <span className="mt-0.5 block text-xs tabular-nums" style={{ color: "var(--muted)" }}>
            {entry.activity.startTime} &ndash; {entry.activity.endTime}
            {entry.activity.location ? ` · ${entry.activity.location.label}` : ""}
          </span>
        </span>
      )}
    </button>
  );
}
