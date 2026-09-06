"use client";

import { activityColor } from "@/lib/categories";
import { useT } from "@/hooks/useLanguage";
import { weekdayHeadings } from "@/lib/recurrence";
import { useAgenda } from "@/hooks/useAgenda";
import { activitiesOnDate } from "@/lib/agenda";
import { isSameMonth, monthGridKeys, parseDateKey, toDateKey } from "@/lib/time";

/** Meer stippen dan dit passen niet in een dagvakje. */
const MAX_DOTS = 4;
/**
 * Op een laptop is er ruimte voor de namen zelf. Stippen vertellen je alleen
 * dát er iets is; met de titel erbij zie je je maand zonder te klikken.
 */
const MAX_TITLES = 3;

/**
 * Maandraster. Elke dag toont gekleurde stippen per activiteit; de gekozen dag
 * wordt eronder volledig uitgeschreven met reistijd en vertrektijd.
 */
export function MonthGrid({
  month,
  selected,
  onSelect,
  now,
}: {
  /** Een dag in de maand die getoond wordt. */
  month: string;
  selected: string;
  onSelect: (dateKey: string) => void;
  now: Date;
}) {
  const { activities, settings, categoryFor } = useAgenda();
  const t = useT();
  const dayLabels = weekdayHeadings();
  const dateKeys = monthGridKeys(month);
  const today = toDateKey(now);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7">
        {dayLabels.map((label) => (
          <div
            key={label}
            className="border-b py-2 text-center text-[0.65rem] font-semibold uppercase"
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
          >
            {label}
          </div>
        ))}

        {dateKeys.map((dateKey) => {
          const items = activitiesOnDate(activities, dateKey);
          const inMonth = isSameMonth(dateKey, month);
          const isToday = dateKey === today;
          const isSelected = dateKey === selected;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelect(dateKey)}
              aria-pressed={isSelected}
              aria-label={`${parseDateKey(dateKey).getDate()}, ${items.length} ${
                t(items.length === 1 ? "month.activity" : "month.activities")
              }`}
              className="flex min-h-[58px] flex-col items-center gap-1 border-b border-l px-0.5 py-1.5 transition-colors first:border-l-0 lg:min-h-[104px]"
              style={{
                borderColor: "var(--line)",
                background: isSelected ? "var(--surface-soft)" : "transparent",
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                style={{
                  background: isToday ? "var(--accent)" : "transparent",
                  color: isToday ? "#fff" : "var(--ink)",
                }}
              >
                {parseDateKey(dateKey).getDate()}
              </span>

              <span className="flex flex-wrap items-center justify-center gap-0.5 lg:hidden">
                {items.slice(0, MAX_DOTS).map((activity) => (
                  <span
                    key={activity.occurrenceId}
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: activityColor(activity, categoryFor(activity.category)) }}
                  />
                ))}
                {items.length > MAX_DOTS ? (
                  <span
                    aria-hidden
                    className="text-[0.55rem] font-semibold leading-none"
                    style={{ color: "var(--muted)" }}
                  >
                    +{items.length - MAX_DOTS}
                  </span>
                ) : null}
              </span>

              <span aria-hidden className="hidden w-full flex-col gap-0.5 px-0.5 lg:flex">
                {items.slice(0, MAX_TITLES).map((activity) => {
                  const color = activityColor(activity, categoryFor(activity.category));
                  return (
                    <span
                      key={activity.occurrenceId}
                      className="flex items-center gap-1 rounded px-1 py-px text-left text-[0.65rem] leading-tight"
                      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="truncate">
                        <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                          {activity.startTime}
                        </span>{" "}
                        {activity.title}
                      </span>
                    </span>
                  );
                })}
                {items.length > MAX_TITLES ? (
                  <span
                    className="px-1 text-[0.6rem] font-semibold"
                    style={{ color: "var(--muted)" }}
                  >
                    +{items.length - MAX_TITLES}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {settings.home ? null : (
        <p
          className="border-t px-3 py-2 text-[0.65rem]"
          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
        >
          {t("month.homeHint")}
        </p>
      )}
    </div>
  );
}
