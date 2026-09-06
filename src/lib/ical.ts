/**
 * iCalendar (.ics) lezen.
 *
 * Bijna elk roostersysteem kan een agenda exporteren in dit formaat: Magister,
 * Somtoday, Zermelo, Google Agenda, Outlook. Door het formaat te lezen in plaats
 * van één systeem te koppelen werkt het voor iedereen, zonder afspraken met
 * scholen en zonder sleutels.
 *
 * Bewust zonder externe bibliotheek: we hebben maar een klein deel nodig, en
 * dit blijft daarmee te overzien en te testen.
 */

export interface IcsEvent {
  /** Stabiele sleutel uit het bestand; nodig om bij een herhaalde import bij te werken. */
  uid: string;
  title: string;
  /** Lokale wandkloktijd: "YYYY-MM-DD". */
  date: string;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
  /** Lokaal of zaal zoals het in het rooster staat; puur ter informatie. */
  location: string | null;
  /** Duurt de hele dag: een vakantiedag, studiedag of mededeling. */
  allDay: boolean;
  /** Laatste dag bij iets dat meer dagen duurt; anders gelijk aan `date`. */
  endDate: string;
}

interface RawEvent {
  props: Map<string, { value: string; params: Map<string, string> }>;
  exdates: string[];
}

/**
 * Regels weer aan elkaar plakken. iCalendar knipt lange regels op en laat de
 * volgende regel met een spatie of tab beginnen.
 */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** "DTSTART;TZID=Europe/Amsterdam:20260907T090000" uit elkaar halen. */
function parseLine(line: string): { name: string; params: Map<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");

  const params = new Map<string, string>();
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1).replace(/^"|"$/g, ""));
  }

  return { name: name.toUpperCase(), params, value };
}

/** Tekstwaarden zijn ontsnapt: \n, \, en de komma en puntkomma. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * Het moment waarop een zone een bepaalde wandkloktijd had, als UTC-tijdstip.
 * Houdt automatisch rekening met zomertijd.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );
    return new Date(guess - (asUtc - guess));
  } catch {
    // Onbekende zone: dan maar als UTC lezen, beter dan helemaal niets.
    return new Date(guess);
  }
}

/** De tijdzone waarin we tijden zonder zone lezen. */
const DEFAULT_ZONE = "Europe/Amsterdam";

/**
 * Een DTSTART/DTEND omzetten naar een absoluut moment.
 * `null` betekent: hier valt niets zinnigs van te maken.
 */
function parseDateTime(
  value: string,
  params: Map<string, string>,
  zone: string,
): { date: Date; allDay: boolean } | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi, , utc] = match;
  const allDay = h === undefined || params.get("VALUE") === "DATE";

  if (allDay) {
    // Hele dag: middernacht in de eigen zone.
    return { date: zonedTimeToUtc(+y, +mo, +d, 0, 0, zone), allDay: true };
  }
  if (utc) {
    return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)), allDay: false };
  }
  return {
    date: zonedTimeToUtc(+y, +mo, +d, +h, +mi, params.get("TZID") || zone),
    allDay: false,
  };
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Weekdagen uit een BYDAY, als getallen volgens Date#getDay(). */
function parseByDay(byDay: string): number[] {
  return byDay
    .split(",")
    .map((code) => DAY_CODES.indexOf(code.trim().slice(-2).toUpperCase()))
    .filter((index) => index >= 0);
}

export interface ParseOptions {
  /** Alleen lessen vanaf deze dag meenemen. */
  from: Date;
  /** En tot en met deze dag. */
  to: Date;
  /** Tijdzone waarin tijden zonder zone gelezen worden. */
  zone?: string;
  /** Harde bovengrens, zodat een enorm bestand de app niet plat legt. */
  max?: number;
}

/** Datum- en tijdsleutel van een moment, in de gekozen zone. */
function localParts(date: Date, zone: string): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hour = String(Number(parts.hour) % 24).padStart(2, "0");
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

