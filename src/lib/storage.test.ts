import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadActivities,
  loadDeletions,
  loadExams,
  loadOwner,
  loadSettings,
  loadTasks,
  saveActivities,
  saveDeletions,
  saveOwner,
  saveSettings,
} from "./storage";

/**
 * Alles wat je in deze app bezit gaat hier doorheen: je agenda, je opdrachten,
 * je thuisadres. Er stond geen enkele test op. Een fout hier is geen verkeerde
 * reistijd maar kwijtgeraakte gegevens -- en die merk je pas als ze weg zijn.
 *
 * De opslag zelf wordt nagebootst, want deze tests draaien zonder browser.
 */

function nepOpslag(overrides: Partial<Storage> = {}) {
  const inhoud = new Map<string, string>();
  return {
    getItem: (key: string) => inhoud.get(key) ?? null,
    setItem: (key: string, value: string) => void inhoud.set(key, value),
    removeItem: (key: string) => void inhoud.delete(key),
    clear: () => inhoud.clear(),
    key: () => null,
    length: 0,
    ...overrides,
  } as unknown as Storage;
}

function zetOpslag(opslag: Storage | null) {
  if (opslag === null) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: opslag },
    configurable: true,
    writable: true,
  });
}

let opslag: Storage;

beforeEach(() => {
  opslag = nepOpslag();
  zetOpslag(opslag);
  // De code waarschuwt bewust bij kapotte gegevens; dat hoeft hier niet mee
  // te schreeuwen. Dát er gewaarschuwd wordt, toetsen we apart.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  zetOpslag(null);
  vi.restoreAllMocks();
});

