import { timingSafeEqual } from "node:crypto";

/**
 * Twee geheimen vergelijken zonder te verklappen hoeveel tekens er klopten.
 *
 * Bewust zonder `server-only`, zodat de keuze los te testen is — net als bij
 * `clientKey`. Dit is precies het soort code waar een fout niet opvalt totdat
 * iemand hem misbruikt.
 *
 * `===` stopt bij het eerste teken dat afwijkt. Wie duizenden keren mag raden
 * en de tijd meet, leest daar teken voor teken het geheim uit. Bij een hash die
 * uit onze eigen database komt valt er niets te meten, maar bij een geheim dat
 * de aanvaller zelf meestuurt — zoals dat van de klok in `/api/push/send` —
 * wél. Eén functie voor allebei, zodat de volgende die zoiets vergelijkt niet
 * hoeft na te denken over welk geval dit is.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // De lengte lekt sowieso; hem hier vergelijken voorkomt dat
  // `timingSafeEqual` een uitzondering gooit op buffers van ongelijke maat.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
