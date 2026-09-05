import type { TravelLeg, TravelLegMode, TravelMode } from "./types";

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
export const ALL_TRAVEL_MODES: TravelModeMeta[] = [
  { id: "car", label: "Auto", emoji: "\u{1F697}", hint: "Snelste route met de auto" },
  { id: "bike", label: "Fiets", emoji: "\u{1F6B2}", hint: "Fietsroute" },
  { id: "transit", label: "OV", emoji: "\u{1F686}", hint: "Trein, bus, tram en metro" },
  { id: "walk", label: "Lopen", emoji: "\u{1F6B6}", hint: "Wandelroute" },
];

/** De vervoermiddelen die je kunt kiezen bij een activiteit. */
export const TRAVEL_MODES: TravelModeMeta[] = ALL_TRAVEL_MODES.filter((m) => m.id !== "walk");

const MODE_BY_ID = new Map(ALL_TRAVEL_MODES.map((m) => [m.id, m]));

export function travelModeMeta(mode: TravelMode) {
  return MODE_BY_ID.get(mode) ?? ALL_TRAVEL_MODES[0];
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
  if (leg.mode === "walk") return leg.to ? `Lopen naar ${leg.to}` : "Lopen";
  if (leg.mode === "bike") return leg.to ? `Fietsen naar ${leg.to}` : "Fietsen";

  // Het ritnummer staat soms al in de lijnnaam ("ICD 2422"); niet verdubbelen.
  const name =
    leg.line && leg.trip && !leg.line.includes(leg.trip)
      ? `${leg.line} ${leg.trip}`
      : (leg.line ?? leg.trip ?? "");
  const direction = leg.headsign ? ` richting ${leg.headsign}` : "";
  return name ? `${name}${direction}` : leg.to || "Verder reizen";
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

/** Totale looptijd binnen een OV-reis, in minuten. */
export function walkingMinutes(legs: TravelLeg[] | undefined): number {
  return (legs ?? [])
    .filter((leg) => leg.mode === "walk")
    .reduce((total, leg) => total + leg.durationMinutes, 0);
}
