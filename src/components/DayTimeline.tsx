"use client";

import { useState } from "react";
import { activityColor, getCategory } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { buildTimeline, type TimelineEntry } from "@/lib/agenda";
import { formatDuration, minutesToTime, timeToMinutes } from "@/lib/time";
import { travelModeMeta } from "@/lib/travelModes";
import { ActivityForm } from "./ActivityForm";
import type { ActivityOccurrence } from "@/lib/types";

/**
 * Chronologisch dagoverzicht waarin vertrekmomenten als eigen regel tussen de
 * activiteiten staan.
 *
 * `now` (optioneel): momenten die vandaag al voorbij zijn worden gedempt, zodat
 * in één oogopslag zichtbaar is wat al is geweest en wat er nog aankomt.
 */
export function DayTimeline({ dateKey, now }: { dateKey: string; now?: Date }) {
  const { activities, settings } = useAgenda();
  const [editing, setEditing] = useState<ActivityOccurrence | null>(null);
  const entries = buildTimeline(activities, settings, dateKey);

  // Alleen dempen wanneer we naar de dag van 'now' kijken.
  const nowMinutes =
    now && dateKey === toKey(now) ? now.getHours() * 60 + now.getMinutes() : null;

  return (
    <>
      <ol className="space-y-1">
        {entries.map((entry) => {
          const passed = nowMinutes !== null && passedMinutesFor(entry) <= nowMinutes;
          return (
            <li key={entry.id}>
              <TimelineRow
                entry={entry}
                passed={passed}
                onSelect={() => setEditing(entry.activity)}
              />
            </li>
          );
        })}
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

function toKey(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Het moment (minuten sinds middernacht) waarop een regel "voorbij" is. */
function passedMinutesFor(entry: TimelineEntry): number {
  if (entry.kind === "activity") return timeToMinutes(entry.activity.endTime);
  if (entry.kind === "return" && entry.returnMinutes !== undefined) {
    return entry.minutes + entry.returnMinutes;
  }
  return entry.minutes;
}

function TimelineRow({
  entry,
  passed,
  onSelect,
}: {
  entry: TimelineEntry;
  passed: boolean;
  onSelect: () => void;
}) {
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
      style={{ opacity: passed ? 0.45 : 1 }}
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
              <>
                {entry.activity.travel
                  ? travelModeMeta(entry.activity.travel.mode).emoji
                  : "\u{1F697}"}{" "}
                Vertrekken naar {entry.activity.title.toLowerCase()}
              </>
            ) : (
              <>&#8617;&#65039; Terug naar huis</>
            )}
          </span>
          {isDeparture && entry.activity.travel ? (
            <span className="block text-xs" style={{ color: "var(--muted)" }}>
              {formatDuration(entry.activity.travel.durationMinutes)}{" "}
              {entry.activity.travel.mode === "car" ? "rijden" : "reizen"} naar{" "}
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
            {entry.activity.source === "leerplan" ||
            entry.activity.linkedTaskId ||
            entry.activity.linkedExamId ? (
              <span aria-hidden title="Leer-/werkblok uit je leerplan">
                📚
              </span>
            ) : null}
            {passed ? (
              <span className="text-[0.6rem] font-semibold" style={{ color: "var(--muted)" }}>
                ✓
              </span>
            ) : null}
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
