import "server-only";
import { cacheGet, cacheSet } from "./cache";
import { fetchWithTimeout, getProviderConfig, ProviderError } from "./config";
import type { GeocodeResult } from "../types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface NominatimAddress {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NominatimAddress;
}

interface OrsFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; label?: string; region?: string; locality?: string };
}

/**
 * Zet een vrij ingetypte locatie ("Basic-Fit Almere Buiten") om in coordinaten.
 * Resultaten zijn gefocust op Nederland maar niet gelimiteerd tot NL.
 */
export async function geocode(query: string, limit = 5): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const config = getProviderConfig();
  const cacheKey = `geocode:${config.provider}:${limit}:${trimmed.toLowerCase()}`;
  const cached = cacheGet<GeocodeResult[]>(cacheKey);
  if (cached) return cached;

  const results =
    config.provider === "ors"
      ? await geocodeOrs(trimmed, limit)
      : await geocodeNominatim(trimmed, limit);

  cacheSet(cacheKey, results, CACHE_TTL_MS);
  return results;
}

async function geocodeNominatim(query: string, limit: number): Promise<GeocodeResult[]> {
  const config = getProviderConfig();
  const url = new URL(`${config.nominatimBaseUrl}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("accept-language", "nl");
  // Voorkeur voor Nederlandse resultaten zonder ze af te dwingen.
  url.searchParams.set("countrycodes", "nl,be,de");

  const response = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": config.userAgent, Accept: "application/json" },
  });

  if (response.status === 429) {
    throw new ProviderError("Te veel zoekopdrachten achter elkaar. Wacht even en probeer opnieuw.", 429);
  }
  if (!response.ok) {
    throw new ProviderError("Het zoeken van de locatie is mislukt.");
  }

  const items = (await response.json()) as NominatimItem[];
  return items.map((item) => {
    const parts = item.display_name.split(",").map((part) => part.trim());
    const address = item.address ?? {};
    const name = item.name?.trim() || parts[0] || item.display_name;
    const place = address.city ?? address.town ?? address.village ?? address.municipality;
    const street = [address.road, address.house_number].filter(Boolean).join(" ");

    // Tweede regel van de suggestie: straat, wijk en plaats, zonder herhaling
    // van de naam die al op de eerste regel staat.
    const context = [street, address.suburb ?? address.neighbourhood, place, address.state]
      .filter((value): value is string => Boolean(value) && value !== name)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, 3)
      .join(", ");

    return {
      // Label dat de gebruiker terugziet in de agenda: "Windesheim, Almere".
      label: place && !name.includes(place) ? `${name}, ${place}` : name,
      name,
      context,
      lat: Number(item.lat),
      lon: Number(item.lon),
    };
  });
}

async function geocodeOrs(query: string, limit: number): Promise<GeocodeResult[]> {
  const config = getProviderConfig();
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", config.orsApiKey);
  url.searchParams.set("text", query);
  url.searchParams.set("size", String(limit));
  url.searchParams.set("boundary.country", "NL");

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("De API-sleutel voor OpenRouteService is ongeldig.", 500);
  }
  if (!response.ok) {
    throw new ProviderError("Het zoeken van de locatie is mislukt.");
  }

  const data = (await response.json()) as { features?: OrsFeature[] };
  return (data.features ?? []).map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const name = feature.properties.name ?? feature.properties.label ?? query;
    const context = [feature.properties.locality, feature.properties.region]
      .filter(Boolean)
      .join(", ");
    return {
      label: feature.properties.label ?? name,
      name,
      context,
      lat,
      lon,
    };
  });
}
