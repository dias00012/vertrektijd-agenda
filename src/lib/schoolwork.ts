import type {
  Activity,
  Exam,
  SchoolworkPriority,
  SchoolworkStatus,
  Task,
  TaskStep,
} from "./types";
import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";

function word(key: TranslationKey, values?: Record<string, string | number>): string {
  return translate(getLanguage(), key, values);
}
import { MINUTES_PER_DAY, parseDateKey, timeToMinutes, todayKey } from "./time";

/** Weergave-informatie per prioriteit. */
export const PRIORITY_META: Record<
  SchoolworkPriority,
  { label: string; emoji: string; color: string; order: number }
> = {
  high: { get label() { return word("schoolwork.priority.high"); }, emoji: "\u{1F534}", color: "#ef4444", order: 0 },
  medium: { get label() { return word("schoolwork.priority.medium"); }, emoji: "\u{1F7E0}", color: "#f97316", order: 1 },
  low: { get label() { return word("schoolwork.priority.low"); }, emoji: "\u{1F7E1}", color: "#eab308", order: 2 },
  later: { get label() { return word("schoolwork.priority.later"); }, emoji: "\u{1F7E2}", color: "#22c55e", order: 3 },
};

export const STATUS_META: Record<SchoolworkStatus, { label: string; color: string }> = {
  todo: { get label() { return word("schoolwork.status.todo"); }, color: "#64748b" },
  doing: { get label() { return word("schoolwork.status.doing"); }, color: "#3b82f6" },
  done: { get label() { return word("schoolwork.status.done"); }, color: "#22c55e" },
};

export const STATUS_ORDER: SchoolworkStatus[] = ["todo", "doing", "done"];

/** Taken op deadline, dan op prioriteit; afgeronde taken onderaan. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    if (a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
    return PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order;
  });
}

/** Toetsen op datum; afgeronde toetsen onderaan. */
export function sortExams(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    return a.date.localeCompare(b.date);
  });
}

/** Hele dagen tussen vandaag en de opgegeven datum. Negatief = in het verleden. */
export function daysUntil(dateKey: string, now: Date = new Date()): number {
  const target = parseDateKey(dateKey).getTime();
  const start = parseDateKey(todayKey(now)).getTime();
  return Math.round((target - start) / 86_400_000);
}

/** "vandaag" / "morgen" / "over 3 dagen" / "3 dagen geleden". */
export function describeDaysUntil(dateKey: string, now: Date = new Date()): string {
  const days = daysUntil(dateKey, now);
  if (days === 0) return word("days.today");
  if (days === 1) return word("days.tomorrow");
  if (days === -1) return word("common.yesterday").toLowerCase();
  if (days > 1) return word("days.in", { count: days });
  return word("days.ago", { count: Math.abs(days) });
}

/**
 * De status van een opdracht nadat je een stap hebt aan- of uitgevinkt.
 *
 * Vink je het laatste hokje aan, dan is de opdracht af en zegt hij dat ook.
 * Daar was het de vorige keer op misgegaan: je werkte je stappen weg, de
 * opdracht bleef op "te doen" staan, en je agenda toonde de leerblokken dus
 * de hele avond alsof er nog werk lag.
 *
 * Andersom net zo goed: haal je er daarna weer een weg, dan ben je er
 * kennelijk toch nog mee bezig. Een opdracht zonder stappen laten we met rust;
 * daar zegt het afvinken niets over.
 */
export function statusAfterSteps(
  status: SchoolworkStatus,
  steps: readonly TaskStep[],
): SchoolworkStatus {
  if (steps.length === 0) return status;
  if (steps.every((step) => step.done)) return "done";
  return status === "done" ? "doing" : status;
}

/** Voortgang van een taak op basis van afgevinkte stappen (0 wanneer geen stappen). */
export function taskProgress(task: Task): { done: number; total: number } {
  const total = task.steps?.length ?? 0;
  const done = task.steps?.filter((step) => step.done).length ?? 0;
  return { done, total };
}

/* --- Koppeling agenda <-> schoolwerk ------------------------------------ */

/**
 * Duur van een activiteit in minuten.
 *
 * Loopt het blok over middernacht — leren van 23:00 tot 00:30 — dan ligt de
 * eindtijd op de klok vóór de starttijd. De aftreksom gaf dan nul, en je taak
 * bleef op "ingepland: 0 min" staan terwijl je er anderhalf uur voor had
 * uitgetrokken.
 */
export function activityMinutes(activity: Pick<Activity, "startTime" | "endTime">): number {
  const start = timeToMinutes(activity.startTime);
  const end = timeToMinutes(activity.endTime);
  return end < start ? end + MINUTES_PER_DAY - start : end - start;
}

