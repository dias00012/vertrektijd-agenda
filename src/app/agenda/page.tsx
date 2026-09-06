"use client";

import { useCallback, useEffect, useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import { activitiesOnDate, groupByDate } from "@/lib/agenda";
import {
  addDaysToKey,
  addMonthsToKey,
  addWeeksToKey,
  calendarWeekKeys,
  formatDateLabel,
  formatMonthLabel,
  formatRangeLabel,
  isoWeekNumber,
  isSameMonth,
  startOfWeekKey,
  todayKey,
} from "@/lib/time";
import { ActivityCard } from "@/components/ActivityCard";
import { MonthGrid } from "@/components/MonthGrid";
import { WeekGrid } from "@/components/WeekGrid";
import { EmptyState, Spinner } from "@/components/ui";
import { useT } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n/dictionary";

type View = "vandaag" | "morgen" | "week" | "maand";

const VIEWS: { id: View; key: TranslationKey }[] = [
  { id: "vandaag", key: "agenda.tab.today" },
  { id: "morgen", key: "agenda.tab.tomorrow" },
  { id: "week", key: "agenda.tab.week" },
  { id: "maand", key: "agenda.tab.month" },
];

/** Agenda met dag-, week- (raster of lijst) en maandweergave. */
export default function AgendaPage() {
  const { hydrated } = useAgenda();
  const t = useT();
  const now = useNow(60_000);
  const today = todayKey(now);

  const [view, setView] = useState<View>("vandaag");
  const [weekStart, setWeekStart] = useState(() => startOfWeekKey(today));
  const [weekLayout, setWeekLayout] = useState<"raster" | "lijst">("raster");
  const [month, setMonth] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);

  const goToToday = useCallback(() => {
    setWeekStart(startOfWeekKey(today));
    setMonth(today);
    setSelectedDay(today);
  }, [today]);

  /** Een periode vooruit of achteruit; wat een periode is hangt af van de weergave. */
  const step = useCallback(
    (delta: number) => {
      if (view === "week") setWeekStart((current) => addWeeksToKey(current, delta));
      if (view === "maand") setMonth((current) => addMonthsToKey(current, delta));
    },
    [view],
  );

  /**
   * Sneltoetsen zoals elke agenda op een laptop ze heeft: T voor vandaag, de
   * pijlen voor vorige en volgende, D W M voor de weergave. Zonder muis door
   * je weken bladeren scheelt echt tijd.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Niet ingrijpen terwijl iemand typt of een venster openstaat.
      if (target?.isContentEditable) return;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;

      switch (event.key.toLowerCase()) {
        case "t":
          goToToday();
          break;
        case "d":
          setView("vandaag");
          break;
        case "w":
          setView("week");
          break;
        case "m":
          setView("maand");
          break;
        case "arrowleft":
          step(-1);
          break;
        case "arrowright":
          step(1);
          break;
        default:
          return;
      }
      event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToToday, step]);

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.agenda")}</h1>
      </header>

      <div
        className="mb-4 grid grid-cols-4 gap-1 rounded-2xl border p-1"
        role="tablist"
        aria-label={t("agenda.view")}
        style={{ background: "var(--surface-soft)", borderColor: "var(--line)" }}
      >
        {VIEWS.map((item) => {
          const active = item.id === view;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(item.id)}
              className="rounded-xl px-2 py-2 text-sm font-medium transition-colors"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--ink)" : "var(--muted)",
                boxShadow: active ? "var(--shadow-card)" : "none",
              }}
            >
              {t(item.key)}
            </button>
          );
        })}
      </div>

      {!hydrated ? (
        <div className="card px-5 py-10 text-center">
          <Spinner size={18} label={t("agenda.loading")} />
        </div>
      ) : view === "vandaag" || view === "morgen" ? (
        <DayList dateKey={view === "vandaag" ? today : addDaysToKey(today, 1)} now={now} />
      ) : view === "week" ? (
        <div>
          <PeriodNav
            label={formatRangeLabel(weekStart, addDaysToKey(weekStart, 6))}
            note={t("agenda.weekNumber", { number: isoWeekNumber(weekStart) })}
            onPrevious={() => setWeekStart(addWeeksToKey(weekStart, -1))}
            onNext={() => setWeekStart(addWeeksToKey(weekStart, 1))}
            previousLabel={t("agenda.previousWeek")}
            nextLabel={t("agenda.nextWeek")}
            onToday={weekStart === startOfWeekKey(today) ? undefined : goToToday}
            extra={
              <div
                className="flex rounded-lg border p-0.5"
                style={{ borderColor: "var(--line)" }}
                role="group"
                aria-label={t("agenda.weekView")}
              >
                {(["raster", "lijst"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={weekLayout === option}
                    onClick={() => setWeekLayout(option)}
                    className="rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors"
                    style={{
                      background: weekLayout === option ? "var(--surface-soft)" : "transparent",
                      color: weekLayout === option ? "var(--ink)" : "var(--muted)",
                    }}
                  >
                    {t(option === "raster" ? "agenda.layout.grid" : "agenda.layout.list")}
                  </button>
                ))}
              </div>
            }
          />

          {weekLayout === "raster" ? (
            <>
              <WeekGrid weekStart={weekStart} now={now} />
              <p className="mt-3 text-center text-xs" style={{ color: "var(--muted)" }}>
                {t("agenda.travelHint")}
              </p>
            </>
          ) : (
            <WeekList weekStart={weekStart} now={now} />
          )}
        </div>
      ) : (
        <div>
          <PeriodNav
            label={formatMonthLabel(month)}
            onPrevious={() => setMonth(addMonthsToKey(month, -1))}
            onNext={() => setMonth(addMonthsToKey(month, 1))}
            previousLabel={t("agenda.previousMonth")}
            nextLabel={t("agenda.nextMonth")}
            onToday={isSameMonth(month, today) ? undefined : goToToday}
          />

          <MonthGrid month={month} selected={selectedDay} onSelect={setSelectedDay} now={now} />

          <section className="mt-5" aria-label={t("agenda.activitiesOn", { date: formatDateLabel(selectedDay, now) })}>
            <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
              {formatDateLabel(selectedDay, now)}
            </h2>
            <DayList dateKey={selectedDay} now={now} compactEmpty />
          </section>
        </div>
      )}

      {/* Alleen op een laptop: op een telefoon is er geen toetsenbord. */}
      <p className="mt-6 hidden text-center text-xs lg:block" style={{ color: "var(--muted)" }}>
        {t("agenda.shortcuts")}
      </p>
    </div>
  );
}

