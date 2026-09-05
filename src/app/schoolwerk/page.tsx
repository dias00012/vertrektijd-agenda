"use client";

import { useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import {
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
  describeDaysUntil,
  plannedMinutesForExam,
  plannedMinutesForTask,
  plannedProgress,
  sortExams,
  sortTasks,
  taskProgress,
} from "@/lib/schoolwork";
import { formatDateLabel, formatDuration } from "@/lib/time";
import { EmptyState, Spinner } from "@/components/ui";
import type { Exam, SchoolworkStatus, Task } from "@/lib/types";

/** Filter op status. "open" = te doen + bezig (alles wat nog moet gebeuren). */
type StatusFilter = "open" | "done" | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "open", label: "Openstaand" },
  { id: "done", label: "Klaar" },
  { id: "all", label: "Alles" },
];

function matchesFilter(status: SchoolworkStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "done") return status === "done";
  return status !== "done"; // "open"
}

/** Schoolwerk: opdrachten op deadline en toetsen op datum, met status en stappen. */
export default function SchoolworkPage() {
  const { tasks, exams, hydrated } = useAgenda();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<StatusFilter>("open");

  const sortedTasks = sortTasks(tasks).filter((t) => matchesFilter(t.status, filter));
  const sortedExams = sortExams(exams).filter((e) => matchesFilter(e.status, filter));

  // Aantallen per filter voor de labels op de knoppen.
  const openCount = tasks.filter((t) => t.status !== "done").length +
    exams.filter((e) => e.status !== "done").length;
  const doneCount = tasks.filter((t) => t.status === "done").length +
    exams.filter((e) => e.status === "done").length;
  const counts: Record<StatusFilter, number> = {
    open: openCount,
    done: doneCount,
    all: tasks.length + exams.length,
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Schoolwerk</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Je opdrachten en toetsen, aangeleverd door je planner.
        </p>
      </header>

      {!hydrated ? (
        <div className="card px-5 py-10 text-center">
          <Spinner size={18} label="Schoolwerk laden…" />
        </div>
      ) : tasks.length === 0 && exams.length === 0 ? (
        <EmptyState
          icon="📚"
          title="Nog geen schoolwerk"
          description="Importeer een bestand van je planner via Instellingen → Back-up & synchronisatie."
        />
      ) : (
        <>
          <div
            className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border p-1"
            role="tablist"
            aria-label="Filter op status"
            style={{ background: "var(--surface-soft)", borderColor: "var(--line)" }}
          >
            {FILTERS.map((item) => {
              const active = item.id === filter;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(item.id)}
                  className="rounded-xl px-2 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: active ? "var(--surface)" : "transparent",
                    color: active ? "var(--ink)" : "var(--muted)",
                    boxShadow: active ? "var(--shadow-card)" : "none",
                  }}
                >
                  {item.label}
                  <span className="ml-1 text-xs opacity-70">{counts[item.id]}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-8">
            <section aria-label="Opdrachten">
              <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                Opdrachten ({sortedTasks.length})
              </h2>
              {sortedTasks.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {filter === "done" ? "Nog niets afgerond." : "Geen openstaande opdrachten. 🎉"}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {sortedTasks.map((task) => (
                    <TaskCard key={task.id} task={task} now={now} />
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Toetsen">
              <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                Toetsen ({sortedExams.length})
              </h2>
              {sortedExams.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {filter === "done" ? "Nog geen toetsen afgerond." : "Geen openstaande toetsen."}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {sortedExams.map((exam) => (
                    <ExamCard key={exam.id} exam={exam} now={now} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatusControl({
  value,
  onChange,
}: {
  value: SchoolworkStatus;
  onChange: (status: SchoolworkStatus) => void;
}) {
  return (
    <div
      className="flex rounded-lg border p-0.5"
      style={{ borderColor: "var(--line)" }}
      role="group"
      aria-label="Status"
    >
      {STATUS_ORDER.map((status) => {
        const active = value === status;
        const meta = STATUS_META[status];
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(status)}
            className="rounded-md px-2 py-1 text-[0.7rem] font-medium transition-colors"
            style={{
              background: active ? `color-mix(in srgb, ${meta.color} 18%, transparent)` : "transparent",
              color: active ? meta.color : "var(--muted)",
            }}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

/** Balkje: hoeveel leertijd al is ingepland t.o.v. de schatting. */
function PlannedBar({ plannedMinutes, estimateMinutes }: { plannedMinutes: number; estimateMinutes?: number }) {
  const { planned, estimate, pct, enough } = plannedProgress(plannedMinutes, estimateMinutes);
  if (estimate === 0 && planned === 0) return null;

  const barColor = enough ? "#22c55e" : "var(--accent)";
  return (
    <div className="mt-2">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        &#128203; Ingepland: {formatDuration(planned)}
        {estimate > 0 ? ` van ${formatDuration(estimate)}` : " (geen schatting)"}
        {enough ? " ✓" : ""}
      </p>
      {estimate > 0 ? (
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--surface-soft)" }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({ task, now }: { task: Task; now: Date }) {
  const { activities, setTaskStatus, toggleTaskStep } = useAgenda();
  const plannedMinutes = plannedMinutesForTask(activities, task.id);
  const priority = PRIORITY_META[task.priority];
  const progress = taskProgress(task);
  const overdue = task.status !== "done" && new Date(task.deadline) < new Date(now.toDateString());
  const done = task.status === "done";

  return (
    <article
      className="card px-4 py-3.5"
      style={{ borderLeft: `4px solid ${priority.color}`, opacity: done ? 0.7 : 1 }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-base leading-none" title={`Prioriteit: ${priority.label}`}>
          {priority.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3
              className="text-[0.95rem] font-semibold"
              style={{ textDecoration: done ? "line-through" : "none" }}
            >
              {task.title}
            </h3>
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              {task.subject}
            </span>
          </div>

          {task.description ? (
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              {task.description}
            </p>
          ) : null}

          <p className="mt-1.5 text-xs tabular-nums" style={{ color: overdue ? "var(--danger)" : "var(--muted)" }}>
            &#128197; {formatDateLabel(task.deadline, now)} &middot; {describeDaysUntil(task.deadline, now)}
            {task.estimatedMinutes > 0 ? (
              <span style={{ color: "var(--muted)" }}> &middot; &#9201;&#65039; {formatDuration(task.estimatedMinutes)}</span>
            ) : null}
            {progress.total > 0 ? (
              <span style={{ color: "var(--muted)" }}>
                {" "}
                &middot; {progress.done}/{progress.total} stappen
              </span>
            ) : null}
          </p>

          <PlannedBar plannedMinutes={plannedMinutes} estimateMinutes={task.estimatedMinutes} />

          {task.steps && task.steps.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {task.steps.map((step) => (
                <li key={step.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      checked={step.done}
                      onChange={() => toggleTaskStep(task.id, step.id)}
                    />
                    <span
                      style={{
                        textDecoration: step.done ? "line-through" : "none",
                        color: step.done ? "var(--muted)" : "var(--ink)",
                      }}
                    >
                      {step.title}
                      {step.estimatedMinutes ? (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {" "}
                          &middot; {formatDuration(step.estimatedMinutes)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3">
            <StatusControl value={task.status} onChange={(status) => setTaskStatus(task.id, status)} />
          </div>
        </div>
      </div>
    </article>
  );
}

function ExamCard({ exam, now }: { exam: Exam; now: Date }) {
  const { activities, setExamStatus } = useAgenda();
  const plannedMinutes = plannedMinutesForExam(activities, exam.id);
  const priority = PRIORITY_META[exam.priority];
  const days = describeDaysUntil(exam.date, now);
  const soon = exam.status !== "done" && new Date(exam.date) < new Date(now.toDateString());
  const done = exam.status === "done";

  return (
    <article
      className="card px-4 py-3.5"
      style={{ borderLeft: `4px solid ${priority.color}`, opacity: done ? 0.7 : 1 }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-base leading-none" title={`Prioriteit: ${priority.label}`}>
          &#128221;
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3
              className="text-[0.95rem] font-semibold"
              style={{ textDecoration: done ? "line-through" : "none" }}
            >
              {exam.title ?? `Toets ${exam.subject}`}
            </h3>
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              {exam.subject}
            </span>
          </div>

          <p className="mt-1.5 text-xs tabular-nums" style={{ color: soon ? "var(--danger)" : "var(--muted)" }}>
            &#128197; {formatDateLabel(exam.date, now)} &middot; {days}
            {exam.prepMinutes ? (
              <span> &middot; &#9201;&#65039; {formatDuration(exam.prepMinutes)} leren</span>
            ) : null}
          </p>

          {exam.topics && exam.topics.length > 0 ? (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {exam.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full px-2 py-0.5 text-[0.65rem]"
                  style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
                >
                  {topic}
                </span>
              ))}
            </p>
          ) : null}

          <PlannedBar plannedMinutes={plannedMinutes} estimateMinutes={exam.prepMinutes} />

          <div className="mt-3">
            <StatusControl value={exam.status} onChange={(status) => setExamStatus(exam.id, status)} />
          </div>
        </div>
      </div>
    </article>
  );
}