/**
 * Leest een .ics-bestand en geeft de lessen binnen het gevraagde venster terug,
 * op tijd gesorteerd. Herhalingen worden uitgeklapt naar losse dagen, zodat de
 * agenda ze net zo behandelt als handmatig ingevoerde activiteiten.
 */
export function parseIcs(text: string, options: ParseOptions): IcsEvent[] {
  const zone = options.zone ?? DEFAULT_ZONE;
  const max = options.max ?? 800;
  const fromMs = options.from.getTime();
  const toMs = options.to.getTime();

  const events: RawEvent[] = [];
  let current: RawEvent | null = null;

  for (const line of unfold(text)) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    if (parsed.name === "BEGIN" && parsed.value.toUpperCase() === "VEVENT") {
      current = { props: new Map(), exdates: [] };
      continue;
    }
    if (parsed.name === "END" && parsed.value.toUpperCase() === "VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    if (parsed.name === "EXDATE") {
      for (const part of parsed.value.split(",")) {
        const stamp = parseDateTime(part, parsed.params, zone);
        if (stamp) current.exdates.push(localParts(stamp.date, zone).date);
      }
      continue;
    }
    current.props.set(parsed.name, { value: parsed.value, params: parsed.params });
  }

  const out: IcsEvent[] = [];

  for (const event of events) {
    if (out.length >= max) break;

    const status = event.props.get("STATUS")?.value.toUpperCase();
    if (status === "CANCELLED") continue;

    const startProp = event.props.get("DTSTART");
    if (!startProp) continue;
    const start = parseDateTime(startProp.value, startProp.params, zone);
    if (!start) continue;

    const endProp = event.props.get("DTEND");
    const end = endProp ? parseDateTime(endProp.value, endProp.params, zone) : null;

    const title = unescapeText(event.props.get("SUMMARY")?.value ?? "") || "Les";
    const location = unescapeText(event.props.get("LOCATION")?.value ?? "") || null;
    const uid = event.props.get("UID")?.value.trim() || `${title}-${startProp.value}`;

    // Hele dagen: vakanties, studiedagen, roostervrije weken. Die hebben geen
    // tijdstip en dus geen vertrektijd, maar horen wel gewoon in je agenda.
    // In ics is DTEND bij een hele dag exclusief: een vrije dag op de 20e
    // krijgt DTEND 21, dus die dag telt er niet meer bij.
    //
    // Een herhaling nemen we hier niet mee: een terugkerende vrije dag komt in
    // roosters nauwelijks voor, en de eerste keer staat er in elk geval.
    if (start.allDay) {
      // Alleen wat binnen het gevraagde venster valt. Een vakantie die pas
      // volgend jaar begint hoeft nu niet in je agenda te staan.
      const spanEndMs = end ? end.date.getTime() : start.date.getTime() + 86_400_000;
      if (start.date.getTime() > toMs || spanEndMs <= fromMs) continue;

      const from = localParts(start.date, zone);
      const lastDay = end
        ? localParts(new Date(end.date.getTime() - 86_400_000), zone).date
        : from.date;
      out.push({
        uid: `${uid}@${from.date}`,
        title,
        date: from.date,
        endDate: lastDay >= from.date ? lastDay : from.date,
        allDay: true,
        startTime: "00:00",
        endTime: "23:59",
        location,
      });
      continue;
    }

    // Zonder eindtijd: een uur aannemen.
    const durationMs = end ? end.date.getTime() - start.date.getTime() : 60 * 60_000;
    if (durationMs <= 0) continue;

    for (const occurrence of expand(start.date, event, fromMs, toMs, zone)) {
      if (out.length >= max) break;
      const from = localParts(occurrence, zone);
      const to = localParts(new Date(occurrence.getTime() + durationMs), zone);
      out.push({
        uid: `${uid}@${from.date}`,
        title,
        date: from.date,
        endDate: from.date,
        allDay: false,
        startTime: from.time,
        // Loopt de les over middernacht, dan kappen we hem op 23:59 af: de
        // agenda werkt per dag en een les die dat doet bestaat niet.
        endTime: to.date === from.date ? to.time : "23:59",
        location,
      });
    }
  }

  return out.sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );
}

