import { activitiesOnDate } from "./agenda";
import { activityMinutes, plannedMinutesForExam, plannedMinutesForTask } from "./schoolwork";
import { addDaysToKey, daysBetween, minutesToTime, timeToMinutes, todayKey } from "./time";
import { bufferFor, computeDeparture, computeReturn, travelMinutesEither } from "./travel";
import type { Activity, Exam, Settings, Task, TaskStep } from "./types";

/**
 * Waar in je week nog iets past.
 *
 * Deze berekening zat eerst alleen in de connector, en dat was precies de
 * fout: de app wist wél waar je gaten zaten maar liet het rekenwerk aan een
 * taalmodel over. Nu staat hij hier, zodat het scherm en de connector op
 * hetzelfde getal uitkomen -- en er niet na een half jaar twee waarheden zijn.
 */

/**
 * Het venster waarbinnen plannen zin heeft.
 *
 * Niet omdat de agenda daarbuiten leeg is, maar omdat een planning die om
 * 23:00 nog een uur schoolwerk neerzet geen planning is maar een wens.
 */
export const DAY_STARTS = 7 * 60;
export const PLAN_UNTIL = 22 * 60;

/** Korter dan dit is geen werkblok maar een gaatje. */
export const MIN_GAP = 20;

/**
 * Langer dan dit achter elkaar houdt niemand vol.
 *
 * Dit is waar het oude "Leertijd inplannen" op stuk liep: het zette de hele
 * schatting als één blok neer, en vijf uur aaneen is geen planning maar een
 * blokkade in je agenda waar je niets mee doet.
 */
export const MAX_BLOCK = 90;

/** Pauze na een aaneengesloten stuk van `MAX_BLOCK`. */
export const BREAK = 15;

/**
 * Categorieën die mogen wijken als het krap wordt.
 *
 * Alleen als vóórstel: gamen, lezen en sporten zijn te verzetten, maar of dat
 * vanavond ook mag is niet aan een planner. En "Gitaar les" staat in diezelfde
 * categorie terwijl die juist vastligt -- reden te meer om het altijd te
 * vragen.
 *
 * Sporten staat erbij omdat het in de praktijk het eerste is wat wijkt: komt
 * er een fysio-afspraak op je sportavond, dan sla je die ene keer over. Dat
 * blokken met een plek er eerst uit vielen was een fout: juist sporten en
 * fysio hebben allebei een adres.
 */
export const MOVABLE = ["hobby", "gym"];

/** Een gat waarin echt iets past: thuis, wakker, en niets anders gepland. */
export interface FreeSlot {
  from: string;
  to: string;
  minutes: number;
}

/** Een blok dat zou kunnen wijken, als de gebruiker dat goedvindt. */
export interface MovableBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  minutes: number;
  /**
   * true wanneer deze dag uit een herhalende reeks komt. Dan kan juist díe ene
   * dag eruit zonder dat de rest van de reeks iets merkt -- precies wat je
   * nodig hebt als er één keer iets anders tussenkomt.
   */
  recurring: boolean;
  /** true wanneer er een plek aan hangt: wijken verandert dan ook je reis. */
  away: boolean;
}

/**
 * Van wanneer tot wanneer je die dag van huis bent, per uitstapje: van het
 * moment dat je vertrekt tot het moment dat je weer binnenstapt.
 *
 * Dit is het venster waarin een blok thuis niet kan bestaan. Precies daar ging
 * het mis: een planner ziet "werken tot 17:00" en zet er om 17:20 een leerblok
 * achter, terwijl de terugreis uit Lelystad bijna een uur duurt.
 */
export interface AwaySpan {
  /** De id van de activiteit, zodat je hem kunt aanwijzen in plaats van noemen. */
  id: string;
  title: string;
  /** true wanneer dit een dag uit een herhalende reeks is. */
  recurring: boolean;
  /** Minuten sinds middernacht; kan negatief zijn bij vertrek de dag ervoor. */
  from: number;
  /** Minuten sinds middernacht; kan boven 1440 uitkomen. */
  to: number;
  /** Thuiskomst als kloktijd, voor de uitleg aan de planner. */
  home: string;
}

