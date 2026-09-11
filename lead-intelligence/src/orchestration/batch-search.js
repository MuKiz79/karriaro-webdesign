/**
 * Batch Search — Prospecting-Tool: Screenshot-First
 *
 * "Zeig mir die schlechtesten Websites von Friseuren in Stuttgart
 *  die trotzdem ein gutes Geschäft haben."
 *
 * Phase 1: 50+ Kandidaten sammeln (alle Stadtteile, parallel)
 * Phase 2: Schnellfilter (Enterprise, Konkurrenz, zu klein, schon bekannt)
 * Phase 3: Für JEDEN Screenshot holen + Quick-Score (2s statt 30s)
 * Phase 4: Sortieren: Schlechteste Website + bestes Geschäft = oben
 * Phase 5: Ergebnis: Visuell, Screenshot-Cards, der Mensch entscheidet
 *
 * Volle Analyse (Bayesian, BFSG, Signal Stacking) erst bei Klick auf "Einzel-Analyse"
 */
import { state } from '../state.js';
import { config } from '../config.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces } from '../api/places.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { checkEnterpriseDB } from '../priors/enterprise-db.js';
import { saveLead } from '../crm/leads.js';
import { showToast } from '../ui/render-components.js';
import { saveFeedback } from '../learning/score-feedback.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { STADTTEILE } from '../data/stadtteile.js';
import { getCachedPlaces, setCachedPlaces, countUncached, deriveReviewRecency } from '../api/scan-cache.js';
import { getAlreadyKnown } from '../crm/known.js';
import { saveSearch } from '../crm/saved-searches.js';
import { quickReasons } from '../scoring/quick-reasons.js';
import { computeOpportunity } from '../scoring/opportunity.js';
import { analyzeTechAge } from '../analysis/tech-age.js';
import { seasonalTriggerFor } from '../analysis/trigger-events.js';
import { zeigeKostenModal } from './scanner.js';
import { escapeHtml } from '../lib/escape-html.js';

// Kennung der Score-Formel in gespeicherten Ergebnissen. Ältere Läufe (ohne
// Kennung) trugen die Summen-Formel mit Badness bis 200 — ihre Karten behalten
// die alte Beschriftung, damit keine Zahl falsch etikettiert wird.
const SCORE_MODELL = 'opportunity';

// Baukasten aus URL erkennbar
const BAUKASTEN_URL = [
    { pattern: /\.wixsite\.com|static\.wixstatic/i, name: 'Wix', penalty: 30 },
    { pattern: /\.jimdo\.|jimdofree\.|jimdosite\./i, name: 'Jimdo', penalty: 30 },
    { pattern: /\.squarespace\.com/i, name: 'Squarespace', penalty: 20 },
    { pattern: /\.weebly\.com/i, name: 'Weebly', penalty: 25 },
    { pattern: /\.webnode\./i, name: 'Webnode', penalty: 25 },
    { pattern: /\.wordpress\.com/i, name: 'WordPress.com', penalty: 20 },
    { pattern: /\.strato\.|\.strato-hosting/i, name: 'Strato', penalty: 15 },
    { pattern: /\.1und1\.de|\.ionos\./i, name: '1&1/IONOS', penalty: 15 },
];

// Stadtteil-Listen liegen zentral in data/stadtteile.js (auch vom Scanner genutzt).

