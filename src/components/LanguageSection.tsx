"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { LANGUAGES } from "@/lib/i18n/locale";

/**
 * Taalkeuze. Bewust op dit apparaat en niet in je account: je telefoon en je
 * laptop kunnen prima in verschillende talen staan, en zo hoeft er niets te
 * synchroniseren voordat de app in de goede taal opent.
 */
export function LanguageSection() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#127760; {t("language.title")}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("language.body")}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {LANGUAGES.map((option) => {
          const active = language === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              lang={option.id}
              onClick={() => setLanguage(option.id)}
              className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                borderColor: active ? "var(--accent)" : "var(--line)",
                background: active
                  ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                  : "transparent",
                color: active ? "var(--accent)" : "var(--muted)",
              }}
            >
              <span aria-hidden className="text-base leading-none">
                {option.flag}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
