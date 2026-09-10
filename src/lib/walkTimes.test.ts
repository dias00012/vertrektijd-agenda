import { describe, expect, it } from "vitest";
import { applyWalkSpeed, type WalkItinerary } from "./walkTimes";

/** 5,04 km/h: waar de app van uitgaat. */
const TEMPO = 1.4;

const klok = (tijd: string) => Date.parse(`2026-09-11T${tijd}:00.000Z`);
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * De rit uit Almere naar de Donaustraat in Lelystad, zoals de planner hem
 * geeft: lopen naar het station, de trein, overstappen op de bus, en het
 * loopstuk vanaf halte Palazzo waar de kaart de mist in gaat.
 *
 * De loopstukken staan standaard al op je eigen tempo, zodat elke test er
 * precies eentje uit hoeft te halen. De tijden worden uit de duur gerekend,
 * want een rit waarin die twee niet kloppen bestaat niet.
 */
function rit(over: {
  eerste?: { distance?: number; duration?: number; mode?: string };
  overstap?: { distance?: number; duration?: number };
  laatste?: { distance?: number; duration?: number; mode?: string };
}): WalkItinerary {
  const eerste = { distance: 741, duration: 540, mode: "WALK", ...over.eerste };
  const overstap = { distance: 148, duration: 120, ...over.overstap };
  const laatste = { distance: 709, duration: 540, mode: "WALK", ...over.laatste };

  // Vaste ankers uit de dienstregeling: de trein en de bus rijden hoe dan ook.
  const instappen = klok("04:52");
  const uitstappen = klok("05:03");
  const busWeg = klok("05:08");
  const busAan = klok("05:14");

  const vertrek = instappen - (eerste.duration ?? 0) * 1000;
  const thuis = busAan + (laatste.duration ?? 0) * 1000;

  return {
    startTime: iso(vertrek),
    endTime: iso(thuis),
    duration: (thuis - vertrek) / 1000,
    legs: [
      {
        mode: eerste.mode,
        distance: eerste.distance,
        duration: eerste.duration,
        startTime: iso(vertrek),
        scheduledStartTime: iso(vertrek),
        endTime: iso(instappen),
      },
      { mode: "RAIL", duration: 660, startTime: iso(instappen), endTime: iso(uitstappen) },
      {
        mode: "WALK",
        distance: overstap.distance,
        duration: overstap.duration,
        startTime: iso(uitstappen),
        endTime: iso(uitstappen + (overstap.duration ?? 0) * 1000),
      },
      { mode: "BUS", duration: 360, startTime: iso(busWeg), endTime: iso(busAan) },
      {
        mode: laatste.mode,
        distance: laatste.distance,
        duration: laatste.duration,
        startTime: iso(busAan),
        endTime: iso(thuis),
        scheduledEndTime: iso(thuis),
      },
    ],
  };
}

/** Een rit die alleen uit lopen bestaat, zoals de planner die soms teruggeeft. */
function lopen(distance: number, duration: number): WalkItinerary {
  return {
    startTime: iso(klok("04:41")),
    endTime: iso(klok("04:41") + duration * 1000),
    duration,
    legs: [
      {
        mode: "WALK",
        distance,
        duration,
        startTime: iso(klok("04:41")),
        endTime: iso(klok("04:41") + duration * 1000),
      },
    ],
  };
}

