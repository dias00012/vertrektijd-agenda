import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AA_NORMAL, contrastRatio, mixSrgb, parseHex, relativeLuminance } from "./contrast";
import { THEMES } from "./theme";

/**
 * Elke kleur in de app moet leesbaar zijn op elke achtergrond waar hij op kan
 * staan -- in de lichte modus én in de donkere.
 *
 * Deze test leest de echte waarden uit `globals.css` en uit `THEMES`, en niet
 * uit een kopie hier. Een kopie zou precies het verkeerde bewaken: dan kun je
 * een kleur in de CSS te licht maken terwijl de test vrolijk groen blijft.
 *
 * Wat hier eerder misging: het groen van "Op tijd · live" en het oranje van de
 * vertraging stonden als vaste kleurcode in zeven componenten, met één tint
 * voor allebei de modi. Die tint was gekozen voor het donker, dus in de lichte
 * modus kwamen ze op 2,28:1 en 2,80:1 uit. Ook het accent was in vier van de
 * acht thema's te licht als tekst, en de hoofdknop had in het donker witte
 * letters op een lichte kleur: 1,74:1 bij groen.
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/**
 * Een variabele uit `globals.css`. `donker` pakt hem uit het blok voor de
 * donkere modus, dat verderop in het bestand staat en dezelfde namen opnieuw
 * zet; zonder die keuze zou je altijd de lichte waarde terugkrijgen.
 */
function token(naam: string, modus: "licht" | "donker" = "licht"): string {
  const grens = css.indexOf("@media (prefers-color-scheme: dark)");
  const deel = modus === "licht" ? css.slice(0, grens) : css.slice(grens);
  const treffers = [...deel.matchAll(new RegExp(`--${naam}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`, "g"))];
  const laatste = treffers.at(-1);
  if (!laatste) throw new Error(`--${naam} niet gevonden in de ${modus}e modus`);
  return laatste[1];
}

/**
 * Het recept van de meekleurende achtergrond, uit `globals.css` zelf.
 *
 * Eerst stond het percentage hier als getal. Toen bleek bij het muteren dat je
 * de tint in de CSS weer sterk kon zetten zonder dat deze test iets zei: hij
 * rekende gewoon door met zijn eigen kopie. Nu leest hij het recept.
 */
