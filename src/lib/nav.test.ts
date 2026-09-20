import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTRA_ROUTES, NAV } from "./nav";

/**
 * De service worker laadt de schermen van de app voor, zodat ze ook zonder
 * bereik openen. Die lijst staat daar noodgedwongen nog een keer -- een
 * service worker kan geen module importeren.
 *
 * Twee lijsten die gelijk moeten blijven zonder dat iets dat afdwingt, is een
 * val: voeg een tabblad toe, vergeet de worker, en dat scherm doet het niet in
 * de trein. Geen foutmelding, geen waarschuwing, en je merkt het precies
 * wanneer je er niets meer aan kunt doen. Vandaar deze test.
 */

const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

/** Een lijst met paden uit de service worker, als gewone array. */
function lijstUitWorker(naam: string): string[] {
  const regel = new RegExp(`^const ${naam} = \\[(.*)\\];$`, "m").exec(worker);
  if (!regel) throw new Error(`${naam} niet gevonden in public/sw.js`);
  return regel[1]
    .split(",")
    .map((deel) => deel.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const routesUitWorker = () => lijstUitWorker("ROUTES");

describe("de service worker en het menu", () => {
  it("laden precies dezelfde schermen voor", () => {
    expect(routesUitWorker()).toEqual(NAV.map((item) => item.href));
  });

  it("laden ook de schermen voor die niet in het menu staan", () => {
    expect(lijstUitWorker("EXTRA_ROUTES")).toEqual([...EXTRA_ROUTES]);
  });

  it("beginnen allebei bij Vandaag", () => {
    // De eerste is ook de pagina die je krijgt als je de app opent.
    expect(NAV[0].href).toBe("/");
    expect(routesUitWorker()[0]).toBe("/");
  });
});

describe("NAV", () => {
  it("heeft geen dubbele schermen", () => {
    expect(new Set(NAV.map((item) => item.href)).size).toBe(NAV.length);
  });

  it("heeft overal een vertaalsleutel en een icoon", () => {
    for (const item of NAV) {
      expect(item.key, item.href).toMatch(/^nav\./);
      expect(item.icon.length, item.href).toBeGreaterThan(0);
    }
  });
});
