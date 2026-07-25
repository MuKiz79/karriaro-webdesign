/**
 * End-to-End-Verifikation der Kaufsignal-Achse an ECHTEN Seiten (Playbook §2:
 * nicht nur das Gate testen, sondern den realen Durchlauf).
 *
 * Holt echte PSI-Daten, laesst die PRODUKTIVEN Module darauf laufen und zeigt,
 * was das Werkzeug fuer diese Betriebe wirklich ausgibt.
 *
 * Nutzung:  node verify-buying-intent.mjs <url> [<url> ...]
 * Liegt bewusst im App-Verzeichnis (Node loest Imports ab dem DATEI-Ort auf).
 */
import { extractWebsiteScore } from './src/signals/website-score.js';
import { detectTech } from './src/signals/tech-detect.js';
import { detectGoogleAds } from './src/signals/google-ads.js';
import { detectJobSignals } from './src/signals/job-signal.js';
import { analyzeDigitalFootprint } from './src/signals/digital-footprint.js';
import { assessBuyingIntent, computeAdWaste } from './src/analysis/buying-intent.js';
import { computeOpportunity } from './src/scoring/opportunity.js';

const urls = process.argv.slice(2);
if (!urls.length) { console.error('URLs fehlen'); process.exit(1); }

async function psi(url) {
    const api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
        + `?url=${encodeURIComponent(url)}&strategy=mobile`
        + '&category=performance&category=seo&category=accessibility'
        + (process.env.PSI_KEY ? `&key=${process.env.PSI_KEY}` : '');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 90000);   // Playbook: nie fetch ohne Timeout
    try {
        const r = await fetch(api, { signal: ctl.signal });
        if (!r.ok) throw new Error(`PSI ${r.status}`);
        return await r.json();
    } finally { clearTimeout(t); }
}

for (const url of urls) {
    try {
        const data = await psi(url);
        const ws = extractWebsiteScore(data);
        const tech = detectTech(data);
        const ads = detectGoogleAds(data);
        const jobs = detectJobSignals(data);
        const fp = analyzeDigitalFootprint(data);

        const bi = assessBuyingIntent({ googleAds: ads, footprint: fp, jobSignal: jobs });
        const aw = computeAdWaste({ ws, adsActive: bi.adsActive });

        // Scanner-Pfad mit einem plausiblen, etablierten Betrieb als Platzhalter,
        // damit der Kaufsignal-Multiplikator sichtbar wird.
        const place = { rating: 4.6, userRatingCount: 120, primaryType: 'dentist', businessStatus: 'OPERATIONAL' };
        const opp = computeOpportunity({
            ws, tech, place, websiteUri: url,
            reviewRecency: { daysSinceLast: 20, velocity: 4, n: 5 },
            adIntent: { active: bi.adsActive, signals: ads.signals },
            jobIntent: jobs
        });

        console.log('\n' + '='.repeat(70));
        console.log(url);
        console.log('='.repeat(70));
        console.log(`  Perf ${ws.perf} · SEO ${ws.seo} · A11y ${ws.a11y} · HTTPS ${ws.isHttps} · Viewport ${ws.viewport}`);
        console.log(`  Tech: ${tech.cms || 'nicht erkannt'}${tech.isBaukasten ? ' (Baukasten)' : ''}`);
        console.log(`  --- KAUFSIGNAL ---`);
        console.log(`  Score ${bi.score}/100 · Tier "${bi.tier}" · bewiesener Spender: ${bi.isProvenSpender}`);
        for (const s of bi.signals) console.log(`    + ${s.weight.toString().padStart(2)}  ${s.label}   [${s.proof}]`);
        for (const m of bi.missing) console.log(`         − ${m}`);
        console.log(`  --- AD-WASTE ---`);
        console.log(aw.active
            ? `  AKTIV: ${aw.lossPct} % der bezahlten Klicks versanden (${aw.drivers.map(d => `${d.label} ${d.pct}%`).join(', ')})`
            : `  inaktiv (lossPct ${aw.lossPct} %${bi.adsActive ? '' : ', keine Anzeigen erkannt'})`);
        console.log(`  --- SCANNER-SCORE ---`);
        console.log(`  Opportunity ${opp.opportunity}/100 · Kaufsignal-Multiplikator ×${opp.buySignal.mult}`);
        console.log(`  Chips: ${opp.reasons.join(' · ')}`);
    } catch (e) {
        console.log(`\n${url}\n  FEHLER: ${e.message}`);
    }
}
