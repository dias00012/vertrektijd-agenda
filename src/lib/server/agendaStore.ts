import type { AgendaData } from "../agendaTools";

/**
 * De agenda-rij lezen en schrijven zonder een gelijktijdige wijziging te
 * overschrijven.
 *
 * Elk gereedschap van de connector leest de hele rij, verandert er iets in en
 * schrijft hem terug. Zolang dat één voor één gebeurt gaat dat goed. Maar een
 * gesprek kan twee dingen tegelijk vragen -- "verzet dat blok en sla die dag
 * over" -- en dan komen er twee verzoeken tegelijk binnen. Allebei lezen
 * dezelfde rij, allebei schrijven hun eigen versie terug, en de laatste wint.
 * Beide antwoorden zeggen dan "gelukt" terwijl er één wijziging spoorloos weg
 * is. Precies dat gebeurde: een overgeslagen sportavond die er bij de volgende
 * uitlezing gewoon weer stond.
 *
 * De oplossing is niet vergrendelen maar navragen: we onthouden hoe de rij
 * eruitzag toen we hem lazen, en schrijven alleen als hij nog zo is. Was
 * iemand ons voor, dan lezen we opnieuw en doen het werk over op de verse rij.
 */

export interface Loaded {
  data: AgendaData;
  /** Hoe de rij eruitzag toen we hem lazen; null wanneer hij nog niet bestond. */
  version: string | null;
}

export interface AgendaStore {
  load(): Promise<Loaded>;
  /** false betekent: de rij is ondertussen veranderd, er is niets geschreven. */
  save(data: AgendaData, version: string | null): Promise<boolean>;
}

/**
 * Hoe vaak we het overdoen voordat we het opgeven.
 *
 * Drie is ruim: elke poging leest verse gegevens, dus twee verzoeken die
 * elkaar kruisen zijn na de tweede al klaar. Blijft het botsen, dan is er iets
 * anders aan de hand en is een eerlijke foutmelding beter dan eindeloos
 * doorproberen.
 */
export const MAX_TRIES = 3;

/** Wordt gegooid wanneer het na `MAX_TRIES` nog steeds niet lukte. */
export class BusyError extends Error {
  constructor() {
    super("de agenda werd ondertussen door iets anders gewijzigd");
    this.name = "BusyError";
  }
}

/**
 * Doe iets met de agenda, en schrijf het alleen weg als niemand ons voor was.
 *
 * `run` krijgt verse gegevens en geeft terug wat er als antwoord uit moet
 * (`outcome`) en, als er iets veranderd is, de nieuwe agenda (`next`). Lezen
 * zonder te schrijven laat `next` gewoon weg; dan wordt er ook niets
 * geschreven en is er niets om over te botsen.
 */
export async function withAgenda<T>(
  store: AgendaStore,
  run: (data: AgendaData) => { next?: AgendaData; outcome: T },
  tries = MAX_TRIES,
): Promise<T> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const { data, version } = await store.load();
    const { next, outcome } = run(data);
    if (!next || next === data) return outcome;
    if (await store.save(next, version)) return outcome;
  }
  throw new BusyError();
}
