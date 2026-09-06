"use client";

import { useEffect, useRef, useState } from "react";
import { activityColor } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import {
  activitiesOnDate,
  layoutDay,
  timeRangeFor,
  type PositionedActivity,
} from "@/lib/agenda";
import { computeOnward } from "@/lib/travel";
import {
  addDaysToKey,
  calendarWeekKeys,
  daysBetween,
  formatDateLabel,
  MINUTES_PER_DAY,
  minutesToTime,
  pad2,
  parseDateKey,
  toDateKey,
  timeToMinutes,
} from "@/lib/time";
import { useT } from "@/hooks/useLanguage";
import { shiftRecurrence, weekdayHeadings } from "@/lib/recurrence";
import { ActivityForm } from "./ActivityForm";
import type { Activity, ActivityDraft, ActivityOccurrence } from "@/lib/types";

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
/** Slepen gaat per kwartier: fijner dan het halve uur, rustiger dan de minuut. */
const DRAG_SNAP_MINUTES = 15;
/** Zoveel pixels bewegen voordat een klik een sleep wordt. */
const DRAG_THRESHOLD_PX = 4;
/** Hoogte van de greep onderaan een blok waarmee je de eindtijd rekt. */
const RESIZE_HANDLE_PX = 8;
/** Onder deze hoogte is er geen ruimte voor een greep zonder het blok te blokkeren. */
const MIN_HEIGHT_FOR_HANDLE = 26;

/** Verplaatsen of alleen de eindtijd rekken. */
type DragMode = "move" | "resize";

/** Verschuiving die tijdens het slepen op het scherm staat. */
interface Shift {
  /** Minuten die het blok op de tijdas opschuift. */
  minutes: number;
  /** Hele dagen naar links of rechts. */
  days: number;
  /** Diezelfde dagen in pixels, voor de weergave tijdens het slepen. */
  dx: number;
  mode: DragMode;
}

/** Waar een gesleept blok naartoe gaat. */
interface DropTarget {
  date: string;
  startTime: string;
  endTime: string;
}

/** Alles van een activiteit dat bij het verplaatsen mee moet. */
function draftFrom(activity: Activity, overrides: Partial<ActivityDraft>): ActivityDraft {
  return {
    category: activity.category,
    title: activity.title,
    date: activity.date,
    startTime: activity.startTime,
    endTime: activity.endTime,
    location: activity.location,
    color: activity.color,
    travelMode: activity.travelMode ?? null,
    recurrence: activity.recurrence,
    linkedTaskId: activity.linkedTaskId ?? null,
    linkedExamId: activity.linkedExamId ?? null,
    source: activity.source,
    ...overrides,
  };
}


/**
 * Weekraster: zeven dagen naast elkaar op een tijdas. De reistijd staat als
 * gestreept aanloopblok direct boven de activiteit, zodat je in één oogopslag
 * ziet wanneer je de deur uit moet.
 */
