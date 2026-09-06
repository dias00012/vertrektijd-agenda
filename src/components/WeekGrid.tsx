"use client";

import { useEffect, useRef, useState } from "react";
import { activityColor } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { layoutDay, timeRangeFor, type PositionedActivity } from "@/lib/agenda";
import {
  calendarWeekKeys,
  formatDateLabel,
  minutesToTime,
  pad2,
  parseDateKey,
  toDateKey,
} from "@/lib/time";
import { useT } from "@/hooks/useLanguage";
import { weekdayHeadings } from "@/lib/recurrence";
import { ActivityForm } from "./ActivityForm";
import type { ActivityOccurrence } from "@/lib/types";

/** Hoogte van één uur in het raster. */
const HOUR_HEIGHT = 56;
const PX_PER_MINUTE = HOUR_HEIGHT / 60;
/** Onder deze hoogte past er geen tekst meer in een blok. */
const COMPACT_BLOCK_HEIGHT = 34;
/** Breedte van de tijdas links. */
const GUTTER = 44;
/**
 * Smalste dagkolom. Op een telefoon zijn zeven kolommen in 340px zo'n 42px
 * breed: daar past geen woord in, alleen een afgekapte letter. Liever een
 * kolom die je kunt lezen en horizontaal schuiven, zoals elke agenda-app op
 * een telefoon doet.
 */
const MIN_COLUMN = 64;
/** Klikken in het raster plant op het halve uur, zoals elke agenda-app. */
const SNAP_MINUTES = 30;
/** Standaardlengte van een activiteit die je uit het raster begint. */
const NEW_DURATION_MINUTES = 60;


/**
 * Weekraster: zeven dagen naast elkaar op een tijdas. De reistijd staat als
 * gestreept aanloopblok direct boven de activiteit, zodat je in één oogopslag
 * ziet wanneer je de deur uit moet.
 */
export function WeekGrid({ weekStart, now }: { weekStart: string; now: Date }) {
  const dayLabels = weekdayHeadings();
  const { activities, settings } = useAgenda();
  const [editing, setEditing] = useState<ActivityOccurrence | null>(null);
  /** Datum en begintijd van een activiteit die je in het raster aanklikte. */
  const [creating, setCreating] = useState<{ date: string; startTime: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const t = useT();

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

  // Past de week niet in beeld, dan begint hij bij vandaag in plaats van bij
  // maandag: dat is de dag waar je naar op zoek bent.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const index = calendarWeekKeys(weekStart).indexOf(toDateKey(now));
    if (index < 0) return;
    const column = (el.scrollWidth - GUTTER) / 7;
    el.scrollLeft = Math.max(0, GUTTER + index * column - (el.clientWidth - column) / 2);
    // Alleen bij een andere week opnieuw: `now` tikt elke minuut door.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  return (
    <>
      <div ref={scroller} className="card overflow-x-auto">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${GUTTER}px repeat(7, minmax(${MIN_COLUMN}px, 1fr))`,
          }}
        >
          {/* Kop met de weekdagen */}
          <div
            className="sticky left-0 z-10 border-r border-b"
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
                  {dayLabels[(parseDateKey(dateKey).getDay() + 6) % 7]}
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
          {/* De rand houdt de tijdas gescheiden van de dagen die eronderdoor
              schuiven op een smal scherm. */}
          <div
            className="sticky left-0 z-10 relative border-r"
            style={{
              height: totalHeight,
              background: "var(--surface)",
              borderColor: "var(--line)",
            }}
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
              {/* Een klik op een leeg stuk plant iets op dat tijdstip, zoals je
                  van een agenda verwacht. Als knop in plaats van een klikbare
                  div, zodat het ook met het toetsenbord werkt; dan begint het
                  bij het begin van de dag. */}
              <button
                type="button"
                aria-label={t("week.addOn", { date: formatDateLabel(dateKey, now) })}
                className="absolute inset-0 h-full w-full"
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const offset = event.clientY > 0 ? event.clientY - box.top : 0;
                  const minutes = range.start + offset / PX_PER_MINUTE;
                  const start = Math.max(
                    0,
                    Math.min(23 * 60 + 30, Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES),
                  );
                  setCreating({ date: dateKey, startTime: minutesToTime(start) });
                }}
              />

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

      {creating ? (
        <ActivityForm
          preset={{
            date: creating.date,
            startTime: creating.startTime,
            endTime: minutesToTime(
              Math.min(
                23 * 60 + 59,
                Number(creating.startTime.slice(0, 2)) * 60 +
                  Number(creating.startTime.slice(3)) +
                  NEW_DURATION_MINUTES,
              ),
            ),
          }}
          onClose={() => setCreating(null)}
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
