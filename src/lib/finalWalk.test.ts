import { describe, expect, it } from "vitest";
import { trimFinalWalk, type FinalWalkItinerary } from "./finalWalk";

/** 5 km/h: waar de app van uitgaat als je niets kiest. */
const FAST = 1.4;

function ride(lastWalk: { distance?: number; duration?: number; mode?: string }): FinalWalkItinerary {
  const walkSeconds = lastWalk.duration ?? 0;
  return {
    startTime: "2026-09-10T05:12:00Z",
    endTime: "2026-09-10T06:29:00Z",
    duration: 4620,
    legs: [
      {
        mode: "BUS",
        duration: 360,
        startTime: "2026-09-10T06:05:00Z",
        endTime: "2026-09-10T06:11:00Z",
      },
      {
        mode: lastWalk.mode ?? "WALK",
        distance: lastWalk.distance,
        duration: walkSeconds,
        startTime: "2026-09-10T06:11:00Z",
        endTime: "2026-09-10T06:29:00Z",
        scheduledEndTime: "2026-09-10T06:29:00Z",
      },
    ],
  };
}

describe("trimFinalWalk", () => {
  it("rekent het loopstuk vanaf Palazzo na op je eigen tempo", () => {
    // 916 meter in 18 minuten is 3,1 km/h, terwijl de app met 5 rekent: de
    // Torenvalktunnel kost tien minuten in de kaartgegevens van de planner.
    const trimmed = trimFinalWalk(ride({ distance: 916, duration: 1080 }), FAST);

    const last = trimmed.legs?.at(-1);
    expect(Math.round((last?.duration ?? 0) / 60)).toBe(12);
    expect(last?.endTime).toBe("2026-09-10T06:23:00.000Z");
    expect(trimmed.endTime).toBe("2026-09-10T06:23:00.000Z");
    expect(trimmed.duration).toBe(4620 - (1080 - 720));
  });

  it("schuift de tijd uit de dienstregeling net zo ver op", () => {
    const trimmed = trimFinalWalk(ride({ distance: 916, duration: 1080 }), FAST);
    expect(trimmed.legs?.at(-1)?.scheduledEndTime).toBe("2026-09-10T06:23:00.000Z");
  });

  it("laat een gewoon loopstuk met rust", () => {
    // 709 meter in 9 minuten is 4,7 km/h: precies wat je zou verwachten.
    const original = ride({ distance: 709, duration: 540 });
    expect(trimFinalWalk(original, FAST)).toBe(original);
  });

  it("laat een klein beetje trager dan je tempo met rust", () => {
    // Een oversteek of een stoplicht mag een loopstuk best langer maken.
    const original = ride({ distance: 700, duration: 650 });
    expect(trimFinalWalk(original, FAST)).toBe(original);
  });

  it("blijft van de reis af als het laatste stuk geen lopen is", () => {
    const original = ride({ distance: 916, duration: 1080, mode: "BUS" });
    expect(trimFinalWalk(original, FAST)).toBe(original);
  });

  it("blijft van de reis af zonder bekende afstand", () => {
    const original = ride({ duration: 1080 });
    expect(trimFinalWalk(original, FAST)).toBe(original);
  });

  it("maakt een reis nooit langer", () => {
    // Loop je rustig (3 km/h), dan is de planner niet te traag maar te snel;
    // dan blijft zijn tijd staan.
    const original = ride({ distance: 916, duration: 1080 });
    expect(trimFinalWalk(original, 0.9)).toBe(original);
  });

  it("laat een reis zonder deelritten met rust", () => {
    const original: FinalWalkItinerary = { duration: 600, legs: [] };
    expect(trimFinalWalk(original, FAST)).toBe(original);
  });
});
