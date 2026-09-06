"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { PRIORITY_META, STATUS_META, STATUS_ORDER } from "@/lib/schoolwork";
import { todayKey } from "@/lib/time";
import type { Exam, SchoolworkPriority, SchoolworkStatus, Task, TaskStep } from "@/lib/types";

type Kind = "task" | "exam";

interface Props {
  /** Meegeven om te bewerken; weglaten om nieuw te maken. */
  task?: Task;
  exam?: Exam;
  onClose: () => void;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const PRIORITIES: SchoolworkPriority[] = ["high", "medium", "low", "later"];

/** Opdracht of toets toevoegen en bewerken. */
export function SchoolworkForm({ task, exam, onClose }: Props) {
  const { addTask, updateTask, removeTask, addExam, updateExam, removeExam } = useAgenda();
  const t = useT();

  const isEdit = Boolean(task || exam);
  const [kind, setKind] = useState<Kind>(exam ? "exam" : "task");

  const [subject, setSubject] = useState(task?.subject ?? exam?.subject ?? "");
  const [title, setTitle] = useState(task?.title ?? exam?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [date, setDate] = useState(task?.deadline ?? exam?.date ?? todayKey());
  const [minutes, setMinutes] = useState(
    String(task?.estimatedMinutes ?? exam?.prepMinutes ?? 60),
  );
  const [priority, setPriority] = useState<SchoolworkPriority>(
    task?.priority ?? exam?.priority ?? "medium",
  );
  const [status, setStatus] = useState<SchoolworkStatus>(task?.status ?? exam?.status ?? "todo");
  const [topics, setTopics] = useState((exam?.topics ?? []).join(", "));
  const [steps, setSteps] = useState<TaskStep[]>(task?.steps ?? []);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const errors = useMemo(() => {
    const next: { subject?: string; title?: string; date?: string } = {};
    if (!subject.trim()) next.subject = t("swForm.needSubject");
    if (kind === "task" && !title.trim()) next.title = t("swForm.needTitle");
    if (!date) next.date = kind === "task" ? t("swForm.needDeadline") : t("swForm.needDate");
    return next;
  }, [subject, title, date, kind, t]);

  const shown = submitted ? errors : {};

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    const now = new Date().toISOString();
    const parsedMinutes = Math.max(0, Number(minutes) || 0);

    if (kind === "task") {
      const payload: Task = {
        id: task?.id ?? createId(),
        subject: subject.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: date,
        estimatedMinutes: parsedMinutes,
        priority,
        status,
        steps: steps.length > 0 ? steps : undefined,
        createdAt: task?.createdAt ?? now,
        updatedAt: now,
      };
      if (task) updateTask(task.id, payload);
      else addTask(payload);
    } else {
      const payload: Exam = {
        id: exam?.id ?? createId(),
        subject: subject.trim(),
        title: title.trim() || undefined,
        date,
        topics: topics
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        prepMinutes: parsedMinutes || undefined,
        priority,
        status,
        createdAt: exam?.createdAt ?? now,
        updatedAt: now,
      };
      if (exam) updateExam(exam.id, payload);
      else addExam(payload);
    }
    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (task) removeTask(task.id);
    if (exam) removeExam(exam.id);
    onClose();
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(9, 12, 18, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? t("swForm.editTitle") : t("swForm.addTitle")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border sm:rounded-3xl"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="text-base font-semibold">
            {isEdit ? t("swForm.editTitle") : t("swForm.addTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-lg px-2 py-1 text-lg leading-none"
            style={{ color: "var(--muted)" }}
          >
            &#10005;
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {!isEdit ? (
            <div
              className="flex rounded-xl border p-0.5"
              style={{ borderColor: "var(--line)" }}
              role="group"
              aria-label={t("swForm.kind")}
            >
              {(
                [
                  { id: "task", key: "swForm.task" },
                  { id: "exam", key: "swForm.exam" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={kind === option.id}
                  onClick={() => setKind(option.id)}
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: kind === option.id ? "var(--surface-soft)" : "transparent",
                    color: kind === option.id ? "var(--ink)" : "var(--muted)",
                  }}
                >
                  {t(option.key)}
                </button>
              ))}
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="sw-subject">
              {t("swForm.subject")}
            </label>
            <input
              id="sw-subject"
              className="field"
              placeholder={t("swForm.subjectPlaceholder")}
              value={subject}
              aria-invalid={shown.subject ? "true" : undefined}
              onChange={(e) => setSubject(e.target.value)}
            />
            {shown.subject ? (
              <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {shown.subject}
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="sw-title">
              {kind === "task" ? t("swForm.taskTitle") : t("swForm.examTitle")}
              {kind === "exam" ? <span style={{ fontWeight: 400 }}> · optioneel</span> : null}
            </label>
            <input
              id="sw-title"
              className="field"
              placeholder={kind === "task" ? t("swForm.taskPlaceholder") : t("swForm.examPlaceholder")}
              value={title}
              aria-invalid={shown.title ? "true" : undefined}
              onChange={(e) => setTitle(e.target.value)}
            />
            {shown.title ? (
              <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {shown.title}
              </p>
            ) : null}
          </div>

          {kind === "task" ? (
            <div>
              <label className="label" htmlFor="sw-desc">
                {t("swForm.description")}{" "}
                <span style={{ fontWeight: 400 }}>· {t("common.optional")}</span>
              </label>
              <textarea
                id="sw-desc"
                className="field"
                rows={2}
                placeholder={t("swForm.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="sw-topics">
                {t("swForm.topics")}{" "}
                <span style={{ fontWeight: 400 }}>· {t("swForm.topicsHint")}</span>
              </label>
              <input
                id="sw-topics"
                className="field"
                placeholder={t("swForm.topicsPlaceholder")}
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sw-date">
                {kind === "task" ? t("swForm.deadline") : t("swForm.date")}
              </label>
              <input
                id="sw-date"
                type="date"
                className="field"
                value={date}
                aria-invalid={shown.date ? "true" : undefined}
                onChange={(e) => setDate(e.target.value)}
              />
              {shown.date ? (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {shown.date}
                </p>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="sw-minutes">
                {kind === "task" ? t("swForm.estimate") : t("swForm.studyTime")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="sw-minutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={5}
                  className="field"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  min
                </span>
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="label">{t("swForm.priority")}</legend>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map((id) => {
                const meta = PRIORITY_META[id];
                const active = priority === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPriority(id)}
                    className="flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs font-medium transition-colors"
                    style={{
                      borderColor: active ? meta.color : "var(--line)",
                      background: active
                        ? `color-mix(in srgb, ${meta.color} 14%, transparent)`
                        : "transparent",
                      color: active ? meta.color : "var(--muted)",
                    }}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {meta.emoji}
                    </span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">{t("schoolwork.status")}</legend>
            <div className="flex rounded-xl border p-0.5" style={{ borderColor: "var(--line)" }}>
              {STATUS_ORDER.map((id) => {
                const meta = STATUS_META[id];
                const active = status === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStatus(id)}
                    className="flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
                    style={{
                      background: active
                        ? `color-mix(in srgb, ${meta.color} 18%, transparent)`
                        : "transparent",
                      color: active ? meta.color : "var(--muted)",
                    }}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {kind === "task" ? (
            <fieldset>
              <legend className="label">{t("swForm.steps")}</legend>
              <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
                {t("swForm.stepsHint")}
              </p>
              <ul className="space-y-2">
                {steps.map((step, index) => (
                  <li key={step.id} className="flex items-center gap-2">
                    <input
                      className="field flex-1"
                      placeholder={t("swForm.step", { number: index + 1 })}
                      value={step.title}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((s) =>
                            s.id === step.id ? { ...s, title: e.target.value } : s,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={5}
                      className="field w-20"
                      placeholder={t("swForm.minutes")}
                      value={step.estimatedMinutes ?? ""}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((s) =>
                            s.id === step.id
                              ? {
                                  ...s,
                                  estimatedMinutes: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                }
                              : s,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={t("swForm.removeStep", { number: index + 1 })}
                      onClick={() =>
                        setSteps((current) => current.filter((s) => s.id !== step.id))
                      }
                      className="shrink-0 rounded-lg px-2 py-1 text-sm"
                      style={{ color: "var(--danger)" }}
                    >
                      &#10005;
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-ghost mt-2 w-full text-xs"
                onClick={() =>
                  setSteps((current) => [
                    ...current,
                    { id: createId(), title: "", done: false },
                  ])
                }
              >
                {t("swForm.addStep")}
              </button>
            </fieldset>
          ) : null}
        </div>

        <footer
          className="flex items-center gap-2 border-t px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          {isEdit ? (
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              {confirmDelete ? t("swForm.confirmDelete") : t("common.delete")}
            </button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? t("common.save") : t("common.add")}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