function tintRecepten(): { percent: number; basis: string }[] {
  const patroon =
    /\[data-tint="on"\]\s*\{[^}]*--canvas:\s*color-mix\(\s*in srgb,\s*var\(--accent\)\s*(\d+)%\s*,\s*(#[0-9a-fA-F]{3,6})\s*\)/g;
  const gevonden = [...css.matchAll(patroon)].map((treffer) => ({
    percent: Number(treffer[1]),
    basis: treffer[2],
  }));
  // Eerst licht, dan donker -- de volgorde in het bestand. Klopt dat niet meer,
  // dan valt deze test om in plaats van stilletjes het verkeerde te meten.
  if (gevonden.length !== 2) {
    throw new Error(`Verwacht twee tintrecepten in globals.css, gevonden: ${gevonden.length}`);
  }
  return gevonden;
}

/**
 * De achtergrond die met je thema meekleurt, zoals `globals.css` hem mengt.
 */
function getinteCanvas(thema: (typeof THEMES)[number], modus: "licht" | "donker"): string {
  const { percent, basis } = tintRecepten()[modus === "licht" ? 0 : 1];
  return mixSrgb(modus === "licht" ? thema.light : thema.dark, percent, basis);
}

/**
 * Alle achtergronden waar in deze modus tekst op kan staan.
 *
 * Met `thema` erbij alleen de getinte achtergrond van dát thema. Dat is geen
 * versoepeling maar een correctie: de tint gebruikt altijd hetzelfde accent
 * als de tekst, dus indigo-tekst op een paars getinte achtergrond bestaat
 * niet. Voor de vaste kleuren (inkt, gedempt, waarschuwing) tellen ze wel
 * allemaal mee, want die staan op elk thema.
 */
function achtergronden(
  modus: "licht" | "donker",
  thema?: (typeof THEMES)[number],
): string[] {
  const vast = [token("surface", modus), token("surface-soft", modus), token("canvas", modus)];
  const getint = thema
    ? [getinteCanvas(thema, modus)]
    : THEMES.map((each) => getinteCanvas(each, modus));
  return [...new Set([...vast, ...getint])];
}

/** Het slechtste geval telt: één onleesbare combinatie is er één te veel. */
function slechtste(
  kleur: string,
  modus: "licht" | "donker",
  thema?: (typeof THEMES)[number],
): number {
  return Math.min(...achtergronden(modus, thema).map((bg) => contrastRatio(kleur, bg)));
}

describe("contrastRatio", () => {
  it("geeft 21:1 voor zwart op wit", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("geeft 1:1 voor een kleur op zichzelf", () => {
    expect(contrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 10);
  });

  it("maakt geen verschil welke van de twee de tekst is", () => {
    expect(contrastRatio("#15803d", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#15803d"),
      10,
    );
  });

  it("leest de korte notatie net zo als de lange", () => {
    expect(parseHex("#fff")).toEqual(parseHex("#ffffff"));
    expect(relativeLuminance("#000")).toBe(0);
  });

  it("weigert een kleur die geen kleur is, in plaats van zwart te gokken", () => {
    expect(() => parseHex("blauw")).toThrow(/Geen bruikbare kleurcode/);
    expect(() => parseHex("#12345")).toThrow(/Geen bruikbare kleurcode/);
  });
});

describe("mixSrgb", () => {
  it("geeft bij 100% de eerste kleur en bij 0% de tweede", () => {
    expect(mixSrgb("#ff0000", 100, "#0000ff")).toBe("#ff0000");
    expect(mixSrgb("#ff0000", 0, "#0000ff")).toBe("#0000ff");
  });

  it("mengt per kanaal", () => {
    expect(mixSrgb("#ffffff", 50, "#000000")).toBe("#808080");
  });
});

describe("tekstkleuren in de lichte modus", () => {
  for (const naam of ["ink", "muted", "danger", "ok-light", "warn-light"]) {
    it(`--${naam} haalt ${AA_NORMAL}:1 op elke lichte achtergrond`, () => {
      expect(slechtste(token(naam), "licht")).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }
});

describe("tekstkleuren in de donkere modus", () => {
  for (const naam of ["ink", "muted", "danger", "ok-dark", "warn-dark"]) {
    // De twee statuskleuren staan alleen in het lichte blok gedefinieerd; de
    // donkere modus wijst --ok ernaar toe. Vandaar de lichte lezing.
    const modus = naam.endsWith("-dark") ? "licht" : "donker";
    it(`--${naam} haalt ${AA_NORMAL}:1 op elke donkere achtergrond`, () => {
      expect(slechtste(token(naam, modus), "donker")).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }
});

describe("de accentkleur van elk thema", () => {
  it.each(THEMES.map((thema) => [thema.id, thema] as const))(
    "%s is als tekst leesbaar in de lichte modus",
    (_id, thema) => {
      expect(slechtste(thema.light, "licht", thema)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES.map((thema) => [thema.id, thema] as const))(
    "%s is als tekst leesbaar in de donkere modus",
    (_id, thema) => {
      expect(slechtste(thema.dark, "donker", thema)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  /**
   * De hoofdknop is een vlak in de accentkleur met tekst erop. In het licht is
   * die tekst wit, in het donker donker -- want in het donker is het accent
   * juist de lichte tint.
   */
  it.each(THEMES.map((thema) => [thema.id, thema.light] as const))(
    "%s draagt witte knoptekst in de lichte modus",
    (_id, licht) => {
      expect(contrastRatio("#fff", licht)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES.map((thema) => [thema.id, thema.dark] as const))(
    "%s draagt donkere knoptekst in de donkere modus",
    (_id, donker) => {
      expect(contrastRatio("#0d1117", donker)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );
});
