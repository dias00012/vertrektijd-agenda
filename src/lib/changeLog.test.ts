import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearChanges, loadChanges, saveChanges } from "./changeLog";
import type { DayChange } from "./timetableChanges";

/**
 * De laatst gevonden roosterwijzigingen, tot je ze wegklikt.
 *
 * Bewust in localStorage en niet in de agenda-instellingen: dit is een
 * mededeling, geen instelling, en hij hoort niet mee te synchroniseren naar je
 * andere apparaten -- daar heb je hem misschien al gezien.
 */

/**
 * De tests draaien in node, zonder browser: `vitest.config.mts` staat bewust
 * op `environment: "node"`, want jsdom erbij halen om één Map na te doen is
 * duurder dan die Map zelf. Dit is precies wat `changeLog` van een browser
 * gebruikt, niet meer.
 */
const opslag = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => opslag.get(k) ?? null,
    setItem: (k: string, v: string) => void opslag.set(k, v),
    removeItem: (k: string) => void opslag.delete(k),
    clear: () => opslag.clear(),
  },
  dispatchEvent: () => true,
  CustomEvent: class {
    constructor(public type: string) {}
  },
});
vi.stubGlobal(
  "CustomEvent",
  class {
    constructor(public type: string) {}
  },
);

const SLEUTEL = "agenda.roosterwijzigingen.v1";

function wijziging(dag = "2026-09-17"): DayChange {
  return { date: dag, added: [], removed: [], moved: [] } as unknown as DayChange;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("saveChanges en loadChanges", () => {
  it("bewaart wat er gevonden is en geeft het terug", () => {
    saveChanges([wijziging()]);

    const log = loadChanges();
    expect(log?.changes).toHaveLength(1);
    expect(Number.isFinite(Date.parse(log!.foundAt))).toBe(true);
  });

  it("bewaart niets als er niets gevonden is", () => {
    saveChanges([]);

    expect(window.localStorage.getItem(SLEUTEL)).toBeNull();
    expect(loadChanges()).toBeNull();
  });

  it("geeft niets terug als er nog nooit iets bewaard is", () => {
    expect(loadChanges()).toBeNull();
  });

  it("vergeet een melding die ouder is dan drie dagen", () => {
    vi.useFakeTimers();
    saveChanges([wijziging()]);

    vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000 - 1000);
    expect(loadChanges()).not.toBeNull();

    vi.advanceTimersByTime(2000);
    expect(loadChanges()).toBeNull();
  });

  /**
   * Hier zat een gat: `Date.parse` geeft NaN bij onzin, en
   * `Date.now() - NaN > MAX_AGE` is false. De melding gold dus als vers en
   * bleef staan tot je hem met de hand wegklikte.
   */
  it("gooit een melding met een onleesbare datum weg in plaats van hem te bewaren", () => {
    window.localStorage.setItem(
      SLEUTEL,
      JSON.stringify({ foundAt: "geen datum", changes: [wijziging()] }),
    );

    expect(loadChanges()).toBeNull();
  });

  it("laat zich niet omver blazen door onleesbare inhoud", () => {
    window.localStorage.setItem(SLEUTEL, "{geen json");
    expect(loadChanges()).toBeNull();
  });

  it("geeft niets terug als er wel iets staat maar zonder wijzigingen", () => {
    window.localStorage.setItem(
      SLEUTEL,
      JSON.stringify({ foundAt: new Date().toISOString(), changes: [] }),
    );

    expect(loadChanges()).toBeNull();
  });

  it("geeft niets terug als `changes` geen lijst is", () => {
    window.localStorage.setItem(
      SLEUTEL,
      JSON.stringify({ foundAt: new Date().toISOString(), changes: "kapot" }),
    );

    expect(loadChanges()).toBeNull();
  });
});

describe("clearChanges", () => {
  it("haalt de melding weg", () => {
    saveChanges([wijziging()]);
    clearChanges();

    expect(loadChanges()).toBeNull();
  });

  it("klaagt niet als er niets weg te halen valt", () => {
    expect(() => clearChanges()).not.toThrow();
  });
});
