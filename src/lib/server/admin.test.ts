import { describe, expect, it } from "vitest";
import { emailAllowed } from "./admin";

describe("emailAllowed", () => {
  it("laat een adres uit de lijst binnen", () => {
    expect(emailAllowed("jij@voorbeeld.nl", "jij@voorbeeld.nl")).toBe(true);
  });

  it("laat niemand binnen wanneer de lijst leeg is", () => {
    // Expres: een beheerpagina die openstaat omdat iemand hem vergat in te
    // stellen is erger dan een beheerpagina die niemand kan openen.
    expect(emailAllowed("jij@voorbeeld.nl", "")).toBe(false);
    expect(emailAllowed("jij@voorbeeld.nl", undefined)).toBe(false);
    expect(emailAllowed("jij@voorbeeld.nl", "  ,  ")).toBe(false);
  });

  it("let niet op hoofdletters", () => {
    expect(emailAllowed("Jij@Voorbeeld.NL", "jij@voorbeeld.nl")).toBe(true);
    expect(emailAllowed("jij@voorbeeld.nl", "JIJ@VOORBEELD.NL")).toBe(true);
  });

  it("gaat om met spaties in de lijst", () => {
    expect(emailAllowed("hulp@voorbeeld.nl", "jij@voorbeeld.nl, hulp@voorbeeld.nl")).toBe(true);
  });

  it("houdt iemand anders buiten", () => {
    expect(emailAllowed("vreemde@elders.nl", "jij@voorbeeld.nl")).toBe(false);
  });

  it("laat niemand binnen zonder adres", () => {
    expect(emailAllowed(null, "jij@voorbeeld.nl")).toBe(false);
    expect(emailAllowed("", "jij@voorbeeld.nl")).toBe(false);
    expect(emailAllowed("   ", "jij@voorbeeld.nl")).toBe(false);
  });

  it("trapt niet in een adres dat er alleen op lijkt", () => {
    // Deelstrings zijn geen treffer; alleen het hele adres telt.
    expect(emailAllowed("jij@voorbeeld.nl.kwaad.nl", "jij@voorbeeld.nl")).toBe(false);
    expect(emailAllowed("xjij@voorbeeld.nl", "jij@voorbeeld.nl")).toBe(false);
  });
});
