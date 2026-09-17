import { describe, expect, it } from "vitest";
import { BusyError, withRow, type Loaded, type Store } from "./optimistic";
import type { AgendaData } from "./agendaTools";

const leeg = (): AgendaData => ({
  settings: null,
  activities: [],
  tasks: [],
  exams: [],
  deletions: [],
});

/**
 * Een nagebouwde rij, met een teller als versie. `voorDeSchrijfPoging` is de
 * ander die ertussen komt: hij schrijft precies tussen ons lezen en ons
 * schrijven in, wat in het echt een tweede verzoek van hetzelfde gesprek is.
 */
function nepRij(start: AgendaData, voorDeSchrijfPoging?: () => void) {
  let huidig = start;
  let versie = 1;
  let laden = 0;
  let gelukt = 0;
  let geweigerd = 0;

  const store: Store<AgendaData> = {
    async load(): Promise<Loaded<AgendaData>> {
      laden += 1;
      return { data: huidig, version: String(versie) };
    },
    async save(data, version) {
      voorDeSchrijfPoging?.();
      if (version !== String(versie)) {
        geweigerd += 1;
        return false;
      }
      huidig = data;
      versie += 1;
      gelukt += 1;
      return true;
    },
  };

  return {
    store,
    /** Iemand anders schrijft ertussendoor. */
    ander(data: AgendaData) {
      huidig = data;
      versie += 1;
    },
    get rij() {
      return huidig;
    },
    get tellers() {
      return { laden, gelukt, geweigerd };
    },
  };
}

const metTitel = (titel: string): AgendaData => ({
  ...leeg(),
  activities: [{ id: titel }] as unknown as AgendaData["activities"],
});

describe("withRow", () => {
  it("schrijft niets wanneer er niets veranderd is", async () => {
    const rij = nepRij(leeg());
    const antwoord = await withRow(rij.store, () => ({ outcome: "alleen gelezen" }));
    expect(antwoord).toBe("alleen gelezen");
    expect(rij.tellers.gelukt).toBe(0);
  });

  it("schrijft ook niets wanneer `next` dezelfde gegevens zijn", async () => {
    // Zoals bij een dag die al overgeslagen was: het antwoord is "gelukt",
    // maar er valt niets te schrijven.
    const rij = nepRij(leeg());
    await withRow(rij.store, (data) => ({ next: data, outcome: null }));
    expect(rij.tellers.gelukt).toBe(0);
  });

  it("schrijft een wijziging weg", async () => {
    const rij = nepRij(leeg());
    await withRow(rij.store, () => ({ next: metTitel("nieuw"), outcome: null }));
    expect(rij.rij.activities[0].id).toBe("nieuw");
    expect(rij.tellers.gelukt).toBe(1);
  });

  it("doet het werk over op verse gegevens wanneer iemand ertussen kwam", async () => {
    // Dit is het geval waar het om begon: twee verzoeken tegelijk. De eerste
    // schrijft terwijl wij al gelezen hadden; zonder deze controle zou onze
    // versie de zijne overschrijven en zou zijn wijziging spoorloos zijn.
    let eenmalig = true;
    const rij = nepRij(leeg(), () => {
      if (!eenmalig) return;
      eenmalig = false;
      rij.ander(metTitel("van de ander"));
    });

    const gezien: string[] = [];
    await withRow(rij.store, (data) => {
      gezien.push(data.activities[0]?.id ?? "(leeg)");
      return {
        next: { ...data, activities: [...data.activities, { id: "van ons" }] as AgendaData["activities"] },
        outcome: null,
      };
    });

    // Tweede poging zag wél wat de ander schreef, en bouwde daarop verder.
    expect(gezien).toEqual(["(leeg)", "van de ander"]);
    expect(rij.rij.activities.map((a) => a.id)).toEqual(["van de ander", "van ons"]);
    expect(rij.tellers).toMatchObject({ laden: 2, gelukt: 1, geweigerd: 1 });
  });

  it("geeft het na drie botsingen eerlijk op", async () => {
    // Liever een foutmelding dan een antwoord dat "gelukt" zegt over iets wat
    // er niet staat.
    const rij = nepRij(leeg(), () => rij.ander(metTitel("weer die ander")));
    await expect(
      withRow(rij.store, () => ({ next: metTitel("van ons"), outcome: null })),
    ).rejects.toBeInstanceOf(BusyError);
    expect(rij.tellers).toMatchObject({ laden: 3, gelukt: 0, geweigerd: 3 });
  });
});
