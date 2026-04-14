/**
 * Batch Search — Smart Pre-Filter + KI nur für vielversprechende Leads
 *
 * Flow:
 * 1. Places API: 2× max Ergebnisse holen
 * 2. SCHNELL-FILTER (0 API-Calls): Enterprise/Konkurrenz/zu klein raus
 * 3. Ranking: Baukasten + viele Reviews = top Priorität
 * 4. NUR Top-N → teure PageSpeed + KI-Analyse
 * 5. Ergebnis: Weniger analysiert, mehr echte Leads
 */
import { state } from '../state.js';
import { config } from '../config.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces } from '../api/places.js';
import { analyzeScreenshot, analyzeContent } from '../api/cloud-functions.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { scoreLead } from '../scoring/lead-scorer.js';
import { portfolioProbability } from '../scoring/portfolio.js';
import { saveLead } from '../crm/leads.js';
import { analyzeCompanyProfile } from '../analysis/company-profile.js';
import { checkBFSGCompliance } from '../analysis/bfsg-compliance.js';
import { checkEnterpriseDB } from '../priors/enterprise-db.js';
import { showToast } from '../ui/render-components.js';
import { saveFeedback, SKIP_REASONS } from '../learning/score-feedback.js';

const BAUKASTEN_URL = [
    { pattern: /\.wixsite\.com|wix\.com/i, name: 'Wix', prio: 10 },
    { pattern: /\.jimdo\.|jimdofree\.|jimdosite\./i, name: 'Jimdo', prio: 10 },
    { pattern: /\.squarespace\.com/i, name: 'Squarespace', prio: 8 },
    { pattern: /\.weebly\.com/i, name: 'Weebly', prio: 9 },
    { pattern: /\.webnode\./i, name: 'Webnode', prio: 9 },
    { pattern: /\.strato\.de|\.strato-hosting\./i, name: 'Strato', prio: 7 },
    { pattern: /\.1und1\.de|\.ionos\./i, name: '1&1/IONOS', prio: 7 },
    { pattern: /\.wordpress\.com/i, name: 'WordPress.com', prio: 8 },
];

// Bereits analysierte Domains (aus CRM + Feedback)
function getAlreadyAnalyzed() {
    const leads = JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    const feedback = JSON.parse(localStorage.getItem('karriaro_score_feedback') || '{"entries":[]}');
    const domains = new Set();
    for (const l of leads) if (l.domain) domains.add(l.domain);
    for (const e of feedback.entries) if (e.domain) domains.add(e.domain);
    return domains;
}

