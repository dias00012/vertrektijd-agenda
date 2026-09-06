import { describe, expect, it } from "vitest";
import {
  computeDeparture,
  departureDateTime,
  needsTravelRefresh,
  travelPlanForDate,
  travelPlanFor,
  nextOccurrenceDate,
} from "@/lib/travel";
import type { Activity, ActivityOccurrence, Settings, TravelInfo } from "@/lib/types";

const HOME = { label: "Thuis", lat: 52.37, lon: 5.21 };
const SCHOOL = { label: "School", lat: 52.49, lon: 6.07 };

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    home: HOME, savedPlaces: [], categoryPlaces: {}, customCategories: [],
    bufferMinutes: 10, travelMode: "transit", ...patch,
  };
}
function travel(patch: Partial<TravelInfo> = {}): TravelInfo {
  return { durationMinutes: 25, distanceKm: 12, mode: "transit", provider: "motis",
    computedAt: "2026-09-07T06:00:00.000Z", key: "k", ...patch };
}
function activity(patch: Partial<ActivityOccurrence> = {}): ActivityOccurrence {
  return {
    id: "a1", category: "school", title: "College", date: "2026-09-07",
    startTime: "09:00", endTime: "17:00", location: SCHOOL, color: null,
    travelMode: null, bufferMinutes: null, recurrence: null, exceptions: [],
    travel: null, returnTravel: null, travelError: null, source: null,
    linkedTaskId: null, linkedExamId: null,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    occurrenceId: "a1:2026-09-07", recurring: false,
    travelRole: { outbound: true, inbound: true, onward: null, arrivesFrom: null },
    ...patch,
  } as ActivityOccurrence;
}

describe("A: marge zit niet in de sleutel", () => {
  it("zelfde sleutel bij andere marge", () => {
    const item = activity({ travelMode: "transit" });
    const a = travelPlanForDate(item, settings({ bufferMinutes: 10 }), "2026-09-07");
    const b = travelPlanForDate(item, settings({ bufferMinutes: 45 }), "2026-09-07");
    console.log("arriveBy 10:", a?.arriveBy, "45:", b?.arriveBy);
    console.log("key 10:", a?.outboundKey);
    console.log("key 45:", b?.outboundKey);
    expect(a?.outboundKey).toBe(b?.outboundKey);
  });

  it("needsTravelRefresh blijft false na verhogen marge", () => {
    const plan = travelPlanFor(
      { ...activity({ travelMode: "transit" }) } as Activity,
      settings({ bufferMinutes: 10 }),
      new Date(2026, 8, 1),
    )!;
    const stored = {
      ...activity({ travelMode: "transit" }),
      travel: travel({ key: plan.outboundKey, plannedDeparture: new Date(2026,8,7,7,52).toISOString() }),
      returnTravel: travel({ key: plan.returnKey }),
    } as Activity;
    const needs = needsTravelRefresh(stored, settings({ bufferMinutes: 45 }), new Date(2026, 8, 1));
    console.log("needsTravelRefresh na marge 10 -> 45:", needs);
    expect(needs).toBe(false);
  });
});

describe("B: departureDateTime bij vertrek de dag ervoor (OV)", () => {
  it("zit er een dag naast", () => {
    const item = activity({
      date: "2026-09-07", startTime: "00:30", endTime: "06:00",
      travel: travel({ durationMinutes: 55, plannedDeparture: new Date(2026, 8, 6, 23, 45).toISOString() }),
    });
    const dep = computeDeparture(item, settings())!;
    const abs = departureDateTime(item, settings())!;
    console.log("vertrek:", dep.time, "previousDay:", dep.previousDay);
    console.log("absoluut:", abs.toString());
    expect(dep.previousDay).toBe(true);
  });
  it("auto/fiets doet het wel goed", () => {
    const item = activity({
      date: "2026-09-07", startTime: "00:30", endTime: "06:00",
      travelMode: "car",
      travel: travel({ mode: "car", durationMinutes: 55 }),
    });
    const dep = computeDeparture(item, settings({ travelMode: "car" }))!;
    const abs = departureDateTime(item, settings({ travelMode: "car" }))!;
    console.log("auto vertrek:", dep.time, dep.minutes, "abs:", abs.toString());
  });
});

describe("C: rit die later vertrekt dan de start", () => {
  it("wordt als 'dag ervoor' bestempeld", () => {
    const item = activity({
      startTime: "09:00",
      travel: travel({ durationMinutes: 45, plannedDeparture: new Date(2026, 8, 7, 9, 30).toISOString() }),
    });
    const dep = computeDeparture(item, settings())!;
    console.log("vertrek:", dep.time, "previousDay:", dep.previousDay);
    expect(dep.previousDay).toBe(true);
  });
});

describe("D: meerdaagse activiteit", () => {
  it("plant altijd op de eerste dag", () => {
    const stage = {
      ...activity({ date: "2026-09-01", endDate: "2026-12-19", travelMode: "transit" }),
    } as Activity;
    const d = nextOccurrenceDate(stage, new Date(2026, 9, 15));
    console.log("nextOccurrenceDate op 15 okt:", d);
    const plan = travelPlanFor(stage, settings(), new Date(2026, 9, 15));
    console.log("arriveBy:", plan?.arriveBy);
    expect(d).toBe("2026-09-01");
  });
});
