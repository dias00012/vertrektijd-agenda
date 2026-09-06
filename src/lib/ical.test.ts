import { describe, expect, it } from "vitest";
import { parseIcs } from "./ical";

const WINDOW = {
  from: new Date("2026-09-01T00:00:00Z"),
  to: new Date("2026-10-31T23:59:59Z"),
  zone: "Europe/Amsterdam",
};

function ics(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
}

describe("parseIcs", () => {
  it("leest een gewone les met tijdzone", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les-1",
          "SUMMARY:Wiskunde",
          "LOCATION:A1.23",
          "DTSTART;TZID=Europe/Amsterdam:20260907T090000",
          "DTEND;TZID=Europe/Amsterdam:20260907T104500",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Wiskunde",
      date: "2026-09-07",
      startTime: "09:00",
      endTime: "10:45",
      location: "A1.23",
    });
  });

  it("rekent een UTC-tijd om naar Nederlandse tijd", () => {
    // 07:00 UTC is in september 09:00 in Nederland (zomertijd).
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les-2",
          "SUMMARY:Nederlands",
          "DTSTART:20260907T070000Z",
          "DTEND:20260907T080000Z",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events[0].startTime).toBe("09:00");
    expect(events[0].endTime).toBe("10:00");
  });

  it("houdt rekening met de overgang naar wintertijd", () => {
    // Na de laatste zondag van oktober is het verschil met UTC nog één uur.
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les-3",
          "SUMMARY:Scheikunde",
          "DTSTART:20261102T080000Z",
          "DTEND:20261102T090000Z",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { ...WINDOW, to: new Date("2026-11-30T00:00:00Z") },
    );
    expect(events[0].startTime).toBe("09:00");
  });

  it("plakt geknipte regels weer aan elkaar", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les-4",
          "SUMMARY:Maatschappijleer met een hele lange",
          "  naam die is afgebroken",
          "DTSTART;TZID=Europe/Amsterdam:20260908T110000",
          "DTEND;TZID=Europe/Amsterdam:20260908T120000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events[0].title).toBe("Maatschappijleer met een hele lange naam die is afgebroken");
  });

  it("klapt een wekelijkse herhaling uit naar losse dagen", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les-5",
          "SUMMARY:Engels",
          "DTSTART;TZID=Europe/Amsterdam:20260907T090000",
          "DTEND;TZID=Europe/Amsterdam:20260907T100000",
          "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260929T000000Z",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events.map((e) => e.date)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("slaat een uitgezonderde dag over", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les-6",
          "SUMMARY:Biologie",
          "DTSTART;TZID=Europe/Amsterdam:20260907T090000",
          "DTEND;TZID=Europe/Amsterdam:20260907T100000",
          "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3",
          "EXDATE;TZID=Europe/Amsterdam:20260914T090000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events.map((e) => e.date)).toEqual(["2026-09-07", "2026-09-21"]);
  });

  it("laat afgelaste lessen weg", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les-7",
          "SUMMARY:Gym",
          "STATUS:CANCELLED",
          "DTSTART;TZID=Europe/Amsterdam:20260909T090000",
          "DTEND;TZID=Europe/Amsterdam:20260909T100000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(0);
  });

  it("neemt een vakantie over als hele dagen, met de laatste dag erbij", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:vrij",
          "SUMMARY:Herfstvakantie",
          "DTSTART;VALUE=DATE:20261019",
          // In ics is DTEND bij een hele dag exclusief: de 24e telt niet mee.
          "DTEND;VALUE=DATE:20261024",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Herfstvakantie");
    expect(events[0].allDay).toBe(true);
    expect(events[0].date).toBe("2026-10-19");
    expect(events[0].endDate).toBe("2026-10-23");
  });

  it("neemt een vrije dag van één dag over", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:studiedag",
          "SUMMARY:Studiedag",
          "DTSTART;VALUE=DATE:20261019",
          "DTEND;VALUE=DATE:20261020",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].date).toBe("2026-10-19");
    expect(events[0].endDate).toBe("2026-10-19");
  });

  it("laat een hele dag ver buiten het venster staan", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:kerst",
          "SUMMARY:Kerstvakantie",
          "DTSTART;VALUE=DATE:20271220",
          "DTEND;VALUE=DATE:20280104",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(0);
  });

  it("houdt een les gewoon een les: niet ineens een hele dag", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:les",
          "SUMMARY:Wiskunde",
          "DTSTART;TZID=Europe/Amsterdam:20261019T090000",
          "DTEND;TZID=Europe/Amsterdam:20261019T100000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(false);
    expect(events[0].startTime).toBe("09:00");
    expect(events[0].endDate).toBe(events[0].date);
  });

  it("negeert lessen buiten het gevraagde venster", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:oud",
          "SUMMARY:Vorig jaar",
          "DTSTART;TZID=Europe/Amsterdam:20250907T090000",
          "DTEND;TZID=Europe/Amsterdam:20250907T100000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(0);
  });

  it("geeft elke dag een eigen sleutel, zodat opnieuw importeren bijwerkt", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:vast-id",
          "SUMMARY:Frans",
          "DTSTART;TZID=Europe/Amsterdam:20260907T090000",
          "DTEND;TZID=Europe/Amsterdam:20260907T100000",
          "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events.map((e) => e.uid)).toEqual(["vast-id@2026-09-07", "vast-id@2026-09-14"]);
  });

  it("sorteert op dag en tijd", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:b",
          "SUMMARY:Later",
          "DTSTART;TZID=Europe/Amsterdam:20260908T140000",
          "DTEND;TZID=Europe/Amsterdam:20260908T150000",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:a",
          "SUMMARY:Eerder",
          "DTSTART;TZID=Europe/Amsterdam:20260908T080000",
          "DTEND;TZID=Europe/Amsterdam:20260908T090000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events.map((e) => e.title)).toEqual(["Eerder", "Later"]);
  });

  it("levert niets op bij een bestand dat geen agenda is", () => {
    expect(parseIcs("dit is gewoon tekst", WINDOW)).toEqual([]);
  });
});

