// build-logo-assets.mjs — Single source of truth für das Karriaro-Logo (Phyllotaxis-Blüte).
// Erzeugt: favicon.svg, PWA-Icons (apple-touch/192/512), og-image(+mobile), karriaro-logo-512.png
// und druckt den Nav-Inline-Mark-SVG-String (zum Einsetzen in index.html).
// Mark: Phyllotaxis r=c·√n, θ=n·137,5°; Gold gleichmäßig via Hash. Run: node scripts/build-logo-assets.mjs
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';

const gA = (3 - Math.sqrt(5)) * Math.PI;
const CREAM = '#ECE5D6', GOLD = '#C9A14A', INDIGO = '#1A2E40';
// Gold = Fibonacci-Indizes → die Gold-Punkte liegen auf EINER Spirale (aufeinanderfolgende
// Fibonacci-Samen einer Phyllotaxis bilden einen Spiralarm) = ein goldener Faden durch die Blüte.
// Dieselbe Goldener-Schnitt-DNA wie die Anordnung, zweimal ausgedrückt. (Goldschmied-Meisterzeichen.)
const FIB = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]);
const isGold = (n) => FIB.has(n);

// Punkte einer Phyllotaxis-Blüte um (cx,cy), Außenradius Rmax, N Punkte.
function dots(cx, cy, Rmax, N, base, gold, dotScale = 0.34) {
  const c = Rmax / Math.sqrt(N);
  let s = '';
  for (let n = 1; n <= N; n++) {
    const r = c * Math.sqrt(n), t = n * gA;
    s += `<circle cx="${(cx + r * Math.cos(t)).toFixed(2)}" cy="${(cy + r * Math.sin(t)).toFixed(2)}" r="${(c * dotScale).toFixed(2)}" fill="${isGold(n) ? gold : base}"/>`;
  }
  return s;
}

// Compact-Mark (kleine Größen): wenige + kräftige Punkte → bei Nav/Favicon erkennbar.
const COMPACT_N = 28, COMPACT_S = 0.45;

// ---- favicon.svg (Compact-Mark im dunklen Rounded-Square) ----
const favicon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Karriaro">
  <rect width="32" height="32" rx="5" fill="${INDIGO}"/>
  ${dots(16, 16, 13, COMPACT_N, CREAM, GOLD, COMPACT_S)}
</svg>`;
writeFileSync('src/images/favicon.svg', favicon);

// ---- Nav-Inline-Mark (Compact, currentColor → theme-adaptiv; Gold fest) ----
const navMark = `<svg class="nav-mark" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">${dots(20, 20, 17, COMPACT_N, 'currentColor', GOLD, COMPACT_S)}</svg>`;
writeFileSync('/tmp/nav-mark.svg', navMark);

// ---- Render-Helpers (SVG → PNG/JPG via Playwright, vektor = scharf) ----
const cormorant = (() => {
  try { return readFileSync('src/fonts/cormorant-garamond-latin.woff2').toString('base64'); } catch { return null; }
})();
const fontFace = cormorant
  ? `@font-face{font-family:'Cormorant Garamond';src:url(data:font/woff2;base64,${cormorant}) format('woff2');font-weight:500;}`
  : '';

function iconSVG(size, N) {
  const r = Math.round(size * 0.16);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${INDIGO}"/>${dots(size/2, size/2, size*0.40, N, CREAM, GOLD, 0.38)}</svg>`;
}
function ogSVG(W, H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${INDIGO}"/>${dots(W/2, H*0.40, H*0.30, 120, CREAM, GOLD, 0.34)}<text x="${W/2}" y="${H*0.86}" text-anchor="middle" font-family="'Cormorant Garamond',Georgia,serif" font-weight="500" font-size="${H*0.105}" letter-spacing="${H*0.024}" fill="${CREAM}">KARRIARO</text></svg>`;
}

const browser = await chromium.launch();
async function render(svg, w, h, path, type = 'png') {
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await pg.setContent(`<!doctype html><html><head><style>${fontFace}*{margin:0}</style></head><body>${svg}</body></html>`);
  await pg.evaluate(() => document.fonts && document.fonts.ready);
  await pg.waitForTimeout(250);
  const opts = { path, clip: { x: 0, y: 0, width: w, height: h } };
  if (type === 'jpeg') { opts.type = 'jpeg'; opts.quality = 95; } // hoch: kaum Artefakte auf der Flächengrafik
  await pg.screenshot(opts);
  await pg.close();
  console.log('  ✓', path);
}

console.log('Rendering raster assets…');
await render(iconSVG(180, 42), 180, 180, 'src/m/icons/apple-touch-icon.png');
await render(iconSVG(192, 42), 192, 192, 'src/m/icons/icon-192.png');
await render(iconSVG(512, 60), 512, 512, 'src/m/icons/icon-512.png');
await render(iconSVG(512, 60), 512, 512, 'src/images/karriaro-logo-512.png');
await render(ogSVG(1200, 630), 1200, 630, 'src/images/og-image.jpg', 'jpeg');
await render(ogSVG(1200, 630), 1200, 630, 'src/images/og-image-mobile.jpg', 'jpeg');
await browser.close();

console.log('\nfavicon.svg + PWA-Icons + og-image geschrieben.');
console.log('\n=== NAV-INLINE-MARK (in index.html .nav-logo einsetzen) ===\n' + navMark + '\n');
