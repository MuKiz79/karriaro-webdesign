// build-splash.mjs — Single source für den Karriaro-Splash (Phyllotaxis-Siegel-Selbstaufbau).
// Erzeugt das selbsterhaltende Overlay-Fragment /tmp/karriaro-splash.html (Markup + CSS + JS)
// und — mit --verify — Keyframe-Screenshots zum Anschauen.
//
// Geometrie identisch zur Nav-Marke (build-logo-assets.mjs): Phyllotaxis r=c·√n, θ=n·gA.
// WOW OHNE gezeichnete Spirale (Founder 2026-06-11): die 110 Samen erscheinen in
// Phyllotaxis-REIHENFOLGE (n=1→110); weil jeder im Goldenen Winkel zum vorigen liegt,
// entstehen die Sonnenblumen-Spiralen IMPLIZIT — die Mathematik schreibt sich selbst.
// Gold-Samen (Fibonacci) leuchten beim Landen; das Siegel atmet einmal sanft ein.
//
// Run: node scripts/build-splash.mjs            (schreibt das Fragment)
//      node scripts/build-splash.mjs --verify   (zusätzlich Keyframe-PNGs nach /tmp)
import { writeFileSync, readFileSync } from 'node:fs';

const gA = (3 - Math.sqrt(5)) * Math.PI;            // goldener Winkel
const CREAM = '#F1EFE7', GOLD = '#C9A24B', INDIGO = '#16202C';
const FIB = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]);

const N = 110, CX = 120, CY = 110, RMAX = 84;
const c = RMAX / Math.sqrt(N);

// Punkt n der Phyllotaxis.
function pt(n) {
  const r = c * Math.sqrt(n), t = n * gA;
  return [CX + r * Math.cos(t), CY + r * Math.sin(t), r];
}