export async function runBatchSearch() {
    const query = document.getElementById('batch-query').value.trim();
    if (!query) return;
    // 2026-08-16 (Founder-Stolperstelle, live): „Hamburg" allein löste eine
    // BEZAHLTE Places-Suche aus und endete in der nichtssagenden Meldung
    // „1 gefunden, alle bereits bekannt oder gefiltert". Diese Kachel braucht
    // Branche + Ort — ein einzelnes Wort kann das nie sein. VOR dem API-Call
    // abfangen und sagen, was fehlt (und wo die Stadt-Suche wirklich wohnt).
    if (!/\s/.test(query)) {
        showError(`„${query}" allein reicht nicht — diese Suche braucht Branche + Ort, z. B. „Friseur ${query}". Eine ganze Stadt quer durch alle Branchen prüft die Kachel „Eine Region scannen".`);
        return;
    }
    if (!config.fnUrl) { showError('Cloud Function URL fehlt.'); return; }
    const max = parseInt(document.getElementById('batch-max').value);

    const parts = query.trim().split(/\s+/);
    const city = parts.length >= 2 ? parts.slice(1).join(' ') : '';
    const branch = parts[0] || query;

    // 2026-09-10: Kostenangabe VOR dem bezahlten Places-Aufruf — wie im Region-Scan.
    // Die Stadtteile sind jetzt fest (die ersten fünf der Liste) statt zufällig:
    // nur so trifft ein Wiederholungslauf den Cache und die Kostenangabe stimmt.
    const stadtteile = city ? (STADTTEILE[city.toLowerCase()] || []).slice(0, 5) : [];
    const nurStadt = [query];
    const mitStadtteilen = [query, ...stadtteile.map(s => `${branch} ${city} ${s}`)];
    const optionen = [{ label: 'Nur die Stadt', suchen: 1, neu: countUncached(nurStadt), queries: nurStadt }];
    if (stadtteile.length) {
        optionen.push({ label: `Stadt + ${stadtteile.length} Stadtteile`, suchen: mitStadtteilen.length, neu: countUncached(mitStadtteilen), queries: mitStadtteilen });
    }
    const wahl = await zeigeKostenModal({
        eyebrow: `Stadt-Suche · ${query}`,
        titel: 'Wie breit soll gesucht werden?',
        sub: 'Jede neue Google-Suche kostet ~0,04 $. Bereits gecachte Suchen sind gratis, PageSpeed ist immer kostenlos.',
        optionen,
        empfohlen: optionen.length - 1
    });
    if (wahl === null) return;
    const queries = optionen[wahl].queries;

    state.aborted = false;
    document.getElementById('btn-batch').disabled = true;

    // ══════════════════════════════════════
    // PHASE 1: Kandidaten sammeln (parallel, gewählte Gebiete)
    // ══════════════════════════════════════
    showLoading('Sammle Kandidaten (bitte Tab offen lassen)...');

    // Concurrency-Limit 2: schützt Places-API-Quota. Cache-first (geteilter Scan-Cache):
    // bereits gesuchte Gebiete sind gratis — auch über Scanner/Batch hinweg.
    let allPlaces = [];
    try {
        const results = await runWithConcurrency(queries, 2, async q => {
            const cached = getCachedPlaces(q);
            if (cached) return { places: cached };
            const r = await searchPlaces(q, 10).catch(e => {
                console.warn(`searchPlaces(${q}) fehlgeschlagen:`, e?.message || e);
                return { places: [] };
            });
            if (r?.places?.length) {
                setCachedPlaces(q, r.places);
                // Frische Treffer tragen reviews[], aber noch keine reviewRecency —
                // hier ableiten, damit frisch und gecacht gleich gescort werden.
                for (const fp of r.places) { if (!fp.reviewRecency) fp.reviewRecency = deriveReviewRecency(fp.reviews); }
            }
            return r;
        });
        for (const r of results) if (r?.places) allPlaces.push(...r.places);
    } catch { cleanup(); showError('Suche fehlgeschlagen.'); return; }

    // ══════════════════════════════════════
    // PHASE 2: Schnellfilter
    // ══════════════════════════════════════
    const known = getAlreadyKnown();
    const seen = new Set();
    const candidates = [];
    let filteredCount = 0;

    for (const p of allPlaces) {
        if (!p.websiteUri || p.businessStatus === 'CLOSED_PERMANENTLY') continue;
        let domain;
        try { domain = new URL(p.websiteUri).hostname.replace('www.', ''); } catch { continue; }
        if (seen.has(domain)) continue;
        seen.add(domain);
        if (known.has(domain)) { filteredCount++; continue; }

        // Name + Typ mitgeben — sonst bleibt die Kammer-/Innungs-/Bildungsträger-
        // Gruppe auf Domain-Muster beschränkt und übersieht Markennamen.
        const db = checkEnterpriseDB(domain, { name: p.displayName?.text, primaryType: p.primaryType });
        if (db.isCompetitor || db.isEnterprise) { filteredCount++; continue; }

        const reviews = p.userRatingCount || 0;
        if (reviews < 3) { filteredCount++; continue; }

        // Baukasten aus URL?
        let baukasten = null;
        for (const bk of BAUKASTEN_URL) {
            if (bk.pattern.test(p.websiteUri)) { baukasten = bk; break; }
        }

        candidates.push({
            place: p, domain, url: p.websiteUri, reviews,
            rating: p.rating || 0,
            name: p.displayName?.text || domain,
            type: p.primaryTypeDisplayName?.text || '',
            baukasten,
            // Business-Stärke: Reviews × Rating (normalisiert)
            businessStrength: Math.min(100, Math.round(Math.log2(Math.max(1, reviews)) * (p.rating || 3) * 3))
        });
    }

    // Die Meldung muss sagen, WAS aussortiert wurde — „gefiltert" allein ließ
    // den Founder ratlos zurück (2026-08-16).
    if (!candidates.length) {
        cleanup();
        showError(`${allPlaces.length} Treffer, aber keiner übrig: ${filteredCount} aussortiert (bereits gespeichert/abgelehnt, Kette/Konzern oder unter 3 Bewertungen), der Rest ohne Website. Tipp: andere Branche versuchen — oder „Eine Region scannen" für den Überblick.`);
        return;
    }

    // ══════════════════════════════════════
    // PHASE 3: PageSpeed + Screenshot für ALLE (schnell, 2er-Batches)
    // ══════════════════════════════════════
    // Limitiere auf max 20 Kandidaten für die PageSpeed-Analyse
    // Sortiere vorher: Baukasten + viele Reviews zuerst
    candidates.sort((a, b) => (b.baukasten ? 20 : 0) + b.businessStrength - ((a.baukasten ? 20 : 0) + a.businessStrength));
    const toScan = candidates.slice(0, Math.min(candidates.length, Math.max(max, 15)));

    const results = [];
    for (let i = 0; i < toScan.length; i += 3) {
        if (state.aborted) break;
        const batch = toScan.slice(i, i + 3);
        showProgress(Math.round(((i + batch.length) / toScan.length) * 100),
            `${Math.min(i + batch.length, toScan.length)}/${toScan.length}: ${batch.map(c => c.name).join(', ')}...`);

        const br = await Promise.all(batch.map(async (c) => {
            try {
                const psi = await fetchPageSpeed(c.url);
                const ws = extractWebsiteScore(psi);
                const tech = detectTech(psi);
                const screenshot = psi?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;

                // 2026-09-10: dieselbe transparente Formel wie der Region-Scan
                // (scoring/opportunity.js) statt einer eigenen Summe. Die alte
                // Formel gewichtete Labor-Tempo mit bis zu +100 und kannte weder
                // Liveness noch Deckel — dieselbe Seite bekam in beiden Werkzeugen
                // verschiedene Zahlen. computeOpportunity behandelt fehlende Werte
                // neutral (perfKnown/seoKnown, fehlende Bewertungs-Frische = 1.0).
                const techAge = analyzeTechAge(tech, {});
                const place = c.place?.reviewRecency ? c.place : { ...c.place, reviewRecency: deriveReviewRecency(c.place?.reviews) };
                const opp = computeOpportunity({
                    ws, tech, place, websiteUri: c.url, techAge,
                    reviewRecency: place.reviewRecency,
                    seasonal: seasonalTriggerFor(place.primaryType)
                });

                return {
                    ...c,
                    scoreModell: SCORE_MODELL,
                    perf: ws.perf, seo: ws.seo, a11y: ws.a11y,
                    // Mess-Lücken mitführen: quickReasons darf aus einer Lücke
                    // keinen Mangel machen, und der Score tut es oben auch nicht.
                    perfKnown: ws.perfKnown, seoKnown: ws.seoKnown, a11yKnown: ws.a11yKnown,
                    isHttps: ws.isHttps,
                    viewportMissing: ws.viewportMissing,
                    // CrUX-Felddaten (F16): entscheidet, ob Tempo überhaupt ein
                    // Argument ist — steckt in derselben PSI-Antwort, kostet nichts.
                    crux: ws.crux || null,
                    cms: tech.cms || c.baukasten?.name || '',
                    // Version mitführen: quickReasons belegt damit ein Support-Ende.
                    version: tech.version || null,
                    isBaukasten: tech.isBaukasten || !!c.baukasten,
                    screenshot,
                    badnessScore: opp.badnessScore,
                    businessStrength: opp.businessStrength,
                    opportunity: opp.opportunity,
                    reasons: opp.reasons,
                    hardStructural: opp.hardStructural,
                    scoreCap: opp.scoreCap,
                    looksAlreadyGood: opp.looksAlreadyGood,
                    anlaesse: opp.anlaesse
                };
            } catch (e) {
                console.warn(`Stadt-Suche: Analyse von ${c.domain} fehlgeschlagen:`, e?.message || e);
                return null;
            }
        }));
        results.push(...br.filter(Boolean));
        if (i + 3 < toScan.length && !state.aborted) await delay(300);
    }

    hideProgress();
    document.getElementById('btn-batch').disabled = false;
    if (state.aborted || !results.length) return;

    // ══════════════════════════════════════
    // PHASE 4: Sortiere nach Opportunity (schlechteste Website + bestes Geschäft = oben)
    // ══════════════════════════════════════
    results.sort((a, b) => b.opportunity - a.opportunity);

    state._batchResults = results;
    state._batchQuery = query;
    state._batchStats = { total: allPlaces.length, unique: seen.size, filtered: filteredCount, scanned: toScan.length };

    // Ergebnis persistieren (Reopen ohne API). Screenshots (grosse base64-data-URIs)
    // werden hier ABGESTREIFT — sonst sprengt ein Batch-Lauf den Size-Guard; beim
    // Reopen greift der bestehende 'Kein Screenshot'-Fallback. Stats mitspeichern,
    // weil renderProspectingResults state._batchStats fuer die Kopfzeile liest.
    if (results.length) {
        try {
            saveSearch({
                kind: 'batch',
                label: query,
                query,
                payload: { results: results.map(({ screenshot, ...r }) => r), query, stats: state._batchStats }
            });
        } catch { /* Persistenz darf die Batch-Suche nie abbrechen */ }
    }

    renderProspectingResults(query, results);

    // Benachrichtige wenn Tab im Hintergrund
    const origTitle = document.title;
    document.title = `✅ ${results.length} Leads gefunden`;
    setTimeout(() => { document.title = origTitle; }, 5000);
    if (Notification?.permission === 'granted') {
        new Notification('Lead Intelligence', { body: `${results.length} Leads für "${query}" gefunden` });
    }
}

