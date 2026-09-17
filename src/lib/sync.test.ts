import { describe, expect, it } from "vitest";
import { mergePayload, signature, type SyncPayload } from "./sync";
import { feedActivityId } from "./ical";
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

describe("mergePayload met grafstenen", () => {
  const NU = "2026-09-07T12:00:00.000Z";

  function payload(patch: Partial<SyncPayload> = {}): SyncPayload {
    return { settings: null, activities: [], tasks: [], exams: [], ...patch };
  }

  it("laat iets dat je weggooide niet terugkomen van het andere apparaat", () => {
    const weg = act("a1", "College", "2026-09-01T10:00:00.000Z");

    const merged = mergePayload(
      payload({ deletions: [{ id: "a1", at: "2026-09-02T10:00:00.000Z" }] }),
      payload({ activities: [weg] }),
      NU,
    );

    expect(merged.activities).toHaveLength(0);
  });

  it("brengt iets wel terug als het na het weggooien nog is aangepast", () => {
    // Op het andere apparaat heb je hem daarna nog verzet. Die wijziging is
    // jonger dan het weggooien, dus die wint: liever iets terug dan iets kwijt.
    const aangepast = act("a1", "College (verzet)", "2026-09-03T10:00:00.000Z");

    const merged = mergePayload(
      payload({ deletions: [{ id: "a1", at: "2026-09-02T10:00:00.000Z" }] }),
      payload({ activities: [aangepast] }),
      NU,
    );

    expect(merged.activities).toHaveLength(1);
    expect(merged.activities[0]?.title).toBe("College (verzet)");
  });

  it("werkt ook andersom: het andere apparaat gooide weg", () => {
    const merged = mergePayload(
      payload({ activities: [act("a1", "College", "2026-09-01T10:00:00.000Z")] }),
      payload({ deletions: [{ id: "a1", at: "2026-09-02T10:00:00.000Z" }] }),
      NU,
    );

    expect(merged.activities).toHaveLength(0);
  });

  it("houdt de grafstenen van beide kanten bij elkaar", () => {
    const merged = mergePayload(
      payload({ deletions: [{ id: "a1", at: "2026-09-02T10:00:00.000Z" }] }),
      payload({ deletions: [{ id: "a2", at: "2026-09-03T10:00:00.000Z" }] }),
      NU,
    );

    expect(merged.deletions?.map((d) => d.id).sort()).toEqual(["a1", "a2"]);
  });

  it("ruimt grafstenen op die ouder zijn dan een half jaar", () => {
    const merged = mergePayload(
      payload({ deletions: [{ id: "oud", at: "2025-01-01T00:00:00.000Z" }] }),
      payload({ deletions: [{ id: "vers", at: "2026-09-01T00:00:00.000Z" }] }),
      NU,
    );

    expect(merged.deletions?.map((d) => d.id)).toEqual(["vers"]);
  });

  it("raakt niets kwijt zonder grafstenen", () => {
    const merged = mergePayload(
      payload({ activities: [act("a1", "College", "2026-09-01T10:00:00.000Z")] }),
      payload({ activities: [act("a2", "Sport", "2026-09-01T10:00:00.000Z")] }),
      NU,
    );

    expect(merged.activities).toHaveLength(2);
  });

  it("negeert rommel in de grafstenenlijst", () => {
    const merged = mergePayload(
      payload({
        activities: [act("a1", "College", "2026-09-01T10:00:00.000Z")],
        deletions: [{ id: "", at: "x" }, null as never, { id: "a1" } as never],
      }),
      payload(),
      NU,
    );

    expect(merged.activities).toHaveLength(1);
  });
});

