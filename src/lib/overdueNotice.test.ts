import { describe, expect, it } from "vitest";
import { pruneSeen, unseenOverdue } from "./overdueNotice";

/**
 * Wegklikken van de melding "je hebt iets over tijd".
 *
 * De valkuil zit niet in het wegklikken maar in wat er daarna gebeurt. Een
 * knop die alleen onthoudt dát je hem hebt weggeklikt, zwijgt daarna over
 * alles -- ook over de toets die volgende week over tijd gaat. Daarom onthoudt
 * hij welke dingen je hebt gezien.
 */

describe("unseenOverdue", () => {
  it("toont alles wat je nog niet hebt weggeklikt", () => {
    expect(unseenOverdue(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("zwijgt over wat je hebt weggeklikt", () => {
    expect(unseenOverdue(["a"], ["a"])).toEqual([]);
  });

  /** Het geval waar het om gaat: iets nieuws na het wegklikken. */
  it("meldt zich opnieuw zodra er iets nieuws over tijd is", () => {
    expect(unseenOverdue(["a", "b"], ["a"])).toEqual(["b"]);
  });

  it("laat zich niet van de wijs brengen door weggeklikte dingen die weg zijn", () => {
    expect(unseenOverdue(["b"], ["a", "c"])).toEqual(["b"]);
  });

  it("zegt niets als er niets over tijd is", () => {
    expect(unseenOverdue([], ["a"])).toEqual([]);
  });
});

describe("pruneSeen", () => {
  it("houdt alleen ids die nu nog over tijd zijn", () => {
    expect(pruneSeen(["a", "b"], ["b"])).toEqual(["b"]);
  });

  /**
   * Maak je iets af en gaat het later opnieuw over tijd, dan is dat nieuw
   * nieuws en hoor je het weer. Bleef het id staan, dan zweeg de app erover.
   */
  it("vergeet iets dat niet meer over tijd is", () => {
    expect(pruneSeen(["a"], [])).toEqual([]);
  });

  it("verzint niets bij", () => {
    expect(pruneSeen([], ["a", "b"])).toEqual([]);
  });
});
