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

  it("laat hele dagen weg: dat is geen les om naartoe te reizen", () => {
    const events = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:vrij",
          "SUMMARY:Herfstvakantie",
          "DTSTART;VALUE=DATE:20261019",
          "DTEND;VALUE=DATE:20261024",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      WINDOW,
    );
    expect(events).toHaveLength(0);
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
