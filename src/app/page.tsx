"use client";

import Link from "next/link";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import { activitiesOnDate, findNextActivity } from "@/lib/agenda";
import { formatDateShort, todayKey } from "@/lib/time";
import { DayTimeline } from "@/components/DayTimeline";
import { NextUpCard } from "@/components/NextUpCard";
import { EmptyState, Spinner } from "@/components/ui";

/** Dashboard: wat staat er vandaag te gebeuren en wanneer moet ik weg? */
export default function DashboardPage() {
  const { activities, settings, hydrated } = useAgenda();
  const now = useNow();

  const today = todayKey(now);
  const todayItems = activitiesOnDate(activities, today);
  const next = findNextActivity(activities, settings, now);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Vandaag</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {formatDateShort(today)}
          {settings.home ? ` · vanaf ${settings.home.label}` : ""}
        </p>
      </header>

      {!hydrated ? (
        <div className="card px-5 py-10 text-center">
          <Spinner size={18} label="Agenda laden…" />
        </div>
      ) : (
        <>
          {next ? <NextUpCard activity={next} now={now} /> : null}

          {todayItems.length === 0 ? (
            <EmptyState
              icon="☕"
              title="Nog niets gepland voor vandaag"
              description="Voeg een activiteit toe en de app rekent meteen uit hoe laat je moet vertrekken."
              action={
                <Link href="/agenda" className="btn btn-ghost no-underline">
                  Bekijk de hele week
                </Link>
              }
            />
          ) : (
            <section aria-label="Dagoverzicht">
              <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                Dagoverzicht
              </h2>
              <DayTimeline dateKey={today} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
