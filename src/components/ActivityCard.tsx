"use client";

import { useState } from "react";
import { activityColor } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { useOccurrenceTravel } from "@/hooks/useOccurrenceTravel";
import { computeDeparture, computeReturn } from "@/lib/travel";
import { timeStatusFor } from "@/lib/agenda";
import { formatDistance, formatDuration } from "@/lib/time";
import { describeRecurrence } from "@/lib/recurrence";
import {
  hasRealTime,
  isCancelled,
  journeyDelay,
  legTime,
  scheduledDeparture,
  travelModeMeta,
} from "@/lib/travelModes";
import { ActivityForm } from "./ActivityForm";
import { JourneyDetails } from "./JourneyDetails";
import { ErrorNote, Spinner } from "./ui";
import type { ActivityOccurrence } from "@/lib/types";

/**
 * Eén activiteit in de agenda, inclusief reistijd en vertrektijd.
 * Klikken opent hetzelfde formulier als bij toevoegen, in bewerkmodus.
 *
 * `now` (optioneel): geef dit mee om activiteiten die vandaag al voorbij zijn
 * gedempt te tonen ("geweest") en de lopende activiteit te markeren ("bezig").
 */
export function ActivityCard({ activity, now }: { activity: ActivityOccurrence; now?: Date }) {
  const { settings, calculatingIds, retryTravel, tasks, exams, categoryFor } = useAgenda();
  const [editing, setEditing] = useState(false);

  const category = categoryFor(activity.category);
  const color = activityColor(activity, category);

  // Bij OV hoort de rit bij de dag zelf: donderdag rijdt er een andere trein
  // dan maandag. Voor auto en fiets is dit gewoon de reis van de activiteit.
  const dayTravel = useOccurrenceTravel(activity, settings);
  const shown = {
    ...activity,
    travel: dayTravel.travel,
    returnTravel: dayTravel.returnTravel,
  };

  const departure = computeDeparture(shown, settings);
  const back = computeReturn(shown, settings);
  const calculating = calculatingIds.has(activity.id) || dayTravel.loading;

  // Live informatie over de heenreis: rijdt hij, en zo ja, op tijd?
  const legs = shown.travel?.legs;
  const delay = journeyDelay(legs);
  const live = hasRealTime(legs);
  const cancelled = isCancelled(legs);
  const plannedTime = legTime(scheduledDeparture(legs));
  const linkedTask = activity.linkedTaskId ? tasks.find((t) => t.id === activity.linkedTaskId) : null;
  const linkedExam = activity.linkedExamId ? exams.find((e) => e.id === activity.linkedExamId) : null;

  const status = now ? timeStatusFor(activity, now) : "upcoming";
  const isPast = status === "past";
  const isNow = status === "now";

  return (
    <>
      <article
        className="card overflow-hidden transition-opacity"
        style={{
          borderLeft: `4px solid ${color}`,
          opacity: isPast ? 0.5 : 1,
          boxShadow: isNow ? `0 0 0 2px color-mix(in srgb, ${color} 55%, transparent)` : undefined,
        }}
      >
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full px-4 py-3.5 text-left"
          aria-label={`${category.label}: ${activity.title} bewerken`}
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-lg leading-none">
              {category.emoji}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="truncate text-[0.95rem] font-semibold">{activity.title}</h3>
                <span
                  className="text-[0.7rem] font-semibold uppercase tracking-wide"
                  style={{ color }}
                >
                  {category.label}
                </span>
                {isPast ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold"
                    style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
                  >
                    ✓ geweest
                  </span>
                ) : isNow ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold"
                    style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
                  >
                    ● bezig
                  </span>
                ) : null}
                {linkedTask ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium"
                    style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
                    title={`Leerblok voor: ${linkedTask.subject}, ${linkedTask.title}`}
                  >
                    📚 {linkedTask.subject}
                  </span>
                ) : linkedExam ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium"
                    style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
                    title={`Leren voor toets: ${linkedExam.subject}`}
                  >
                    📝 {linkedExam.subject}
                  </span>
                ) : activity.source === "leerplan" ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium"
                    style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
                  >
                    📚 leerplan
                  </span>
                ) : null}
              </div>

              <p className="mt-0.5 text-sm tabular-nums" style={{ color: "var(--muted)" }}>
                {activity.startTime} &ndash; {activity.endTime}
              </p>

              {activity.recurrence ? (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  &#128257; {describeRecurrence(activity.recurrence)}
                </p>
              ) : null}

              {linkedTask ? (
                <p className="mt-1 truncate text-xs" style={{ color: "var(--muted)" }}>
                  &#8618; Voor opdracht: {linkedTask.title}
                </p>
              ) : linkedExam ? (
                <p className="mt-1 truncate text-xs" style={{ color: "var(--muted)" }}>
                  &#8618; Leren voor: {linkedExam.title ?? linkedExam.subject}
                </p>
              ) : null}

              {activity.location ? (
                <p className="mt-1.5 truncate text-xs" style={{ color: "var(--muted)" }}>
                  &#128205; {activity.location.label}
                </p>
              ) : null}

              {activity.location ? (
                <div className="mt-2 space-y-1">
                  {calculating ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      <Spinner size={12} label="Reistijd berekenen…" />
                    </p>
                  ) : activity.travelError ? (
                    <ErrorNote
                      onRetry={() => {
                        retryTravel(activity.id);
                      }}
                    >
                      {activity.travelError}
                    </ErrorNote>
                  ) : !settings.home ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      Stel je thuislocatie in voor de vertrektijd.
                    </p>
                  ) : departure && shown.travel ? (
                    <>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        {travelModeMeta(shown.travel.mode).emoji} Reistijd:{" "}
                        {formatDuration(shown.travel.durationMinutes)}
                        <span className="opacity-70">
                          {shown.travel.mode === "transit"
                            ? ` · ${shown.travel.transfers ?? 0} ${
                                (shown.travel.transfers ?? 0) === 1 ? "overstap" : "overstappen"
                              }`
                            : ` · ${formatDistance(shown.travel.distanceKm)}`}
                        </span>
                      </p>
                      <p className="text-sm font-semibold tabular-nums">
                        &#127968; Vertrekken om{" "}
                        <span style={delay > 0 ? { color: "#f97316" } : undefined}>
                          {departure.time}
                        </span>
                        {/* Bij vertraging: de tijd uit de dienstregeling erbij,
                            doorgestreept, zodat je ziet dat het is opgeschoven. */}
                        {delay > 0 && plannedTime ? (
                          <span
                            className="ml-1.5 text-xs font-normal line-through"
                            style={{ color: "var(--muted)" }}
                          >
                            {plannedTime}
                          </span>
                        ) : null}
                        {departure.previousDay ? (
                          <span className="ml-1 text-xs font-normal" style={{ color: "var(--muted)" }}>
                            (dag ervoor)
                          </span>
                        ) : null}
                      </p>

                      {cancelled ? (
                        <p className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
                          &#9888;&#65039; Deze rit is uitgevallen. Zoek een andere reis.
                        </p>
                      ) : delay > 0 ? (
                        <p className="text-xs font-semibold" style={{ color: "#f97316" }}>
                          &#9200; {delay} min vertraging &middot; live
                        </p>
                      ) : live ? (
                        <p className="text-xs" style={{ color: "#22c55e" }}>
                          &#9679; Op tijd &middot; live
                        </p>
                      ) : null}
                      {back ? (
                        <p className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                          &#8617;&#65039; Terug: {formatDuration(back.travelMinutes)} &middot; thuis om{" "}
                          {back.time}
                          {back.nextDay ? " (volgende dag)" : ""}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </button>

        {/* Buiten de knop: een <details> mag niet in een <button> staan. */}
        {shown.travel?.legs?.length || shown.returnTravel?.legs?.length ? (
          <div className="px-4 pb-3.5">
            {shown.travel ? (
              <JourneyDetails travel={shown.travel} label="🚆 Heenreis" defaultOpen={isNow} />
            ) : null}
            {shown.returnTravel ? (
              <JourneyDetails travel={shown.returnTravel} label="↩️ Terugreis" />
            ) : null}
            {!dayTravel.exact && !dayTravel.loading ? (
              <p className="mt-1.5 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                &#8505;&#65039; Deze tijden komen van een andere dag; open de app op de dag zelf
                voor de actuele rit.
              </p>
            ) : null}
          </div>
        ) : null}
      </article>

      {editing ? (
        <ActivityForm
          activity={activity}
          occurrenceDate={activity.date}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
