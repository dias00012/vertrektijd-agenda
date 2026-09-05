import type { Activity, Exam, SchoolworkPriority, SchoolworkStatus, Task } from "./types";
import { parseDateKey, timeToMinutes, todayKey } from "./time";

/** Weergave-informatie per prioriteit. */
export const PRIORITY_META: Record<
  SchoolworkPriority,
  { label: string; emoji: string; color: string; order: number }
> = {
  high: { label: "Hoog", emoji: "\u{1F534}", color: "#ef4444", order: 0 },
  medium: { label: "Middel", emoji: "\u{1F7E0}", color: "#f97316", order: 1 },
  low: { label: "Laag", emoji: "\u{1F7E1}", color: "#eab308", order: 2 },
  later: { label: "Later", emoji: "\u{1F7E2}", color: "#22c55e", order: 3 },
};

export const STATUS_META: Record<SchoolworkStatus, { label: string; color: string }> = {
  todo: { label: "Te doen", color: "#64748b" },
  doing: { label: "Bezig", color: "#3b82f6" },
  done: { label: "Klaar", color: "#22c55e" },
};

export const STATUS_ORDER: SchoolworkStatus[] = ["todo", "doing", "done"];

/** Taken op deadline, dan op prioriteit; afgeronde taken onderaan. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    if (a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
    return PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order;
  });
}

/** Toetsen op datum; afgeronde toetsen onderaan. */
export function sortExams(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    return a.date.localeCompare(b.date);
  });
}

/** Hele dagen tussen vandaag en de opgegeven datum. Negatief = in het verleden. */
export function daysUntil(dateKey: string, now: Date = new Date()): number {
  const target = parseDateKey(dateKey).getTime();
  const start = parseDateKey(todayKey(now)).getTime();
  return Math.round((target - start) / 86_400_000);
}

/** "vandaag" / "morgen" / "over 3 dagen" / "3 dagen geleden". */
export function describeDaysUntil(dateKey: string, now: Date = new Date()): string {
  const days = daysUntil(dateKey, now);
  if (days === 0) return "vandaag";
  if (days === 1) return "morgen";
  if (days === -1) return "gisteren";
  if (days > 1) return `over ${days} dagen`;
  return `${Math.abs(days)} dagen geleden`;
}

/** Voortgang van een taak op basis van afgevinkte stappen (0 wanneer geen stappen). */
export function taskProgress(task: Task): { done: number; total: number } {
  const total = task.steps?.length ?? 0;
  const done = task.steps?.filter((step) => step.done).length ?? 0;
  return { done, total };
}

/* --- Koppeling agenda <-> schoolwerk ------------------------------------ */

/** Duur van een activiteit in minuten (eindtijd minus starttijd). */
export function activityMinutes(activity: Pick<Activity, "startTime" | "endTime">): number {
  return Math.max(0, timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime));
}

/** De activiteiten die aan een taak zijn gekoppeld. */
export function activitiesForTask(activities: Activity[], taskId: string): Activity[] {
  return activities.filter((a) => a.linkedTaskId === taskId);
}

/** De activiteiten die aan een toets zijn gekoppeld. */
export function activitiesForExam(activities: Activity[], examId: string): Activity[] {
  return activities.filter((a) => a.linkedExamId === examId);
}

/** Totaal aan ingeplande minuten voor een taak (som van gekoppelde blokken). */
export function plannedMinutesForTask(activities: Activity[], taskId: string): number {
  return activitiesForTask(activities, taskId).reduce((sum, a) => sum + activityMinutes(a), 0);
}

/** Totaal aan ingeplande minuten voor een toets. */
export function plannedMinutesForExam(activities: Activity[], examId: string): number {
  return activitiesForExam(activities, examId).reduce((sum, a) => sum + activityMinutes(a), 0);
}

/** Ingeplande tijd t.o.v. de schatting, met percentage voor een voortgangsbalk. */
export function plannedProgress(
  plannedMinutes: number,
  estimateMinutes: number | undefined,
): { planned: number; estimate: number; pct: number; enough: boolean } {
  const estimate = estimateMinutes ?? 0;
  const pct = estimate > 0 ? Math.min(100, Math.round((plannedMinutes / estimate) * 100)) : 0;
  return { planned: plannedMinutes, estimate, pct, enough: estimate > 0 && plannedMinutes >= estimate };
}
