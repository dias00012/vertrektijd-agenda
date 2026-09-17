import "server-only";

/**
 * Wie het beheerdersoverzicht mag zien.
 *
 * Eén omgevingsvariabele met e-mailadressen, komma's ertussen. Bewust niet in
 * de database: dan zou een fout in een tabel of een beleidsregel genoeg zijn om
 * iemand binnen te laten. Een omgevingsvariabele verander je alleen bij je
 * hostingpartij, en dat is precies de drempel die hier hoort.
 *
 * Staat hij leeg, dan kan niemand erbij -- ook jijzelf niet. Dat is expres: een
 * beheerpagina die openstaat omdat iemand vergat hem in te stellen is erger dan
 * een beheerpagina die niemand kan openen.
 */

/**
 * Mag dit adres erbij?
 *
 * Hoofdletterongevoelig, want e-mailadressen zijn dat in de praktijk ook, en
 * anders sluit je jezelf buiten omdat je je adres met een hoofdletter hebt
 * geregistreerd. Spaties rond de komma's worden weggehaald zodat een nette
 * lijst ("jij@x.nl, hulp@x.nl") gewoon werkt.
 */
export function emailAllowed(email: string | null | undefined, list: string | undefined): boolean {
  const allowed = (list ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;

  const mine = (email ?? "").trim().toLowerCase();
  if (!mine) return false;
  return allowed.includes(mine);
}

/** Hetzelfde, maar tegen de ingestelde lijst. */
export function isAdmin(email: string | null | undefined): boolean {
  return emailAllowed(email, process.env.ADMIN_EMAILS);
}
