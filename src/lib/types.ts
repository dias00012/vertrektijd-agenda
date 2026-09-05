/**
 * Kern-datamodel van de app.
 *
 * Bewust uitbreidbaar gehouden: `TravelMode` en `TravelInfo` zijn nu alleen
 * gevuld voor de auto, maar de vorm ondersteunt later fiets/OV/lopen en
 * verkeersinformatie zonder breaking change.
 */

export type CategoryId = "school" | "werk" | "gym" | "koken" | "hobby";

/** Vervoersmiddel. Alleen "car" is in de MVP geimplementeerd. */
export type TravelMode = "car" | "bike" | "walk" | "transit";

export interface GeoLocation {
  /** Weergavenaam zoals de gebruiker die herkent, bv. "Windesheim, Almere". */
  label: string;
  lat: number;
  lon: number;
}

/** Vervoerswijze van één onderdeel van een reis. */
export type TravelLegMode =
  | "walk"
  | "bike"
  | "car"
  | "rail"
  | "bus"
  | "tram"
  | "subway"
  | "ferry"
  | "other";

/**
 * Eén onderdeel van een reis, bv. "lopen naar het station" of
 * "Sprinter naar Amsterdam Centraal, spoor 1". Alleen gevuld bij OV-reizen.
 */
export interface TravelLeg {
  mode: TravelLegMode;
  durationMinutes: number;
  /** Naam van de halte/plek waar dit deel begint en eindigt. */
  from: string;
  to: string;
  /** ISO-tijden; alleen bij OV-onderdelen met een dienstregeling. */
  departure?: string;
  arrival?: string;
  /** Lijnnaam, bv. "Sprinter", "IC" of "3". */
  line?: string;
  /** Richting/eindbestemming zoals op het bord. */
  headsign?: string;
  /** Vervoerder, bv. "NS" of "GVB". */
  agency?: string;
  /** Ritnummer, bv. treinnummer "4620". */
  trip?: string;
  /** Spoor of perron van vertrek. */
  track?: string;
}

export interface TravelInfo {
  durationMinutes: number;
  distanceKm: number;
  mode: TravelMode;
  /** Naam van de provider die dit berekende, bv. "osrm" of "openrouteservice". */
  provider: string;
  /** Onderdelen van de reis; alleen bij OV. */
  legs?: TravelLeg[];
  /** Aantal overstappen; alleen bij OV. */
  transfers?: number;
  /**
   * Werkelijke vertrek-/aankomsttijd volgens de dienstregeling (ISO). Bij OV is
   * de vertrektijd geen simpele aftrekking maar het moment van een echte rit.
   */
  plannedDeparture?: string;
  plannedArrival?: string;
  /** ISO-timestamp van de berekening. */
  computedAt: string;
  /**
   * Sleutel van thuis+bestemming+modus. Zodra deze niet meer matcht met de
   * huidige situatie is de reistijd verouderd en wordt hij opnieuw opgehaald.
   */
  key: string;
}

/**
 * Herhaalpatroon van een activiteit. Nu alleen wekelijks; `freq` staat er zodat
 * er later dagelijks/maandelijks bij kan zonder het opgeslagen model te breken.
 */
export interface Recurrence {
  freq: "weekly";
  /** Weekdagen volgens Date#getDay(): 0 = zondag ... 6 = zaterdag. */
  weekdays: number[];
  /** Laatste dag van de reeks (YYYY-MM-DD), of null voor onbepaalde tijd. */
  until: string | null;
}

