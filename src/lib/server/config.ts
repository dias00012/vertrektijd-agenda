import "server-only";

/**
 * Alle providerconfiguratie leeft uitsluitend op de server. Er is bewust geen
 * NEXT_PUBLIC_ variant, zodat een API-key nooit in de client-bundle terechtkomt.
 */

export type ProviderName = "osm" | "ors";

export interface ProviderConfig {
  provider: ProviderName;
  orsApiKey: string;
  nominatimBaseUrl: string;
  osrmBaseUrl: string;
  userAgent: string;
}

export function getProviderConfig(): ProviderConfig {
  const orsApiKey = process.env.ORS_API_KEY?.trim() ?? "";
  const requested = (process.env.TRAVEL_PROVIDER?.trim().toLowerCase() as ProviderName) || "osm";

  // Val terug op OSM wanneer ORS gevraagd wordt zonder key: liever een werkende
  // app met iets grovere schattingen dan een harde crash.
  const provider: ProviderName = requested === "ors" && orsApiKey ? "ors" : "osm";

  return {
    provider,
    orsApiKey,
    nominatimBaseUrl:
      process.env.NOMINATIM_BASE_URL?.replace(/\/$/, "") ?? "https://nominatim.openstreetmap.org",
    osrmBaseUrl:
      process.env.OSRM_BASE_URL?.replace(/\/$/, "") ?? "https://router.project-osrm.org",
    userAgent:
      process.env.NOMINATIM_USER_AGENT?.trim() ||
      "VertrektijdAgenda/0.1 (https://localhost; persoonlijke agenda-app)",
  };
}

/** Fout met een nette, in het Nederlands leesbare boodschap voor de client. */
export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/** fetch met timeout, zodat een trage provider de request niet laat hangen. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("De kaartenservice reageerde niet op tijd. Probeer het nog eens.", 504);
    }
    throw new ProviderError("Kon de kaartenservice niet bereiken. Controleer je internetverbinding.");
  } finally {
    clearTimeout(timer);
  }
}
