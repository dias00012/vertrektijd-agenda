/**
 * De agenda lezen zoals de connector hem te zien krijgt.
 *
 * Apart van het schrijven: samen was het duizend regels, en lezen en schrijven
 * delen alleen de vorm van de gegevens, niet hun redenering. Wat hier staat
 * kijkt alleen, verandert nooit iets.
 */

import { activitiesOnDate, clashesOnDate } from "../agenda";
import { DAY_STARTS, MIN_GAP, MOVABLE, PLAN_UNTIL, freeOnDate, movableOnDate } from "../planning";
import {
  addDaysToKey,
  daysBetween,
  isDateKey,
  minutesToTime,
  timeToMinutes,
  todayKey,
} from "../time";
import { bufferFor, computeDeparture, computeReturn, travelMinutesEither } from "../travel";
import { activityMinutes } from "../schoolwork";
import { DEFAULT_DAYS, MAX_DAYS, WEEKDAYS } from "./types";
import type { AgendaData, Duplicate, ReadActivity, ReadClash, ReadDay, ReadResult } from "./types";

/** Kale woorden van een titel, zonder leestekens en emoji. */
function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean),
  );
}

/**
 * Lijken deze twee titels op hetzelfde?
 *
 * Gemeten aan de kortste van de twee: staat het grootste deel van de woorden
 * daarvan ook in de andere, dan is het waarschijnlijk hetzelfde werk onder een
 * andere naam. "Excel week 2 - H2 Afronden" naast "Excel week 2 - H2 (Opdracht
 * 2.5 en 2.6)" haalt die drempel; "BE week 3 - H5" naast "Excel week 3 - H3"
 * niet.
 */
function looksTheSame(a: string, b: string): boolean {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return false;
  const [shorter, longer] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const word of shorter) if (longer.has(word)) shared += 1;
  // Zeventig procent en niet zestig: bij zestig gingen "BE week 4 - H4 + H5
  // opgaven + Casus deel 1" en "Excel week 4 - H5 Grafieken" voor hetzelfde
  // door, alleen omdat ze "week", "4" en "h5" delen. Een valse melding is hier
  // duurder dan een gemiste: hij zet je aan het twijfelen over werk dat klopt.
  return shared / shorter.size >= 0.7;
}

/** Wat er dubbel lijkt te staan: opdrachten en blokken op dezelfde dag. */
function findDuplicates(data: AgendaData, from: string, to: string): Duplicate[] {
  const found: Duplicate[] = [];

  const open = data.tasks.filter((task) => task.status !== "done");
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      const a = open[i];
      const b = open[j];
      if (a.subject !== b.subject || a.deadline !== b.deadline) continue;
      if (!looksTheSame(a.title, b.title)) continue;
      found.push({
        kind: "taak",
        titles: [a.title, b.title],
        ids: [a.id, b.id],
        note: `zelfde vak en zelfde deadline (${a.deadline})`,
      });
    }
  }

  // Blokken vergelijken we per dag: twee keer hetzelfde op één dag valt op,
  // twee keer op verschillende dagen is gewoon een gewoonte.
  const perDay = new Map<string, Set<string>>();
  for (const activity of data.activities) {
    if (activity.date < from || activity.date > to) continue;
    const day = perDay.get(activity.date) ?? new Set<string>();
    day.add(activity.id);
    perDay.set(activity.date, day);
  }
  const seen = new Set<string>();
  for (const [date, ids] of perDay) {
    const items = data.activities.filter((item) => ids.has(item.id));
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (!looksTheSame(a.title, b.title)) continue;
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          kind: "activiteit",
          titles: [a.title, b.title],
          ids: [a.id, b.id],
          note: `staan allebei op ${date}`,
        });
      }
    }
  }

  return found;
}

/** De botsingen van één dag, ontdubbeld tot één regel per paar. */
function clashesForDay(data: AgendaData, date: string): ReadClash[] {
  const settings = data.settings;
  if (!settings) return [];
  const map = clashesOnDate(data.activities, settings, date);
  if (map.size === 0) return [];
  const seen = new Set<string>();
  const out: ReadClash[] = [];
  for (const occurrence of activitiesOnDate(data.activities, date)) {
    for (const clash of map.get(occurrence.occurrenceId) ?? []) {
      const key = [occurrence.id, clash.other.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        between: [occurrence.title, clash.other.title],
        travelOnly: clash.travelOnly,
        note: clash.travelOnly
          ? "de reis naar de een valt over de ander heen"
          : "ze overlappen op de klok",
      });
    }
  }
  return out;
}