/** Zo ver klappen we een herhaling maximaal uit. */
const MAX_OCCURRENCES = 400;

/** Kalenderdagen optellen bij "YYYY-MM-DD", los van welke tijdzone dan ook. */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const moment = new Date(Date.UTC(y, m - 1, d));
  moment.setUTCDate(moment.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${moment.getUTCFullYear()}-${pad(moment.getUTCMonth() + 1)}-${pad(moment.getUTCDate())}`;
}

/** Weekdag van een kalenderdag (0 = zondag), zonder tijdzone-invloed. */
function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Alle dagen waarop dit item valt binnen het venster. Zonder RRULE is dat de
 * dag zelf; met een wekelijkse RRULE de gekozen weekdagen.
 *
 * We tellen in kalenderdagen en zetten de kloktijd er daarna weer op, niet in
 * blokken van 24 uur. Anders schuift een les van 09:00 naar 08:00 zodra de
 * zomertijd eindigt: die nacht duurt 25 uur.
 */
function expand(start: Date, event: RawEvent, fromMs: number, toMs: number, zone: string): Date[] {
  const rule = event.props.get("RRULE")?.value;
  const inWindow = (date: Date) => date.getTime() >= fromMs && date.getTime() <= toMs;

  if (!rule) return inWindow(start) ? [start] : [];

  const parts = new Map(
    rule.split(";").map((part) => {
      const eq = part.indexOf("=");
      return [part.slice(0, eq).toUpperCase(), part.slice(eq + 1)] as [string, string];
    }),
  );

  // Alleen wekelijks uitklappen. Andere frequenties komen in schoolroosters
  // nauwelijks voor; die nemen we mee als losse afspraak.
  if ((parts.get("FREQ") ?? "").toUpperCase() !== "WEEKLY") {
    return inWindow(start) ? [start] : [];
  }

  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1);
  const byDay = parts.has("BYDAY") ? parseByDay(parts.get("BYDAY") as string) : null;
  const count = parts.has("COUNT") ? Number(parts.get("COUNT")) : null;

  let untilMs = toMs;
  const until = parts.get("UNTIL");
  if (until) {
    const parsed = parseDateTime(until, new Map(), zone);
    if (parsed) untilMs = Math.min(untilMs, parsed.date.getTime());
  }

  // De kloktijd van de eerste keer; die houden we vast op elke volgende dag.
  const base = localParts(start, zone);
  const [hours, minutes] = base.time.split(":").map(Number);
  const at = (dateKey: string) => {
    const [y, m, d] = dateKey.split("-").map(Number);
    return zonedTimeToUtc(y, m, d, hours, minutes, zone);
  };

  // Weken tellen vanaf maandag, zoals iCalendar standaard doet.
  const startOffset = (weekdayOf(base.date) + 6) % 7;

  const dates: Date[] = [];
  let produced = 0;

  for (let offset = 0; offset < MAX_OCCURRENCES * 7; offset += 1) {
    const dateKey = addDays(base.date, offset);
    const candidate = at(dateKey);
    const time = candidate.getTime();
    if (time > untilMs) break;
    if (count !== null && produced >= count) break;

    // Alleen elke n-de week meedoen.
    if (Math.floor((offset + startOffset) / 7) % interval !== 0) continue;

    const weekday = weekdayOf(dateKey);
    if (byDay && !byDay.includes(weekday)) continue;
    if (!byDay && offset % 7 !== 0) continue;

    produced += 1;
    if (time < fromMs) continue;
    if (event.exdates.includes(dateKey)) continue;

    dates.push(candidate);
    if (dates.length >= MAX_OCCURRENCES) break;
  }

  return dates;
}
