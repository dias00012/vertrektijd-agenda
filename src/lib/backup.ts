import { SCHEMA_VERSION } from "./storage";
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
} from "./types";

/** Een tekst in de taal die nu actief is. */
function say(key: TranslationKey): string {
  return translate(getLanguage(), key);
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
      error: `Dit bestand hoort niet bij ${APP_ID} (app: ${str(raw.app, "onbekend")}).`,
    };
  }

  const version = num(raw.version, 0);
  if (version < 1 || version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Onbekende bestandsversie (${version}). Deze app ondersteunt versie 1 t/m ${SCHEMA_VERSION}.`,
    };
  }

  const data: BackupFile = {
    app: APP_ID,
    version,
    exportedAt: str(raw.exportedAt, new Date().toISOString()),
    settings: isRecord(raw.settings) ? (raw.settings as unknown as Settings) : null,
    activities: Array.isArray(raw.activities)
      ? raw.activities.filter(isRecord).map(normalizeActivity)
      : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks.filter(isRecord).map(normalizeTask) : [],
    exams: Array.isArray(raw.exams) ? raw.exams.filter(isRecord).map(normalizeExam) : [],
  };

  return { ok: true, data };
}

/** Vult ontbrekende velden van een geïmporteerde activiteit aan. */
export function normalizeActivity(raw: Record<string, unknown>): Activity {
  const now = new Date().toISOString();
  return {
    id: str(raw.id) || createId(),
    // Elk niet-leeg type overnemen, ook een zelfgemaakt. Alleen de vijf
    // ingebouwde doorlaten betekende dat "Bijbaan" of "Muziekles" stil
    // "School" werd — bij import, maar ook bij elke keer dat de app de agenda
    // uit de cloud haalde. `resolveCategory` kent de eigen types wel.
    category: str(raw.category) || "school",
    title: str(raw.title, "Activiteit"),
    date: str(raw.date, now.slice(0, 10)),
    endDate: typeof raw.endDate === "string" ? raw.endDate : null,
    allDay: raw.allDay === true,
    startTime: str(raw.startTime, "09:00"),
    endTime: str(raw.endTime, "10:00"),
    location: isRecord(raw.location) ? (raw.location as unknown as Activity["location"]) : null,
    color: typeof raw.color === "string" ? raw.color : null,
    source: typeof raw.source === "string" ? raw.source : null,
    travelMode: (["car", "bike", "walk", "transit"] as const).includes(
      raw.travelMode as "car" | "bike" | "walk" | "transit",
    )
      ? (raw.travelMode as Activity["travelMode"])
      : null,
    recurrence: isRecord(raw.recurrence)
      ? (raw.recurrence as unknown as Activity["recurrence"])
      : null,
    exceptions: Array.isArray(raw.exceptions)
      ? raw.exceptions.filter((x): x is string => typeof x === "string")
      : [],
    travel: isRecord(raw.travel) ? (raw.travel as unknown as Activity["travel"]) : null,
    returnTravel: isRecord(raw.returnTravel)
      ? (raw.returnTravel as unknown as Activity["returnTravel"])
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
    deadline: str(raw.deadline, now.slice(0, 10)),
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
    date: str(raw.date, now.slice(0, 10)),
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
