"use client";

import Link from "next/link";
import { useAgenda } from "@/hooks/useAgenda";
import { activitiesOnDate } from "@/lib/agenda";
import {
  PRIORITY_META,
  activityMinutes,
  describeDaysUntil,
  sortExams,
  sortTasks,
} from "@/lib/schoolwork";
import { formatDuration, todayKey } from "@/lib/time";

/**
 * Compacte schoolwerk-samenvatting op het dashboard: hoeveel leertijd vandaag
 * gepland staat, en wat de eerstvolgende deadline en toets zijn. Toont niets
 * wanneer er geen schoolwerk is, zodat het dashboard rustig blijft.
 */
export function SchoolworkTodayCard({ now }: { now: Date }) {
  const { activities, tasks, exams } = useAgenda();

  const today = todayKey(now);
  const studyToday = activitiesOnDate(activities, today).filter(
    (a) => a.source === "leerplan" || a.linkedTaskId || a.linkedExamId,
  );
  const studyMinutes = studyToday.reduce((sum, a) => sum + activityMinutes(a), 0);

  const nextTask = sortTasks(tasks).find((t) => t.status !== "done");
  const nextExam = sortExams(exams).find((e) => e.status !== "done");

  if (studyToday.length === 0 && !nextTask && !nextExam) return null;

  return (
    <Link
      href="/schoolwerk"
      className="card mb-5 block px-5 py-4 no-underline"
      aria-label="Schoolwerk-overzicht openen"
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[0.7rem] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          Schoolwerk vandaag
        </p>
        <span aria-hidden style={{ color: "var(--muted)" }}>
          →
        </span>
      </div>

      <p className="mt-2 text-sm">
        {studyToday.length > 0 ? (
          <>
            &#127919; <strong>{formatDuration(studyMinutes)}</strong> leren gepland vandaag
            <span style={{ color: "var(--muted)" }}>
              {" "}
              ({studyToday.length} {studyToday.length === 1 ? "blok" : "blokken"})
            </span>
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>Geen leerblokken gepland voor vandaag.</span>
        )}
      </p>

      <div className="mt-1.5 space-y-0.5 text-xs" style={{ color: "var(--muted)" }}>
        {nextTask ? (
          <p className="truncate">
            <span aria-hidden>{PRIORITY_META[nextTask.priority].emoji}</span> Deadline:{" "}
            {nextTask.title} &middot; {describeDaysUntil(nextTask.deadline, now)}
          </p>
        ) : null}
        {nextExam ? (
          <p className="truncate">
            &#128221; Toets {nextExam.subject} &middot; {describeDaysUntil(nextExam.date, now)}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
