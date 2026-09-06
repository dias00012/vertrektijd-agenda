import type { TravelLeg, TravelLegMode, TravelMode } from "./types";
import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";

function word(key: TranslationKey, values?: Record<string, string | number>): string {
  return translate(getLanguage(), key, values);
}

interface TravelModeMeta {
  id: TravelMode;
  label: string;
  emoji: string;
  hint: string;
}

/**
 * Alle vervoermiddelen die het datamodel kent. "walk" staat er nog in zodat
 * oude activiteiten die op lopen stonden hun eigen naam en icoon houden.
 */
const MODE_EMOJI: Record<TravelMode, string> = {
  car: "\u{1F697}",
  bike: "\u{1F6B2}",
  transit: "\u{1F686}",
  walk: "\u{1F6B6}",
};

/** Alle vervoermiddelen, met namen in de gekozen taal. */
export function allTravelModes(): TravelModeMeta[] {
  return (["car", "bike", "transit", "walk"] as TravelMode[]).map((id) => ({
    id,
    emoji: MODE_EMOJI[id],
    label: word(`travelMode.${id}` as TranslationKey),
    hint: word(`travelMode.${id}.hint` as TranslationKey),
  }));
}

/** De vervoermiddelen die je kunt kiezen bij een activiteit. */
export function travelModes(): TravelModeMeta[] {
  return allTravelModes().filter((mode) => mode.id !== "walk");
}

export function travelModeMeta(mode: TravelMode) {
  const all = allTravelModes();
  return all.find((item) => item.id === mode) ?? all[0];
}

/** Icoon per onderdeel van een OV-reis. */
export const LEG_EMOJI: Record<TravelLegMode, string> = {
  walk: "\u{1F6B6}",
  bike: "\u{1F6B2}",
  car: "\u{1F697}",
  rail: "\u{1F686}",
  bus: "\u{1F68C}",
  tram: "\u{1F68B}",
  subway: "\u{1F687}",
  ferry: "\u{26F4}\u{FE0F}",
  other: "\u{27A1}\u{FE0F}",
};

/**
 * Korte omschrijving van één reisonderdeel, bv.
 * "Sprinter naar Amsterdam Centraal" of "Lopen naar Almere Centrum".
 */
export function describeLeg(leg: TravelLeg): string {
  if (leg.mode === "walk") {
    return leg.to ? word("leg.walkTo", { place: leg.to }) : word("leg.walk");
  }
  if (leg.mode === "bike") {
    return leg.to ? word("leg.bikeTo", { place: leg.to }) : word("leg.bike");
  }

  // Het ritnummer staat soms al in de lijnnaam ("ICD 2422"); niet verdubbelen.
  const name =
    leg.line && leg.trip && !leg.line.includes(leg.trip)
      ? `${leg.line} ${leg.trip}`
      : (leg.line ?? leg.trip ?? "");
  if (!name) return leg.to || word("leg.continue");
  return leg.headsign ? word("leg.towards", { line: name, headsign: leg.headsign }) : name;
}

/** "HH:mm" uit een ISO-tijd, in lokale tijd. */
export function legTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Alleen de onderdelen die de moeite van het tonen waard zijn. */
export function meaningfulLegs(legs: TravelLeg[] | undefined): TravelLeg[] {
  if (!legs) return [];
  // Heel korte loopstukjes (< 1 min) voegen niets toe aan het overzicht.
  return legs.filter((leg) => leg.durationMinutes >= 1 || Boolean(leg.line));
}

/** Eén blokje in de compacte samenvatting van een reis. */
export interface JourneyStep {
  mode: TravelLegMode;
  emoji: string;
  /** Wat je moet pakken ("Sprinter", "322") of hoe lang je loopt ("8 min"). */
  label: string;
  /** true bij lopen/fietsen: dan is het geen lijn maar een duur. */
  onFoot: boolean;
}

/**
 * De reis in één regel: welke trein en bussen je pakt en hoe lang je loopt.
 * Bedoeld om in de agenda te tonen zonder dat je iets hoeft uit te klappen.
 */
export function journeySteps(legs: TravelLeg[] | undefined): JourneyStep[] {
  return meaningfulLegs(legs).map((leg) => {
    const onFoot = leg.mode === "walk" || leg.mode === "bike";
    // Bij lopen telt hoe lang; bij een lijn telt welke lijn.
    const label = onFoot
      ? `${Math.max(1, Math.round(leg.durationMinutes))} min`
      : (leg.line ?? leg.trip ?? "").trim() || describeLeg(leg);
    return { mode: leg.mode, emoji: LEG_EMOJI[leg.mode], label, onFoot };
  });
}

/**
 * De grootste vertraging binnen een reis, in minuten. Eén vertraagde trein
 * bepaalt of je op tijd bent, dus we tonen de zwaarste — niet het gemiddelde.
 */
export function journeyDelay(legs: TravelLeg[] | undefined): number {
  return (legs ?? []).reduce((worst, leg) => Math.max(worst, leg.delayMinutes ?? 0), 0);
}

/** Zit er live (actuele) informatie in deze reis, of is het puur dienstregeling? */
export function hasRealTime(legs: TravelLeg[] | undefined): boolean {
  return (legs ?? []).some((leg) => leg.realTime === true);
}

/** Is een onderdeel van deze reis uitgevallen? */
export function isCancelled(legs: TravelLeg[] | undefined): boolean {
  return (legs ?? []).some((leg) => leg.cancelled === true);
}

/** De geplande vertrektijd volgens de dienstregeling, vóór vertraging. */
export function scheduledDeparture(legs: TravelLeg[] | undefined): string | undefined {
  return (legs ?? []).find((leg) => leg.scheduledDeparture)?.scheduledDeparture;
}

/** Totale looptijd binnen een OV-reis, in minuten. */
export function walkingMinutes(legs: TravelLeg[] | undefined): number {
  return (legs ?? [])
    .filter((leg) => leg.mode === "walk")
    .reduce((total, leg) => total + leg.durationMinutes, 0);
}
