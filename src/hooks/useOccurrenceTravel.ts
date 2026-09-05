"use client";

import { useEffect, useState } from "react";
import { fetchTravel } from "@/lib/api";
import { travelModeFor, travelPlanForDate } from "@/lib/travel";
import { toDateKey } from "@/lib/time";
import type { Activity, Settings, TravelInfo, TravelResult } from "@/lib/types";

/**
 * Reis van één dag uit een herhalende activiteit.
 *
 * De agenda bewaart per activiteit één reis: die van de eerstvolgende keer.
 * Voor een reeks ("elke werkdag naar school") klopt dat op maandag wel en op
 * donderdag niet, want dan rijdt er een andere trein. Deze hook haalt daarom
 * voor OV-activiteiten de rit van de dag zelf op.
 *
 * Auto en fiets hangen niet van een dienstregeling af; daar blijft de reis van
 * de activiteit gewoon staan en gebeurt er hier niets.
 */

interface OccurrenceTravel {
  travel: TravelInfo | null;
  returnTravel: TravelInfo | null;
  loading: boolean;
  /** true wanneer deze tijden echt van deze dag zijn (en niet van een andere). */
  exact: boolean;
}

/** Zo ver vooruit publiceren vervoerders hun dienstregeling betrouwbaar. */
const MAX_LOOKAHEAD_DAYS = 21;
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Hoe vaak we een rit van vandaag opnieuw ophalen voor actuele vertragingen. */
const REFRESH_MS = 2 * 60 * 1000;

interface CacheEntry {
  at: number;
  value: Promise<{ outbound: TravelResult; inbound: TravelResult }>;
}

/**
 * Reizen van deze sessie, per activiteit + dag. Voorkomt dat één weekoverzicht
 * dezelfde rit tien keer opvraagt bij de (gratis) OV-dienst.
 */
const cache = new Map<string, CacheEntry>();

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function useOccurrenceTravel(activity: Activity, settings: Settings): OccurrenceTravel {
  const stored = { travel: activity.travel ?? null, returnTravel: activity.returnTravel ?? null };

  const isTransit = travelModeFor(activity, settings) === "transit";
  const plan = isTransit ? travelPlanForDate(activity, settings, activity.date) : null;

  // Staat de rit van deze dag al in de activiteit zelf, dan is er niets te doen.
  const alreadyExact = Boolean(plan && activity.travel?.key === plan.outboundKey);
  const offset = daysBetween(toDateKey(new Date()), activity.date);
  const inRange = offset >= 0 && offset <= MAX_LOOKAHEAD_DAYS;
  const shouldFetch = Boolean(plan) && !alreadyExact && inRange;

  const [fetched, setFetched] = useState<{
    key: string;
    travel: TravelInfo;
    returnTravel: TravelInfo;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  /** Verandert zodra we opnieuw willen ophalen, bv. na een paar minuten. */
  const [reloadAt, setReloadAt] = useState(0);

  const outboundKey = plan?.outboundKey ?? null;

  /*
   * Vertragingen veranderen. Voor een OV-rit van vandaag halen we daarom
   * regelmatig opnieuw op, en meteen wanneer je de app weer voor je neus haalt
   * — dat laatste is het moment waarop je écht wilt weten of je trein rijdt.
   */
  const isToday = offset === 0;
  useEffect(() => {
    if (!isTransit || !isToday) return;

    const refresh = () => setReloadAt(Date.now());
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isTransit, isToday]);

  useEffect(() => {
    if (!shouldFetch || !plan || !outboundKey || !settings.home || !activity.location) return;
    if (fetched?.key === outboundKey && reloadAt === 0) return;
    // Bij een verversing willen we juist geen cache: dat is het hele punt.
    if (reloadAt > 0) cache.delete(outboundKey);

    const home = settings.home;
    const destination = activity.location;
    let active = true;

    const cached = cache.get(outboundKey);
    const request =
      cached && Date.now() - cached.at < CACHE_TTL_MS
        ? cached.value
        : (() => {
            const value = Promise.all([
              fetchTravel(home, destination, { mode: plan.mode, arriveBy: plan.arriveBy }),
              fetchTravel(destination, home, { mode: plan.mode, departAt: plan.departAt }),
            ]).then(([outbound, inbound]) => ({ outbound, inbound }));
            cache.set(outboundKey, { at: Date.now(), value });
            // Een mislukte reis niet vasthouden: morgen mag het opnieuw.
            value.catch(() => cache.delete(outboundKey));
            return value;
          })();

    setLoading(true);
    request
      .then(({ outbound, inbound }) => {
        if (!active) return;
        const computedAt = new Date().toISOString();
        setFetched({
          key: outboundKey,
          travel: { ...outbound, computedAt, key: plan.outboundKey },
          returnTravel: { ...inbound, computedAt, key: plan.returnKey },
        });
      })
      .catch(() => {
        // Lukt het niet, dan blijft de reis van de activiteit staan: liever een
        // benadering dan een lege kaart.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetch, outboundKey, reloadAt]);

  if (!isTransit) return { ...stored, loading: false, exact: true };
  if (alreadyExact) return { ...stored, loading: false, exact: true };

  if (fetched && fetched.key === outboundKey) {
    return {
      travel: fetched.travel,
      returnTravel: fetched.returnTravel,
      loading: false,
      exact: true,
    };
  }

  return { ...stored, loading: loading && shouldFetch, exact: false };
}
