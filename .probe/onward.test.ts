import { describe, expect, it } from "vitest";
import { buildTimeline, dayRoleFor, activitiesOnDate } from "@/lib/agenda";
import { needsTravelRefresh, computeOnward, computeReturn } from "@/lib/travel";
import type { Activity, Settings, TravelInfo } from "@/lib/types";

const HOME = { label: "Thuis", lat: 52.37, lon: 5.21 };
const SCHOOL = { label: "Windesheim", lat: 52.49, lon: 6.07 };
const GYM = { label: "Basic-Fit", lat: 52.37, lon: 5.22 };

const settings: Settings = {
  home: HOME, savedPlaces: [], categoryPlaces: {}, customCategories: [],
  bufferMinutes: 10, travelMode: "car",
};

function info(durationMinutes: number, key: string): TravelInfo {
  return { durationMinutes, distanceKm: 40, mode: "car", provider: "osrm",
    computedAt: "2026-09-01T06:00:00.000Z", key };
}

// School: elke werkdag 09:00-17:00. Sportschool: alleen donderdag 18:30-19:30.
const school: Activity = {
  id: "school", category: "school", title: "College", date: "2026-09-07",
  startTime: "09:00", endTime: "17:00", location: SCHOOL, color: null,
  travelMode: "car", bufferMinutes: null,
  recurrence: { freq: "weekly", weekdays: [1, 2, 3, 4, 5], until: null },
  exceptions: [], travel: info(69, "heen"), returnTravel: info(68, "terug"),
  onwardTravel: null, travelError: null, source: null,
  createdAt: "", updatedAt: "",
};
const gym: Activity = {
  id: "gym", category: "gym", title: "Sportschool", date: "2026-09-10",
  startTime: "18:30", endTime: "19:30", location: GYM, color: null,
  travelMode: "car", bufferMinutes: null,
  recurrence: { freq: "weekly", weekdays: [4], until: null },
  exceptions: [], travel: info(30, "gheen"), returnTravel: info(30, "gterug"),
  onwardTravel: null, travelError: null, source: null,
  createdAt: "", updatedAt: "",
};

describe("doorreis school -> sportschool op een latere dag", () => {
  it("donderdag: rol zegt doorreizen", () => {
    const day = activitiesOnDate([school, gym], "2026-09-10"); // donderdag
    const s = day.find((i) => i.id === "school")!;
    console.log("donderdag rol school:", JSON.stringify(s.travelRole));
    expect(s.travelRole.onward?.label).toBe(GYM.label);
  });

  it("maandag (vandaag): useAgenda haalt geen doorreis op", () => {
    const now = new Date(2026, 8, 7); // maandag 7 sept
    const role = dayRoleFor(school, [school, gym], now);
    console.log("rol op eerstvolgende dag (maandag):", JSON.stringify(role));
    const onward = role?.onward ?? null;
    console.log("needsTravelRefresh:", needsTravelRefresh(school, settings, now, onward));
    expect(onward).toBeNull();
  });

  it("gevolg: donderdag verdwijnt zowel de thuiskomst als de doorreis", () => {
    const day = activitiesOnDate([school, gym], "2026-09-10");
    const s = day.find((i) => i.id === "school")!;
    console.log("computeReturn:", computeReturn(s, settings));
    console.log("computeOnward:", computeOnward(s, "18:30"));
    const timeline = buildTimeline([school, gym], settings, "2026-09-10");
    console.log(timeline.map((e) => `${e.time} ${e.kind} ${e.activity.title}`));
  });
});
