import type {
  Activity,
  ActivityOccurrence,
  BikeEnds,
  GeoLocation,
  Settings,
  TravelMode,
} from "./types";
import {
  MINUTES_PER_DAY,
  addDaysToKey,
  minutesToTime,
  timeToMinutes,
  toDateKey,
  toDateTime,
} from "./time";
import { occursOn, spansDays } from "./recurrence";

/** Het vervoermiddel voor deze activiteit: eigen keuze, anders de standaard. */
export function travelModeFor(activity: Activity, settings: Settings): TravelMode {
  return activity.travelMode ?? settings.travelMode;
}

/**
 * Sleutel waarmee we bepalen of een opgeslagen reis nog geldig is. Bij OV hoort
 * het tijdstip erbij: een andere dag of tijd betekent een andere dienstregeling.
 */
export function travelKey(
  home: GeoLocation | null,
  destination: GeoLocation | null,
  mode: TravelMode,
  timeSlot?: string | null,
  bike?: BikeEnds,
): string | null {
  if (!home || !destination) return null;
  const round = (n: number) => n.toFixed(5);
  const slot = mode === "transit" && timeSlot ? `@${timeSlot}` : "";
  // De fietskeuze hoort bij de sleutel: zet je hem om, dan moet de reis
  // opnieuw berekend worden in plaats van de oude looptijd te blijven tonen.
  const bikePart = mode === "transit" && bike && bike !== "none" ? `+${bike}` : "";
  return `${round(home.lat)},${round(home.lon)}>${round(destination.lat)},${round(destination.lon)}@${mode}${slot}${bikePart}`;
}

/** Hoe ver vooruit we zoeken naar de eerstvolgende dag van een reeks. */
const OCCURRENCE_LOOKAHEAD_DAYS = 60;

/**
 * De eerstvolgende dag waarop deze activiteit plaatsvindt, vanaf vandaag.
 * Voor een eenmalige activiteit is dat gewoon zijn eigen datum. Bij OV plannen
 * we op die dag, zodat de dienstregeling klopt.
 */
export function nextOccurrenceDate(activity: Activity, now: Date = new Date()): string {
  // Eén dag, één antwoord. Maar een reeks valt op meer dagen, en iets met een
  // einddatum (een stage, een vakantie) ook — zonder dat onderscheid vroeg de
  // app in oktober nog de dienstregeling van de eerste stagedag in september.
  if (!activity.recurrence && !spansDays(activity)) return activity.date;

  const today = toDateKey(now);
  for (let offset = 0; offset <= OCCURRENCE_LOOKAHEAD_DAYS; offset += 1) {
    const dateKey = addDaysToKey(today, offset);
    if (occursOn(activity, dateKey)) return dateKey;
  }
  return activity.date;
}

export function bufferFor(activity: Activity, settings: Settings): number {
  return activity.bufferMinutes ?? settings.bufferMinutes;
}

/**
 * Alles wat nodig is om de reis van een activiteit op te halen: het
 * vervoermiddel, de sleutels voor heen en terug en (bij OV) de tijdstippen.
 */
export interface TravelPlan {
  mode: TravelMode;
  /** Aan welke kant van de heenreis je fiets staat. */
  outboundBike: BikeEnds;
  /** En van de terugreis — dat is de andere kant van dezelfde rit. */
  returnBike: BikeEnds;
  /** En van een doorreis, die thuis niet aandoet. */
  onwardBike: BikeEnds;
  outboundKey: string;
  returnKey: string;
  /** Uiterlijke aankomst voor de heenreis (ISO); alleen bij OV. */
  arriveBy?: string;
  /** Vroegste vertrek voor de terugreis (ISO); alleen bij OV. */
  departAt?: string;
  /** Waar je rechtstreeks heen gaat na afloop; leeg als je naar huis gaat. */
  onwardTo?: GeoLocation;
  onwardKey?: string;
}

export function travelPlanFor(
  activity: Activity,
  settings: Settings,
  now: Date = new Date(),
  onward?: GeoLocation | null,
): TravelPlan | null {
  return travelPlanForDate(activity, settings, nextOccurrenceDate(activity, now), onward);
}

/**
 * Dezelfde reis, maar voor één specifieke dag. Bij een herhalende activiteit
 * rijdt er op dinsdag een andere trein dan op maandag, dus de dag hoort bij de
 * berekening — anders staat er een vertrektijd die op die dag niet klopt.
 */