describe("herhaling over de tijdswissel", () => {
  it("houdt dezelfde kloktijd aan als de zomertijd eindigt", () => {
    // In NL gaat de klok in de nacht van 24 op 25 oktober 2026 een uur terug.
    // Een wekelijkse les van 09:00 moet daarna nog steeds om 09:00 beginnen.
    const events = parseIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:les-dst",
        "SUMMARY:Wiskunde",
        "DTSTART;TZID=Europe/Amsterdam:20261019T090000",
        "DTEND;TZID=Europe/Amsterdam:20261019T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      {
        from: new Date("2026-10-01T00:00:00Z"),
        to: new Date("2026-11-30T00:00:00Z"),
        zone: "Europe/Amsterdam",
      },
    );

    expect(events.map((e) => `${e.date} ${e.startTime}-${e.endTime}`)).toEqual([
      "2026-10-19 09:00-10:00",
      "2026-10-26 09:00-10:00",
      "2026-11-02 09:00-10:00",
      "2026-11-09 09:00-10:00",
    ]);
  });
});

/**
 * Alleen wekelijkse herhalingen werden uitgeklapt. Een gekoppelde eigen agenda
 * zit vol met de andere soorten, en die verschenen dan als één losse afspraak:
 * de dagelijkse stand-up stond er één keer, de verjaardag verdween helemaal.
 */
