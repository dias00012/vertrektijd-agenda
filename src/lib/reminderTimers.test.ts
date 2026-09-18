import { describe, expect, it } from "vitest";
import { HORIZON_MS, REPLAN_MS, dueReminders } from "./reminderTimers";
import type { PlannedReminder } from "./reminders";

/**
 * Welke meldingen krijgen een timer?
 *
 * Deze drie regels stonden in een hook en waren daardoor niet na te rekenen,
 * terwijl ze bepalen of je melding komt. De horizon is geen willekeurig getal:
 * een tabblad dat uren op de achtergrond staat krijgt zijn timers vertraagd of
 * helemaal niet, dus zetten we er alleen eentje als het binnen zes uur is en
 * kijken we elk kwartier opnieuw.
 */

const NU = new Date(2026, 8, 17, 8, 0);

function melding(key: string, at: Date): PlannedReminder {
  return { key, at, title: `Vertrek om ${key}`, body: "…" };
}

/** Een moment, uitgedrukt in minuten vanaf NU. */
function over(minuten: number): Date {
  return new Date(NU.getTime() + minuten * 60_000);
}

describe("dueReminders", () => {
  it("geeft de resterende tijd tot de melding", () => {
    const timers = dueReminders([melding("a", over(90))], NU);

    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(90 * 60_000);
    expect(timers[0].reminder.key).toBe("a");
  });

  it("laat wat voorbij is liggen", () => {
    expect(dueReminders([melding("a", over(-1))], NU)).toEqual([]);
  });

  /**
   * Precies nu telt als voorbij. Een timer van nul vuurt direct, en omdat er
   * elk kwartier opnieuw gepland wordt zou je die melding daarna opnieuw
   * krijgen, en opnieuw.
   */
  it("telt precies nu als voorbij, niet als nu meteen", () => {
    expect(dueReminders([melding("a", NU)], NU)).toEqual([]);
  });

  it("kijkt niet verder dan de horizon", () => {
    const netBinnen = new Date(NU.getTime() + HORIZON_MS);
    const netBuiten = new Date(NU.getTime() + HORIZON_MS + 1);

    expect(dueReminders([melding("binnen", netBinnen)], NU)).toHaveLength(1);
    expect(dueReminders([melding("buiten", netBuiten)], NU)).toEqual([]);
  });

  it("slaat over wat al gemeld is", () => {
    const planned = [melding("a", over(30)), melding("b", over(60))];

    const timers = dueReminders(planned, NU, new Set(["a"]));

    expect(timers.map((timer) => timer.reminder.key)).toEqual(["b"]);
  });

  it("houdt de volgorde aan waarin de meldingen binnenkomen", () => {
    const planned = [melding("a", over(30)), melding("b", over(60)), melding("c", over(90))];

    expect(dueReminders(planned, NU).map((timer) => timer.reminder.key)).toEqual(["a", "b", "c"]);
  });

  /**
   * De reden dat er überhaupt herplannning is: een vertrek van vanmiddag valt
   * 's ochtends buiten de horizon. Wordt er niet opnieuw gekeken, dan komt die
   * melding nooit -- en dat is precies het geval waarvoor je hem aanzet.
   */
  it("pakt een vertrek van later op de dag op zodra de horizon meeschuift", () => {
    const vanmiddag = melding("17:00", new Date(2026, 8, 17, 16, 45));

    expect(dueReminders([vanmiddag], NU)).toEqual([]);

    // Elk kwartier opnieuw; na genoeg rondjes valt hij binnen de horizon.
    const later = new Date(NU.getTime() + 3 * 60 * 60_000);
    expect(dueReminders([vanmiddag], later)).toHaveLength(1);
  });

  it("herplant vaker dan de horizon lang is, anders valt er een gat", () => {
    expect(REPLAN_MS).toBeLessThan(HORIZON_MS);
  });
});
