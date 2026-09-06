"use client";

import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";
import type {
  GeocodeResult,
  GeoLocation,
  Journey,
  BikeEnds,
  TravelMode,
  TravelResult,
} from "./types";

/** Een tekst in de taal die nu actief is. */
function say(key: TranslationKey): string {
  return translate(getLanguage(), key);
}

/**
 * De server kent de gekozen taal niet uit zichzelf; die staat in de browser.
 * Daarom gaat hij bij elke aanvraag mee, zodat foutmeldingen in dezelfde taal
 * terugkomen als de rest van de app.
 */
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Language": getLanguage(), ...extra };
}

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
  includeStops = false,
): Promise<GeocodeResult[]> {
  const stops = includeStops ? "&stops=1" : "";
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}${stops}`, {
    signal,
    headers: headers(),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, say("error.geocode")));
  }
  const data = (await response.json()) as { results: GeocodeResult[] };
  return data.results ?? [];
}

export interface TravelRequestOptions {
  mode: TravelMode;
  /** Aan welke kant van deze rit een fiets staat; alleen zinvol bij OV. */
  bike?: BikeEnds;
  /** ISO-tijd: uiterlijk aankomen (heenreis met OV). */
  arriveBy?: string;
  /** ISO-tijd: op zijn vroegst vertrekken (terugreis met OV). */
  departAt?: string;
}

export async function fetchTravel(
  from: GeoLocation,
  to: GeoLocation,
  options: TravelRequestOptions,
  signal?: AbortSignal,
): Promise<TravelResult> {
  const response = await fetch("/api/travel", {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ from, to, ...options }),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response, say("error.travel")));
  }
  return (await response.json()) as TravelResult;
}

export interface JourneySearchOptions {
  /** ISO-tijd; standaard nu. */
  time?: string;
  /** Aan welke kant van de rit een fiets staat. */
  bike?: BikeEnds;
  /** true = "uiterlijk aankomen om", false = "vertrekken vanaf". */
  arriveBy?: boolean;
  /** Cursor uit een eerder antwoord, om eerder/later te bladeren. */
  cursor?: string;
  count?: number;
}

export interface JourneySearchResult {
  journeys: Journey[];
  previousCursor?: string;
  nextCursor?: string;
}

/** Haalt meerdere reismogelijkheden op, inclusief live vertragingen. */
export async function fetchJourneys(
  from: GeoLocation,
  to: GeoLocation,
  options: JourneySearchOptions = {},
  signal?: AbortSignal,
): Promise<JourneySearchResult> {
  const response = await fetch("/api/journeys", {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ from, to, ...options }),
    signal,
  });
  if (!response.ok) {
    throw new Error(await parseError(response, say("error.journey")));
  }
  return (await response.json()) as JourneySearchResult;
}
