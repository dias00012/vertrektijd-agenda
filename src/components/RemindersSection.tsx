"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { disablePush, enablePush, pushEnabled, pushSupported } from "@/lib/push";

const CHOICES = [5, 10, 15, 30];

/**
 * Instellen wanneer je een seintje wilt vóór je vertrektijd.
 *
 * Twee smaken. Zolang de app openstaat zet de app zelf een timer; dat werkt
 * altijd. Wil je het ook met de app dicht, dan meldt je toestel zich aan bij de
 * server. Ook dan blijft je agenda van jou: je telefoon rekent de tijden uit en
 * geeft alleen kant-en-klare zinnen door.
 */
export function RemindersSection() {
  const { settings, updateSettings, hydrated } = useAgenda();
  const t = useT();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [busy, setBusy] = useState(false);
  /** Staat dit toestel aangemeld voor meldingen met de app dicht? */
  const [background, setBackground] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  // Zonder publieke sleutel is er geen server om je bij aan te melden.
  const supportsBackground =
    pushSupported() && Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
    void pushEnabled().then(setBackground);
  }, []);

  if (!hydrated) return null;

  const minutes = settings.reminderMinutes ?? null;
  const enabled = minutes !== null && permission === "granted";

  /** Aan- of afmelden voor meldingen terwijl de app dicht is. */
  async function toggleBackground(wanted: boolean) {
    setBusy(true);
    setBackgroundError(null);
    try {
      if (!wanted) {
        await disablePush();
        setBackground(false);
        return;
      }
      const ok = await enablePush();
      setBackground(ok);
      if (!ok) setBackgroundError(t("reminders.backgroundFailed"));
    } catch {
      setBackgroundError(t("reminders.backgroundFailed"));
    } finally {
      setBusy(false);
    }
  }

  /** Herinneringen helemaal uit: dan ook de wachtrij op de server leeg. */
  async function turnOff() {
    updateSettings({ reminderMinutes: null });
    if (background) {
      await disablePush();
      setBackground(false);
    }
  }

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
            <>
              {/* Meldingen met de app dicht. Alleen aanbieden als de server er
                  klaar voor staat: een schakelaar die niets doet is erger dan
                  geen schakelaar. */}
              {supportsBackground ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                    checked={background}
                    disabled={busy}
                    onChange={(event) => void toggleBackground(event.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t("reminders.background")}</span>
                    <span className="block text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                      {t("reminders.backgroundHint")}
                    </span>
                  </span>
                </label>
              ) : null}

              {backgroundError ? (
                <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
                  {backgroundError}
                </p>
              ) : null}

              <button
                type="button"
                className="btn btn-ghost mt-3"
                onClick={() => {
                  void turnOff();
                }}
              >
                {t("reminders.off")}
              </button>
            </>
          ) : null}
        </>
      )}

      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        <strong>{t("reminders.noteLabel")}</strong>{" "}
        {background ? t("reminders.noteBackground") : t("reminders.note")}
      </p>
    </section>
  );
}