export interface Activity {
  id: string;
  category: CategoryId;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  /** null = activiteit zonder locatie (bv. koken thuis). */
  location: GeoLocation | null;
  /** Eigen kleur (hex); null = de standaardkleur van de categorie. */
  color: string | null;
  /**
   * Waar deze activiteit vandaan komt: "weekplan" voor activiteiten die uit de
   * weekplanning zijn gezet, null voor wat je zelf hebt toegevoegd. Hiermee kan
   * de weekplanning zijn eigen activiteiten vervangen zonder de rest te raken.
   */
  source: string | null;
  /** null = eenmalige activiteit; anders geldt `date` als startdatum. */
  recurrence: Recurrence | null;
  /** Losse dagen (YYYY-MM-DD) die uit een herhalende reeks zijn verwijderd. */
  exceptions: string[];
  /** Reistijd van huis naar de bestemming. */
  travel: TravelInfo | null;
  /** Reistijd van de bestemming terug naar huis. */
  returnTravel: TravelInfo | null;
  /** Laatste foutmelding van de reistijdberekening, indien die faalde. */
  travelError: string | null;
  /** Per-activiteit marge; null = globale instelling gebruiken. */
  bufferMinutes: number | null;
  /** Vervoermiddel voor deze activiteit; null = de standaard uit instellingen. */
  travelMode?: TravelMode | null;
  /** Optioneel: koppeling naar een taak (huiswerk) waar dit blok bij hoort. */
  linkedTaskId?: string | null;
  /** Optioneel: koppeling naar een toets waar dit blok bij hoort. */
  linkedExamId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wat het formulier oplevert; id/timestamps/travel worden door de store gezet. */
export interface ActivityDraft {
  category: CategoryId;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: GeoLocation | null;
  color: string | null;
  travelMode: TravelMode | null;
  recurrence: Recurrence | null;
}

/**
 * Eén concrete dag uit een activiteit. Voor een eenmalige activiteit is dat de
 * activiteit zelf; voor een reeks een kopie met `date` op die specifieke dag.
 * `id` blijft de id van de reeks, zodat bewerken en reistijden ongewijzigd werken.
 */
export interface ActivityOccurrence extends Activity {
  /** Unieke sleutel voor deze dag: "<id>:<datum>". */
  occurrenceId: string;
  /** true wanneer deze dag uit een herhalende reeks komt. */
  recurring: boolean;
}

/** Een locatie die de gebruiker heeft bewaard om te hergebruiken. */
export interface SavedPlace {
  id: string;
  /** Naam zoals de gebruiker hem herkent, bv. "Basic-Fit, Almere". */
  name: string;
  location: GeoLocation;
  createdAt: string;
}

export interface Settings {
  home: GeoLocation | null;
  /** Bewaarde locaties, herbruikbaar bij het toevoegen van een activiteit. */
  savedPlaces: SavedPlace[];
  /** Vaste locatie per categorie: categorie -> id uit `savedPlaces`. */
  categoryPlaces: Partial<Record<CategoryId, string>>;
  /** Veiligheidsmarge in minuten, standaard 10. */
  bufferMinutes: number;
  travelMode: TravelMode;
}

export interface GeocodeResult extends GeoLocation {
  /** Korte naam voor de eerste regel van een suggestie. */
  name: string;
  /** Rest van het adres, tweede regel van een suggestie. */
  context: string;
}

export interface ApiError {
  error: string;
}

/** Antwoord van /api/travel. */
export interface TravelResult {
  durationMinutes: number;
  distanceKm: number;
  provider: string;
  mode: TravelMode;
  legs?: TravelLeg[];
  transfers?: number;
  plannedDeparture?: string;
  plannedArrival?: string;
}

/* --- Schoolwerk: taken (huiswerk/opdrachten) en toetsen ------------------- */

/** Prioriteit, gedeeld door taken en toetsen. */
export type SchoolworkPriority = "high" | "medium" | "low" | "later";

/** Voortgang, gedeeld door taken en toetsen. */
export type SchoolworkStatus = "todo" | "doing" | "done";

/** Eén (deel)stap van een opdracht, afvinkbaar in de schoolwerk-weergave. */
export interface TaskStep {
  id: string;
  title: string;
  estimatedMinutes?: number;
  done: boolean;
}

/** Een opdracht of huiswerk met deadline. */
export interface Task {
  id: string;
  subject: string;
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  deadline: string;
  estimatedMinutes: number;
  priority: SchoolworkPriority;
  status: SchoolworkStatus;
  steps?: TaskStep[];
  createdAt: string;
  updatedAt: string;
}

/** Een toets met datum en te leren onderwerpen. */
export interface Exam {
  id: string;
  subject: string;
  title?: string;
  /** YYYY-MM-DD */
  date: string;
  topics?: string[];
  prepMinutes?: number;
  priority: SchoolworkPriority;
  status: SchoolworkStatus;
  createdAt: string;
  updatedAt: string;
}
