/**
 * Schrijven zonder een gelijktijdige wijziging te overschrijven.
 *
 * Overal waar deze app de agenda bewaart gebeurt hetzelfde: de hele rij lezen,
 * er iets in veranderen, hem terugschrijven. Zolang dat één voor één gaat is er
 * niets aan de hand. Maar er schrijven inmiddels drie dingen: je laptop, je
 * telefoon, en Claude via de connector. Twee daarvan tegelijk en de laatste
 * wint -- zonder dat iemand iets merkt, want beide kanten melden "gelukt".
 *
 * Vergrendelen is hier het verkeerde gereedschap: een telefoon die zijn slot
 * niet teruggeeft omdat hij in een tunnel rijdt legt je agenda plat. In plaats
 * daarvan onthouden we hoe de rij eruitzag toen we hem lazen, en schrijven we
 * alleen als hij nog zo is. Was er iemand voor ons, dan doen we het werk over
 * op de verse rij -- en omdat "het werk" hier samenvoegen is, komt het van
 * allebei goed terecht.
 *
 * Dit stond eerst alleen aan de serverkant, voor de connector. De app zelf deed
 * het nog op de oude manier, en dat was precies waar "mijn telefoon en mijn
 * laptop komen niet overeen" vandaan kwam.
 */

export interface Loaded<T> {
  data: T;
  /** Hoe de rij eruitzag toen we hem lazen; null wanneer hij nog niet bestond. */
  version: string | null;
}

export interface Store<T> {
  load(): Promise<Loaded<T>>;
  /** false betekent: de rij is ondertussen veranderd, er is niets geschreven. */
  save(data: T, version: string | null): Promise<boolean>;
}

/**
 * Hoe vaak we het overdoen voordat we het opgeven.
 *
 * Drie is ruim: elke poging leest verse gegevens, dus twee schrijvers die
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
 * Doe iets met de rij, en schrijf het alleen weg als niemand ons voor was.
 *
 * `run` krijgt verse gegevens en geeft terug wat er als antwoord uit moet
 * (`outcome`) en, als er iets veranderd is, de nieuwe inhoud (`next`). Lezen
 * zonder te schrijven laat `next` gewoon weg; dan wordt er ook niets
 * geschreven en is er niets om over te botsen.
 */
export async function withRow<T, R>(
  store: Store<T>,
  run: (data: T, version: string | null) => { next?: T; outcome: R },
  tries = MAX_TRIES,
): Promise<R> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const { data, version } = await store.load();
    const { next, outcome } = run(data, version);
    if (next === undefined || next === data) return outcome;
    if (await store.save(next, version)) return outcome;
  }
  throw new BusyError();
}
