"use client";

import { useEffect, useState } from "react";

/**
 * Klok die meeloopt. Wordt gebruikt voor "eerstvolgende activiteit" en de
 * aftelling naar de vertrektijd, zodat het dashboard vanzelf bijblijft.
 *
 * Hij staat stil zodra het tabblad naar de achtergrond gaat. Dat scheelt op
 * een telefoon echt iets: elke tik rendert de pagina opnieuw, en zonder deze
 * regel gebeurde dat de hele dag door terwijl je scherm uit stond. Bij
 * terugkomen wordt de tijd meteen bijgewerkt, dus je ziet nooit een oude klok.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => setNow(new Date()), intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    function onVisibility() {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        // Eerst bijwerken, dan pas weer tikken: anders zie je bij terugkomen
        // nog tot een halve minuut de tijd van toen je wegging.
        setNow(new Date());
        start();
      } else {
        stop();
      }
    }

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return now;
}
