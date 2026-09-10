import { normalizeRecurrence } from "./recurrence";

/**
 * Schema-versie van de opgeslagen data. Wordt meegegeven bij export en gebruikt
 * bij import om te controleren of een bestand leesbaar is. Verhoogd naar 2 met
 * de komst van taken en toetsen; bestaande activiteiten en instellingen blijven
 * onder hun eigen v1-sleutels staan, dus er gaat geen data verloren.
 */
export const SCHEMA_VERSION = 2;
import { isDateKey, isTimeKey } from "./time";
import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";
import type {
  Activity,
  Exam,
  SchoolworkPriority,
  SchoolworkStatus,
  Settings,
  Task,
  TaskStep,
  TransitBike,
  TravelMode,
} from "./types";

/** Een tekst in de taal die nu actief is. */
function say(key: TranslationKey, values?: Record<string, string | number>): string {
  return translate(getLanguage(), key, values);
}

/**
 * Import/export van de volledige agenda als één JSON-bestand. Bedoeld om met een
 * externe planner (Claude in een aparte chat) exact dezelfde data te delen: de
 * planner levert dit bestand, de app leest het getrouw in.
 *
 * Bewust defensief: onbekende velden worden genegeerd en ontbrekende velden
 * krijgen een veilige standaardwaarde, zodat een handmatig gemaakt bestand de
 * app nooit laat crashen.
 */

export const APP_ID = "vertrektijd-agenda";

/** Herkomst-markering voor leer-/werkblokken uit het leerplan. */
export const LEERPLAN_SOURCE = "leerplan";

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  /** null wanneer het bestand geen instellingen meebrengt (import laat ze dan staan). */
  settings: Settings | null;
  activities: Activity[];
  tasks: Task[];
  exams: Exam[];
}

export type ImportMode = "merge" | "replace";

export interface ImportSummary {
  activities: { added: number; updated: number };
  tasks: { added: number; updated: number };
  exams: { added: number; updated: number };
  settingsReplaced: boolean;
  mode: ImportMode;
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  data?: BackupFile;
}

const PRIORITIES: SchoolworkPriority[] = ["high", "medium", "low", "later"];
const STATUSES: SchoolworkStatus[] = ["todo", "doing", "done"];
const TRAVEL_MODES: TravelMode[] = ["car", "bike", "walk", "transit"];
const TRANSIT_BIKES: TransitBike[] = ["none", "start", "both"];
/** Dezelfde grenzen als het instellingenscherm hanteert. */
const DEFAULT_BUFFER_MINUTES = 10;
const MAX_BUFFER_MINUTES = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function priority(value: unknown): SchoolworkPriority {
  return PRIORITIES.includes(value as SchoolworkPriority)
    ? (value as SchoolworkPriority)
    : "medium";
}

function status(value: unknown): SchoolworkStatus {
  return STATUSES.includes(value as SchoolworkStatus) ? (value as SchoolworkStatus) : "todo";
}

/** Bouwt het exportobject in het afgesproken formaat. */
export function buildBackup(
  settings: Settings,
  activities: Activity[],
  tasks: Task[],
  exams: Exam[],
): BackupFile {
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    activities,
    tasks,
    exams,
  };
}

