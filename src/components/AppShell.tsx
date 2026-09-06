"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { IntroContext } from "@/hooks/useIntro";
import { ActivityForm } from "./ActivityForm";
import { Onboarding } from "./Onboarding";
import { Tour } from "./Tour";
import { useAgenda } from "@/hooks/useAgenda";
import { useReminders } from "@/hooks/useReminders";
import { useTimetableSync } from "@/hooks/useTimetableSync";
import { useT } from "@/hooks/useLanguage";

const NAV = [
  { href: "/", key: "nav.today", icon: "☀️" },
  { href: "/agenda", key: "nav.agenda", icon: "\u{1F5D3}️" },
  { href: "/reizen", key: "nav.travel", icon: "\u{1F686}" },
  { href: "/schoolwerk", key: "nav.schoolwork", icon: "\u{1F4DA}" },
  { href: "/instellingen", key: "nav.settings", icon: "⚙️" },
] as const;

/**
 * Applicatieframe.
 *
 * Twee vormen, dezelfde app: op een telefoon een vaste onderbalk met de
 * duim binnen bereik, op een laptop een zijbalk links zodat het scherm niet
 * voor driekwart leeg staat. De grens ligt op 1024 px (Tailwind `lg`).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [formOpen, setFormOpen] = useState(false);
  /** De kennismaking opnieuw bekijken, aangezet vanuit Instellingen. */
  const [introOpen, setIntroOpen] = useState(false);
  /** De rondleiding langs de tabbladen. */
  const [tourOpen, setTourOpen] = useState(false);
  const { settings, hydrated } = useAgenda();
  const t = useT();

  // Meldingen "over 15 minuten vertrekken" plannen zolang de app open staat.
  useReminders();
  // Een gekoppeld rooster stil bijwerken, hoogstens een keer per dag.
  useTimetableSync();

  const introValue = useMemo(
    () => ({ open: () => setIntroOpen(true), openTour: () => setTourOpen(true) }),
    [],
  );

  const showHomeHint = hydrated && !settings.home && pathname !== "/instellingen";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
      {/* --- Zijbalk (laptop en groter) ---------------------------------- */}
      <aside
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-4 py-6 lg:flex"
        style={{ borderColor: "var(--line)" }}
      >
        <button
          type="button"
          className="btn btn-primary mb-4 w-full"
          onClick={() => setFormOpen(true)}
        >
          <span aria-hidden>+</span> {t("shell.add")}
        </button>

        <nav className="flex flex-col gap-0.5" aria-label={t("nav.main")}>
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-colors"
                style={{
                  background: active ? "var(--surface-soft)" : "transparent",
                  color: active ? "var(--ink)" : "var(--muted)",
                }}
              >
                <span aria-hidden className="text-base leading-none">
                  {item.icon}
                </span>
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <p className="mt-auto px-3 text-[0.7rem]" style={{ color: "var(--muted)" }}>
          {t("shell.tagline")}
        </p>
      </aside>

      {/* --- Inhoud ------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Op een laptop mag het breder: het weekraster heeft zeven kolommen. */}
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-40 pt-6 sm:px-6 lg:max-w-4xl lg:px-8 lg:pb-12 lg:pt-8">
          {showHomeHint ? (
            <Link
              href="/instellingen"
              className="card mb-4 flex items-center gap-3 px-4 py-3 text-sm no-underline"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, var(--line))" }}
            >
              <span aria-hidden className="text-lg">
                🏠
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{t("shell.setHome.title")}</span>
                <span style={{ color: "var(--muted)" }}>{t("shell.setHome.body")}</span>
              </span>
              <span aria-hidden style={{ color: "var(--muted)" }}>
                →
              </span>
            </Link>
          ) : null}

          <IntroContext.Provider value={introValue}>{children}</IntroContext.Provider>
        </main>
      </div>

      {/* --- Onderbalk (telefoon en tablet) ------------------------------- */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden">
        {/* Zonder deze vervaging schuift je agenda zichtbaar door het gat
            tussen de knop en de balk. Nu loopt hij netjes uit beeld. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-full"
          style={{ background: "linear-gradient(to top, var(--canvas) 62%, transparent)" }}
        />
        <div className="relative mx-auto w-full max-w-2xl px-4 sm:px-6">
          <div className="pointer-events-auto mb-3 flex justify-center">
            <button
              type="button"
              className="btn btn-primary w-full shadow-lg sm:w-auto"
              onClick={() => setFormOpen(true)}
            >
              <span aria-hidden>+</span> {t("shell.addActivity")}
            </button>
          </div>

          <nav
            className="pointer-events-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-5 gap-0.5 rounded-2xl border p-1.5"
            style={{
              background: "color-mix(in srgb, var(--surface) 92%, transparent)",
              borderColor: "var(--line)",
              boxShadow: "var(--shadow-card)",
              backdropFilter: "blur(12px)",
            }}
            aria-label={t("nav.main")}
          >
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[0.7rem] font-medium no-underline transition-colors"
                  style={{
                    background: active ? "var(--surface-soft)" : "transparent",
                    color: active ? "var(--ink)" : "var(--muted)",
                  }}
                >
                  <span aria-hidden className="text-base leading-none">
                    {item.icon}
                  </span>
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <Onboarding
        onStartTour={() => setTourOpen(true)}
        reopen={introOpen}
        onClose={() => setIntroOpen(false)}
      />
      {tourOpen ? (
        <Tour onClose={() => setTourOpen(false)} onAddActivity={() => setFormOpen(true)} />
      ) : null}
      {formOpen ? <ActivityForm onClose={() => setFormOpen(false)} /> : null}
    </div>
  );
}
