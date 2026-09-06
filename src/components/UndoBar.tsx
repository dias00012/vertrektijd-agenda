"use client";

import { useEffect, useState } from "react";
import { useAgenda } from "@/hooks/useAgenda";
import { useT } from "@/hooks/useLanguage";

/** Zolang je hem nog terug kunt halen. Daarna verdwijnt het balkje vanzelf. */
const VISIBLE_MS = 8000;

/**
 * "Verwijderd, ongedaan maken." — of "verplaatst", zodat de knop belooft wat
 * hij doet.
 *
 * Verwijderen is het enige in deze app waarmee je echt iets kwijt kunt raken,
 * en juist dat gebeurt makkelijk met een duim op een telefoon. Een balkje van
 * een paar seconden scheelt de schrik, zonder dat er een extra vraag bij elke
 * verwijdering hoeft.
 */
export function UndoBar() {
  const { lastRemoved, undoRemove, forgetRemoved } = useAgenda();
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastRemoved) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      forgetRemoved();
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
    // Op `at` en niet op het hele object: twee keer hetzelfde verwijderen moet
    // de teller opnieuw starten, en een nieuw object met dezelfde titel niet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRemoved?.at, forgetRemoved]);

  if (!lastRemoved || !visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] lg:bottom-6"
      role="status"
      aria-live="polite"
    >
      <div
        className="animate-fade-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm shadow-lg"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <span className="min-w-0 flex-1 truncate">
          {t(lastRemoved.kind === "moved" ? "undo.moved" : "undo.removed", {
            title: lastRemoved.title,
          })}
        </span>
        <button
          type="button"
          className="shrink-0 font-semibold"
          style={{ color: "var(--accent)" }}
          onClick={undoRemove}
        >
          {t("undo.action")}
        </button>
      </div>
    </div>
  );
}