/**
 * Oeffnet eine gespeicherte Stadt-Suche WIEDER — ohne Places/PSI-Call.
 * Stellt den Batch-State wieder her und ruft renderProspectingResults; Sort-Buttons,
 * Einzel-Analyse, CSV, CRM-Save und Feedback werden im Render frisch verdrahtet.
 * (Screenshots wurden beim Speichern entfernt → Cards zeigen "Kein Screenshot".)
 * @param {{payload:{results:Array, query?:string, stats?:object}}} entry
 * @returns {boolean} ob geoeffnet wurde
 */
export function reopenBatch(entry) {
    if (!entry || !entry.payload || !Array.isArray(entry.payload.results)) return false;
    const { results, query = '', stats = {} } = entry.payload;
    state._batchResults = results;
    state._batchQuery = query;
    state._batchStats = stats;                // renderProspectingResults liest state._batchStats
    renderProspectingResults(query, results);
    return true;
}

// ══════════════════════════════════════
// VISUELLES ERGEBNIS: Screenshot-Cards
// ══════════════════════════════════════

/**
 * „Warum kommt die Seite in Frage?" — die Belege unter der Prozentzahl.
 *
 * Founder-Auftrag 2026-08-17: drei Zahlen ohne Beleg zwingen dazu, jede Seite
 * selbst zu öffnen. Die Belege stehen deshalb IN der Karte, mit dem gemessenen
 * Wert, den das Anschreiben zitieren kann — und mit dem, was dagegen spricht.
 */
