import "server-only";

/**
 * Kleine cache met een houdbaarheidsdatum. Beperkt het aantal calls naar
 * externe (rate-limited) diensten zoals Nominatim. Bewust simpel: bij een
 * herstart of meerdere instances is een misser niet erger dan een extra call.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  /** Alleen om in tests te kunnen kijken wat erin zit. */
  readonly size: number;
}

/** Hoeveel er hoogstens in past. */
export const MAX_ENTRIES = 500;

/**
 * Een eigen cache. De app gebruikt er één (hieronder), maar tests hebben er
 * een nodig die leeg begint -- anders kijken ze naar wat een vorige test
 * erin heeft laten staan.
 */
export function createCache(maxEntries = MAX_ENTRIES): Cache {
  const store = new Map<string, Entry<unknown>>();

  function opruimen(nu: number): void {
    for (const [key, entry] of store) {
      if (entry.expiresAt < nu) store.delete(key);
    }
  }

  return {
    get<T>(key: string): T | undefined {
      const entry = store.get(key) as Entry<T> | undefined;
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set<T>(key: string, value: T, ttlMs: number): void {
      const nu = Date.now();
      // Eerst weghalen, dan opnieuw zetten. Een Map onthoudt de volgorde van
      // toevoegen, en `set` op een bestaande sleutel verandert die niet. Zonder
      // dit hield een sleutel die je steeds herschrijft zijn oude plek en vloog
      // juist de drukst gebruikte er als eerste uit.
      store.delete(key);

      if (store.size >= maxEntries) {
        // Verlopen regels tellen wel mee voor de grens maar zijn niets waard.
        // Zonder deze stap kon een volle cache met alleen maar oude regels een
        // verse eruit gooien.
        opruimen(nu);
      }
      if (store.size >= maxEntries) {
        const oudste = store.keys().next().value;
        if (oudste !== undefined) store.delete(oudste);
      }

      store.set(key, { value, expiresAt: nu + ttlMs });
    },

    get size() {
      return store.size;
    },
  };
}

const gedeeld = createCache();

export function cacheGet<T>(key: string): T | undefined {
  return gedeeld.get<T>(key);
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  gedeeld.set(key, value, ttlMs);
}