/**
 * Leest en valideert een geïmporteerd bestand. Controleert `app` en `version`,
 * normaliseert de records en negeert onbekende velden.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: say("backup.invalidJson") };
  }

  if (!isRecord(raw)) {
    return { ok: false, error: say("backup.invalidShape") };
  }

  if (raw.app !== APP_ID) {
    return {
      ok: false,
      error: say("backup.wrongApp", { app: APP_ID, found: str(raw.app, "?") }),
    };
  }

  const version = num(raw.version, 0);
  if (version < 1 || version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: say("backup.unknownVersion", { version, max: SCHEMA_VERSION }),
    };
  }

  const data: BackupFile = {
    app: APP_ID,
    version,
    exportedAt: str(raw.exportedAt, new Date().toISOString()),
    settings: isRecord(raw.settings) ? normalizeSettings(raw.settings) : null,
    activities: Array.isArray(raw.activities)
      ? raw.activities.filter(isRecord).map(normalizeActivity)
      : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks.filter(isRecord).map(normalizeTask) : [],
    exams: Array.isArray(raw.exams) ? raw.exams.filter(isRecord).map(normalizeExam) : [],
  };

  return { ok: true, data };
}

/**
 * Haalt de instellingen uit een importbestand door dezelfde zeef als de rest.
 *
 * Activiteiten, taken en toetsen werden al zorgvuldig nagelopen; de
 * instellingen gingen er ongezien in. Dat is precies het veld waar het
 * misgaat: `bufferMinutes: "veel"` gaf geen foutmelding maar `NaN:NaN` als
 * vertrektijd op je beginscherm, en een `travelMode` die niet bestaat liet
 * elke reisberekening stuklopen op de server.
 *
 * Wat klopt blijft staan, wat niet klopt valt terug op de standaardwaarde. Een
 * veld dat er niet in zit blijft ook hier weg: bij "samenvoegen" hoort het je
 * bestaande instelling niet te overschrijven.
 */
export function normalizeSettings(raw: Record<string, unknown>): Settings {
  const kept: Partial<Settings> = {};
  const keep = <K extends keyof Settings>(key: K, value: Settings[K] | undefined) => {
    if (raw[key] !== undefined) kept[key] = value;
  };

  keep("home", isRecord(raw.home) ? (raw.home as unknown as Settings["home"]) : null);
  keep("savedPlaces", Array.isArray(raw.savedPlaces) ? (raw.savedPlaces as Settings["savedPlaces"]) : []);
  keep(
    "categoryPlaces",
    isRecord(raw.categoryPlaces) ? (raw.categoryPlaces as Settings["categoryPlaces"]) : {},
  );
  keep(
    "customCategories",
    Array.isArray(raw.customCategories) ? (raw.customCategories as Settings["customCategories"]) : [],
  );
  // Een marge van een half etmaal is geen marge meer; de app zelf staat ook
  // niet meer dan twee uur toe.
  keep(
    "bufferMinutes",
    Math.min(MAX_BUFFER_MINUTES, Math.max(0, Math.round(num(raw.bufferMinutes, DEFAULT_BUFFER_MINUTES)))),
  );
  keep("travelMode", TRAVEL_MODES.includes(raw.travelMode as TravelMode) ? (raw.travelMode as TravelMode) : "car");
  keep(
    "transitBike",
    TRANSIT_BIKES.includes(raw.transitBike as TransitBike) ? (raw.transitBike as TransitBike) : "none",
  );
  keep("timetable", isRecord(raw.timetable) ? (raw.timetable as unknown as Settings["timetable"]) : null);
  keep("calendars", Array.isArray(raw.calendars) ? (raw.calendars as Settings["calendars"]) : []);
  keep(
    "reminderMinutes",
    typeof raw.reminderMinutes === "number" && Number.isFinite(raw.reminderMinutes)
      ? Math.max(0, Math.round(raw.reminderMinutes))
      : null,
  );

  return kept as Settings;
}

/**
 * Een locatie is alleen bruikbaar met coordinaten erbij.
 *
 * Zonder die twee getallen kan er geen route mee opgevraagd worden, en dan
 * gaat er een aanvraag de deur uit met "undefined,undefined" erin die als
 * reisfout terugkomt. Een activiteit zonder locatie is duidelijker dan een
 * locatie die niets doet: dan staat er tenminste niet dat de reis mislukt is.
 */
function normalizeLocation(raw: unknown): Activity["location"] {
  if (!isRecord(raw)) return null;
  const { label, lat, lon } = raw as Record<string, unknown>;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { label: str(label), lat: lat as number, lon: lon as number };
}

/**
 * Vult ontbrekende velden van een geïmporteerde activiteit aan.
 *
 * Dit is de rand van de app: hier komt binnen wat een back-upbestand, de cloud
 * of de planner heeft opgeschreven. Daarom worden datums en tijden hier niet
 * alleen op "is het een string" gecontroleerd maar ook op hun vorm — een
 * `startTime` van "banaan" overleeft een typecontrole moeiteloos en wordt
 * daarna `NaN`, waarna de activiteit zonder mopperen uit het dagoverzicht
 * verdwijnt.
 */
