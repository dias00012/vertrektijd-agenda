"use client";

import { activityColor } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { useOccurrenceTravel } from "@/hooks/useOccurrenceTravel";
import { minutesUntilDeparture } from "@/lib/agenda";
import { computeDeparture, computeReturn } from "@/lib/travel";
import { formatDateLabel, formatDuration } from "@/lib/time";
import {
  hasRealTime,
  isCancelled,
  journeyDelay,
  legTime,
  scheduledDeparture,
  travelModeMeta,
} from "@/lib/travelModes";
import { JourneyDetails } from "./JourneyDetails";
import { Spinner } from "./ui";
import type { Activity } from "@/lib/types";

/**
 * Uitgelicht blok bovenaan het dashboard: de eerstvolgende activiteit met
 * reistijd, vertrektijd en een aftelling.
 */
export function NextUpCard({ activity, now }: { activity: Activity; now: Date }) {
  const { settings, calculatingIds, tasks, exams, categoryFor } = useAgenda();
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
  const plannedTime = legTime(scheduledDeparture(legs));
  const linkedTask = activity.linkedTaskId ? tasks.find((t) => t.id === activity.linkedTaskId) : null;
  const linkedExam = activity.linkedExamId ? exams.find((e) => e.id === activity.linkedExamId) : null;

  // Een aftelling is alleen zinvol binnen een halve dag; daarbuiten zegt het
  // datumlabel ("maandag 7 september") al genoeg.
  const COUNTDOWN_HORIZON_MINUTES = 12 * 60;
  const countdown =
    untilDeparture === null || untilDeparture > COUNTDOWN_HORIZON_MINUTES
      ? null
      : untilDeparture > 0
        ? `Over ${formatDuration(untilDeparture)} vertrekken`
        : untilDeparture > -5
          ? "Nu vertrekken"
          : "Vertrektijd is verstreken";

  const urgent = untilDeparture !== null && untilDeparture <= 15;

  return (
    <section
      className="card mb-5 overflow-hidden"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, var(--line))`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 9%, var(--surface)), var(--surface))`,
      }}
      aria-label="Eerstvolgende activiteit"
    >
      <div className="px-5 py-4">
        <p
          className="text-[0.7rem] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          Eerstvolgende activiteit
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
                &#128218; Voor opdracht: {linkedTask.title}
              </p>
            ) : linkedExam ? (
              <p className="mt-1 truncate text-sm" style={{ color: "var(--muted)" }}>
                &#128221; Leren voor: {linkedExam.title ?? linkedExam.subject}
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
              <Spinner size={14} label="Reistijd berekenen…" />
            ) : activity.travelError ? (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                &#9888;&#65039; {activity.travelError}
              </p>
            ) : departure && shown.travel ? (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-[0.7rem] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    Vertrek om
                  </p>
                  <p
                    className="text-3xl font-semibold tabular-nums leading-tight"
                    style={delay > 0 ? { color: "#f97316" } : undefined}
                  >
                    {departure.time}
                  </p>
                  {cancelled ? (
                    <p className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
                      &#9888;&#65039; rit uitgevallen
                    </p>
                  ) : delay > 0 ? (
                    <p className="text-xs font-semibold" style={{ color: "#f97316" }}>
                      &#9200; {delay} min later
                      {plannedTime ? (
                        <span className="ml-1 font-normal line-through" style={{ color: "var(--muted)" }}>
                          {plannedTime}
                        </span>
                      ) : null}
                    </p>
                  ) : live ? (
                    <p className="text-xs" style={{ color: "#22c55e" }}>
                      &#9679; op tijd &middot; live
                    </p>
                  ) : null}
                </div>
                <div className="pb-1">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {travelModeMeta(shown.travel.mode).emoji}{" "}
                    {formatDuration(shown.travel.durationMinutes)}{" "}
                    {shown.travel.mode === "car" ? "rijden" : "reizen"}
                    <span className="opacity-70">
                      {shown.travel.mode === "transit"
                        ? ` · ${shown.travel.transfers ?? 0} ${
                            (shown.travel.transfers ?? 0) === 1 ? "overstap" : "overstappen"
                          }`
                        : ` + ${departure.bufferMinutes} min marge`}
                    </span>
                  </p>
                  {back ? (
                    <p className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
                      &#8617;&#65039; Terug thuis om {back.time}
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
                Stel je thuislocatie in om de vertrektijd te zien.
              </p>
            ) : null}

            {/* Je eerstvolgende reis staat open: dít is wat je nu wilt weten. */}
            {shown.travel?.legs?.length ? (
              <JourneyDetails travel={shown.travel} label="🚆 Je reis" defaultOpen />
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            &#9201;&#65039; Begint om <strong style={{ color: "var(--ink)" }}>{activity.startTime}</strong>
            {linkedTask || linkedExam ? " — thuis, geen reistijd." : " — geen locatie, geen reistijd."}
          </p>
        )}
      </div>
    </section>
  );
}
