import { describe, expect, it } from "vitest";
import { assignTravelRoles } from "./stays";
import type { ActivityOccurrence, GeoLocation, TravelInfo } from "./types";

const SCHOOL: GeoLocation = { label: "Windesheim", lat: 52.49, lon: 6.07 };
const GYM: GeoLocation = { label: "Basic-Fit", lat: 52.37, lon: 5.22 };

function travel(durationMinutes: number): TravelInfo {
  return {
    durationMinutes,
    distanceKm: 40,
    mode: "car",
    provider: "osrm",
    computedAt: "2026-09-07T06:00:00.000Z",
    key: "k",
  };
}

/** Eén lesuur; alleen wat voor het groeperen telt is instelbaar. */
function les(
  id: string,
  startTime: string,
  endTime: string,
  patch: Partial<ActivityOccurrence> = {},
): ActivityOccurrence {
  return {
    id,
    category: "school",
    title: id,
    date: "2026-09-07",
    startTime,
    endTime,
    location: SCHOOL,
    color: null,
    travelMode: null,
    bufferMinutes: null,
    recurrence: null,
    exceptions: [],
    travel: null,
    returnTravel: null,
    travelError: null,
    source: "rooster",
    linkedTaskId: null,
    linkedExamId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    occurrenceId: `${id}:2026-09-07`,
    recurring: false,
    travelRole: { outbound: true, inbound: true },
    ...patch,
  } as ActivityOccurrence;
}

/** Korte weergave van de rollen, zodat een verwachting leesbaar blijft. */
function roles(items: ActivityOccurrence[]): string[] {
  return assignTravelRoles(items).map((item) => {
    const { outbound, inbound } = item.travelRole;
    if (outbound && inbound) return "heen+terug";
    if (outbound) return "heen";
    if (inbound) return "terug";
    return "geen";
  });
}

describe("assignTravelRoles", () => {
  it("laat een losse activiteit heen en terug reizen", () => {
    expect(roles([les("a", "09:00", "17:00")])).toEqual(["heen+terug"]);
  });

  it("reist bij een schooldag één keer heen en één keer terug", () => {
    // Precies het patroon uit een gekoppeld rooster: elk lesuur apart.
    const dag = [
      les("uur1", "08:30", "09:10"),
      les("uur2", "09:10", "09:50"),
      les("uur3", "10:10", "10:50"),
      les("uur4", "11:30", "12:10"),
      les("uur5", "12:40", "13:20"),
    ];
    expect(roles(dag)).toEqual(["heen", "geen", "geen", "geen", "terug"]);
  });

  it("begint een nieuw verblijf op een andere plek", () => {
    const dag = [
      les("les", "09:00", "15:00"),
      les("gym", "18:30", "19:30", { location: GYM }),
    ];
    expect(roles(dag)).toEqual(["heen+terug", "heen+terug"]);
  });

  it("gaat bij een lang gat wel naar huis", () => {
    const dag = [les("ochtend", "09:00", "10:00"), les("avond", "19:00", "21:00")];
    expect(roles(dag)).toEqual(["heen+terug", "heen+terug"]);
  });

  it("blijft op school bij een tussenuur", () => {
    const dag = [les("ochtend", "09:00", "10:00"), les("later", "11:30", "13:00")];
    expect(roles(dag)).toEqual(["heen", "terug"]);
  });

  it("laat de reistijd bepalen of teruggaan zinnig is", () => {
    // Twee uur en een kwartier ertussen. Woon je tien minuten verderop, dan ga
    // je naar huis; kost de reis een uur, dan blijf je waar je bent.
    const dichtbij = [
      les("ochtend", "09:00", "10:00", { travel: travel(10) }),
      les("later", "12:15", "13:00"),
    ];
    expect(roles(dichtbij)).toEqual(["heen+terug", "heen+terug"]);

    const ver = [
      les("ochtend", "09:00", "10:00", { travel: travel(60) }),
      les("later", "12:15", "13:00"),
    ];
    expect(roles(ver)).toEqual(["heen", "terug"]);
  });

  it("telt een activiteit zonder plek niet mee", () => {
    // Iets zonder locatie zegt niet waar je bent, dus het knipt geen verblijf
    // doormidden en reist zelf ook niet.
    const dag = [
      les("uur1", "09:00", "10:00"),
      les("pauze", "10:00", "10:30", { location: null }),
      les("uur2", "10:30", "12:00"),
    ];
    expect(roles(dag)).toEqual(["heen", "geen", "terug"]);
  });

  it("houdt rekening met uren die over elkaar heen vallen", () => {
    // Het langste uur bepaalt tot wanneer je er bent, niet het laatste in de lijst.
    const dag = [
      les("lang", "09:00", "15:00"),
      les("kort", "09:30", "10:00"),
      les("na", "16:00", "17:00"),
    ];
    expect(roles(dag)).toEqual(["heen", "geen", "terug"]);
  });
});
