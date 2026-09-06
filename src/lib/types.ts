/**
 * Kern-datamodel van de app.
 *
 * Bewust uitbreidbaar gehouden: `TravelMode` en `TravelInfo` zijn nu alleen
 * gevuld voor de auto, maar de vorm ondersteunt later fiets/OV/lopen en
 * verkeersinformatie zonder breaking change.
 */

/**
 * Id van een activiteitstype. De app levert er vijf ("school", "werk", "gym",
 * "koken", "hobby"), maar je kunt er zelf onbeperkt bij maken — daarom een
 * vrije string en geen vaste lijst.
 */
export type CategoryId = string;

/** Een zelfgemaakt activiteitstype, met eigen naam, emoji en kleur. */
export interface CustomCategory {
  id: string;
  label: string;
  /** Eén emoji, door de gebruiker gekozen op het eigen toetsenbord. */
  emoji: string;
  color: string;
}

/** Vervoersmiddel. Alleen "car" is in de MVP geimplementeerd. */
export type TravelMode = "car" | "bike" | "walk" | "transit";

/**
 * Fiets in combinatie met OV: helemaal niet, alleen naar de halte, of aan
 * beide kanten.
 */
export type TransitBike = "none" | "start" | "both";

/**
 * Aan welke kant van één rit een fiets staat. `TransitBike` is de keuze van de
 * gebruiker ("ik heb thuis een fiets"); dit is wat dat voor een concrete rit
 * betekent. Op de heenreis staat je fiets aan het begin, op de terugreis aan
 * het eind — dezelfde keuze, de andere kant van de rit. Zonder dat onderscheid
 * mocht je heen een half uur naar het station fietsen maar terug alleen lopen,
 * en viel je thuisadres buiten bereik.
 */
export type BikeEnds = "none" | "origin" | "destination" | "both";

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
  /** Geplande tijden volgens de dienstregeling (ISO), als live tijden afwijken. */
  scheduledDeparture?: string;
  scheduledArrival?: string;
  /** true wanneer er live (actuele) informatie voor dit onderdeel is. */
  realTime?: boolean;
  /** Vertraging in minuten t.o.v. de dienstregeling; negatief = te vroeg. */
  delayMinutes?: number;
  /** true wanneer deze rit is uitgevallen. */
  cancelled?: boolean;
}

