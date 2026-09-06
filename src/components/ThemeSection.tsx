"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import {
  THEMES,
  THEME_KEY,
  TINT_KEY,
  applyTheme,
  applyTint,
  storedTheme,
  storedTint,
} from "@/lib/theme";
import type { TranslationKey } from "@/lib/i18n/dictionary";

/**
 * De kleur van de app kiezen.
 *
 * Bewust per apparaat en niet in je account: het is een smaakinstelling, en zo
 * is hij meteen actief zonder te wachten op synchronisatie.
 */
export function ThemeSection() {
  const t = useT();
  const [theme, setTheme] = useState(THEMES[0].id);
  const [tint, setTint] = useState(true);

  // Pas na het aankoppelen: op de server is er geen opgeslagen keuze.
  useEffect(() => {
    setTheme(storedTheme());
    setTint(storedTint());
  }, []);

  function choose(id: string) {
    setTheme(id);
    applyTheme(id);
    try {
      window.localStorage.setItem(THEME_KEY, id);
    } catch {
      // Privémodus: de kleur geldt dan alleen voor deze sessie.
    }
  }

  function toggleTint(on: boolean) {
    setTint(on);
    applyTint(on);
    try {
      window.localStorage.setItem(TINT_KEY, on ? "on" : "off");
    } catch {
      // Privémodus: de keuze geldt dan alleen voor deze sessie.
    }
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#127912; {t("theme.title")}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("theme.body")}
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {THEMES.map((option) => {
          const active = theme === option.id;
          const name = t(option.nameKey as TranslationKey);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              aria-label={name}
              title={name}
              onClick={() => choose(option.id)}
              className="flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-[0.65rem] font-medium transition-colors"
              style={{
                borderColor: active ? option.light : "var(--line)",
                color: active ? "var(--ink)" : "var(--muted)",
              }}
            >
              <span
                aria-hidden
                className="h-6 w-6 rounded-full"
                style={{
                  background: option.light,
                  boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${option.light} 30%, transparent)` : "none",
                }}
              />
              <span className="w-full truncate">{name}</span>
            </button>
          );
        })}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          checked={tint}
          onChange={(event) => toggleTint(event.target.checked)}
        />
        <span className="text-xs leading-relaxed">
          <span className="block font-medium">{t("theme.tint")}</span>
          <span style={{ color: "var(--muted)" }}>{t("theme.tintHint")}</span>
        </span>
      </label>
    </section>
  );
}
