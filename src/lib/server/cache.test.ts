import { afterEach, describe, expect, it, vi } from "vitest";
import { createCache, MAX_ENTRIES } from "./cache";

/**
 * De cache die de app voor de geocoder en de routeplanner gebruikt.
 *
 * Er zaten twee dingen in die pas opvallen als hij vol zit, en dat duurt bij
 * vijfhonderd regels even -- maar bij een app met meer dan één gebruiker komt
 * dat moment.
 */

afterEach(() => vi.useRealTimers());

describe("createCache", () => {
  it("geeft terug wat je erin stopt", () => {
    const cache = createCache();
    cache.set("a", { label: "Thuis" }, 60_000);

    expect(cache.get("a")).toEqual({ label: "Thuis" });
  });

  it("weet niets van een sleutel die er niet is", () => {
    expect(createCache().get("weg")).toBeUndefined();
  });

  it("vergeet een regel zodra die verlopen is", () => {
    vi.useFakeTimers();
    const cache = createCache();
    cache.set("a", 1, 1000);

    vi.advanceTimersByTime(999);
    expect(cache.get("a")).toBe(1);

    vi.advanceTimersByTime(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("gooit de oudste eruit zodra hij vol is", () => {
    const cache = createCache(3);
    cache.set("a", 1, 60_000);
    cache.set("b", 2, 60_000);
    cache.set("c", 3, 60_000);
    cache.set("d", 4, 60_000);

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("d")).toBe(4);
    expect(cache.size).toBe(3);
  });

  /**
   * De fout die hierachter zat: een Map onthoudt de volgorde van toevoegen, en
   * `set` op een bestaande sleutel verandert die niet. "Thuis naar school"
   * wordt tien keer per dag opgehaald en bleef toch op zijn plek van de eerste
   * keer staan -- dus vloog juist die er als eerste uit.
   */
  it("zet een sleutel die je opnieuw schrijft achteraan, niet vooraan", () => {
    const cache = createCache(3);
    cache.set("a", 1, 60_000);
    cache.set("b", 2, 60_000);
    cache.set("c", 3, 60_000);

    cache.set("a", 99, 60_000);
    cache.set("d", 4, 60_000);

    expect(cache.get("a"), "opnieuw geschreven, dus niet de oudste").toBe(99);
    expect(cache.get("b"), "b was daarna de oudste").toBeUndefined();
  });

  /**
   * Het scherpste geval, en het enige dat het verschil laat zien: een sleutel
   * in het midden herschrijven. Ging dat zonder hem eerst weg te halen, dan
   * zat de cache nog vol en vloog er een onschuldige regel uit -- terwijl er
   * niets bij kwam.
   *
   * Met de oudste sleutel valt dat niet op: die gooit dan precies zichzelf
   * weg en komt er meteen weer in. Dat zag ik pas bij het muteren.
   */
  it("gooit niets weg als je een bestaande sleutel herschrijft", () => {
    const cache = createCache(3);
    cache.set("a", 1, 60_000);
    cache.set("b", 2, 60_000);
    cache.set("c", 3, 60_000);

    cache.set("b", 22, 60_000);

    expect(cache.size, "er kwam niets bij, dus hoeft er niets uit").toBe(3);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(22);
    expect(cache.get("c")).toBe(3);
  });

  /**
   * En de tweede: verlopen regels tellen wel mee voor de grens. Een cache vol
   * oude regels gooide er een verse uit terwijl er niets levends in stond.
   */
  it("ruimt verlopen regels op voordat hij iets levends weggooit", () => {
    vi.useFakeTimers();
    const cache = createCache(3);
    cache.set("oud1", 1, 1000);
    cache.set("oud2", 2, 1000);

    vi.advanceTimersByTime(2000);
    cache.set("vers", 3, 60_000);
    cache.set("ook vers", 4, 60_000);

    expect(cache.get("vers")).toBe(3);
    expect(cache.get("ook vers")).toBe(4);
    expect(cache.size).toBe(2);
  });

  it("houdt vijfhonderd regels aan als je niets opgeeft", () => {
    expect(MAX_ENTRIES).toBe(500);
    const cache = createCache();
    for (let i = 0; i < MAX_ENTRIES + 10; i += 1) cache.set(`k${i}`, i, 60_000);

    expect(cache.size).toBe(MAX_ENTRIES);
    expect(cache.get("k0")).toBeUndefined();
    expect(cache.get(`k${MAX_ENTRIES + 9}`)).toBe(MAX_ENTRIES + 9);
  });

  it("houdt twee caches uit elkaar", () => {
    const een = createCache();
    const twee = createCache();
    een.set("a", 1, 60_000);

    expect(twee.get("a")).toBeUndefined();
  });
});
