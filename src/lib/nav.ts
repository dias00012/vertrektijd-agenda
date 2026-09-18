import type { TranslationKey } from "./i18n/dictionary";

/**
 * De schermen van de app, in de volgorde van het menu.
 *
 * Hier en niet in `AppShell`, omdat deze lijst op twee plekken moet kloppen:
 * het menu én de voorlaadlijst van de service worker (`public/sw.js`). Die
 * laatste zorgt dat een scherm ook zonder bereik opent. Stonden ze los, dan
 * kon je een tabblad toevoegen en de worker vergeten -- en dan doet dat scherm
 * het niet in de trein, zonder foutmelding, zonder dat iemand het merkt tot
 * het te laat is.
 *
 * Een service worker kan geen module importeren, dus de lijst staat daar
 * onvermijdelijk nog een keer. Wat wél kan is er een test op zetten die de
 * twee naast elkaar legt; zie `nav.test.ts`.
 */
export interface NavItem {
  href: string;
  /** Sleutel in de vertalingen. */
  key: TranslationKey;
  icon: string;
}

export const NAV: readonly NavItem[] = [
  { href: "/", key: "nav.today", icon: "\u2600\uFE0F" },
  { href: "/agenda", key: "nav.agenda", icon: "\u{1F5D3}\uFE0F" },
  { href: "/reizen", key: "nav.travel", icon: "\u{1F686}" },
  { href: "/schoolwerk", key: "nav.schoolwork", icon: "\u{1F4DA}" },
  { href: "/instellingen", key: "nav.settings", icon: "\u2699\uFE0F" },
] as const;
