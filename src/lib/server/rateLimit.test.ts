import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, enforceRateLimit, LIMITS } from "./rateLimit";

/**
 * De verkeersdrempel had geen enkele test, terwijl hij het enige is dat
 * voorkomt dat één script de gratis OV- en adresdiensten voor iedereen laat
 * blokkeren. Bij de beveiligingsronde heb ik hem gelezen en goed bevonden,
 * maar gelezen is niet getest: een volgende wijziging kan hem stil kapotmaken.
 *
 * De teller staat op moduleniveau en blijft dus staan tussen tests door.
 * Daarom krijgt elke test zijn eigen sleutel -- anders leunt de een op de rest
 * van de ander, en dan zegt een groene test niets.
 */

let teller = 0;
const verseSleutel = () => `test-${Date.now()}-${(teller += 1)}`;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("laat er precies zoveel door als de grens zegt", () => {
    const sleutel = verseSleutel();
    const regel = { limit: 3, windowMs: 60_000 };

    expect(checkRateLimit(sleutel, regel).ok).toBe(true);
    expect(checkRateLimit(sleutel, regel).ok).toBe(true);
    expect(checkRateLimit(sleutel, regel).ok).toBe(true);
    // De vierde niet meer.
    expect(checkRateLimit(sleutel, regel).ok).toBe(false);
  });

  it("telt af hoeveel er nog mag", () => {
    const sleutel = verseSleutel();
    const regel = { limit: 3, windowMs: 60_000 };

    expect(checkRateLimit(sleutel, regel).remaining).toBe(2);
    expect(checkRateLimit(sleutel, regel).remaining).toBe(1);
    expect(checkRateLimit(sleutel, regel).remaining).toBe(0);
    expect(checkRateLimit(sleutel, regel).remaining).toBe(0);
  });

  it("zegt hoeveel seconden je moet wachten", () => {
    const sleutel = verseSleutel();
    const regel = { limit: 1, windowMs: 60_000 };

    checkRateLimit(sleutel, regel);
    vi.advanceTimersByTime(20_000);

    const geweigerd = checkRateLimit(sleutel, regel);
    expect(geweigerd.ok).toBe(false);
    // Nog 40 van de 60 seconden te gaan.
    expect(geweigerd.retryAfter).toBe(40);
  });

  it("wacht nooit met nul seconden, ook niet vlak voor het einde", () => {
    /*
     * Een `Retry-After: 0` is een uitnodiging om meteen opnieuw te hameren.
     *
     * Eerlijk erbij: dit is dubbel dichtgezet. Zodra het venster om is wordt
     * er een nieuw venster gemaakt, dus het verschil is hier nooit nul en de
     * `Math.max(1, ...)` in de code komt nooit aan bod. Haal je die weg, dan
     * valt deze test niet om -- nagelopen. Hij legt de eigenschap vast, niet
     * die ene regel.
     */
    const sleutel = verseSleutel();
    const regel = { limit: 1, windowMs: 60_000 };

    checkRateLimit(sleutel, regel);
    vi.advanceTimersByTime(59_999);

    expect(checkRateLimit(sleutel, regel).retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("begint opnieuw zodra het venster voorbij is", () => {
    const sleutel = verseSleutel();
    const regel = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(sleutel, regel).ok).toBe(true);
    expect(checkRateLimit(sleutel, regel).ok).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit(sleutel, regel).ok).toBe(true);
  });

  it("houdt bezoekers uit elkaar", () => {
    // Anders zet één druk iemand de hele app op slot voor de rest.
    const een = verseSleutel();
    const ander = verseSleutel();
    const regel = { limit: 1, windowMs: 60_000 };

    checkRateLimit(een, regel);
    expect(checkRateLimit(een, regel).ok).toBe(false);
    expect(checkRateLimit(ander, regel).ok).toBe(true);
  });

  it("houdt de routes uit elkaar, ook bij dezelfde bezoeker", () => {
    // De sleutel bevat de route; zoeken mag je opmaken zonder je reisplanner
    // te verspelen.
    const ip = verseSleutel();
    const regel = { limit: 1, windowMs: 60_000 };

    checkRateLimit(`geocode:${ip}`, regel);
    expect(checkRateLimit(`geocode:${ip}`, regel).ok).toBe(false);
    expect(checkRateLimit(`travel:${ip}`, regel).ok).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  const verzoek = (ip: string) =>
    new Request("https://voorbeeld.test/api/geocode", { headers: { "x-real-ip": ip } });

  it("laat door met niets: geen antwoord betekent gewoon doorgaan", () => {
    expect(enforceRateLimit(verzoek(verseSleutel()), "geocode")).toBeNull();
  });

  it("geeft een 429 met Retry-After zodra het te veel wordt", async () => {
    const ip = verseSleutel();
    for (let i = 0; i < LIMITS.geocode.limit; i += 1) {
      expect(enforceRateLimit(verzoek(ip), "geocode")).toBeNull();
    }

    const antwoord = enforceRateLimit(verzoek(ip), "geocode");
    expect(antwoord).not.toBeNull();
    expect(antwoord?.status).toBe(429);
    // Zonder deze kopregel weet een nette client niet wanneer hij terug mag.
    expect(Number(antwoord?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("de grenzen staan ruim boven normaal gebruik", () => {
    // Niet de exacte getallen vastleggen -- wel dat niemand er per ongeluk
    // iets neerzet waar een gewone gebruiker tegenaan loopt.
    for (const [naam, regel] of Object.entries(LIMITS)) {
      expect(regel.limit, naam).toBeGreaterThanOrEqual(10);
      expect(regel.windowMs, naam).toBeGreaterThanOrEqual(60_000);
    }
  });
});
