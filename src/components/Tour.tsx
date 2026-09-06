"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n/dictionary";

/**
 * Rondleiding door de app.
 *
 * Bewust géén modaal venster met plaatjes erin: de tour navigeert echt naar elk
 * tabblad en legt uit wat je op dat moment vóór je ziet. Het paneel blijft
 * daarom klein en onderaan hangen, zodat de pagina erachter zichtbaar blijft —
 * dat is het hele punt van rondleiden.
 */

interface Stop {
  href: string;
  emoji: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

const STOPS: Stop[] = [
  { href: "/", emoji: "☀️", titleKey: "nav.today", bodyKey: "tour.today.body" },
  { href: "/agenda", emoji: "🗓️", titleKey: "nav.agenda", bodyKey: "tour.agenda.body" },
  { href: "/reizen", emoji: "🚆", titleKey: "nav.travel", bodyKey: "tour.travel.body" },
  { href: "/schoolwerk", emoji: "📚", titleKey: "nav.schoolwork", bodyKey: "tour.schoolwork.body" },
  { href: "/instellingen", emoji: "⚙️", titleKey: "nav.settings", bodyKey: "tour.settings.body" },
];

export function Tour({
  onClose,
  onAddActivity,
}: {
  onClose: () => void;
  onAddActivity: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const [index, setIndex] = useState(0);
  const stop = STOPS[index];

  // De kern van een rondleiding: je gaat er echt heen.
  useEffect(() => {
    router.push(stop.href);
  }, [router, stop.href]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < STOPS.length - 1) setIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [index, onClose]);

  const last = index === STOPS.length - 1;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={t("tour.label", { title: t(stop.titleKey) })}
      /* Boven de onderbalk op mobiel, rechtsonder op een laptop. */
      className="animate-sheet-in fixed inset-x-3 bottom-[9.5rem] z-40 mx-auto max-w-md lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0"
    >
      <div
        className="card px-4 py-3.5"
        style={{
          borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))",
          boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="text-xl leading-none">
            {stop.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[0.65rem] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              {t("tour.progress", { step: index + 1, total: STOPS.length })}
            </p>
            <h2 className="text-base font-semibold">{t(stop.titleKey)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("tour.closeLabel")}
            className="shrink-0 text-sm leading-none"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          {t(stop.bodyKey)}
        </p>

        <div className="mt-3 flex gap-1" aria-hidden>
          {STOPS.map((_, position) => (
            <span
              key={position}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: position <= index ? "var(--accent)" : "var(--line)" }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {index > 0 ? (
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setIndex(index - 1)}
            >
              {t("common.previous")}
            </button>
          ) : (
            <button
              type="button"
              className="text-xs underline"
              style={{ color: "var(--muted)" }}
              onClick={onClose}
            >
              {t("common.skip")}
            </button>
          )}

          <div className="ml-auto">
            {last ? (
              <button
                type="button"
                className="btn btn-primary px-3 py-1.5 text-xs"
                onClick={() => {
                  onClose();
                  onAddActivity();
                }}
              >
                {t("tour.finish")}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary px-3 py-1.5 text-xs"
                onClick={() => setIndex(index + 1)}
              >
                {t("common.next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
