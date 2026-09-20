import { expect, test } from "@playwright/test";

/**
 * De klok die het scherm laat meelopen.
 *
 * Hij tikte door terwijl het tabblad op de achtergrond stond, en elke tik
 * rendert de pagina opnieuw. Op een telefoon in je zak is dat de hele dag door
 * werk waar niemand iets aan heeft.
 *
 * Dit is met opzet een witte-doos-test: hij telt de timers zelf. Wachten tot
 * het scherm verandert kan niet, want de zichtbare tijd verandert pas na een
 * minuut, en dan meet je vooral geduld.
 */

test("staat stil zodra het tabblad naar de achtergrond gaat", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __tellers: Set<number> };
    w.__tellers = new Set();
    const zetten = window.setInterval.bind(window);
    const weghalen = window.clearInterval.bind(window);

    // @ts-expect-error -- bewust overschrijven om te kunnen tellen.
    window.setInterval = (fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
      const id = zetten(fn, ms, ...rest);
      // Alleen de klok zelf; de app zet ook andere timers.
      if (ms === 30_000 || ms === 60_000) w.__tellers.add(id);
      return id;
    };
    // @ts-expect-error -- idem.
    window.clearInterval = (id?: number) => {
      if (id !== undefined) w.__tellers.delete(id);
      return weghalen(id);
    };

    let verborgen = false;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (verborgen ? "hidden" : "visible"),
    });
    (window as unknown as { __verberg: (v: boolean) => void }).__verberg = (v) => {
      verborgen = v;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });

  // Bewust zonder `zaai`: die zet ook de klok van Playwright vast, en die
  // vervangt `setInterval` op zijn beurt -- dan meet deze test die van
  // Playwright in plaats van die van de app.
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const lopend = () =>
    page.evaluate(() => (window as unknown as { __tellers: Set<number> }).__tellers.size);

  expect(await lopend(), "zichtbaar: de klok hoort te lopen").toBeGreaterThan(0);

  await page.evaluate(() =>
    (window as unknown as { __verberg: (v: boolean) => void }).__verberg(true),
  );
  expect(await lopend(), "verborgen: er hoort geen klok meer te lopen").toBe(0);

  await page.evaluate(() =>
    (window as unknown as { __verberg: (v: boolean) => void }).__verberg(false),
  );
  expect(await lopend(), "weer zichtbaar: de klok hoort weer te lopen").toBeGreaterThan(0);
});
