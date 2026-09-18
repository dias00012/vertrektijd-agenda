"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import { SchoolworkForm } from "@/components/SchoolworkForm";
import { StudyPlanDialog } from "@/components/StudyPlanDialog";
import {
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
  describeDaysUntil,
  isOverdue,
  plannedMinutesForExam,
  plannedMinutesForTask,
  plannedProgress,
  sortExams,
  sortTasks,
  taskProgress,
} from "@/lib/schoolwork";
import { formatDateLabel, formatDuration } from "@/lib/time";
import { EmptyState, Spinner } from "@/components/ui";
import type { Exam, SchoolworkPriority, SchoolworkStatus, Task } from "@/lib/types";

/** Schoolwerk: opdrachten op deadline en toetsen op datum, met status en stappen. */
/** Waar de filterkeuze op dit apparaat bewaard blijft. */
const FILTER_KEY = "agenda.schoolwerkFilter.v1";
const PRIO_KEY = "agenda.schoolwerkPrio.v1";

/**
 * De knoppen van het statusfilter. "late" is geen status maar een eigenschap
 * van de deadline -- hij staat hier toch tussen omdat je er zo naar kijkt:
 * "wat moet ik nog doen" en "wat had ik al af moeten hebben" zijn dezelfde
 * vraag op verschillende momenten.
 */
