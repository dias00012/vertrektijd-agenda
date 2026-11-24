"use client";

import Link from "next/link";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import { useT } from "@/hooks/useLanguage";
import { useOccurrenceTravel } from "@/hooks/useOccurrenceTravel";
import { findNextActivity, minutesUntilDeparture } from "@/lib/agenda";
import { activityColor } from "@/lib/categories";
import { departureCountdown } from "@/lib/countdown";
import { computeDeparture } from "@/lib/travel";
import { formatDateLabel, formatDuration } from "@/lib/time";
import {
  LEG_EMOJI,
  hasRealTime,
  isCancelled,
  journeyDelay,
  meaningfulLegs,
} from "@/lib/travelModes";
import { Spinner } from "@/components/ui";
import type { ActivityOccurrence, Settings } from "@/lib/types";

/**
 * Het vertrekscherm: één scherm met één antwoord — hoe laat moet ik weg.
 *
 * Bedoeld om als eigen icoon op je beginscherm te zetten, naast de app zelf.
 * Een echte widget (zo'n blokje tussen je iconen) kan een webapp niet maken;
 * dat mag op Android en iOS alleen een geïnstalleerde app. Dit is wat er wél
 * kan en scheelt in de praktijk hetzelfde: één tik, geen menu, groot genoeg om
 * vanaf een meter te lezen, en hij werkt zonder bereik.
 *
 * Daarom staat hier bewust niets anders op. Geen navigatie, geen week, geen
 * schoolwerk: dat staat allemaal een tik verderop in de app zelf.
 */
export default function WidgetPage() {
  const { activities, settings, hydrated } = useAgenda();
  // Sneller dan het dashboard: dit scherm staat open om naar te kijken.
  const now = useNow(15_000);
  const t = useT();

  const next = hydrated ? findNextActivity(activities, settings, now) : null;

  return (
    <Link
      href="/"
      aria-label={t("widget.open")}
      className="flex min-h-dvh flex-col justify-center gap-6 px-6 py-8 no-underline"
      style={{ color: "var(--ink)" }}
    >
      {!hydrated ? (
        <div className="text-center">
          <Spinner size={18} label={t("today.loading")} />
        </div>
      ) : next ? (
        <Glance activity={next} settings={settings} now={now} />
      ) : (
        <div className="text-center">
          <p className="text-5xl" aria-hidden>
            &#9749;
          </p>
          <p className="mt-3 text-xl font-semibold">{t("widget.nothing.title")}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {t("widget.nothing.body")}
          </p>
        </div>
      )}

      <p
        className="text-center text-[0.7rem] uppercase tracking-wider"
        style={{ color: "var(--muted)" }}
      >
        {t("widget.open")}
      </p>
    </Link>
  );
}

function Glance({
  activity,
  settings,
  now,
}: {
  activity: ActivityOccurrence;
  settings: Settings;
  now: Date;
}) {
  const { calculatingIds, categoryFor } = useAgenda();
  const t = useT();
  const category = categoryFor(activity.category);
  const color = activityColor(activity, category);

  // De rit van déze dag, net als op het dashboard: bij OV rijdt er morgen een
  // andere trein dan vandaag.
  const dayTravel = useOccurrenceTravel(activity, settings);
  const shown = { ...activity, travel: dayTravel.travel, returnTravel: dayTravel.returnTravel };

  const departure = computeDeparture(shown, settings);
  const countdown = departureCountdown(minutesUntilDeparture(shown, settings, now));
  const calculating = calculatingIds.has(activity.id) || dayTravel.loading;

  const legs = meaningfulLegs(shown.travel?.legs);
  const delay = journeyDelay(shown.travel?.legs);
  const live = hasRealTime(shown.travel?.legs);
  const cancelled = isCancelled(shown.travel?.legs);

  // Geen vertrektijd betekent niet "geen antwoord": zonder plek (koken, leren)
  // is de begintijd het getal waar je naar kijkt.
  const time = departure ? departure.time : activity.startTime;
  const label = departure ? t("next.leaveAt") : t("widget.startsAt");

  const urgent = countdown?.state === "now" || (countdown?.state === "soon" && countdown.minutes <= 15);
  const timeColor = cancelled ? "var(--danger)" : urgent ? "var(--danger)" : delay > 0 ? "#f97316" : "var(--ink)";

  return (
    <div className="text-center">
      <p
        className="text-[0.7rem] font-semibold uppercase tracking-[0.2em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>

      {/* Groot genoeg om vanaf een meter af te lezen, en het past altijd:
          clamp schaalt mee met de breedte van het scherm. */}
      <p
        className="font-semibold tabular-nums leading-none"
        style={{ fontSize: "clamp(3.5rem, 28vw, 7rem)", color: timeColor }}
      >
        {time}
      </p>

      {countdown ? (
        <p className="mt-2 text-base font-semibold" style={{ color: urgent ? "var(--danger)" : "var(--ink)" }}>
          &#9200;{" "}
          {countdown.state === "soon"
            ? t("next.leaveIn", { duration: formatDuration(countdown.minutes) })
            : countdown.state === "now"
              ? t("next.leaveNow")
              : t("next.leavePassed")}
        </p>
      ) : null}

      <div
        className="mx-auto mt-5 max-w-sm rounded-2xl border px-4 py-3"
        style={{
          borderColor: `color-mix(in srgb, ${color} 35%, var(--line))`,
          background: `color-mix(in srgb, ${color} 8%, var(--surface))`,
        }}
      >
        <p className="truncate text-lg font-semibold">
          <span aria-hidden>{category.emoji}</span> {activity.title}
        </p>
        <p className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
          {formatDateLabel(activity.date, now)} &middot; {activity.startTime}&ndash;{activity.endTime}
        </p>

        {calculating ? (
          <p className="mt-2 flex justify-center">
            <Spinner size={14} label={t("activity.calculating")} />
          </p>
        ) : activity.travelError ? (
          <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
            &#9888;&#65039; {activity.travelError}
          </p>
        ) : legs.length > 0 ? (
          <>
            {/* Welke vervoermiddelen je pakt, in dezelfde vorm als in de
                reisplanner. Op dit scherm is dat genoeg: de hele rit staat
                een tik verderop. */}
            <p className="mt-2 flex flex-wrap items-center justify-center gap-1">
              {legs.map((leg, index) => (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 ? (
                    <span aria-hidden className="text-[0.6rem]" style={{ color: "var(--muted)" }}>
                      &rsaquo;
                    </span>
                  ) : null}
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium"
                    style={{
                      background: leg.line ? "var(--surface-soft)" : "transparent",
                      color: leg.line ? "var(--ink)" : "var(--muted)",
                    }}
                  >
                    {LEG_EMOJI[leg.mode]}
                    {leg.line ? ` ${leg.line}` : ""}
                  </span>
                </span>
              ))}
            </p>
            {shown.travel ? (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {formatDuration(shown.travel.durationMinutes)}
                {cancelled
                  ? ` · ${t("status.cancelled")}`
                  : delay > 0
                    ? ` · ${t("status.delayed", { count: delay })}`
                    : live
                      ? ` · ${t("status.live")}`
                      : ""}
              </p>
            ) : null}
          </>
        ) : activity.location ? (
          <p className="mt-1 truncate text-sm" style={{ color: "var(--muted)" }}>
            &#128205; {activity.location.label}
          </p>
        ) : null}
      </div>
    </div>
  );
}
