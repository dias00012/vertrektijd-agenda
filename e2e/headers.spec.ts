import { expect, test } from "@playwright/test";

/**
 * Beveiligingsheaders.
 *
 * Er stond er geen een, en dat is voor een app die je weekrooster, je adres en
 * je deadlines bewaart het eerste waar iemand naar kijkt. Deze test haalt ze
 * echt op bij de draaiende server: een header die alleen in de config staat en
 * niet op de lijn komt, is geen header.
 */

test("staan op elke pagina", async ({ request }) => {
  const antwoord = await request.get("/");
  const kop = antwoord.headers();

  expect(kop["x-frame-options"]).toBe("DENY");
  expect(kop["x-content-type-options"]).toBe("nosniff");
  expect(kop["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(kop["strict-transport-security"]).toContain("max-age=");
  expect(kop["permissions-policy"]).toContain("camera=()");
});

test("de inhoudspolitie laat geen vreemde scripts toe", async ({ request }) => {
  const csp = (await request.get("/")).headers()["content-security-policy"] ?? "";

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  // Scripts van een ander domein horen er niet in te staan.
  expect(csp).toMatch(/script-src [^;]*'self'/);
  expect(csp).not.toMatch(/script-src[^;]*https:\/\/(?!localhost)/);
});

test("gelden ook voor de andere schermen en voor de API", async ({ request }) => {
  for (const pad of ["/agenda", "/reizen", "/schoolwerk", "/instellingen", "/api/health"]) {
    const kop = (await request.get(pad)).headers();
    expect(kop["x-frame-options"], pad).toBe("DENY");
    expect(kop["content-security-policy"], pad).toBeTruthy();
  }
});

/**
 * De belangrijkste controle van allemaal: de app moet het er nog wel mee doen.
 * Een politie die te streng staat breekt precies datgene wat hij beschermt.
 */
test("breken de app niet", async ({ page }) => {
  const fouten: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") fouten.push(m.text());
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Vandaag", exact: true })).toBeVisible();
  expect(fouten.filter((f) => /Content Security Policy|Refused to/i.test(f))).toEqual([]);
});

/**
 * Klaar om geïnstalleerd en gevonden te worden.
 *
 * Het manifest en de robots staan in de code, maar wat telt is wat de server
 * echt teruggeeft -- en dat is precies wat een winkel of een zoekmachine
 * ophaalt.
 */
test("het manifest wordt geserveerd met schermafdrukken erin", async ({ request }) => {
  const antwoord = await request.get("/manifest.webmanifest");
  expect(antwoord.status()).toBe(200);

  const manifest = (await antwoord.json()) as {
    id?: string;
    screenshots?: { src: string }[];
    shortcuts?: unknown[];
  };
  expect(manifest.id).toBe("/");
  expect(manifest.screenshots?.length ?? 0).toBeGreaterThan(0);
  expect(manifest.shortcuts?.length ?? 0).toBeGreaterThan(0);

  // En de afbeeldingen zelf moeten ook echt op te halen zijn.
  for (const afbeelding of manifest.screenshots ?? []) {
    const plaatje = await request.get(afbeelding.src);
    expect(plaatje.status(), afbeelding.src).toBe(200);
  }
});

test("robots.txt houdt de API en het beheer buiten de zoekresultaten", async ({ request }) => {
  const tekst = await (await request.get("/robots.txt")).text();

  expect(tekst).toContain("Disallow: /api/");
  expect(tekst).toContain("Disallow: /beheer");
  expect(tekst).toContain("Disallow: /wachtwoord");
});

test("de privacyverklaring is er ook zonder bereik", async ({ page, context }) => {
  // Eerst online openen, zodat de service worker hem kan voorladen.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);

  await context.setOffline(true);
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { name: /Privacy/i }).first()).toBeVisible();
  await context.setOffline(false);
});
