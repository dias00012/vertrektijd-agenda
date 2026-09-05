"use client";

import { useRef, useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { parseBackup, type ImportMode, type ImportSummary } from "@/lib/backup";

/**
 * Back-up & synchronisatie: exporteer de volledige agenda als één JSON-bestand
 * en importeer een bestand dat de planner heeft aangeleverd. Zo werken app en
 * planner met exact dezelfde data.
 */
export function BackupSection() {
  const { exportData, importData } = useAgenda();
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
      setError("Kon het bestand niet lezen.");
      return;
    }

    const parsed = parseBackup(text);
    if (!parsed.ok || !parsed.data) {
      setError(parsed.error ?? "Het bestand kon niet worden ingelezen.");
      return;
    }

    setSummary(importData(parsed.data, mode));
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128260; Back-up &amp; synchronisatie</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Exporteer je hele agenda (instellingen, activiteiten, taken en toetsen) als
        één JSON-bestand, of importeer een bestand van je planner. Zo werken app en planner met
        precies dezelfde gegevens.
      </p>

      <div className="mt-4">
        <p className="label">Importmodus</p>
        <div
          className="flex rounded-xl border p-0.5"
          style={{ borderColor: "var(--line)" }}
          role="group"
          aria-label="Importmodus"
        >
          {(
            [
              { id: "merge", label: "Samenvoegen" },
              { id: "replace", label: "Vervangen" },
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
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
          {mode === "merge"
            ? "Samenvoegen werkt bestaande items met hetzelfde id bij en voegt nieuwe toe."
            : "Vervangen zet je hele agenda gelijk aan de inhoud van het bestand."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={handleExport}>
          &#11015;&#65039; Exporteren
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInput.current?.click()}
        >
          &#11014;&#65039; Importeren
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
            &#10003; Import gelukt ({summary.mode === "replace" ? "vervangen" : "samengevoegd"}).
          </p>
          <ul className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            <li>{describeCount("activiteiten", summary.activities, summary.mode)}</li>
            <li>{describeCount("taken", summary.tasks, summary.mode)}</li>
            <li>{describeCount("toetsen", summary.exams, summary.mode)}</li>
            {summary.settingsReplaced ? <li>Instellingen bijgewerkt.</li> : null}
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
  if (mode === "replace") return `${count.added} ${noun} geladen.`;
  return `${count.added} ${noun} toegevoegd, ${count.updated} bijgewerkt.`;
}
