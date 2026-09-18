import { describe, expect, it } from "vitest";
import { FAILED_RETRY_MS, TRAVEL_HORIZON_DAYS, travelQueue } from "./travelQueue";
import { travelPlanFor } from "./travel";
import type { Activity, GeoLocation, Settings } from "./types";

/**
 * Welke activiteiten krijgen een reistijd, en in welke volgorde?
 *
 * Hier zit een echt incident achter: een gekoppeld rooster staat er voor een
 * heel semester in, en zonder deze grenzen werden dat honderden aanvragen
 * ineens aan de gratis OV-dienst -- waarvan het grootste deel stukliep op onze
 * eigen verkeersdrempel, met lege vertrektijden als resultaat. Dat stond in een
 * hook en was dus niet na te rekenen.
 */

const THUIS: GeoLocation = { label: "Thuis", lat: 52.37, lon: 5.21 };
const SCHOOL: GeoLocation = { label: "School", lat: 52.49, lon: 6.07 };

/** Een dinsdag, 10:00 in Amsterdam. */
const NU = new Date(2026, 8, 15, 10, 0);

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    home: THUIS,
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    bufferMinutes: 10,
    travelMode: "car",
    ...patch,
  } as Settings;
}

function activiteit(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    category: "school",
    title: "College",
    date: "2026-09-16",
    startTime: "09:00",
    endTime: "17:00",
    location: SCHOOL,
    color: null,
    travelMode: null,
    bufferMinutes: null,
    recurrence: null,
    exceptions: [],
    travel: null,
    returnTravel: null,
    travelError: null,
    source: null,
    linkedTaskId: null,
    linkedExamId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  } as Activity;
}

const leeg = new Map<string, number>();
const idsIn = (activities: Activity[], nu = NU, failed = leeg) =>
  travelQueue(activities, settings(), nu, failed).items.map((item) => item.activity.id);

describe("wat er in de wachtrij komt", () => {
  it("neemt een activiteit van morgen mee", () => {
    expect(idsIn([activiteit()])).toEqual(["a1"]);
  });

  it("slaat een activiteit zonder bestemming over", () => {
    /*
     * Zonder plek valt er niets te reizen.
     *
     * Eerlijk erbij: dit is dubbel dichtgezet. `needsTravelRefresh` vraagt
     * verderop om een reisplan, en dat bestaat niet zonder bestemming -- dus
     * haal je de controle hierboven weg, dan valt deze test niet om
     * (nagelopen). Hij legt de eigenschap vast, niet die ene regel. De vroege
     * controle scheelt wel een berekening per activiteit, en bij een gekoppeld
     * rooster zijn dat er honderden.
     */
    expect(idsIn([activiteit({ location: null })])).toEqual([]);
  });

  it("doet niets zonder thuislocatie", () => {
    // Dan is er geen vertrekpunt en zou elke berekening mislukken.
    const uit = travelQueue([activiteit()], settings({ home: null }), NU, leeg);
    expect(uit.items).toEqual([]);
  });

  it("slaat een dag over die al voorbij is", () => {
    expect(idsIn([activiteit({ date: "2026-09-01" })])).toEqual([]);
  });
});

describe("de horizon van een week", () => {
  it("rekent tot en met de laatste dag binnen de horizon", () => {
    const laatste = activiteit({ id: "net", date: "2026-09-22" });
    expect(TRAVEL_HORIZON_DAYS).toBe(7);
    expect(idsIn([laatste])).toEqual(["net"]);
  });

  it("laat de dag erna met rust", () => {
    /*
     * Dit is de grens die het incident voorkomt. Kijk je wél naar zo'n dag,
     * dan haalt `useOccurrenceTravel` die rit alsnog op -- en dan gaat het om
     * één dag in plaats van om een heel semester tegelijk.
     */
    expect(idsIn([activiteit({ id: "teVer", date: "2026-09-23" })])).toEqual([]);
  });

  it("houdt een heel rooster dus binnen de perken", () => {
    // Twintig lesdagen vooruit: alleen de eerste week telt mee.
    const rooster = Array.from({ length: 20 }, (_, i) =>
      activiteit({ id: `les${i}`, date: `2026-09-${String(15 + i).padStart(2, "0")}` }),
    );
    expect(idsIn(rooster).length).toBeLessThanOrEqual(TRAVEL_HORIZON_DAYS + 1);
  });
});

describe("een rit die eerder mislukte", () => {
  const sleutel = () => travelPlanFor(activiteit(), settings(), NU)?.outboundKey ?? "";

  it("wordt de eerste minuten met rust gelaten", () => {
    // Anders ligt de dienst die net haperde meteen weer onder vuur.
    const netMislukt = new Map([[sleutel(), NU.getTime() - 60_000]]);
    expect(idsIn([activiteit()], NU, netMislukt)).toEqual([]);
  });

  it("krijgt na de wachttijd een nieuwe kans", () => {
    const langGeleden = new Map([[sleutel(), NU.getTime() - FAILED_RETRY_MS - 1]]);
    expect(idsIn([activiteit()], NU, langGeleden)).toEqual(["a1"]);
  });

  it("meldt welke sleutels van de mislukt-lijst af mogen", () => {
    /*
     * Teruggeven in plaats van hier weghalen. Een functie die stilletjes iets
     * van buiten aanpast is precies wat deze code onnavolgbaar maakte -- en
     * wat maakte dat er geen test op zat.
     */
    const langGeleden = new Map([[sleutel(), NU.getTime() - FAILED_RETRY_MS - 1]]);
    const uit = travelQueue([activiteit()], settings(), NU, langGeleden);
    expect(uit.expired).toEqual([sleutel()]);
    // En de invoer is niet aangeraakt.
    expect(langGeleden.size).toBe(1);
  });
});

describe("de volgorde", () => {
  it("zet de dichtstbijzijnde dag vooraan", () => {
    /*
     * Loopt het toch tegen een grens aan, dan sneuvelt de verste dag en niet
     * die van morgenochtend -- en dat is de enige waar je vanavond nog naar
     * kijkt.
     */
    const ver = activiteit({ id: "ver", date: "2026-09-21" });
    const dichtbij = activiteit({ id: "dichtbij", date: "2026-09-16" });
    expect(idsIn([ver, dichtbij])).toEqual(["dichtbij", "ver"]);
  });
});
