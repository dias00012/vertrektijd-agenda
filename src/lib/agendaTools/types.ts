import type { Activity, Exam, Settings, Task } from "../types";
import type { FreeSlot, MovableBlock } from "../planning";

/**
 * De drie handelingen die de connector aanbiedt: de agenda lezen, blokken
 * bewaren, blokken weggooien. Bewust losgekoppeld van HTTP en van Supabase,
 * zodat ze zonder netwerk te testen zijn.
 *
 * Alles draait om precies dezelfde vorm als de import/export (`backup.ts`) en
 * de synchronisatie (`sync.ts`). De planner die hier binnenkomt krijgt dus de
 * data die de app zelf ook gebruikt, en schrijft terug wat de app zelf ook
 * inleest — geen tweede waarheid die na een half jaar uit de pas loopt.
 */

/**
 * Wat er in één rij van `user_data` staat. Structureel gelijk aan `SyncPayload`
 * uit `sync.ts`; hier apart getypt omdat die module alleen in de browser draait
 * en deze code op de server.
 */
export interface AgendaData {
  settings: Settings | null;
  activities: Activity[];
  tasks: Task[];
  exams: Exam[];
  /** Grafstenen van weggegooide items, zodat ze niet terugkomen bij de sync. */
  deletions?: { id: string; at: string }[];
}

/** Hoeveel dagen `read_agenda` teruggeeft als er geen periode wordt gevraagd. */
export const DEFAULT_DAYS = 14;

/**
 * Harde bovengrens op de gevraagde periode. Een jaar aan dagen opsturen helpt
 * geen enkele planning en vult wel het hele gesprek.
 */
export const MAX_DAYS = 62;

/** Hoeveel activiteiten er in één keer bewaard mogen worden. */
export const MAX_SAVE = 100;

export const WEEKDAYS = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];

/** Een activiteit zoals de planner hem te zien krijgt: plat en zonder ruis. */
export interface ReadActivity {
  id: string;
  title: string;
  category: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  /** Adres van de bestemming; ontbreekt bij iets zonder plek (thuis, online). */
  location?: string;
  /** Hoe laat je van huis moet, als de app dat heeft uitgerekend. */
  departure?: string;
  travelMinutes?: number;
  /**
   * true wanneer `departure` een schatting is: de heenreis was nog niet
   * berekend, dus is de thuisreis aangehouden.
   *
   * Dit ontbrak, en dat was geen detail. Zonder heenreis stond er gewoon géén
   * vertrektijd in dit antwoord -- geen "onbekend", maar stilte. En stilte
   * vult een planner in met iets plausibels. Vandaar deze twee velden: liever
   * een schatting die zichzelf zo noemt, of een eerlijk "ik weet het niet".
   */
  departureEstimated?: boolean;
  /** true wanneer de app geen enkele reistijd voor dit blok kent. */
  travelUnknown?: boolean;
  /** Waarom de reis niet uitgerekend kon worden; alleen als de app dat weet. */
  travelNote?: string;
  /** Hoe laat je er bent met de gevonden rit. */
  arrival?: string;
  /** true wanneer je met de gevonden rit ná de begintijd aankomt. */
  arrivesLate?: boolean;
  /**
   * Hoe laat je weer thuis bent, eindtijd plus de reis terug.
   *
   * Dit is het getal waar een planning op stukloopt als je het weglaat. Werk je
   * tot 17:00 in Lelystad, dan ben je pas om 17:54 thuis -- en een leerblok om
   * 17:20 bestaat alleen op papier.
   */
  backHome?: string;
  /** Duur van de reis terug in minuten. */
  returnMinutes?: number;
  /**
   * true wanneer `backHome` een schatting is: de app had de thuisreis nog niet
   * berekend, dus is de heenreis aangehouden. Goed genoeg om op te plannen,
   * niet goed genoeg om op te zweren.
   */
  backHomeEstimated?: boolean;
  /** "leerplan" voor blokken die uit een leerplan komen, anders afwezig. */
  source?: string;
  linkedTaskId?: string;
  /** De stap binnen die taak waar dit blok voor is. */
  linkedStepId?: string;
  linkedExamId?: string;
  /** true wanneer deze dag uit een herhalende reeks komt. */
  recurring?: boolean;
}

export interface ReadDay {
  date: string;
  weekday: string;
  activities: ReadActivity[];
  /**
   * De gaten waarin werkelijk iets kan. Uitgerekend met de reistijden erin
   * verwerkt, dus dit is de dag zoals je hem beleeft -- niet de lijst rijen
   * waar je die dag zelf uit moet afleiden.
   */
  free: FreeSlot[];
  /** Wat er zou kunnen wijken als `free` te weinig oplevert. Altijd vragen. */
  movable: MovableBlock[];
  /** Wat er die dag botst: op de klok, of alleen via de reistijd. */
  clashes: ReadClash[];
}

export interface ReadResult {
  today: string;
  from: string;
  to: string;
  /** Thuisadres; zonder dit kan de app geen vertrektijd uitrekenen. */
  home: string | null;
  defaults: { bufferMinutes: number; travelMode: string };
  /** De afspraken waar een planning zich aan hoort te houden. */
  rules: {
    /** Niet vóór dit tijdstip iets voorstellen. */
    planFrom: string;
    /** En niet ná dit tijdstip. De avond is van de gebruiker. */
    planUntil: string;
    /** Korter dan dit heeft geen zin als werkblok. */
    minimumMinutes: number;
    /** Wat er mag wijken -- maar nooit zonder het te vragen. */
    movableCategories: string[];
    note: string;
  };
  days: ReadDay[];
  /**
   * Wat er dubbel lijkt te staan. Alleen een signaal: noem het, ruim het niet
   * zelf op. Welke van de twee weg mag is aan de gebruiker.
   */
  duplicates: Duplicate[];
  tasks: {
    id: string;
    subject: string;
    title: string;
    deadline: string;
    estimatedMinutes: number;
    /** Wat er al voor deze opdracht in de agenda staat. */
    plannedMinutes: number;
    /** Wat er nog ingepland moet worden; nul als je er al genoeg tijd voor hebt. */
    remainingMinutes: number;
    priority: string;
    status: string;
    /** De stappen van deze opdracht, met hun `id` voor `linkedStepId`. */
    steps?: { id: string; title: string; estimatedMinutes?: number; done: boolean }[];
  }[];
  exams: {
    id: string;
    subject: string;
    title?: string;
    date: string;
    prepMinutes?: number;
    priority: string;
    status: string;
    topics?: string[];
  }[];
}

/**
 * Twee dingen die hetzelfde lijken.
 *
 * Bewust alleen een signaal, nooit een handeling: "Lezen" naast "Lezen (voor
 * het slapen)" kan een vergissing zijn of precies de bedoeling, en dat weet
 * alleen de gebruiker. Opruimen is een besluit, geen berekening.
 */
export interface Duplicate {
  kind: "taak" | "activiteit";
  titles: [string, string];
  ids: [string, string];
  /** Waar het op lijkt: dezelfde dag, dezelfde deadline. */
  note: string;
}

/** Een botsing zoals de app hem op je scherm ook laat zien. */
export interface ReadClash {
  between: [string, string];
  /** true wanneer alleen de reistijd eroverheen valt; de klok lijkt dan te kloppen. */
  travelOnly: boolean;
  note: string;
}

/** Wat `saveActivities` teruggeeft. */
export interface SaveResult {
  data: AgendaData;
  added: number;
  updated: number;
  /** Wat er is overgeslagen en waarom; leeg wanneer alles klopte. */
  skipped: { index: number; reason: string }[];
}
