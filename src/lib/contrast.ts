/**
 * Leesbaarheid van een kleur op een achtergrond, volgens WCAG 2.1.
 *
 * Dit staat hier niet om ergens in de app te draaien — de app rekent geen
 * contrast uit, die gebruikt gewoon de kleuren die in `globals.css` en
 * `theme.ts` staan. Het staat hier zodat `contrast.test.ts` die twee bestanden
 * kan uitlezen en kan nareken of elke kleur het haalt.
 *
 * De aanleiding: het groen van "Op tijd · live" stond als vaste kleurcode in de
 * componenten, met maar één tint. Op een donkere achtergrond was dat mooi
 * (7,6:1), op een lichte kwam het uit op 2,28:1 — de helft van wat nodig is,
 * op precies de regel waar je op een perron naar staat te turen.
 */

/** De eis voor gewone tekst. Grotere koppen mogen op 3:1, die hebben we niet. */
export const AA_NORMAL = 4.5;

/**
 * Een kleurcode naar de drie kanalen, elk 0–1.
 *
 * Bewust streng: bij een onbekende notatie een fout in plaats van zwart. Een
 * typefout in een kleur moet de test laten omvallen, niet stilletjes slagen
 * omdat zwart overal ruim voldoende contrast heeft.
 */
export function parseHex(hex: string): [number, number, number] {
  const cleaned = hex.trim().replace(/^#/, "");
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Geen bruikbare kleurcode: ${hex}`);
  }
  const channels = full.match(/../g) as string[];
  return channels.map((c) => parseInt(c, 16) / 255) as [number, number, number];
}

/** Hoeveel licht een kleur geeft, met de ooggevoeligheid per kanaal erin. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * De verhouding tussen twee kleuren, van 1:1 (gelijk) tot 21:1 (zwart op wit).
 * De volgorde maakt niet uit: welke van de twee de tekst is, verandert niets.
 */
export function contrastRatio(a: string, b: string): number {
  const [lichter, donkerder] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lichter + 0.05) / (donkerder + 0.05);
}

/**
 * Wat de browser van `color-mix(in srgb, X p%, Y)` maakt.
 *
 * Nodig voor de achtergrond die met je thema meekleurt: die is geen vaste
 * kleur maar een menging, en tekst staat er wel degelijk op.
 */
export function mixSrgb(a: string, percent: number, b: string): string {
  const deel = percent / 100;
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const kanaal = (x: number, y: number) =>
    Math.round((x * deel + y * (1 - deel)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${kanaal(ar, br)}${kanaal(ag, bg)}${kanaal(ab, bb)}`;
}
