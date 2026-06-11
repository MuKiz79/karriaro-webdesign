// build-splash.mjs — Single source für den Karriaro-Splash „Der goldene Faden näht das Siegel".
// Erzeugt das selbsterhaltende Overlay-Fragment /tmp/karriaro-splash.html (Markup + CSS + JS)
// und — mit --verify — Keyframe-Screenshots zum Anschauen (Geometrie muss als ruhige Goldlinie lesen).
//
// Geometrie identisch zur Nav-Marke (build-logo-assets.mjs): Phyllotaxis r=c·√n, θ=n·gA.
// Der „Faden" ist eine PARASTICHY im Fibonacci-Schritt 5 (verbindet jeden 5. Samen) = EIN
// Spiralarm Mitte→Rand, ~2 Windungen, -32,5°/Schritt. NICHT die kontinuierliche Vogel-Spirale
// (windet 42× = Knäuel), NICHT eine Polyline durch die Samen (Zickzack). Empirisch validiert.
//
// Run: node scripts/build-splash.mjs            (schreibt das Fragment)
//      node scripts/build-splash.mjs --verify   (zusätzlich Keyframe-PNGs nach /tmp)
import { writeFileSync, readFileSync } from 'node:fs';

const gA = (3 - Math.sqrt(5)) * Math.PI;            // goldener Winkel
const CREAM = '#F1EFE7', GOLD = '#C9A24B', INDIGO = '#16202C';
const FIB = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]);

const N = 110, CX = 120, CY = 110, RMAX = 84, STEP = 5;
const c = RMAX / Math.sqrt(N);

// Punkt n der Phyllotaxis.
function pt(n) {
  const r = c * Math.sqrt(n), t = n * gA;
  return [CX + r * Math.cos(t), CY + r * Math.sin(t), r];
}

// Alle Samen als <circle>, gestaffelt nach radialem Abstand (--rf = r/RMAX → Wellen-Delay).
function bloomDots() {
  let s = '';
  for (let n = 1; n <= N; n++) {
    const [x, y, r] = pt(n);
    const gold = FIB.has(n);
    const rf = (r / RMAX).toFixed(3);
    s += `<circle class="kr-seed${gold ? ' kr-seed-gold' : ''}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(c * 0.36).toFixed(2)}" fill="${gold ? GOLD : CREAM}" style="--rf:${rf}"/>`;
  }
  return s;
}

// Catmull-Rom → glatter kubischer Bezier-Pfad durch die Schritt-5-Parastichy.
function threadPath() {
  const P = [];
  for (let n = STEP; n <= N; n += STEP) { const [x, y] = pt(n); P.push([x, y]); }
  let d = `M ${P[0][0].toFixed(2)} ${P[0][1].toFixed(2)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

// Eck-Klammern (Siegel-Rahmen) — wie Nav-Marke/og-image.
function frame(cx, cy, s, w) {
  const L = s * 0.33;
  return [
    `M ${cx-s} ${cy-s+L} L ${cx-s} ${cy-s} L ${cx-s+L} ${cy-s}`,
    `M ${cx+s-L} ${cy-s} L ${cx+s} ${cy-s} L ${cx+s} ${cy-s+L}`,
    `M ${cx-s} ${cy+s-L} L ${cx-s} ${cy+s} L ${cx-s+L} ${cy+s}`,
    `M ${cx+s-L} ${cy+s} L ${cx+s} ${cy+s} L ${cx+s} ${cy+s-L}`,
  ].map(p => `<path class="kr-frame" d="${p}" stroke="${CREAM}" stroke-width="${w}" fill="none" pathLength="1"/>`).join('');
}

const thread = threadPath();
const seal = `<svg class="kr-seal" viewBox="0 0 240 220" aria-hidden="true">
  <g class="kr-frame-g">${frame(CX, CY, 100, 1.4)}</g>
  <g class="kr-bloom">${bloomDots()}</g>
  <path class="kr-thread" d="${thread}" stroke="${GOLD}" stroke-width="0.9" fill="none" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
</svg>`;

// ── Das Overlay-Fragment (Markup + Style + Script), selbsterhaltend ──────────────
const FRAGMENT = `<!-- ═══ SPLASH „Der goldene Faden näht das Siegel" (build-splash.mjs) ═══ -->
<div class="kr-splash" id="kr-splash" role="presentation" aria-hidden="true">
  <div class="kr-splash-inner">
    ${seal}
    <div class="kr-splash-word">Karriaro</div>
    <div class="kr-splash-eyebrow">Manufaktur · Köln · Handcodiert</div>
  </div>
</div>
<style>
/* Splash ist eine JS-Verbesserung — ohne JS NICHT zeigen (sonst verdeckt er die Seite/LCP). */
html:not(.kr-js) .kr-splash{display:none!important}
html.kr-splash-lock,html.kr-splash-lock body{overflow:hidden!important}
.kr-splash{position:fixed;inset:0;z-index:2147483647;background:${INDIGO};display:flex;align-items:center;justify-content:center;
  transition:opacity .8s cubic-bezier(.76,0,.24,1),visibility .8s}
.kr-splash.kr-done{opacity:0;visibility:hidden}
.kr-splash-inner{display:flex;flex-direction:column;align-items:center;gap:22px;padding:0 24px}
.kr-seal{width:min(46vw,300px);height:auto;overflow:visible}
.kr-splash-word{font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-weight:500;font-size:clamp(30px,6vw,52px);
  letter-spacing:.16em;text-indent:.16em;color:${CREAM};line-height:1;
  clip-path:inset(0 100% 0 0);animation:kr-word-reveal .9s cubic-bezier(.76,0,.24,1) 1500ms forwards}
.kr-splash-eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:clamp(9px,1.4vw,11px);
  letter-spacing:.3em;text-indent:.3em;text-transform:uppercase;color:${GOLD};opacity:0;
  animation:kr-eyebrow-in .8s ease-out 1950ms forwards}