export function awaySpans(
  activities: Activity[],
  settings: Settings | null,
  date: string,
  exclude?: string,
): AwaySpan[] {
  if (!settings) return [];
  const spans: AwaySpan[] = [];
  for (const occurrence of activitiesOnDate(activities, date)) {
    if (occurrence.id === exclude) continue;
    if (!occurrence.location || occurrence.allDay) continue;
    const departure = computeDeparture(occurrence, settings);
    const back = computeReturn(occurrence, settings);
    const start = timeToMinutes(occurrence.startTime);
    const plain = timeToMinutes(occurrence.endTime);
    // Is een van beide reizen nog niet berekend, dan houden we de andere aan
    // als schatting. Zonder die schatting geldt de begintijd als vertrek en de
    // eindtijd als thuiskomst -- alsof je je er heen denkt.
    const to = back ? back.minutes : plain + travelMinutesEither(occurrence, "back");
    spans.push({
      id: occurrence.id,
      title: occurrence.title,
      recurring: occurrence.recurring,
      from: departure
        ? departure.minutes
        : start - travelMinutesEither(occurrence, "out") - bufferFor(occurrence, settings),
      to,
      home: back?.time ?? minutesToTime(to),
    });
  }
  return spans;
}

/**
 * De dag als bezette stukken: alles waarin je niet thuis aan iets anders kunt
 * zitten. Een uitstapje telt van vertrek tot thuiskomst, niet van begin tot
 * eind -- dat verschil was precies wat er miste.
 */
export function busyOnDate(
  activities: Activity[],
  settings: Settings | null,
  date: string,
): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = awaySpans(activities, settings, date).map(
    (span) => ({ from: span.from, to: span.to }),
  );

  for (const occurrence of activitiesOnDate(activities, date)) {
    if (occurrence.allDay || occurrence.location) continue;
    const start = timeToMinutes(occurrence.startTime);
    const end = timeToMinutes(occurrence.endTime);
    spans.push({ from: start, to: end < start ? end + 1440 : end });
  }

  // Samenvoegen wat elkaar raakt, zodat er geen schijngaatjes overblijven
  // tussen twee blokken die op elkaar aansluiten.
  spans.sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

/**
 * Wat er overblijft binnen het venster waarin plannen zin heeft.
 *
 * `notBefore` is voor "vanaf nu": op een lopende dag heeft het gat van
 * vanochtend geen zin meer.
 */
export function freeOnDate(
  activities: Activity[],
  settings: Settings | null,
  date: string,
  notBefore = DAY_STARTS,
): FreeSlot[] {
  const slots: FreeSlot[] = [];
  let cursor = Math.max(DAY_STARTS, notBefore);
  for (const span of busyOnDate(activities, settings, date)) {
    if (span.to <= cursor) continue;
    if (span.from > cursor) {
      const to = Math.min(span.from, PLAN_UNTIL);
      if (to - cursor >= MIN_GAP) {
        slots.push({ from: minutesToTime(cursor), to: minutesToTime(to), minutes: to - cursor });
      }
    }
    cursor = Math.max(cursor, span.to);
    if (cursor >= PLAN_UNTIL) return slots;
  }
  if (PLAN_UNTIL - cursor >= MIN_GAP) {
    slots.push({
      from: minutesToTime(cursor),
      to: minutesToTime(PLAN_UNTIL),
      minutes: PLAN_UNTIL - cursor,
    });
  }
  return slots;
}

/** De blokken die zouden kunnen wijken; alleen om voor te stellen. */
export function movableOnDate(activities: Activity[], date: string): MovableBlock[] {
  return activitiesOnDate(activities, date)
    .filter((item) => !item.allDay && MOVABLE.includes(item.category))
    .map((item) => ({
      id: item.id,
      title: item.title,
      startTime: item.startTime,
      endTime: item.endTime,
      minutes: activityMinutes(item),
      recurring: item.recurring,
      away: Boolean(item.location),
    }));
}

