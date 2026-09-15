/**
 * De looptijden in een rit narekenen op je eigen tempo.
 *
 * De planner geeft per loopstuk een afstand en een tijd, maar die tijd is niet
 * de afstand gedeeld door de loopsnelheid die we meesturen. Er zit straftijd in
 * uit de kaartgegevens: oversteken, stoplichten, trappen, hoogteverschil. Over
 * tien ritten gemeten komt dat neer op 4,6 km/h terwijl we om 5,04 vragen — en
 * bij een kapot stuk kaart veel erger. Bij Lelystad Palazzo rekent de planner
 * 211 meter door de Torenvalktunnel op tien minuten (1,2 km/h), en dat schaalt
 * niet mee met de meegestuurde snelheid: zonder loopsnelheid 20 minuten, op
 * 5 km/h 18, op 7,2 km/h nog altijd 15.
 *
 * 9292 doet dat niet: daar is een loopstuk gewoon de afstand gedeeld door je
 * loopsnelheid. Zolang wij er per loopstuk een minuut straftijd bij houden,
 * staat er in deze app bij elke reis een paar minuten meer dan bij 9292, en
 * dan klopt het advies niet meer met wat de gebruiker naast zich heeft liggen.
 *
 * Daarom rekent de app elk loopstuk zelf na, op dezelfde manier als 9292: de
 * afstand van de kaart gedeeld door de vaste loopsnelheid, naar boven op hele
 * minuten. De marge die je wilt hebben staat los in je instellingen (standaard
 * tien minuten) — die hoort daar, zichtbaar en zelf te kiezen, en niet
 * verstopt in elk loopstuk.
 *
 * Een rit wordt hier nooit langer: is de planner al sneller dan jouw tempo,
 * dan blijft zijn tijd staan.
 *
 * Bewust zonder `server-only`: pure rekenkunde, zodat het los te testen is.
 */

/** Het minimum dat we van een deelrit moeten weten om hem na te rekenen. */
export interface WalkLeg {
  mode?: string;
  /** Reisduur in seconden. */
  duration?: number;
  /** Lengte van het loopstuk in meters. */
  distance?: number;
  startTime?: string;
  endTime?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
}

export interface WalkItinerary {
  /** Reisduur in seconden. */
  duration?: number;
  startTime?: string;
  endTime?: string;
  legs?: WalkLeg[];
}

function timeOf(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function shift(value: string | undefined, seconds: number): string | undefined {
  const ms = timeOf(value);
  return ms === null ? value : new Date(ms + seconds * 1000).toISOString();
}

/**
 * Wat dit loopstuk op de opgegeven snelheid kost, in hele minuten naar boven.
 * De app toont toch geen seconden, en zo blijft "aankomst" hetzelfde als
 * "vertrek plus de looptijd die eronder staat".
 */
function walkSeconds(distance: number, speed: number): number {
  return Math.ceil(distance / speed / 60) * 60;
}

/** Hoeveel seconden dit loopstuk korter mag; 0 als er niets te winnen valt. */
function gainOn(leg: WalkLeg | undefined, speed: number): number {
  if (!leg || (leg.mode ?? "").toUpperCase() !== "WALK") return 0;
  const { distance, duration } = leg;
  if (typeof distance !== "number" || !(distance > 0)) return 0;
  if (typeof duration !== "number" || !(duration > 0)) return 0;
  const gained = duration - walkSeconds(distance, speed);
  return gained > 0 ? gained : 0;
}

/**
 * Rekent alle loopstukken van een rit na op de opgegeven loopsnelheid (in
 * meters per seconde) en geeft de rit terug met de tijden die daarbij horen.
 *
 * Welk uiteinde van een loopstuk blijft staan, ligt vast door wat er niet op
 * je wacht. Het eerste stuk eindigt bij de bus of de trein: die vertrekt hoe
 * dan ook, dus dat einde blijft staan en je gaat later de deur uit. Elk ander
 * stuk begint als je uitstapt: dat begin blijft staan en je bent eerder waar
 * je wezen moet. Een rit die alleen uit lopen bestaat telt als dat tweede
 * geval — je vertrekt wanneer je zelf wilt en komt eerder aan.
 *
 * Verandert er niets, dan komt de rit ongewijzigd terug.
 */
export function applyWalkSpeed<T extends WalkItinerary>(itinerary: T, speed: number): T {
  const legs = itinerary.legs;
  if (!legs?.length || speed <= 0) return itinerary;

  const gains = legs.map((leg) => gainOn(leg, speed));
  if (gains.every((gain) => gain === 0)) return itinerary;

  // Alleen het eerste stuk schuift met zijn begin mee, en dat kan niet als er
  // niets achter zit om zijn einde vast te houden.
  const firstAnchorsEnd = legs.length > 1;

  const corrected = legs.map((leg, index) => {
    const gained = gains[index];
    if (gained === 0) return leg;
    const duration = (leg.duration ?? 0) - gained;
    if (index === 0 && firstAnchorsEnd) {
      return {
        ...leg,
        duration,
        startTime: shift(leg.startTime, gained),
        scheduledStartTime: shift(leg.scheduledStartTime, gained),
      };
    }
    return {
      ...leg,
      duration,
      endTime: shift(leg.endTime, -gained),
      scheduledEndTime: shift(leg.scheduledEndTime, -gained),
    };
  });

  // Een tussenstuk maakt de reis niet korter, alleen je wachttijd bij de
  // volgende halte langer: de reis loopt van het eerste begin tot het laatste
  // einde, en daar zitten alleen die twee aan vast.
  const atStart = firstAnchorsEnd ? gains[0] : 0;
  const atEnd = gains[gains.length - 1];
  const first = corrected[0];
  const last = corrected[corrected.length - 1];

  return {
    ...itinerary,
    duration: Math.max(0, (itinerary.duration ?? 0) - atStart - atEnd),
    startTime: atStart > 0 ? (first.startTime ?? itinerary.startTime) : itinerary.startTime,
    endTime: atEnd > 0 ? (last.endTime ?? itinerary.endTime) : itinerary.endTime,
    legs: corrected,
  };
}