function renderWhy(r) {
    const { belege, fazit, ungeprueft } = quickReasons(r);
    if (!belege.length) return '';
    const chips = belege
        .map(b => `<span class="prospect-why-chip why-${b.kind}">${escapeHtml(b.text)}</span>`)
        .join('');
    return `<div class="prospect-why">
        <div class="prospect-why-chips">${chips}</div>
        <div class="prospect-why-fazit why-fazit-${fazit.stufe}">${escapeHtml(fazit.text)}</div>
        <div class="prospect-why-note">Schnellprüfung — ungeprüft bleibt: ${escapeHtml(ungeprueft.join(' · '))}. Das sieht erst die Einzel-Analyse.</div>
    </div>`;
}

// ⚠️ #batch-results wird nie ersetzt, nur sein innerHTML. Jede Sortierung rief
// renderProspectingResults erneut auf und band die Klick-Handler ein weiteres
// Mal an — nach drei Sortierklicks speicherte ein „Im CRM" viermal. Muster wie
// in scanner.js (wsController).
let batchController = null;

function renderProspectingResults(query, results) {
    const stats = state._batchStats || {};
    batchController?.abort();
    batchController = new AbortController();
    const signal = batchController.signal;

    let html = `<div class="crm-header">
        <h2 class="crm-title">Leads für „${escapeHtml(query)}“</h2>
        <div class="crm-actions-top">
            <button class="crm-btn-export" id="btn-export-csv">CSV Export</button>
            <button class="crm-btn-export" id="btn-save-batch" style="background:var(--text);color:#fff">Alle speichern</button>
        </div>
    </div>`;

    html += `<div class="metric-desc" style="margin-bottom:16px">${stats.total} gefunden · ${stats.filtered} gefiltert · ${stats.scanned} gescannt · <strong>${results.length} Leads</strong></div>`;

    // Sort Buttons
    html += `<div class="crm-filters" style="margin-bottom:16px">
        <button class="crm-filter-btn active" data-sort="opportunity">Größte Chance</button>
        <button class="crm-filter-btn" data-sort="badness">Schlechteste Website</button>
        <button class="crm-filter-btn" data-sort="business">Stärkstes Geschäft</button>
        <button class="crm-filter-btn" data-sort="reviews">Meiste Bewertungen</button>
    </div>`;

    // Lead Cards mit Screenshots
    html += `<div class="prospect-grid">`;
    for (const r of results) {
        const neu = r.scoreModell === SCORE_MODELL;
        const oppColor = neu
            ? (r.opportunity >= 70 ? 'var(--green)' : r.opportunity >= 50 ? 'var(--orange)' : 'var(--muted)')
            : (r.opportunity >= 80 ? 'var(--green)' : r.opportunity >= 50 ? 'var(--orange)' : 'var(--muted)');
        const perfColor = r.perf >= 75 ? 'good' : r.perf >= 50 ? 'ok' : 'bad';
        const e = escapeHtml;
        // Die neue Formel ist ein Score 0–100 (HOT ≥ 70), keine Wahrscheinlichkeit —
        // „% Chance" hätte eine Präzision behauptet, die es nicht gibt.
        const scoreZeile = neu
            ? `<span style="color:${oppColor};font-weight:700">Score ${r.opportunity}</span>
                    <span class="metric-desc">Website-Mängel ${r.badnessScore}/100 · Geschäft ${r.businessStrength}/100${r.scoreCap === 69 ? ' · gedeckelt (kein hartes Strukturzeichen)' : ''}</span>`
            : `<span style="color:${oppColor};font-weight:700">${r.opportunity}% Chance</span>
                    <span class="metric-desc">Website: ${r.badnessScore}/200 schlecht · Geschäft: ${r.businessStrength}/100 stark</span>`;

        html += `<div class="prospect-card anim-in">
            <div class="prospect-screenshot">
                ${r.screenshot ? `<img src="${e(r.screenshot)}" alt="${e(r.name)}" loading="lazy">` : '<div class="prospect-no-screenshot">Kein Screenshot</div>'}
            </div>
            <div class="prospect-info">
                <div class="prospect-name">${e(r.name)}</div>
                <div class="prospect-meta">
                    <a href="${e(r.url)}" target="_blank" rel="noopener">${e(r.domain)}</a> · ${e(r.type || '')}
                </div>
                <div class="prospect-stats">
                    <span>★ ${r.rating || '—'}</span>
                    <span>${r.reviews} Bew.</span>
                    <span class="${perfColor}">${r.perfKnown === false ? 'Tempo nicht messbar' : `Perf ${r.perf}`}</span>
                    ${r.isBaukasten ? `<span class="bad">${e(r.cms)}</span>` : ''}
                    ${r.isHttps === false ? '<span class="bad">Kein SSL</span>' : ''}
                </div>
                <div class="prospect-opportunity">
                    ${scoreZeile}
                </div>
                ${renderWhy(r)}
                <div class="prospect-actions">
                    <a href="#" class="crm-reanalyze btn-primary" data-url="${e(r.url)}" style="font-size:12px;padding:6px 14px">Einzel-Analyse</a>
                    <button class="crm-btn-export" data-save-domain="${e(r.domain)}" data-save-url="${e(r.url)}" data-save-name="${e(r.name)}" data-save-type="${e(r.type)}" data-save-score="${r.opportunity}" data-save-perf="${r.perf}" data-save-reviews="${r.reviews}">Im CRM</button>
                    <button class="fb-btn fb-correct" data-fb-domain="${e(r.domain)}" data-fb-score="${r.opportunity}" data-fb-action="correct" title="Guter Lead">✓</button>
                    <select class="fb-skip-select" data-fb-domain="${e(r.domain)}" data-fb-score="${r.opportunity}">
                        <option value="">Skip</option>
                        <option value="too_modern">Website gut</option>
                        <option value="too_big">Zu groß</option>
                        <option value="too_small">Zu klein</option>
                        <option value="no_need">Kein Bedarf</option>
                        <option value="regional">Außerhalb Region</option>
                    </select>
                </div>
            </div>
        </div>`;
    }
    html += `</div>`;

    const el = document.getElementById('batch-results');
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth' });

    // ── Events ──
    // Sort
    el.querySelectorAll('[data-sort]').forEach(btn => {
        btn.addEventListener('click', () => {
            el.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const key = btn.dataset.sort;
            const sorted = [...results];
            if (key === 'opportunity') sorted.sort((a, b) => b.opportunity - a.opportunity);
            else if (key === 'badness') sorted.sort((a, b) => b.badnessScore - a.badnessScore);
            else if (key === 'business') sorted.sort((a, b) => b.businessStrength - a.businessStrength);
            else if (key === 'reviews') sorted.sort((a, b) => b.reviews - a.reviews);
            renderProspectingResults(query, sorted);
        });
    });

    // Einzel-Analyse
    el.addEventListener('click', (e) => {
        const link = e.target.closest('.crm-reanalyze');
        if (!link) return;
        e.preventDefault();
        el.classList.add('hidden');
        document.getElementById('url-input').value = link.dataset.url;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="single"]')?.classList.add('active');
        document.getElementById('input-single')?.classList.remove('hidden');
        document.getElementById('input-batch')?.classList.add('hidden');
        document.getElementById('input-scanner')?.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, { signal });

    // CRM Save (einzeln)
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-save-domain]');
        if (!btn) return;
        await saveLead(btn.dataset.saveDomain, btn.dataset.saveUrl, {
            name: btn.dataset.saveName, type: btn.dataset.saveType,
            leadScore: parseInt(btn.dataset.saveScore), perf: parseInt(btn.dataset.savePerf),
            reviews: parseInt(btn.dataset.saveReviews)
        });
        btn.textContent = '✓'; btn.disabled = true;
        showToast(`${btn.dataset.saveDomain} gespeichert`);
    }, { signal });

    // Batch Save
    document.getElementById('btn-save-batch')?.addEventListener('click', async function() {
        for (const r of results) await saveLead(r.domain, r.url, { name: r.name, type: r.type, leadScore: r.opportunity, perf: r.perf, reviews: r.reviews, cms: r.cms, isBaukasten: r.isBaukasten });
        this.textContent = 'Gespeichert ✓'; this.disabled = true;
        showToast(`${results.length} Leads gespeichert`);
    });

    // CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
        const neu = results.some(r => r.scoreModell === SCORE_MODELL);
        const h = ['Name','Domain','URL','Branche','Sterne','Bewertungen','Performance','CMS', neu ? 'Score' : 'Chance', neu ? 'Website-Mängel (0-100)' : 'Website-Score', 'Geschäfts-Stärke'];
        const rows = results.map(r => [r.name,r.domain,r.url,r.type,r.rating,r.reviews,r.perf,r.cms,r.opportunity,r.badnessScore,r.businessStrength]);
        const csv = [h,...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(';')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
        a.download = `leads-${query.replace(/\s/g,'-')}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
        showToast('Exportiert');
    });

    // Feedback
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-fb-action="correct"]'); if (!b) return; saveFeedback(b.dataset.fbDomain, parseInt(b.dataset.fbScore), 'correct', {branch:'batch'}); b.classList.add('active'); showToast(`${b.dataset.fbDomain}: ✓`); }, { signal });
    el.addEventListener('change', (e) => { const s = e.target.closest('.fb-skip-select'); if (!s||!s.value) return; saveFeedback(s.dataset.fbDomain, parseInt(s.dataset.fbScore), 'too_high', {branch:'batch'}, s.options[s.selectedIndex].text, s.value); s.style.color='var(--red)'; s.disabled=true; showToast(`${s.dataset.fbDomain}: ${s.options[s.selectedIndex].text}`); }, { signal });
}

function cleanup() { hideLoading(); hideProgress(); document.getElementById('btn-batch').disabled = false; }
function showLoading(t) { document.getElementById('loading-text').textContent = t; document.getElementById('loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }
function showProgress(pct, t) { document.getElementById('progress').classList.remove('hidden'); document.getElementById('progress-fill').style.width = pct+'%'; document.getElementById('progress-text').textContent = t; }
function hideProgress() { document.getElementById('progress').classList.add('hidden'); }
function showError(t) { document.getElementById('error-text').textContent = t; document.getElementById('error').classList.remove('hidden'); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