/** Eén voorgesteld leerblok: een stap op een plek en een tijd. */
export interface PlannedBlock {
  date: string;
  startTime: string;
  endTime: string;
  stepId: string;
  stepTitle: string;
  minutes: number;
  /** true wanneer deze stap over meer blokken verdeeld is. */
  split: boolean;
}

export interface FitOptions {
  /** Duur voor een stap zonder eigen schatting. */
  defaultMinutes?: number;
  /** Bovengrens per blok; langer wordt over meer blokken verdeeld. */
  maxBlock?: number;
  /** Pauze tussen twee blokken in hetzelfde gat. */
  breakMinutes?: number;
}

export interface Fitted {
  blocks: PlannedBlock[];
  /** Minuten die niet meer voor de deadline pasten. */
  leftoverMinutes: number;
}

/**
 * Verdeel open stappen over de vrije gaten tot de deadline.
 *
 * De volgorde van de stappen blijft: wie eerst moet samenvatten voor hij
 * opgaven kan maken, heeft niets aan een planning die dat omdraait. Een stap
 * mag wel over twee gaten gesplitst worden -- een uur samenvatten in twee keer
 * een half uur is vervelend maar mogelijk, en het alternatief is dat hij
 * helemaal niet wordt ingepland.
 */
export function fitSteps(
  steps: readonly TaskStep[],
  days: { date: string; slots: FreeSlot[] }[],
  options: FitOptions = {},
): Fitted {
  const { defaultMinutes = 30, maxBlock = MAX_BLOCK, breakMinutes = BREAK } = options;
  const blocks: PlannedBlock[] = [];
  // Alleen wat nog moet; een afgevinkte stap plan je niet opnieuw in.
  const open = steps
    .filter((step) => !step.done)
    .map((step) => ({ ...step, rest: step.estimatedMinutes ?? defaultMinutes }));

  const ruimte = days.flatMap((day) =>
    day.slots.map((slot) => ({
      date: day.date,
      from: timeToMinutes(slot.from),
      to: timeToMinutes(slot.to),
    })),
  );

  let index = 0;
  for (const gat of ruimte) {
    let cursor = gat.from;
    // Hoe lang je in dit gat al aan één stuk bezig bent. Drie stappen van een
    // half uur achter elkaar zijn samen anderhalf uur werk, ook al staan er
    // drie blokken; daarom telt de tijd door over de stappen heen. Een pauze
    // tussen twee blokjes van tien minuten zou daarentegen nergens op slaan.
    let aaneen = 0;
    while (index < open.length && cursor < gat.to) {
      // Bijna aan je anderhalf uur: dan liever nu de pauze dan er nog een blokje
      // van acht minuten in persen om de grens precies vol te maken. Zonder dit
      // liep de rest van een vrije avond leeg op zo'n restje.
      if (aaneen > 0 && maxBlock - aaneen < MIN_GAP) {
        cursor += breakMinutes;
        aaneen = 0;
        continue;
      }
      const stap = open[index];
      const past = Math.min(stap.rest, gat.to - cursor, maxBlock - aaneen);
      // Wat overblijft is te kort om iets mee te beginnen: dan liever de hele
      // stap naar het volgende gat dan een restje van tien minuten. Een stap
      // die zelf korter is dan dat mag er wel in -- dat is geen fragment maar
      // de hele stap, en "nakijken: 10 minuten" hoort gewoon ergens te staan.
      if (past < MIN_GAP && past < stap.rest) break;
      blocks.push({
        date: gat.date,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + past),
        stepId: stap.id,
        stepTitle: stap.title,
        minutes: past,
        split: past < stap.rest || blocks.some((b) => b.stepId === stap.id),
      });
      cursor += past;
      aaneen += past;
      // Anderhalf uur gehad: even weg van je bureau, en daarna verder.
      if (aaneen >= maxBlock) {
        cursor += breakMinutes;
        aaneen = 0;
      }
      stap.rest -= past;
      if (stap.rest <= 0) index += 1;
    }
    if (index >= open.length) break;
  }

  const leftoverMinutes = open.slice(index).reduce((sum, stap) => sum + stap.rest, 0);
  return { blocks, leftoverMinutes };
}

