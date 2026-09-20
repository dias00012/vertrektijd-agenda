import { expect, test } from "@playwright/test";
import { zaai } from "./agenda";

test.beforeEach(async ({ page }) => {
  await zaai(page);
});

test("achterstallig werk valt op en is met één tik te vinden", async ({ page }) => {
  await page.goto("/schoolwerk");

  const melding = page.getByRole("button", { name: /over tijd/i }).first();
  await expect(melding).toBeVisible();

  await melding.click();
  // Alleen wat over tijd is blijft staan.
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText("Excel week 1");
});

test("een stap afvinken zet de opdracht op bezig", async ({ page }) => {
  await page.goto("/schoolwerk");

  const kaart = page.locator("article").filter({ hasText: "Hoofdstuk 4" });
  await expect(kaart).toContainText("1/2");

  await kaart.getByRole("checkbox", { name: /Opgaven maken/ }).check();

  await expect(kaart).toContainText("2/2");
  // Alle stappen af: de opdracht gaat vanzelf naar "klaar".
  await expect(kaart.getByRole("button", { name: "Klaar", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("het filter onthoudt je keuze na een herlading", async ({ page }) => {
  await page.goto("/schoolwerk");
  await page.getByRole("button", { name: /^Te doen/ }).first().click();
  await expect(page.getByRole("button", { name: /^Te doen/ }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.getByRole("button", { name: /^Te doen/ }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("de prioriteit is voor te lezen, niet alleen een bolletje", async ({ page }) => {
  /*
   * De prioriteit stond alleen in een gekleurd bolletje, met de uitleg in een
   * `title`. Op een telefoon zie je een tooltip nooit, en `aria-hidden` hield
   * hem ook bij een schermlezer weg -- terwijl "hoog" of "later" juist bepaalt
   * waar je aan begint. De informatie was er dus voor niemand behalve wie met
   * een muis stil bleef hangen.
   */
  await page.goto("/schoolwerk");

  const kaart = page.locator("article").filter({ hasText: "Hoofdstuk 4" });
  // Onzichtbaar op het scherm, maar wel in de toegankelijkheidsboom.
  await expect(kaart.getByText(/Prioriteit:/)).toBeAttached();
});

/**
 * De melding "je hebt iets over tijd".
 *
 * Twee dingen gingen mis en horen allebei bewaakt te worden. Hij lag twaalf
 * pixels over de filterknoppen heen -- een negatieve marge die in Tailwind 3
 * van een marge afhaalde, maar in Tailwind 4 de hele marge vervángt. En je kon
 * hem niet wegklikken: had je gezien dat je iets te laat was, dan bleef hij
 * staan tot je het afmaakte.
 */
test.describe("de melding over tijd", () => {
  test("ligt niet over de filterknoppen heen", async ({ page }) => {
    await page.goto("/schoolwerk");

    const melding = page.getByRole("status");
    const filters = page.getByRole("group", { name: "Waar wil je naar kijken?" });
    await expect(melding).toBeVisible();

    const boven = await melding.boundingBox();
    const onder = await filters.boundingBox();
    if (!boven || !onder) throw new Error("Geen afmetingen gevonden");

    // Niet alleen "niet overlappen": er hoort ook ruimte tussen te zitten.
    expect(onder.y).toBeGreaterThan(boven.y + boven.height);
  });

  test("is weg te klikken en blijft weg na herladen", async ({ page }) => {
    await page.goto("/schoolwerk");

    const melding = page.getByRole("status");
    await expect(melding).toBeVisible();

    await page.getByRole("button", { name: "Melding sluiten" }).click();
    await expect(melding).toHaveCount(0);

    // De filters staan er nog gewoon; alleen de melding is weg.
    await expect(page.getByRole("button", { name: "Over tijd (1)" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Over tijd (1)" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  /** De sluitknop moet met een duim te raken zijn, net als de rest. */
  test("heeft een sluitknop die groot genoeg is", async ({ page }) => {
    await page.goto("/schoolwerk");

    const doos = await page.getByRole("button", { name: "Melding sluiten" }).boundingBox();
    if (!doos) throw new Error("Geen afmetingen gevonden");

    expect(doos.width).toBeGreaterThanOrEqual(44);
    expect(doos.height).toBeGreaterThanOrEqual(44);
  });
});

/**
 * De tellingen op de filterknoppen.
 *
 * Ze werden met tien losse rondes door de lijst berekend en zijn samengevoegd
 * tot één ronde. Dat is een herschrijving van rekenwerk dat je op het scherm
 * ziet staan, dus hoort er vast te liggen wat eruit hoort te komen -- en ook
 * dat een filter de tellingen van het ándere filter beïnvloedt, want dat is
 * precies de subtiliteit die bij zo'n samenvoeging sneuvelt.
 */
test.describe("de tellingen op de filters", () => {
  test("tellen alles zolang er niets gefilterd is", async ({ page }) => {
    await page.goto("/schoolwerk");

    await expect(page.getByRole("button", { name: "Alles (2)" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Over tijd (1)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Te doen (2)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bezig (0)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Klaar (0)" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hoog \(2\)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Middel \(0\)/ })).toBeVisible();
  });

  test("rekenen het andere filter mee", async ({ page }) => {
    await page.goto("/schoolwerk");

    // Op "over tijd": dan hoort de prioriteitsrij alleen dat ene ding te tellen.
    await page.getByRole("button", { name: "Over tijd (1)" }).click();

    await expect(page.getByRole("button", { name: /Hoog \(1\)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Middel \(0\)/ })).toBeVisible();
  });

  test("tellen iets dat over tijd is ook als te doen", async ({ page }) => {
    await page.goto("/schoolwerk");

    // De achterstallige opdracht staat op "te doen", dus telt hij in allebei.
    await expect(page.getByRole("button", { name: "Over tijd (1)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Te doen (2)" })).toBeVisible();
  });
});
