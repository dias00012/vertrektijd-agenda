import { describe, it } from "vitest";
import { travelPlanForDate, needsTravelRefresh } from "@/lib/travel";

const activity: any = {
  id: "a", title: "college", date: "2026-09-07", startTime: "09:00", endTime: "11:00",
  location: { lat: 52.49, lon: 6.07, label: "school" },
};
const base: any = {
  home: { lat: 52.37, lon: 5.21, label: "thuis" },
  travelMode: "transit", bufferMinutes: 10,
};

describe("marge in sleutel", () => {
  it("verschilt", () => {
    const p10 = travelPlanForDate(activity, base, "2026-09-07")!;
    const p45 = travelPlanForDate(activity, { ...base, bufferMinutes: 45 }, "2026-09-07")!;
    console.log("k10", p10.outboundKey, p10.arriveBy);
    console.log("k45", p45.outboundKey, p45.arriveBy);
    console.log("gelijk?", p10.outboundKey === p45.outboundKey);
    const withTravel = { ...activity, travel: { key: p10.outboundKey, durationMinutes: 58, plannedDeparture: "2026-09-07T05:52:00.000Z" }, returnTravel: { key: p10.returnKey, durationMinutes: 58 } };
    console.log("refresh na marge-wijziging?", needsTravelRefresh(withTravel, { ...base, bufferMinutes: 45 }, new Date("2026-09-06T10:00:00Z")));
  });
});