export function travelPlanForDate(
  activity: Activity,
  settings: Settings,
  dateKey: string,
  onward?: GeoLocation | null,
): TravelPlan | null {
  // Iets dat de hele dag duurt heeft geen moment om naartoe te reizen; een
  // vertrektijd voor "herfstvakantie" zou nergens op slaan.
  if (activity.allDay) return null;
  if (!settings.home || !activity.location) return null;

  const mode = travelModeFor(activity, settings);

  // Bij OV rekenen we met echte ritten: heen "uiterlijk aankomen om
  // starttijd - marge", terug "vertrekken vanaf de eindtijd".
  const arriveByDate =
    mode === "transit"
      ? new Date(
          toDateTime(dateKey, activity.startTime).getTime() -
            bufferFor(activity, settings) * 60_000,
        )
      : null;
  const departAtDate = mode === "transit" ? toDateTime(dateKey, activity.endTime) : null;

  // Het tijdstip dat we de planner echt vragen, niet de starttijd op het
  // rooster. Anders zit de marge er niet in: zet je hem van 10 op 30 minuten,
  // dan vraagt de app een andere rit op maar vindt hij de oude uitkomst nog
  // geldig, en verandert er niets op het scherm.
  const outboundSlot = arriveByDate ? arriveByDate.toISOString() : null;
  const returnSlot = departAtDate ? departAtDate.toISOString() : null;

  const bike = settings.transitBike ?? "none";
  // Dezelfde keuze, per rit de andere kant op. "start" betekent: mijn fiets
  // staat thuis — dus aan het begin van de heenreis en aan het eind van de
  // terugreis. Een doorreis komt niet langs huis, dus daar staat hij niet.
  // "both" (een tweede fiets of een OV-fiets) geldt overal aan beide kanten.
  const outboundBike: BikeEnds = bike === "both" ? "both" : bike === "start" ? "origin" : "none";
  const returnBike: BikeEnds =
    bike === "both" ? "both" : bike === "start" ? "destination" : "none";
  const onwardBike: BikeEnds = bike === "both" ? "both" : "none";

  const outboundKey = travelKey(settings.home, activity.location, mode, outboundSlot, outboundBike);
  const returnKey = travelKey(activity.location, settings.home, mode, returnSlot, returnBike);
  if (!outboundKey || !returnKey) return null;

  // De doorreis vertrekt op hetzelfde moment als de reis naar huis zou doen:
  // zodra je klaar bent.
  const onwardKey = onward
    ? travelKey(activity.location, onward, mode, returnSlot, onwardBike)
    : null;

  return {
    mode,
    outboundBike,
    returnBike,
    onwardBike,
    outboundKey,
    returnKey,
    arriveBy: arriveByDate?.toISOString(),
    departAt: departAtDate?.toISOString(),
    onwardTo: onward ?? undefined,
    onwardKey: onwardKey ?? undefined,
  };
}

/**
 * Heeft deze activiteit een (nieuwe) reisberekening nodig? Heen- en terugreis
 * worden samen opgehaald, dus één verouderde sleutel is genoeg.
 */
export function needsTravelRefresh(
  activity: Activity,
  settings: Settings,
  now: Date = new Date(),
  onward?: GeoLocation | null,
): boolean {
  const plan = travelPlanFor(activity, settings, now, onward);
  if (!plan) return false;
  if (activity.travel?.key !== plan.outboundKey) return true;
  if (activity.returnTravel?.key !== plan.returnKey) return true;
  // Een doorreis die er hoort te zijn maar nog niet is, of een oude die er nog
  // staat terwijl je inmiddels gewoon naar huis gaat.
  return (activity.onwardTravel?.key ?? null) !== (plan.onwardKey ?? null);
}

