import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Het woordenboek nagerekend tegen de app die het gebruikt.
 *
 * De compiler bewaakt dat Engels dezelfde sleutels heeft als Nederlands. Wat
 * hij niet ziet, en wat je dus pas op het scherm merkt:
 *
 *  - Zegt het Nederlands `{count}` en het Engels `{number}`, dan staat er in
 *    het Engels letterlijk "{number} min vertraging".
 *  - Vergeet je bij `t("sleutel", {...})` een waarde, dan leest de gebruiker
 *    `{count}`.
 *  - En sleutels die nergens meer gebruikt worden blijven staan. Er waren er
 *    negentien, waaronder vijf voor de status van een rit die allang door
 *    `status.*` waren vervangen -- twee sets voor hetzelfde is hoe je per
 *    ongeluk de verkeerde aanpast.
 */

const bron = readFileSync(new URL("./dictionary.ts", import.meta.url), "utf8");

/** De sleutels en waarden uit één tabel in het bestand. */
function tabel(vanaf: string, tot: string): Map<string, string> {
  const start = bron.indexOf(vanaf);
  const eind = tot ? bron.indexOf(tot) : bron.length;
  if (start < 0) throw new Error(`Tabel ${vanaf} niet gevonden`);
  const deel = bron.slice(start, eind < 0 ? bron.length : eind);
  const uit = new Map<string, string>();
  // `\s*` na de dubbele punt vangt ook een waarde die op de volgende regel
  // staat, zoals bij de langere zinnen gebeurt.
  for (const m of deel.matchAll(/"([\w.]+)":\s*("(?:[^"\\]|\\.)*")\s*,/g)) {
    uit.set(m[1], m[2]);
  }
  return uit;
}

const nl = tabel("export const nl = {", "export const en");
const en = tabel("export const en", "const TABLES");

