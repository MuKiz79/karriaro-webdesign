/**
 * Static-HTML-Builder — Editorial-Magazine-Renderer für Branchen-Reports.
 *
 * Nimmt ein Report-Objekt aus `branchen-stadt-generator.js` und liefert
 * einen kompletten HTML-String, der nach `dist/audit/{slug}/index.html`
 * geschrieben wird.
 *
 * Brand-Codex (CLAUDE.md):
 *   - Editorial-Magazine: Folio-Nummern, JetBrains-Mono-Eyebrows, Fraunces-Italic
 *   - Pentagram-Marginalia ₁/₂/₃ rechts neben Findings
 *   - Sie-Anrede durchgängig, Sparringspartner als Kern-CTA
 * Performance-Budget:
 *   - Critical CSS inline, keine JS-Frameworks, SVG-Charts inline
 *   - LCP ≤ 1.8 s, Total Page ≤ 200 KB
 *
 * Wird vor Auslieferung durch den Voice-Linter (assertVoiceClean) geprüft.
 */
import { boxPlot, histogramChart, donutChart, ACCENT_BY_BRANCH } from './svg-charts.js';
import { buildAllSchemas, schemaScriptTag } from './llmo-layer.js';
import { assertVoiceClean, stripTags } from './voice-linter.js';

