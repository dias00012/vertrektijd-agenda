import "server-only";
import { cacheGet, cacheSet } from "./cache";
import { fetchWithTimeout, getProviderConfig, ProviderError } from "./config";
import type { GeoLocation, TravelMode, TravelResult } from "../types";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type RouteResult = TravelResult;

/** Profielnamen per provider. Alleen "car" is nu in gebruik in de UI. */
const OSRM_PROFILE: Record<TravelMode, string> = {
  car: "driving",
  bike: "bike",
  walk: "foot",
  transit: "driving",
};

const ORS_PROFILE: Record<TravelMode, string> = {
  car: "driving-car",
  bike: "cycling-regular",
  walk: "foot-walking",
  transit: "driving-car",
};

/** Berekent de reistijd van thuis naar de bestemming. */
export async function route(
  from: GeoLocation,
  to: GeoLocation,
  mode: TravelMode = "car",
): Promise<RouteResult> {
  const config = getProviderConfig();
  const key = `route:${config.provider}:${mode}:${coord(from)}>${coord(to)}`;
  const cached = cacheGet<RouteResult>(key);
  if (cached) return cached;

  const result =
    config.provider === "ors" ? await routeOrs(from, to, mode) : await routeOsrm(from, to, mode);

  cacheSet(key, result, CACHE_TTL_MS);
  return result;
}

function coord(point: GeoLocation): string {
  return `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
}

async function routeOsrm(from: GeoLocation, to: GeoLocation, mode: TravelMode): Promise<RouteResult> {
  const config = getProviderConfig();
  const profile = OSRM_PROFILE[mode];
  const path = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${config.osrmBaseUrl}/route/v1/${profile}/${path}?overview=false&alternatives=false`;

  const response = await fetchWithTimeout(url, {
    headers: { "User-Agent": config.userAgent, Accept: "application/json" },
  });

  if (response.status === 429) {
    throw new ProviderError("Te veel routeberekeningen achter elkaar. Probeer het zo nog eens.", 429);
  }
  if (!response.ok) {
    throw new ProviderError("De routeberekening is mislukt.");
  }

  const data = (await response.json()) as {
    code?: string;
    routes?: { duration: number; distance: number }[];
  };

  const best = data.routes?.[0];
  if (data.code !== "Ok" || !best) {
    throw new ProviderError("Er is geen route gevonden tussen deze twee locaties.", 422);
  }

  return {
    durationMinutes: Math.round(best.duration / 60),
    distanceKm: best.distance / 1000,
    provider: "osrm",
    mode,
  };
}

async function routeOrs(from: GeoLocation, to: GeoLocation, mode: TravelMode): Promise<RouteResult> {
  const config = getProviderConfig();
  const url = `https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[mode]}`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: config.orsApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      coordinates: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("De API-sleutel voor OpenRouteService is ongeldig.", 500);
  }
  if (!response.ok) {
    throw new ProviderError("De routeberekening is mislukt.");
  }

  const data = (await response.json()) as {
    routes?: { summary?: { duration?: number; distance?: number } }[];
  };
  const summary = data.routes?.[0]?.summary;
  if (!summary?.duration) {
    throw new ProviderError("Er is geen route gevonden tussen deze twee locaties.", 422);
  }

  return {
    durationMinutes: Math.round(summary.duration / 60),
    distanceKm: (summary.distance ?? 0) / 1000,
    provider: "openrouteservice",
    mode,
  };
}
