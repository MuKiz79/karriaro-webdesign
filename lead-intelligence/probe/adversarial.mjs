/**
 * Adversarial-Pass Top-5 (Matrix c) — jeder score-tragende Beleg wird
 * UNABHÄNGIG nachgeprüft, nicht aus adEvidence abgeschrieben:
 *
 *   · Anzeigen: eigener HTML-Fetch → GTM-Container-IDs → gtm.js laden →
 *     auf AW-/Conversion-Marker greppen (dieselbe Beweisklasse, eigener Weg)
 *   · paidTools: eigener HTML-Fetch, PRODUKTIVE Regexes aus site-evidence.js
 *   · Perf: ZWEITER unabhängiger PSI-Lauf, Toleranz ±10; strukturelle Flags
 *     (SSL/Viewport) müssen identisch sein
 *   · Kontaktweg/SSL: eigener Fetch (mailto/tel/https)
 *   · Screenshot: als JPEG nach probe/report/ dekodiert (Sichtprüfung folgt)
 *
 *   PSI_KEY=… node probe/adversarial.mjs <Stadt> [N]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dataDir, readJson, writeJson, reportDir, join } from './lib/io.mjs';
import { fetchPsi } from './lib/net.mjs';
import { loadPsiRecord } from './phases/02-psi.mjs';

const require = createRequire(import.meta.url);
// Produktive Scanner statt Kopien — die Probe prüft gegen dieselbe Beweisklasse.
const { scanPaidTools, scanContactPaths } = require('../../functions/lib/site-evidence.js');

const city = process.argv[2];
const N = Number(process.argv[3] || 5);
if (!city) { console.error('Stadt fehlt.'); process.exit(1); }
const dir = dataDir(city);
const scored = readJson(join(dir, '05-scored.json'));
const adev = readJson(join(dir, '03-adevidence.json'));
if (!scored || !adev) { console.error('Vorphasen fehlen.'); process.exit(1); }

async function fetchText(url, timeoutMs = 20000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            signal: ctl.signal, redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'de-DE,de;q=0.9' }
        });
        return { status: r.status, text: await r.text(), finalUrl: r.url };
    } catch (e) {
        return { status: 0, text: '', error: String(e?.message || e) };
    } finally { clearTimeout(t); }
}

const results = [];
for (const l of scored.leads.slice(0, N)) {
    const rang = scored.leads.indexOf(l) + 1;
    console.log(`\n── Rang ${rang}: ${l.name} (${l.domain}, Score ${l.opportunity}) ──`);
    const belege = [];

    // Eigener HTML-Fetch (unabhängig vom adEvidence-Cache).
    const html = await fetchText(l.websiteUri);
    const reachable = html.status >= 200 && html.status < 400 && html.text.length > 500;
    belege.push({ beleg: 'Seite erreichbar', quelle: 'eigener Fetch', ergebnis: reachable ? 'bestätigt' : `NICHT (${html.status} ${html.error || ''})`, ok: reachable });

    // 1) Anzeigen — GENAU die Beweisklasse prüfen, auf der der Score ruht
    // (adIntent.signals). Erste Fassung prüfte pauschal Google-Ads-Marker und
    // meldete für einen Meta-Pixel-Beleg fälschlich „nicht bestätigt" —
    // Verifier-Verdikte sind selbst Hypothesen (Playbook §11).
    if (l.buySignal?.proven && l.adIntent?.active) {
        const signals = l.adIntent.signals || [];
        // „Google Ads aktiv", „Google Display Network", „Microsoft Ads" — alles
        // Google-/Microsoft-seitige Werbe-Evidenz (Falle: zu enges /google ads/
        // ließ den Display-Fall UNGEPRÜFT durchrutschen).
        const wantsGoogle = signals.some(s => /google|microsoft/i.test(s));
        const wantsMeta = signals.some(s => /meta-pixel/i.test(s));

        if (wantsGoogle) {
            const gtmIds = [...new Set([...html.text.matchAll(/GTM-[A-Z0-9]{4,10}/g)].map(m => m[0]))];
            const awDirect = /AW-\d{6,}|googleads\.g\.doubleclick|doubleclick\.net|googlesyndication|gtag\('config',\s*'AW-/.test(html.text);
            let awInContainer = false, containerChecked = 0;
            for (const id of gtmIds.slice(0, 3)) {
                const c = await fetchText(`https://www.googletagmanager.com/gtm.js?id=${id}`);
                if (c.status === 200) {
                    containerChecked++;
                    if (/AW-\d{6,}|"conversion"|adWordsId|google_conversion|doubleclick\.net/.test(c.text)) awInContainer = true;
                }
            }
            let adsConfirmed = awDirect || awInContainer;
            let quelle = `eigener Fetch: ${gtmIds.length} GTM-Container (${gtmIds.join(', ') || '—'}), ${containerChecked} geladen`;
            let wie = awDirect ? 'AW-Tag im HTML' : 'Conversion-Marker im Container';
            // Display-Remarketing feuert oft erst aus JS/Consent heraus und ist im
            // rohen HTML unsichtbar — die Beweisklasse des Scans ist dort die
            // NETZWERK-Beobachtung (PSI). Unabhängige Bestätigung = frischer
            // PSI-Lauf, Requests auf doubleclick/googlesyndication greppen.
            if (!adsConfirmed) {
                try {
                    const psi2 = l._psi2 || await fetchPsi(l.websiteUri, process.env.PSI_KEY);
                    l._psi2 = psi2;
                    const reqs = (psi2?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
                    if (/doubleclick\.net|googlesyndication|googleadservices|googleads\./.test(reqs)) {
                        adsConfirmed = true; quelle = '2. PSI-Lauf, Netzwerk-Requests'; wie = 'Display-/Ads-Requests beim Seitenlauf';
                    }
                } catch { /* bleibt unbestätigt */ }
            }
            belege.push({
                beleg: '💸 Google Ads', quelle,
                ergebnis: adsConfirmed ? `bestätigt (${wie})` : 'NICHT unabhängig bestätigt',
                ok: adsConfirmed
            });
        }
        if (wantsMeta) {
            // Meta-Pixel: Loader im HTML ODER fbevents-Request im frischen PSI-Lauf
            // (Netzwerk-Beobachtung — dieselbe Klasse, aus der der Beleg stammt).
            const inHtml = /connect\.facebook\.net|fbevents\.js|fbq\(\s*['"]init/.test(html.text);
            let inPsi2 = false;
            if (!inHtml) {
                try {
                    const psi2 = await fetchPsi(l.websiteUri, process.env.PSI_KEY);
                    const reqs = (psi2?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
                    inPsi2 = /connect\.facebook\.net|fbevents/.test(reqs);
                    l._psi2 = psi2;   // fürs Perf-Median wiederverwenden
                } catch { /* bleibt unbestätigt */ }
            }
            belege.push({
                beleg: '💸 Meta-Pixel', quelle: inHtml ? 'Loader im eigenen HTML-Fetch' : '2. PSI-Lauf, Netzwerk-Requests',
                ergebnis: (inHtml || inPsi2) ? 'bestätigt' : 'NICHT unabhängig bestätigt',
                ok: inHtml || inPsi2
            });
        }
    }

    // 2) paidTools — produktive Regexes auf dem EIGENEN Fetch.
    const evTools = adev.adevMap[l.domain]?.paidTools?.keys || [];
    if (evTools.length) {
        const own = scanPaidTools(html.text);
        const confirmed = evTools.filter(k => own.keys.includes(k));
        belege.push({
            beleg: `🧾 bezahlte Werkzeuge (${evTools.join(', ')})`, quelle: 'eigener Fetch + produktive Regexes',
            ergebnis: confirmed.length === evTools.length ? 'bestätigt' : `teilweise: ${confirmed.join(', ') || 'keins'} von ${evTools.join(', ')}`,
            ok: confirmed.length > 0
        });
    }

    // 3) Perf — MEDIAN aus drei unabhängigen PSI-Läufen. Ein Einzellauf streut
    // regelmäßig >10 Punkte (bekannte Lighthouse-Varianz); ein Δ11 aus EINEM
    // Lauf ist Rauschen, kein Widerlegen. Der Median von drei ist belastbar.
    if (l.perfKnown) {
        try {
            const runs = [];
            if (l._psi2) runs.push(l._psi2);
            while (runs.length < 3) runs.push(await fetchPsi(l.websiteUri, process.env.PSI_KEY));
            const perfs = runs.map(p => Math.round((p?.lighthouseResult?.categories?.performance?.score ?? NaN) * 100)).filter(Number.isFinite).sort((a, b) => a - b);
            const median = perfs[Math.floor(perfs.length / 2)];
            const delta = Math.abs(median - l.ws.perf);
            const httpsSame = (runs[0]?.lighthouseResult?.finalUrl || '').startsWith('https:') === !!l.ws.isHttps;
            // Score-relevant sind die BÄNDER aus opportunity.js (<40/+14, <55/+9,
            // <70/+5) — nicht der Punktwert. Ein Median im selben Band bestätigt
            // den Beleg auch dann, wenn der Punktwert streut.
            const band = v => (v < 40 ? '<40' : v < 55 ? '40-54' : v < 70 ? '55-69' : '≥70');
            const sameBand = band(median) === band(l.ws.perf);
            belege.push({
                beleg: `Perf ${l.ws.perf}`, quelle: `3 PSI-Läufe: [${perfs.join(', ')}], Median ${median}`,
                ergebnis: delta <= 10 ? `bestätigt (Δ${delta} zum Median)`
                    : sameBand ? `bestätigt (streut, aber Band ${band(median)} identisch)`
                    : `Band-Wechsel ${band(l.ws.perf)} → ${band(median)} (streut ${perfs[0]}–${perfs.at(-1)})`,
                ok: (delta <= 10 || sameBand) && httpsSame
            });
        } catch (e) {
            belege.push({ beleg: `Perf ${l.ws.perf}`, quelle: 'PSI-Läufe', ergebnis: `nicht prüfbar (${e.message})`, ok: null });
        }
    }

    // 4) SSL + Kontaktweg — eigener Fetch.
    if (l.ws?.isHttps === false) {
        const httpsTry = await fetchText(l.websiteUri.replace(/^http:/, 'https:'), 10000);
        const noSsl = httpsTry.status === 0 || httpsTry.status >= 400;
        belege.push({ beleg: 'kein SSL', quelle: `https-Versuch: ${httpsTry.status || httpsTry.error}`, ergebnis: noSsl ? 'bestätigt' : 'WIDERLEGT (https antwortet)', ok: noSsl });
    }
    const cpChip = (l.reasons || []).includes('✉ kein Kontaktweg gefunden');
    if (cpChip) {
        const own = scanContactPaths(html.text);
        const none = !own.hasMailto && !own.hasTel && !own.hasImpressumLink;
        belege.push({ beleg: '✉ kein Kontaktweg', quelle: 'eigener Fetch + produktiver Scanner', ergebnis: none ? 'bestätigt' : `WIDERLEGT (${['hasMailto', 'hasTel', 'hasImpressumLink'].filter(k => own[k]).join(', ')})`, ok: none });
    }

    // 5) Screenshot dekodieren für Sichtprüfung.
    const rec = loadPsiRecord(dir, l.domain);
    let shotFile = null;
    if (rec?.screenshot?.startsWith('data:image')) {
        const b64 = rec.screenshot.split(',')[1];
        shotFile = join(reportDir(), `${city.toLowerCase()}-rang${rang}-${l.domain.replace(/[^a-z0-9.-]/gi, '_')}.jpg`);
        writeFileSync(shotFile, Buffer.from(b64, 'base64'));
    }

    const bestaetigt = belege.filter(b => b.ok === true).length;
    const widerlegt = belege.filter(b => b.ok === false).length;
    for (const b of belege) console.log(`   ${b.ok === true ? '✔' : b.ok === false ? '✘' : '·'} ${b.beleg} — ${b.ergebnis}`);
    results.push({ rang, name: l.name, domain: l.domain, score: l.opportunity, belege, bestaetigt, widerlegt, screenshot: shotFile, pass: bestaetigt >= 2 && widerlegt === 0 });
}

writeJson(join(dir, '07-adversarial.json'), { city, checkedAt: new Date().toISOString(), results });
const passed = results.filter(r => r.pass).length;
console.log(`\nAdversarial: ${passed}/${results.length} bestanden (≥2 bestätigte Belege, 0 widerlegte)`);
