// build-gbp-assets.mjs — Single source für das Google-Business-Profil-Bildset (+ Gründer-og:image).
// Erzeugt in brand-assets/gbp/: 01 Profil-Logo, 02 Titelbild, 03–05 & 08–12 Arbeitsproben (echte Live-Seiten
// im Browser-Rahmen), 06 Gründer-Kachel, 07 Gesichts-Profilbild. Zusätzlich src/images/og-gruender.jpg.
// Marken-DNA: Phyllotaxis-Blüte + Fraunces + Navy/Creme/Messing. Porträt = echtes Foto (keine Attrappen).
// Voraussetzung: python3 scripts/upscale-portrait.py (schreibt brand-assets/.cache/portrait-hi.png).
// Run: node scripts/build-gbp-assets.mjs            (alles)
//      SKIP_SHOTS=1 node scripts/build-gbp-assets.mjs   (ohne Live-Screenshots — nur Marke+Porträt+og)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';

const GBP = 'brand-assets/gbp';
mkdirSync(GBP, { recursive: true });
const SKIP_SHOTS = !!process.env.SKIP_SHOTS;
const NAVY = '#16202C', CREAM = '#F1EFE7', GOLD = '#C9A24B';
const gA = (3 - Math.sqrt(5)) * Math.PI;
const FIB = new Set([1,2,3,5,8,13,21,34,55,89,144,233]);
const fr = readFileSync('src/fonts/fraunces-latin.woff2').toString('base64');
const FONT = `@font-face{font-family:'Fraunces';src:url(data:font/woff2;base64,${fr}) format('woff2');font-weight:500;}`;
const portHi = existsSync('brand-assets/.cache/portrait-hi.png')
  ? readFileSync('brand-assets/.cache/portrait-hi.png').toString('base64')
  : readFileSync('src/images/muammer-portrait.jpg').toString('base64');

function dots(cx, cy, Rmax, N, base, gold, dotScale=0.36, op=1) {
  const c = Rmax/Math.sqrt(N); let s='';
  for (let n=1;n<=N;n++){ const r=c*Math.sqrt(n), t=n*gA;
    s+=`<circle cx="${(cx+r*Math.cos(t)).toFixed(2)}" cy="${(cy+r*Math.sin(t)).toFixed(2)}" r="${(c*dotScale).toFixed(2)}" fill="${FIB.has(n)?gold:base}" opacity="${op}"/>`; }
  return s;
}
function frame(cx, cy, s, stroke, w, op=1) {
  const L=s*0.30;
  return [
    `M ${(cx-s).toFixed(2)} ${(cy-s+L).toFixed(2)} L ${(cx-s).toFixed(2)} ${(cy-s).toFixed(2)} L ${(cx-s+L).toFixed(2)} ${(cy-s).toFixed(2)}`,
    `M ${(cx+s-L).toFixed(2)} ${(cy-s).toFixed(2)} L ${(cx+s).toFixed(2)} ${(cy-s).toFixed(2)} L ${(cx+s).toFixed(2)} ${(cy-s+L).toFixed(2)}`,
    `M ${(cx-s).toFixed(2)} ${(cy+s-L).toFixed(2)} L ${(cx-s).toFixed(2)} ${(cy+s).toFixed(2)} L ${(cx-s+L).toFixed(2)} ${(cy+s).toFixed(2)}`,
    `M ${(cx+s-L).toFixed(2)} ${(cy+s).toFixed(2)} L ${(cx+s).toFixed(2)} ${(cy+s).toFixed(2)} L ${(cx+s).toFixed(2)} ${(cy+s-L).toFixed(2)}`,
  ].map(d=>`<path d="${d}" stroke="${stroke}" stroke-width="${w}" fill="none" opacity="${op}"/>`).join('');
}
const cornerFrame = (c) => `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;pointer-events:none">
  <path d="M4 22 L4 4 L22 4" stroke="${c}" stroke-width="0.9" fill="none"/><path d="M78 4 L96 4 L96 22" stroke="${c}" stroke-width="0.9" fill="none"/>
  <path d="M4 78 L4 96 L22 96" stroke="${c}" stroke-width="0.9" fill="none"/><path d="M78 96 L96 96 L96 78" stroke="${c}" stroke-width="0.9" fill="none"/></svg>`;

