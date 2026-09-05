import "server-only";
import { cacheGet, cacheSet } from "./cache";
import { fetchWithTimeout, getProviderConfig, ProviderError } from "./config";
import type { GeoLocation, TravelLeg, TravelLegMode, TravelMode, TravelResult } from "../types";

/**
 * Routering per vervoermiddel.
 *
 * - auto  -> OSRM (snelle, betrouwbare autoroutes)
 * - fiets -> MOTIS (de publieke OSRM-demo kent alleen het autoprofiel en zou
 *            voor fiets en lopen dezelfde — dus foute — tijd teruggeven)
 * - lopen -> MOTIS
 * - OV    -> MOTIS reisplanner, met echte dienstregeling, lijnen en sporen
 *
 * MOTIS/transitous is gratis en zonder sleutel, maar vraagt wel om een
 * herkenbare User-Agent (zie https://transitous.org/api/).
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** OV-plannen verouderen sneller: dienstregeling en vertragingen wijzigen. */
const TRANSIT_CACHE_TTL_MS = 10 * 60 * 1000;
/** Ruime bovengrens zodat ook lange fiets-/looproutes een antwoord geven. */
const MAX_DIRECT_SECONDS = 4 * 60 * 60;

export type RouteResult = TravelResult;

export interface RouteOptions {
  mode: TravelMode;
  /** ISO-tijd: uiterlijk aankomen (gebruikt voor de heenreis met OV). */
  arriveBy?: string;
  /** ISO-tijd: op zijn vroegst vertrekken (gebruikt voor de terugreis met OV). */
  departAt?: string;
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
  const key = `route:${config.provider}:${mode}${timePart}:${coord(from)}>${coord(to)}`;

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

function place(point: GeoLocation): string {
  return `${point.lat},${point.lon}`;
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
    throw new ProviderError("Te veel routeberekeningen achter elkaar. Probeer het zo nog eens.", 429);
  }
  if (!response.ok) throw new ProviderError("De routeberekening is mislukt.");

  const data = (await response.json()) as {
    code?: string;
    routes?: { duration: number; distance: number }[];
  };
  const best = data.routes?.[0];
  if (data.code !== "Ok" || !best) {
    throw new ProviderError("Er is geen autoroute gevonden tussen deze twee locaties.", 422);
  }

  return {
    durationMinutes: Math.round(best.duration / 60),
    distanceKm: best.distance / 1000,
    provider: "osrm",
    mode: "car",
  };
}

/* --- MOTIS (fiets, lopen en OV) ----------------------------------------- */

interface MotisPlace {
  name?: string;
  track?: string;
  departure?: string;
  arrival?: string;
}

interface MotisLeg {
  mode?: string;
  duration?: number;
  distance?: number;
  startTime?: string;
  endTime?: string;
  from?: MotisPlace;
  to?: MotisPlace;
  routeShortName?: string;
  headsign?: string;
  agencyName?: string;
  tripShortName?: string;
}

interface MotisItinerary {
  duration?: number;
  startTime?: string;
  endTime?: string;
  transfers?: number;
  legs?: MotisLeg[];
}

async function motisPlan(params: URLSearchParams): Promise<{
  itineraries?: MotisItinerary[];
  direct?: MotisItinerary[];
}> {
  const config = getProviderConfig();
  const url = `${config.motisBaseUrl}/api/v1/plan?${params.toString()}`;

  const response = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": config.userAgent, Accept: "application/json" } },
    12_000,
  );

  if (response.status === 429) {
    throw new ProviderError("Te veel reisaanvragen achter elkaar. Probeer het zo nog eens.", 429);
  }
  if (!response.ok) {
    throw new ProviderError("De reisplanner is niet bereikbaar. Probeer het later opnieuw.");
  }
  return (await response.json()) as { itineraries?: MotisItinerary[]; direct?: MotisItinerary[] };
}

/** Fiets- of looproute zonder dienstregeling. */
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
    throw new ProviderError(
      mode === "bike"
        ? "Er is geen fietsroute gevonden tussen deze twee locaties."
        : "Er is geen looproute gevonden tussen deze twee locaties.",
      422,
    );
  }

  const meters = (best.legs ?? []).reduce((sum, leg) => sum + (leg.distance ?? 0), 0);
  return {
    durationMinutes: Math.round(best.duration / 60),
    distanceKm: meters / 1000,
    provider: "motis",
    mode,
  };
}

/** Volledige OV-reis met lijnen, overstappen en sporen. */
async function planTransit(
  from: GeoLocation,
  to: GeoLocation,
  options: RouteOptions,
): Promise<RouteResult> {
  const arriveBy = Boolean(options.arriveBy);
  const time = options.arriveBy ?? options.departAt ?? new Date().toISOString();

  const params = new URLSearchParams({
    fromPlace: place(from),
    toPlace: place(to),
    time,
    arriveBy: String(arriveBy),
    numItineraries: "1",
  });

  const data = await motisPlan(params);
  const best = data.itineraries?.[0];
  if (!best?.duration || !best.startTime || !best.endTime) {
    throw new ProviderError(
      "Geen OV-verbinding gevonden voor dit tijdstip. Probeer een ander vervoermiddel.",
      422,
    );
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

/** Vertaalt een MOTIS-vervoerswijze naar onze eigen, compactere set. */
function toLegMode(motisMode: string | undefined): TravelLegMode {
  switch ((motisMode ?? "").toUpperCase()) {
    case "WALK":
      return "walk";
    case "BIKE":
      return "bike";
    case "CAR":
      return "car";
    case "BUS":
    case "COACH":
      return "bus";
    case "TRAM":
      return "tram";
    case "SUBWAY":
    case "METRO":
      return "subway";
    case "FERRY":
      return "ferry";
    case "RAIL":
    case "REGIONAL_RAIL":
    case "REGIONAL_FAST_RAIL":
    case "LONG_DISTANCE":
    case "HIGHSPEED_RAIL":
    case "NIGHT_RAIL":
      return "rail";
    default:
      return "other";
  }
}

/**
 * MOTIS noemt begin- en eindpunt "START" en "END". We vervangen die door de
 * namen die de gebruiker kent ("thuis", "Windesheim Almere").
 */
function placeName(raw: string | undefined, fromLabel: string, toLabel: string): string {
  if (!raw) return "";
  if (raw === "START") return fromLabel;
  if (raw === "END") return toLabel;
  return raw;
}

function toTravelLeg(leg: MotisLeg, fromLabel: string, toLabel: string): TravelLeg {
  return {
    mode: toLegMode(leg.mode),
    durationMinutes: Math.round((leg.duration ?? 0) / 60),
    from: placeName(leg.from?.name, fromLabel, toLabel),
    to: placeName(leg.to?.name, fromLabel, toLabel),
    departure: leg.startTime,
    arrival: leg.endTime,
    line: leg.routeShortName,
    headsign: leg.headsign,
    agency: leg.agencyName,
    trip: leg.tripShortName,
    track: leg.from?.track,
  };
}
