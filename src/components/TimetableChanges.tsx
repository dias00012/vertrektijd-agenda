"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { clearChanges, loadChanges, type ChangeLog } from "@/lib/changeLog";
import { becameFree, startsEarlier, startsLater, type DayChange } from "@/lib/timetableChanges";
import { activitiesOnDate } from "@/lib/agenda";
import { computeDeparture } from "@/lib/travel";
import { formatDateLabel } from "@/lib/time";

/**
 * "Je eerste uur vervalt."
 *
 * Het enige moment waarop deze app iets weet dat jij nog niet weet. Een
 * roostersysteem meldt niets uit zichzelf; je komt er 's ochtends achter, in de
 * bus. Daarom staat dit bovenaan je dag en niet weggestopt in een lijstje.
 *
 * Wat het bijzonder maakt is de laatste regel: niet alleen dát je later begint,
 * maar hoe laat je dan weg moet. Dat is waar de rest van de app voor bestaat.
 */
export function TimetableChanges({ now }: { now: Date }) {
  const { activities, settings } = useAgenda();
  const t = useT();
  const [log, setLog] = useState<ChangeLog | null>(null);

  useEffect(() => {
    const read = () => setLog(loadChanges());
    read();
    // De verversing draait terwijl dit scherm openstaat, dus we moeten het
    // horen als er iets binnenkomt.
    window.addEventListener("roosterwijziging", read);
    return () => window.removeEventListener("roosterwijziging", read);
  }, []);

  if (!log) return null;

  /** Hoe laat je op deze dag weg moet, nu de wijziging verwerkt is. */
  function departureOn(dateKey: string): string | null {
    for (const occurrence of activitiesOnDate(activities, dateKey)) {
      const departure = computeDeparture(occurrence, settings);
      if (departure) return departure.time;
    }
    return null;
  }

  /** De belangrijkste zin voor deze dag, in gewone taal. */
  function headline(change: DayChange): string {
    const day = formatDateLabel(change.dateKey, now);
    if (becameFree(change)) return t("changes.free", { day });
    if (startsLater(change)) {
      return t("changes.later", {
        day,
        before: change.firstStartBefore ?? "",
        after: change.firstStartAfter ?? "",
      });
    }
    if (startsEarlier(change)) {
      return t("changes.earlier", {
        day,
        before: change.firstStartBefore ?? "",
        after: change.firstStartAfter ?? "",
      });
    }
    if (change.removed.length > 0 && change.added.length === 0) {
      return t("changes.cancelled", { day, count: change.removed.length });
    }
    return t("changes.changed", { day });
  }

  return (
    <section
      className="card mb-4 px-5 py-4"
      style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))" }}
      aria-label={t("changes.title")}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-lg leading-none">
          &#128260;
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("changes.title")}</h2>

          <ul className="mt-2 space-y-2.5">
            {log.changes.slice(0, 4).map((change) => {
              const departure = departureOn(change.dateKey);
              return (
                <li key={change.dateKey}>
                  <p className="text-sm font-medium first-letter:uppercase">{headline(change)}</p>

                  {change.removed.length > 0 ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      &minus; {change.removed.join(", ")}
                    </p>
                  ) : null}
                  {change.added.length > 0 ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      + {change.added.join(", ")}
                    </p>
                  ) : null}

                  {/* Waar het uiteindelijk om gaat. */}
                  {departure ? (
                    <p className="mt-0.5 text-xs font-semibold tabular-nums">
                      &#127968; {t("changes.leaveAt", { time: departure })}
                    </p>
                  ) : becameFree(change) ? null : (
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {t("changes.noDeparture")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {log.changes.length > 4 ? (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              {t("changes.more", { count: log.changes.length - 4 })}
            </p>
          ) : null}

          <button
            type="button"
            className="mt-3 text-xs underline"
            style={{ color: "var(--muted)" }}
            onClick={() => clearChanges()}
          >
            {t("changes.dismiss")}
          </button>
        </div>
      </div>
    </section>
  );
}
