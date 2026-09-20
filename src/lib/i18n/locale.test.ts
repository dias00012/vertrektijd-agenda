import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANGUAGES, detectLanguage, getLanguage, setLanguage } from "./locale";

/**
 * Welke taal er actief is, en hoe de app die de eerste keer kiest.
 *
 * Nederlands is het startpunt, ook op de server: zo is de eerste weergave aan
 * beide kanten gelijk en springt het scherm niet om zodra de browser het
 * overneemt.
 */

const opslag = new Map<string, string>();

function browser(opties: { opgeslagen?: string; talen?: string[] } = {}) {
  opslag.clear();
  if (opties.opgeslagen) opslag.set("agenda.language.v1", opties.opgeslagen);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => opslag.get(k) ?? null,
      setItem: (k: string, v: string) => void opslag.set(k, v),
      removeItem: (k: string) => void opslag.delete(k),
    },
  });
  vi.stubGlobal("navigator", { languages: opties.talen, language: opties.talen?.[0] });
}

beforeEach(() => setLanguage("nl"));
afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage("nl");
});

describe("getLanguage en setLanguage", () => {
  it("begint op Nederlands", () => {
    expect(getLanguage()).toBe("nl");
  });

  it("onthoudt wat je zet", () => {
    setLanguage("en");
    expect(getLanguage()).toBe("en");
  });
});

describe("LANGUAGES", () => {
  it("kent precies de twee talen die het woordenboek heeft", () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(["nl", "en"]);
  });

  it("geeft elke taal een naam en een vlag", () => {
    for (const taal of LANGUAGES) {
      expect(taal.label.length).toBeGreaterThan(0);
      expect(taal.flag.length).toBeGreaterThan(0);
    }
  });
});

describe("detectLanguage", () => {
  it("kiest Nederlands op de server, waar geen browser is", () => {
    vi.stubGlobal("window", undefined);
    expect(detectLanguage()).toBe("nl");
  });

  it("volgt de keuze die je eerder maakte", () => {
    browser({ opgeslagen: "en", talen: ["nl-NL"] });
    expect(detectLanguage()).toBe("en");
  });

  it("negeert een opgeslagen keuze die geen taal is", () => {
    browser({ opgeslagen: "klingon", talen: ["en-US"] });
    expect(detectLanguage()).toBe("en");
  });

  it("valt terug op de taal van de browser", () => {
    browser({ talen: ["en-GB", "nl"] });
    expect(detectLanguage()).toBe("en");
  });

  it("pakt de eerste taal die de app kent", () => {
    browser({ talen: ["de-DE", "fr", "nl-NL"] });
    expect(detectLanguage()).toBe("nl");
  });

  it("kiest Nederlands als de browser alleen talen noemt die we niet hebben", () => {
    browser({ talen: ["de", "fr"] });
    expect(detectLanguage()).toBe("nl");
  });

  it("redt zich als `navigator.languages` ontbreekt", () => {
    browser({ talen: undefined });
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(detectLanguage()).toBe("en");
  });

  it("kiest Nederlands als de opslag op slot zit", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("privémodus");
        },
      },
    });
    vi.stubGlobal("navigator", { languages: ["nl-NL"] });

    expect(detectLanguage()).toBe("nl");
  });
});