/**
 * Vrije ruimte per dag over een periode.
 *
 * De eerste dag begint bij `notBefore`: op een lopende dag heeft het gat van
 * vanochtend geen zin meer. De dagen daarna beginnen gewoon om zeven uur.
 */
export function freeUntil(
  activities: Activity[],
  settings: Settings | null,
  from: string,
  to: string,
  notBefore = DAY_STARTS,
): { date: string; slots: FreeSlot[] }[] {
  const dagen: { date: string; slots: FreeSlot[] }[] = [];
  const aantal = Math.max(0, daysBetween(from, to));
  for (let i = 0; i <= aantal; i += 1) {
    const date = addDaysToKey(from, i);
    dagen.push({ date, slots: freeOnDate(activities, settings, date, i === 0 ? notBefore : 0) });
  }
  return dagen;
}

/**
 * Hoeveel werk er nog in een opdracht zit.
 *
 * Met stappen telt alleen wat nog niet afgevinkt is. Heeft een stap geen eigen
 * schatting, dan krijgt hij een gelijk deel van de schatting van de opdracht:
 * niet precies, maar dichter bij de waarheid dan hem op nul zetten.
 */
export function openMinutes(task: Pick<Task, "estimatedMinutes" | "status" | "steps">): number {
  const steps = task.steps ?? [];
  if (steps.length === 0) return task.status === "done" ? 0 : task.estimatedMinutes;
  const deel = steps.length > 0 ? task.estimatedMinutes / steps.length : 0;
  return Math.round(
    steps
      .filter((step) => !step.done)
      .reduce((sum, step) => sum + (step.estimatedMinutes ?? deel), 0),
  );
}

/** De stand van zaken: wat moet er nog, en hoeveel tijd is daar nog voor. */
export interface Workload {
  /** De eerstvolgende deadline of toetsdag; null als er niets meer aankomt. */
  until: string | null;
  /** Wat er tot en met die dag moet gebeuren en nog geen blok in de agenda heeft. */
  todoMinutes: number;
  /** Vrije tijd tussen nu en die dag, reistijd al afgetrokken. */
  freeMinutes: number;
  /** Vrije tijd die er vandaag nog is. Los, want dat is de vraag van vanavond. */
  todayMinutes: number;
}

/**
 * Haal je het?
 *
 * Bewust alleen over werk dat nog géén blok in je agenda heeft: dat is wat er
 * nog ingepland moet worden, en dus het getal dat naast je vrije tijd hoort.
 * Werk waar al tijd voor staat telt niet mee -- anders zou inplannen het
 * probleem groter laten lijken in plaats van kleiner.
 */