describe("zonder browser", () => {
  it("geeft lege waarden terug in plaats van om te vallen", () => {
    // Dit draait op de server, bij het eerste renderen. Daar is geen opslag.
    zetOpslag(null);
    expect(loadActivities()).toEqual([]);
    expect(loadTasks()).toEqual([]);
    expect(loadExams()).toEqual([]);
    expect(loadDeletions()).toEqual([]);
    expect(loadOwner()).toBeNull();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("doet alsof opslaan lukte, want er valt niets te bewaren", () => {
    zetOpslag(null);
    expect(saveActivities([])).toBe(true);
  });
});

describe("kapotte of vreemde gegevens", () => {
  it("valt niet om over onleesbare JSON", () => {
    // Dit is niet denkbeeldig: een afgebroken schrijfactie laat half werk na.
    opslag.setItem("agenda.activities.v1", "{dit is geen json");
    expect(loadActivities()).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("valt niet om als er iets anders dan een lijst staat", () => {
    opslag.setItem("agenda.activities.v1", JSON.stringify({ niet: "een lijst" }));
    expect(loadActivities()).toEqual([]);
    opslag.setItem("agenda.tasks.v1", JSON.stringify("tekst"));
    expect(loadTasks()).toEqual([]);
    opslag.setItem("agenda.exams.v1", JSON.stringify(42));
    expect(loadExams()).toEqual([]);
  });

  it("gooit losse rommel uit de lijst en houdt de rest", () => {
    /*
     * Zonder deze zeef sloopte één activiteit met onzin erin de hele agenda:
     * geen dagoverzicht, geen instellingen, alleen nog het foutscherm. En dat
     * bleef zo bij elke keer openen, want de rommel staat in de opslag.
     */
    opslag.setItem(
      "agenda.activities.v1",
      JSON.stringify([null, "tekst", 7, { id: "a", title: "Werken" }]),
    );
    const uit = loadActivities();
    expect(uit).toHaveLength(1);
    expect(uit[0].title).toBe("Werken");
  });

  it("weigert een eigenaar die geen bruikbare tekst is", () => {
    // Deze sleutel bepaalt of de cloud of dit apparaat de waarheid is. Een
    // lege waarde mag daarbij nooit als "iemand" tellen.
    opslag.setItem("agenda.owner.v1", JSON.stringify(""));
    expect(loadOwner()).toBeNull();
    opslag.setItem("agenda.owner.v1", JSON.stringify(123));
    expect(loadOwner()).toBeNull();
  });

  it("houdt alleen verwijderingen over die compleet zijn", () => {
    // Een halve verwijdering laat bij het samenvoegen iets terugkomen dat je
    // had weggegooid, of gooit iets weg dat moest blijven.
    opslag.setItem(
      "agenda.deletions.v1",
      JSON.stringify([
        { id: "a", at: "2026-09-01T00:00:00.000Z" },
        { id: "b" },
        { at: "2026-09-01T00:00:00.000Z" },
        null,
      ]),
    );
    expect(loadDeletions()).toEqual([{ id: "a", at: "2026-09-01T00:00:00.000Z" }]);
  });
});

describe("instellingen uit een oudere versie", () => {
  it("vult ontbrekende velden aan met de standaard", () => {
    // Zo ziet een opslag eruit van iemand die de app een half jaar niet opende.
    opslag.setItem("agenda.settings.v1", JSON.stringify({ bufferMinutes: 15 }));
    const uit = loadSettings();

    expect(uit.bufferMinutes).toBe(15);
    expect(uit.savedPlaces).toEqual([]);
    expect(uit.customCategories).toEqual([]);
    expect(uit.categoryOverrides).toEqual({});
    expect(uit.travelMode).toBe(DEFAULT_SETTINGS.travelMode);
  });

  it("negeert een onzinnige marge", () => {
    for (const onzin of ["tien", -5, null]) {
      opslag.setItem("agenda.settings.v1", JSON.stringify({ bufferMinutes: onzin }));
      expect(loadSettings().bufferMinutes).toBe(DEFAULT_SETTINGS.bufferMinutes);
    }
  });

  it("laat een marge van nul staan", () => {
    // Nul is een keuze ("ik reken geen marge"), geen ontbrekende waarde.
    opslag.setItem("agenda.settings.v1", JSON.stringify({ bufferMinutes: 0 }));
    expect(loadSettings().bufferMinutes).toBe(0);
  });

  it("houdt alleen agenda-abonnementen over die een id en een adres hebben", () => {
    opslag.setItem(
      "agenda.settings.v1",
      JSON.stringify({
        calendars: [{ id: "x", url: "https://voorbeeld.test/x.ics" }, { id: "y" }, null],
      }),
    );
    expect(loadSettings().calendars).toHaveLength(1);
  });

  it("maakt van een lijst die geen lijst is alsnog een lege lijst", () => {
    opslag.setItem("agenda.settings.v1", JSON.stringify({ savedPlaces: "thuis" }));
    expect(loadSettings().savedPlaces).toEqual([]);
  });
});

describe("volle of geblokkeerde opslag", () => {
  it("meldt eerlijk dat opslaan mislukte", () => {
    /*
     * Dit is geen luxe. Mislukte het stil, dan dacht de app dat het bewaard
     * was en was een avond invoeren na één keer herladen weg. Nu kan de app
     * er iets over zeggen.
     */
    zetOpslag(
      nepOpslag({
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      }),
    );

    expect(saveActivities([])).toBe(false);
    expect(saveSettings(DEFAULT_SETTINGS)).toBe(false);
    expect(saveDeletions([])).toBe(false);
    expect(saveOwner("iemand")).toBe(false);
  });
});

describe("heen en weer", () => {
  it("leest terug wat er is weggeschreven", () => {
    expect(saveOwner("gebruiker-1")).toBe(true);
    expect(loadOwner()).toBe("gebruiker-1");

    const weg = [{ id: "a", at: "2026-09-01T00:00:00.000Z" }];
    expect(saveDeletions(weg)).toBe(true);
    expect(loadDeletions()).toEqual(weg);

    expect(saveSettings({ ...DEFAULT_SETTINGS, bufferMinutes: 20 })).toBe(true);
    expect(loadSettings().bufferMinutes).toBe(20);
  });
});
