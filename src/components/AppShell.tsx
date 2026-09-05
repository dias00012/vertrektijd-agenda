"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ActivityForm } from "./ActivityForm";
import { useAgenda } from "@/hooks/useAgenda";

const NAV = [
  { href: "/", label: "Vandaag", icon: "\u2600\uFE0F" },
  { href: "/agenda", label: "Agenda", icon: "\u{1F5D3}\uFE0F" },
  { href: "/reizen", label: "Reizen", icon: "\u{1F686}" },
  { href: "/schoolwerk", label: "Schoolwerk", icon: "\u{1F4DA}" },
  { href: "/instellingen", label: "Instellingen", icon: "\u2699\uFE0F" },
];

/**
 * Applicatieframe: header, inhoud, vaste onderbalk en de globale
 * "+ Activiteit toevoegen"-knop.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [formOpen, setFormOpen] = useState(false);
  const { settings, hydrated } = useAgenda();

  const showHomeHint = hydrated && !settings.home && pathname !== "/instellingen";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <main className="flex-1 px-4 pb-40 pt-6 sm:px-6">
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
              <span className="block font-semibold">Stel je thuislocatie in</span>
              <span style={{ color: "var(--muted)" }}>
                Daarna berekent de app automatisch je vertrektijden.
              </span>
            </span>
            <span aria-hidden style={{ color: "var(--muted)" }}>
              →
            </span>
          </Link>
        ) : null}

        {children}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
          <div className="pointer-events-auto mb-3 flex justify-center">
            <button
              type="button"
              className="btn btn-primary w-full shadow-lg sm:w-auto"
              onClick={() => setFormOpen(true)}
            >
              <span aria-hidden>+</span> Activiteit toevoegen
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
            aria-label="Hoofdnavigatie"
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
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {formOpen ? <ActivityForm onClose={() => setFormOpen(false)} /> : null}
    </div>
  );
}
