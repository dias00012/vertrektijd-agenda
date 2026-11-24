import { writeFileSync } from "node:fs";
import sharp from "sharp";

/**
 * Maakt de app-iconen uit één tekening.
 *
 * Draai dit opnieuw wanneer het ontwerp verandert:  node scripts/build-icons.mjs
 *
 * Waarom PNG's en niet alleen de SVG: Android en iOS zetten een SVG niet op je
 * beginscherm. Zonder deze bestanden krijg je daar een grijs vlak.
 *
 * De klok staat op 08:23. Dat is de tijd uit het idee achter de app: je hebt om
 * 09:00 school, dus je moet om 08:23 vertrekken.
 */

const BLUE = "#2563eb";
const DEEP = "#1d4ed8";

/** Uiteinde van een wijzer; hoek in graden vanaf 12 uur, met de klok mee. */
function hand(cx, cy, degrees, length) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [cx + Math.cos(rad) * length, cy + Math.sin(rad) * length];
}

/**
 * `inset` is de marge rond de klok. Maskable iconen worden rond bijgesneden,
 * dus daar moet de tekening verder van de rand blijven.
 */
function drawing({ size = 512, radius = 0.23, inset = 0.5 } = {}) {
  const c = size / 2;
  const r = size * inset * 0.5;
  const ring = size * 0.042;

  // 08:23. Het uur staat al 23 minuten opgeschoven, anders klopt de stand niet.
  const [hx, hy] = hand(c, c, 8 * 30 + 23 * 0.5, r * 0.46);
  const [mx, my] = hand(c, c, 23 * 6, r * 0.74);

  // Streepjes op 12, 3, 6 en 9: daarmee leest het meteen als een klok.
  const ticks = [0, 90, 180, 270]
    .map((deg) => {
      const [x1, y1] = hand(c, c, deg, r - ring * 1.9);
      const [x2, y2] = hand(c, c, deg, r - ring * 3.4);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLUE}"/>
      <stop offset="1" stop-color="${DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="url(#bg)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#fff" stroke-width="${ring}"/>
  <g stroke="#fff" stroke-width="${ring * 0.7}" stroke-linecap="round" opacity="0.75">${ticks}</g>
  <g stroke="#fff" stroke-linecap="round">
    <line x1="${c}" y1="${c}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke-width="${ring * 1.25}"/>
    <line x1="${c}" y1="${c}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke-width="${ring * 0.85}"/>
  </g>
  <circle cx="${c}" cy="${c}" r="${ring * 0.75}" fill="${DEEP}" stroke="#fff" stroke-width="${ring * 0.5}"/>
</svg>`;
}

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/${file}`);
  console.log(`public/${file}`);
}

// Afgeronde hoeken voor browser en Android.
const rounded = drawing({ size: 512 });
await png(rounded, 192, "icon-192.png");
await png(rounded, 512, "icon-512.png");

// Maskable: Android snijdt hem rond bij, dus vierkant met extra ruimte.
await png(drawing({ size: 512, radius: 0, inset: 0.38 }), 512, "icon-maskable-512.png");

// iOS rondt zelf af; een eigen ronding zou dubbel staan.
await png(drawing({ size: 512, radius: 0 }), 180, "apple-touch-icon.png");

/**
 * Snelkoppelingsiconen voor het menu onder het app-icoon (Android toont die
 * als je het icoon ingedrukt houdt). Zelfde blauw als de app, met een witte
 * tekening erop, zodat het menu bij de app hoort.
 *
 * Bewust geen emoji: die worden hier naar PNG gerenderd zonder lettertype, en
 * dan staat er niets.
 */
function shortcut(glyph, size = 192) {
  const s = (v) => (size * v).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLUE}"/>
      <stop offset="1" stop-color="${DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${s(0.23)}" fill="url(#bg)"/>
  <g fill="none" stroke="#fff" stroke-width="${s(0.055)}" stroke-linecap="round" stroke-linejoin="round">
    ${glyph(s)}
  </g>
</svg>`;
}

/** Een klok op 08:23, net als het app-icoon: het vertrekscherm. */
const clockGlyph = (s) =>
  `<circle cx="${s(0.5)}" cy="${s(0.5)}" r="${s(0.28)}"/>` +
  `<path d="M${s(0.5)} ${s(0.5)} L${s(0.5)} ${s(0.3)}"/>` +
  `<path d="M${s(0.5)} ${s(0.5)} L${s(0.36)} ${s(0.58)}"/>`;

/** Een maandblad: je week. */
const calendarGlyph = (s) =>
  `<rect x="${s(0.22)}" y="${s(0.26)}" width="${s(0.56)}" height="${s(0.5)}" rx="${s(0.07)}"/>` +
  `<path d="M${s(0.22)} ${s(0.41)} H${s(0.78)}"/>` +
  `<path d="M${s(0.36)} ${s(0.26)} V${s(0.19)}"/>` +
  `<path d="M${s(0.64)} ${s(0.26)} V${s(0.19)}"/>` +
  `<path d="M${s(0.36)} ${s(0.56)} h0.01"/>` +
  `<path d="M${s(0.5)} ${s(0.56)} h0.01"/>` +
  `<path d="M${s(0.64)} ${s(0.56)} h0.01"/>`;

/** Van hier naar daar: de reisplanner. */
const routeGlyph = (s) =>
  `<circle cx="${s(0.3)}" cy="${s(0.68)}" r="${s(0.07)}"/>` +
  `<circle cx="${s(0.7)}" cy="${s(0.32)}" r="${s(0.07)}"/>` +
  `<path d="M${s(0.3)} ${s(0.59)} V${s(0.44)} a${s(0.12)} ${s(0.12)} 0 0 1 ${s(0.12)} -${s(0.12)} H${s(0.61)}"/>`;

await png(shortcut(clockGlyph), 96, "shortcut-widget.png");
await png(shortcut(calendarGlyph), 96, "shortcut-agenda.png");
await png(shortcut(routeGlyph), 96, "shortcut-reizen.png");

// De SVG blijft voor browsers die hem wél begrijpen; scherp op elk formaat.
writeFileSync("public/icon.svg", drawing({ size: 192 }));
console.log("public/icon.svg");
