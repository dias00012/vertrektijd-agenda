import { afterEach, describe, expect, it, vi } from "vitest";
import { readTextCapped, resolvesToPrivateAddress } from "./network";

/**
 * De twee dingen die voorkomen dat `/api/rooster` een deur naar binnen wordt:
 * de naamcontrole en de groottegrens. Ze hadden geen enkele test, terwijl
 * juist hier een stille wijziging het verschil maakt tussen "geen toegang" en
 * "haalt op wat je maar vraagt".
 */

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const { lookup } = await import("node:dns/promises");
const opzoeken = vi.mocked(lookup);

afterEach(() => {
  vi.resetAllMocks();
});

/** Doet alsof een naam naar deze adressen wijst. */
function wijstNaar(...adressen: string[]) {
  opzoeken.mockResolvedValue(
    adressen.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as never,
  );
}

describe("resolvesToPrivateAddress", () => {
  it("weigert een letterlijk adres binnen het netwerk zonder op te zoeken", async () => {
    expect(await resolvesToPrivateAddress("127.0.0.1")).toBe(true);
    expect(await resolvesToPrivateAddress("192.168.1.10")).toBe(true);
    expect(await resolvesToPrivateAddress("10.0.0.5")).toBe(true);
    // Geen naamserver nodig: dit staat al vast op de naam zelf.
    expect(opzoeken).not.toHaveBeenCalled();
  });

  it("weigert het metadata-adres van de cloudprovider", async () => {
    // Daar staan de sleutels van de server achter. Dit is het adres waar een
    // aanval op dit soort routes altijd als eerste heen wijst.
    expect(await resolvesToPrivateAddress("169.254.169.254")).toBe(true);
  });

  it("kijkt door een doodgewone naam heen die naar binnen wijst", async () => {
    // Dit is de hele reden dat opzoeken nodig is: aan de naam zie je niets.
    wijstNaar("127.0.0.1");
    expect(await resolvesToPrivateAddress("binnenkant.voorbeeld.test")).toBe(true);
    expect(opzoeken).toHaveBeenCalled();
  });

  it("weigert al zodra één van de adressen naar binnen wijst", async () => {
    // Een naam mag meerdere adressen hebben; er is er maar één nodig.
    wijstNaar("93.184.216.34", "10.1.2.3");
    expect(await resolvesToPrivateAddress("dubbel.voorbeeld.test")).toBe(true);
  });

  it("laat een gewone naam met een openbaar adres door", async () => {
    wijstNaar("93.184.216.34");
    expect(await resolvesToPrivateAddress("rooster.voorbeeld.test")).toBe(false);
  });

  it("haalt de blokhaken van een IPv6-adres af voor het oordeel", async () => {
    // In een URL staat IPv6 tussen blokhaken; die horen niet bij het adres.
    expect(await resolvesToPrivateAddress("[::1]")).toBe(true);
  });

  it("laat een naam die niet op te zoeken is met rust", async () => {
    // Niet blokkeren: het ophalen mislukt zo meteen toch, en een naamserver
    // die even hapert mag geen geldige link onbereikbaar maken.
    opzoeken.mockRejectedValue(new Error("geen antwoord"));
    expect(await resolvesToPrivateAddress("bestaatniet.voorbeeld.test")).toBe(false);
  });
});

/** Een antwoord dat zijn inhoud in stukjes doorgeeft, zoals een echte server. */
function antwoordMet(stukjes: string[], onCancel?: () => void): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= stukjes.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(stukjes[i]));
      i += 1;
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Response(stream);
}

describe("readTextCapped", () => {
  it("geeft de inhoud terug zolang die onder de grens blijft", async () => {
    expect(await readTextCapped(antwoordMet(["BEGIN:", "VCALENDAR"]), 1000)).toBe(
      "BEGIN:VCALENDAR",
    );
  });

  it("geeft niets terug zodra de grens wordt overschreden", async () => {
    expect(await readTextCapped(antwoordMet(["abcdefghij"]), 5)).toBeNull();
  });

  it("stopt met lezen in plaats van eerst alles binnen te halen", async () => {
    /*
     * Dit is het hele punt. `response.text()` leest eerst alles in het
     * geheugen en kijkt pas daarna hoe groot het was -- een bron die blijft
     * zenden krijgt de server dan om, ook al gooien we het daarna weg.
     */
    const geannuleerd = vi.fn();
    const antwoord = antwoordMet(["12345", "67890", "meer", "en", "nog", "meer"], geannuleerd);

    expect(await readTextCapped(antwoord, 8)).toBeNull();
    expect(geannuleerd).toHaveBeenCalled();
  });

  it("telt bytes en geen tekens", async () => {
    // Eén emoji is vier bytes. Op tekens tellen laat een bestand door dat vier
    // keer zo groot is als de grens.
    expect(await readTextCapped(antwoordMet(["\u{1F600}"]), 3)).toBeNull();
    expect(await readTextCapped(antwoordMet(["\u{1F600}"]), 4)).toBe("\u{1F600}");
  });

  it("kan om met een antwoord zonder inhoud", async () => {
    expect(await readTextCapped(new Response(null), 1000)).toBe("");
  });

  it("zet meerdere stukjes weer correct aan elkaar", async () => {
    // Een teken kan over twee stukjes verdeeld binnenkomen; los decoderen
    // maakt er dan twee vraagtekens van.
    const encoder = new TextEncoder();
    const bytes = encoder.encode("café één");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    expect(await readTextCapped(new Response(stream), 1000)).toBe("café één");
  });
});
