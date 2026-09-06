"use client";

import { activityColor } from "@/lib/categories";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { useOccurrenceTravel } from "@/hooks/useOccurrenceTravel";
import { minutesUntilDeparture } from "@/lib/agenda";
import { computeDeparture, computeReturn } from "@/lib/travel";
import { formatDateLabel, formatDuration } from "@/lib/time";
import {
  hasRealTime,
  isCancelled,
  journeyDelay,
  scheduledDeparture,
  travelModeMeta,
} from "@/lib/travelModes";
import { JourneyDetails } from "./JourneyDetails";
import { JourneyStatus } from "./JourneyStatus";
import { Spinner } from "./ui";
import type { Activity } from "@/lib/types";

/**
 * Uitgelicht blok bovenaan het dashboard: de eerstvolgende activiteit met
 * reistijd, vertrektijd en een aftelling.
 */
export function NextUpCard({ activity, now }: { activity: Activity; now: Date }) {
  const { settings, calculatingIds, tasks, exams, categoryFor } = useAgenda();
  const t = useT();
  const category = categoryFor(activity.category);
  const color = activityColor(activity, category);
  // De rit van déze dag: bij OV rijdt er morgen een andere trein dan vandaag.
  const dayTravel = useOccurrenceTravel(activity, settings);
  const shown = {
    ...activity,
    travel: dayTravel.travel,
    returnTravel: dayTravel.returnTravel,
  };

  const departure = computeDeparture(shown, settings);
  const back = computeReturn(shown, settings);
  const untilDeparture = minutesUntilDeparture(shown, settings, now);
  const calculating = calculatingIds.has(activity.id) || dayTravel.loading;

  const legs = shown.travel?.legs;
  const delay = journeyDelay(legs);
  const live = hasRealTime(legs);
  const cancelled = isCancelled(legs);
  const linkedTask = activity.linkedTaskId ? tasks.find((t) => t.id === activity.linkedTaskId) : null;
  const linkedExam = activity.linkedExamId ? exams.find((e) => e.id === activity.linkedExamId) : null;

  // Een aftelling is alleen zinvol binnen een halve dag; daarbuiten zegt het
  // datumlabel ("maandag 7 september") al genoeg.
  const COUNTDOWN_HORIZON_MINUTES = 12 * 60;
  const countdown =
    untilDeparture === null || untilDeparture > COUNTDOWN_HORIZON_MINUTES
      ? null
      : untilDeparture > 0
        ? t("next.leaveIn", { duration: formatDuration(untilDeparture) })
        : untilDeparture > -5
          ? t("next.leaveNow")
          : t("next.leavePassed");

  const urgent = untilDeparture !== null && untilDeparture <= 15;

  return (
    <section
      className="card mb-5 overflow-hidden"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, var(--line))`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 9%, var(--surface)), var(--surface))`,
      }}
      aria-label={t("next.title")}
    >
      <div className="px-5 py-4">
        <p
          className="text-[0.7rem] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          {t("next.title")}
        </p>

        <div className="mt-2 flex items-start gap-3">
          <span aria-hidden className="text-2xl leading-none">
            {category.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{activity.title}</h2>
            <p className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
              {formatDateLabel(activity.date, now)} &middot; {activity.startTime} &ndash;{" "}
              {activity.endTime}
            </p>
            {linkedTask ? (
              <p className="mt-1 truncate text-sm" style={{ color: "var(--muted)" }}>
                &#128218; {t("next.forTask", { title: linkedTask.title })}
              </p>
            ) : linkedExam ? (
              <p className="mt-1 truncate text-sm" style={{ color: "var(--muted)" }}>
                &#128221; {t("next.forExam", { title: linkedExam.title ?? linkedExam.subject })}
              </p>
            ) : null}
            {activity.location ? (
              <p className="mt-1 truncate text-sm" style={{ color: "var(--muted)" }}>
                &#128205; {activity.location.label}
              </p>
            ) : null}
          </div>
        </div>

        {activity.location ? (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            {calculating ? (
              <Spinner size={14} label={t("activity.calculating")} />
            ) : activity.travelError ? (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                &#9888;&#65039; {activity.travelError}
              </p>
            ) : departure && shown.travel ? (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-[0.7rem] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    {t("next.leaveAt")}
                  </p>
                  <p
                    className="text-3xl font-semibold tabular-nums leading-tight"
                    style={delay > 0 ? { color: "#f97316" } : undefined}
                  >
                    {departure.time}
                  </p>
                  {shown.travel.mode === "transit" ? (
                    <JourneyStatus
                      cancelled={cancelled}
                      delayMinutes={delay}
                      realTime={live}
                      scheduledDeparture={scheduledDeparture(legs)}
                    />
                  ) : null}
                </div>
                <div className="pb-1">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {travelModeMeta(shown.travel.mode).emoji}{" "}
                    {formatDuration(shown.travel.durationMinutes)}{" "}
                    {t(shown.travel.mode === "car" ? "timeline.drive" : "timeline.travel")}
                    <span className="opacity-70">
                      {shown.travel.mode === "transit"
                        ? ` · ${shown.travel.transfers ?? 0} ${
                            (shown.travel.transfers ?? 0) === 1
                              ? t("journey.transfer")
                              : t("journey.transfers")
                          }`
                        : ` ${t("next.buffer", { count: departure.bufferMinutes })}`}
                    </span>
                  </p>
                  {back ? (
                    <p className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
                      &#8617;&#65039; {t("next.homeAt", { time: back.time })}
                    </p>
                  ) : null}
                  {countdown ? (
                    <p
                      className="text-sm font-semibold"
                      style={{ color: urgent ? "var(--danger)" : "var(--ink)" }}
                    >
                      &#9200; {countdown}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : !settings.home ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("next.needHome")}
              </p>
            ) : null}

            {/* Je eerstvolgende reis staat open: dít is wat je nu wilt weten. */}
            {shown.travel?.legs?.length ? (
              <JourneyDetails travel={shown.travel} label={`🚆 ${t("journey.yours")}`} defaultOpen />
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            &#9201;&#65039; {t("next.startsAt")}{" "}
            <strong style={{ color: "var(--ink)" }}>{activity.startTime}</strong>
            {linkedTask || linkedExam ? t("next.atHome") : t("next.noLocation")}
          </p>
        )}
      </div>
    </section>
  );
}
