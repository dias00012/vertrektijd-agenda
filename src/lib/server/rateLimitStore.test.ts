import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De gedeelde verkeersdrempel.
 *
 * De belangrijkste eigenschap staat niet in het gelukkige pad maar in het
 * ongelukkige: valt de database weg, dan mag er geen deur dichtgaan. Een app
 * die niemand meer laat reizen omdat Postgres even piept is erger dan een
 * drempel die een minuut te ruim staat.
 */

const REGEL = { limit: 30, windowMs: 60_000 };

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc }),
}));

const oorspronkelijk = { ...process.env };

beforeEach(async () => {
  vi.resetModules();
  rpc.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://voorbeeld.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-sleutel";
});

afterEach(() => {
  process.env = { ...oorspronkelijk };
});

async function laad() {
  const mod = await import("./rateLimitStore");
  mod.resetClientForTests();
  return mod;
}

describe("sharedLimitAvailable", () => {
  it("is aan zodra de sleutels er staan", async () => {
    const { sharedLimitAvailable } = await laad();
    expect(sharedLimitAvailable()).toBe(true);
  });

  it("is uit zonder service-sleutel", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { sharedLimitAvailable } = await laad();
    expect(sharedLimitAvailable()).toBe(false);
  });

  it("is uit zonder database-adres", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { sharedLimitAvailable } = await laad();
    expect(sharedLimitAvailable()).toBe(false);
  });
});

describe("checkSharedRateLimit", () => {
  it("laat door wat de database toestaat", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, remaining: 29, retry_after: 0 }, error: null });
    const { checkSharedRateLimit } = await laad();

    await expect(checkSharedRateLimit("geocode:1.2.3.4", REGEL)).resolves.toEqual({
      ok: true,
      retryAfter: 0,
      remaining: 29,
    });
  });

  it("houdt tegen wat eroverheen gaat", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, remaining: 0, retry_after: 42 }, error: null });
    const { checkSharedRateLimit } = await laad();

    await expect(checkSharedRateLimit("geocode:1.2.3.4", REGEL)).resolves.toEqual({
      ok: false,
      retryAfter: 42,
      remaining: 0,
    });
  });

  /** Retry-After 0 laat een client meteen opnieuw proberen; dan is het geen drempel. */
  it("zegt nooit 'probeer over nul seconden'", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, remaining: 0, retry_after: 0 }, error: null });
    const { checkSharedRateLimit } = await laad();

    const uit = await checkSharedRateLimit("geocode:1.2.3.4", REGEL);
    expect(uit?.retryAfter).toBe(1);
  });

  it("rondt een halve seconde naar boven af", async () => {
    rpc.mockResolvedValue({
      data: { allowed: false, remaining: 0, retry_after: 3.2 },
      error: null,
    });
    const { checkSharedRateLimit } = await laad();

    expect((await checkSharedRateLimit("k", REGEL))?.retryAfter).toBe(4);
  });

  it("leest ook een antwoord dat als lijst terugkomt", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 5, retry_after: 0 }], error: null });
    const { checkSharedRateLimit } = await laad();

    expect((await checkSharedRateLimit("k", REGEL))?.ok).toBe(true);
  });

  it("geeft de sleutel en de regel door aan de database", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, remaining: 1, retry_after: 0 }, error: null });
    const { checkSharedRateLimit } = await laad();

    await checkSharedRateLimit("travel:9.9.9.9", { limit: 60, windowMs: 30_000 });

    expect(rpc).toHaveBeenCalledWith("bump_rate_limit", {
      limit_key: "travel:9.9.9.9",
      window_ms: 30_000,
      max_count: 60,
    });
  });
});

describe("als de database niet meewerkt", () => {
  it("zegt niets terug zonder sleutels, zodat het geheugen het overneemt", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { checkSharedRateLimit } = await laad();

    await expect(checkSharedRateLimit("k", REGEL)).resolves.toBeNull();
  });

  /** De tabel of de functie is er niet; dat hoort geen 429 te worden. */
  it("zegt niets terug bij een fout uit Postgres", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const { checkSharedRateLimit } = await laad();

    await expect(checkSharedRateLimit("k", REGEL)).resolves.toBeNull();
  });

  /**
   * En ook als er naast de fout tóch een rij meekomt. Supabase geeft dat soms
   * zo terug, en dan is die rij niet te vertrouwen -- de fout telt.
   *
   * Dit kwam uit het muteren: zonder dit geval slaagde de test hierboven ook
   * als de foutcontrole helemaal weg was, want `data` was daar toch al null.
   */
  it("laat de fout tellen, ook als er een rij bij zit", async () => {
    rpc.mockResolvedValue({
      data: { allowed: false, remaining: 0, retry_after: 99 },
      error: { message: "permission denied" },
    });
    const { checkSharedRateLimit } = await laad();

    await expect(checkSharedRateLimit("k", REGEL)).resolves.toBeNull();
  });

  it("zegt niets terug als het netwerk wegvalt", async () => {
    rpc.mockRejectedValue(new Error("geen verbinding"));
    const { checkSharedRateLimit } = await laad();

    await expect(checkSharedRateLimit("k", REGEL)).resolves.toBeNull();
  });

  it("zegt niets terug bij een antwoord dat nergens op slaat", async () => {
    rpc.mockResolvedValue({ data: { onzin: true }, error: null });
    const { checkSharedRateLimit } = await laad();

    await expect(checkSharedRateLimit("k", REGEL)).resolves.toBeNull();
  });
});
