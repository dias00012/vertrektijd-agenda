import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError, fetchWithTimeout, getProviderConfig } from "./config";

/**
 * De instellingen van de externe diensten.
 *
 * Twee dingen die je liever niet in productie ontdekt: een app die omvalt
 * omdat er een sleutel ontbreekt, en een verzoek dat blijft hangen omdat een
 * kaartdienst traag is. Allebei zijn ze hier afgevangen; hier staat of dat ook
 * echt zo werkt.
 */

const oorspronkelijk = { ...process.env };

beforeEach(() => {
  for (const k of [
    "ORS_API_KEY",
    "TRAVEL_PROVIDER",
    "NOMINATIM_BASE_URL",
    "OSRM_BASE_URL",
    "MOTIS_BASE_URL",
    "PDOK_BASE_URL",
    "NOMINATIM_USER_AGENT",
  ]) {
    delete process.env[k];
  }
});

afterEach(() => {
  process.env = { ...oorspronkelijk };
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getProviderConfig", () => {
  it("gebruikt OpenStreetMap als er niets is ingesteld", () => {
    expect(getProviderConfig().provider).toBe("osm");
  });

  it("gebruikt ORS zodra die gevraagd wordt mét sleutel", () => {
    process.env.TRAVEL_PROVIDER = "ors";
    process.env.ORS_API_KEY = "geheim";

    expect(getProviderConfig().provider).toBe("ors");
  });

  /** Liever iets grovere schattingen dan een app die niet start. */
  it("valt terug op OpenStreetMap als ORS gevraagd wordt zonder sleutel", () => {
    process.env.TRAVEL_PROVIDER = "ors";

    expect(getProviderConfig().provider).toBe("osm");
  });

  it("trekt zich niets aan van hoofdletters of spaties", () => {
    process.env.TRAVEL_PROVIDER = "  ORS ";
    process.env.ORS_API_KEY = "geheim";

    expect(getProviderConfig().provider).toBe("ors");
  });

  it("valt terug op OpenStreetMap bij een aanbieder die niet bestaat", () => {
    process.env.TRAVEL_PROVIDER = "googlemaps";

    expect(getProviderConfig().provider).toBe("osm");
  });

  it("haalt een schuine streep aan het eind van de adressen weg", () => {
    process.env.NOMINATIM_BASE_URL = "https://eigen.test/nominatim/";
    process.env.OSRM_BASE_URL = "https://eigen.test/osrm/";
    process.env.MOTIS_BASE_URL = "https://eigen.test/motis/";

    const config = getProviderConfig();
    expect(config.nominatimBaseUrl).toBe("https://eigen.test/nominatim");
    expect(config.osrmBaseUrl).toBe("https://eigen.test/osrm");
    expect(config.motisBaseUrl).toBe("https://eigen.test/motis");
  });

  it("heeft voor elke dienst een adres, ook zonder instellingen", () => {
    const config = getProviderConfig();

    for (const url of [
      config.nominatimBaseUrl,
      config.osrmBaseUrl,
      config.motisBaseUrl,
      config.pdokBaseUrl,
    ]) {
      expect(url).toMatch(/^https:\/\//);
      expect(url).not.toMatch(/\/$/);
    }
  });

  /** Nominatim wil weten wie er belt; zonder naam word je geweigerd. */
  it("stuurt altijd een naam mee", () => {
    expect(getProviderConfig().userAgent.length).toBeGreaterThan(0);

    process.env.NOMINATIM_USER_AGENT = "EigenApp/1.0";
    expect(getProviderConfig().userAgent).toBe("EigenApp/1.0");
  });
});

describe("ProviderError", () => {
  it("houdt de sleutel vast, zodat de route hem kan vertalen", () => {
    const fout = new ProviderError("api.geocodeFailed");

    expect(fout.key).toBe("api.geocodeFailed");
    expect(fout.name).toBe("ProviderError");
  });

  it("is 502 tenzij je iets anders zegt", () => {
    expect(new ProviderError("api.geocodeFailed").status).toBe(502);
    expect(new ProviderError("api.tooManySearches", 429).status).toBe(429);
  });

  it("zet de Nederlandse zin in de melding, handig in de serverlogs", () => {
    expect(new ProviderError("api.geocodeFailed").message.length).toBeGreaterThan(0);
  });
});

describe("fetchWithTimeout", () => {
  it("geeft het antwoord terug als de dienst gewoon antwoordt", async () => {
    const antwoord = new Response("ok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(antwoord));

    await expect(fetchWithTimeout("https://eigen.test")).resolves.toBe(antwoord);
  });

  it("vraagt nooit om een gecachet antwoord", async () => {
    const nep = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", nep);

    await fetchWithTimeout("https://eigen.test");

    expect(nep.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("noemt het een time-out als de dienst te lang wegblijft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("afgebroken"), { name: "AbortError" })),
    );

    await expect(fetchWithTimeout("https://eigen.test")).rejects.toMatchObject({
      key: "api.mapTimeout",
      status: 504,
    });
  });

  it("noemt het onbereikbaar bij een andere netwerkfout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("geen verbinding")));

    await expect(fetchWithTimeout("https://eigen.test")).rejects.toMatchObject({
      key: "api.mapUnreachable",
      status: 502,
    });
  });
});