/** Minuten sinds middernacht van een ISO-tijdstip, in lokale tijd. */
function localMinutes(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

export interface DepartureInfo {
  /** "HH:mm" */
  time: string;
  /** Minuten sinds middernacht; kan negatief zijn als je de dag ervoor vertrekt. */
  minutes: number;
  travelMinutes: number;
  bufferMinutes: number;
  /** true wanneer het vertrek op de vorige kalenderdag valt. */
  previousDay: boolean;
}

/**
 * VERTREKTIJD = STARTTIJD - REISTIJD - VEILIGHEIDSMARGE
 *
 * Bij OV komt de vertrektijd rechtstreeks uit de geplande rit: dat is het
 * moment waarop je trein of bus echt gaat, niet een rekensom.
 */
export function computeDeparture(
  activity: ActivityOccurrence,
  settings: Settings,
): DepartureInfo | null {
  // Zit je er al, dan valt er niet te vertrekken: de heenreis hoort bij de
  // eerste activiteit van het verblijf, niet bij elk uur. En kom je van een
  // andere plek, dan staat die reis daar al; hier zou hij dubbel staan.
  if (!activity.travelRole.outbound || activity.travelRole.arrivesFrom) return null;
  if (!activity.location || !activity.travel) return null;

  const buffer = bufferFor(activity, settings);
  const travelMinutes = activity.travel.durationMinutes;
  const startMinutes = timeToMinutes(activity.startTime);

  if (activity.travel.plannedDeparture) {
    const departure = new Date(activity.travel.plannedDeparture);
    const clockMinutes = departure.getHours() * 60 + departure.getMinutes();
    // Uit de datum van de rit zelf, niet uit een vergelijking van kloktijden.
    // Anders geldt elke rit die later vertrekt dan de activiteit begint als
    // "de dag ervoor" — en dat gebeurt echt, want als er niets op tijd rijdt
    // toont de app de eerstvolgende rit daarna. Die verdween dan uit de dag.
    const previousDay = toDateKey(departure) < activity.date;
    // Bij een vertrek de dag ervoor telt `minutes` negatief door, net als bij
    // de rekensom hieronder; daar rekent `departureDateTime` mee.
    const minutes = previousDay ? clockMinutes - MINUTES_PER_DAY : clockMinutes;
    return {
      time: minutesToTime(minutes),
      minutes,
      travelMinutes,
      bufferMinutes: buffer,
      previousDay,
    };
  }

  const minutes = startMinutes - travelMinutes - buffer;
  return {
    time: minutesToTime(minutes),
    minutes,
    travelMinutes,
    bufferMinutes: buffer,
    previousDay: minutes < 0,
  };
}

/**
 * Absoluut moment van vertrek, handig voor sorteren, "eerstvolgende" en het
 * plannen van meldingen.
 *
 * Bewust opgebouwd uit een datum en een kloktijd in plaats van "starttijd min
 * zoveel milliseconden": in de nacht van de tijdswissel duurt een dag 23 of 25
 * uur, en dan zet een aftreksom in milliseconden je vertrek een uur mis.
 */
export function departureDateTime(
  activity: ActivityOccurrence,
  settings: Settings,
): Date | null {
  const departure = computeDeparture(activity, settings);
  if (!departure) return null;
  const dateKey = departure.previousDay ? addDaysToKey(activity.date, -1) : activity.date;
  return toDateTime(dateKey, departure.time);
}

export interface OnwardInfo {
  /** Waar je heen gaat. */
  to: GeoLocation;
  /** Hoe laat je hier vertrekt, "HH:mm". */
  time: string;
  /** Hoe laat je daar bent, "HH:mm". */
  arrival: string;
  travelMinutes: number;
  /** true wanneer je later aankomt dan de volgende activiteit begint. */
  late: boolean;
}

/**
 * DOORREIS = van hier rechtstreeks naar de volgende plek.
 *
 * Alleen wanneer thuiskomen tussendoor niet past. Zonder dit zou de app zeggen
 * "om 18:08 thuis" en tegelijk "om 17:48 vertrekken naar de sportschool", twee
 * dingen die niet allebei kunnen.
 */
export function computeOnward(
  activity: ActivityOccurrence,
  nextStartTime: string | null,
): OnwardInfo | null {
  const to = activity.travelRole.onward;
  if (!to || !activity.onwardTravel) return null;

  const endMinutes = timeToMinutes(activity.endTime);
  const travelMinutes = activity.onwardTravel.durationMinutes;
  const arrivalMinutes = activity.onwardTravel.plannedArrival
    ? localMinutes(activity.onwardTravel.plannedArrival)
    : endMinutes + travelMinutes;
  const departureMinutes = activity.onwardTravel.plannedDeparture
    ? localMinutes(activity.onwardTravel.plannedDeparture)
    : endMinutes;

  return {
    to,
    time: minutesToTime(departureMinutes),
    arrival: minutesToTime(arrivalMinutes),
    travelMinutes,
    late: nextStartTime !== null && arrivalMinutes > timeToMinutes(nextStartTime),
  };
}

export interface ReturnInfo {
  /** Verwachte thuiskomst, "HH:mm". */
  time: string;
  /** Minuten sinds middernacht; kan boven 1440 uitkomen. */
  minutes: number;
  travelMinutes: number;
  /** true wanneer je pas na middernacht thuis bent. */
  nextDay: boolean;
}

/**
 * THUISKOMST = EINDTIJD + REISTIJD TERUG
 *
 * Bewust zonder veiligheidsmarge: die is bedoeld om op tijd aan te komen, niet
 * om een schatting van je thuiskomst op te rekken. Bij OV komt de aankomst uit
 * de geplande rit.
 */
export function computeReturn(
  activity: ActivityOccurrence,
  settings: Settings,
): ReturnInfo | null {
  // Alleen na je laatste uur op die plek ga je naar huis, en alleen als je
  // niet rechtstreeks doorreist naar de volgende plek.
  if (!activity.travelRole.inbound || activity.travelRole.onward) return null;
  if (!activity.location || !activity.returnTravel) return null;
  void settings;

  const travelMinutes = activity.returnTravel.durationMinutes;
  const endMinutes = timeToMinutes(activity.endTime);

  if (activity.returnTravel.plannedArrival) {
    const arrival = localMinutes(activity.returnTravel.plannedArrival);
    // Wikkelt de aankomst over middernacht, dan tellen we een dag op.
    const minutes = arrival < endMinutes ? arrival + MINUTES_PER_DAY : arrival;
    return {
      time: minutesToTime(minutes),
      minutes,
      travelMinutes,
      nextDay: minutes >= MINUTES_PER_DAY,
    };
  }

  const minutes = endMinutes + travelMinutes;
  return {
    time: minutesToTime(minutes),
    minutes,
    travelMinutes,
    nextDay: minutes >= MINUTES_PER_DAY,
  };
}
