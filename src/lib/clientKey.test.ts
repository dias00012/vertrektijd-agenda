import { describe, expect, it } from "vitest";
import { clientKey } from "./clientKey";

function ask(headers: Record<string, string>): Request {
  return new Request("https://voorbeeld.nl/api/travel", { headers });
}

/**
 * Hierop rust de verkeersdrempel. Pakt hij een waarde die de bezoeker zelf kan
 * invullen, dan verzint die bij elke aanvraag een ander adres en loopt hij er
 * zo omheen.
 */
describe("clientKey", () => {
  it("gebruikt de kopregel die het platform zelf zet", () => {
    expect(clientKey(ask({ "x-vercel-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientKey(ask({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("laat zich niet misleiden door een zelf meegestuurde ketting", () => {
    // De bezoeker verzint "1.2.3.4"; onze eigen tussenstap plakt zijn echte
    // adres er achteraan. De laatste waarde is dus de betrouwbare.
    expect(clientKey(ask({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("geeft bij elke verzonnen ketting dezelfde uitkomst", () => {
    const eerste = clientKey(ask({ "x-forwarded-for": "9.9.9.9, 203.0.113.9" }));
    const tweede = clientKey(ask({ "x-forwarded-for": "8.8.8.8, 203.0.113.9" }));

    expect(eerste).toBe(tweede);
  });

  it("kiest het platform boven de ketting", () => {
    expect(
      clientKey(ask({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("gooit alle anonieme aanvragen op één emmer als er geen bron is", () => {
    expect(clientKey(ask({}))).toBe("onbekend");
    expect(clientKey(ask({ "x-forwarded-for": " , " }))).toBe("onbekend");
  });
});
