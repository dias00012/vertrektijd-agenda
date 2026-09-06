"use client";

import { useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { getLanguage } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/dictionary";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import { SchoolworkForm } from "@/components/SchoolworkForm";
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
import { ActivityForm } from "@/components/ActivityForm";
import { addDaysToKey, formatDateLabel, formatDuration, minutesToTime, todayKey } from "@/lib/time";
import { EmptyState, Spinner } from "@/components/ui";
import type { ActivityDraft, Exam, SchoolworkStatus, Task } from "@/lib/types";

/** Schoolwerk: opdrachten op deadline en toetsen op datum, met status en stappen. */
export default function SchoolworkPage() {
  const { tasks, exams, hydrated } = useAgenda();
  const t = useT();
  const now = useNow(60_000);

  const [adding, setAdding] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editExam, setEditExam] = useState<Exam | null>(null);
  const formOpen = adding || editTask !== null || editExam !== null;
  /** Leertijd inplannen: opent het activiteitenformulier al ingevuld. */
  const [planning, setPlanning] = useState<Task | Exam | null>(null);

  function closeForm() {
    setAdding(false);
    setEditTask(null);
    setEditExam(null);
  }

  const sortedTasks = sortTasks(tasks);
  const sortedExams = sortExams(exams);

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("schoolwork.title")}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {t("schoolwork.subtitle")}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary shrink-0 px-3 py-2 text-sm"
          onClick={() => setAdding(true)}
        >
          {t("schoolwork.addShort")}
        </button>
      </header>

      {!hydrated ? (
        <div className="card px-5 py-10 text-center">
          <Spinner size={18} label={t("schoolwork.loading")} />
        </div>
      ) : tasks.length === 0 && exams.length === 0 ? (
        <EmptyState
          icon="📚"
          title={t("schoolwork.empty.title")}
          description={t("schoolwork.empty.body")}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              {t("schoolwork.empty.action")}
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          <section aria-label={t("schoolwork.tasks")}>
            <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
              {t("schoolwork.tasks")} ({sortedTasks.length})
            </h2>
            {sortedTasks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("schoolwork.noTasks")}
              </p>
            ) : (
              <div className="space-y-2.5">
                {sortedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    now={now}
                    onEdit={() => setEditTask(task)}
                    onPlan={() => setPlanning(task)}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-label={t("schoolwork.exams")}>
            <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
              {t("schoolwork.exams")} ({sortedExams.length})
            </h2>
            {sortedExams.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("schoolwork.noExams")}
              </p>
            ) : (
              <div className="space-y-2.5">
                {sortedExams.map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    now={now}
                    onEdit={() => setEditExam(exam)}
                    onPlan={() => setPlanning(exam)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {formOpen ? (
        <SchoolworkForm
          task={editTask ?? undefined}
          exam={editExam ?? undefined}
          onClose={closeForm}
        />
      ) : null}

      {planning ? (
        <ActivityForm
          preset={studyPreset(planning)}
          onClose={() => setPlanning(null)}
        />
      ) : null}
    </div>
  );
}

/** Is dit een toets? Alleen toetsen hebben een `date`. */
function isExam(item: Task | Exam): item is Exam {
  return "date" in item;
}

/**
 * Het leerblok dat we voorstellen bij een opdracht of toets: op de dag ervoor,
 * 's middags, met de geschatte tijd als lengte. Alles blijft aanpasbaar; dit is
 * een startpunt, geen beslissing.
 */
function studyPreset(item: Task | Exam): Partial<ActivityDraft> {
  const exam = isExam(item);
  const deadline = exam ? item.date : item.deadline;
  const minutes = (exam ? item.prepMinutes : item.estimatedMinutes) ?? 60;

  // Kort voor de deadline, maar niet in het verleden.
  const dayBefore = addDaysToKey(deadline, -1);
  const date = dayBefore < todayKey() ? todayKey() : dayBefore;

  const start = 15 * 60;
  return {
    category: "school",
    title: exam
      ? translate(getLanguage(), "schoolwork.studyForExam", { subject: item.subject })
      : translate(getLanguage(), "schoolwork.workOn", { title: item.title }),
    date,
    startTime: minutesToTime(start),
    endTime: minutesToTime(start + Math.min(minutes, 8 * 60)),
    // Leren doe je thuis; geen locatie betekent ook geen reistijd.
    location: null,
    source: "leerplan",
    linkedTaskId: exam ? null : item.id,
    linkedExamId: exam ? item.id : null,
  };
}

function StatusControl({
  value,
  onChange,
}: {
  value: SchoolworkStatus;
  onChange: (status: SchoolworkStatus) => void;
}) {
  const t = useT();
  return (
    <div
      className="flex rounded-lg border p-0.5"
      style={{ borderColor: "var(--line)" }}
      role="group"
      aria-label={t("schoolwork.status")}
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
  const t = useT();
  const { planned, estimate, pct, enough } = plannedProgress(plannedMinutes, estimateMinutes);
  if (estimate === 0 && planned === 0) return null;

  const barColor = enough ? "#22c55e" : "var(--accent)";
  return (
    <div className="mt-2">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        &#128203; {t("schoolwork.planned", { duration: formatDuration(planned) })}
        {estimate > 0
          ? ` ${t("schoolwork.plannedOf", { duration: formatDuration(estimate) })}`
          : ` ${t("schoolwork.noEstimate")}`}
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

function TaskCard({
  task,
  now,
  onEdit,
  onPlan,
}: {
  task: Task;
  now: Date;
  onEdit: () => void;
  onPlan: () => void;
}) {
  const { activities, setTaskStatus, toggleTaskStep } = useAgenda();
  const t = useT();
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
        <span aria-hidden className="mt-0.5 text-base leading-none" title={t("schoolwork.priorityLabel", { label: priority.label })}>
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
            <button
              type="button"
              onClick={onEdit}
              aria-label={t("schoolwork.editTask", { title: task.title })}
              className="ml-auto shrink-0 rounded-lg px-2 py-0.5 text-xs"
              style={{ color: "var(--muted)" }}
            >
              &#9998;
            </button>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusControl value={task.status} onChange={(status) => setTaskStatus(task.id, status)} />
            {!done ? (
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-xs"
                onClick={onPlan}
              >
                &#128197; {t("schoolwork.planStudy")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ExamCard({
  exam,
  now,
  onEdit,
  onPlan,
}: {
  exam: Exam;
  now: Date;
  onEdit: () => void;
  onPlan: () => void;
}) {
  const { activities, setExamStatus } = useAgenda();
  const t = useT();
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
        <span aria-hidden className="mt-0.5 text-base leading-none" title={t("schoolwork.priorityLabel", { label: priority.label })}>
          &#128221;
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3
              className="text-[0.95rem] font-semibold"
              style={{ textDecoration: done ? "line-through" : "none" }}
            >
              {exam.title ?? t("schoolwork.examTitle", { subject: exam.subject })}
            </h3>
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              {exam.subject}
            </span>
            <button
              type="button"
              onClick={onEdit}
              aria-label={t("schoolwork.editExam", { subject: exam.subject })}
              className="ml-auto shrink-0 rounded-lg px-2 py-0.5 text-xs"
              style={{ color: "var(--muted)" }}
            >
              &#9998;
            </button>
          </div>

          <p className="mt-1.5 text-xs tabular-nums" style={{ color: soon ? "var(--danger)" : "var(--muted)" }}>
            &#128197; {formatDateLabel(exam.date, now)} &middot; {days}
            {exam.prepMinutes ? (
              <span> &middot; &#9201;&#65039; {t("schoolwork.study", { duration: formatDuration(exam.prepMinutes) })}</span>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusControl value={exam.status} onChange={(status) => setExamStatus(exam.id, status)} />
            {!done ? (
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-xs"
                onClick={onPlan}
              >
                &#128197; {t("schoolwork.planStudy")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