export function normalizeActivity(raw: Record<string, unknown>): Activity {
  const now = new Date().toISOString();
  const date = isDateKey(raw.date) ? raw.date : now.slice(0, 10);
  return {
    id: str(raw.id) || createId(),
    // Elk niet-leeg type overnemen, ook een zelfgemaakt. Alleen de vijf
    // ingebouwde doorlaten betekende dat "Bijbaan" of "Muziekles" stil
    // "School" werd — bij import, maar ook bij elke keer dat de app de agenda
    // uit de cloud haalde. `resolveCategory` kent de eigen types wel.
    category: str(raw.category) || "school",
    title: str(raw.title, "Activiteit"),
    date,
    endDate: isDateKey(raw.endDate) ? raw.endDate : null,
    allDay: raw.allDay === true,
    startTime: isTimeKey(raw.startTime) ? raw.startTime : "09:00",
    endTime: isTimeKey(raw.endTime) ? raw.endTime : "10:00",
    location: normalizeLocation(raw.location),
    color: typeof raw.color === "string" ? raw.color : null,
    source: typeof raw.source === "string" ? raw.source : null,
    travelMode: (["car", "bike", "walk", "transit"] as const).includes(
      raw.travelMode as "car" | "bike" | "walk" | "transit",
    )
      ? (raw.travelMode as Activity["travelMode"])
      : null,
    recurrence: normalizeRecurrence(raw.recurrence, date),
    exceptions: Array.isArray(raw.exceptions) ? raw.exceptions.filter(isDateKey) : [],
    travel: isRecord(raw.travel) ? (raw.travel as unknown as Activity["travel"]) : null,
    returnTravel: isRecord(raw.returnTravel)
      ? (raw.returnTravel as unknown as Activity["returnTravel"])
      : null,
    onwardTravel: isRecord(raw.onwardTravel)
      ? (raw.onwardTravel as unknown as Activity["onwardTravel"])
      : null,
    travelError: typeof raw.travelError === "string" ? raw.travelError : null,
    bufferMinutes: typeof raw.bufferMinutes === "number" ? raw.bufferMinutes : null,
    linkedTaskId: typeof raw.linkedTaskId === "string" ? raw.linkedTaskId : null,
    linkedExamId: typeof raw.linkedExamId === "string" ? raw.linkedExamId : null,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

export function normalizeTask(raw: Record<string, unknown>): Task {
  const now = new Date().toISOString();
  const steps: TaskStep[] | undefined = Array.isArray(raw.steps)
    ? raw.steps.filter(isRecord).map((step) => ({
        id: str(step.id) || createId(),
        title: str(step.title, "Stap"),
        estimatedMinutes:
          typeof step.estimatedMinutes === "number" ? step.estimatedMinutes : undefined,
        done: step.done === true,
      }))
    : undefined;

  return {
    id: str(raw.id) || createId(),
    subject: str(raw.subject, "Algemeen"),
    title: str(raw.title, "Opdracht"),
    description: typeof raw.description === "string" ? raw.description : undefined,
    deadline: isDateKey(raw.deadline) ? raw.deadline : now.slice(0, 10),
    estimatedMinutes: num(raw.estimatedMinutes, 0),
    priority: priority(raw.priority),
    status: status(raw.status),
    steps,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

export function normalizeExam(raw: Record<string, unknown>): Exam {
  const now = new Date().toISOString();
  return {
    id: str(raw.id) || createId(),
    subject: str(raw.subject, "Algemeen"),
    title: typeof raw.title === "string" ? raw.title : undefined,
    date: isDateKey(raw.date) ? raw.date : now.slice(0, 10),
    topics: Array.isArray(raw.topics)
      ? raw.topics.filter((x): x is string => typeof x === "string")
      : undefined,
    prepMinutes: typeof raw.prepMinutes === "number" ? raw.prepMinutes : undefined,
    priority: priority(raw.priority),
    status: status(raw.status),
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
