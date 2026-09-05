"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Rondleiding door de app.
 *
 * Bewust géén modaal venster met plaatjes erin: de tour navigeert echt naar elk
 * tabblad en legt uit wat je op dat moment vóór je ziet. Het paneel blijft
 * daarom klein en onderaan hangen, zodat de pagina erachter zichtbaar blijft —
 * dat is het hele punt van rondleiden.
 */

interface Stop {
  href: string;
  emoji: string;
  title: string;
  body: string;
}

const STOPS: Stop[] = [
  {
    href: "/",
    emoji: "☀️",
    title: "Vandaag",
    body: "Je startscherm. Bovenaan staat je eerstvolgende activiteit met één groot getal: hoe laat je de deur uit moet. Bij OV zie je daaronder welke trein en bussen je pakt, en of ze op tijd rijden.",
  },
  {
    href: "/agenda",
    emoji: "🗓️",
    title: "Agenda",
    body: "Je planning per dag, week of maand. In het weekraster zie je de reistijd als gestreepte blokken vóór en ná elke activiteit — zo zie je in één oogopslag hoeveel van je dag onderweg opgaat.",
  },
  {
    href: "/reizen",
    emoji: "🚆",
    title: "Reizen",
    body: "Een losse reisplanner, zoals 9292. Kies van en naar — een station, een adres, je huidige locatie of één tik op Thuis, School of Gym. Je krijgt echte ritten met live vertragingen, spoor en overstappen.",
  },
  {
    href: "/schoolwerk",
    emoji: "📚",
    title: "Schoolwerk",
    body: "Je opdrachten op deadline en je toetsen op datum, met een kleur voor hoe dringend het is. Per opdracht kun je stappen afvinken, en je ziet hoeveel leertijd je er al voor hebt ingepland.",
  },
  {
    href: "/instellingen",
    emoji: "⚙️",
    title: "Instellingen",
    body: "Je thuislocatie en standaard vervoermiddel, herinneringen vóór vertrek, opgeslagen locaties, en een back-up van alles als één bestand. Ook je account, als je je agenda tussen telefoon en laptop wilt delen.",
  },
];

export function Tour({
  onClose,
  onAddActivity,
}: {
  onClose: () => void;
  onAddActivity: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const stop = STOPS[index];

  // De kern van een rondleiding: je gaat er echt heen.
  useEffect(() => {
    router.push(stop.href);
  }, [router, stop.href]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < STOPS.length - 1) setIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [index, onClose]);

  const last = index === STOPS.length - 1;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={`Rondleiding: ${stop.title}`}
      /* Boven de onderbalk op mobiel, rechtsonder op een laptop. */
      className="animate-sheet-in fixed inset-x-3 bottom-[9.5rem] z-40 mx-auto max-w-md lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0"
    >
      <div
        className="card px-4 py-3.5"
        style={{
          borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))",
          boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="text-xl leading-none">
            {stop.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[0.65rem] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Rondleiding &middot; {index + 1} van {STOPS.length}
            </p>
            <h2 className="text-base font-semibold">{stop.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Rondleiding sluiten"
            className="shrink-0 text-sm leading-none"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          {stop.body}
        </p>

        <div className="mt-3 flex gap-1" aria-hidden>
          {STOPS.map((_, position) => (
            <span
              key={position}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: position <= index ? "var(--accent)" : "var(--line)" }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {index > 0 ? (
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setIndex(index - 1)}
            >
              Vorige
            </button>
          ) : (
            <button
              type="button"
              className="text-xs underline"
              style={{ color: "var(--muted)" }}
              onClick={onClose}
            >
              Overslaan
            </button>
          )}

          <div className="ml-auto">
            {last ? (
              <button
                type="button"
                className="btn btn-primary px-3 py-1.5 text-xs"
                onClick={() => {
                  onClose();
                  onAddActivity();
                }}
              >
                Klaar &mdash; eerste activiteit
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary px-3 py-1.5 text-xs"
                onClick={() => setIndex(index + 1)}
              >
                Volgende
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