function escapeHtml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => (
        { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function pct(share) { return Math.round((share || 0) * 100); }

function leadScoreHistogramBins(leads) {
    const bins = [];
    for (let lo = 0; lo < 100; lo += 10) {
        const hi = lo + 9;
        const count = leads.filter(l => {
            if (!l.scoreBucket) return false;
            const [a] = l.scoreBucket.split('-').map(Number);
            return a === lo;
        }).length;
        bins.push({ lo, hi, count });
    }
    return bins;
}

function renderLeadTableRows(leads) {
    return leads.slice(0, 50).map(l => `<tr>
        <td class="kr-mono">${escapeHtml(l.id)}</td>
        <td>${escapeHtml(l.cms || '—')}</td>
        <td class="kr-num">${escapeHtml(l.perfBucket || '—')}</td>
        <td class="kr-num">${escapeHtml(l.scoreBucket || '—')}</td>
        <td>${l.isBaukasten ? 'Baukasten' : 'eigener Stack'}</td>
        <td>${l.hasSsl ? '✓' : '<span class="kr-flag">fehlt</span>'}</td>
        <td>${l.hasMobileViewport ? '✓' : '<span class="kr-flag">fehlt</span>'}</td>
        <td><a class="kr-claim" href="/audit/?ref=${encodeURIComponent(l.id)}&report=__SLUG__">Ihr Detail-Audit anfordern</a></td>
    </tr>`).join('');
}

function renderTestSection(tests) {
    if (!tests || !tests.length) return '';
    const items = tests.map(t => `<li>
        <div class="kr-test-label">${escapeHtml(t.label)}</div>
        <div class="kr-test-body">
            ${escapeHtml(t.verdict)}
        </div>
        <div class="kr-test-meta">
            ${escapeHtml(t.groupA?.label || '')}: n=${t.groupA?.n}, Median ${t.groupA?.median} ·
            ${escapeHtml(t.groupB?.label || '')}: n=${t.groupB?.n}, Median ${t.groupB?.median} ·
            U=${t.u}, z=${t.z}, p=${t.p}
        </div>
    </li>`).join('');
    return `<section class="kr-section">
        <p class="kr-eyebrow">№ 04 · STATISTISCHE TESTS</p>
        <h2 class="kr-h2">Was die Daten <em>signifikant</em> sagen.</h2>
        <ul class="kr-tests">${items}</ul>
    </section>`;
}

function renderMarginalia(report) {
    const notes = [
        `Stichprobe: ${report.n} Sites mit ≥ 5 öffentlichen Bewertungen.`,
        `Baukasten-Anteil: ${pct(report.baukasten.share)} % — Performance-relevant.`,
        `Ohne SSL: ${pct(report.ssl.missingShare)} %. Ohne Mobile-Viewport: ${pct(report.mobile.missingShare)} %.`
    ];
    return notes.map((n, i) => `<aside class="kr-marg">
        <span class="kr-marg-num">${['₁', '₂', '₃'][i] || ''}</span>
        <span class="kr-marg-text">${escapeHtml(n)}</span>
    </aside>`).join('');
}

function styles() {
    return `:root{--ink:#1a1a1a;--paper:#fafaf7;--paper-2:#f3f1ea;--muted:#5a5a5a;--rule:#e4e0d5;--accent:var(--branch-accent,#1a1a1a);--max:980px}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:17px;-webkit-text-size-adjust:100%}
body{background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;font-feature-settings:"ss01","cv11"}
a{color:var(--ink);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
a:hover{color:var(--accent)}
em,i{font-family:Fraunces,Georgia,serif;font-style:italic;font-feature-settings:"opsz" auto}
.kr-mono{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.86em;letter-spacing:.02em}
.kr-eyebrow{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.76rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:1rem}
.kr-folio{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.kr-h1{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:clamp(2.6rem,6vw,4.8rem);line-height:1.02;letter-spacing:-.02em;font-feature-settings:"opsz" auto;margin:.4em 0 .4em}
.kr-h1 em{font-style:italic;color:var(--accent)}
.kr-h2{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:clamp(1.6rem,3vw,2.4rem);line-height:1.15;letter-spacing:-.01em;margin:.2em 0 1em}
.kr-h2 em{font-style:italic;color:var(--accent)}
.kr-lede{font-size:clamp(1.1rem,1.8vw,1.3rem);line-height:1.5;color:var(--ink);max-width:38em;margin:0 0 1.2em}
.kr-bar{border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:.6em 0;margin:1em 0 2em;display:flex;flex-wrap:wrap;gap:1.4em;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.kr-bar strong{color:var(--ink);font-weight:600}
.kr-top{display:flex;justify-content:space-between;align-items:center;padding:1rem 0;border-bottom:1px solid var(--rule)}
.kr-top a{text-decoration:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.84rem;letter-spacing:.04em}
.kr-wrap{max-width:var(--max);margin:0 auto;padding:0 24px}
.kr-section{margin:4rem 0;position:relative}
.kr-grid-charts{display:grid;grid-template-columns:1fr;gap:1.4rem;margin:1.5rem 0}
@media(min-width:760px){.kr-grid-charts{grid-template-columns:1fr 1fr}.kr-grid-charts > :first-child{grid-column:1/-1}}
.kr-card{background:#fff;border:1px solid var(--rule);padding:1rem .8rem .4rem}
.kr-marg{display:flex;gap:.4rem;font-family:Fraunces,Georgia,serif;font-style:italic;font-size:.92rem;color:var(--muted);max-width:42ch;margin:.5em 0 .5em}
.kr-marg-num{font-family:"JetBrains Mono",ui-monospace,monospace;font-style:normal;color:var(--accent);font-weight:600}
.kr-marg-text{}
.kr-table{width:100%;border-collapse:collapse;font-size:.92rem;margin-top:1rem}
.kr-table th,.kr-table td{padding:.5em .7em;text-align:left;border-bottom:1px solid var(--rule)}
.kr-table th{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500;background:var(--paper-2)}
.kr-num{font-family:"JetBrains Mono",ui-monospace,monospace}
.kr-claim{font-family:Inter,sans-serif;font-size:.88rem;color:var(--accent);text-decoration:underline}
.kr-flag{color:#b04020;font-weight:500;font-size:.85em}
.kr-demo-banner{background:#fff4d6;border:1px solid #c9a23a;color:#5a4112;padding:.8rem 1rem;margin:1.4rem 0 0;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.84rem;letter-spacing:.04em;line-height:1.5}
.kr-demo-banner strong{color:#3a2906;font-weight:600;letter-spacing:.08em}
.kr-cta{background:var(--paper-2);padding:3rem 2rem;margin:5rem 0 2rem;text-align:center;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.kr-cta-h{font-family:Fraunces,Georgia,serif;font-size:clamp(1.6rem,3vw,2.4rem);font-weight:400;line-height:1.18;letter-spacing:-.01em;margin-bottom:.6em}
.kr-cta-h em{font-style:italic;color:var(--accent)}
.kr-cta-sub{color:var(--muted);max-width:36em;margin:0 auto 1.4em}
.kr-btn{display:inline-block;padding:.9em 1.6em;border:1px solid var(--ink);text-decoration:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:var(--paper)}
.kr-btn:hover{background:var(--ink);color:var(--paper)}
.kr-method{background:var(--paper-2);border-left:3px solid var(--accent);padding:1.2rem 1.4rem;margin:2rem 0;font-size:.94rem;color:var(--muted)}
.kr-method strong{color:var(--ink)}
.kr-tests{list-style:none;padding:0;margin:1rem 0;display:grid;gap:1.2rem}
.kr-tests li{border-left:2px solid var(--accent);padding:.4rem 0 .4rem 1.1rem}
.kr-test-label{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:.3em}
.kr-test-body{font-family:Fraunces,Georgia,serif;font-size:1.1rem;font-style:italic;color:var(--ink);margin-bottom:.4em}
.kr-test-meta{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.76rem;color:var(--muted)}
.kr-footer{padding:2rem 0 3rem;border-top:1px solid var(--rule);margin-top:3rem;color:var(--muted);font-size:.86rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem}
.kr-footer a{color:var(--muted)}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`;
}

function fontFace() {
    return `@font-face{font-family:Fraunces;font-style:normal;font-weight:300 700;src:local("Fraunces"),url(/fonts/fraunces-variable.woff2) format("woff2");font-display:swap}
@font-face{font-family:Fraunces;font-style:italic;font-weight:300 700;src:local("Fraunces Italic"),url(/fonts/fraunces-italic-variable.woff2) format("woff2");font-display:swap}`;
}

export function buildReportHtml(report, options = {}) {
    if (!report || !report.slug) throw new Error('report.slug required');
    const accent = options.accent || ACCENT_BY_BRANCH[report.brancheKey] || '#1a1a1a';
    const schemas = buildAllSchemas(report);
    const url = `https://karriaro-webdesign.de/audit/${report.slug}/`;

    const perfChart = boxPlot(report.stats.perf, { accent, label: 'PageSpeed Performance', width: 720, height: 160 });
    const techChart = donutChart(report.techStack, { accent, label: 'Tech-Stack-Verteilung', width: 360, height: 360 });
    const scoreChart = histogramChart(leadScoreHistogramBins(report.leads), { accent, label: 'Lead-Score-Verteilung', width: 360, height: 240 });

    const summary = `Stand ${report.erhebungMonth}: ${report.n} ${report.brancheName}-Sites in ${report.stadtName} liegen im Median bei einem PageSpeed-Score von ` +
        `${report.stats.perf.median} (Quartile ${report.stats.perf.p25}–${report.stats.perf.p75}). ` +
        `${pct(report.baukasten.share)} % nutzen einen Baukasten, ` +
        `${pct(report.ssl.missingShare)} % zeigen keine TLS-Verschlüsselung an, ` +
        `${pct(report.mobile.missingShare)} % keinen mobilen Viewport.`;

    const leadRows = renderLeadTableRows(report.leads).replace(/__SLUG__/g, encodeURIComponent(report.slug));
    const testSection = renderTestSection(report.tests);

    const tags = [
        schemaScriptTag(schemas.dataset),
        schemaScriptTag(schemas.article),
        schemaScriptTag(schemas.faq)
    ].join('\n');

    const metaDescription = `Wie steht ${report.brancheName} in ${report.stadtName} digital da? Audit von ${report.n} Sites: ` +
        `Median PageSpeed ${report.stats.perf.median}, ${pct(report.baukasten.share)} % Baukasten, ${pct(report.ssl.missingShare)} % ohne SSL. ` +
        `Karriaro Web-Index ${report.erhebungMonth}.`;

    const noindex = options.noindex === true;
    const robotsMeta = noindex
        ? `<meta name="robots" content="noindex,nofollow">`
        : `<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">`;
    // Bei noindex: weder Schema.org-Triple noch canonical-URL ausspielen —
    // sonst zitieren LLMs die Demo-Daten als echte Karriaro-Quelle.
    const canonicalTag = noindex ? '' : `<link rel="canonical" href="${escapeHtml(url)}">`;
    const schemaTags = noindex ? '' : tags;

    const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${noindex ? '[DEMO] ' : ''}Web-Index ${escapeHtml(report.brancheName)} ${escapeHtml(report.stadtName)} ${escapeHtml(report.erhebungDate.slice(0, 4))} — Karriaro</title>
<meta name="description" content="${escapeHtml(metaDescription)}">
${robotsMeta}
${canonicalTag}
<meta property="og:title" content="Web-Index ${escapeHtml(report.brancheName)} ${escapeHtml(report.stadtName)} ${escapeHtml(report.erhebungDate.slice(0, 4))}">
<meta property="og:description" content="${escapeHtml(metaDescription)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="de_DE">
<meta name="twitter:card" content="summary_large_image">
<style>${fontFace()}${styles()}:root{--branch-accent:${accent}}</style>
${schemaTags}
</head>
<body>
<header class="kr-top kr-wrap">
  <a href="/" class="kr-mono">Karriaro</a>
  <a href="/audit/" class="kr-mono">Web-Index</a>
</header>

<main class="kr-wrap">

  <section class="kr-section" style="margin-top:2.5rem">
    <p class="kr-folio">№ 01 · ${escapeHtml(report.erhebungDate.slice(0, 4))} · WEB-INDEX ${escapeHtml(report.brancheName.toUpperCase())} ${escapeHtml(report.stadtName.toUpperCase())}${noindex ? ' · DEMO-VORSCHAU' : ''}</p>
    <h1 class="kr-h1">${escapeHtml(report.brancheName)} in ${escapeHtml(report.stadtName)}, <em>vermessen</em>.</h1>
    ${noindex ? `<div class="kr-demo-banner"><strong>DEMO-VORSCHAU.</strong> Diese Seite zeigt die Editorial-Schicht der Karriaro Web-Index-Engine an einer frei erfundenen Stichprobe (Domains <code>friseur-beispiel-NN.demo</code>). Sie wird nicht indexiert. Der echte Köln-Audit erscheint unter <code>/audit/friseure-koeln/</code>, sobald ein realer Scanner-Run vorliegt.</div>` : ''}
    <p class="kr-lede">${escapeHtml(summary)}</p>
    <div class="kr-bar">
      <span><strong>${report.n}</strong> Sites</span>
      <span>Erhebung <strong>${escapeHtml(report.erhebungMonth)}</strong></span>
      <span>Quelle <strong>Google Places · PageSpeed Insights</strong></span>
      <span>Lizenz <strong>CC BY 4.0</strong></span>
    </div>
  </section>

  <section class="kr-section">
    <p class="kr-eyebrow">№ 02 · BEFUNDE</p>
    <h2 class="kr-h2">Drei Verteilungen, eine <em>Diagnose</em>.</h2>
    <div class="kr-grid-charts">
      <div class="kr-card">${perfChart}</div>
      <div class="kr-card">${techChart}</div>
      <div class="kr-card">${scoreChart}</div>
    </div>
    ${renderMarginalia(report)}
  </section>

  ${testSection}

  <section class="kr-section">
    <p class="kr-eyebrow">№ 05 · STICHPROBE</p>
    <h2 class="kr-h2">Die ${report.n} Sites, <em>anonymisiert</em>.</h2>
    <p class="kr-lede" style="font-size:.98rem">Jede Site dieser Stichprobe trägt eine zufällige Kennung. Wer sich beim Tech-Stack und der Score-Klasse selbst wiederfindet, fordert sein vollständiges, namentliches Audit an — kostenfrei und ohne Verpflichtung.</p>
    <table class="kr-table" aria-label="Anonymisierte Stichproben-Tabelle">
      <thead><tr>
        <th>Kennung</th><th>Stack</th><th>PSI-Perf</th><th>Score</th><th>Typ</th><th>SSL</th><th>Mobile</th><th></th>
      </tr></thead>
      <tbody>${leadRows}</tbody>
    </table>
    ${report.leads.length > 50 ? `<p class="kr-lede" style="font-size:.86rem;color:var(--muted);margin-top:1rem">Anzeige der ersten 50 von ${report.leads.length} Sites. Vollständiger Datensatz auf Anfrage.</p>` : ''}
  </section>

  <section class="kr-section">
    <p class="kr-eyebrow">№ 06 · METHODE</p>
    <h2 class="kr-h2">Wie diese Zahlen <em>entstanden</em> sind.</h2>
    <div class="kr-method">
      <p><strong>Stichprobe.</strong> ${escapeHtml(report.methodology.filter)}.</p>
      <p style="margin-top:.6em"><strong>Erhebung.</strong> ${escapeHtml(report.methodology.source)}. Instrumentierung über die ${escapeHtml(report.methodology.instrumentation)}.</p>
      <p style="margin-top:.6em"><strong>Anonymisierung.</strong> ${escapeHtml(report.methodology.anonymization)} — eine Korrelation Site ↔ Kennung verbleibt allein im Datenraum der Karriaro-Manufaktur.</p>
      <p style="margin-top:.6em"><strong>Mindest-Stichprobe.</strong> ${report.methodology.minSampleSize} Sites pro Branche und Stadt; darunter wird kein Report veröffentlicht.</p>
      <p style="margin-top:.6em"><strong>Lizenz.</strong> ${escapeHtml(report.methodology.license)}.</p>
    </div>
  </section>

  <section class="kr-cta">
    <h2 class="kr-cta-h">Sehen Sie Ihre Site in dieser Stichprobe?<br><em>Wir sprechen mit Ihnen darüber.</em></h2>
    <p class="kr-cta-sub">Zwanzig Minuten Sparringspartner-Gespräch. Wir zeigen Ihnen, was wir in den Daten zu Ihrer Branche sehen — und ob ein neuer Webauftritt der nächste richtige Schritt für Sie wäre. Ohne Verkaufsdruck.</p>
    <a class="kr-btn" href="/audit/?report=${encodeURIComponent(report.slug)}">Detail-Audit anfordern</a>
  </section>

</main>

<footer class="kr-footer kr-wrap">
  <div>© ${escapeHtml(report.erhebungDate.slice(0, 4))} Karriaro Webdesign-Manufaktur · Stand ${escapeHtml(report.erhebungDate)}</div>
  <div><a href="/impressum.html">Impressum</a> · <a href="/datenschutz.html">Datenschutz</a></div>
</footer>

</body>
</html>`;

    if (options.skipVoiceLint !== true) {
        assertVoiceClean(stripTags(html), { context: `report ${report.slug}` });
    }
    return html;
}

export const BUILDER_CONSTANTS = { ACCENT_BY_BRANCH };
