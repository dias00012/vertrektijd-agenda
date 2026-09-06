import { describe, expect, it } from "vitest";
import { findNextActivity } from "./agenda";
import type { Activity, Settings } from "./types";

function act(p: Partial<Activity>): Activity {
  return {
    id: p.id ?? "x",
    category: "school",
    title: p.title ?? "t",
    date: p.date ?? "2026-10-19",
    endDate: p.endDate ?? null,
    allDay: p.allDay ?? false,
    startTime: p.startTime ?? "09:00",
    endTime: p.endTime ?? "10:00",
    location: p.location ?? null,
    color: null,
    travelMode: null,
    recurrence: null,
    exceptions: [],
    travel: null,
    returnTravel: null,
    onwardTravel: null,
    travelError: null,
    bufferMinutes: null,
    source: null,
    createdAt: "",
    updatedAt: "",
  } as unknown as Activity;
}

const settings = { home: null } as unknown as Settings;

describe("probe", () => {
  it("allDay meerdaags verdringt", () => {
    const vakantie = act({ id: "v", title: "Herfstvakantie", date: "2026-10-19", endDate: "2026-10-23", allDay: true, startTime: "00:00", endTime: "23:59" });
    const bijbaan = act({ id: "b", title: "Bijbaan", date: "2026-10-20", startTime: "17:00", endTime: "21:00", location: { lat: 52, lon: 5, label: "Werk" } as never });
    const now = new Date(2026, 9, 20, 12, 0);
    const next = findNextActivity([vakantie, bijbaan], settings, now);
    console.log("NEXT =", next?.title, next?.startTime, next?.date, "allDay", next?.allDay);
    expect(next?.title).toBe("Herfstvakantie");
  });

  it("form-achtige allDay met korte tijden", () => {
    const studiedag = act({ id: "s", title: "Studiedag", date: "2026-10-20", allDay: true, startTime: "12:15", endTime: "13:15" });
    const bijbaan = act({ id: "b", title: "Bijbaan", date: "2026-10-20", startTime: "17:00", endTime: "21:00" });
    const now = new Date(2026, 9, 20, 12, 0);
    const next = findNextActivity([studiedag, bijbaan], settings, now);
    console.log("NEXT2 =", next?.title);
  });
});
