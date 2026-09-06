import { describe, expect, it } from "vitest";
import { pickItinerary, tidyItineraries, type ItineraryLike } from "./itineraries";

/**
 * De reisplanner geeft opties terug in een volgorde die niet vastligt. Deze
 * tests zetten de beste optie daarom bewust níét vooraan, zodat ze aantonen
 * dat de app kiest en niet gewoon de eerste pakt.
 */
function option(
  start: string,
  end: string,
  patch: Partial<ItineraryLike> = {},
): ItineraryLike {
  const startTime = `2026-09-07T${start}:00.000Z`;
  const endTime = `2026-09-07T${end}:00.000Z`;
  return {
    startTime,
    endTime,
    duration: (Date.parse(endTime) - Date.parse(startTime)) / 1000,
    transfers: 0,
    ...patch,
  };
}

describe("pickItinerary", () => {
  it("kiest bij een deadline de laatste vertrektijd die nog op tijd is", () => {
    const options = [
      option("06:40", "08:50"), // veel te vroeg de deur uit
      option("08:12", "08:54", { transfers: 1 }), // de rit uit de vraag
      option("07:30", "08:40"),
    ];

    const best = pickItinerary(options, {
      arriveBy: true,
      time: "2026-09-07T09:00:00.000Z",
    });

    expect(best?.startTime).toBe("2026-09-07T08:12:00.000Z");
  });

  it("laat opties vallen die te laat aankomen", () => {
    const options = [
      option("08:30", "09:20"), // later weg, maar te laat
      option("08:12", "08:54"),
    ];

    const best = pickItinerary(options, {
      arriveBy: true,
      time: "2026-09-07T09:00:00.000Z",
    });

    expect(best?.startTime).toBe("2026-09-07T08:12:00.000Z");
  });

  it("neemt bij vertrekken vanaf een tijd de vroegste aankomst", () => {
    const options = [
      option("17:05", "18:20"), // vertrekt het eerst, maar duurt het langst
      option("17:20", "18:02"),
      option("17:12", "18:10"),
    ];

    const best = pickItinerary(options, { time: "2026-09-07T17:00:00.000Z" });

    expect(best?.endTime).toBe("2026-09-07T18:02:00.000Z");
  });

  it("negeert ritten die al vertrokken zijn", () => {
    const options = [option("16:40", "17:30"), option("17:20", "18:02")];

    const best = pickItinerary(options, { time: "2026-09-07T17:00:00.000Z" });

    expect(best?.startTime).toBe("2026-09-07T17:20:00.000Z");
  });

  it("neemt een paar minuten eerder weg op de koop toe voor een overstap minder", () => {
    const options = [
      option("08:14", "08:58", { transfers: 3 }),
      option("08:12", "08:54", { transfers: 1 }),
    ];

    const best = pickItinerary(options, {
      arriveBy: true,
      time: "2026-09-07T09:00:00.000Z",
    });

    expect(best?.transfers).toBe(1);
  });

  it("valt terug op wat er wél is als niets de gevraagde tijd haalt", () => {
    const options = [option("08:30", "09:20"), option("08:40", "09:35")];

    const best = pickItinerary(options, {
      arriveBy: true,
      time: "2026-09-07T09:00:00.000Z",
    });

    expect(best?.endTime).toBe("2026-09-07T09:20:00.000Z");
  });

  it("slaat opties zonder bruikbare tijden over", () => {
    const options: ItineraryLike[] = [
      { startTime: "geen tijd", endTime: "ook niet", duration: 600 },
      { startTime: "2026-09-07T08:12:00.000Z", endTime: "2026-09-07T08:54:00.000Z" }, // duur ontbreekt
      option("08:12", "08:54"),
    ];

    expect(pickItinerary(options, {})?.duration).toBe(42 * 60);
  });

  it("geeft niets terug als er niets bruikbaars is", () => {
    expect(pickItinerary([], {})).toBeNull();
  });
});

describe("tidyItineraries", () => {
  it("zet de lijst op vertrektijd, ongeacht hoe hij binnenkomt", () => {
    const list = tidyItineraries([
      option("08:42", "09:24"),
      option("08:12", "08:54"),
      option("08:27", "09:09"),
    ]);

    expect(list.map((item) => item.startTime)).toEqual([
      "2026-09-07T08:12:00.000Z",
      "2026-09-07T08:27:00.000Z",
      "2026-09-07T08:42:00.000Z",
    ]);
  });

  it("gooit een optie weg die eerder weg moet én later aankomt", () => {
    const list = tidyItineraries([
      option("08:05", "09:10"), // eerder de deur uit voor een latere aankomst
      option("08:12", "08:54"),
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.startTime).toBe("2026-09-07T08:12:00.000Z");
  });

  it("houdt een langzamere rit die je wél later laat vertrekken", () => {
    const list = tidyItineraries([option("08:12", "08:54"), option("08:30", "09:20")]);

    expect(list).toHaveLength(2);
  });

  it("houdt een langere rit die je juist het eerst op je bestemming zet", () => {
    // De bus doet er 22 minuten over maar is er om 08:42; de trein duurt 8
    // minuten en is er pas om 09:00. Op reisduur filteren zou de bus wissen.
    const list = tidyItineraries([
      option("08:20", "08:42"),
      option("08:52", "09:00"),
    ]);

    expect(list).toHaveLength(2);
  });

  it("houdt de laatste rit van de dag, hoe lang die ook duurt", () => {
    const list = tidyItineraries([
      option("22:05", "22:47"),
      option("22:35", "23:17"),
      // Anderhalf uur en pas na middernacht thuis, maar het is de laatste rit.
      {
        startTime: "2026-09-07T23:20:00.000Z",
        endTime: "2026-09-08T00:55:00.000Z",
        duration: 95 * 60,
        transfers: 1,
      },
    ]);

    expect(list).toHaveLength(3);
  });

  it("houdt een even snelle rit met minder overstappen", () => {
    const list = tidyItineraries([
      option("08:12", "08:54", { transfers: 2 }),
      option("08:12", "08:54", { transfers: 1 }),
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.transfers).toBe(1);
  });
});