export async function runBatchSearch() {
    const query = document.getElementById('batch-query').value.trim();
    if (!query) return;
    if (!config.fnUrl) { showError('Batch braucht Cloud Function URL.'); return; }
    state.aborted = false;
    document.getElementById('btn-batch').disabled = true;
    const max = parseInt(document.getElementById('batch-max').value);

    // ── Phase 1: Breite Suche (Hauptquery + Stadtteil-Varianten) ──
    showLoading(`Suche "${query}" — sammle Kandidaten aus verschiedenen Quellen...`);

    // Extrahiere Branche und Stadt aus der Query
    const parts = query.trim().split(/\s+/);
    const city = parts.length >= 2 ? parts.slice(1).join(' ') : '';
    const branch = parts[0] || query;

    // Stadtteil-Varianten generieren
    const searchQueries = [query]; // Immer die Originalquery zuerst
    if (city) {
        // Bekannte Stadtteile für größere Städte
        const STADTTEILE = {
            'köln': ['Ehrenfeld', 'Nippes', 'Deutz', 'Sülz', 'Lindenthal', 'Mülheim', 'Porz', 'Kalk'],
            'berlin': ['Kreuzberg', 'Neukölln', 'Prenzlauer Berg', 'Friedrichshain', 'Charlottenburg', 'Schöneberg', 'Mitte', 'Wedding'],
            'münchen': ['Schwabing', 'Haidhausen', 'Sendling', 'Bogenhausen', 'Pasing', 'Maxvorstadt', 'Giesing'],
            'hamburg': ['Altona', 'Eimsbüttel', 'Wandsbek', 'Barmbek', 'Eppendorf', 'Ottensen', 'Winterhude'],
            'frankfurt': ['Sachsenhausen', 'Bornheim', 'Nordend', 'Bockenheim', 'Westend', 'Höchst'],
            'stuttgart': ['Bad Cannstatt', 'Vaihingen', 'Feuerbach', 'Degerloch', 'Zuffenhausen'],
            'düsseldorf': ['Bilk', 'Flingern', 'Pempelfort', 'Oberkassel', 'Unterbilk', 'Derendorf'],
        };
        const cityLower = city.toLowerCase();
        const stadtteile = STADTTEILE[cityLower] || [];
        // Füge 3-4 zufällige Stadtteile hinzu
        const shuffled = stadtteile.sort(() => Math.random() - 0.5).slice(0, 4);
        for (const st of shuffled) {
            searchQueries.push(`${branch} ${city} ${st}`);
        }
    }

    // Parallele Suchen
    let allPlaces = [];
    try {
        const results = await Promise.all(
            searchQueries.map(q => searchPlaces(q, 10).catch(() => ({ places: [] })))
        );
        for (const r of results) {
            if (r?.places) allPlaces.push(...r.places);
        }
    } catch (e) { cleanup(); showError('Suche fehlgeschlagen.'); return; }

    // Deduplizieren (nach Domain)
    const seenDomains = new Set();
    const alreadyAnalyzed = getAlreadyAnalyzed();
    let skippedDuplicates = 0;
    let skippedAlreadyKnown = 0;

    const places = [];
    for (const p of allPlaces) {
        if (!p.websiteUri || p.businessStatus === 'CLOSED_PERMANENTLY') continue;
        try {
            const domain = new URL(p.websiteUri).hostname.replace('www.', '');
            if (seenDomains.has(domain)) { skippedDuplicates++; continue; }
            seenDomains.add(domain);
            if (alreadyAnalyzed.has(domain)) { skippedAlreadyKnown++; continue; }
            places.push(p);
        } catch { continue; }
    }

    if (!places.length) { cleanup(); showError(`${allPlaces.length} Ergebnisse, aber alle bereits bekannt oder Duplikate.`); return; }

    // ── Phase 2: Schnellfilter (0 API-Calls) ──
    showLoading(`${places.length} gefunden — filtere Ketten & Konkurrenz...`);
    const candidates = [], filtered = [];

    for (const p of places) {
        const url = p.websiteUri;
        const domain = new URL(url).hostname.replace('www.', '');
        const reviews = p.userRatingCount || 0;
        const db = checkEnterpriseDB(domain);

        if (db.isCompetitor) { filtered.push({ ...p, domain, reason: 'Konkurrenz', ft: 'competitor' }); continue; }
        if (db.isEnterprise) { filtered.push({ ...p, domain, reason: `Kette: ${db.match}`, ft: 'enterprise' }); continue; }
        if (reviews < 3 && !p.rating) { filtered.push({ ...p, domain, reason: 'Zu wenig Daten', ft: 'too_small' }); continue; }

        // Baukasten aus URL?
        let bk = null;
        for (const bp of BAUKASTEN_URL) { if (bp.pattern.test(url)) { bk = bp; break; } }

        // Priorität (höher = vielversprechender = schlechtere Website wahrscheinlicher)
        let prio = 0;

        // POSITIV: Zeichen dass die Website schlecht ist
        if (bk) prio += bk.prio;                    // Baukasten in URL = starkes Signal
        // Gutes Geschäft + vermutlich schlechte Website = Paradox-Lead
        if (reviews > 100) prio += 4;
        else if (reviews > 30) prio += 2;
        else if (reviews > 10) prio += 1;
        if (p.rating >= 4.5 && reviews > 20) prio += 2;

        // NEGATIV: Zeichen dass die Website wahrscheinlich gut ist
        // Premium-Domain (.com, kurz, Brand-artig) = eher professionelle Website
        const domainLen = domain.split('.')[0].length;
        if (domainLen <= 8 && /\.com$/.test(domain)) prio -= 3; // Kurze .com = oft professionell
        // Sehr viele Reviews ohne Baukasten = hat wahrscheinlich schon investiert
        if (reviews > 500 && !bk) prio -= 2;

        candidates.push({ place: p, domain, url, reviews, rating: p.rating, bk, prio, name: p.displayName?.text || domain, type: p.primaryTypeDisplayName?.text || '' });
    }

    candidates.sort((a, b) => b.prio - a.prio);
    const toAnalyze = candidates.slice(0, max);
    hideLoading();

    if (!toAnalyze.length) { cleanup(); showError(`Alle ${places.length} Ergebnisse gefiltert.`); return; }

    // ── Phase 3: KI-Analyse nur für Top-Kandidaten ──
    const results = [];
    for (let i = 0; i < toAnalyze.length; i += 2) {
        if (state.aborted) break;
        const batch = toAnalyze.slice(i, i + 2);
        showProgress(Math.round(((i + batch.length) / toAnalyze.length) * 100), `${Math.min(i + batch.length, toAnalyze.length)}/${toAnalyze.length}: KI analysiert ${batch.map(c => c.name).join(', ')}...`);

        const br = await Promise.all(batch.map(async (c) => {
            try {
                const p = c.place;
                const psi = await fetchPageSpeed(c.url);
                const ws = extractWebsiteScore(psi);
                const tech = detectTech(psi);
                const shot = psi?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;
                let sa = null, ca = null;
                try { [sa, ca] = await Promise.all([shot ? analyzeScreenshot(shot).catch(() => null) : null, analyzeContent(c.url).catch(() => null)]); } catch(e) {}
                const prob = scoreLead(ws, tech, p, null, null, null, null, sa, ca);
                const bfsg = checkBFSGCompliance(psi);
                let cp = null; try { cp = analyzeCompanyProfile(c.url, psi, p, null); } catch(e) {}
                const dq = sa?.designQuality || null;

                const reasons = [];
                if (c.bk) reasons.push(c.bk.name);
                else if (tech.isBaukasten) reasons.push(tech.cms);
                if (dq !== null && dq <= 3) reasons.push(`Design ${dq}/10`);
                else if (dq !== null && dq >= 8) reasons.push(`Design ${dq}/10 — modern`);
                if (ws.perf < 50) reasons.push(`Perf ${ws.perf}`);
                if (!ws.isHttps) reasons.push('Kein SSL');
                if (bfsg.risk === 'kritisch' || bfsg.risk === 'hoch') reasons.push(`BFSG: ${bfsg.riskLabel}`);
                if (c.reviews > 50) reasons.push(`${c.reviews} Bewertungen`);
                if (ca?.freshness === 'veraltet') reasons.push('Content veraltet');

                let rec = prob.leadScore >= 55 && (dq === null || dq <= 5) ? 'hot' : prob.leadScore >= 55 ? 'warm' : prob.leadScore >= 30 && (dq === null || dq <= 4) ? 'warm' : prob.leadScore >= 30 ? 'maybe' : 'skip';
                if (c.bk && c.reviews > 20 && rec === 'skip') { rec = 'maybe'; reasons.unshift(`${c.bk.name} — strukturelle Limitierung`); }
                if (c.bk && c.reviews > 50 && rec === 'maybe') rec = 'warm';

                return { name: c.name, domain: c.domain, url: c.url, rating: c.rating, reviews: c.reviews, type: c.type, perf: ws.perf, seo: ws.seo, a11y: ws.a11y, cms: tech.cms || c.bk?.name || '', isBaukasten: tech.isBaukasten || !!c.bk, leadScore: prob.leadScore, conversionRate: prob.conversionRate, expectedValue: prob.expectedValue, isCompetitor: false, isEnterprise: !!cp?.isEnterprise, designQuality: dq, designEra: sa?.designEra, bfsgRisk: bfsg.risk, bfsgScore: bfsg.complianceScore, recommendation: rec, reasons: reasons.join('. '), prio: c.prio };
            } catch (e) { return null; }
        }));
        results.push(...br.filter(Boolean));
        if (i + 2 < toAnalyze.length && !state.aborted) await delay(500);
    }

    hideProgress();
    document.getElementById('btn-batch').disabled = false;
    if (state.aborted || !results.length) return;

    // Gefilterte anfügen
    for (const f of filtered) {
        results.push({ name: f.displayName?.text || f.domain, domain: f.domain, url: f.websiteUri, rating: f.rating, reviews: f.userRatingCount || 0, type: f.primaryTypeDisplayName?.text || '', perf: null, leadScore: 0, isCompetitor: f.ft === 'competitor', isEnterprise: f.ft === 'enterprise', recommendation: 'filtered', reasons: f.reason });
    }

    state._batchResults = results;
    state._batchQuery = query;
    state._batchStats = {
        totalFound: allPlaces.length,
        unique: places.length + skippedAlreadyKnown,
        skippedDuplicates,
        skippedAlreadyKnown,
        preFiltered: filtered.length,
        analyzed: toAnalyze.length,
        searchQueries: searchQueries.length
    };
    sortAndRenderBatch('recommendation');
}

