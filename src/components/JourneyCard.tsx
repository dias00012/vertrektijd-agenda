"use client";

import { useState } from "react";
import { formatDateLabel, formatDuration } from "@/lib/time";
import { arrivesNextDay, departureDay } from "@/lib/journeyList";
import { LEG_EMOJI, describeLeg, legTime } from "@/lib/travelModes";
import { useT } from "@/hooks/useLanguage";
import { JourneyStatus } from "./JourneyStatus";
import type { Journey, TravelLeg } from "@/lib/types";

/**
 * Eén reismogelijkheid: vertrek, aankomst, duur en overstappen in één oogopslag,
 * met live vertraging in het rood. Uitklappen toont de hele rit.
 *
 * De lijst staat op vertrektijd, zoals op een vertrekbord. Dat betekent dat de
 * snelste rit niet bovenaan hoeft te staan, dus krijgt die een merkje. Bij
 * "uiterlijk aankomen om" geldt hetzelfde voor de laatste die het nog haalt --
 * dat is dan juist de rit die je zocht, en die staat onderaan.
 */
export function JourneyCard({
  journey,
  fastest = false,
  latestOnTime = false,
  now,
}: {
  journey: Journey;
  fastest?: boolean;
  /** De laatste rit die nog op tijd aankomt; alleen bij "uiterlijk aankomen om". */
  latestOnTime?: boolean;
  /** Van buiten, zodat het renderen niet zelf de klok afleest. */
  now: Date;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Een kaart met alleen een kloktijd liegt zodra de rit niet vandaag is.
  const andereDag = departureDay(journey, now);
  const volgendeDag = arrivesNextDay(journey);

  const delayed = journey.delayMinutes > 0;
  const accent = journey.cancelled
    ? "var(--danger)"
    : delayed
      ? "#f97316"
      : "var(--accent)";

  // De onderdelen waar je echt iets moet doen: instappen, overstappen, lopen.
  const transitLegs = journey.legs.filter((leg) => leg.line);

  return (
    <article className="card overflow-hidden" style={{ borderLeft: `4px solid ${accent}` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-4 py-3.5 text-left"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">
            {legTime(journey.departure)}
          </span>
          <span aria-hidden style={{ color: "var(--muted)" }}>
            →
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {legTime(journey.arrival)}
            {/* "23:40 -> 00:29" leest als een reis terug in de tijd. */}
            {volgendeDag ? (
              <sup
                className="ml-0.5 text-[0.6rem] font-medium"
                style={{ color: "var(--muted)" }}
                title={t("journey.nextDayHint")}
              >
                {t("journey.nextDay")}
              </sup>
            ) : null}
          </span>

          {fastest ? (
            <span
              className="rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
              style={{ background: "var(--surface-soft)", color: "var(--accent)" }}
            >
              {t("journey.fastest")}
            </span>
          ) : null}

          {latestOnTime ? (
            <span
              className="rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
              style={{ background: "var(--surface-soft)", color: "var(--accent)" }}
              title={t("journey.latestOnTimeHint")}
            >
              {t("journey.latestOnTime")}
            </span>
          ) : null}

          {/*
            Niet vandaag? Dan hoort de dag erbij te staan. Zoek je 's avonds om
            kwart over elf een rit terug, dan zijn vijf van de zes opties van
            morgen -- en met alleen "05:40" op de kaart zie je dat niet.
          */}
          {andereDag ? (
            <span
              className="rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
              style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
            >
              {formatDateLabel(andereDag, now)}
            </span>
          ) : null}

          <span className="ml-auto text-right text-xs" style={{ color: "var(--muted)" }}>
            {formatDuration(journey.durationMinutes)}
            <br />
            {journey.transfers === 0
              ? t("journey.direct")
              : `${journey.transfers} ${t(
                  journey.transfers === 1 ? "journey.transfer" : "journey.transfers",
                )}`}
          </span>
        </div>

        <JourneyStatus
          cancelled={journey.cancelled}
          delayMinutes={journey.delayMinutes}
          realTime={journey.realTime}
          scheduledDeparture={journey.legs.find((leg) => leg.scheduledDeparture)?.scheduledDeparture}
        />

        {/* Compacte route: welke vervoermiddelen je pakt */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {journey.legs.map((leg, index) => (
            <span key={index} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden className="text-[0.6rem]" style={{ color: "var(--muted)" }}>
                  ›
                </span>
              ) : null}
              <span
                className="rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium"
                style={{
                  background: leg.line ? "var(--surface-soft)" : "transparent",
                  color: leg.line ? "var(--ink)" : "var(--muted)",
                }}
              >
                {LEG_EMOJI[leg.mode]}
                {leg.line ? ` ${leg.line}` : ""}
              </span>
            </span>
          ))}
          <span className="ml-auto text-[0.7rem]" style={{ color: "var(--muted)" }}>
            {open ? t("journey.hide") : t("journey.show")}
          </span>
        </div>
      </button>

      {open ? (
        <ol className="space-y-3 border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
          {journey.legs.map((leg, index) => (
            <li key={index}>
              <LegRow leg={leg} />
            </li>
          ))}
        </ol>
      ) : null}

      {/* Voor schermlezers: de kern van de rit ook zonder uitklappen. */}
      <span className="sr-only">
        {transitLegs.map((leg) => `${leg.line ?? ""} van ${leg.from} naar ${leg.to}`).join(", ")}
      </span>
    </article>
  );
}

function LegRow({ leg }: { leg: TravelLeg }) {
  const t = useT();
  const delayed = (leg.delayMinutes ?? 0) > 0;

  return (
    <div className="flex gap-3 text-xs">
      <span className="w-11 shrink-0 tabular-nums">
        <span className={delayed ? "font-semibold" : ""} style={delayed ? { color: "#f97316" } : undefined}>
          {legTime(leg.departure)}
        </span>
        {delayed && leg.scheduledDeparture ? (
          <span className="block line-through" style={{ color: "var(--muted)" }}>
            {legTime(leg.scheduledDeparture)}
          </span>
        ) : null}
      </span>

      <span aria-hidden className="shrink-0">
        {LEG_EMOJI[leg.mode]}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-medium">{describeLeg(leg)}</span>
        {/* Bij een loopstuk binnen dezelfde halte zegt "X → X" niets; toon
            dan alleen hoe lang het duurt. */}
        {leg.from && leg.to && leg.from !== leg.to ? (
          <span className="block" style={{ color: "var(--muted)" }}>
            {leg.from}
            {leg.track ? ` · ${t("leg.track", { track: leg.track })}` : ""}
            {` → ${leg.to}`}
            {leg.arrival ? ` (${legTime(leg.arrival)})` : ""}
          </span>
        ) : (
          <span className="block" style={{ color: "var(--muted)" }}>
            {formatDuration(leg.durationMinutes)}
            {leg.track ? ` · ${t("leg.track", { track: leg.track })}` : ""}
          </span>
        )}
        {leg.cancelled ? (
          <span className="block font-semibold" style={{ color: "var(--danger)" }}>
            {t("journey.cancelledShort")}
          </span>
        ) : null}
      </span>
    </div>
  );
}