/* Siegel-Rahmen zeichnet sich. */
.kr-frame{stroke-dasharray:1;stroke-dashoffset:1;animation:kr-draw .6s ease-out 200ms forwards}
/* Samen blühen radial nach außen (Welle via --rf = r/Rmax). */
.kr-seed{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.2);
  animation:kr-seed-in .5s cubic-bezier(.22,1,.36,1) forwards;animation-delay:calc(380ms + var(--rf) * 1150ms)}
.kr-seed-gold{filter:drop-shadow(0 0 1.2px ${GOLD})}
/* Der goldene Faden näht sich von Mitte→Rand, parallel zur Blüte. */
.kr-thread{stroke-dasharray:1;stroke-dashoffset:1;animation:kr-draw 1450ms cubic-bezier(.55,.08,.3,1) 380ms forwards}
@keyframes kr-draw{to{stroke-dashoffset:0}}
@keyframes kr-seed-in{to{opacity:1;transform:scale(1)}}
@keyframes kr-word-reveal{to{clip-path:inset(0 0 0 0)}}
@keyframes kr-eyebrow-in{to{opacity:.95}}
/* Reduced-Motion: fertiges Siegel + Wortmarke sofort, kein Zeichnen. */
@media (prefers-reduced-motion:reduce){
  .kr-frame,.kr-thread{stroke-dashoffset:0;animation:none}
  .kr-seed{opacity:1;transform:none;animation:none}
  .kr-splash-word{clip-path:none;animation:none}
  .kr-splash-eyebrow{opacity:.95;animation:none}
}
</style>
<script>
(function(){
  var s=document.getElementById('kr-splash');if(!s)return;
  // Bots/Headless/Lighthouse/PageSpeed bekommen KEINEN Splash (LCP/Audit unberührt,
  // Crawler sehen sofort Inhalt) — gleiche Erkennung wie der Mobile-Redirect (Z.4).
  var ua=navigator.userAgent||'';
  if(/bot|crawl|spider|slurp|mediapartners|googlebot|google-extended|bingpreview|gptbot|oai-searchbot|chatgpt|claudebot|claude-web|anthropic|perplexity|applebot|ccbot|facebookbot|facebookexternalhit|meta-external|bytespider|amazonbot|duckduckbot|yandex|baidu|lighthouse|pagespeed|headless|prerender/i.test(ua)){
    s.parentNode&&s.parentNode.removeChild(s);return;
  }
  document.documentElement.classList.add('kr-js');
  // Einmal pro Sitzung — Wiederbesuche sollen nicht warten.
  if(sessionStorage.getItem('kr-splash-seen')==='1'){s.parentNode&&s.parentNode.removeChild(s);return;}
  document.documentElement.classList.add('kr-splash-lock'); // Scroll während des Splash sperren
  var done=false;
  function finish(){
    if(done)return;done=true;
    sessionStorage.setItem('kr-splash-seen','1');
    s.classList.add('kr-done');
    document.documentElement.classList.remove('kr-splash-lock');
    setTimeout(function(){s.parentNode&&s.parentNode.removeChild(s);},850);
  }
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var hold=reduce?1100:2750; // nach der Geste kurz halten, dann auflösen
  var timer=setTimeout(finish,hold);
  // Überspringen: Klick/Tap, Esc, Scroll/Wheel.
  function skip(){clearTimeout(timer);finish();}
  s.addEventListener('click',skip);
  window.addEventListener('keydown',function(e){if(e.key==='Escape')skip();});
  window.addEventListener('wheel',skip,{passive:true,once:true});
  window.addEventListener('touchmove',skip,{passive:true,once:true});
})();
</script>
<!-- ═══ /SPLASH ═══ -->`;

writeFileSync('/tmp/karriaro-splash.html', FRAGMENT);
console.log('✓ /tmp/karriaro-splash.html (' + FRAGMENT.length + ' bytes)');

// ── Verify: Keyframes rendern ───────────────────────────────────────────────────
if (process.argv.includes('--verify')) {
  const { chromium } = await import('playwright');
  let fontCss = '';
  try {
    const f = readFileSync('src/fonts/fraunces-latin.woff2').toString('base64');
    fontCss = `@font-face{font-family:'Fraunces';src:url(data:font/woff2;base64,${f}) format('woff2');font-weight:500;}`;
  } catch {}
  const page = `<!doctype html><html class="kr-js"><head><meta charset="utf8"><style>${fontCss}*{margin:0}body{background:#fff}</style></head><body>${FRAGMENT}</body></html>`;
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 2 });
  await pg.setContent(page, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts && document.fonts.ready);
  for (const T of [0.5, 1.0, 1.5, 2.0, 2.5]) {
    await pg.evaluate((t) => { document.getAnimations().forEach(a => { try { a.pause(); a.currentTime = t * 1000; } catch (e) {} }); }, T);
    await pg.waitForTimeout(60);
    const out = `/tmp/splash-t${String(T).replace('.', '_')}.png`;
    await pg.screenshot({ path: out });
    console.log('  ✓', out);
  }
  await browser.close();
}
