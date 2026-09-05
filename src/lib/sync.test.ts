import { describe, expect, it } from "vitest";
import { mergePayload, type SyncPayload } from "./sync";
import type { Activity, Settings } from "./types";

/**
 * Deze samenvoeging is de reden dat inloggen op een tweede apparaat geen
 * gegevens meer wist. Daarom staat hij hier vastgelegd.
 */

function act(id: string, title: string, updatedAt: string): Activity {
  return {
    id,
    category: "school",
    title,
    date: "2026-09-07",
    startTime: "09:00",
    endTime: "17:00",
    location: null,
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
    updatedAt,
  } as Activity;
}

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    home: null,
    savedPlaces: [],
    categoryPlaces: {},
    customCategories: [],
    bufferMinutes: 10,
    travelMode: "car",
    ...patch,
  };
}

function payload(patch: Partial<SyncPayload> = {}): SyncPayload {
  return { settings: null, activities: [], tasks: [], exams: [], ...patch };
}

describe("mergePayload", () => {
  it("houdt activiteiten van beide kanten", () => {
    const merged = mergePayload(
      payload({ activities: [act("a", "Lokaal", "2026-09-01T00:00:00.000Z")] }),
      payload({ activities: [act("b", "Cloud", "2026-09-01T00:00:00.000Z")] }),
    );
    expect(merged.activities.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });

  it("laat bij dezelfde id de meest recente wijziging winnen", () => {
    const merged = mergePayload(
      payload({ activities: [act("a", "Oud", "2026-09-01T00:00:00.000Z")] }),
      payload({ activities: [act("a", "Nieuw", "2026-09-05T00:00:00.000Z")] }),
    );
    expect(merged.activities).toHaveLength(1);
    expect(merged.activities[0].title).toBe("Nieuw");
  });

  it("laat een oudere cloudversie een nieuwere lokale niet overschrijven", () => {
    const merged = mergePayload(
      payload({ activities: [act("a", "Nieuw lokaal", "2026-09-05T00:00:00.000Z")] }),
      payload({ activities: [act("a", "Oud in cloud", "2026-09-01T00:00:00.000Z")] }),
    );
    expect(merged.activities[0].title).toBe("Nieuw lokaal");
  });

  it("wist niets als het andere apparaat nog leeg is", () => {
    const local = payload({ activities: [act("a", "Lokaal", "2026-09-01T00:00:00.000Z")] });
    const merged = mergePayload(local, payload());
    expect(merged.activities).toHaveLength(1);
  });

  it("houdt een thuislocatie vast als de cloud er geen heeft", () => {
    const home = { label: "Thuis", lat: 52.37, lon: 5.21 };
    const merged = mergePayload(
      payload({ settings: settings({ home }) }),
      payload({ settings: settings({ home: null }) }),
    );
    expect(merged.settings?.home).toEqual(home);
  });

  it("voegt opgeslagen locaties van beide kanten samen", () => {
    const local = settings({
      savedPlaces: [
        {
          id: "p1",
          name: "School",
          location: { label: "School", lat: 1, lon: 1 },
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const remote = settings({
      savedPlaces: [
        {
          id: "p2",
          name: "Gym",
          location: { label: "Gym", lat: 2, lon: 2 },
          createdAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    const merged = mergePayload(payload({ settings: local }), payload({ settings: remote }));
    expect(merged.settings?.savedPlaces.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("combineert de vaste locatie per categorie", () => {
    const merged = mergePayload(
      payload({ settings: settings({ categoryPlaces: { school: "p1" } }) }),
      payload({ settings: settings({ categoryPlaces: { gym: "p2" } }) }),
    );
    expect(merged.settings?.categoryPlaces).toEqual({ school: "p1", gym: "p2" });
  });
});
