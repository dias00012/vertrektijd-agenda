"use client";

import { useT } from "@/hooks/useLanguage";
import { legTime } from "@/lib/travelModes";

/**
 * Rijdt deze rit, en zo ja op tijd?
 *
 * Bewust altijd zichtbaar, ook als er geen live informatie is. Stond er niets,
 * dan wist je niet of alles goed was of dat de gegevens simpelweg ontbraken,
 * en dat is precies het verschil waar je op een perron iets aan hebt.
 */
export function JourneyStatus({
  cancelled,
  delayMinutes,
  realTime,
  scheduledDeparture,
  long = false,
}: {
  cancelled: boolean;
  delayMinutes: number;
  realTime: boolean;
  /** Geplande vertrektijd, om bij vertraging te tonen waar hij vandaan komt. */
  scheduledDeparture?: string;
  /** Volledige zin in plaats van één woord; voor de agenda. */
  long?: boolean;
}) {
  const t = useT();

  const { color, label } = cancelled
    ? { color: "var(--danger)", label: t(long ? "status.cancelledLong" : "status.cancelled") }
    : delayMinutes > 0
      ? { color: "#f97316", label: t("status.delayed", { count: delayMinutes }) }
      : realTime
        ? { color: "#22c55e", label: `${t("status.onTime")} · ${t("status.live")}` }
        : { color: "var(--muted)", label: t("status.scheduled") };

  const planned = legTime(scheduledDeparture);

  return (
    <p
      className="mt-1 flex flex-wrap items-center gap-1.5 text-xs"
      style={{ color, fontWeight: cancelled || delayMinutes > 0 ? 600 : 400 }}
      title={realTime || cancelled ? undefined : t("status.noLive")}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
      {label}
      {/* Bij vertraging erbij: hoe laat hij eigenlijk zou gaan. */}
      {delayMinutes > 0 && planned && !cancelled ? (
        <span className="font-normal line-through" style={{ color: "var(--muted)" }}>
          {planned}
        </span>
      ) : null}
    </p>
  );
}