export function workload(
  tasks: readonly Task[],
  exams: readonly Exam[],
  activities: Activity[],
  settings: Settings | null,
  now: Date = new Date(),
): Workload {
  const today = todayKey(now);
  const nu = now.getHours() * 60 + now.getMinutes();

  const open = [
    ...tasks
      .filter((task) => task.status !== "done" && task.deadline >= today)
      .map((task) => ({
        date: task.deadline,
        minutes: Math.max(0, openMinutes(task) - plannedMinutesForTask(activities, task.id)),
      })),
    ...exams
      .filter((exam) => exam.status !== "done" && exam.date >= today)
      .map((exam) => ({
        date: exam.date,
        minutes: Math.max(0, (exam.prepMinutes ?? 0) - plannedMinutesForExam(activities, exam.id)),
      })),
  ];

  const todayMinutes = freeOnDate(activities, settings, today, nu).reduce(
    (sum, slot) => sum + slot.minutes,
    0,
  );

  // De eerstvolgende dag waarop iets af moet zijn. Verder vooruit kijken maakt
  // het getal alleen maar vager: dat het over drie weken krap wordt zegt niets
  // over of je vanavond achter je bureau moet.
  const until = open.reduce<string | null>(
    (eerst, item) => (eerst === null || item.date < eerst ? item.date : eerst),
    null,
  );
  if (!until) return { until: null, todoMinutes: 0, freeMinutes: 0, todayMinutes };

  const todoMinutes = open
    .filter((item) => item.date <= until)
    .reduce((sum, item) => sum + item.minutes, 0);

  // Tot en met de dag ervóór: op de dag zelf moet het af zijn, dus die avond
  // meetellen is jezelf rijk rekenen. Valt de deadline vandaag, dan is vandaag
  // wat je hebt.
  const laatste = until > today ? addDaysToKey(until, -1) : today;
  const freeMinutes = freeUntil(activities, settings, today, laatste, nu).reduce(
    (sum, dag) => sum + dag.slots.reduce((d, slot) => d + slot.minutes, 0),
    0,
  );

  return { until, todoMinutes, freeMinutes, todayMinutes };
}

/**
 * De stappen die nog ingepland moeten worden, met de tijd die er al voor staat
 * eraf.
 *
 * Een opdracht zonder stappen -- en elke toets -- levert één stap op met een
 * lege `id`: er valt niets te koppelen, er moet alleen tijd voor komen.
 */
export function openSteps(
  item: Task | Exam,
  activities: Activity[],
  fallbackTitle: string,
): TaskStep[] {
  if ("date" in item) {
    const rest = (item.prepMinutes ?? 0) - plannedMinutesForExam(activities, item.id);
    return rest > 0 ? [{ id: "", title: fallbackTitle, estimatedMinutes: rest, done: false }] : [];
  }

  const steps = item.steps ?? [];
  if (steps.length === 0) {
    const rest = item.estimatedMinutes - plannedMinutesForTask(activities, item.id);
    return rest > 0 ? [{ id: "", title: fallbackTitle, estimatedMinutes: rest, done: false }] : [];
  }

  const deel = item.estimatedMinutes / steps.length;
  return steps
    .filter((step) => !step.done)
    .map((step) => {
      // Wat er al voor déze stap staat telt niet meer mee. Zonder dit zet een
      // tweede keer inplannen er gewoon nog een stapel bovenop -- precies wat
      // er met de connector ook gebeurde.
      const gepland = activities
        .filter((item2) => item2.linkedTaskId === item.id && item2.linkedStepId === step.id)
        .reduce((sum, item2) => sum + activityMinutes(item2), 0);
      return {
        ...step,
        estimatedMinutes: Math.max(0, Math.round((step.estimatedMinutes ?? deel) - gepland)),
      };
    })
    .filter((step) => (step.estimatedMinutes ?? 0) > 0);
}

/**
 * Een voorstel voor leertijd: de open stappen verdeeld over de gaten die er tot
 * de deadline nog zijn.
 *
 * Bewust een voorstel en niets meer. De app zet het pas in je agenda als je op
 * de knop drukt -- een planner die ongevraagd je avonden volzet is erger dan
 * geen planner.
 */
export function planStudy(
  item: Task | Exam,
  activities: Activity[],
  settings: Settings | null,
  fallbackTitle: string,
  now: Date = new Date(),
  options: FitOptions = {},
): Fitted & { until: string } {
  const today = todayKey(now);
  const deadline = "date" in item ? item.date : item.deadline;
  // Op de dag zelf moet het af zijn, dus de avond ervoor is de laatste kans.
  // Ligt de deadline vandaag of al achter je, dan is vandaag wat er is.
  const until = deadline > today ? addDaysToKey(deadline, -1) : today;
  const nu = now.getHours() * 60 + now.getMinutes();
  const days = freeUntil(activities, settings, today, until, nu);
  return { ...fitSteps(openSteps(item, activities, fallbackTitle), days, options), until };
}