describe("applyWalkSpeed", () => {
  it("rekent het loopstuk vanaf Palazzo na op je eigen tempo", () => {
    // 916 meter in 18 minuten is 3,1 km/h, terwijl de app met 5 rekent: de
    // Torenvalktunnel kost tien minuten in de kaartgegevens van de planner.
    const uit = applyWalkSpeed(rit({ laatste: { distance: 916, duration: 1080 } }), TEMPO);

    const laatste = uit.legs?.at(-1);
    expect((laatste?.duration ?? 0) / 60).toBe(11);
    expect(laatste?.startTime).toBe("2026-09-11T05:14:00.000Z");
    expect(laatste?.endTime).toBe("2026-09-11T05:25:00.000Z");
    expect(laatste?.scheduledEndTime).toBe("2026-09-11T05:25:00.000Z");
    expect(uit.endTime).toBe("2026-09-11T05:25:00.000Z");
    expect(uit.duration).toBe(2940 - 420);
  });

  it("laat je later de deur uit voor het stuk naar de eerste halte", () => {
    // 741 meter is op 5,04 km/h negen minuten; de planner rekent er tien.
    // De trein wacht niet, dus het einde blijft staan en het begin schuift op.
    const uit = applyWalkSpeed(rit({ eerste: { distance: 741, duration: 600 } }), TEMPO);

    const eerste = uit.legs?.[0];
    expect((eerste?.duration ?? 0) / 60).toBe(9);
    expect(eerste?.startTime).toBe("2026-09-11T04:43:00.000Z");
    expect(eerste?.scheduledStartTime).toBe("2026-09-11T04:43:00.000Z");
    expect(eerste?.endTime).toBe("2026-09-11T04:52:00.000Z");
    expect(uit.startTime).toBe("2026-09-11T04:43:00.000Z");
    expect(uit.duration).toBe(2460 - 60);
  });

  it("maakt van een kortere overstap wachttijd, geen kortere reis", () => {
    // 148 meter in drie minuten; twee is genoeg. Je bus vertrekt daar niet
    // eerder van, dus de reis duurt precies even lang.
    const origineel = rit({ overstap: { distance: 148, duration: 180 } });
    const uit = applyWalkSpeed(origineel, TEMPO);

    expect((uit.legs?.[2]?.duration ?? 0) / 60).toBe(2);
    expect(uit.legs?.[2]?.startTime).toBe("2026-09-11T05:03:00.000Z");
    expect(uit.legs?.[2]?.endTime).toBe("2026-09-11T05:05:00.000Z");
    expect(uit.duration).toBe(origineel.duration);
    expect(uit.startTime).toBe(origineel.startTime);
    expect(uit.endTime).toBe(origineel.endTime);
  });

  it("telt de winst aan beide uiteinden bij elkaar op", () => {
    const uit = applyWalkSpeed(
      rit({
        eerste: { distance: 741, duration: 600 },
        overstap: { distance: 148, duration: 180 },
        laatste: { distance: 916, duration: 1080 },
      }),
      TEMPO,
    );

    expect(uit.startTime).toBe("2026-09-11T04:43:00.000Z");
    expect(uit.endTime).toBe("2026-09-11T05:25:00.000Z");
    expect(uit.duration).toBe(3000 - 60 - 420);
  });

  it("laat een loopstuk dat al op je tempo ligt met rust", () => {
    // 709 meter is negen minuten op 5,04 km/h, en dat is precies wat er staat.
    const origineel = rit({ laatste: { distance: 709, duration: 540 } });
    expect(applyWalkSpeed(origineel, TEMPO)).toBe(origineel);
  });

  it("brengt een reis die alleen uit lopen bestaat eerder thuis", () => {
    // Geen halte om rekening mee te houden: je vertrekt wanneer je zelf wilt.
    const uit = applyWalkSpeed(lopen(1000, 1200), TEMPO);

    expect(uit.startTime).toBe("2026-09-11T04:41:00.000Z");
    expect(uit.endTime).toBe("2026-09-11T04:53:00.000Z");
    expect(uit.duration).toBe(720);
  });

  it("blijft van een deelrit af die geen lopen is", () => {
    const origineel = rit({ laatste: { distance: 916, duration: 1080, mode: "BUS" } });
    expect(applyWalkSpeed(origineel, TEMPO)).toBe(origineel);
  });

  it("blijft van de reis af zonder bekende afstand", () => {
    const origineel = rit({ laatste: { distance: undefined, duration: 1080 } });
    expect(applyWalkSpeed(origineel, TEMPO)).toBe(origineel);
  });

  it("maakt een reis nooit langer", () => {
    // Loop je rustig (2,9 km/h), dan is de planner niet te traag maar te snel;
    // dan blijft zijn tijd staan.
    const origineel = rit({ laatste: { distance: 916, duration: 1080 } });
    expect(applyWalkSpeed(origineel, 0.8)).toBe(origineel);
  });

  it("laat een reis zonder deelritten met rust", () => {
    const origineel: WalkItinerary = { duration: 600, legs: [] };
    expect(applyWalkSpeed(origineel, TEMPO)).toBe(origineel);
  });
});
