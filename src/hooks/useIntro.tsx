"use client";

import { createContext, useContext } from "react";

/**
 * Kleine brug tussen Instellingen en de kennismaking. De wizard hangt in het
 * app-frame, de knop die hem opnieuw opent staat op de instellingenpagina —
 * die twee zitten niet in elkaar, dus loopt het via de context.
 */
interface IntroValue {
  /** De instelwizard (thuislocatie, vervoermiddel, marge). */
  open: () => void;
  /** De rondleiding langs de tabbladen, zonder eerst de instelvragen. */
  openTour: () => void;
}

export const IntroContext = createContext<IntroValue | null>(null);

export function useIntro(): IntroValue | null {
  return useContext(IntroContext);
}
