import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJourneys, fetchTravel, headers, searchLocations } from "./api";
import { setLanguage } from "./i18n/locale";
import type { GeoLocation } from "./types";

/**
 * Alles wat de browser aan de server vraagt gaat hier doorheen, en er stond
 * geen enkele test op. Wat hier misgaat is zelden spectaculair maar wel
 * vervelend: een foutmelding die niet goed wordt uitgelezen, en dan staat er
 * "[object Object]" op de plek waar je vertrektijd hoort.
 */

const HIER: GeoLocation = { label: "Hier", lat: 52.37, lon: 5.21 };
const DAAR: GeoLocation = { label: "Daar", lat: 52.5, lon: 6.09 };

/** Een antwoord van de server, zoals `fetch` het teruggeeft. */
function antwoord(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

let gedaan: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  gedaan = [];
  setLanguage("nl");
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage("nl");
});

/** Laat `fetch` dit antwoord geven, en onthoudt wat er gevraagd is. */
function serveer(maker: () => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      gedaan.push({ url, init });
      return maker();
    }),
  );
}

describe("headers", () => {
  it("stuurt de gekozen taal mee", () => {
    // Anders komen foutmeldingen van de server in een andere taal terug dan
    // de rest van het scherm.
    setLanguage("en");
    expect(headers()["X-Language"]).toBe("en");
  });

  it("laat meegegeven kopregels staan", () => {
    expect(headers({ "Content-Type": "application/json" })).toMatchObject({
      "Content-Type": "application/json",
      "X-Language": "nl",
    });
  });
});

describe("zonder verbinding", () => {
  it("geeft een leesbare melding in plaats van die van de browser", async () => {
    /*
     * Zonder dit stond er "Failed to fetch" op het scherm -- in het Engels, en
     * precies op de plek waar je vertrektijd hoort te staan.
     */
    serveer(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(fetchTravel(HIER, DAAR, { mode: "transit" })).rejects.toThrow(/Geen verbinding/);
  });

  it("laat een afgebroken aanvraag zijn eigen fout houden", async () => {
    /*
     * Een zoekopdracht die je overtypt breekt de vorige af. Dat is geen
     * storing, en de aanroeper herkent hem aan de naam -- maakten we daar een
     * gewone fout van, dan knipperde er een rode melding bij elke toetsaanslag.
     */
    serveer(() => {
      throw new DOMException("afgebroken", "AbortError");
    });

    await expect(searchLocations("almere")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("foutmeldingen van de server", () => {
  it("toont wat de server zegt", async () => {
    serveer(() => antwoord({ error: "Dit adres wijst naar een intern netwerk." }, { status: 400 }));
    await expect(searchLocations("iets")).rejects.toThrow(
      "Dit adres wijst naar een intern netwerk.",
    );
  });

  it("valt terug op een eigen tekst als de server niets zinnigs zegt", async () => {
    // Een 502 van een tussenliggende server geeft vaak HTML terug. Dan hoort
    // er geen brok HTML op het scherm te komen.
    serveer(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    await expect(fetchTravel(HIER, DAAR, { mode: "car" })).rejects.toThrow(
      /reistijd kon niet worden berekend/,
    );
  });

  it("valt ook terug als het antwoord wel JSON is maar geen fout bevat", async () => {
    serveer(() => antwoord({ iets: "anders" }, { status: 500 }));
    await expect(fetchJourneys(HIER, DAAR)).rejects.toThrow(/reis/i);
  });
});

describe("wat er naar de server gaat", () => {
  it("stuurt van, naar en de opties als JSON mee", async () => {
    serveer(() =>
      antwoord({ durationMinutes: 47, distanceKm: 74, provider: "t", mode: "transit" }),
    );
    await fetchTravel(HIER, DAAR, { mode: "transit", arriveBy: "2026-09-18T07:00:00.000Z" });

    expect(gedaan[0].url).toBe("/api/travel");
    expect(gedaan[0].init?.method).toBe("POST");
    expect(JSON.parse(String(gedaan[0].init?.body))).toMatchObject({
      from: HIER,
      to: DAAR,
      mode: "transit",
      arriveBy: "2026-09-18T07:00:00.000Z",
    });
  });

  it("zet de zoekopdracht veilig in de URL", async () => {
    // Een adres met een spatie of een ampersand mag de rest van de vraag niet
    // omgooien.
    serveer(() => antwoord({ results: [] }));
    await searchLocations("Kerkstraat 1 & 2");
    expect(gedaan[0].url).toContain(encodeURIComponent("Kerkstraat 1 & 2"));
  });

  it("vraagt alleen om haltes wanneer dat gevraagd is", async () => {
    serveer(() => antwoord({ results: [] }));
    await searchLocations("almere");
    expect(gedaan[0].url).not.toContain("stops=1");

    await searchLocations("almere", undefined, true);
    expect(gedaan[1].url).toContain("stops=1");
  });
});

describe("wat er terugkomt", () => {
  it("geeft een lege lijst als er geen resultaten in staan", async () => {
    // Niet omvallen op een antwoord zonder `results`: dan zou één vreemd
    // antwoord het hele zoekveld stukmaken.
    serveer(() => antwoord({}));
    expect(await searchLocations("niets")).toEqual([]);
  });

  it("geeft de reis door zoals hij binnenkomt", async () => {
    serveer(() => antwoord({ journeys: [{ id: "a" }], nextCursor: "verder" }));
    const uit = await fetchJourneys(HIER, DAAR);
    expect(uit.journeys).toHaveLength(1);
    expect(uit.nextCursor).toBe("verder");
  });
});
