"use client";

import { useRef } from "react";

/**
 * Vegen om een week of maand verder te gaan, zoals elke agenda op een telefoon.
 *
 * De lastigheid zit in het weekraster: dat schuift zelf al horizontaal om zeven
 * kolommen kwijt te kunnen. Een veeg daarbinnen hoort dus eerst het raster te
 * verschuiven, en pas als dat aan het einde is de week te wisselen. Precies wat
 * een carrousel in een carrousel hoort te doen.
 */

/** Zoveel pixels horizontaal voordat het een veeg is. */
const THRESHOLD_PX = 60;
/** Meer verticaal dan dit: je scrolt, je veegt niet. */
const VERTICAL_SLOP = 40;

/** Het eerste element boven `start` dat zelf horizontaal kan schuiven. */
function scrollableAncestor(start: EventTarget | null): HTMLElement | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function useSwipe(onPrevious: () => void, onNext: () => void) {
  const start = useRef<{
    x: number;
    y: number;
    /** Welke kant op bladeren het schuivende element zelf al opvangt. */
    blocked: "next" | "previous" | "both" | null;
  } | null>(null);

  return {
    onTouchStart(event: React.TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;

      // Zit de vinger op iets dat zelf schuift, dan mag de veeg alleen de kant
      // op waar dat element al aan het einde is.
      const scroller = scrollableAncestor(event.target);
      let blocked: "next" | "previous" | "both" | null = null;
      if (scroller) {
        const atStart = scroller.scrollLeft <= 1;
        const atEnd = scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 1;
        // Staat het raster helemaal links, dan kan het nog naar rechts schuiven
        // en vangt het de veeg naar voren zelf op. Andersom net zo.
        blocked = atStart && atEnd ? null : atStart ? "next" : atEnd ? "previous" : "both";
      }

      start.current = { x: touch.clientX, y: touch.clientY, blocked };
    },

    onTouchEnd(event: React.TouchEvent) {
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;

      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < THRESHOLD_PX || Math.abs(dy) > VERTICAL_SLOP) return;

      // Naar links vegen betekent vooruit, zoals bladeren in een boek.
      const forward = dx < 0;
      if (from.blocked === "both") return;
      if (forward && from.blocked === "next") return;
      if (!forward && from.blocked === "previous") return;

      if (forward) onNext();
      else onPrevious();
    },

    onTouchCancel() {
      start.current = null;
    },
  };
}
