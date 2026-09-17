"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { EmptyState, Spinner } from "@/components/ui";
import { formatDayMonth } from "@/lib/time";

/**
 * Beheerdersoverzicht: hoeveel mensen gebruiken de app, en doet alles het?
 *
 * Bewust niet in het menu. Dit scherm is voor wie de app draait, niet voor wie
 * hem gebruikt, en een menu-item dat bij bijna iedereen "niet gevonden" oplevert
 * is alleen maar verwarrend. Je komt er via /beheer.
 *
 * De afscherming zit in `/api/admin/overview` en niet hier: een scherm dat
 * zichzelf verbergt houdt niemand tegen die de route zelf aanroept.
 */

interface DayEvent {
  day: string;
  name: string;
  count: number;
}

interface ServiceCheck {
  name: string;
  state: "ok" | "traag" | "storing";
  ms: number;
  note?: string;
}

interface Overview {
  accounts: number | null;
  events: DayEvent[] | null;
  services: ServiceCheck[];
  checkedAt: string;
}

const STATE_META: Record<ServiceCheck["state"], { label: string; color: string; dot: string }> = {
  ok: { label: "werkt", color: "#16a34a", dot: "●" },
  traag: { label: "traag", color: "#f59e0b", dot: "●" },
  storing: { label: "storing", color: "#dc2626", dot: "●" },
};

/** Namen zoals ze in de database staan, met een uitleg die je kunt lezen. */
const EVENT_LABELS: Record<string, string> = {
  dag_geopend: "Mensen die de app openden",
  activiteit_toegevoegd: "Activiteiten toegevoegd",
  rooster_gekoppeld: "Roosters gekoppeld",
  agenda_gekoppeld: "Agenda's gekoppeld",
  meldingen_aan: "Meldingen aangezet",
  meldingen_achtergrond_aan: "Meldingen op de achtergrond aangezet",
  reis_gezocht: "Reizen gezocht",
  rondleiding_gestart: "Rondleidingen gestart",
  rooster_gewijzigd: "Roosterwijzigingen gevonden",
};

export default function BeheerPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        setError("Synchronisatie staat niet aan op deze server.");
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        setError("Log eerst in met het account dat hier toegang toe heeft.");
        return;
      }

      const response = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Dat lukte niet.");
        return;
      }
      setData((await response.json()) as Overview);
    } catch {
      setError("Geen verbinding.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * De laatste dertig dagen "mensen die de app openden". Dat getal klopt
   * doordat de app die gebeurtenis hooguit één keer per dag stuurt; de server
   * herkent niemand.
   */
  const opens = (data?.events ?? [])
    .filter((entry) => entry.name === "dag_geopend")
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  const busiest = opens.reduce((max, entry) => Math.max(max, entry.count), 0);
  const today = opens.at(-1);

  /** Alles wat er verder gebeurde, bij elkaar opgeteld over de periode. */
  const totals = new Map<string, number>();
  for (const entry of data?.events ?? []) {
    if (entry.name === "dag_geopend") continue;
    totals.set(entry.name, (totals.get(entry.name) ?? 0) + entry.count);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Beheer</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {data
              ? `Laatst gekeken om ${new Date(data.checkedAt).toLocaleTimeString("nl-NL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : " "}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost min-h-[2.75rem] px-3 text-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          &#8635; Verversen
        </button>
      </header>

      {loading && !data ? <Spinner /> : null}

      {error ? <EmptyState icon={"\u{1F512}"} title="Geen toegang" description={error} /> : null}

      {data ? (
        <div className="space-y-5">
          {/* Doet alles het? Dit is de vraag waarvoor je hier komt kijken. */}
          <section className="card px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold">Diensten</h2>
            <ul className="space-y-2">
              {data.services.map((service) => {
                const meta = STATE_META[service.state];
                return (
                  <li key={service.name} className="flex items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-2 text-sm">
                      <span aria-hidden style={{ color: meta.color }}>
                        {meta.dot}
                      </span>
                      {service.name}
                    </span>
                    <span className="text-right text-xs" style={{ color: "var(--muted)" }}>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                      {service.ms > 0 ? ` · ${service.ms} ms` : null}
                      {service.note ? (
                        <span className="block max-w-[14rem] truncate">{service.note}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold">Gebruik</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.accounts ?? "—"}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  accounts met een agenda
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{today?.count ?? 0}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  openden de app op {today ? formatDayMonth(today.day) : "vandaag"}
                </p>
              </div>
            </div>

            {data.events === null ? (
              <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
                De tabel <code>app_events</code> is er nog niet; zie SUPABASE-SETUP.md.
              </p>
            ) : opens.length === 0 ? (
              <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
                Nog niemand geteld in de afgelopen dertig dagen.
              </p>
            ) : (
              <div className="mt-4">
                <p className="label">Per dag</p>
                <ul className="space-y-1">
                  {opens.map((entry) => (
                    <li key={entry.day} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-10 shrink-0 tabular-nums"
                        style={{ color: "var(--muted)" }}
                      >
                        {formatDayMonth(entry.day)}
                      </span>
                      <span
                        className="h-2 rounded-full"
                        style={{
                          // Ten opzichte van de drukste dag: zo zie je de vorm
                          // van de week, niet een balk die altijd vol staat.
                          width: `${Math.max(2, (entry.count / busiest) * 100)}%`,
                          background: "var(--accent, #6366f1)",
                        }}
                      />
                      <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                        {entry.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {totals.size > 0 ? (
            <section className="card px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold">Wat mensen deden</h2>
              <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
                Bij elkaar opgeteld over de afgelopen dertig dagen.
              </p>
              <ul className="space-y-1.5">
                {[...totals.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <li key={name} className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{EVENT_LABELS[name] ?? name}</span>
                      <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                        {count}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Deze cijfers gaan over de app, nooit over een persoon. Er wordt geen bezoeker
            herkend: de app telt hooguit één keer per dag mee dat hij geopend is, en wie dat
            was weet de server niet.
          </p>
        </div>
      ) : null}
    </div>
  );
}
