"use client";

import { useMemo, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { planStudy } from "@/lib/planning";
import { formatDateLabel, formatDuration } from "@/lib/time";
import type { Exam, Task } from "@/lib/types";

/**
 * Het voorstel voor leertijd, vóórdat er iets in je agenda komt.
 *
 * De oude knop zette één blok neer met de hele schatting erin: vijf uur op de
 * dag voor de deadline, om drie uur 's middags, ook als je dan in Lelystad aan
 * het werk was. Dat blok stond er dan wel, maar er gebeurde niets mee.
 *
 * Wat hier staat is uitgerekend met je eigen agenda erbij: de gaten waarin je
 * werkelijk thuis bent (reistijd eraf), opgeknipt in blokken die je volhoudt,
 * per stap als de opdracht stappen heeft. Je ziet het eerst, en pas als je op
 * de knop drukt staat het er. Past het niet, dan zegt hij dat ook -- dat is
 * informatie, geen storing.
 */
export function StudyPlanDialog({ item, onClose }: { item: Task | Exam; onClose: () => void }) {
  const { activities, settings, addActivity } = useAgenda();
  const t = useT();
  const [bezig, setBezig] = useState(false);

  const isExam = "date" in item;
  const fallback = isExam
    ? t("schoolwork.studyForExam", { subject: item.subject })
    : t("schoolwork.workOn", { title: item.title });

  /*
   * Eén keer uitrekenen en vasthouden. Zou dit bij elke weergave opnieuw
   * gebeuren, dan zou het voorstel onder je handen verschuiven zodra de klok
   * een minuut verder staat -- en dan druk je op een knop die iets anders doet
   * dan wat je las.
   */
  const plan = useMemo(
    () => planStudy(item, activities, settings, fallback),
    [item, activities, settings, fallback],
  );

  const perDag = useMemo(() => {
    const dagen = new Map<string, typeof plan.blocks>();
    for (const block of plan.blocks) {
      const lijst = dagen.get(block.date) ?? [];
      lijst.push(block);
      dagen.set(block.date, lijst);
    }
    return [...dagen.entries()];
  }, [plan]);

  const totaal = plan.blocks.reduce((sum, block) => sum + block.minutes, 0);

  function bevestig() {
    if (bezig) return;
    setBezig(true);
    for (const block of plan.blocks) {
      addActivity({
        category: "school",
        title: block.stepTitle,
        date: block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        // Leren doe je thuis; geen locatie betekent ook geen reistijd.
        location: null,
        color: null,
        travelMode: null,
        recurrence: null,
        source: "leerplan",
        linkedTaskId: isExam ? null : item.id,
        // Een lege stap-id betekent "de hele opdracht", niet "stap met naam".
        linkedStepId: block.stepId || null,
        linkedExamId: isExam ? item.id : null,
      });
    }
    onClose();
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(9, 12, 18, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={t("studyPlan.title")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border sm:rounded-3xl"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="text-base font-semibold">{t("studyPlan.title")}</h2>
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
          {plan.blocks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {plan.leftoverMinutes > 0
                ? t("studyPlan.noRoom", { until: formatDateLabel(plan.until) })
                : t("studyPlan.nothingLeft")}
            </p>
          ) : (
            <>
              <p className="text-sm">
                {t(plan.blocks.length === 1 ? "studyPlan.summaryOne" : "studyPlan.summary", {
                  duration: formatDuration(totaal),
                  count: plan.blocks.length,
                })}
              </p>

              {perDag.map(([date, blocks]) => (
                <div key={date}>
                  <p
                    className="text-[0.7rem] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--muted)" }}
                  >
                    {formatDateLabel(date)}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {blocks.map((block) => (
                      <li
                        key={`${block.date}-${block.startTime}-${block.stepId}`}
                        className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--line)" }}
                      >
                        <span className="tabular-nums">
                          {block.startTime}&ndash;{block.endTime}
                        </span>
                        <span className="flex-1 truncate">{block.stepTitle}</span>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {formatDuration(block.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {plan.leftoverMinutes > 0 ? (
                <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
                  &#9888;&#65039;{" "}
                  {t("studyPlan.leftover", {
                    duration: formatDuration(plan.leftoverMinutes),
                  })}
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer
          className="flex items-center justify-end gap-2 border-t px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <button type="button" className="btn btn-ghost px-4 py-2 text-sm" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary px-4 py-2 text-sm"
            onClick={bevestig}
            disabled={plan.blocks.length === 0 || bezig}
          >
            {t("studyPlan.confirm")}
          </button>
        </footer>
      </div>
    </div>
  );
}