const WORK = [
  { slug:'immobilien-makler', eyebrow:'IMMOBILIEN · LIVE-WERTERMITTLUNG', title:'Stadtmakler Stuttgart', n:'03' },
  { slug:'dachdecker-meisterbetrieb', eyebrow:'HANDWERK · ANGEBOT IN MINUTEN', title:'Dachdecker-Meisterbetrieb', n:'04' },
  { slug:'coaching-lehmann', eyebrow:'COACHING · TERMINE ONLINE', title:'Coaching Lehmann', n:'05' },
  { slug:'friseur-salon', eyebrow:'BEAUTY · ONLINE-TERMINE', title:'Salon Müller', n:'08' },
  { slug:'praxis-weber', eyebrow:'MEDIZIN · TERMINE ONLINE', title:'Praxis Dr. Weber', n:'09' },
  { slug:'restaurant-template', eyebrow:'GASTRONOMIE · TISCH RESERVIEREN', title:'Goldener Hirsch', n:'10' },
  { slug:'spedition-schwaben', eyebrow:'LOGISTIK · ANGEBOT ANFRAGEN', title:'Spedition Schwaben', n:'11' },
  { slug:'meisterbetrieb-mueller', eyebrow:'HANDWERK · FESTPREIS-ANFRAGE', title:'Meisterbetrieb Müller', n:'12' },
];

const browser = await chromium.launch();
async function render(html, w, h, path, type='png', q=92, dsf=2) {
  const pg = await browser.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:dsf });
  await pg.setContent(html); await pg.evaluate(()=>document.fonts&&document.fonts.ready); await pg.waitForTimeout(340);
  const o={ path, clip:{x:0,y:0,width:w,height:h} }; if(type==='jpeg'){o.type='jpeg';o.quality=q;}
  await pg.screenshot(o); await pg.close(); console.log('  ✓', path);
}
async function shot(slug) {
  const pg = await browser.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:2 });
  try { await pg.goto(`https://karriaro-webdesign.de/portfolio/${slug}`, {waitUntil:'networkidle',timeout:30000}); }
  catch { await pg.goto(`https://karriaro-webdesign.de/portfolio/${slug}`, {waitUntil:'domcontentloaded',timeout:30000}); }
  await pg.waitForTimeout(1600);
  await pg.evaluate(()=>{ document.querySelectorAll('.kr-strip,.skip-link,[class*="splash"],[id*="splash"]').forEach(e=>{try{e.remove()}catch{}});
    document.body.style.paddingTop='0'; document.documentElement.style.paddingTop='0';
    for(const el of document.body.children){try{const cs=getComputedStyle(el);if(parseFloat(cs.paddingTop)>20)el.style.paddingTop='0';if(parseFloat(cs.marginTop)>20)el.style.marginTop='0';}catch{}}
    window.scrollTo(0,0); });
  await pg.waitForTimeout(500);
  const buf = await pg.screenshot({ clip:{x:0,y:0,width:1440,height:900} }); await pg.close(); return buf.toString('base64');
}

// 01 Profil-Logo
const profile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><defs><radialGradient id="v" cx="50%" cy="42%" r="65%"><stop offset="0%" stop-color="#1c2836"/><stop offset="100%" stop-color="${NAVY}"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#v)"/>${frame(512,512,343,GOLD,2.4,0.9)}${dots(512,512,292,72,CREAM,GOLD,0.40)}</svg>`;
await render(`<!doctype html><meta charset=utf-8><style>*{margin:0}</style>${profile}`, 1024, 1024, `${GBP}/01-profil-logo-1024.png`);

