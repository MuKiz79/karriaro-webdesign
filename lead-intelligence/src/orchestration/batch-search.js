/**
 * Batch Search — Prospecting-Tool: Screenshot-First
 *
 * "Zeig mir die schlechtesten Websites von Friseuren in Köln
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
import { getCachedPlaces, setCachedPlaces } from '../api/scan-cache.js';
import { getAlreadyKnown } from '../crm/known.js';
import { saveSearch } from '../crm/saved-searches.js';

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
    if (!config.fnUrl) { showError('Cloud Function URL fehlt.'); return; }
    state.aborted = false;
    document.getElementById('btn-batch').disabled = true;
    const max = parseInt(document.getElementById('batch-max').value);

    // ══════════════════════════════════════
    // PHASE 1: Kandidaten sammeln (parallel, alle Stadtteile)
    // ══════════════════════════════════════
    showLoading('Sammle Kandidaten (bitte Tab offen lassen)...');

    const parts = query.trim().split(/\s+/);
    const city = parts.length >= 2 ? parts.slice(1).join(' ') : '';
    const branch = parts[0] || query;

    const queries = [query];
    if (city) {
        // Kopie vor sort() — STADTTEILE ist geteilter Modul-Zustand (auch vom Scanner genutzt).
        const st = [...(STADTTEILE[city.toLowerCase()] || [])].sort(() => Math.random() - 0.5).slice(0, 5);
        for (const s of st) queries.push(`${branch} ${city} ${s}`);
    }

    // Concurrency-Limit 2: schützt Places-API-Quota. Cache-first (geteilter Scan-Cache):
    // bereits gesuchte Gebiete sind gratis — auch über Scanner/Batch hinweg.
    let allPlaces = [];
    try {
        const results = await runWithConcurrency(queries, 2, async q => {
            const cached = getCachedPlaces(q);
            if (cached) return { places: cached };
            const r = await searchPlaces(q, 10).catch(() => ({ places: [] }));
            if (r?.places?.length) setCachedPlaces(q, r.places);
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

        const db = checkEnterpriseDB(domain);
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

    if (!candidates.length) { cleanup(); showError(`${allPlaces.length} gefunden, alle bereits bekannt oder gefiltert.`); return; }

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

                // Quick-Score: Wie schlecht ist die Website? (0 = perfekt, 100 = katastrophal)
                let badnessScore = 0;
                badnessScore += Math.max(0, 100 - ws.perf);           // Perf 30 → +70
                badnessScore += Math.max(0, 100 - ws.seo) * 0.3;     // SEO 40 → +18
                badnessScore += Math.max(0, 100 - ws.a11y) * 0.5;    // A11y 50 → +25
                if (!ws.isHttps) badnessScore += 30;
                if (ws.viewportMissing) badnessScore += 25;
                if (tech.isBaukasten) badnessScore += 20;
                if (c.baukasten) badnessScore += 15; // URL-Baukasten Bonus

                // Opportunity = Wie schlecht die Website × Wie gut das Geschäft
                const opportunity = Math.round(badnessScore * 0.6 + c.businessStrength * 0.4);

                return {
                    ...c,
                    perf: ws.perf, seo: ws.seo, a11y: ws.a11y,
                    isHttps: ws.isHttps,
                    cms: tech.cms || c.baukasten?.name || '',
                    isBaukasten: tech.isBaukasten || !!c.baukasten,
                    screenshot,
                    badnessScore: Math.round(badnessScore),
                    opportunity
                };
            } catch { return null; }
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

function renderProspectingResults(query, results) {
    const stats = state._batchStats || {};

    let html = `<div class="crm-header">
        <h2 class="crm-title">Leads für "${query}"</h2>
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
        const oppColor = r.opportunity >= 80 ? 'var(--green)' : r.opportunity >= 50 ? 'var(--orange)' : 'var(--muted)';
        const perfColor = r.perf >= 75 ? 'good' : r.perf >= 50 ? 'ok' : 'bad';

        html += `<div class="prospect-card anim-in">
            <div class="prospect-screenshot">
                ${r.screenshot ? `<img src="${r.screenshot}" alt="${r.name}" loading="lazy">` : '<div class="prospect-no-screenshot">Kein Screenshot</div>'}
            </div>
            <div class="prospect-info">
                <div class="prospect-name">${r.name}</div>
                <div class="prospect-meta">
                    <a href="${r.url}" target="_blank">${r.domain}</a> · ${r.type || ''}
                </div>
                <div class="prospect-stats">
                    <span>★ ${r.rating || '—'}</span>
                    <span>${r.reviews} Bew.</span>
                    <span class="${perfColor}">Perf ${r.perf}</span>
                    ${r.isBaukasten ? `<span class="bad">${r.cms}</span>` : ''}
                    ${!r.isHttps ? '<span class="bad">Kein SSL</span>' : ''}
                </div>
                <div class="prospect-opportunity">
                    <span style="color:${oppColor};font-weight:700">${r.opportunity}% Chance</span>
                    <span class="metric-desc">Website: ${r.badnessScore}/200 schlecht · Geschäft: ${r.businessStrength}/100 stark</span>
                </div>
                <div class="prospect-actions">
                    <a href="#" class="crm-reanalyze btn-primary" data-url="${r.url}" style="font-size:12px;padding:6px 14px">Einzel-Analyse</a>
                    <button class="crm-btn-export" data-save-domain="${r.domain}" data-save-url="${r.url}" data-save-name="${r.name}" data-save-type="${r.type}" data-save-score="${r.opportunity}" data-save-perf="${r.perf}" data-save-reviews="${r.reviews}">Im CRM</button>
                    <button class="fb-btn fb-correct" data-fb-domain="${r.domain}" data-fb-score="${r.opportunity}" data-fb-action="correct" title="Guter Lead">✓</button>
                    <select class="fb-skip-select" data-fb-domain="${r.domain}" data-fb-score="${r.opportunity}">
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
    });

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
    });

    // Batch Save
    document.getElementById('btn-save-batch')?.addEventListener('click', async function() {
        for (const r of results) await saveLead(r.domain, r.url, { name: r.name, type: r.type, leadScore: r.opportunity, perf: r.perf, reviews: r.reviews, cms: r.cms, isBaukasten: r.isBaukasten });
        this.textContent = 'Gespeichert ✓'; this.disabled = true;
        showToast(`${results.length} Leads gespeichert`);
    });

    // CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
        const h = ['Name','Domain','URL','Branche','Sterne','Bewertungen','Performance','CMS','Chance','Website-Score','Geschäfts-Stärke'];
        const rows = results.map(r => [r.name,r.domain,r.url,r.type,r.rating,r.reviews,r.perf,r.cms,r.opportunity,r.badnessScore,r.businessStrength]);
        const csv = [h,...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(';')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
        a.download = `leads-${query.replace(/\s/g,'-')}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
        showToast('Exportiert');
    });

    // Feedback
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-fb-action="correct"]'); if (!b) return; saveFeedback(b.dataset.fbDomain, parseInt(b.dataset.fbScore), 'correct', {branch:'batch'}); b.classList.add('active'); showToast(`${b.dataset.fbDomain}: ✓`); });
    el.addEventListener('change', (e) => { const s = e.target.closest('.fb-skip-select'); if (!s||!s.value) return; saveFeedback(s.dataset.fbDomain, parseInt(s.dataset.fbScore), 'too_high', {branch:'batch'}, s.options[s.selectedIndex].text, s.value); s.style.color='var(--red)'; s.disabled=true; showToast(`${s.dataset.fbDomain}: ${s.options[s.selectedIndex].text}`); });
}

function cleanup() { hideLoading(); hideProgress(); document.getElementById('btn-batch').disabled = false; }
function showLoading(t) { document.getElementById('loading-text').textContent = t; document.getElementById('loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }
function showProgress(pct, t) { document.getElementById('progress').classList.remove('hidden'); document.getElementById('progress-fill').style.width = pct+'%'; document.getElementById('progress-text').textContent = t; }
function hideProgress() { document.getElementById('progress').classList.add('hidden'); }
function showError(t) { document.getElementById('error-text').textContent = t; document.getElementById('error').classList.remove('hidden'); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
