/**
 * Wie stuurt deze aanvraag? Bepaalt onder welke emmer de verkeersdrempel telt.
 *
 * Bewust zonder `server-only`, zodat de keuze los te testen is: dit is precies
 * het soort code waar een fout niet opvalt totdat iemand hem misbruikt.
 */

/**
 * Kopregels die het platform zelf zet en die een bezoeker dus niet kan
 * vervalsen. Vercel overschrijft deze bij binnenkomst.
 */
const TRUSTED_HEADERS = ["x-vercel-forwarded-for", "x-real-ip"];

export function clientKey(request: Request): string {
  for (const header of TRUSTED_HEADERS) {
    const value = request.headers.get(header)?.trim();
    if (value) return value;
  }

  // `x-forwarded-for` is een ketting: elke tussenstap plakt er het adres
  // achter waar híj het verzoek vandaan kreeg. De eerste waarde komt dus van
  // de bezoeker zelf en is vrij in te vullen — wie bij elke aanvraag een ander
  // adres verzon, kreeg elke keer een verse emmer en liep zo om de drempel
  // heen. De laatste waarde is die van onze eigen tussenstap.
  const chain = request.headers.get("x-forwarded-for");
  const last = chain
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();

  // Zonder bron vallen alle anonieme aanvragen samen op één emmer — streng,
  // maar dat is precies wat je wilt als je niet weet wie er aanklopt.
  return last || "onbekend";
}
