import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De twee tellers samen.
 *
 * Wat hier bewaakt wordt is vooral wat er gebeurt als het misgaat. De
 * geheugenteller vangt een stortvloed op dezelfde instance meteen af; de
 * database is de echte grens over alle instances heen; en valt die weg, dan
 * blijft de app gewoon werken.
 */

const gedeeld = vi.fn();
vi.mock("./rateLimitStore", () => ({
  checkSharedRateLimit: gedeeld,
  sharedLimitAvailable: () => true,
}));

function verzoek(ip: string): Request {
  return new Request("https://voorbeeld.test/api/geocode?q=ergens", {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  vi.resetModules();
  gedeeld.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("enforceSharedRateLimit", () => {
  it("laat een gewone aanvraag door", async () => {
    gedeeld.mockResolvedValue({ ok: true, retryAfter: 0, remaining: 29 });
    const { enforceSharedRateLimit } = await import("./rateLimit");

    await expect(enforceSharedRateLimit(verzoek("10.1.1.1"), "geocode")).resolves.toBeNull();
  });

  it("houdt tegen wat de database te veel vindt, ook al zegt het geheugen ja", async () => {
    gedeeld.mockResolvedValue({ ok: false, retryAfter: 30, remaining: 0 });
    const { enforceSharedRateLimit } = await import("./rateLimit");

    const antwoord = await enforceSharedRateLimit(verzoek("10.1.1.2"), "geocode");

    expect(antwoord?.status).toBe(429);
    expect(antwoord?.headers.get("Retry-After")).toBe("30");
  });

  /**
   * Het geval waar het om gaat: de database piept, en dan hoort de app gewoon
   * te blijven werken. Dichtgooien zou betekenen dat niemand meer kan reizen
   * omdat Postgres even niet meewerkt.
   */
  it("laat door als de database niets terugzegt", async () => {
    gedeeld.mockResolvedValue(null);
    const { enforceSharedRateLimit } = await import("./rateLimit");

    await expect(enforceSharedRateLimit(verzoek("10.1.1.3"), "geocode")).resolves.toBeNull();
  });

  /**
   * En de geheugenteller doet nog steeds zijn werk, zónder eerst een rondje
   * langs de database: een stortvloed op dezelfde instance hoort meteen
   * afgevangen te worden.
   */
  it("houdt een stortvloed tegen zonder de database te bellen", async () => {
    gedeeld.mockResolvedValue({ ok: true, retryAfter: 0, remaining: 1 });
    const { enforceSharedRateLimit, LIMITS } = await import("./rateLimit");

    let laatste: Response | null = null;
    for (let i = 0; i <= LIMITS.geocode.limit; i += 1) {
      laatste = await enforceSharedRateLimit(verzoek("10.9.9.9"), "geocode");
    }

    expect(laatste?.status).toBe(429);
    // Bij de aanvraag die geweigerd werd is de database niet meer gebeld.
    expect(gedeeld).toHaveBeenCalledTimes(LIMITS.geocode.limit);
  });

  it("antwoordt in de taal van het verzoek", async () => {
    gedeeld.mockResolvedValue({ ok: false, retryAfter: 10, remaining: 0 });
    const { enforceSharedRateLimit } = await import("./rateLimit");

    const nl = await enforceSharedRateLimit(verzoek("10.2.0.1"), "geocode");
    const en = await enforceSharedRateLimit(
      new Request("https://voorbeeld.test/api/geocode", {
        headers: { "x-forwarded-for": "10.2.0.2", "x-language": "en" },
      }),
      "geocode",
    );

    const tekstNl = ((await nl!.json()) as { error: string }).error;
    const tekstEn = ((await en!.json()) as { error: string }).error;
    expect(tekstNl).not.toBe(tekstEn);
  });
});