function sortAndRenderBatch(sortBy) {
    const results = [...(state._batchResults || [])];
    const query = state._batchQuery || '';
    const order = { hot: 0, warm: 1, maybe: 2, skip: 3, filtered: 4 };
    if (sortBy === 'recommendation') results.sort((a, b) => (order[a.recommendation] ?? 9) - (order[b.recommendation] ?? 9) || b.leadScore - a.leadScore);
    else if (sortBy === 'score') results.sort((a, b) => b.leadScore - a.leadScore);
    else if (sortBy === 'perf') results.sort((a, b) => (a.perf || 100) - (b.perf || 100));
    else if (sortBy === 'design') results.sort((a, b) => (a.designQuality || 99) - (b.designQuality || 99));
    else if (sortBy === 'reviews') results.sort((a, b) => b.reviews - a.reviews);
    renderBatchResults(query, results, sortBy);
}

function renderBatchResults(query, results, currentSort) {
    const analyzed = results.filter(r => r.recommendation !== 'filtered');
    const portfolio = portfolioProbability(analyzed.filter(r => r.leadScore > 0));
    const hot = results.filter(r => r.recommendation === 'hot').length;
    const warm = results.filter(r => r.recommendation === 'warm').length;
    const stats = state._batchStats || {};
    const sb = (key, label) => `<button class="crm-filter-btn${currentSort === key ? ' active' : ''}" data-sort="${key}">${label}</button>`;

    let html = `<div class="crm-header"><h2 class="crm-title">${analyzed.length} Leads${hot ? ` · <span style="color:var(--green)">${hot} heiß</span>` : ''}${warm ? ` · <span style="color:var(--accent)">${warm} warm</span>` : ''}</h2><div class="crm-actions-top"><button class="crm-btn-export" id="btn-export-csv">CSV Export</button><button class="crm-btn-export" id="btn-save-batch" style="background:var(--text);color:#fff">${analyzed.length} speichern</button></div></div>`;
    if (stats.totalFound) html += `<div class="metric-desc" style="margin-bottom:12px">${stats.searchQueries || 1} Suche${stats.searchQueries > 1 ? 'n' : ''} → ${stats.totalFound} Treffer → ${stats.skippedDuplicates || 0} Duplikate → ${stats.skippedAlreadyKnown || 0} bereits bekannt → ${stats.preFiltered} Ketten/Konkurrenz → <strong>${stats.analyzed} analysiert</strong></div>`;
    html += `<div class="crm-filters" style="margin-bottom:12px"><span class="metric-desc" style="margin-right:8px">Sortierung:</span>${sb('recommendation','Empfehlung')}${sb('score','Score')}${sb('design','Design')}${sb('perf','Perf.')}${sb('reviews','Bewertungen')}</div>`;
    html += `<div class="card anim-in" style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px"><div><div class="section-label">P(min. 1 Conversion)</div><div class="revenue-big" style="color:var(--green)">${portfolio.atLeastOne}%</div></div><div><div class="section-label">Erwartete Conversions</div><div class="revenue-big">${portfolio.expectedConversions}</div></div></div>`;

    const sc = v => v >= 55 ? 'badge-green' : v >= 30 ? 'badge-orange' : 'badge-red';
    const pf = v => v === null ? '' : v >= 75 ? 'good' : v >= 50 ? 'ok' : 'bad';
    const bb = r => !r ? '' : r === 'kritisch' ? 'badge-red' : r === 'hoch' ? 'badge-orange' : r === 'mittel' ? 'badge-orange' : 'badge-green';
    const bl = r => !r ? '—' : r === 'kritisch' ? '✗' : r === 'hoch' ? '⚠' : r === 'mittel' ? '~' : '✓';

    html += `<div style="overflow-x:auto"><table class="data-table" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius)"><thead><tr><th style="text-align:left">Unternehmen</th><th>Branche</th><th>★</th><th>Bew.</th><th>Perf.</th><th>Design</th><th>BFSG</th><th>Score</th></tr></thead><tbody>`;

    for (const r of results) {
        const isFilt = r.recommendation === 'filtered';
        const dim = isFilt ? ' style="opacity:0.35"' : '';
        const dc = r.designQuality == null ? '' : r.designQuality <= 3 ? 'bad' : r.designQuality <= 5 ? 'ok' : 'good';
        const ri = r.recommendation === 'hot' ? '🔥' : r.recommendation === 'warm' ? '→' : r.recommendation === 'maybe' ? '~' : r.recommendation === 'filtered' ? '⊘' : '✗';
        const rc = r.recommendation === 'hot' ? 'var(--green)' : r.recommendation === 'warm' ? 'var(--green)' : r.recommendation === 'maybe' ? 'var(--orange)' : 'var(--muted)';

        html += `<tr${dim}><td><strong>${r.name}</strong><br><a href="${r.url}" target="_blank" style="font-size:11px">${r.domain}</a>${!isFilt ? ` · <a href="#" class="crm-reanalyze" data-url="${r.url}" style="font-size:10px;color:var(--accent)">Einzel-Check</a>` : ''}</td><td>${r.type||'—'}</td><td>${r.rating||'—'}</td><td>${r.reviews||0}</td><td class="${pf(r.perf)}">${r.perf??'—'}</td><td class="${dc}">${r.designQuality!=null?r.designQuality+'/10':'—'}</td><td>${r.bfsgRisk?`<span class="badge ${bb(r.bfsgRisk)}">${bl(r.bfsgRisk)}</span>`:'—'}</td><td>${r.leadScore>0?`<span class="badge ${sc(r.leadScore)}">${r.leadScore}</span>`:isFilt?'<span class="metric-desc">⊘</span>':'—'}</td></tr>`;
        html += `<tr${dim}><td colspan="8" style="padding:4px 12px 12px;font-size:12px;color:var(--muted);border-bottom:2px solid var(--border)"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px"><span><strong style="color:${rc}">${ri} ${r.recommendation==='hot'?'Heißer Lead — sofort kontaktieren!':r.recommendation==='warm'?'Kontaktieren.':r.recommendation==='maybe'?'Möglich.':r.recommendation==='filtered'?'Vorab gefiltert.':'Überspringen.'}</strong> ${r.reasons||''}</span>${!isFilt?`<span class="batch-feedback" style="display:flex;gap:4px;flex-shrink:0;align-items:center"><button class="fb-btn fb-correct" data-fb-domain="${r.domain}" data-fb-score="${r.leadScore}" data-fb-action="correct" title="Passt">✓</button><select class="fb-skip-select" data-fb-domain="${r.domain}" data-fb-score="${r.leadScore}"><option value="">Skip ▾</option><option value="too_modern">Website gut</option><option value="too_big">Zu groß</option><option value="too_small">Zu klein</option><option value="wrong_branch">Falsche Branche</option><option value="no_need">Kein Bedarf</option><option value="regional">Außerhalb Region</option><option value="already_contacted">Schon kontaktiert</option></select></span>`:''}</div></td></tr>`;
    }
    html += '</tbody></table></div>';

    const el = document.getElementById('batch-results');
    el.innerHTML = html; el.classList.remove('hidden'); el.scrollIntoView({ behavior: 'smooth' });

    // Events
    document.getElementById('btn-export-csv')?.addEventListener('click', () => { exportCSV(results); showToast('Exportiert'); });
    document.getElementById('btn-save-batch')?.addEventListener('click', async function() { for (const r of analyzed.filter(r => r.leadScore > 0)) await saveLead(r.domain, r.url, r); this.textContent = 'Gespeichert ✓'; this.disabled = true; showToast(`${analyzed.length} Leads gespeichert`); });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-fb-action="correct"]'); if (!b) return; saveFeedback(b.dataset.fbDomain, parseInt(b.dataset.fbScore), 'correct', {branch:'batch'}); b.classList.add('active'); const s = b.parentNode.querySelector('.fb-skip-select'); if (s) s.disabled = true; showToast(`${b.dataset.fbDomain}: Bestätigt`); });
    el.addEventListener('change', (e) => { const s = e.target.closest('.fb-skip-select'); if (!s||!s.value) return; const l = s.options[s.selectedIndex].text; saveFeedback(s.dataset.fbDomain, parseInt(s.dataset.fbScore), 'too_high', {branch:'batch'}, l, s.value); s.style.color='var(--red)'; s.disabled=true; const b = s.parentNode.querySelector('.fb-btn'); if (b) b.style.opacity='0.3'; showToast(`${s.dataset.fbDomain}: "${l}"`); });
    el.querySelectorAll('[data-sort]').forEach(b => { b.addEventListener('click', () => sortAndRenderBatch(b.dataset.sort)); });
    el.addEventListener('click', (e) => { const l = e.target.closest('.crm-reanalyze'); if (!l) return; e.preventDefault(); el.classList.add('hidden'); const u = document.getElementById('url-input'); if (u) u.value = l.dataset.url; document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.querySelector('[data-tab="single"]')?.classList.add('active'); document.getElementById('input-single')?.classList.remove('hidden'); document.getElementById('input-batch')?.classList.add('hidden'); document.getElementById('input-scanner')?.classList.add('hidden'); window.scrollTo({top:0,behavior:'smooth'}); });
}

function exportCSV(results) {
    const h = ['Name','Domain','URL','Branche','Sterne','Bewertungen','Performance','SEO','A11y','CMS','Design','BFSG','Score','Empfehlung','Gründe'];
    const rows = results.map(r => [r.name,r.domain,r.url,r.type,r.rating,r.reviews,r.perf||'',r.seo||'',r.a11y||'',r.cms||'',r.designQuality||'',r.bfsgRisk||'',r.leadScore||0,r.recommendation||'',r.reasons||'']);
    const csv = [h,...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})); a.download = `karriaro-leads-${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

function cleanup() { hideLoading(); document.getElementById('btn-batch').disabled = false; }
function showLoading(t) { document.getElementById('loading-text').textContent = t; document.getElementById('loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }
function showProgress(pct, t) { document.getElementById('progress').classList.remove('hidden'); document.getElementById('progress-fill').style.width = pct+'%'; document.getElementById('progress-text').textContent = t; }
function hideProgress() { document.getElementById('progress').classList.add('hidden'); }
function showError(t) { document.getElementById('error-text').textContent = t; document.getElementById('error').classList.remove('hidden'); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
