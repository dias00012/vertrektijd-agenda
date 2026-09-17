import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "./stats";

/**
 * Deze tellingen lijken een detail tot je op je dashboard naar een nul kijkt
 * terwijl je de app de hele dag gebruikt hebt. Dat gebeurde: de app streepte
 * "vandaag geteld" af vóórdat de server iets had opgehoogd.
 */

/** Een browser-opslag die genoeg doet voor deze module. */
function nepOpslag() {
  const inhoud = new Map<string, string>();
  return {
    getItem: (key: string) => inhoud.get(key) ?? null,
    setItem: (key: string, value: string) => void inhoud.set(key, value),
    removeItem: (key: string) => void inhoud.delete(key),
    get grootte() {
      return inhoud.size;
    },
  };
}

let opslag: ReturnType<typeof nepOpslag>;

beforeEach(() => {
  opslag = nepOpslag();
  (globalThis as { window?: unknown }).window = { localStorage: opslag };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

/** Doet alsof de server antwoordt, en geeft terug hoe vaak er gebeld is. */
function server(antwoord: unknown, ok = true) {
  const fetchSpy = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, json: async () => antwoord }) as unknown as Response,
  );
  (globalThis as { fetch?: unknown }).fetch = fetchSpy;
  return fetchSpy;
}

/** Even wachten tot de belofte-ketting van `track` klaar is. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("track", () => {
  it("stuurt de gebeurtenis naar de server", async () => {
    const bel = server({ ok: true, counted: true });
    track("reis_gezocht");
    await settle();
    expect(bel).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(bel.mock.calls[0]?.[1]?.body))).toEqual({ name: "reis_gezocht" });
  });

  it("onthoudt pas dat hij vandaag geteld heeft als de server dat bevestigt", async () => {
    const bel = server({ ok: true, counted: true });
    track("dag_geopend", { oncePerDay: true });
    await settle();
    expect(opslag.grootte).toBe(1);

    // Tweede keer op dezelfde dag: niet nog eens.
    track("dag_geopend", { oncePerDay: true });
    await settle();
    expect(bel).toHaveBeenCalledTimes(1);
  });

  it("streept de dag niet af wanneer er niets geteld is", async () => {
    // Precies het geval van toen: de tabel bestond nog niet, de server
    // antwoordde met 200, maar er was niets opgehoogd.
    const bel = server({ ok: true, counted: false });
    track("dag_geopend", { oncePerDay: true });
    await settle();
    expect(opslag.grootte).toBe(0);

    // Dus probeert hij het straks gewoon opnieuw.
    track("dag_geopend", { oncePerDay: true });
    await settle();
    expect(bel).toHaveBeenCalledTimes(2);
  });

  it("streept de dag niet af wanneer het verzoek mislukt", async () => {
    const bel = vi.fn(async () => {
      throw new Error("geen bereik");
    });
    (globalThis as { fetch?: unknown }).fetch = bel;
    track("dag_geopend", { oncePerDay: true });
    await settle();
    expect(opslag.grootte).toBe(0);

    server({ ok: true, counted: true });
    track("dag_geopend", { oncePerDay: true });
    await settle();
    expect(opslag.grootte).toBe(1);
  });

  it("stuurt niet twee keer terwijl het eerste verzoek nog loopt", async () => {
    // Zonder deze rem levert tweemaal openen in dezelfde seconde twee tellingen
    // op, want de eerste is nog niet bevestigd.
    let los = () => {};
    const bel = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          los = () =>
            resolve({ ok: true, json: async () => ({ counted: true }) } as unknown as Response);
        }),
    );
    (globalThis as { fetch?: unknown }).fetch = bel;

    track("dag_geopend", { oncePerDay: true });
    track("dag_geopend", { oncePerDay: true });
    expect(bel).toHaveBeenCalledTimes(1);

    los();
    await settle();
    expect(opslag.grootte).toBe(1);
  });

  it("laat een gewone telling gewoon gaan, ook twee keer", async () => {
    const bel = server({ ok: true, counted: true });
    track("activiteit_toegevoegd");
    track("activiteit_toegevoegd");
    await settle();
    expect(bel).toHaveBeenCalledTimes(2);
  });
});
