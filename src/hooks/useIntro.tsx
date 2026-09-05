"use client";

import { createContext, useContext } from "react";

/**
 * Kleine brug tussen Instellingen en de kennismaking. De wizard hangt in het
 * app-frame, de knop die hem opnieuw opent staat op de instellingenpagina —
 * die twee zitten niet in elkaar, dus loopt het via de context.
 */
export const IntroContext = createContext<{ open: () => void } | null>(null);

export function useIntro(): { open: () => void } | null {
  return useContext(IntroContext);
}
