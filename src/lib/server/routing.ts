import "server-only";
import { cacheGet, cacheSet } from "./cache";
import { fetchWithTimeout, getProviderConfig, ProviderError } from "./config";
import { motisPlan, toTravelLeg } from "./motis";
import { pickItinerary } from "../itineraries";
import { place, transitParams } from "../transitQuery";
import type { BikeEnds, GeoLocation, TravelMode, TravelResult } from "../types";

/**
 * Routering per vervoermiddel voor de agenda: één reis van A naar B.
 *
 * - auto  -> OSRM (snelle, betrouwbare autoroutes)
 * - fiets -> MOTIS (de publieke OSRM-demo kent alleen het autoprofiel en zou
 *            voor fiets en lopen dezelfde — dus foute — tijd teruggeven)
 * - lopen -> MOTIS
 * - OV    -> MOTIS, met echte dienstregeling, lijnen en sporen
 *
 * Meerdere reisopties naast elkaar (de reisplanner) staan in `journeys.ts`.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/**
 * OV-plannen verouderen sneller: dienstregeling en vertragingen wijzigen.
 *
 * Korter dan de twee minuten waarmee de app ververst (`REFRESH_MS` in
 * `useOccurrenceTravel`). Stond hier tien minuten, en dan liep al dat
 * verversen dood op de cache: je kreeg tot tien minuten lang letterlijk
 * hetzelfde antwoord terug, inclusief "op tijd" voor een trein die inmiddels
 * negen minuten vertraging had. Een minuut vangt nog steeds de stortvloed op
 * van meerdere kaarten en apparaten die tegelijk om dezelfde rit vragen.
 */
const TRANSIT_CACHE_TTL_MS = 60 * 1000;
/** Ruime bovengrens zodat ook lange fiets-/looproutes een antwoord geven. */
const MAX_DIRECT_SECONDS = 4 * 60 * 60;

export type RouteResult = TravelResult;

export interface RouteOptions {
  mode: TravelMode;
  /** ISO-tijd: uiterlijk aankomen (gebruikt voor de heenreis met OV). */
  arriveBy?: string;
  /** ISO-tijd: op zijn vroegst vertrekken (gebruikt voor de terugreis met OV). */
  departAt?: string;
  /** Aan welke kant van deze rit een fiets staat; alleen zinvol bij OV. */
  bike?: BikeEnds;
}

/** Berekent de reis tussen twee punten voor het gekozen vervoermiddel. */
export async function route(
  from: GeoLocation,
  to: GeoLocation,
  options: RouteOptions,
): Promise<RouteResult> {
  const { mode } = options;
  const config = getProviderConfig();

  // Bij OV hoort de tijd bij de sleutel: een andere dag of tijd is een andere rit.
  const timePart =
    mode === "transit" ? `@${options.arriveBy ?? options.departAt ?? "now"}` : "";
  // En de fietskeuze ook: fietsen naar het station geeft een andere reis dan
  // lopen. Zonder dit krijg je de eerder berekende looproute terug.
  const bikePart =
    mode === "transit" && options.bike && options.bike !== "none"
      ? `+${options.bike}`
      : "";
  const key = `route:${config.provider}:${mode}${timePart}${bikePart}:${coord(from)}>${coord(to)}`;

  const cached = cacheGet<RouteResult>(key);
  if (cached) return cached;

  let result: RouteResult;
  if (mode === "transit") {
    result = await planTransit(from, to, options);
  } else if (mode === "bike" || mode === "walk") {
    result = await planDirect(from, to, mode);
  } else {
    result = await routeCar(from, to);
  }

  cacheSet(key, result, mode === "transit" ? TRANSIT_CACHE_TTL_MS : CACHE_TTL_MS);
  return result;
}

function coord(point: GeoLocation): string {
  return `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
}

/* --- Auto via OSRM ------------------------------------------------------ */

async function routeCar(from: GeoLocation, to: GeoLocation): Promise<RouteResult> {
  const config = getProviderConfig();
  const path = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${config.osrmBaseUrl}/route/v1/driving/${path}?overview=false&alternatives=false`;

  const response = await fetchWithTimeout(url, {
    headers: { "User-Agent": config.userAgent, Accept: "application/json" },
  });

  if (response.status === 429) {
    throw new ProviderError("api.tooManyRoutes", 429);
  }
  if (!response.ok) throw new ProviderError("api.routeFailed");

  const data = (await response.json()) as {
    code?: string;
    routes?: { duration: number; distance: number }[];
  };
  const best = data.routes?.[0];
  if (data.code !== "Ok" || !best) {
    throw new ProviderError("api.noCarRoute", 422);
  }

  return {
    durationMinutes: Math.round(best.duration / 60),
    distanceKm: best.distance / 1000,
    provider: "osrm",
    mode: "car",
  };
}

/* --- Fiets en lopen via MOTIS ------------------------------------------- */

async function planDirect(
  from: GeoLocation,
  to: GeoLocation,
  mode: "bike" | "walk",
): Promise<RouteResult> {
  const params = new URLSearchParams({
    fromPlace: place(from),
    toPlace: place(to),
    time: new Date().toISOString(),
    directModes: mode === "bike" ? "BIKE" : "WALK",
    // Leeg = geen OV meenemen; we willen puur de directe route.
    transitModes: "",
    maxDirectTime: String(MAX_DIRECT_SECONDS),
  });

  const data = await motisPlan(params);
  const best = data.direct?.[0];
  if (!best?.duration) {
    throw new ProviderError(mode === "bike" ? "api.noBikeRoute" : "api.noWalkRoute", 422);
  }

  const meters = (best.legs ?? []).reduce((sum, leg) => sum + (leg.distance ?? 0), 0);
  return {
    durationMinutes: Math.round(best.duration / 60),
    distanceKm: meters / 1000,
    provider: "motis",
    mode,
  };
}

/* --- OV via MOTIS ------------------------------------------------------- */

async function planTransit(
  from: GeoLocation,
  to: GeoLocation,
  options: RouteOptions,
): Promise<RouteResult> {
  const arriveBy = Boolean(options.arriveBy);
  const time = options.arriveBy ?? options.departAt ?? new Date().toISOString();

  const params = transitParams({
    from,
    to,
    shape: "best",
    time,
    arriveBy,
    bike: options.bike,
  });

  const data = await motisPlan(params);
  // Levert het OV niets op, dan is er soms nog wel een directe loop- of
  // fietsroute. Die tonen is beter dan zeggen dat er geen verbinding is.
  const candidates = data.itineraries?.length ? data.itineraries : (data.direct ?? []);
  const best = pickItinerary(candidates, { arriveBy, time });
  if (!best?.duration || !best.startTime || !best.endTime) {
    throw new ProviderError("api.noTransit", 422);
  }

  const fromLabel = from.label || "vertrekpunt";
  const toLabel = to.label || "bestemming";
  const legs = (best.legs ?? [])
    .map((leg) => toTravelLeg(leg, fromLabel, toLabel))
    .filter((leg) => leg.durationMinutes > 0 || leg.line);
  const meters = (best.legs ?? []).reduce((sum, leg) => sum + (leg.distance ?? 0), 0);

  return {
    durationMinutes: Math.round(best.duration / 60),
    distanceKm: meters / 1000,
    provider: "motis",
    mode: "transit",
    legs,
    transfers: best.transfers ?? 0,
    plannedDeparture: best.startTime,
    plannedArrival: best.endTime,
  };
}
