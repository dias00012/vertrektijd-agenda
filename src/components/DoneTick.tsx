"use client";

import { useAgenda } from "@/hooks/useAgenda";
import { useDoneToggle } from "@/hooks/useDoneToggle";
import { useT } from "@/hooks/useLanguage";
import { activityDone } from "@/lib/schoolwork";
import type { Activity } from "@/lib/types";

/**
 * Het rondje waarmee je een blok afstreept.
 *
 * Doorstrepen kon de app al, maar alleen van één kant: je vinkte een stap af op
 * de schoolwerkpagina, en dan streepte de agenda het bijbehorende blok door.
 * Dat is de verkeerde kant op. Je kijkt naar je dag, je bent klaar met dat
 * blok, en het enige wat je wilt is het aantikken -- niet eerst naar een andere
 * pagina om de bijbehorende stap op te zoeken. En de helft van wat er in een
 * agenda staat is helemaal geen schoolwerk: boodschappen, de was, een
 * telefoontje. Daar viel niets af te strepen, want er was geen opdracht om af
 * te vinken.
 *
 * Wát het vinkje dan afstreept staat in `doneTarget`: de stap, de hele
 * opdracht, de toets, of het blok zelf.
 *
 * Naast de kaart en niet erin: een knop in een knop is geen geldige HTML, en
 * gedraagt zich op een telefoon dan ook precies zo onvoorspelbaar als dat
 * klinkt.
 */
export function DoneTick({
  activity,
  dateKey,
  dimmed = false,
}: {
  activity: Activity;
  /** De dag die je bekijkt; bij een reeks niet de startdatum van de reeks. */
  dateKey: string;
  /** Meedempen met een blok dat al geweest is. */
  dimmed?: boolean;
}) {
  const { tasks, exams } = useAgenda();
  const markDone = useDoneToggle();
  const t = useT();
  const done = activityDone(activity, dateKey, tasks, exams);
  const label = t("activity.tick", { title: activity.title });

  return (
    <button
      type="button"
      onClick={() => markDone(activity, dateKey)}
      aria-pressed={done}
      aria-label={label}
      title={label}
      className="icon-btn shrink-0"
      style={{ opacity: dimmed ? 0.45 : 1 }}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-full text-[0.8rem] font-bold leading-none"
        style={{
          border: `2px solid ${done ? "var(--ok)" : "var(--line)"}`,
          background: done ? "var(--ok)" : "transparent",
          // Een leeg rondje zolang het nog niet af is: het vinkje staat er wel,
          // maar onzichtbaar, zodat het rondje niet verspringt als je het aantikt.
          color: done ? "var(--surface)" : "transparent",
        }}
      >
        &#10003;
      </span>
    </button>
  );
}
