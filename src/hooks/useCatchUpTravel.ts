"use client";

import { useEffect, useState } from "react";
import { fetchTravel } from "@/lib/api";
import type { BikeEnds, GeoLocation, TravelResult } from "@/lib/types";

/**
 * De rit die je nú nog kunt halen.
 *
 * Je vertrektijd is verstreken: je sliep uit, of je zag de bus wegrijden. De
 * app zei dan alleen "vertrektijd is verstreken" en liet de rit staan die je
 * net gemist hebt — de enige rit op het scherm die zeker niet meer gaat. Op dat
 * moment wil je één ding weten: wanneer gaat de volgende, en red ik het nog.
 *
 * Daarom vraagt deze hook een rit op die nu vertrekt. Alleen wanneer het er
 * echt toe doet: bij OV, vandaag, en zolang je activiteit nog moet beginnen.
 */

/** Even vaak opnieuw als de rest van de reistijden. */
const REFRESH_MS = 2 * 60 * 1000;

export interface CatchUpTravel {
  travel: TravelResult | null;
  loading: boolean;
  /** true wanneer er vandaag niets meer rijdt dat je er nog brengt. */
  nothingLeft: boolean;
}

/** Hele minuten, zodat twee kaarten naast elkaar dezelfde rit opvragen. */
function minuteSlot(now: number): string {
  const date = new Date(now);
  date.setSeconds(0, 0);
  return date.toISOString();
}

export function useCatchUpTravel(
  from: GeoLocation | null,
  to: GeoLocation | null,
  bike: BikeEnds,
  enabled: boolean,
): CatchUpTravel {
  const [slot, setSlot] = useState(() => minuteSlot(Date.now()));
  const [travel, setTravel] = useState<TravelResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [nothingLeft, setNothingLeft] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setSlot(minuteSlot(Date.now())), REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  // De coordinaten in de afhankelijkheden, niet de objecten: die zijn bij elke
  // render nieuw en zouden elke keer opnieuw ophalen.
  const route = from && to ? `${from.lat},${from.lon}>${to.lat},${to.lon}` : null;

  useEffect(() => {
    if (!enabled || !from || !to) {
      setTravel(null);
      setNothingLeft(false);
      return;
    }

    let active = true;
    setLoading(true);
    fetchTravel(from, to, { mode: "transit", departAt: slot, bike })
      .then((result) => {
        if (!active) return;
        setTravel(result);
        setNothingLeft(false);
      })
      .catch(() => {
        // Geen rit meer vandaag is een geldig antwoord, geen storing: de
        // planner geeft dan niets terug. Wat we hier níét doen is een oude
        // uitkomst laten staan alsof hij nog gaat.
        if (!active) return;
        setTravel(null);
        setNothingLeft(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, route, bike, slot]);

  return { travel, loading, nothingLeft };
}
