import { afterEach, describe, expect, it, vi } from "vitest";
import { envelopeBody, envelopeUrl, reportError } from "./monitoring";

/**
 * Foutmonitoring.
 *
 * Twee dingen die je niet wilt ontdekken op het moment dat er iets stukgaat:
 * een DSN die verkeerd wordt uitgelezen (dan komt er nooit iets aan), en een
 * pakketje waar meer in zit dan je beloofde. De privacyverklaring zegt dat er
 * geen agenda-inhoud, adres of e-mailadres naar buiten gaat; dat hoort na te
 * rekenen te zijn.
 */

const META = { eventId: "abc123", sentAt: "2026-09-20T08:00:00.000Z", path: "/agenda" };

afterEach(() => vi.restoreAllMocks());

describe("envelopeUrl", () => {
  it("haalt de sleutel en het project uit een DSN", () => {
    const url = envelopeUrl("https://sleutel123@o1.ingest.sentry.io/456");

    expect(url).toBe(
      "https://o1.ingest.sentry.io/api/456/envelope/?sentry_key=sleutel123&sentry_version=7",
    );
  });

  it("geeft niets terug bij een DSN zonder project", () => {
    expect(envelopeUrl("https://sleutel@o1.ingest.sentry.io/")).toBeNull();
  });

  it("geeft niets terug bij een DSN zonder sleutel", () => {
    expect(envelopeUrl("https://o1.ingest.sentry.io/456")).toBeNull();
  });

  it("geeft niets terug bij iets dat geen adres is", () => {
    expect(envelopeUrl("zomaar wat")).toBeNull();
    expect(envelopeUrl("")).toBeNull();
  });
});

describe("envelopeBody", () => {
  /** Drie regels: kop, type, inhoud. Zo wil Sentry het hebben. */
  it("bouwt drie regels", () => {
    const regels = envelopeBody(new Error("stuk"), {}, META).split("\n");

    expect(regels).toHaveLength(3);
    expect(JSON.parse(regels[0])).toEqual({ event_id: "abc123", sent_at: META.sentAt });
    expect(JSON.parse(regels[1])).toEqual({ type: "event" });
  });

  it("zet de melding en het soort fout erin", () => {
    const inhoud = JSON.parse(envelopeBody(new TypeError("kapot"), {}, META).split("\n")[2]);

    expect(inhoud.exception.values[0]).toMatchObject({ type: "TypeError", value: "kapot" });
    expect(inhoud.level).toBe("error");
  });

  it("kan ook iets aan dat geen Error is", () => {
    const inhoud = JSON.parse(envelopeBody("zomaar een tekst", {}, META).split("\n")[2]);

    expect(inhoud.exception.values[0]).toMatchObject({ type: "Error", value: "zomaar een tekst" });
  });

  it("stuurt het pad mee, niet de hele URL met wat erachter staat", () => {
    const inhoud = JSON.parse(envelopeBody(new Error("x"), {}, META).split("\n")[2]);

    expect(inhoud.request.url).toBe("/agenda");
  });

  it("knipt een enorme stack af", () => {
    const fout = new Error("x");
    fout.stack = "a".repeat(10_000);
    const inhoud = JSON.parse(envelopeBody(fout, {}, META).split("\n")[2]);

    expect(inhoud.extra.stack).toHaveLength(4000);
  });

  it("neemt de context mee die de app zelf meegeeft", () => {
    const inhoud = JSON.parse(
      envelopeBody(new Error("x"), { scope: "global" }, META).split("\n")[2],
    );

    expect(inhoud.extra.scope).toBe("global");
  });

  /**
   * De belofte uit de privacyverklaring, nagerekend: wat er ook in de agenda
   * staat, het hoort hier niet in te belanden.
   */
  it("stuurt geen agenda-inhoud mee", () => {
    const body = envelopeBody(new Error("Berekenen mislukt"), { scope: "travel" }, META);

    for (const geheim of ["Voorbeeldstraat", "sb@sbboekhouding.nl", "Bedrijfseconomie", "52.37"]) {
      expect(body).not.toContain(geheim);
    }
  });
});

describe("reportError", () => {
  it("schrijft de fout naar de console, ook zonder Sentry", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    reportError(new Error("stuk"), { scope: "test" });

    expect(log).toHaveBeenCalledWith("[vertrektijd]", "stuk", { scope: "test" });
  });

  it("gaat niet zelf stuk op iets dat geen Error is", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => reportError(undefined)).not.toThrow();
    expect(() => reportError({ raar: true })).not.toThrow();
  });
});
