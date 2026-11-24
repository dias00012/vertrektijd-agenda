"use client";

import { useEffect } from "react";
import { badgeValue } from "@/lib/countdown";

/**
 * Het cijfertje op het app-icoon: hoeveel minuten je nog hebt.
 *
 * Het dichtste wat een webapp bij een widget komt. Een echte widget mag alleen
 * een geïnstalleerde app maken, maar dit getal staat wél op je beginscherm,
 * naast je andere iconen, zonder dat je de app opent.
 *
 * Werkt alleen als de app op je beginscherm staat, en lang niet op elke
 * telefoon. Daarom: proberen, en zwijgen als het niet kan — een melding
 * daarover zou een probleem maken van iets wat geen probleem is.
 */
export function useAppBadge(minutesUntilDeparture: number | null): void {
  const value = badgeValue(minutesUntilDeparture);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const badge = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!badge.setAppBadge || !badge.clearAppBadge) return;

    // De browser geeft een afgewezen belofte terug wanneer het niet mag
    // (geen toestemming, niet geïnstalleerd). Dat is hier geen fout.
    if (value === null) {
      badge.clearAppBadge().catch(() => {});
    } else {
      badge.setAppBadge(value).catch(() => {});
    }
  }, [value]);
}
