import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De API-routes zelf aangeroepen, niet alleen de functies eronder.
 *
 * Wat er tussen zit -- de verkeersdrempel, het uitlezen van de parameters, het
 * omzetten van een providerfout naar een nette statuscode -- werd nergens
 * nagerekend. En juist daar ligt het verschil tussen "geen resultaten" en "500
 * Internal Server Error" op het scherm van iemand die op het station staat.
 *
 * De externe diensten worden hier niet gebeld; alleen de laag eromheen telt.
 */

const oorspronkelijk = { ...process.env };

function verzoek(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    // Zonder afzender valt elke aanvraag onder dezelfde teller en tikt de
    // verkeersdrempel al bij de tweede test aan.
    headers: {
      "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
      ...(init.headers as Record<string, string>),
    },
    ...init,
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...oorspronkelijk };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/health", () => {
  it("zegt dat de app draait", async () => {
    const { GET } = await import("./health/route");
    const antwoord = await GET(verzoek("https://voorbeeld.test/api/health"));

    expect(antwoord.status).toBe(200);
    await expect(antwoord.json()).resolves.toMatchObject({ ok: true });
  });

  /**
   * De belofte uit het commentaar van de route: weten dát iets is ingesteld
   * helpt bij het opzetten, weten wát erin staat helpt alleen een aanvaller.
   */
  it("verklapt geen enkele waarde, alleen ja of nee", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dit-is-geheim-12345";
    process.env.PUSH_CRON_SECRET = "ook-geheim-67890";

    const { GET } = await import("./health/route");
    const tekst = await (await GET(verzoek("https://voorbeeld.test/api/health"))).text();

    expect(tekst).not.toContain("dit-is-geheim-12345");
    expect(tekst).not.toContain("ook-geheim-67890");
    for (const waarde of Object.values(
      (JSON.parse(tekst) as { features: Record<string, unknown> }).features,
    )) {
      expect(typeof waarde).toBe("boolean");
    }
  });

  it("zegt dat synchronisatie uit staat zonder de twee sleutels", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { GET } = await import("./health/route");
    const body = (await (await GET(verzoek("https://voorbeeld.test/api/health"))).json()) as {
      features: { sync: boolean };
    };

    expect(body.features.sync).toBe(false);
  });

  it("houdt een stortvloed tegen", async () => {
    const { GET } = await import("./health/route");
    const zelfde = () =>
      new Request("https://voorbeeld.test/api/health", {
        headers: { "x-forwarded-for": "10.9.9.9" },
      });

    let laatste = 200;
    for (let i = 0; i < 25; i += 1) laatste = (await GET(zelfde())).status;

    expect(laatste).toBe(429);
  });
});

describe("GET /api/geocode", () => {
  it("geeft een lege lijst bij een te korte zoekopdracht, geen fout", async () => {
    const { GET } = await import("./geocode/route");
    const antwoord = await GET(verzoek("https://voorbeeld.test/api/geocode?q=ab"));

    expect(antwoord.status).toBe(200);
    await expect(antwoord.json()).resolves.toEqual({ results: [] });
  });

  it("geeft een lege lijst als er helemaal niets gevraagd wordt", async () => {
    const { GET } = await import("./geocode/route");
    const antwoord = await GET(verzoek("https://voorbeeld.test/api/geocode"));

    expect(antwoord.status).toBe(200);
    await expect(antwoord.json()).resolves.toEqual({ results: [] });
  });

  it("geeft de resultaten van de geocoder door", async () => {
    vi.doMock("@/lib/server/geocoding", () => ({
      geocode: vi
        .fn()
        .mockResolvedValue([{ label: "Ergens", name: "Ergens", context: "", lat: 1, lon: 2 }]),
    }));

    const { GET } = await import("./geocode/route");
    const antwoord = await GET(verzoek("https://voorbeeld.test/api/geocode?q=ergens"));

    expect(antwoord.status).toBe(200);
    await expect(antwoord.json()).resolves.toMatchObject({ results: [{ label: "Ergens" }] });
  });

  /** Een dienst die piept hoort niet als onze eigen storing te eindigen. */
  it("geeft de statuscode van de provider door in plaats van 500", async () => {
    const { ProviderError } = await import("@/lib/server/config");
    vi.doMock("@/lib/server/geocoding", () => ({
      geocode: vi.fn().mockRejectedValue(new ProviderError("api.tooManySearches", 429)),
    }));

    const { GET } = await import("./geocode/route");
    const antwoord = await GET(verzoek("https://voorbeeld.test/api/geocode?q=ergens"));

    expect(antwoord.status).toBe(429);
    await expect(antwoord.json()).resolves.toHaveProperty("error");
  });

  it("wordt 500 bij een fout die we niet kennen, met een nette zin erbij", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@/lib/server/geocoding", () => ({
      geocode: vi.fn().mockRejectedValue(new Error("iets onverwachts")),
    }));

    const { GET } = await import("./geocode/route");
    const antwoord = await GET(verzoek("https://voorbeeld.test/api/geocode?q=ergens"));

    expect(antwoord.status).toBe(500);
    const body = (await antwoord.json()) as { error: string };
    expect(body.error).not.toContain("iets onverwachts");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("antwoordt in de taal van het verzoek", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@/lib/server/geocoding", () => ({
      geocode: vi.fn().mockRejectedValue(new Error("stuk")),
    }));

    const { GET } = await import("./geocode/route");
    const nl = await GET(
      verzoek("https://voorbeeld.test/api/geocode?q=ergens", { headers: { "x-language": "nl" } }),
    );
    const en = await GET(
      verzoek("https://voorbeeld.test/api/geocode?q=ergens", { headers: { "x-language": "en" } }),
    );

    expect(((await nl.json()) as { error: string }).error).not.toBe(
      ((await en.json()) as { error: string }).error,
    );
  });
});
