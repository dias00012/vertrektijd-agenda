import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Het installatiebestand van de app.
 *
 * Android leest dit bij de installatieprompt, en een verkeerde maat of een
 * ontbrekend bestand laat die prompt stil mislukken -- je krijgt dan gewoon de
 * kale versie zonder dat iets zegt waarom. Vandaar dat hier ook echt op schijf
 * gekeken wordt en niet alleen naar wat het bestand beweert.
 */

interface Manifest {
  id?: string;
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  lang?: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
  screenshots?: {
    src: string;
    sizes: string;
    type: string;
    form_factor?: string;
    label?: string;
  }[];
  shortcuts?: { name: string; url: string; icons?: { src: string }[] }[];
}

const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"),
) as Manifest;

/** De maten uit de PNG zelf: breedte en hoogte staan op byte 16 tot 24. */
function afmeting(pad: string): string {
  const bytes = readFileSync(new URL(`../../public${pad}`, import.meta.url));
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

function bestaat(pad: string): boolean {
  try {
    return statSync(new URL(`../../public${pad}`, import.meta.url)).size > 0;
  } catch {
    return false;
  }
}

describe("het manifest", () => {
  it("heeft de velden die een installatie nodig heeft", () => {
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  /**
   * Zonder `id` bepaalt de browser er zelf een uit `start_url`. Verandert die
   * ooit, dan geldt de app daarna als een andere app en verliest iedereen zijn
   * installatie.
   */
  it("heeft een vaste id", () => {
    expect(manifest.id).toBe("/");
  });

  it("wijst naar iconen die er echt zijn, met de maat die ze echt hebben", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icoon of manifest.icons) {
      expect(bestaat(icoon.src), icoon.src).toBe(true);
      if (icoon.type === "image/png") {
        expect(afmeting(icoon.src), icoon.src).toBe(icoon.sizes);
      }
    }
  });

  it("heeft een maskeerbaar icoon, anders staat het rond icoon in een vierkant", () => {
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
});

describe("de schermafdrukken", () => {
  it("staan erin", () => {
    expect(manifest.screenshots?.length ?? 0).toBeGreaterThan(0);
  });

  it("bestaan, en hun maat klopt met het bestand", () => {
    for (const afbeelding of manifest.screenshots ?? []) {
      expect(bestaat(afbeelding.src), afbeelding.src).toBe(true);
      expect(afmeting(afbeelding.src), afbeelding.src).toBe(afbeelding.sizes);
    }
  });

  /** Android wil er minstens één van allebei; anders valt de rijke prompt weg. */
  it("hebben een smalle en een brede versie", () => {
    const vormen = new Set((manifest.screenshots ?? []).map((s) => s.form_factor));
    expect(vormen.has("narrow")).toBe(true);
    expect(vormen.has("wide")).toBe(true);
  });

  it("hebben allemaal een bijschrift", () => {
    for (const afbeelding of manifest.screenshots ?? []) {
      expect(afbeelding.label?.length ?? 0, afbeelding.src).toBeGreaterThan(0);
    }
  });
});

describe("de snelkoppelingen", () => {
  it("wijzen naar schermen die bestaan", () => {
    const schermen = ["/", "/agenda", "/reizen", "/schoolwerk", "/instellingen"];
    for (const kortom of manifest.shortcuts ?? []) {
      expect(schermen, kortom.url).toContain(kortom.url);
    }
  });

  it("hebben een icoon dat er is", () => {
    for (const kortom of manifest.shortcuts ?? []) {
      for (const icoon of kortom.icons ?? []) {
        expect(bestaat(icoon.src), icoon.src).toBe(true);
      }
    }
  });
});
