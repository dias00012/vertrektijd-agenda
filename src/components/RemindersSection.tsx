"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";

const CHOICES = [5, 10, 15, 30];

/**
 * Instellen wanneer je een seintje wilt vóór je vertrektijd. Bewust eerlijk over
 * wat er wel en niet kan: een melding terwijl de app helemaal dicht is vraagt om
 * een pushserver, en die is er nog niet.
 */
export function RemindersSection() {
  const { settings, updateSettings, hydrated } = useAgenda();
  const t = useT();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, []);

  if (!hydrated) return null;

  const minutes = settings.reminderMinutes ?? null;
  const enabled = minutes !== null && permission === "granted";

  async function enable(value: number) {
    if (typeof Notification === "undefined") return;
    setBusy(true);
    try {
      const result =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") updateSettings({ reminderMinutes: value });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128276; {t("reminders.title")}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("reminders.body")}
      </p>

      {permission === "unsupported" ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {t("reminders.unsupported")}
        </p>
      ) : permission === "denied" ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {t("reminders.denied")}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {CHOICES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={enabled && minutes === value}
                disabled={busy}
                onClick={() => void enable(value)}
                className="rounded-xl border px-2 py-2.5 text-center text-sm font-medium transition-colors"
                style={{
                  borderColor: enabled && minutes === value ? "var(--accent)" : "var(--line)",
                  background:
                    enabled && minutes === value ? "var(--surface-soft)" : "transparent",
                }}
              >
                {t("reminders.minutes", { count: value })}
              </button>
            ))}
          </div>

          {enabled ? (
            <button
              type="button"
              className="btn btn-ghost mt-3"
              onClick={() => updateSettings({ reminderMinutes: null })}
            >
              {t("reminders.off")}
            </button>
          ) : null}
        </>
      )}

      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        <strong>{t("reminders.noteLabel")}</strong> {t("reminders.note")}
      </p>
    </section>
  );
}