/** De namen tussen accolades, gesorteerd zodat de volgorde niet meetelt. */
function plaatshouders(waarde: string): string[] {
  return [...waarde.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const bestanden = execSync('find src e2e -name "*.ts" -o -name "*.tsx"')
  .toString()
  .trim()
  .split("\n")
  .filter((f) => !f.endsWith("i18n/dictionary.ts") && !f.endsWith("dictionary.test.ts"));

/**
 * De namen van een objectliteraal, alleen die op het bovenste niveau.
 *
 * Teken voor teken, want per regel lezen mist er drie van de vier zodra ze
 * naast elkaar staan: `{ title, start, end }` gaf alleen `title`.
 */
function namenOpBovensteNiveau(binnen: string): string[] {
  const namen: string[] = [];
  let niveau = 0;
  let i = 0;
  let wachtOpNaam = true;

  while (i < binnen.length) {
    const c = binnen[i];
    if ("{[(".includes(c)) {
      niveau += 1;
      i += 1;
      continue;
    }
    if ("}])".includes(c)) {
      niveau -= 1;
      i += 1;
      continue;
    }
    if (niveau === 0 && c === ",") {
      wachtOpNaam = true;
      i += 1;
      continue;
    }
    if (niveau === 0 && wachtOpNaam && /[A-Za-z_$]/.test(c)) {
      const rest = binnen.slice(i);
      const m = /^([A-Za-z_$][\w$]*)\s*([:,]|$)/.exec(rest);
      if (m) namen.push(m[1]);
      wachtOpNaam = false;
      i += m ? m[1].length : 1;
      continue;
    }
    i += 1;
  }
  return namen;
}

interface Aanroep {
  bestand: string;
  sleutel: string;
  /** De namen die worden meegegeven, of null als het geen letterlijk object is. */
  gegeven: string[] | null;
}

/**
 * Alle aanroepen met een letterlijke sleutel.
 *
 * Met accolades tellen in plaats van een reguliere expressie: de objecten
 * lopen vaak over meerdere regels en bevatten zelf accolades, en daar loopt
 * elke expressie op stuk.
 */
function aanroepenIn(bestand: string): Aanroep[] {
  const tekst = readFileSync(bestand, "utf8");
  const uit: Aanroep[] = [];
  const opener = /\b(?:t|word|translate)\(\s*(?:[\w.]+,\s*)?"([\w.]+)"/g;

  for (const m of tekst.matchAll(opener)) {
    const sleutel = m[1];
    let i = m.index + m[0].length;
    while (i < tekst.length && /\s/.test(tekst[i])) i += 1;

    if (tekst[i] !== ",") {
      uit.push({ bestand, sleutel, gegeven: [] });
      continue;
    }
    i += 1;
    while (i < tekst.length && /\s/.test(tekst[i])) i += 1;
    if (tekst[i] !== "{") {
      // Iets anders dan een letterlijk object; daar zeggen we niets over.
      uit.push({ bestand, sleutel, gegeven: null });
      continue;
    }

    let diepte = 0;
    const begin = i;
    for (; i < tekst.length; i += 1) {
      if (tekst[i] === "{") diepte += 1;
      else if (tekst[i] === "}") {
        diepte -= 1;
        if (diepte === 0) break;
      }
    }
    const binnen = tekst.slice(begin + 1, i);
    uit.push({ bestand, sleutel, gegeven: namenOpBovensteNiveau(binnen) });
  }
  return uit;
}

const aanroepen = bestanden.flatMap(aanroepenIn);

/**
 * Sleutels die per stuk worden opgebouwd, bijvoorbeeld `weekday.${dag}`.
 * Die vindt de scanner hierboven niet, dus staan ze hier met de hand.
 */
const OPGEBOUWD = [
  "weekday.",
  "weekdayShort.",
  "month.",
  "monthShort.",
  "category.",
  "travelMode.",
  "settings.bike.",
  "form.freq.",
  "recurrence.",
  "status.",
  // De namen van de thema's staan in `THEMES` in theme.ts, als `nameKey`.
  // Dat is een tabel en geen aanroep, dus de scanner hierboven ziet ze niet.
  "theme.",
];

describe("het woordenboek zelf", () => {
  it("leest allebei de tabellen uit", () => {
    expect(nl.size).toBeGreaterThan(500);
    expect(en.size).toBe(nl.size);
  });

  it("heeft in het Engels dezelfde sleutels als in het Nederlands", () => {
    const missend = [...nl.keys()].filter((k) => !en.has(k));
    const teveel = [...en.keys()].filter((k) => !nl.has(k));
    expect({ missend, teveel }).toEqual({ missend: [], teveel: [] });
  });

  it("gebruikt in allebei de talen dezelfde plekken tussen accolades", () => {
    const verschillen = [...nl.entries()]
      .filter(([k, v]) => {
        const e = en.get(k);
        return e !== undefined && plaatshouders(v).join(",") !== plaatshouders(e).join(",");
      })
      .map(([k, v]) => `${k}: nl heeft ${plaatshouders(v)}, en heeft ${plaatshouders(en.get(k)!)}`);

    expect(verschillen).toEqual([]);
  });
});

describe("het woordenboek tegen de app", () => {
  it("vindt de aanroepen die het moet vinden", () => {
    // Zonder dit kan de scanner stilletjes niets vinden en slagen alle
    // controles hieronder omdat er niets te controleren viel.
    expect(aanroepen.length).toBeGreaterThan(400);
  });

  it("geeft bij elke aanroep precies de waarden mee die de tekst nodig heeft", () => {
    const fout: string[] = [];
    for (const { bestand, sleutel, gegeven } of aanroepen) {
      const waarde = nl.get(sleutel);
      if (waarde === undefined || gegeven === null) continue;
      const nodig = plaatshouders(waarde);
      const missend = nodig.filter((n) => !gegeven.includes(n));
      const teveel = gegeven.filter((g) => !nodig.includes(g));
      if (missend.length > 0 || teveel.length > 0) {
        fout.push(`${bestand} ${sleutel}: mist ${missend}, geeft te veel ${teveel}`);
      }
    }
    expect(fout).toEqual([]);
  });

  /**
   * "Gebruikt" is hier ruimer dan "staat in een aanroep": een flink deel van de
   * sleutels staat in een tabel, zoals het menu in `nav.ts` en de stops van de
   * rondleiding. Die zijn net zo goed in gebruik. De vraag is of een sleutel
   * érgens nog voorkomt.
   */
  it("heeft geen sleutels die nergens meer voorkomen", () => {
    const alleBron = bestanden.map((f) => readFileSync(f, "utf8")).join("\n");
    const ongebruikt = [...nl.keys()].filter(
      (k) => !alleBron.includes(`"${k}"`) && !OPGEBOUWD.some((p) => k.startsWith(p)),
    );
    expect(ongebruikt).toEqual([]);
  });
});
