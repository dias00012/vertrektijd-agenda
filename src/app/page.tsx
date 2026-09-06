"use client";

import Link from "next/link";
import { useAgenda } from "@/hooks/useAgenda";
import { useNow } from "@/hooks/useNow";
import { activitiesOnDate, findNextActivity } from "@/lib/agenda";
import { formatDateShort, todayKey } from "@/lib/time";
import { DayTimeline } from "@/components/DayTimeline";
import { NextUpCard } from "@/components/NextUpCard";
import { SchoolworkTodayCard } from "@/components/SchoolworkTodayCard";
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
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("today.title")}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {formatDateShort(today)}
          {settings.home ? ` · ${t("today.from", { place: settings.home.label })}` : ""}
        </p>
      </header>

      {!hydrated ? (
        <div className="card px-5 py-10 text-center">
          <Spinner size={18} label={t("today.loading")} />
        </div>
      ) : (
        <>
          {next ? <NextUpCard activity={next} now={now} /> : null}

          <SchoolworkTodayCard now={now} />

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
        </>
      )}
    </div>
  );
}
