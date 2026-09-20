import { describe, expect, it } from "vitest";
import { nominatimResult, type NominatimItem } from "./geocoding";

/**
 * Wat je te zien krijgt als je een adres intikt.
 *
 * Hier zit een gemelde fout achter. Bij een huisadres geeft Nominatim als naam
 * alleen het huisnummer, dus heette een bestemming "184, Lelystad". Dat leest
 * als een geldig adres terwijl je niet ziet welke straat je gekozen hebt -- en
 * een zwakke match kan honderden meters naast je voordeur liggen. Je merkt het
 * pas aan een looptijd die niet klopt, en dan sta je al buiten.
 *
 * Verzonnen adressen, net als in de browsertests: de coordinaten doen er niet
 * toe, het gaat om de tekst.
 */

function treffer(patch: Partial<NominatimItem> = {}): NominatimItem {
  return {
    lat: "52.5",
    lon: "5.47",
    display_name: "184, Voorbeeldweg, Centrum, Lelystad, Flevoland, Nederland",
    name: "184",
    address: {
      road: "Voorbeeldweg",
      house_number: "184",
      suburb: "Centrum",
      city: "Lelystad",
      state: "Flevoland",
    },
    ...patch,
  };
}

describe("nominatimResult", () => {
  it("zet straat en huisnummer voorop in plaats van alleen het nummer", () => {
    expect(nominatimResult(treffer()).name).toBe("Voorbeeldweg 184");
  });

  it("zet de plaats achter de naam in het label", () => {
    expect(nominatimResult(treffer()).label).toBe("Voorbeeldweg 184, Lelystad");
  });

  /**
   * Het geval waar de melding over ging: geen straat in de adresgegevens. Dan
   * moet de straat uit de volledige omschrijving komen, anders blijft er "184"
   * over.
   */
  it("vist de straat uit de omschrijving als de adresgegevens hem missen", () => {
    const zonderStraat = treffer({
      address: { house_number: "184", city: "Lelystad" },
    });

    expect(nominatimResult(zonderStraat).name).toBe("Voorbeeldweg 184");
  });

  it("laat een gewone naam met rust", () => {
    const school = treffer({
      name: "Windesheim",
      display_name: "Windesheim, Campus 2, Zwolle, Overijssel, Nederland",
      address: { road: "Campus", city: "Zwolle", state: "Overijssel" },
    });

    expect(nominatimResult(school).name).toBe("Windesheim");
    expect(nominatimResult(school).label).toBe("Windesheim, Zwolle");
  });

  it("herhaalt de plaats niet als die al in de naam staat", () => {
    const station = treffer({
      name: "Station Lelystad Centrum",
      display_name: "Station Lelystad Centrum, Lelystad, Flevoland, Nederland",
      address: { city: "Lelystad", state: "Flevoland" },
    });

    expect(nominatimResult(station).label).toBe("Station Lelystad Centrum");
  });

  it("zet in de tweede regel straat, wijk en plaats, zonder de naam te herhalen", () => {
    const uitkomst = nominatimResult(treffer());

    expect(uitkomst.context).toBe("Centrum, Lelystad, Flevoland");
    expect(uitkomst.context).not.toContain("Voorbeeldweg 184");
  });

  it("houdt de tweede regel op hoogstens drie stukken", () => {
    const uitkomst = nominatimResult(treffer());

    expect(uitkomst.context.split(", ").length).toBeLessThanOrEqual(3);
  });

  it("zegt niets dubbel in de tweede regel", () => {
    const dubbel = treffer({
      name: "Ergens",
      address: { road: "Lelystad", city: "Lelystad", state: "Flevoland" },
    });

    const stukken = nominatimResult(dubbel).context.split(", ");
    expect(new Set(stukken).size).toBe(stukken.length);
  });

  it("valt terug op het eerste stuk van de omschrijving als er verder niets is", () => {
    const kaal = treffer({
      name: undefined,
      display_name: "Ergensweg, Ergens",
      address: undefined,
    });

    expect(nominatimResult(kaal).name).toBe("Ergensweg");
  });

  it("valt terug op de hele omschrijving als er helemaal niets is", () => {
    const leeg = treffer({ name: undefined, display_name: "", address: undefined });

    expect(nominatimResult(leeg).name).toBe("");
  });

  it("maakt getallen van de coordinaten", () => {
    const uitkomst = nominatimResult(treffer({ lat: "52.5", lon: "5.47" }));

    expect(uitkomst.lat).toBe(52.5);
    expect(uitkomst.lon).toBe(5.47);
  });

  it("neemt een huisnummer met een letter ook mee", () => {
    const bis = treffer({
      name: "12a",
      display_name: "12a, Voorbeeldstraat, Almere, Flevoland, Nederland",
      address: { road: "Voorbeeldstraat", house_number: "12a", city: "Almere" },
    });

    expect(nominatimResult(bis).name).toBe("Voorbeeldstraat 12a");
  });
});