const KEUZES = ["all", "late", "todo", "doing", "done"] as const;
type Keuze = (typeof KEUZES)[number];

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

  /**
   * Waar je nu naar wilt kijken.
   *
   * Met drieentwintig opdrachten staat alles door elkaar: wat af is, waar je
   * mee bezig bent en wat nog moet. Sorteren zet klaar werk wel onderaan, maar
   * je scrolt er nog steeds langs. De keuze blijft bewaard op dit apparaat --
   * wie op "bezig" staat wil dat morgen meestal nog steeds.
   */
  const [filter, setFilter] = useState<Keuze>("all");
  const [prio, setPrio] = useState<SchoolworkPriority | "all">("all");
  useEffect(() => {
    try {
      const bewaard = window.localStorage.getItem(FILTER_KEY);
      if (bewaard && (KEUZES as readonly string[]).includes(bewaard)) {
        setFilter(bewaard as Keuze);
      }
      const bewaardePrio = window.localStorage.getItem(PRIO_KEY);
      if (bewaardePrio && (bewaardePrio === "all" || bewaardePrio in PRIORITY_META)) {
        setPrio(bewaardePrio as SchoolworkPriority | "all");
      }
    } catch {
      // Privémodus of opslag uit: dan begin je elke keer bij "alles".
    }
  }, []);
  const onthoud = (sleutel: string, waarde: string) => {
    try {
      window.localStorage.setItem(sleutel, waarde);
    } catch {
      // Niet kunnen onthouden is geen reden om de keuze niet te maken.
    }
  };
  const kies = (keuze: Keuze) => {
    setFilter(keuze);
    onthoud(FILTER_KEY, keuze);
  };
  const kiesPrio = (keuze: SchoolworkPriority | "all") => {
    setPrio(keuze);
    onthoud(PRIO_KEY, keuze);
  };

  const sortedTasks = sortTasks(tasks);
  const sortedExams = sortExams(exams);
  /** Voldoet dit aan allebei de filters? */
  const past = (item: {
    status: SchoolworkStatus;
    priority: SchoolworkPriority;
    deadline?: string;
    date?: string;
  }) => {
    const opStatus =
      filter === "all"
        ? true
        : filter === "late"
          ? isOverdue(item.status, item.deadline ?? item.date ?? "", now)
          : item.status === filter;
    return opStatus && (prio === "all" || item.priority === prio);
  };
  /** Staat er een filter aan? Dan hoort de kop te zeggen hoeveel je niet ziet. */
  const gefilterd = filter !== "all" || prio !== "all";
  const zichtbareTasks = sortedTasks.filter(past);
  const zichtbareExams = sortedExams.filter(past);

  /**
   * Wat een knop zou opleveren als je hem indrukt, het andere filter
   * meegerekend. Een telling die het andere filter negeert belooft meer dan er
   * komt: "Klaar (1)" terwijl je op "hoog" staat en er geen afgeronde hoge
   * opdracht is.
   */
  const alles = [
    ...tasks.map((x) => ({ status: x.status, priority: x.priority, dag: x.deadline })),
    ...exams.map((x) => ({ status: x.status, priority: x.priority, dag: x.date })),
  ];
  const aantal = (keuze: Exclude<Keuze, "all">) =>
    alles.filter(
      (x) =>
        (keuze === "late" ? isOverdue(x.status, x.dag, now) : x.status === keuze) &&
        (prio === "all" || x.priority === prio),
    ).length;
  const aantalPrio = (p: SchoolworkPriority) =>
    alles.filter(
      (x) =>
        x.priority === p &&
        (filter === "all" ||
          (filter === "late" ? isOverdue(x.status, x.dag, now) : x.status === filter)),
    ).length;

  /**
   * Hoeveel er over tijd is, ongeacht welk filter er aanstaat.
   *
   * Dit is de vraag die je niet stelt maar wel moet weten. Een deadline die
   * voorbij is kleurde de datum rood, maar de opdracht stond gewoon tussen de
   * rest en met dertien opdrachten scrol je eroverheen.
   */
  const teLaat = alles.filter((x) => isOverdue(x.status, x.dag, now)).length;

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
          {teLaat > 0 && filter !== "late" ? (
            <button
              type="button"
              onClick={() => kies("late")}
              className="-mb-3 flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm"
              style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
            >
              <span aria-hidden>&#9888;&#65039;</span>
              <span className="font-semibold">
                {teLaat === 1
                  ? t("schoolwork.lateOne")
                  : t("schoolwork.lateMany", { count: teLaat })}
              </span>
              <span className="ml-auto" aria-hidden>
                &rarr;
              </span>
            </button>
          ) : null}

          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("schoolwork.filterLabel")}
          >
            {KEUZES.map((keuze) => {
              const actief = filter === keuze;
              const telling = keuze === "all" ? tasks.length + exams.length : aantal(keuze);
              // "Over tijd" alleen tonen als er iets over tijd is; een lege
              // knop die altijd (0) zegt is ruis.
              if (keuze === "late" && telling === 0 && !actief) return null;
              return (
                <button
                  key={keuze}
                  type="button"
                  aria-pressed={actief}
                  onClick={() => kies(keuze)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: actief ? "var(--accent)" : "var(--line)",
                    background: actief ? "var(--accent)" : "transparent",
                    color: actief ? "#fff" : "var(--muted)",
                  }}
                >
                  {keuze === "all"
                    ? t("schoolwork.filterAll")
                    : keuze === "late"
                      ? t("schoolwork.filterLate")
                      : STATUS_META[keuze].label}{" "}
                  ({telling})
                </button>
              );
            })}
          </div>

          <div
            className="-mt-5 flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("schoolwork.filterPriority")}
          >
            {(["all", "high", "medium", "low", "later"] as const).map((keuze) => {
              const actief = prio === keuze;
              const telling =
                keuze === "all"
                  ? alles.filter((x) => filter === "all" || x.status === filter).length
                  : aantalPrio(keuze);
              return (
                <button
                  key={keuze}
                  type="button"
                  aria-pressed={actief}
                  onClick={() => kiesPrio(keuze)}
                  className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                  style={{
                    borderColor: actief ? "var(--ink)" : "var(--line)",
                    color: actief ? "var(--ink)" : "var(--muted)",
                    fontWeight: actief ? 600 : 400,
                  }}
                >
                  {keuze === "all"
                    ? t("schoolwork.filterAll")
                    : `${PRIORITY_META[keuze].emoji} ${PRIORITY_META[keuze].label}`}{" "}
                  ({telling})
                </button>
              );
            })}
          </div>

          <section aria-label={t("schoolwork.tasks")}>
            <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
              {t("schoolwork.tasks")} (
            {gefilterd
              ? t("schoolwork.ofTotal", { shown: zichtbareTasks.length, total: sortedTasks.length })
              : sortedTasks.length}
            )
            </h2>
            {zichtbareTasks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("schoolwork.noTasks")}
              </p>
            ) : (
              <div className="space-y-2.5">
                {zichtbareTasks.map((task) => (
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
              {t("schoolwork.exams")} (
            {gefilterd
              ? t("schoolwork.ofTotal", { shown: zichtbareExams.length, total: sortedExams.length })
              : sortedExams.length}
            )
            </h2>
            {zichtbareExams.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("schoolwork.noExams")}
              </p>
            ) : (
              <div className="space-y-2.5">
                {zichtbareExams.map((exam) => (
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
        <StudyPlanDialog item={planning} onClose={() => setPlanning(null)} />
      ) : null}
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

  const barColor = enough ? "var(--ok)" : "var(--accent)";
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
  const overdue = isOverdue(task.status, task.deadline, now);
  const done = task.status === "done";

  return (
    <article
      className="card px-4 py-3.5"
      style={{ borderLeft: `4px solid ${priority.color}`, opacity: done ? 0.7 : 1 }}
    >
      <div className="flex items-start gap-3">
        {/*
          De prioriteit stond alleen in het bolletje, met de uitleg in een
          `title`. Op een telefoon zie je die nooit, en `aria-hidden` hield hem
          ook bij een schermlezer weg -- terwijl "hoog" of "later" juist bepaalt
          waar je aan begint.
        */}
        <span className="mt-0.5 text-base leading-none">
          <span aria-hidden>{priority.emoji}</span>
          <span className="sr-only">
            {t("schoolwork.priorityLabel", { label: priority.label })}
          </span>
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
        {/*
          De prioriteit stond alleen in het bolletje, met de uitleg in een
          `title`. Op een telefoon zie je die nooit, en `aria-hidden` hield hem
          ook bij een schermlezer weg -- terwijl "hoog" of "later" juist bepaalt
          waar je aan begint.
        */}
        <span className="mt-0.5 text-base leading-none">
          <span aria-hidden>&#128221;</span>
          <span className="sr-only">
            {t("schoolwork.priorityLabel", { label: priority.label })}
          </span>
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
