"use client";

import { useEffect, useState } from "react";

/**
 * Klok die elke minuut tikt. Wordt gebruikt voor "eerstvolgende activiteit" en
 * de aftelling naar de vertrektijd, zodat het dashboard vanzelf meeloopt.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