/** Navigatiebalk boven het week- of maandraster. */
function PeriodNav({
  label,
  note,
  onPrevious,
  onNext,
  onToday,
  previousLabel,
  nextLabel,
  extra,
}: {
  label: string;
  /** Kleine toevoeging naast het label, bv. het weeknummer. */
  note?: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday?: () => void;
  previousLabel: string;
  nextLabel: string;
  extra?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrevious}
          aria-label={previousLabel}
          className="btn btn-ghost px-2.5 py-1.5 text-sm"
        >
          &#8249;
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label={nextLabel}
          className="btn btn-ghost px-2.5 py-1.5 text-sm"
        >
          &#8250;
        </button>
      </div>

      <span className="text-sm font-semibold first-letter:uppercase">{label}</span>
      {note ? (
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {note}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {onToday ? (
          <button type="button" onClick={onToday} className="btn btn-ghost px-2.5 py-1.5 text-xs">
            {t("agenda.tab.today")}
          </button>
        ) : null}
        {extra}
      </div>
    </div>
  );
}

/** Lijst met activiteitkaarten voor één dag. */
function DayList({
  dateKey,
  now,
  compactEmpty,
}: {
  dateKey: string;
  now: Date;
  compactEmpty?: boolean;
}) {
  const { activities } = useAgenda();
  const t = useT();
  const items = activitiesOnDate(activities, dateKey);

  if (items.length === 0) {
    return compactEmpty ? (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {t("agenda.empty.day")}
      </p>
    ) : (
      <EmptyState
        icon="📅"
        title={t("agenda.empty.title")}
        description={t("agenda.empty.body")}
      />
    );
  }

  return (
    <section aria-label={formatDateLabel(dateKey, now)} className="space-y-2.5">
      {items.map((activity) => (
        <ActivityCard key={activity.occurrenceId} activity={activity} now={now} />
      ))}
    </section>
  );
}

/** De week als lijst per dag; prettiger dan het raster op een smal scherm. */
function WeekList({ weekStart, now }: { weekStart: string; now: Date }) {
  const { activities } = useAgenda();
  const t = useT();
  const days = groupByDate(activities, calendarWeekKeys(weekStart)).filter(
    (day) => day.items.length > 0,
  );

  if (days.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title={t("agenda.empty.weekTitle")}
        description={t("agenda.empty.weekBody")}
      />
    );
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.dateKey} aria-label={formatDateLabel(day.dateKey, now)}>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
            {formatDateLabel(day.dateKey, now)}
          </h2>
          <div className="space-y-2.5">
            {day.items.map((activity) => (
              <ActivityCard key={activity.occurrenceId} activity={activity} now={now} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
