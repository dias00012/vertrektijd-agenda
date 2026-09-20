import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  applyTheme,
  applyTint,
  findTheme,
  storedTheme,
  storedTint,
} from "./theme";

/**
 * De accentkleur van de app.
 *
 * De hele interface gebruikt één variabele, dus een fout hier kleurt alles
 * verkeerd of laat het thema helemaal vallen. Dat de kleuren zelf leesbaar
 * zijn wordt in `contrast.test.ts` nagerekend; hier gaat het om de tabel en
 * om wat er gebeurt als de opslag niet meewerkt.
 */

const opslag = new Map<string, string>();

function browser(opties: { waarden?: Record<string, string>; kapot?: boolean } = {}) {
  opslag.clear();
  for (const [k, v] of Object.entries(opties.waarden ?? {})) opslag.set(k, v);

  const root = {
    style: { gezet: {} as Record<string, string>, setProperty(naam: string, waarde: string) {
      this.gezet[naam] = waarde;
    } },
    dataset: {} as Record<string, string>,
  };
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", {
    localStorage: opties.kapot
      ? {
          getItem: () => {
            throw new Error("privémodus");
          },
        }
      : {
          getItem: (k: string) => opslag.get(k) ?? null,
          setItem: (k: string, v: string) => void opslag.set(k, v),
        },
  });
  return root;
}

afterEach(() => vi.unstubAllGlobals());

describe("THEMES", () => {
  it("heeft voor elk thema twee tinten en een eigen id", () => {
    const ids = THEMES.map((thema) => thema.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const thema of THEMES) {
      expect(thema.light, thema.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(thema.dark, thema.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(thema.light).not.toBe(thema.dark);
    }
  });

  it("begint met het standaardthema", () => {
    expect(THEMES[0].id).toBe(DEFAULT_THEME);
  });

  it("verwijst voor elke naam naar een sleutel in het woordenboek", () => {
    for (const thema of THEMES) {
      expect(thema.nameKey, thema.id).toMatch(/^theme\./);
    }
  });
});

describe("findTheme", () => {
  it("vindt een thema op id", () => {
    expect(findTheme("green").id).toBe("green");
  });

  /** Raden is hier beter dan stukgaan: een onbekend id hoort blauw te geven. */
  it("valt terug op het eerste thema bij iets onbekends", () => {
    expect(findTheme("paars-met-stippen").id).toBe(DEFAULT_THEME);
    expect(findTheme(null).id).toBe(DEFAULT_THEME);
    expect(findTheme(undefined).id).toBe(DEFAULT_THEME);
  });
});

describe("applyTheme", () => {
  it("zet allebei de tinten, zodat de CSS zelf kan kiezen", () => {
    const root = browser();
    applyTheme("green");

    const groen = findTheme("green");
    expect(root.style.gezet["--accent-light"]).toBe(groen.light);
    expect(root.style.gezet["--accent-dark"]).toBe(groen.dark);
    expect(root.dataset.theme).toBe("green");
  });

  it("zet blauw bij een onbekend thema in plaats van niets", () => {
    const root = browser();
    applyTheme("bestaat-niet");

    expect(root.dataset.theme).toBe(DEFAULT_THEME);
  });
});

describe("applyTint", () => {
  it("zet de tint aan of uit op het document", () => {
    const root = browser();

    applyTint(true);
    expect(root.dataset.tint).toBe("on");

    applyTint(false);
    expect(root.dataset.tint).toBe("off");
  });
});

describe("storedTheme en storedTint", () => {
  it("geeft terug wat er bewaard is", () => {
    browser({ waarden: { "agenda.theme.v1": "teal", "agenda.themeTint.v1": "off" } });

    expect(storedTheme()).toBe("teal");
    expect(storedTint()).toBe(false);
  });

  it("heeft de tint standaard aan, want dat is het punt van een kleur kiezen", () => {
    browser();
    expect(storedTint()).toBe(true);
  });

  it("valt terug op blauw als er niets bewaard is", () => {
    browser();
    expect(storedTheme()).toBe(DEFAULT_THEME);
  });

  it("valt terug als de opslag op slot zit", () => {
    browser({ kapot: true });

    expect(storedTheme()).toBe(DEFAULT_THEME);
    expect(storedTint()).toBe(true);
  });
});
