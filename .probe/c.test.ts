import { describe, it } from "vitest";
import { computeDeparture, departureDateTime } from "@/lib/travel";
import { buildTimeline } from "@/lib/agenda";
import type { Activity, ActivityOccurrence, Settings, TravelInfo } from "@/lib/types";

const HOME = { label: "Thuis", lat: 52.37, lon: 5.21 };
const STAGE = { label: "Stageadres", lat: 52.9, lon: 6.6 };
const settings: Settings = { home: HOME, savedPlaces: [], categoryPlaces: {},
  customCategories: [], bufferMinutes: 10, travelMode: "transit" };

function t(patch: Partial<TravelInfo> = {}): TravelInfo {
  return { durationMinutes: 62, distanceKm: 40, mode: "transit", provider: "motis",
    computedAt: "2026-09-01T06:00:00.000Z", key: "k", ...patch };
}

// Zondagochtend, eerste bus rijdt pas om 09:32; de activiteit begint om 09:00.
const base: Activity = {
  id: "a", category: "werk", title: "Bijbaan", date: "2026-09-13",
  startTime: "09:00", endTime: "14:00", location: STAGE, color: null,
  travelMode: "transit", bufferMinutes: null, recurrence: null, exceptions: [],
  travel: t({ plannedDeparture: new Date(2026, 8, 13, 9, 32).toISOString(),
              plannedArrival: new Date(2026, 8, 13, 10, 34).toISOString() }),
  returnTravel: t(), travelError: null, source: null, createdAt: "", updatedAt: "",
};

describe("C", () => {
  it("rit die later vertrekt dan de start", () => {
    const occ = { ...base, occurrenceId: "a:2026-09-13", recurring: false, span: null,
      travelRole: { outbound: true, inbound: true, onward: null, arrivesFrom: null } } as ActivityOccurrence;
    const dep = computeDeparture(occ, settings)!;
    console.log("time:", dep.time, "minutes:", dep.minutes, "previousDay:", dep.previousDay);
    console.log("departureDateTime:", departureDateTime(occ, settings)?.toString());
    console.log(buildTimeline([base], settings, "2026-09-13").map((e) => `${e.time} ${e.kind}`));
  });
});
