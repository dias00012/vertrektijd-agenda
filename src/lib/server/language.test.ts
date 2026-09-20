import { describe, expect, it } from "vitest";
import { requestLanguage, say } from "./language";

/**
 * In welke taal antwoordt de server?
 *
 * De server kent de gekozen taal niet uit zichzelf: die staat in de browser.
 * De app zet hem daarom in een header, en anders valt hij terug op de
 * taalvoorkeur van de browser. Zonder dit krijg je Nederlandse foutmeldingen
 * in een Engelse app.
 */

function verzoek(headers: Record<string, string>): Request {
  return new Request("https://voorbeeld.test/api/travel", { headers });
}

describe("requestLanguage", () => {
  it("volgt de header die de app meestuurt", () => {
    expect(requestLanguage(verzoek({ "x-language": "en" }))).toBe("en");
    expect(requestLanguage(verzoek({ "x-language": "nl" }))).toBe("nl");
  });

  it("trekt zich niets aan van hoofdletters of spaties in die header", () => {
    expect(requestLanguage(verzoek({ "x-language": "  EN " }))).toBe("en");
  });

  it("negeert een taal die de app niet kent", () => {
    expect(requestLanguage(verzoek({ "x-language": "de" }))).toBe("nl");
  });

  it("valt terug op de voorkeur van de browser", () => {
    expect(requestLanguage(verzoek({ "accept-language": "en-GB,en;q=0.9" }))).toBe("en");
  });

  /** De eerste die we kennen wint; browsers sturen ze op volgorde van voorkeur. */
  it("pakt de eerste taal die de app kent, niet zomaar de eerste", () => {
    expect(requestLanguage(verzoek({ "accept-language": "de,fr;q=0.9,en;q=0.8" }))).toBe("en");
    expect(requestLanguage(verzoek({ "accept-language": "de,nl;q=0.9,en;q=0.8" }))).toBe("nl");
  });

  it("laat de eigen header voorgaan op die van de browser", () => {
    expect(
      requestLanguage(verzoek({ "x-language": "nl", "accept-language": "en-US,en;q=0.9" })),
    ).toBe("nl");
  });

  it("kiest Nederlands als er helemaal niets meekomt", () => {
    expect(requestLanguage(verzoek({}))).toBe("nl");
  });

  it("kiest Nederlands bij een header die nergens op slaat", () => {
    expect(requestLanguage(verzoek({ "accept-language": "*" }))).toBe("nl");
    expect(requestLanguage(verzoek({ "accept-language": "" }))).toBe("nl");
  });
});

describe("say", () => {
  it("antwoordt in de taal van het verzoek", () => {
    const nl = say(verzoek({ "x-language": "nl" }), "error.travel");
    const en = say(verzoek({ "x-language": "en" }), "error.travel");

    expect(nl).not.toBe(en);
    expect(nl.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
  });

  it("vult de plekken tussen accolades in", () => {
    const zin = say(verzoek({ "x-language": "nl" }), "api.tooMany", { seconds: 30 });

    expect(zin).toContain("30");
    expect(zin).not.toContain("{");
  });
});
