import { describe, expect, it } from "vitest";
import { assetLinks, fingerprints } from "./androidLinks";

/**
 * Het bestand waarmee de site bevestigt dat hij bij de Android-app hoort.
 *
 * Gaat hier iets mis, dan merk je dat pas ná het uploaden naar Play Console:
 * de app opent dan mét browserbalk en ziet eruit als een website. Een verzonnen
 * of half ingetypte vingerafdruk is daarom erger dan helemaal geen -- geen
 * vingerafdruk is een duidelijk "nog niet ingesteld", een foute lijkt goed te
 * staan terwijl Android hem afwijst.
 */

const ECHT =
  "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";

describe("fingerprints", () => {
  it("neemt een geldige vingerafdruk over", () => {
    expect(fingerprints(ECHT)).toEqual([ECHT]);
  });

  it("maakt er hoofdletters van, want zo staat hij in Play Console", () => {
    expect(fingerprints(ECHT.toLowerCase())).toEqual([ECHT]);
  });

  it("neemt er meerdere, met komma's ertussen", () => {
    expect(fingerprints(`${ECHT}, ${ECHT}`)).toHaveLength(2);
  });

  it("trekt zich niets aan van spaties eromheen", () => {
    expect(fingerprints(`   ${ECHT}   `)).toEqual([ECHT]);
  });

  it("geeft niets terug als er niets staat", () => {
    expect(fingerprints(undefined)).toEqual([]);
    expect(fingerprints("")).toEqual([]);
    expect(fingerprints("   ")).toEqual([]);
  });

  /** Het geval dat het gevaarlijkst is: iets dat erop lijkt maar het niet is. */
  it("weigert alles wat geen vingerafdruk is", () => {
    expect(fingerprints("onzin")).toEqual([]);
    // Te kort.
    expect(fingerprints("AB:CD:EF")).toEqual([]);
    // Geen hex.
    expect(fingerprints(ECHT.replace("AB", "ZZ"))).toEqual([]);
    // Zonder dubbele punten, zoals sommige tools hem tonen.
    expect(fingerprints(ECHT.replace(/:/g, ""))).toEqual([]);
    // Eentje te veel.
    expect(fingerprints(`${ECHT}:FF`)).toEqual([]);
  });

  it("laat de goede staan en gooit de foute eruit", () => {
    expect(fingerprints(`onzin, ${ECHT}`)).toEqual([ECHT]);
  });
});

describe("assetLinks", () => {
  it("geeft een lege lijst zolang er geen vingerafdruk is", () => {
    expect(assetLinks("nl.vertrektijd.agenda", undefined)).toEqual([]);
  });

  it("geeft een lege lijst bij een vingerafdruk die nergens op slaat", () => {
    expect(assetLinks("nl.vertrektijd.agenda", "onzin")).toEqual([]);
  });

  it("bouwt de regel die Android verwacht", () => {
    const [regel] = assetLinks("nl.vertrektijd.agenda", ECHT);

    expect(regel).toEqual({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "nl.vertrektijd.agenda",
        sha256_cert_fingerprints: [ECHT],
      },
    });
  });

  it("zet meerdere vingerafdrukken in dezelfde regel", () => {
    const [regel] = assetLinks("nl.vertrektijd.agenda", `${ECHT},${ECHT}`);

    expect(regel.target.sha256_cert_fingerprints).toHaveLength(2);
  });
});