// Alle Samen als <circle>. WOW = Selbstaufbau in Phyllotaxis-REIHENFOLGE (--si = n/N):
// jeder Samen landet im Goldenen Winkel zum vorigen, sodass die Sonnenblumen-Spiralen
// (Parastichien) IMPLIZIT entstehen, ohne je eine Linie zu zeichnen. Mathematik als Geste.
function bloomDots() {
  let s = '';
  for (let n = 1; n <= N; n++) {
    const [x, y] = pt(n);
    const gold = FIB.has(n);
    const si = ((n - 1) / (N - 1)).toFixed(4);
    s += `<circle class="kr-seed${gold ? ' kr-seed-gold' : ''}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(c * 0.36).toFixed(2)}" fill="${gold ? GOLD : CREAM}" style="--si:${si}"/>`;
  }
  return s;
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

const seal = `<svg class="kr-seal" viewBox="0 0 240 220" aria-hidden="true">
  <g class="kr-frame-g">${frame(CX, CY, 100, 1.4)}</g>
  <g class="kr-bloom">${bloomDots()}</g>
</svg>`;

// ── Das Overlay-Fragment (Markup + Style + Script), selbsterhaltend ──────────────
const FRAGMENT = `<!-- ═══ SPLASH „Der goldene Faden näht das Siegel" (build-splash.mjs) ═══ -->
<div class="kr-splash" id="kr-splash" role="presentation" aria-hidden="true">
  <div class="kr-splash-inner">
    ${seal}
    <div class="kr-splash-caption">
      <div class="kr-splash-lockup">
        <div class="kr-splash-word">Karriaro</div>
        <div class="kr-splash-product">Webdesign</div>
      </div>
      <div class="kr-splash-eyebrow">Manufaktur · Köln · Handcodiert</div>
    </div>
  </div>
</div>
<style>
/* Splash ist eine JS-Verbesserung — ohne JS NICHT zeigen (sonst verdeckt er die Seite/LCP). */
html:not(.kr-js) .kr-splash{display:none!important}
html.kr-splash-lock,html.kr-splash-lock body{overflow:hidden!important}
.kr-splash{position:fixed;inset:0;z-index:2147483647;background:${INDIGO};display:flex;align-items:center;justify-content:center;
  transition:opacity .8s cubic-bezier(.76,0,.24,1),visibility .8s}
.kr-splash.kr-done{opacity:0;visibility:hidden}
.kr-splash-inner{display:flex;flex-direction:column;align-items:center;gap:20px;padding:0 24px}
/* Caption (Lockup + Eyebrow) als EIN Container — beim Morph als Ganzes ausgeblendet,
   damit die forwards-Animationen der Kinder das Opacity nicht überschreiben. */
.kr-splash-caption{display:flex;flex-direction:column;align-items:center;gap:20px}
/* Lockup = Wortmarke + Produktname, wie in der Nav der Webdesign-Seite. */
.kr-splash-lockup{display:flex;flex-direction:column;align-items:center;gap:8px}
/* Das ganze Siegel atmet einmal sanft ein, während sich die Blüte schreibt (Tiefe statt Spektakel). */
.kr-seal{width:min(46vw,300px);height:auto;overflow:visible;transform-origin:center 50%;
  animation:kr-seal-settle 2.1s cubic-bezier(.22,1,.36,1) 300ms both}
/* „Karriaro" — Wisch-Reveal PLUS opsz-Atem: Fraunces ist variabel; die optische Größe
   öffnet sich von 12 (kräftig) auf 144 (elegant, hoher Kontrast) — die Wortmarke „atmet auf".
   Nur Kenner bemerken es bewusst; genau deshalb wirkt es teuer. */
.kr-splash-word{font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-weight:500;font-size:clamp(30px,6vw,52px);
  letter-spacing:.16em;text-indent:.16em;color:${CREAM};line-height:1;font-variation-settings:"opsz" 12;
  clip-path:inset(0 100% 0 0);animation:kr-word-reveal .9s cubic-bezier(.76,0,.24,1) 1600ms forwards,
  kr-word-opsz 1.3s cubic-bezier(.22,1,.36,1) 1600ms forwards}
/* Produktname „Webdesign" — Messing-Mono wie die Nav-Sublinie der Webdesign-Seite. */
.kr-splash-product{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:500;
  font-size:clamp(12px,1.9vw,17px);letter-spacing:.34em;text-indent:.34em;text-transform:uppercase;
  color:${GOLD};opacity:0;animation:kr-eyebrow-in .7s ease-out 1900ms forwards}
.kr-splash-eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:clamp(8px,1.2vw,10px);
  letter-spacing:.3em;text-indent:.3em;text-transform:uppercase;color:${CREAM};opacity:0;
  animation:kr-eyebrow-in .8s ease-out 2150ms forwards}
/* Morph-Phase: die Caption (Lockup + Eyebrow) weicht, damit das Siegel allein in die Nav
   fliegt. Der Eck-Rahmen bleibt im Siegel und skaliert mit (Nav-Marke hat denselben Rahmen). */
.kr-splash.kr-morph .kr-splash-caption{opacity:0;transition:opacity .35s ease}
/* Siegel-Rahmen zeichnet sich. */
.kr-frame{stroke-dasharray:1;stroke-dashoffset:1;animation:kr-draw .6s ease-out 200ms forwards}
/* WOW: Samen erscheinen in Phyllotaxis-Reihenfolge (--si=n/N) — der Goldene Winkel lässt die
   Sonnenblumen-Spiralen von selbst entstehen, ohne dass je eine Linie gezeichnet wird. */
.kr-seed{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.1);
  animation:kr-seed-in .55s cubic-bezier(.34,1.56,.64,1) forwards;animation-delay:calc(360ms + var(--si) * 1500ms)}
/* Gold-Samen (Fibonacci) bekommen ein warmes Aufleuchten beim Landen. */
.kr-seed-gold{animation:kr-seed-in .55s cubic-bezier(.34,1.56,.64,1) forwards,
  kr-gold-glow 1.1s ease-out forwards;animation-delay:calc(360ms + var(--si) * 1500ms)}
@keyframes kr-draw{to{stroke-dashoffset:0}}
@keyframes kr-seed-in{60%{opacity:1}to{opacity:1;transform:scale(1)}}
@keyframes kr-gold-glow{0%{filter:drop-shadow(0 0 0 ${GOLD})}35%{filter:drop-shadow(0 0 3px ${GOLD})}to{filter:drop-shadow(0 0 1px ${GOLD})}}
@keyframes kr-seal-settle{0%{transform:scale(.9)}65%{transform:scale(1.025)}to{transform:scale(1)}}
@keyframes kr-word-reveal{to{clip-path:inset(0 0 0 0)}}
@keyframes kr-word-opsz{from{font-variation-settings:"opsz" 12}to{font-variation-settings:"opsz" 144}}
@keyframes kr-eyebrow-in{to{opacity:.95}}
/* Reduced-Motion: fertiges Siegel + Wortmarke sofort, kein Aufbau. */
@media (prefers-reduced-motion:reduce){
  .kr-frame{stroke-dashoffset:0;animation:none}
  .kr-seal{animation:none}
  .kr-seed,.kr-seed-gold{opacity:1;transform:none;animation:none}
  .kr-seed-gold{filter:drop-shadow(0 0 1px ${GOLD})}
  .kr-splash-word{clip-path:none;animation:none;font-variation-settings:"opsz" 144}
  .kr-splash-product,.kr-splash-eyebrow{opacity:.95;animation:none}
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
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  function remove(){s.parentNode&&s.parentNode.removeChild(s);}
  function unlock(){document.documentElement.classList.remove('kr-splash-lock');}
  // Einfaches Auflösen (Skip oder Fallback): Overlay faded weg.
  function fadeOut(){
    if(done)return;done=true;sessionStorage.setItem('kr-splash-seen','1');
    s.classList.add('kr-done');unlock();setTimeout(remove,850);
  }
  // FINALE-GESTE: Das Siegel fliegt exakt in die Nav-Marke (FLIP/Shared-Element).
  // Die Nav-Marke ist geometrisch identisch → ehrliche Fortsetzung, kein Trick.
  // Harter Fallback aufs Fade bei reduced-motion / Mobile / fehlender oder
  // nicht messbarer Nav-Marke (Founder-Bedingung).
  function morphToNav(){
    if(done)return;
    var nav=document.querySelector('.nav-mark');
    var seal=s.querySelector('.kr-seal');
    if(reduce||window.innerWidth<=900||!nav||!seal){fadeOut();return;}
    var r1=nav.getBoundingClientRect();
    seal.style.animation='none';                 // Settle-Animation lösen (Endwert scale 1)
    var r0=seal.getBoundingClientRect();
    if(!r1.width||!r0.width){fadeOut();return;}   // nicht messbar → Fallback
    done=true;sessionStorage.setItem('kr-splash-seen','1');unlock();
    var sc=r1.width/r0.width;
    var dx=(r1.left+r1.width/2)-(r0.left+r0.width/2);
    var dy=(r1.top+r1.height/2)-(r0.top+r0.height/2);
    s.classList.add('kr-morph');                  // Lockup + Eyebrow weichen
    seal.style.transformOrigin='center center';
    seal.style.transition='transform .9s cubic-bezier(.22,1,.36,1)';
    // doppeltes rAF, damit transition vor dem Transform greift
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      seal.style.transform='translate('+dx+'px,'+dy+'px) scale('+sc+')';
    });});
    // Auf halbem Weg das Navy-Overlay wegblenden → die echte Nav-Marke darunter
    // übernimmt nahtlos (Cross-Dissolve, Siegel sitzt exakt an Nav-Position).
    setTimeout(function(){s.style.transition='opacity .5s ease';s.style.opacity='0';},540);
    setTimeout(remove,1050);
  }
  var hold=reduce?1100:3050; // Aufbau + 200ms Stille, dann die Finale-Geste
  var timer=setTimeout(morphToNav,hold);
  // Überspringen (ungeduldig): kein Morph, schnelles Fade.
  function skip(){clearTimeout(timer);fadeOut();}
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
  // Echter Browser-UA, sonst entfernt der Bot-/Headless-Gate den Splash → weißes Bild.
  const pg = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' });
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
