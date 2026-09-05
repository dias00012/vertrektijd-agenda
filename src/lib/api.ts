"use client";

import type { GeocodeResult, GeoLocation, TravelMode, TravelResult } from "./types";

/**
 * Dunne client voor onze eigen API-routes. De frontend kent geen enkele
 * externe provider of sleutel; alles loopt via /api/*.
 */

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) {
    throw new Error(await parseError(response, "Zoeken naar de locatie is mislukt."));
  }
  const data = (await response.json()) as { results: GeocodeResult[] };
  return data.results ?? [];
}

export async function fetchTravel(
  from: GeoLocation,
  to: GeoLocation,
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<TravelResult> {
  const response = await fetch("/api/travel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, mode }),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "De reistijd kon niet worden berekend."));
  }
  return (await response.json()) as TravelResult;
}
