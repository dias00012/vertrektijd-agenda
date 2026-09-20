"use client";

import { activityColor } from "@/lib/categories";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { useOccurrenceTravel } from "@/hooks/useOccurrenceTravel";
import { useCatchUpTravel } from "@/hooks/useCatchUpTravel";
import { clashesFor, minutesUntilDeparture, onwardTarget } from "@/lib/agenda";
import { linkedWorkDone } from "@/lib/schoolwork";
import {
  computeDeparture,
  computeOnward,
  computeReturn,
  describeCatchUp,
  travelPlanForDate,
} from "@/lib/travel";
import { formatDateLabel, formatDuration, toDateKey, toDateTime } from "@/lib/time";
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
import type { ActivityOccurrence } from "@/lib/types";

/**
 * Uitgelicht blok bovenaan het dashboard: de eerstvolgende activiteit met
 * reistijd, vertrektijd en een aftelling.
 */
export function NextUpCard({ activity, now }: { activity: ActivityOccurrence; now: Date }) {
  const { activities, settings, calculatingIds, tasks, exams, categoryFor } = useAgenda();
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
  // Mét de bestemming erbij, anders kan "je komt te laat" nooit waar worden.
  const nextStop = onwardTarget(activity, activities);
  const onward = computeOnward(shown, nextStop?.startTime ?? null);
  /*
   * Staat er iets tegelijk met wat je nu gaat doen? Dan is dít het moment om
   * het te weten. De doorreis laten we eruit: die staat er al met de tijd
   * waarop je aankomt.
   */
  const clash = clashesFor(activity, activities, settings).find(
    (item) => !(item.travelOnly && item.other.occurrenceId === nextStop?.occurrenceId),
  );
  const untilDeparture = minutesUntilDeparture(shown, settings, now);
  const calculating = calculatingIds.has(activity.id) || dayTravel.loading;

  const legs = shown.travel?.legs;
  const delay = journeyDelay(legs);
  const live = hasRealTime(legs);
  const cancelled = isCancelled(legs);
  const linkedTask = activity.linkedTaskId
    ? tasks.find((t) => t.id === activity.linkedTaskId)
    : null;
  const linkedExam = activity.linkedExamId
    ? exams.find((e) => e.id === activity.linkedExamId)
    : null;
  /** Werk dat al af is: dan hoef je hier niets meer te doen. */
  const workDone = linkedWorkDone(activity, tasks, exams);

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

  /*
   * Je vertrektijd is voorbij en je activiteit moet nog beginnen. Dan staat er
   * een rit op het scherm die zeker niet meer gaat; wat je wilt weten is wat er
   * nog wél rijdt. Alleen vandaag en alleen bij OV: een auto vertrekt wanneer
   * jij wilt, en voor morgen is er niets gemist.
   */
  const plan = travelPlanForDate(activity, settings, activity.date);
  const missedRide =
    shown.travel?.mode === "transit" &&
    activity.date === toDateKey(now) &&
    untilDeparture !== null &&
    untilDeparture <= -5 &&
    now < toDateTime(activity.date, activity.startTime);
  const catchUpTravel = useCatchUpTravel(
    settings.home,
    activity.location,
    plan?.outboundBike ?? "none",
    Boolean(missedRide),
  );
  const catchUp = describeCatchUp(catchUpTravel.travel, activity.startTime);

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
            <h2
              className="truncate text-lg font-semibold"
              style={
                workDone ? { textDecoration: "line-through", color: "var(--muted)" } : undefined
              }
            >
              {activity.title}
            </h2>
            {workDone ? (
              <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>
                &#10003; {t("activity.freeAgain")}
              </p>
            ) : null}
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
            {clash ? (
              <p className="mt-1 text-sm font-medium" style={{ color: "var(--warn)" }}>
                &#9888;&#65039;{" "}
                {t(clash.travelOnly ? "activity.clashTravel" : "activity.clash", {
                  title: clash.other.title,
                  from: clash.other.startTime,
                  to: clash.other.endTime,
                })}
              </p>
            ) : null}
          </div>
        </div>

        {activity.location ? (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            {calculating ? (
              <Spinner size={14} label={t("activity.calculating")} />
            ) : /*
             * Een tijd die we hebben gaat vóór een storing die we melden.
             *
             * Andersom stond hier alleen een rode regel en geen vertrektijd,
             * terwijl de reis van de vorige berekening er gewoon was. Precies
             * 's ochtends, als de planner even hapert en jij naar je trein
             * moet, kreeg je dan niets -- terwijl die oude tijd meestal nog
             * prima klopt. De hook eronder doet het al zo ("liever een
             * benadering dan een lege kaart"); deze kaart deed het niet.
             *
             * De storing verdwijnt niet, hij komt er als notitie onder te
             * staan, zodat je weet dat het een schatting van eerder is.
             */
            departure && shown.travel ? (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p
                    className="text-[0.7rem] uppercase tracking-wide"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("next.leaveAt")}
                  </p>
                  <p
                    className="text-3xl font-semibold tabular-nums leading-tight"
                    style={delay > 0 ? { color: "var(--warn)" } : undefined}
                  >
                    {departure.time}
                  </p>
                  {/* Haalt de eerstvolgende rit je starttijd niet, dan hoort dat
                      hier te staan en niet alleen in de reisdetails. */}
                  {departure.late && departure.arrival ? (
                    <p className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
                      &#9888;&#65039; {t("activity.arriveLate", { time: departure.arrival })}
                    </p>
                  ) : null}
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
            ) : onward ? (
              /* Je gaat hierna rechtstreeks door; dan is de aankomst daar het
                 getal dat telt, niet je thuiskomst. */
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p
                    className="text-[0.7rem] tracking-wide uppercase"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("next.onwardLabel", { place: onward.to.label })}
                  </p>
                  <p className="text-3xl leading-tight font-semibold tabular-nums">
                    {onward.arrival}
                  </p>
                </div>
                <div className="pb-1">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    &#10230; {formatDuration(onward.travelMinutes)}{" "}
                    {t(shown.onwardTravel?.mode === "car" ? "timeline.drive" : "timeline.travel")}
                  </p>
                  {onward.late ? (
                    <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
                      {t("timeline.onwardLate")}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : back && shown.returnTravel ? (
              /* Zit je al op je plek, dan valt er niets meer te vertrekken.
                 Wat je dan wilt weten is hoe laat je weer thuis bent; dat is
                 op een schooldag het getal waar je op wacht. */
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p
                    className="text-[0.7rem] tracking-wide uppercase"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("next.homeLabel")}
                  </p>
                  <p className="text-3xl leading-tight font-semibold tabular-nums">{back.time}</p>
                </div>
                <div className="pb-1">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    &#8617;&#65039; {travelModeMeta(shown.returnTravel.mode).emoji}{" "}
                    {formatDuration(back.travelMinutes)}{" "}
                    {t(shown.returnTravel.mode === "car" ? "timeline.drive" : "timeline.travel")}
                  </p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {t("next.stillHere")}
                  </p>
                </div>
              </div>
            ) : activity.travelError ? (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                &#9888;&#65039; {activity.travelError}
              </p>
            ) : !settings.home ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("next.needHome")}
              </p>
            ) : null}

            {/* Er staat een tijd, maar hij is niet van nu. Dat hoort erbij. */}
            {activity.travelError && departure && shown.travel ? (
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                &#9888;&#65039; {t("next.travelOld")}
              </p>
            ) : null}

            {/* Wat er nog rijdt nu je vertrektijd voorbij is. */}
            {missedRide && !calculating ? (
              <p
                className="mt-2 text-sm font-semibold tabular-nums"
                style={{
                  color: catchUp && catchUp.lateMinutes > 0 ? "var(--danger)" : "var(--ink)",
                }}
              >
                {catchUp ? (
                  <>
                    &#128646; {t("next.catchUp", { time: catchUp.time, arrival: catchUp.arrival })}
                    <span className="font-normal">
                      {" · "}
                      {catchUp.lateMinutes > 0
                        ? t("next.catchUpLate", { count: catchUp.lateMinutes })
                        : t("next.catchUpOnTime")}
                    </span>
                  </>
                ) : catchUpTravel.nothingLeft ? (
                  t("next.catchUpNone")
                ) : catchUpTravel.loading ? (
                  <Spinner size={12} label={t("next.catchUpSearching")} />
                ) : null}
              </p>
            ) : null}

            {/* Je eerstvolgende reis staat open: dít is wat je nu wilt weten. */}
            {shown.travel?.legs?.length ? (
              <JourneyDetails
                travel={shown.travel}
                label={`🚆 ${t("journey.yours")}`}
                defaultOpen
              />
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