// 02 Titelbild
const cover = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><rect width="1600" height="900" fill="${NAVY}"/><g transform="translate(1280,450)">${frame(0,0,360,GOLD,2.2,0.55)}${dots(0,0,310,120,CREAM,GOLD,0.34,0.92)}</g><text x="120" y="270" font-family="ui-monospace,Menlo,monospace" font-size="27" letter-spacing="9" fill="${GOLD}">MANUFAKTUR · HANDCODIERTE WEBSITES · SCHILTACH</text><line x1="120" y1="310" x2="240" y2="310" stroke="${GOLD}" stroke-width="2"/><text x="116" y="490" font-family="'Fraunces',Georgia,serif" font-weight="500" font-size="140" fill="${CREAM}">Karriaro</text><text x="120" y="630" font-family="'Fraunces',Georgia,serif" font-style="italic" font-weight="500" font-size="47" fill="${CREAM}" opacity="0.92">Websites fürs KI-Zeitalter — die mitarbeiten.</text></svg>`;
await render(`<!doctype html><meta charset=utf-8><style>${FONT}*{margin:0}</style>${cover}`, 1600, 900, `${GBP}/02-titelbild-1600x900.jpg`, 'jpeg', 92);

// 06 Gründer-Kachel + 07 Gesichts-Profil + og-gruender
function gruenderKachel(){ return `<!doctype html><html><head><meta charset=utf-8><style>${FONT}*{margin:0;box-sizing:border-box}
  body{width:1600px;height:1200px;background:radial-gradient(130% 110% at 78% 30%,#1e2b3a 0%,${NAVY} 70%);font-family:'Fraunces',Georgia,serif;display:flex;align-items:center;overflow:hidden;position:relative}
  .left{width:720px;padding:0 40px 0 110px}.eb{font-family:ui-monospace,Menlo,monospace;color:${GOLD};font-size:24px;letter-spacing:.20em}
  .rule{width:120px;height:2px;background:${GOLD};margin:26px 0 30px}.name{color:${CREAM};font-size:82px;font-weight:500;line-height:1.02}
  .motto{color:${CREAM};opacity:.92;font-style:italic;font-size:40px;line-height:1.3;margin-top:34px}
  .sub{font-family:ui-monospace,Menlo,monospace;color:#b9c2cc;font-size:20px;letter-spacing:.10em;margin-top:40px}
  .right{position:absolute;right:110px;top:50%;transform:translateY(-50%);width:600px;height:600px}
  .pcard{width:100%;height:100%;border-radius:14px;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.5)}
  .pcard img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.04)}
  .mark{position:absolute;left:110px;bottom:54px;color:${GOLD};font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:.22em;opacity:.85}
  </style></head><body><div class="left"><div class="eb">GRÜNDER — KARRIARO MANUFAKTUR</div><div class="rule"></div>
  <div class="name">Muammer<br>Kızılaslan</div><div class="motto">„Wenn Ihr Name draufsteht,<br>steht unserer dahinter.“</div>
  <div class="sub">HANDCODIERTE UNIKATE · SCHILTACH</div></div>
  <div class="right"><div class="pcard"><img src="data:image/png;base64,${portHi}"></div>${cornerFrame(GOLD)}</div>
  <div class="mark">KARRIARO</div></body></html>`; }
await render(gruenderKachel(), 1600, 1200, `${GBP}/06-gruender-kachel.jpg`, 'jpeg', 92);

const faceProfile = `<!doctype html><html><head><meta charset=utf-8><style>*{margin:0;box-sizing:border-box}
  body{width:1024px;height:1024px;overflow:hidden;position:relative;background:${NAVY}}
  .p{position:absolute;inset:0}.p img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.05)}
  .vig{position:absolute;inset:0;box-shadow:inset 0 0 120px 30px rgba(15,23,32,.45)}
  </style></head><body><div class="p"><img src="data:image/png;base64,${portHi}"></div><div class="vig"></div>${cornerFrame('rgba(201,162,75,.9)')}</body></html>`;
await render(faceProfile, 1024, 1024, `${GBP}/07-profil-gesicht-1024.jpg`, 'jpeg', 92);

// og:image für gruender.html (1200×630, quer)
const ogGr = `<!doctype html><html><head><meta charset=utf-8><style>${FONT}*{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:radial-gradient(130% 120% at 80% 35%,#1e2b3a 0%,${NAVY} 72%);font-family:'Fraunces',Georgia,serif;position:relative;overflow:hidden}
  .left{position:absolute;left:80px;top:50%;transform:translateY(-50%);width:560px}
  .eb{font-family:ui-monospace,Menlo,monospace;color:${GOLD};font-size:19px;letter-spacing:.18em}.rule{width:100px;height:2px;background:${GOLD};margin:20px 0 22px}
  .name{color:${CREAM};font-size:62px;font-weight:500;line-height:1.03}.motto{color:${CREAM};opacity:.92;font-style:italic;font-size:27px;margin-top:22px;line-height:1.3}
  .right{position:absolute;right:80px;top:50%;transform:translateY(-50%);width:420px;height:420px}
  .pcard{width:100%;height:100%;border-radius:12px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.5)}
  .pcard img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.04)}
  .mark{position:absolute;left:80px;bottom:40px;color:${GOLD};font-family:ui-monospace,Menlo,monospace;font-size:16px;letter-spacing:.22em;opacity:.85}
  </style></head><body><div class="left"><div class="eb">GRÜNDER · KARRIARO</div><div class="rule"></div>
  <div class="name">Muammer<br>Kızılaslan</div><div class="motto">„Wenn Ihr Name draufsteht,<br>steht unserer dahinter.“</div></div>
  <div class="right"><div class="pcard"><img src="data:image/png;base64,${portHi}"></div>${cornerFrame(GOLD)}</div>
  <div class="mark">KARRIARO WEBDESIGN</div></body></html>`;
await render(ogGr, 1200, 630, 'src/images/og-gruender.jpg', 'jpeg', 90);

// 03–05 & 08–12 Arbeitsproben (Live-Screenshots)
if (!SKIP_SHOTS) {
  for (const t of WORK) {
    const b64 = await shot(t.slug);
    const tile = `<!doctype html><html><head><meta charset=utf-8><style>${FONT}*{margin:0;box-sizing:border-box}
      body{width:1600px;height:1200px;background:radial-gradient(120% 100% at 50% 22%,#1e2b3a 0%,${NAVY} 68%);display:flex;flex-direction:column;align-items:center;font-family:'Fraunces',Georgia,serif;overflow:hidden}
      .card{width:1360px;margin-top:96px;border-radius:20px;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.45),0 8px 22px rgba(0,0,0,.30);background:#fff}
      .chrome{height:52px;background:#eceae4;display:flex;align-items:center;gap:10px;padding:0 20px;border-bottom:1px solid #ddd9cf}
      .dot{width:13px;height:13px;border-radius:50%}.d1{background:#d8c07a}.d2{background:#e7e3d7}.d3{background:#c9cdd2}
      .bar{flex:1;height:30px;background:#fff;border-radius:8px;margin-left:14px;display:flex;align-items:center;justify-content:center;color:#8a8578;font-family:ui-monospace,Menlo,monospace;font-size:15px}
      .view{height:742px;overflow:hidden;background:#fff}.view img{width:1360px;display:block}
      .cap{margin-top:52px;text-align:center;width:1360px}.eb{font-family:ui-monospace,Menlo,monospace;color:${GOLD};font-size:22px;letter-spacing:.20em}
      .ti{color:${CREAM};font-size:60px;font-weight:500;margin-top:16px}.mark{position:fixed;right:44px;bottom:36px;color:${GOLD};font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:.22em;opacity:.85}
      </style></head><body><div class="card"><div class="chrome"><span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
      <div class="bar">karriaro-webdesign.de/portfolio/${t.slug}</div></div><div class="view"><img src="data:image/png;base64,${b64}"></div></div>
      <div class="cap"><div class="eb">${t.eyebrow}</div><div class="ti">${t.title}</div></div><div class="mark">KARRIARO</div></body></html>`;
    await render(tile, 1600, 1200, `${GBP}/${t.n}-arbeitsprobe-${t.slug}.jpg`, 'jpeg', 92, 1.5);
  }
}
await browser.close();
console.log(SKIP_SHOTS ? 'done (Marke+Porträt+og; Arbeitsproben übersprungen)' : 'done (komplett)');
