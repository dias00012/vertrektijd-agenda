/**
 * Kiezen en opschonen van reismogelijkheden.
 *
 * De reisplanner geeft een rijtje opties terug waarvan er elk ergens beter in
 * is: de een vertrekt later, de ander komt eerder aan, de derde heeft minder
 * overstappen. In welke volgorde dat binnenkomt ligt niet vast. Wie dan
 * gewoon de eerste pakt, krijgt op een heenreis vaak de vroegste vertrektijd
 * met de langste route — precies het tegenovergestelde van wat deze app
 * belooft. Daarom kiest de app hier zelf, los van de volgorde van de provider.
 *
 * Bewust zonder `server-only`: het is pure rekenkunde zonder netwerk, zodat
 * het los te testen is.
 */

/** Het minimum dat we van een reisoptie moeten weten om te kunnen kiezen. */
export interface ItineraryLike {
  /** ISO-tijd van vertrek. */
  startTime?: string;
  /** ISO-tijd van aankomst. */
  endTime?: string;
  /** Reisduur in seconden. */
  duration?: number;
  transfers?: number;
}

export interface PickOptions {
  /** true = "uiterlijk aankomen om"; anders "op zijn vroegst vertrekken om". */
  arriveBy?: boolean;
  /** De deadline (bij arriveBy) of het vroegste vertrek, als ISO-tijd. */
  time?: string;
}

/**
 * Wat een overstap waard is in de vergelijking. Vijf minuten later van huis is
 * fijn, maar niet als je er een extra overstap voor terugkrijgt: die kost tijd
 * op het perron en is het eerste wat misgaat zodra er iets vertraagd is.
 */
const TRANSFER_PENALTY_MINUTES = 5;
const MINUTE_MS = 60_000;

function timeOf(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Bruikbaar is een optie pas als vertrek, aankomst én duur echt bekend zijn. */
function isUsable(item: ItineraryLike): boolean {
  return (
    timeOf(item.startTime) !== null &&
    timeOf(item.endTime) !== null &&
    (item.duration ?? 0) > 0
  );
}

/**
 * Lager is beter. `wantLatestDeparture` zegt waar we op mikken: zo laat
 * mogelijk de deur uit (heenreis) of zo vroeg mogelijk aankomen (terugreis).
 * Zie `TRANSFER_PENALTY_MINUTES` voor het gewicht van een overstap.
 */
function score(item: ItineraryLike, wantLatestDeparture: boolean): number {
  const penalty = (item.transfers ?? 0) * TRANSFER_PENALTY_MINUTES * MINUTE_MS;
  return wantLatestDeparture
    ? penalty - (timeOf(item.startTime) as number)
    : penalty + (timeOf(item.endTime) as number);
}

function isBetter(a: ItineraryLike, b: ItineraryLike, wantLatestDeparture: boolean): boolean {
  const scoreA = score(a, wantLatestDeparture);
  const scoreB = score(b, wantLatestDeparture);
  if (scoreA !== scoreB) return scoreA < scoreB;
  // Even goed op tijd: dan wint de kortste rit, zodat de keuze niet afhangt
  // van de volgorde waarin de provider ze toevallig teruggeeft.
  return (a.duration ?? 0) < (b.duration ?? 0);
}

/**
 * De beste reisoptie voor wat de gebruiker vroeg.
 *
 * Bij "uiterlijk aankomen om" is dat de laatste vertrektijd waarmee je nog op
 * tijd bent; bij "vertrekken vanaf" de vroegste aankomst. Opties die de
 * gevraagde tijd niet halen vallen af, tenzij er dan niets overblijft: een
 * reis tonen is beter dan een foutmelding.
 */
export function pickItinerary<T extends ItineraryLike>(
  items: readonly T[],
  options: PickOptions = {},
): T | null {
  const usable = items.filter(isUsable);
  if (usable.length === 0) return null;

  const arriveBy = options.arriveBy === true;
  const limit = timeOf(options.time);

  const onTime =
    limit === null
      ? usable
      : usable.filter((item) =>
          arriveBy
            ? (timeOf(item.endTime) as number) <= limit
            : (timeOf(item.startTime) as number) >= limit,
        );
  // Haalt niets de gevraagde tijd, dan draait de vraag om: niet "wie mag het
  // laatst weg", maar "wie is er het minst laat". Andersom net zo: is elke rit
  // al vertrokken, dan is de laatste van het stel het dichtst in de buurt.
  const fits = onTime.length > 0;
  const candidates = fits ? onTime : usable;
  const wantLatestDeparture = fits ? arriveBy : !arriveBy;

  return candidates.reduce((best, item) =>
    isBetter(item, best, wantLatestDeparture) ? item : best,
  );
}

/**
 * Is `a` in elk opzicht minstens zo goed als `b`, en ergens beter? Dan hoeft
 * `b` niet in de lijst: later vertrekken, eerder aankomen en minder overstappen
 * zijn alle drie winst, dus een optie die op geen enkel punt wint is ruis.
 */
function dominates(a: ItineraryLike, b: ItineraryLike): boolean {
  const departureA = timeOf(a.startTime) as number;
  const departureB = timeOf(b.startTime) as number;
  const arrivalA = timeOf(a.endTime) as number;
  const arrivalB = timeOf(b.endTime) as number;
  const transfersA = a.transfers ?? 0;
  const transfersB = b.transfers ?? 0;

  const neverWorse =
    departureA >= departureB && arrivalA <= arrivalB && transfersA <= transfersB;
  const somewhereBetter =
    departureA > departureB || arrivalA < arrivalB || transfersA < transfersB;
  return neverWorse && somewhereBetter;
}

/**
 * De lijst voor de reisplanner: onbruikbare en overbodige opties eruit, en op
 * vertrektijd gesorteerd zoals op een vertrekbord.
 */
export function tidyItineraries<T extends ItineraryLike>(items: readonly T[]): T[] {
  const usable = items.filter(isUsable);
  return usable
    .filter((item) => !usable.some((other) => dominates(other, item)))
    .sort(
      (a, b) =>
        (timeOf(a.startTime) as number) - (timeOf(b.startTime) as number) ||
        (timeOf(a.endTime) as number) - (timeOf(b.endTime) as number),
    );
}
