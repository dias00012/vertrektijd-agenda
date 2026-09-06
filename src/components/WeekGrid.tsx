"use client";

import { useState } from "react";
import { activityColor } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { layoutDay, timeRangeFor, type PositionedActivity } from "@/lib/agenda";
import { calendarWeekKeys, minutesToTime, pad2, parseDateKey, toDateKey } from "@/lib/time";
import { useT } from "@/hooks/useLanguage";
import { ActivityForm } from "./ActivityForm";
import type { ActivityOccurrence } from "@/lib/types";

/** Hoogte van één uur in het raster. */
const HOUR_HEIGHT = 56;
const PX_PER_MINUTE = HOUR_HEIGHT / 60;
/** Onder deze hoogte past er geen tekst meer in een blok. */
const COMPACT_BLOCK_HEIGHT = 34;

const DAY_LABELS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

/**
 * Weekraster: zeven dagen naast elkaar op een tijdas. De reistijd staat als
 * gestreept aanloopblok direct boven de activiteit, zodat je in één oogopslag
 * ziet wanneer je de deur uit moet.
 */
export function WeekGrid({ weekStart, now }: { weekStart: string; now: Date }) {
  const { activities, settings } = useAgenda();
  const [editing, setEditing] = useState<ActivityOccurrence | null>(null);

  const dateKeys = calendarWeekKeys(weekStart);
  const days = dateKeys.map((dateKey) => layoutDay(activities, settings, dateKey));
  const range = timeRangeFor(days);
  const totalHeight = ((range.end - range.start) / 60) * HOUR_HEIGHT;

  const today = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowVisible = dateKeys.includes(today) && nowMinutes >= range.start && nowMinutes <= range.end;

  const hours = Array.from(
    { length: (range.end - range.start) / 60 + 1 },
    (_, index) => range.start / 60 + index,
  );

  return (
    <>
      <div className="card overflow-x-auto">
        <div
          className="min-w-[340px]"
          style={{ display: "grid", gridTemplateColumns: "40px repeat(7, minmax(42px, 1fr))" }}
        >
          {/* Kop met de weekdagen */}
          <div
            className="sticky left-0 z-10 border-b"
            style={{ background: "var(--surface)", borderColor: "var(--line)" }}
          />
          {dateKeys.map((dateKey) => {
            const isToday = dateKey === today;
            return (
              <div
                key={dateKey}
                className="border-b border-l px-1 py-2 text-center"
                style={{ borderColor: "var(--line)" }}
              >
                <div
                  className="text-[0.65rem] font-semibold uppercase"
                  style={{ color: "var(--muted)" }}
                >
                  {DAY_LABELS[(parseDateKey(dateKey).getDay() + 6) % 7]}
                </div>
                <div
                  className="mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
                  style={{
                    background: isToday ? "var(--accent)" : "transparent",
                    color: isToday ? "#fff" : "var(--ink)",
                  }}
                >
                  {parseDateKey(dateKey).getDate()}
                </div>
              </div>
            );
          })}

          {/* Tijdas */}
          <div
            className="sticky left-0 z-10 relative"
            style={{ height: totalHeight, background: "var(--surface)" }}
          >
            {hours.slice(0, -1).map((hour) => (
              <span
                key={hour}
                className="absolute right-1 text-[0.65rem] tabular-nums"
                style={{ top: (hour * 60 - range.start) * PX_PER_MINUTE + 2, color: "var(--muted)" }}
              >
                {pad2(hour)}:00
              </span>
            ))}
          </div>

          {/* Dagkolommen */}
          {dateKeys.map((dateKey, index) => (
            <div
              key={dateKey}
              className="relative border-l"
              style={{
                height: totalHeight,
                borderColor: "var(--line)",
                background: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${HOUR_HEIGHT}px)`,
              }}
            >
              {days[index].map((item) => (
                <GridBlock
                  key={item.occurrence.occurrenceId}
                  item={item}
                  rangeStart={range.start}
                  onSelect={() => setEditing(item.occurrence)}
                />
              ))}

              {dateKey === today && nowVisible ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 h-px"
                  style={{
                    top: (nowMinutes - range.start) * PX_PER_MINUTE,
                    background: "var(--danger)",
                  }}
                >
                  <span
                    className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full"
                    style={{ background: "var(--danger)" }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

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

function GridBlock({
  item,
  rangeStart,
  onSelect,
}: {
  item: PositionedActivity;
  rangeStart: number;
  onSelect: () => void;
}) {
  const { categoryFor } = useAgenda();
  const t = useT();
  const category = categoryFor(item.occurrence.category);
  const color = activityColor(item.occurrence, category);
  const width = 100 / item.lanes;
  const left = item.lane * width;

  const top = (item.startMinutes - rangeStart) * PX_PER_MINUTE;
  const height = Math.max(18, (item.endMinutes - item.startMinutes) * PX_PER_MINUTE);
  const compact = height < COMPACT_BLOCK_HEIGHT;

  const travelHeight =
    item.departureMinutes === null
      ? 0
      : (item.startMinutes - item.departureMinutes) * PX_PER_MINUTE;

  const returnHeight =
    item.returnMinutes === null ? 0 : (item.returnMinutes - item.endMinutes) * PX_PER_MINUTE;

  /** Gestreepte opmaak voor reisblokken: leest als "onderweg". */
  const travelStyle = {
    background: `repeating-linear-gradient(45deg, color-mix(in srgb, ${color} 22%, transparent) 0 4px, transparent 4px 8px)`,
    border: `1px dashed color-mix(in srgb, ${color} 45%, transparent)`,
    borderRadius: 6,
  } as const;

  return (
    <>
      {item.departureMinutes !== null && travelHeight > 4 ? (
        <button
          type="button"
          onClick={onSelect}
          title={t("week.leaveAt", { time: minutesToTime(item.departureMinutes) })}
          className="absolute overflow-hidden rounded-md text-left"
          style={{
            top: (item.departureMinutes - rangeStart) * PX_PER_MINUTE,
            height: travelHeight,
            left: `${left}%`,
            width: `${width}%`,
            padding: "0 1px",
            ...travelStyle,
          }}
        >
          {travelHeight >= 11 ? (
            <span
              className="block truncate text-[0.55rem] font-semibold leading-none"
              style={{ color }}
            >
              &#128663; {minutesToTime(item.departureMinutes)}
            </span>
          ) : null}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        title={`${item.occurrence.title} · ${item.occurrence.startTime}–${item.occurrence.endTime}`}
        className="absolute overflow-hidden text-left"
        style={{
          top,
          height,
          left: `${left}%`,
          width: `${width}%`,
          padding: "0 1px",
        }}
      >
        <span
          className="flex h-full flex-col overflow-hidden rounded-md px-1 py-0.5"
          style={{
            background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
            borderLeft: `3px solid ${color}`,
          }}
        >
          {/* Een weekkolom is smal. De categorie blijkt al uit de kleur, dus de
              volle breedte gaat naar de titel; de emoji staat alleen in blokken
              die te kort zijn voor tekst. */}
          {compact ? (
            <span aria-hidden className="text-[0.65rem] leading-none">
              {category.emoji}
            </span>
          ) : (
            <>
              <span className="truncate text-[0.65rem] font-semibold leading-tight">
                {item.occurrence.title}
              </span>
              <span
                className="truncate text-[0.6rem] leading-tight tabular-nums"
                style={{ color: "var(--muted)" }}
              >
                {item.occurrence.startTime}
              </span>
            </>
          )}
        </span>
      </button>

      {item.returnMinutes !== null && returnHeight > 4 ? (
        <button
          type="button"
          onClick={onSelect}
          title={t("week.homeAt", { time: minutesToTime(item.returnMinutes) })}
          className="absolute overflow-hidden text-left"
          style={{
            top: (item.endMinutes - rangeStart) * PX_PER_MINUTE,
            height: returnHeight,
            left: `${left}%`,
            width: `${width}%`,
            padding: "0 1px",
            ...travelStyle,
          }}
        >
          {returnHeight >= 11 ? (
            <span
              className="block truncate text-[0.55rem] font-semibold leading-none"
              style={{ color }}
            >
              &#8617;&#65039; {minutesToTime(item.returnMinutes)}
            </span>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
