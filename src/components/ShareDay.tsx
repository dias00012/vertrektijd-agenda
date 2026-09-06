"use client";

import { useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { useT } from "@/hooks/useLanguage";
import { activitiesOnDate } from "@/lib/agenda";
import { computeDeparture } from "@/lib/travel";
import { formatDateLabel } from "@/lib/time";

/**
 * Je dag delen, bijvoorbeeld via WhatsApp.
 *
 * Waarom dit nuttig is: "hoe laat ben je klaar?" is de meestgestelde vraag
 * tussen studenten onderling. De app weet het antwoord al, inclusief je
 * vertrektijd, dus die hoef je niet over te typen.
 *
 * Op een telefoon opent het deelmenu van het toestel zelf; op een laptop, waar
 * dat meestal ontbreekt, gaat de tekst naar je klembord.
 */
export function ShareDay({ dateKey, now }: { dateKey: string; now: Date }) {
  const { activities, settings } = useAgenda();
  const t = useT();
  const [notice, setNotice] = useState<string | null>(null);

  function buildText(): string {
    const items = activitiesOnDate(activities, dateKey).sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
    const heading = `${t("share.title")} · ${formatDateLabel(dateKey, now)}`;
    if (items.length === 0) return `${heading}\n${t("share.nothing")}`;

    const lines = items.map((item) => {
      const departure = computeDeparture(item, settings);
      return departure
        ? t("share.lineLeave", {
            start: item.startTime,
            end: item.endTime,
            title: item.title,
            leave: departure.time,
          })
        : t("share.line", { start: item.startTime, end: item.endTime, title: item.title });
    });
    return [heading, ...lines].join("\n");
  }

  async function share() {
    const text = buildText();
    setNotice(null);

    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNotice(t("share.copied"));
    } catch (error) {
      // Het deelmenu wegklikken is geen fout; daar hoeft niets over gemeld.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(t("share.failed"));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void share()}
        className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
        aria-label={t("share.today")}
      >
        &#128228; {t("share.button")}
      </button>
      {notice ? (
        <p className="mt-1 w-full text-xs" role="status" style={{ color: "var(--muted)" }}>
          {notice}
        </p>
      ) : null}
    </>
  );
}