export function WeekGrid({ weekStart, now }: { weekStart: string; now: Date }) {
  const dayLabels = weekdayHeadings();
  const { activities, settings, updateActivity, moveOccurrence, categoryFor } =
    useAgenda();
  const [editing, setEditing] = useState<ActivityOccurrence | null>(null);
  /** Een gesleepte reeks wacht hier tot je kiest: deze dag of alle dagen. */
  const [asking, setAsking] = useState<{
    occurrence: ActivityOccurrence;
    target: DropTarget;
  } | null>(null);
  /** Datum en begintijd van een activiteit die je in het raster aanklikte. */
  const [creating, setCreating] = useState<{ date: string; startTime: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const t = useT();

  /**
   * Zet een gesleept blok op zijn nieuwe plek.
   *
   * Een losse activiteit verhuist gewoon. Bij een reeks is er een keuze, net
   * als in andere agenda's: alleen deze dag (die dag valt uit de reeks en komt
   * er los naast te staan) of de hele reeks, die dan in zijn geheel opschuift.
   */
  function applyMove(
    occurrence: ActivityOccurrence,
    target: DropTarget,
    scope: "one" | "series",
  ) {
    const series = activities.find((item) => item.id === occurrence.id);
    if (!series) return;

    // Slepen omzeilt de controle van het formulier, dus hier een eigen
    // vangnet: een blok dat eindigt voordat het begint bestaat niet, en zou
    // het hele raster onbruikbaar maken.
    if (timeToMinutes(target.endTime) <= timeToMinutes(target.startTime)) return;

    if (!series.recurrence) {
      updateActivity(series.id, draftFrom(series, target));
      return;
    }

    if (scope === "one") {
      // Als één handeling: de dag uit de reeks halen én de losse kopie
      // neerzetten. Twee losse aanroepen lieten "ongedaan maken" alleen het
      // eerste terugdraaien, waarna de activiteit dubbel stond.
      moveOccurrence(series.id, occurrence.date, draftFrom(series, { ...target, recurrence: null }));
      return;
    }

    // De hele reeks schuift met dezelfde stap mee, dus ook de weekdagen — en
    // de overgeslagen dagen. Die staan als kalenderdatum opgeslagen, dus zonder
    // meeschuiven wezen ze na de verplaatsing nergens meer naar en dook een dag
    // die je bewust had weggehaald weer op.
    const shift = daysBetween(occurrence.date, target.date);
    updateActivity(
      series.id,
      draftFrom(series, {
        date: addDaysToKey(series.date, shift),
        startTime: target.startTime,
        endTime: target.endTime,
        recurrence: shiftRecurrence(series.recurrence, shift),
        exceptions: series.exceptions.map((day) => addDaysToKey(day, shift)),
      }),
    );
  }

  function handleDrop(occurrence: ActivityOccurrence, target: DropTarget) {
    if (occurrence.recurrence) {
      setAsking({ occurrence, target });
      return;
    }
    applyMove(occurrence, target, "one");
  }

  const dateKeys = calendarWeekKeys(weekStart);
  const days = dateKeys.map((dateKey) => layoutDay(activities, settings, dateKey));
  // Wat de hele dag duurt staat niet op de tijdas maar in een eigen rij erboven.
  const allDayDays = dateKeys.map((dateKey) =>
    activitiesOnDate(activities, dateKey).filter((item) => item.allDay),
  );
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

          {/* Rij voor wat de hele dag duurt. Vakanties en studiedagen hebben
              geen plek op de tijdas, maar horen wel boven je week te staan als
              de context waarbinnen de rest valt. Alleen zichtbaar als er die
              week iets is. */}
          {allDayDays.some((items) => items.length > 0) ? (
            <>
              <div
                className="sticky left-0 z-10 border-r border-b px-1 py-1 text-right text-[0.6rem] leading-tight"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--line)",
                  color: "var(--muted)",
                }}
              >
                {t("week.allDay")}
              </div>
              {dateKeys.map((dateKey, index) => (
                <div
                  key={`allday-${dateKey}`}
                  className="flex flex-col gap-0.5 border-b border-l px-0.5 py-1"
                  style={{ borderColor: "var(--line)" }}
                >
                  {allDayDays[index].map((item) => {
                    const color = activityColor(item, categoryFor(item.category));
                    return (
                      <button
                        key={item.occurrenceId}
                        type="button"
                        onClick={() => setEditing(item)}
                        title={item.title}
                        className="truncate rounded px-1 text-left text-[0.6rem] leading-tight font-medium"
                        style={{
                          background: `color-mix(in srgb, ${color} 20%, var(--surface))`,
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        {item.title}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          ) : null}

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
              data-day-column
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
                  dayIndex={index}
                  weekStart={weekStart}
                  onSelect={() => setEditing(item.occurrence)}
                  onDrop={handleDrop}
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

      {/* Een reeks verplaatsen is nooit vanzelfsprekend: bedoel je deze ene
          dag of alle dagen? Dat vragen we, in plaats van het te gokken. */}
      {asking ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("week.move.title")}
        >
          <div className="card animate-sheet-in w-full max-w-sm rounded-b-none px-5 py-5 sm:rounded-2xl">
            <h2 className="text-base font-semibold">{t("week.move.title")}</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {t("week.move.body", {
                title: asking.occurrence.title,
                when: `${formatDateLabel(asking.target.date, now)} ${asking.target.startTime}`,
              })}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  applyMove(asking.occurrence, asking.target, "one");
                  setAsking(null);
                }}
              >
                {t("week.move.one")}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  applyMove(asking.occurrence, asking.target, "series");
                  setAsking(null);
                }}
              >
                {t("week.move.all")}
              </button>
              <button
                type="button"
                className="text-xs underline"
                style={{ color: "var(--muted)" }}
                onClick={() => setAsking(null)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Eén activiteit in het raster, met zijn reisblokken ervoor en erna.
 *
 * Slepen werkt met een muis of pen: het blok zelf verplaatst de activiteit,
 * de onderrand rekt de eindtijd op. Met een vinger doen we het bewust niet:
 * daar botst slepen met het scrollen van het raster, en tikken om te bewerken
 * werkt met een vinger beter.
 */
function GridBlock({
  item,
  rangeStart,
  dayIndex,
  weekStart,
  onSelect,
  onDrop,
}: {
  item: PositionedActivity;
  rangeStart: number;
  dayIndex: number;
  weekStart: string;
  onSelect: () => void;
  onDrop: (occurrence: ActivityOccurrence, target: DropTarget) => void;
}) {
  const { categoryFor } = useAgenda();
  const t = useT();
  const category = categoryFor(item.occurrence.category);
  const color = activityColor(item.occurrence, category);
  const width = 100 / item.lanes;
  const left = item.lane * width;

  /** De lopende beweging. In een ref: hij hoeft zelf niets te tekenen. */
  const gesture = useRef<{
    mode: DragMode;
    columnWidth: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  /** Wat er op dit moment verschoven op het scherm staat. */
  const [shift, setShift] = useState<Shift | null>(null);
  const latest = useRef<Shift | null>(null);
  /** Onderdrukt de klik die na het loslaten vanzelf nog komt. */
  const justDragged = useRef(false);

  function begin(event: React.PointerEvent<HTMLElement>, mode: DragMode) {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const column = (event.target as HTMLElement).closest<HTMLElement>("[data-day-column]");
    if (!column) return;
    gesture.current = {
      mode,
      columnWidth: column.getBoundingClientRect().width,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current) return;

    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      current.active = true;
    }

    let minutes = Math.round(dy / PX_PER_MINUTE / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
    let days = 0;

    if (current.mode === "move") {
      days = Math.max(-dayIndex, Math.min(6 - dayIndex, Math.round(dx / current.columnWidth)));
      // Niet voor middernacht beginnen en niet erna eindigen. Tot 23:59, niet
      // tot 24:00: dat werd bij het opslaan "00:00", en dan lag de eindtijd
      // vóór de begintijd. Het hele weekraster klapte daarop dicht.
      minutes = Math.max(
        -item.startMinutes,
        Math.min(MINUTES_PER_DAY - 1 - item.endMinutes, minutes),
      );
    } else {
      // Een activiteit blijft minstens één stap lang, en eindigt uiterlijk
      // om 23:59.
      minutes = Math.max(
        item.startMinutes + DRAG_SNAP_MINUTES - item.endMinutes,
        Math.min(MINUTES_PER_DAY - 1 - item.endMinutes, minutes),
      );
    }

    const next: Shift = { minutes, days, dx: days * current.columnWidth, mode: current.mode };
    latest.current = next;
    setShift(next);
  }

  function finish() {
    const current = gesture.current;
    const result = latest.current;
    gesture.current = null;
    latest.current = null;
    setShift(null);
    if (!current?.active || !result) return;

    justDragged.current = true;
    if (result.minutes === 0 && result.days === 0) return;

    const startMinutes =
      result.mode === "move" ? item.startMinutes + result.minutes : item.startMinutes;
    onDrop(item.occurrence, {
      date: addDaysToKey(weekStart, dayIndex + result.days),
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(item.endMinutes + result.minutes),
    });
  }

  function cancel() {
    gesture.current = null;
    latest.current = null;
    setShift(null);
  }

  /** Het begin schuift alleen mee bij verplaatsen, niet bij rekken. */
  const startOffset = shift?.mode === "move" ? shift.minutes : 0;
  const endOffset = shift?.minutes ?? 0;
  const dx = shift?.dx ?? 0;
  const dragging = shift !== null;

  const top = (item.startMinutes + startOffset - rangeStart) * PX_PER_MINUTE;
  const height = Math.max(
    18,
    (item.endMinutes + endOffset - item.startMinutes - startOffset) * PX_PER_MINUTE,
  );
  const compact = height < COMPACT_BLOCK_HEIGHT;

  const travelHeight =
    item.departureMinutes === null
      ? 0
      : (item.startMinutes - item.departureMinutes) * PX_PER_MINUTE;

  const returnHeight =
    item.returnMinutes === null ? 0 : (item.returnMinutes - item.endMinutes) * PX_PER_MINUTE;
  /** Ga je hierna rechtstreeks door, dan heet het blok erna anders. */
  const onward = computeOnward(item.occurrence, null);

  /** Gestreepte opmaak voor reisblokken: leest als "onderweg". */
  const travelStyle = {
    background: `repeating-linear-gradient(45deg, color-mix(in srgb, ${color} 22%, transparent) 0 4px, transparent 4px 8px)`,
    border: `1px dashed color-mix(in srgb, ${color} 45%, transparent)`,
    borderRadius: 6,
  } as const;

  /** Wat je sleept ligt boven de rest en laat er een beetje doorheen kijken. */
  const layer = dragging ? { zIndex: 20, opacity: 0.92 } : undefined;
  const nudge = dx ? `translateX(${dx}px)` : undefined;

  return (
    <>
      {item.departureMinutes !== null && travelHeight > 4 ? (
        <button
          type="button"
          onClick={onSelect}
          title={t("week.leaveAt", { time: minutesToTime(item.departureMinutes + startOffset) })}
          className="absolute overflow-hidden rounded-md text-left"
          style={{
            top: (item.departureMinutes + startOffset - rangeStart) * PX_PER_MINUTE,
            height: travelHeight,
            left: `${left}%`,
            width: `${width}%`,
            padding: "0 1px",
            transform: nudge,
            ...travelStyle,
            ...layer,
          }}
        >
          {travelHeight >= 11 ? (
            <span
              className="block truncate text-[0.55rem] font-semibold leading-none"
              style={{ color }}
            >
              &#128663; {minutesToTime(item.departureMinutes + startOffset)}
            </span>
          ) : null}
        </button>
      ) : null}

      <button
        type="button"
        onPointerDown={(event) => begin(event, "move")}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onClick={() => {
          // Na een sleep komt er nog een klik achteraan; die mag niets doen.
          if (justDragged.current) {
            justDragged.current = false;
            return;
          }
          onSelect();
        }}
        title={t("week.blockTitle", {
          title: item.occurrence.title,
          from: minutesToTime(item.startMinutes + startOffset),
          to: minutesToTime(item.endMinutes + endOffset),
        })}
        className="absolute cursor-grab overflow-hidden text-left active:cursor-grabbing"
        style={{
          top,
          height,
          left: `${left}%`,
          width: `${width}%`,
          padding: "0 1px",
          transform: nudge,
          ...layer,
        }}
      >
        <span
          className="relative flex h-full flex-col overflow-hidden rounded-md px-1 py-0.5"
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
                {minutesToTime(item.startMinutes + startOffset)}
              </span>
            </>
          )}

          {/* De onderrand rekt de eindtijd op. Alleen als het blok hoog genoeg
              is, anders zou de greep het blok zelf afdekken. */}
          {height >= MIN_HEIGHT_FOR_HANDLE ? (
            <span
              role="presentation"
              title={t("week.resize")}
              onPointerDown={(event) => {
                event.stopPropagation();
                begin(event, "resize");
              }}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={cancel}
              className="absolute inset-x-0 bottom-0 cursor-ns-resize"
              style={{ height: RESIZE_HANDLE_PX }}
            />
          ) : null}
        </span>
      </button>

      {item.returnMinutes !== null && returnHeight > 4 ? (
        <button
          type="button"
          onClick={onSelect}
          title={
            onward
              ? t("week.onwardTo", {
                  place: onward.to.label,
                  time: minutesToTime(item.returnMinutes + endOffset),
                })
              : t("week.homeAt", { time: minutesToTime(item.returnMinutes + endOffset) })
          }
          className="absolute overflow-hidden text-left"
          style={{
            top: (item.endMinutes + endOffset - rangeStart) * PX_PER_MINUTE,
            height: returnHeight,
            left: `${left}%`,
            width: `${width}%`,
            padding: "0 1px",
            transform: nudge,
            ...travelStyle,
            ...layer,
          }}
        >
          {returnHeight >= 11 ? (
            <span
              className="block truncate text-[0.55rem] font-semibold leading-none"
              style={{ color }}
            >
              {onward ? "⟶" : "↩️"}{" "}
              {minutesToTime(item.returnMinutes + endOffset)}
            </span>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
