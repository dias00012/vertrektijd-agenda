import { describe, expect, it } from "vitest";
import { MAX_DIRECT_SECONDS, beyondReach } from "./reach";
import type { GeoLocation } from "./types";

/**
 * De grens waarboven de app niet eens meer om een route vraagt.
 *
 * Hier zit een gemelde fout achter: voor lopen stond de grens op vier uur, en
 * Almere Buiten naar Lelystad is 19,5 km -- vier uur en achttien minuten. Net
 * erboven, dus de app zei "geen looproute gevonden" terwijl die route gewoon
 * bestaat en je hem alleen niet wilt lopen.
 *
 * De verzonnen plaatsnamen zijn losse coordinaten; het gaat om de afstand.
 */

const punt = (lat: number, lon: number): GeoLocation => ({ label: "punt", lat, lon });

/** Ongeveer dit aantal kilometer naar het noorden vanaf Almere. */
const noordwaarts = (km: number) => punt(52.3742 + km / 111.32, 5.2178);
const ALMERE = punt(52.3742, 5.2178);

describe("beyondReach", () => {
  it("laat een wandeling om de hoek gewoon door", () => {
    expect(beyondReach(ALMERE, noordwaarts(2), "walk")).toBe(false);
  });

  it("laat de route die eerder wegviel nu wél door", () => {
    // Bijna twintig kilometer lopen: dat wil je niet, maar de app hoort te
    // zeggen hoe lang het duurt in plaats van "geen route gevonden".
    expect(beyondReach(ALMERE, noordwaarts(19.5), "walk")).toBe(false);
  });

  it("zegt pas te ver als het bewijsbaar te ver is", () => {
    // Acht uur lopen op 1,6 m/s is ruim 46 km hemelsbreed. Daaronder kan er
    // altijd nog een route zijn; daarboven bestaat die niet.
    expect(beyondReach(ALMERE, noordwaarts(40), "walk")).toBe(false);
    expect(beyondReach(ALMERE, noordwaarts(60), "walk")).toBe(true);
  });

  it("rekent voor de fiets met een andere snelheid", () => {
    // Vijftig kilometer is te ver om te lopen maar niet om te fietsen.
    expect(beyondReach(ALMERE, noordwaarts(50), "walk")).toBe(true);
    expect(beyondReach(ALMERE, noordwaarts(50), "bike")).toBe(false);
  });

  it("noemt een rit door het halve land ook op de fiets te ver", () => {
    // Vier uur op 6 m/s is ruim 86 km hemelsbreed.
    expect(beyondReach(ALMERE, noordwaarts(120), "bike")).toBe(true);
  });

  it("kijkt beide kanten op", () => {
    // Van A naar B is even ver als van B naar A.
    const ver = noordwaarts(60);
    expect(beyondReach(ALMERE, ver, "walk")).toBe(beyondReach(ver, ALMERE, "walk"));
  });

  it("houdt lopen ruimer dan fietsen in tijd", () => {
    /*
     * Dat lijkt omgekeerd, maar het klopt: de grens is hoe lang een directe
     * route mág duren. Acht uur lopen is nog geen vijftig kilometer; vier uur
     * fietsen is er ruim tachtig. Een lagere grens voor de fiets maakt deze
     * controle juist scherper.
     */
    expect(MAX_DIRECT_SECONDS.walk).toBeGreaterThan(MAX_DIRECT_SECONDS.bike);
  });
});
