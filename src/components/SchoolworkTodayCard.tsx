"use client";

import Link from "next/link";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { activitiesOnDate } from "@/lib/agenda";
import { workload } from "@/lib/planning";
import {
  PRIORITY_META,
  activityMinutes,
  describeDaysUntil,
  linkedWorkDone,
  sortExams,
  sortTasks,
} from "@/lib/schoolwork";
import { formatDuration, todayKey } from "@/lib/time";

/**
 * Compacte schoolwerk-samenvatting op het dashboard: hoeveel leertijd vandaag
 * gepland staat, hoeveel werk er nog ingepland moet worden voor de
 * eerstvolgende deadline en hoeveel vrije tijd daar tegenover staat, en wat de
 * eerstvolgende deadline en toets zijn. Toont niets wanneer er geen schoolwerk
 * is, zodat het dashboard rustig blijft.
 */
export function SchoolworkTodayCard({ now }: { now: Date }) {
  const { activities, tasks, exams, settings } = useAgenda();
  const t = useT();

  const today = todayKey(now);
  const studyToday = activitiesOnDate(activities, today).filter(
    (a) => a.source === "leerplan" || a.linkedTaskId || a.linkedExamId,
  );
  const studyMinutes = studyToday.reduce((sum, a) => sum + activityMinutes(a), 0);
  /*
   * Hoeveel van die tijd staat voor werk dat al af is? Dat is precies de vraag
   * die je stelt als je 's ochtends kijkt: moet ik vanavond nog achter mijn
   * bureau, of is die twee uur vrij.
   */
  const doneMinutes = studyToday
    .filter((activity) => linkedWorkDone(activity, tasks, exams))
    .reduce((sum, a) => sum + activityMinutes(a), 0);

  /*
   * Past het nog? Dit is de vraag waar de kaart eerst geen antwoord op gaf: je
   * zag hoeveel er gepland stond, maar niet hoeveel er nog moest en of daar
   * nog avonden voor waren. "Geen leerblokken gepland" was dan ook geen
   * geruststelling maar precies het probleem.
   */
  const stand = workload(tasks, exams, activities, settings, now);
  const tekort = stand.todoMinutes - stand.freeMinutes;

  const nextTask = sortTasks(tasks).find((t) => t.status !== "done");
  const nextExam = sortExams(exams).find((e) => e.status !== "done");

  if (studyToday.length === 0 && !nextTask && !nextExam) return null;

  return (
    <Link
      href="/schoolwerk"
      className="card mb-5 block px-5 py-4 no-underline"
      aria-label={t("schoolworkToday.open")}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[0.7rem] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          {t("schoolworkToday.title")}
        </p>
        <span aria-hidden style={{ color: "var(--muted)" }}>
          →
        </span>
      </div>

      <p className="mt-2 text-sm">
        {studyToday.length > 0 ? (
          <>
            &#127919;{" "}
            {t("schoolworkToday.planned", { duration: formatDuration(studyMinutes) })}
            <span style={{ color: "var(--muted)" }}>
              {" ("}
              {t(studyToday.length === 1 ? "schoolworkToday.block" : "schoolworkToday.blocks", {
                count: studyToday.length,
              })}
              {")"}
            </span>
            {doneMinutes > 0 ? (
              <span className="font-semibold" style={{ color: "#16a34a" }}>
                {" \u00b7 "}
                {t("schoolworkToday.doneShare", { duration: formatDuration(doneMinutes) })}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>{t("schoolworkToday.none")}</span>
        )}
      </p>

      {stand.until ? (
        <p className="mt-1 text-sm">
          {stand.todoMinutes > 0 ? (
            <>
              &#9203;{" "}
              {t("schoolworkToday.todo", {
                duration: formatDuration(stand.todoMinutes),
                day: describeDaysUntil(stand.until, now),
              })}
              <span style={{ color: tekort > 0 ? "#dc2626" : "var(--muted)" }}>
                {" \u00b7 "}
                {tekort > 0
                  ? t("schoolworkToday.tight", { duration: formatDuration(tekort) })
                  : t("schoolworkToday.room", { duration: formatDuration(stand.freeMinutes) })}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>{t("schoolworkToday.allPlanned")}</span>
          )}
        </p>
      ) : null}

      <div className="mt-1.5 space-y-0.5 text-xs" style={{ color: "var(--muted)" }}>
        {nextTask ? (
          <p className="truncate">
            <span aria-hidden>{PRIORITY_META[nextTask.priority].emoji}</span>{" "}
            {t("schoolworkToday.deadline", {
              title: nextTask.title,
              days: describeDaysUntil(nextTask.deadline, now),
            })}
          </p>
        ) : null}
        {nextExam ? (
          <p className="truncate">
            &#128221;{" "}
            {t("schoolworkToday.exam", {
              subject: nextExam.subject,
              days: describeDaysUntil(nextExam.date, now),
            })}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
