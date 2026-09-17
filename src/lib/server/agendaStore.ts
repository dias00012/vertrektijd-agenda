import "server-only";
import type { AgendaData } from "../agendaTools";
import { withRow, type Store } from "../optimistic";

export { BusyError, MAX_TRIES } from "../optimistic";
export type { Loaded } from "../optimistic";

/**
 * De agenda-rij van de connector, lezen en schrijven zonder een gelijktijdige
 * wijziging te overschrijven.
 *
 * De afweging staat in `src/lib/optimistic.ts`; hier staat alleen wat dit voor
 * de connector betekent. De app-kant gebruikt dezelfde functie, zodat er niet
 * twee versies van dit soort logica naast elkaar staan -- daar is het in deze
 * app al twee keer eerder op misgegaan.
 */
export type AgendaStore = Store<AgendaData>;

export async function withAgenda<T>(
  store: AgendaStore,
  run: (data: AgendaData) => { next?: AgendaData; outcome: T },
  tries?: number,
): Promise<T> {
  return withRow(store, (data) => run(data), tries);
}