/**
 * Staat het schoolwerk waar dit blok voor staat al op "af"?
 *
 * Een leerblok is ingeplande tijd voor één opdracht of toets. Vink je die af,
 * dan blijft het blok gewoon in je agenda staan — en dat hoort ook, je wilt
 * kunnen zien waar je tijd heen ging — maar er valt niets meer te doen. De
 * agenda streept het daarom door: zo zie je in één blik dat die twee uur
 * vanavond vrij zijn.
 *
 * Een leerblok zonder koppeling (uit een leerplan) telt niet als af: daar weet
 * de app niet van of het werk gedaan is.
 */
export function linkedWorkDone(
  activity: Pick<Activity, "title" | "linkedTaskId" | "linkedStepId" | "linkedExamId">,
  tasks: readonly Pick<Task, "id" | "status" | "steps">[],
  exams: readonly Pick<Exam, "id" | "status">[],
): boolean {
  if (activity.linkedTaskId) {
    const task = tasks.find((item) => item.id === activity.linkedTaskId);
    if (!task) return false;
    if (task.status === "done") return true;
    // De hele opdracht is nog niet af, maar dit blok misschien wel: wie zijn
    // werk in stappen plant, vinkt stap voor stap af en is met dít blok klaar
    // zodra die ene stap af is.
    return stepForActivity(activity, task)?.done === true;
  }
  if (activity.linkedExamId) {
    return exams.find((exam) => exam.id === activity.linkedExamId)?.status === "done";
  }
  return false;
}

/**
 * Tot welke stap van een opdracht hoort dit blok?
 *
 * Bij voorkeur via `linkedStepId`: dan staat het er gewoon. Maar de blokken die
 * er al stonden voordat dat veld bestond hebben het niet, en die zijn wel per
 * stap ingepland — vandaar dat we anders naar de titel kijken. "BE –
 * samenvatting H3" hoort bij de stap "Samenvatting H3".
 *
 * De langste treffer wint. Staan er stappen "T4.1 Gouda" en "T4.1 Gouda + T4.2
 * Van Dam", dan hoort een blok met die hele tweede naam bij de tweede — anders
 * zou het doorgestreept worden zodra alleen het eerste deel af is.
 */
export function stepForActivity(
  activity: Pick<Activity, "title" | "linkedStepId">,
  task: Pick<Task, "steps">,
): TaskStep | null {
  const steps = task.steps ?? [];
  if (steps.length === 0) return null;

  if (activity.linkedStepId) {
    return steps.find((step) => step.id === activity.linkedStepId) ?? null;
  }

  let best: TaskStep | null = null;
  let bestLength = 0;
  for (const step of steps) {
    if (!titleMentionsStep(activity.title, step.title)) continue;
    const length = normalizeForMatch(step.title).length;
    if (length > bestLength) {
      best = step;
      bestLength = length;
    }
  }
  return best;
}

/**
 * Kale vorm van een titel: kleine letters, zonder accenten, en elk leesteken
 * wordt een spatie. Zo vallen "H4.1 t/m 4.4" en "h4 1 t m 4 4" samen, en doet
 * het er niet toe of iemand een streepje of een koppelteken gebruikt.
 */
function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Staat de naam van deze stap in de titel van het blok?
 *
 * Met spaties eromheen, zodat "H3" niet matcht op "H30": we vergelijken hele
 * woorden, geen letterreeksen.
 */
function titleMentionsStep(activityTitle: unknown, stepTitle: string): boolean {
  if (typeof activityTitle !== "string") return false;
  const needle = normalizeForMatch(stepTitle);
  if (!needle) return false;
  return ` ${normalizeForMatch(activityTitle)} `.includes(` ${needle} `);
}

/** De activiteiten die aan een taak zijn gekoppeld. */
export function activitiesForTask(activities: Activity[], taskId: string): Activity[] {
  return activities.filter((a) => a.linkedTaskId === taskId);
}

/** De activiteiten die aan een toets zijn gekoppeld. */
export function activitiesForExam(activities: Activity[], examId: string): Activity[] {
  return activities.filter((a) => a.linkedExamId === examId);
}

/** Totaal aan ingeplande minuten voor een taak (som van gekoppelde blokken). */
export function plannedMinutesForTask(activities: Activity[], taskId: string): number {
  return activitiesForTask(activities, taskId).reduce((sum, a) => sum + activityMinutes(a), 0);
}

/** Totaal aan ingeplande minuten voor een toets. */
export function plannedMinutesForExam(activities: Activity[], examId: string): number {
  return activitiesForExam(activities, examId).reduce((sum, a) => sum + activityMinutes(a), 0);
}

/** Ingeplande tijd t.o.v. de schatting, met percentage voor een voortgangsbalk. */
export function plannedProgress(
  plannedMinutes: number,
  estimateMinutes: number | undefined,
): { planned: number; estimate: number; pct: number; enough: boolean } {
  const estimate = estimateMinutes ?? 0;
  const pct = estimate > 0 ? Math.min(100, Math.round((plannedMinutes / estimate) * 100)) : 0;
  return { planned: plannedMinutes, estimate, pct, enough: estimate > 0 && plannedMinutes >= estimate };
}