describe("parseIcs met andere herhalingen dan wekelijks", () => {
  it("klapt een dagelijkse herhaling uit", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:standup",
          "SUMMARY:Stand-up",
          "DTSTART;TZID=Europe/Amsterdam:20260907T090000",
          "DTEND;TZID=Europe/Amsterdam:20260907T091500",
          "RRULE:FREQ=DAILY;COUNT=5",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events.map((event) => event.date)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
  });

  it("houdt bij dagelijks het interval aan", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:omdedag",
          "SUMMARY:Hardlopen",
          "DTSTART;TZID=Europe/Amsterdam:20260907T070000",
          "DTEND;TZID=Europe/Amsterdam:20260907T080000",
          "RRULE:FREQ=DAILY;INTERVAL=3;COUNT=3",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events.map((event) => event.date)).toEqual([
      "2026-09-07",
      "2026-09-10",
      "2026-09-13",
    ]);
  });

  it("klapt een maandelijkse herhaling uit op dezelfde dag van de maand", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:huur",
          "SUMMARY:Huur betalen",
          "DTSTART;TZID=Europe/Amsterdam:20260901T100000",
          "DTEND;TZID=Europe/Amsterdam:20260901T101500",
          "RRULE:FREQ=MONTHLY",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events.map((event) => event.date)).toEqual(["2026-09-01", "2026-10-01"]);
  });

  it("slaat een maand zonder die dag over in plaats van te schuiven", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:eenendertigste",
          "SUMMARY:Maandafsluiting",
          "DTSTART;TZID=Europe/Amsterdam:20260831T100000",
          "DTEND;TZID=Europe/Amsterdam:20260831T110000",
          "RRULE:FREQ=MONTHLY",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-11-30T23:59:59Z"), zone: "Europe/Amsterdam" },
    );

    // September heeft geen 31e; die maand valt weg, oktober doet weer mee.
    expect(events.map((event) => event.date)).toEqual(["2026-08-31", "2026-10-31"]);
  });

  it("klapt een jaarlijkse herhaling uit", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:verjaardag",
          "SUMMARY:Verjaardag",
          "DTSTART;TZID=Europe/Amsterdam:20200915T000000",
          "DTEND;TZID=Europe/Amsterdam:20200915T010000",
          "RRULE:FREQ=YEARLY",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events.map((event) => event.date)).toEqual(["2026-09-15"]);
  });

  it("laat een frequentie die we niet kennen als losse afspraak staan", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:raar",
          "SUMMARY:Iets",
          "DTSTART;TZID=Europe/Amsterdam:20260907T090000",
          "DTEND;TZID=Europe/Amsterdam:20260907T100000",
          "RRULE:FREQ=HOURLY;COUNT=5",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events).toHaveLength(1);
  });
});

/**
 * Een agenda meldt een afgelaste of verplaatste les met een tweede VEVENT met
 * dezelfde UID en een RECURRENCE-ID. Werd die koppeling genegeerd, dan bleef
 * de afgelaste les staan en kwam de verplaatste er dubbel in.
 */
describe("parseIcs met losse afwijkingen op een reeks", () => {
  const REEKS = [
    "BEGIN:VEVENT",
    "UID:wiskunde",
    "SUMMARY:Wiskunde",
    "DTSTART;TZID=Europe/Amsterdam:20260907T090000",
    "DTEND;TZID=Europe/Amsterdam:20260907T100000",
    "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4",
    "END:VEVENT",
  ];

  it("haalt een afgelaste les uit de reeks", () => {
    const events = parseIcs(
      ics(
        [
          ...REEKS,
          "BEGIN:VEVENT",
          "UID:wiskunde",
          "RECURRENCE-ID;TZID=Europe/Amsterdam:20260914T090000",
          "SUMMARY:Wiskunde",
          "DTSTART;TZID=Europe/Amsterdam:20260914T090000",
          "DTEND;TZID=Europe/Amsterdam:20260914T100000",
          "STATUS:CANCELLED",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events.map((event) => event.date)).toEqual([
      "2026-09-07",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("zet een verplaatste les op de nieuwe dag, en niet dubbel", () => {
    const events = parseIcs(
      ics(
        [
          ...REEKS,
          "BEGIN:VEVENT",
          "UID:wiskunde",
          "RECURRENCE-ID;TZID=Europe/Amsterdam:20260914T090000",
          "SUMMARY:Wiskunde (verplaatst)",
          "DTSTART;TZID=Europe/Amsterdam:20260916T130000",
          "DTEND;TZID=Europe/Amsterdam:20260916T140000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );

    expect(events.map((event) => event.date)).toEqual([
      "2026-09-07",
      "2026-09-16",
      "2026-09-21",
      "2026-09-28",
    ]);
    const verplaatst = events.find((event) => event.date === "2026-09-16");
    expect(verplaatst?.startTime).toBe("13:00");
    expect(verplaatst?.title).toBe("Wiskunde (verplaatst)");
  });

  it("raakt een reeks zonder afwijkingen niet kwijt", () => {
    const events = parseIcs(ics(REEKS.join("\r\n")), WINDOW);

    expect(events.map((event) => event.date)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });
});
