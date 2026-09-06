"use client";

import { useRef, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { getLanguage } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/dictionary";
import { useAgenda } from "@/hooks/useAgenda";
import { parseBackup, type ImportMode, type ImportSummary } from "@/lib/backup";

/**
 * Back-up & synchronisatie: exporteer de volledige agenda als één JSON-bestand
 * en importeer een bestand dat de planner heeft aangeleverd. Zo werken app en
 * planner met exact dezelfde data.
 */
export function BackupSection() {
  const { exportData, importData } = useAgenda();
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    const backup = exportData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vertrektijd-agenda.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset de input zodat hetzelfde bestand opnieuw gekozen kan worden.
    event.target.value = "";
    if (!file) return;

    setError(null);
    setSummary(null);

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError(t("backup.readFailed"));
      return;
    }

    const parsed = parseBackup(text);
    if (!parsed.ok || !parsed.data) {
      setError(parsed.error ?? t("backup.parseFailed"));
      return;
    }

    setSummary(importData(parsed.data, mode));
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128260; {t("backup.title")}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("backup.body")}
      </p>

      <div className="mt-4">
        <p className="label">{t("backup.mode")}</p>
        <div
          className="flex rounded-xl border p-0.5"
          style={{ borderColor: "var(--line)" }}
          role="group"
          aria-label={t("backup.mode")}
        >
          {(
            [
              { id: "merge", key: "backup.merge" },
              { id: "replace", key: "backup.replace" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={mode === option.id}
              onClick={() => setMode(option.id)}
              className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: mode === option.id ? "var(--surface-soft)" : "transparent",
                color: mode === option.id ? "var(--ink)" : "var(--muted)",
              }}
            >
              {t(option.key)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
          {mode === "merge"
            ? t("backup.mergeHint")
            : t("backup.replaceHint")}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={handleExport}>
          &#11015;&#65039; {t("backup.export")}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInput.current?.click()}
        >
          &#11014;&#65039; {t("backup.import")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={handleFile}
        />
      </div>

      {error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }} role="alert">
          &#9888;&#65039; {error}
        </p>
      ) : null}

      {summary ? (
        <div className="mt-3 rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--surface-soft)" }}>
          <p className="font-medium" style={{ color: "var(--accent)" }}>
            &#10003; {t(summary.mode === "replace" ? "backup.doneReplace" : "backup.doneMerge")}
          </p>
          <ul className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            <li>{describeCount(t("backup.activities"), summary.activities, summary.mode)}</li>
            <li>{describeCount(t("backup.tasks"), summary.tasks, summary.mode)}</li>
            <li>{describeCount(t("backup.exams"), summary.exams, summary.mode)}</li>
            {summary.settingsReplaced ? <li>{t("backup.settingsUpdated")}</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function describeCount(
  noun: string,
  count: { added: number; updated: number },
  mode: ImportMode,
): string {
  const language = getLanguage();
  if (mode === "replace") {
    return translate(language, "backup.loaded", { count: count.added, noun });
  }
  return translate(language, "backup.upserted", {
    added: count.added,
    updated: count.updated,
    noun,
  });
}
