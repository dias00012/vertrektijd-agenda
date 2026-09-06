"use client";

import Link from "next/link";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import { activitiesOnDate, findNextActivity } from "@/lib/agenda";
import { formatDateShort, todayKey } from "@/lib/time";
import { DayTimeline } from "@/components/DayTimeline";
import { NextUpCard } from "@/components/NextUpCard";
import { SchoolworkTodayCard } from "@/components/SchoolworkTodayCard";
import { ShareDay } from "@/components/ShareDay";
import { TimetableChanges } from "@/components/TimetableChanges";
import { EmptyState, Spinner } from "@/components/ui";
import { useT } from "@/hooks/useLanguage";

/** Dashboard: wat staat er vandaag te gebeuren en wanneer moet ik weg? */
export default function DashboardPage() {
  const { activities, settings, hydrated } = useAgenda();
  const now = useNow();
  const t = useT();

  const today = todayKey(now);
  const todayItems = activitiesOnDate(activities, today);
  const next = findNextActivity(activities, settings, now);

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("today.title")}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {formatDateShort(today)}
            {settings.home ? ` · ${t("today.from", { place: settings.home.label })}` : ""}
          </p>
        </div>
        {hydrated ? <ShareDay dateKey={today} now={now} /> : null}
      </header>

      {!hydrated ? (
        <div className="card px-5 py-10 text-center">
          <Spinner size={18} label={t("today.loading")} />
        </div>
      ) : (
        // Op een laptop stond alles onder elkaar in een smalle kolom met een
        // lege rechterhelft. Naast elkaar past je hele dag op het scherm.
        // Op een telefoon blijft het één kolom, in dezelfde volgorde als eerst:
        // eerst wanneer je weg moet, dan je schoolwerk, dan de dag zelf.
        <div className="xl:grid xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:items-start xl:gap-x-5">
          <div className="xl:col-span-2 xl:col-start-1 xl:row-start-1">
            <TimetableChanges now={now} />
          </div>

          <div className="xl:col-start-1 xl:row-start-2">
            {next ? <NextUpCard activity={next} now={now} /> : null}
          </div>

          <div className="xl:col-start-2 xl:row-start-2">
            <SchoolworkTodayCard now={now} />
          </div>

          <div className="xl:col-start-1 xl:row-start-3">
            {todayItems.length === 0 ? (
              <EmptyState
                icon="☕"
                title={t("today.empty.title")}
                description={t("today.empty.body")}
                action={
                  <Link href="/agenda" className="btn btn-ghost no-underline">
                    {t("today.empty.week")}
                  </Link>
                }
              />
            ) : (
              <section aria-label={t("today.overview")}>
                <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                  {t("today.overview")}
                </h2>
                <DayTimeline dateKey={today} now={now} />
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
