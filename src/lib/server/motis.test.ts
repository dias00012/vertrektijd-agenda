import { afterEach, describe, expect, it, vi } from "vitest";
import { motisPlan } from "./motis";

/**
 * De herkansing bij een hapering.
 *
 * De OV-dienst is gratis en door een gemeenschap gedraaid; die hikt wel eens.
 * Zonder herkansing kreeg je meteen "de planner is even niet bereikbaar" en
 * moest je zelf opnieuw drukken, voor iets wat een fractie later gewoon werkt.
 *
 * Twee dingen die bewust niet opnieuw geprobeerd worden staan hieronder ook:
 * een tijdslimiet (je stond al twaalf seconden te wachten) en een 429 (dan zegt
 * de dienst zelf dat het te veel wordt).
 */

const ANTWOORD = { itineraries: [{ startTime: "x" }] };

function jsonAntwoord(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Laat `fetch` deze antwoorden geven, op volgorde. */
function serveer(...antwoorden: (() => Response | Promise<Response>)[]) {
  let i = 0;
  const nep = vi.fn(async () => {
    const maker = antwoorden[Math.min(i, antwoorden.length - 1)];
    i += 1;
    return maker();
  });
  vi.stubGlobal("fetch", nep);
  return nep;
}

describe("motisPlan", () => {
  it("probeert het nog één keer als de dienst even niet bereikbaar is", async () => {
    const nep = serveer(
      () => {
        throw new TypeError("network error");
      },
      () => jsonAntwoord(ANTWOORD),
    );

    await expect(motisPlan(new URLSearchParams())).resolves.toMatchObject(ANTWOORD);
    expect(nep).toHaveBeenCalledTimes(2);
  });

  it("probeert het nog één keer bij een 5xx", async () => {
    // Dat is de server die struikelt, niet ons verzoek dat fout is.
    const nep = serveer(
      () => jsonAntwoord({ error: "boem" }, 503),
      () => jsonAntwoord(ANTWOORD),
    );

    await expect(motisPlan(new URLSearchParams())).resolves.toMatchObject(ANTWOORD);
    expect(nep).toHaveBeenCalledTimes(2);
  });

  it("geeft na twee mislukte pogingen alsnog op", async () => {
    // Eindeloos blijven proberen laat de gebruiker wachten op iets dat er niet
    // komt, en belast een dienst die het al zwaar heeft.
    const nep = serveer(() => {
      throw new TypeError("network error");
    });

    await expect(motisPlan(new URLSearchParams())).rejects.toThrow();
    expect(nep).toHaveBeenCalledTimes(2);
  });

  it("klopt niet nog eens aan bij een 429", async () => {
    /*
     * Dan zegt de dienst zelf dat het te veel wordt. Nog eens proberen is
     * precies het verkeerde, en het is ook nog eens onbeleefd tegen een
     * gratis dienst.
     */
    const nep = serveer(() => jsonAntwoord({ error: "rustig aan" }, 429));

    await expect(motisPlan(new URLSearchParams())).rejects.toThrow();
    expect(nep).toHaveBeenCalledTimes(1);
  });

  it("doet geen herkansing wanneer het meteen goed gaat", async () => {
    const nep = serveer(() => jsonAntwoord(ANTWOORD));
    await motisPlan(new URLSearchParams());
    expect(nep).toHaveBeenCalledTimes(1);
  });
});