/** Eén complete reismogelijkheid in de reisplanner. */
export interface Journey {
  /** Stabiele sleutel voor React-lijsten. */
  id: string;
  /** ISO-tijden van vertrek en aankomst (actueel, dus inclusief vertraging). */
  departure: string;
  arrival: string;
  durationMinutes: number;
  transfers: number;
  legs: TravelLeg[];
  /** Grootste vertraging binnen deze reis, in minuten. */
  delayMinutes: number;
  /** true wanneer er live informatie in deze reis zit. */
  realTime: boolean;
  /** true wanneer een onderdeel van deze reis is uitgevallen. */
  cancelled: boolean;
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
 * Hoe vaak een reeks terugkomt.
 *
 * "biweekly" is er voor het practicum dat om de week valt, "monthly" voor wat
 * op een vaste dag van de maand staat. Bij maandelijks tellen de weekdagen
 * niet mee: dan geldt de dag van de maand van de startdatum.
 */
export type RecurrenceFreq = "weekly" | "biweekly" | "monthly";

/**
 * Herhaalpatroon van een activiteit. De activiteit gebruikt zijn eigen `date`
 * als startdatum: die bepaalt bij "biweekly" welke weken meedoen en bij
 * "monthly" de dag van de maand.
 */
export interface Recurrence {
  freq: RecurrenceFreq;
  /** Weekdagen volgens Date#getDay(): 0 = zondag ... 6 = zaterdag. */
  weekdays: number[];
  /** Laatste dag van de reeks (YYYY-MM-DD), of null voor onbepaalde tijd. */
  until: string | null;
}

export interface Activity {
  id: string;
  category: CategoryId;
  title: string;
  /** YYYY-MM-DD. Bij een activiteit over meer dagen: de eerste dag. */
  date: string;
  /**
   * Laatste dag (YYYY-MM-DD), voor iets dat meer dan één dag duurt: een
   * vakantie, een toetsweek, een weekend weg. Leeg of gelijk aan `date` voor
   * het gewone geval van één dag.
   */
  endDate?: string | null;
  /**
   * Duurt de hele dag, zoals een studiedag of een vakantie. Dan zeggen begin-
   * en eindtijd niets en is er ook geen vertrektijd: er is geen moment om
   * naartoe te reizen.
   */
  allDay?: boolean;
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
  /**
   * Reistijd van hier rechtstreeks naar de volgende plek van die dag. Alleen
   * gevuld wanneer thuiskomen tussendoor niet past; zie `TravelRole.onward`.
   */
  onwardTravel?: TravelInfo | null;
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
  /** Laatste dag; leeg voor één dag. */
  endDate?: string | null;
  /** Duurt de hele dag; dan tellen de tijden niet mee. */
  allDay?: boolean;
  startTime: string;
  endTime: string;
  location: GeoLocation | null;
  color: string | null;
  travelMode: TravelMode | null;
  recurrence: Recurrence | null;
  /**
   * Koppeling aan schoolwerk. Alleen gezet wanneer je vanuit een opdracht of
   * toets leertijd inplant; bij bewerken blijft de bestaande koppeling staan
   * omdat het formulier deze velden dan niet meestuurt.
   */
  linkedTaskId?: string | null;
  linkedExamId?: string | null;
  /** Herkomst, bv. "leerplan". Standaard leeg. */
  source?: string | null;
  /**
   * Overgeslagen dagen van een reeks. Normaal niet meegestuurd — die blijven
   * dan gewoon staan. Wel nodig wanneer de hele reeks verschuift: de dagen
   * staan als kalenderdatum opgeslagen en moeten dan meebewegen.
   */
  exceptions?: string[];
}

/**
 * Hoort de heenreis en/of de terugreis bij deze activiteit?
 *
 * Bij opeenvolgende activiteiten op dezelfde plek reis je één keer heen en één
 * keer terug: de heenreis hoort bij de eerste, de terugreis bij de laatste.
 * Zie `assignTravelRoles`.
 */
export interface TravelRole {
  /** De reis vanaf huis hiernaartoe hoort bij deze activiteit. */
  outbound: boolean;
  /** De reis hiervandaan naar huis hoort bij deze activiteit. */
  inbound: boolean;
  /**
   * Ga je hierna rechtstreeks door naar een andere plek in plaats van naar
   * huis, dan staat die plek hier. School uit om 17:00 en sporten om 18:30 met
   * een uur reizen naar huis: dan rijd je er direct heen.
   */
  onward: GeoLocation | null;
  /** Kom je hier rechtstreeks vandaan in plaats van van huis? Dan die plek. */
  arrivesFrom: GeoLocation | null;
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
  /**
   * Hoort deze dag bij iets dat meer dagen duurt, dan staat hier het geheel:
   * de eerste en laatste dag, en de hoeveelste dag dit is. `null` bij het
   * gewone geval van één dag.
   */
  span: { start: string; end: string; index: number; total: number } | null;
  /** Welke reizen bij deze activiteit horen, gezien de rest van de dag. */
  travelRole: TravelRole;
}

/** Het gekoppelde schoolrooster: waar het vandaan komt en hoe het is ingelezen. */
export interface TimetableLink {
  /** De iCal-link. Persoonlijk, dus behandelen als je agenda zelf. */
  url: string;
  /** Waar de lessen plaatsvinden; nodig voor de reistijd. */
  location: GeoLocation;
  /** Als welk activiteitstype de lessen worden gezet. */
  category: CategoryId;
  /** Wanneer het rooster voor het laatst is opgehaald (ISO). */
  syncedAt: string | null;
}

/**
 * Een agenda waarop je geabonneerd bent: je eigen Google-, Apple- of
 * Outlook-agenda als ical-link. Anders dan het rooster mag hier meer dan één
 * van bestaan en is een plek optioneel: veel afspraken zijn thuis of online.
 *
 * De link zelf is net zo persoonlijk als je agenda: hij blijft op je apparaat
 * staan en gaat alleen naar onze eigen server om hem op te halen.
 */
export interface CalendarSubscription {
  id: string;
  /** Zelfgekozen naam, bv. "Mijn Google-agenda". */
  name: string;
  url: string;
  /** Als welk activiteitstype de afspraken binnenkomen. */
  category: CategoryId;
  /** Vaste plek voor deze afspraken; null = geen plek, dus geen reistijd. */
  location: GeoLocation | null;
  /** Wanneer deze agenda voor het laatst is opgehaald (ISO). */
  syncedAt: string | null;
}

/** Een locatie die de gebruiker heeft bewaard om te hergebruiken. */
export interface SavedPlace {
  id: string;
  /** Naam uit de zoekopdracht, bv. "Basic-Fit, Almere". */
  name: string;
  /**
   * Zelfgekozen naam ("Werk", "Bijbaan"). Staat die er, dan wint hij van zowel
   * de categorie als het adres. Zie `placeDisplayName`.
   */
  customName?: string;
  location: GeoLocation;
  createdAt: string;
}

export interface Settings {
  home: GeoLocation | null;
  /** Bewaarde locaties, herbruikbaar bij het toevoegen van een activiteit. */
  savedPlaces: SavedPlace[];
  /** Vaste locatie per categorie: categorie -> id uit `savedPlaces`. */
  categoryPlaces: Partial<Record<CategoryId, string>>;
  /** Zelfgemaakte activiteitstypes, naast de vijf standaardtypes. */
  customCategories: CustomCategory[];
  /** Veiligheidsmarge in minuten, standaard 10. */
  bufferMinutes: number;
  travelMode: TravelMode;
  /**
   * Hoe je bij de halte komt bij een OV-reis. Zo reist bijna elke student in
   * Nederland: fietsen naar het station, en aan de andere kant een tweede fiets
   * of een OV-fiets. Lopend duurt dezelfde reis al snel een half uur langer.
   */
  transitBike?: TransitBike;
  /**
   * Je gekoppelde rooster, zodat de app het zelf bij kan houden. Zonder deze
   * gegevens zou je na elke roosterwijziging opnieuw alles moeten invullen.
   */
  timetable?: TimetableLink | null;
  /**
   * Je eigen agenda's erbij, als ical-abonnement. Zo staat wat je in Google of
   * Apple hebt gezet ook in je vertrektijden, zonder alles opnieuw in te typen.
   */
  calendars?: CalendarSubscription[];
  /**
   * Hoeveel minuten vóór je vertrektijd je een melding wilt. `null` = uit.
   * Zie `useReminders` voor wat er wel en niet kan zonder pushserver.
   */
  reminderMinutes?: number | null;
  /**
   * Wanneer je deze instellingen voor het laatst wijzigde (ISO). Nodig bij het
   * samenvoegen met de cloud: zonder dit won de cloud altijd, en verdween wat
   * je offline had aangepast.
   */
  updatedAt?: string;
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
