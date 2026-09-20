import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceId, pushSupported, urlBase64ToUint8Array } from "./push";

/**
 * Meldingen met de app dicht.
 *
 * Het abonneren zelf is browserwerk en staat hier niet; dit gaat over de twee
 * stukken die stil fout kunnen gaan. Een verkeerd omgezette VAPID-sleutel laat
 * de browser het abonnement weigeren met een melding waar niets uit op te maken
 * valt, en een apparaat-id dat elke keer verandert laat je wachtrij op de
 * server aangroeien met apparaten die niet bestaan.
 */

const opslag = new Map<string, string>();

function browser(opties: { kapot?: boolean; bestaand?: string } = {}) {
  opslag.clear();
  if (opties.bestaand) opslag.set("agenda.push.device.v1", opties.bestaand);
  vi.stubGlobal("window", {
    localStorage: opties.kapot
      ? {
          getItem: () => {
            throw new Error("privémodus");
          },
          setItem: () => {
            throw new Error("privémodus");
          },
        }
      : {
          getItem: (k: string) => opslag.get(k) ?? null,
          setItem: (k: string, v: string) => void opslag.set(k, v),
        },
    PushManager: class {},
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("urlBase64ToUint8Array", () => {
  it("zet een sleutel om naar bytes", () => {
    // "hallo" in base64url.
    expect([...urlBase64ToUint8Array("aGFsbG8")]).toEqual([104, 97, 108, 108, 111]);
  });

  it("vult de opvulling aan die base64url weglaat", () => {
    expect([...urlBase64ToUint8Array("YQ")]).toEqual([97]);
    expect([...urlBase64ToUint8Array("YWI")]).toEqual([97, 98]);
    expect([...urlBase64ToUint8Array("YWJj")]).toEqual([97, 98, 99]);
  });

  /** base64url gebruikt - en _ waar gewoon base64 + en / gebruikt. */
  it("vertaalt de tekens die base64url anders schrijft", () => {
    const metStreepjes = urlBase64ToUint8Array("-_8");
    const metPlussen = urlBase64ToUint8Array("+/8");

    expect([...metStreepjes]).toEqual([...metPlussen]);
    expect([...metStreepjes]).toEqual([251, 255]);
  });

  it("geeft niets terug bij een lege sleutel", () => {
    expect(urlBase64ToUint8Array("")).toHaveLength(0);
  });

  it("levert echt een Uint8Array, want dat wil de browser", () => {
    expect(urlBase64ToUint8Array("aGFsbG8")).toBeInstanceOf(Uint8Array);
  });
});

describe("deviceId", () => {
  it("maakt er één aan en onthoudt hem", () => {
    browser();

    const eerste = deviceId();
    expect(eerste).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceId()).toBe(eerste);
  });

  it("gebruikt de id die er al staat", () => {
    browser({ bestaand: "bestaande-id" });

    expect(deviceId()).toBe("bestaande-id");
  });

  /**
   * In een privévenster lukt onthouden niet. Dan werkt het deze sessie wel,
   * maar wordt het niet bewaard -- beter dan helemaal stukgaan.
   */
  it("werkt door als de opslag op slot zit", () => {
    browser({ kapot: true });

    expect(deviceId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("pushSupported", () => {
  it("zegt nee op de server, waar geen browser is", () => {
    vi.stubGlobal("window", undefined);

    expect(pushSupported()).toBe(false);
  });

  it("zegt nee in een browser zonder service worker", () => {
    browser();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("Notification", class {});

    expect(pushSupported()).toBe(false);
  });

  it("zegt nee in een browser zonder meldingen", () => {
    browser();
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("Notification", undefined);

    expect(pushSupported()).toBe(false);
  });

  it("zegt ja als alles er is", () => {
    browser();
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("Notification", class {});

    expect(pushSupported()).toBe(true);
  });
});