describe("mergeSettings", () => {
  const NU = "2026-09-07T12:00:00.000Z";

  function set(patch: Partial<Settings> = {}): Settings {
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

  function payload(settings: Settings | null): SyncPayload {
    return { settings, activities: [], tasks: [], exams: [] };
  }

  it("houdt de instelling die je het laatst aanpaste", () => {
    // Offline de marge op 30 gezet; de cloud staat nog op 10 van gisteren.
    const merged = mergePayload(
      payload(set({ bufferMinutes: 30, updatedAt: "2026-09-07T11:00:00.000Z" })),
      payload(set({ bufferMinutes: 10, updatedAt: "2026-09-06T09:00:00.000Z" })),
      NU,
    );

    expect(merged.settings?.bufferMinutes).toBe(30);
  });

  it("laat de cloud winnen als die recenter is", () => {
    const merged = mergePayload(
      payload(set({ bufferMinutes: 30, updatedAt: "2026-09-06T09:00:00.000Z" })),
      payload(set({ bufferMinutes: 10, updatedAt: "2026-09-07T11:00:00.000Z" })),
      NU,
    );

    expect(merged.settings?.bufferMinutes).toBe(10);
  });

  it("raakt bewaarde locaties van geen van beide kanten kwijt", () => {
    const merged = mergePayload(
      payload(
        set({
          updatedAt: "2026-09-07T11:00:00.000Z",
          savedPlaces: [
            {
              id: "p1",
              name: "Thuis",
              location: { label: "Thuis", lat: 1, lon: 2 },
              createdAt: "2026-09-01T00:00:00.000Z",
            },
          ],
        }),
      ),
      payload(
        set({
          updatedAt: "2026-09-06T09:00:00.000Z",
          savedPlaces: [
            {
              id: "p2",
              name: "School",
              location: { label: "School", lat: 3, lon: 4 },
              createdAt: "2026-09-01T00:00:00.000Z",
            },
          ],
        }),
      ),
      NU,
    );

    expect(merged.settings?.savedPlaces.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("houdt eigen activiteitstypes van beide kanten", () => {
    const merged = mergePayload(
      payload(
        set({
          updatedAt: "2026-09-07T11:00:00.000Z",
          customCategories: [{ id: "bijbaan", label: "Bijbaan", emoji: "\u{1F4B6}", color: "#f00" }],
        }),
      ),
      payload(
        set({
          updatedAt: "2026-09-06T09:00:00.000Z",
          customCategories: [{ id: "muziek", label: "Muziekles", emoji: "\u{1F3B8}", color: "#00f" }],
        }),
      ),
      NU,
    );

    expect(merged.settings?.customCategories.map((c) => c.id).sort()).toEqual([
      "bijbaan",
      "muziek",
    ]);
  });

  it("raakt een thuislocatie niet kwijt als de andere kant hem mist", () => {
    const thuis = { label: "Thuis", lat: 52.37, lon: 5.21 };
    const merged = mergePayload(
      payload(set({ home: thuis, updatedAt: "2026-09-06T09:00:00.000Z" })),
      payload(set({ home: null, updatedAt: "2026-09-07T11:00:00.000Z" })),
      NU,
    );

    expect(merged.settings?.home).toEqual(thuis);
  });
});

describe("rooster op twee apparaten", () => {
  // Hetzelfde lesrooster, op de telefoon en op de laptop opgehaald. Beide
  // apparaten vervangen bij het verversen hun eigen reeks; het samenvoegen
  // hoort daar één rooster van te maken, niet twee.
  const les = (uid: string, updatedAt: string) => {
    const item = act(feedActivityId("rooster", uid), "Bedrijfseconomie", updatedAt);
    return { ...item, source: "rooster" } as Activity;
  };

  const leeg: SyncPayload = { settings: null, activities: [], tasks: [], exams: [], deletions: [] };

  it("laat het rooster niet dubbel staan", () => {
    const telefoon: SyncPayload = {
      ...leeg,
      activities: [les("les-1", "2026-09-15T06:00:00.000Z"), les("les-2", "2026-09-15T06:00:00.000Z")],
    };
    const laptop: SyncPayload = {
      ...leeg,
      activities: [les("les-1", "2026-09-15T07:00:00.000Z"), les("les-2", "2026-09-15T07:00:00.000Z")],
    };

    const samen = mergePayload(telefoon, laptop, "2026-09-15T08:00:00.000Z");
    expect(samen.activities).toHaveLength(2);
    // De laptop ververste het laatst, dus die versie telt.
    expect(samen.activities.every((item) => item.updatedAt === "2026-09-15T07:00:00.000Z")).toBe(true);
  });

  it("haalt weg wat op het andere apparaat is losgekoppeld", () => {
    // Koppel je een agenda los, dan legt dat apparaat een grafsteen neer. Zonder
    // dat spoor zette het samenvoegen alles gewoon terug.
    const telefoon: SyncPayload = {
      ...leeg,
      activities: [les("les-1", "2026-09-15T06:00:00.000Z")],
    };
    const laptop: SyncPayload = {
      ...leeg,
      deletions: [{ id: feedActivityId("rooster", "les-1"), at: "2026-09-15T07:00:00.000Z" }],
    };

    expect(mergePayload(telefoon, laptop, "2026-09-15T08:00:00.000Z").activities).toHaveLength(0);
  });
});

describe("twee apparaten op één account", () => {
  const leeg: SyncPayload = { settings: null, activities: [], tasks: [], exams: [], deletions: [] };

  it("laat een apparaat dat achterloopt niets wissen", () => {
    // De situatie die twee verschillende agenda's opleverde: je telefoon stond
    // een dag open met oude data, je laptop had er ondertussen iets bij gezet.
    // Schreef die telefoon botweg zijn eigen agenda weg, dan was het werk van
    // de laptop foetsie. Samenvoegen vóór het wegschrijven houdt allebei.
    const telefoon: SyncPayload = { ...leeg, activities: [act("oud", "Werken", "2026-09-15T08:00:00.000Z")] };
    const cloud: SyncPayload = {
      ...leeg,
      activities: [
        act("oud", "Werken", "2026-09-15T08:00:00.000Z"),
        act("nieuw", "Leerblok van de laptop", "2026-09-16T20:00:00.000Z"),
      ],
    };

    const samen = mergePayload(telefoon, cloud, "2026-09-16T21:00:00.000Z");
    expect(samen.activities.map((item) => item.id).sort()).toEqual(["nieuw", "oud"]);
  });

  it("ziet aan de vingerafdruk of er iets bij kwam", () => {
    const local: SyncPayload = { ...leeg, activities: [act("a", "Werken", "2026-09-15T08:00:00.000Z")] };
    const zelfde: SyncPayload = { ...leeg, activities: [act("a", "Werken", "2026-09-15T08:00:00.000Z")] };
    const anders: SyncPayload = {
      ...leeg,
      activities: [act("a", "Werken", "2026-09-15T08:00:00.000Z"), act("b", "Leren", "2026-09-16T08:00:00.000Z")],
    };

    expect(signature(local)).toBe(signature(zelfde));
    expect(signature(local)).not.toBe(signature(anders));
  });

  it("merkt ook een wijziging aan hetzelfde blok", () => {
    // Zelfde id, later gewijzigd: dat is nieuws, ook al verandert het aantal niet.
    const eerder: SyncPayload = { ...leeg, activities: [act("a", "Werken", "2026-09-15T08:00:00.000Z")] };
    const later: SyncPayload = { ...leeg, activities: [act("a", "Werken", "2026-09-16T08:00:00.000Z")] };
    expect(signature(eerder)).not.toBe(signature(later));
  });
});