/** Een datum uit de invoer, of null wanneer hij onbruikbaar is. */
function dateOrNull(value: unknown): string | null {
  return isDateKey(value) ? value : null;
}

/**
 * De agenda over een periode, met de herhalingen al uitgerekend.
 *
 * De planner krijgt dagen, geen reeksen: "elke dinsdag" zegt niets over de
 * dinsdag waarop hij iets wil inplannen. Wat hij hier ziet is wat er die dag
 * werkelijk staat.
 */
export function readAgenda(
  data: AgendaData,
  options: { from?: unknown; to?: unknown } = {},
  now: Date = new Date(),
): ReadResult {
  const today = todayKey(now);
  const from = dateOrNull(options.from) ?? today;
  const requested = dateOrNull(options.to);
  const span = requested ? daysBetween(from, requested) : DEFAULT_DAYS - 1;
  // Een omgekeerde of buitensporige periode is geen reden om niets terug te
  // geven; hem stilletjes rechttrekken levert altijd nog een bruikbaar antwoord.
  const days = Math.min(Math.max(span, 0), MAX_DAYS - 1);
  const to = addDaysToKey(from, days);

  const settings = data.settings;
  const result: ReadDay[] = [];

  for (let i = 0; i <= days; i += 1) {
    const date = addDaysToKey(from, i);
    const occurrences = activitiesOnDate(data.activities, date);
    result.push({
      date,
      weekday: WEEKDAYS[new Date(`${date}T12:00:00`).getDay()],
      free: freeOnDate(data.activities, settings, date),
      movable: movableOnDate(data.activities, date),
      clashes: clashesForDay(data, date),
      activities: occurrences.map((occurrence) => {
        const entry: ReadActivity = {
          id: occurrence.id,
          title: occurrence.title,
          category: occurrence.category,
          allDay: Boolean(occurrence.allDay),
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
        };
        if (occurrence.location) entry.location = occurrence.location.label;
        // De vertrektijd is geen veld maar een sommetje van rit, marge en
        // begintijd — precies het sommetje dat de app zelf op het scherm zet.
        // Die hier overdoen zou betekenen dat de planner met andere tijden
        // werkt dan wat de gebruiker leest.
        const departure = settings ? computeDeparture(occurrence, settings) : null;
        if (departure) {
          entry.departure = departure.time;
          entry.travelMinutes = departure.travelMinutes;
          if (departure.arrival) entry.arrival = departure.arrival;
          if (departure.late) entry.arrivesLate = true;
        }
        // En de reis terug. Zonder dit weet een planner wel hoe laat je weg
        // moet, maar niet wanneer je weer beschikbaar bent -- en plant hij een
        // leerblok in het uur dat je nog in de trein zit.
        // Hoort er hier überhaupt een heenreis bij? Zit je er al, of kom je van
        // een andere plek, dan is er niets te vertrekken -- dat is geen
        // ontbrekende reistijd maar een reis die ergens anders staat.
        const heenreisHoortErbij =
          Boolean(occurrence.location) &&
          !occurrence.allDay &&
          occurrence.travelRole.outbound &&
          !occurrence.travelRole.arrivesFrom;

        if (!departure && heenreisHoortErbij && settings) {
          // Geen berekende heenreis. Dan de thuisreis aanhouden, met een vlag
          // erbij -- precies zoals het andersom al ging.
          const geschat = occurrence.returnTravel?.durationMinutes;
          if (geschat) {
            const minutes =
              timeToMinutes(occurrence.startTime) - geschat - bufferFor(occurrence, settings);
            entry.departure = minutesToTime(minutes);
            entry.travelMinutes = geschat;
            entry.departureEstimated = true;
          }
        }

        const back = settings ? computeReturn(occurrence, settings) : null;
        if (back) {
          entry.backHome = back.time;
          entry.returnMinutes = back.travelMinutes;
        } else if (occurrence.location && !occurrence.allDay) {
          // Nog geen berekende thuisreis. Zwijgen zou betekenen dat de eindtijd
          // als thuiskomst geldt, en dat is de fout waar het om begonnen was.
          // Dan liever de andere kant als schatting, met een vlag erbij.
          const geschat = travelMinutesEither(occurrence, "back");
          if (geschat > 0) {
            const minutes = timeToMinutes(occurrence.endTime) + geschat;
            entry.backHome = minutesToTime(minutes);
            entry.returnMinutes = geschat;
            entry.backHomeEstimated = true;
          }
        }

        // Niets bekend, en er hoort wel een reis bij: dat moet er met zoveel
        // woorden staan. Anders ziet dit blok eruit als iets om de hoek.
        if (
          occurrence.location &&
          !occurrence.allDay &&
          entry.travelMinutes === undefined &&
          entry.returnMinutes === undefined
        ) {
          entry.travelUnknown = true;
          if (occurrence.travelError) entry.travelNote = occurrence.travelError;
        }
        if (occurrence.source) entry.source = occurrence.source;
        if (occurrence.linkedTaskId) entry.linkedTaskId = occurrence.linkedTaskId;
        if (occurrence.linkedStepId) entry.linkedStepId = occurrence.linkedStepId;
        if (occurrence.linkedExamId) entry.linkedExamId = occurrence.linkedExamId;
        if (occurrence.recurring) entry.recurring = true;
        return entry;
      }),
    });
  }

  return {
    today,
    from,
    to,
    home: settings?.home?.label ?? null,
    defaults: {
      bufferMinutes: settings?.bufferMinutes ?? 10,
      travelMode: settings?.travelMode ?? "car",
    },
    rules: {
      planFrom: minutesToTime(DAY_STARTS),
      planUntil: minutesToTime(PLAN_UNTIL),
      minimumMinutes: MIN_GAP,
      movableCategories: MOVABLE,
      note:
        "Plan alleen in `free`. Staat er te weinig ruimte, stel dan voor om een " +
        "blok uit `movable` te verzetten en wacht op antwoord -- verzet het nooit " +
        "uit jezelf. Alles buiten `movable` ligt vast. Staat er `recurring: true` " +
        "bij, dan kan alleen díe ene dag eruit met `skip_occurrence` of naar een " +
        "ander tijdstip met `move_occurrence`; de rest van de reeks blijft dan " +
        "staan. Staat er `away: true` bij, dan hangt er een plek aan en verandert " +
        "ook de reis. Vraag het altijd eerst.",
    },
    days: result,
    duplicates: findDuplicates(data, from, to),
    // Afgeronde taken zijn ruis voor wie een planning maakt; de toetsen en
    // taken die nog moeten gebeuren zijn precies waar het om draait.
    tasks: data.tasks
      .filter((task) => task.status !== "done")
      .map((task) => {
        // Wat er al staat telt mee: zonder dit plant een planner er elke keer
        // een nieuwe stapel bovenop, want hij ziet niet dat het er al is.
        const plannedMinutes = data.activities
          .filter((item) => item.linkedTaskId === task.id)
          .reduce((sum, item) => sum + activityMinutes(item), 0);
        return {
          id: task.id,
          subject: task.subject,
          title: task.title,
          deadline: task.deadline,
          estimatedMinutes: task.estimatedMinutes,
          plannedMinutes,
          remainingMinutes: Math.max(0, task.estimatedMinutes - plannedMinutes),
          priority: task.priority,
          status: task.status,
          // Met de stappen erbij kan een planning per stap een blok zetten, en
          // weet de planner welke delen al af zijn.
          steps: task.steps?.map((step) => ({
            id: step.id,
            title: step.title,
            estimatedMinutes: step.estimatedMinutes,
            done: step.done,
          })),
        };
      }),
    exams: data.exams
      .filter((exam) => exam.status !== "done" && exam.date >= today)
      .map((exam) => ({
        id: exam.id,
        subject: exam.subject,
        title: exam.title,
        date: exam.date,
        prepMinutes: exam.prepMinutes,
        priority: exam.priority,
        status: exam.status,
        topics: exam.topics,
      })),
  };
}
