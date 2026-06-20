/**
 * Stadt-Scanner — Lead-Workspace.
 *
 * Vom Branchen-Aggregat zum konkreten Lead. Die UI ist nicht mehr "Friseure
 * sind 38% interessant", sondern "Friseur Mueller, Score 78, hier kaufen".
 *
 * Pipeline:
 *  1. searchPlaces(branche+stadt, 20) parallel fuer alle 18 Branchen.
 *     (20 = Backend-Max pro Anfrage; mehr Tiefe = auch die vernachlaessigten
 *      Seiten jenseits der prominentesten Top-Treffer, die gute Sites haben.)
 *  2. Pre-Filter: nur Places mit websiteUri, OPERATIONAL, userRatingCount>=5,
 *     keine Enterprise/Konkurrenz-Domain.
 *  3. PSI-Light pro qualifiziertem Place mit Concurrency-Limit 8.
 *  4. scoreLead() mit Light-Inputs (kein KI-Call) — der Score ist eine
 *     erste Sortierhilfe; Tiefe Analyse passiert auf Klick im Single-Check.
 *  5. Output: flache Lead-Liste mit Filter-/Sort-State im URL-Hash.
 */
import { state } from '../state.js';
import { config } from '../config.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces } from '../api/places.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { scoreLead } from '../scoring/lead-scorer.js';
import { computeOpportunity } from '../scoring/opportunity.js';
import { analyzeTechAge } from '../analysis/tech-age.js';
import { siteLooksModern } from '../analysis/claim-verify.js';
import { analyzeScreenshot } from '../api/cloud-functions.js';
import { checkEnterpriseDB } from '../priors/enterprise-db.js';
import { saveLead } from '../crm/leads.js';
import { buildPitchInputs } from '../strategy/pitch-inputs.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { pickDistricts } from '../data/stadtteile.js';
import { getCachedPlaces, setCachedPlaces, countUncached, getCachedScore, setCachedScore, getCachedVision, setCachedVision, PLACES_COST_USD } from '../api/scan-cache.js';
import { getAlreadyKnown } from '../crm/known.js';
import { escapeHtml } from '../lib/escape-html.js';

const BRANCHES = [
    { key: 'dentist',           q: 'Zahnarzt',          name: 'Zahnärzte' },
    { key: 'hair_salon',        q: 'Friseur',           name: 'Friseure' },
    { key: 'restaurant',        q: 'Restaurant',        name: 'Restaurants' },
    { key: 'auto_repair',       q: 'KFZ Werkstatt',     name: 'KFZ-Werkstätten' },
    { key: 'beauty_salon',      q: 'Kosmetikstudio',    name: 'Kosmetikstudios' },
    { key: 'physiotherapist',   q: 'Physiotherapie',    name: 'Physiotherapie' },
    { key: 'lawyer',            q: 'Rechtsanwalt',      name: 'Rechtsanwälte' },
    { key: 'real_estate_agency',q: 'Immobilienmakler',  name: 'Immobilienmakler' },
    { key: 'hotel',             q: 'Hotel',             name: 'Hotels' },
    { key: 'plumber',           q: 'Sanitär Heizung',   name: 'Sanitärbetriebe' },
    { key: 'electrician',       q: 'Elektriker',        name: 'Elektrobetriebe' },
    { key: 'veterinary_care',   q: 'Tierarzt',          name: 'Tierärzte' },
    { key: 'gym',               q: 'Fitnessstudio',     name: 'Fitnessstudios' },
    { key: 'moving_company',    q: 'Umzugsunternehmen', name: 'Umzugsfirmen' },
    { key: 'car_dealer',        q: 'Autohaus',          name: 'Autohäuser' },
    { key: 'bakery',            q: 'Bäckerei',          name: 'Bäckereien' },
    { key: 'florist',           q: 'Blumenladen',       name: 'Floristen' },
    { key: 'cafe',              q: 'Cafe',              name: 'Cafés' }
];
const BRANCH_BY_TYPE = Object.fromEntries(BRANCHES.map(b => [b.key, b]));

const PLACES_PER_BRANCH = 20;
const PSI_CONCURRENCY = 8;
const MIN_REVIEWS = 5;
// Tiefen-Suche: zusätzlich pro Branche in N Stadtteilen suchen (bricht den
// Prominenz-Bias). Tiefen-Stufen zentral definiert (Modal + Default leiten sich
// daraus ab). Gedrosselt gegen das Places-Rate-Limit (30/60s im Backend).
const DEPTH_TIERS = [
    { label: 'Schnell · stadtweit', districts: 0 },
    { label: 'Mittel · + 3 Stadtteile', districts: 3 },
    { label: 'Tief · + 6 Stadtteile', districts: 6 }
];
const DISTRICTS_PER_SCAN = Math.max(...DEPTH_TIERS.map(t => t.districts));
const SEARCH_CONCURRENCY = 2; // niedriger → schont das 30/60s-Backend-Limit

// searchPlaces mit Backoff-Retries gegen Rate-Limit (Tiefen-Scan feuert viele Suchen).
async function searchPlacesRetry(q, max) {
    const waits = [3000, 6000];
    for (let i = 0; ; i++) {
        try { return await searchPlaces(q, max); }
        catch {
            if (i >= waits.length) return null;
            await new Promise(r => setTimeout(r, waits[i]));
        }
    }
}

// Stadt-weite + Stadtteil-Suchen pro Branche, mit Branchen-Index (für deterministisches Dedup).
function buildQueriesFor(city, districts) {
    const out = [];
    BRANCHES.forEach((b, bi) => {
        out.push({ branch: b, bi, q: `${b.q} ${city}` });
        for (const st of districts) out.push({ branch: b, bi, q: `${b.q} ${city} ${st}` });
    });
    return out;
}

// Kosten-Bestätigung mit Tiefen-Wahl. Cache-Treffer sind gratis, neue Suchen ~0,04 $.
// Liefert das gewählte Stadtteil-Array oder null (Abbruch).
function confirmScanCost(city) {
    return new Promise(resolve => {
        const all = pickDistricts(city, DISTRICTS_PER_SCAN);
        const opts = DEPTH_TIERS.map(t => {
            const districts = all.slice(0, t.districts);
            const qs = buildQueriesFor(city, districts).map(x => x.q);
            const newN = countUncached(qs);
            return { label: t.label, districts, total: qs.length, newN, costUsd: +(newN * PLACES_COST_USD).toFixed(2) };
        });

        const el = document.createElement('div');
        el.className = 'scan-cost-overlay';
        el.innerHTML = `
            <div class="scan-cost-card">
                <p class="hero-eyebrow">Region-Scan · ${escapeHtml(city)}</p>
                <h2 class="scan-cost-title">Wie tief soll gesucht werden?</h2>
                <p class="scan-cost-sub">Jede Google-Suche kostet ~0,04 $. Bereits gecachte Gebiete sind <strong>gratis</strong>, PageSpeed ist immer kostenlos. Mehrere Läufe füllen den Cache — Wiederholungen werden günstiger.</p>
                <div class="scan-cost-opts">
                    ${opts.map((o, i) => `
                        <button class="scan-cost-opt${i === 1 ? ' recommended' : ''}" data-i="${i}">
                            <span class="sco-label">${escapeHtml(o.label)}</span>
                            <span class="sco-meta">${o.total} Suchen · ${o.newN} neu${o.newN < o.total ? ` · ${o.total - o.newN} gratis (Cache)` : ''}</span>
                            <span class="sco-cost">${o.costUsd === 0 ? 'gratis' : '≈ ' + o.costUsd.toFixed(2) + ' $'}</span>
                        </button>`).join('')}
                </div>
                <button class="scan-cost-cancel" data-cancel>Abbrechen</button>
            </div>`;
        document.body.appendChild(el);
        const close = (val) => { el.remove(); resolve(val); };
        el.querySelectorAll('.scan-cost-opt').forEach(b => b.addEventListener('click', () => close(opts[+b.dataset.i].districts)));
        el.querySelector('[data-cancel]').addEventListener('click', () => close(null));
        el.addEventListener('click', (e) => { if (e.target === el) close(null); });
    });
}

let lastResults = []; // letzte Scanner-Ausgabe — fuer Filter/Sort ohne Re-Run
let lastCity = '';

export async function runScanner() {
    const city = document.getElementById('scanner-city').value.trim();
    if (!city) return;
    if (!config.fnUrl) { showError('Scanner braucht Cloud Function URL.'); return; }

    // Kosten-Bestätigung mit Tiefen-Wahl (Cache-Treffer gratis). Abbruch → raus.
    const districts = await confirmScanCost(city);
    if (districts === null) return;

    state.aborted = false;
    document.getElementById('btn-scanner').disabled = true;
    showProgress(0, `Bitte diesen Tab offen lassen — Scan läuft...`);

    // Phase 1: Suche (Stadt + gewählte Stadtteile), Cache-first, gedrosselt.
    // Gegen bereits gespeicherte/abgelehnte Leads gefiltert; Dedup erfolgt
    // deterministisch NACH allen Suchen (race-frei), nicht im Worker.
    const queries = buildQueriesFor(city, districts);
    const known = getAlreadyKnown();
    showProgress(6, districts.length
        ? `① Suche in ${districts.length + 1} Gebieten × ${BRANCHES.length} Branchen (${queries.length} Suchen)…`
        : `① Geschäfte in allen Branchen suchen…`);

    const raw = [];
    let qDone = 0;
    await runWithConcurrency(queries, SEARCH_CONCURRENCY, async ({ branch, bi, q }) => {
        if (state.aborted) return;
        const cached = getCachedPlaces(q);
        const res = cached ? { places: cached } : await searchPlacesRetry(q, PLACES_PER_BRANCH);
        if (!cached && res?.places) setCachedPlaces(q, res.places);
        for (const p of (res?.places || [])) {
            if (!p.websiteUri) continue;
            if ((p.userRatingCount || 0) < MIN_REVIEWS) continue;
            if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
            let host;
            try { host = new URL(p.websiteUri).hostname.replace(/^www\./, ''); } catch { continue; }
            if (known.has(host)) continue;
            const ent = checkEnterpriseDB(host);
            if (ent.isEnterprise || ent.isCompetitor) continue;
            raw.push({ branch, bi, host, place: p });
        }
        qDone++;
        showProgress(6 + Math.round((qDone / queries.length) * 22), `① Suche … ${qDone}/${queries.length} Gebiete · ${raw.length} Treffer`);
    });
    if (state.aborted) { hideProgress(); document.getElementById('btn-scanner').disabled = false; return; }

    // Deterministisches Dedup: niedrigster Branchen-Index gewinnt (stabile Zuordnung,
    // unabhängig vom Netzwerk-Race der parallelen Suchen).
    const seen = new Set();
    const candidates = [];
    for (const c of raw.sort((a, b) => a.bi - b.bi)) {
        if (seen.has(c.host)) continue;
        seen.add(c.host);
        candidates.push({ branch: c.branch, place: c.place });
    }

    if (candidates.length === 0) {
        hideProgress();
        document.getElementById('btn-scanner').disabled = false;
        renderEmpty(city);
        return;
    }

    // Phase 3: PSI-Light pro Lead, Concurrency-Limit
    showProgress(30, `③ Analyse von ${candidates.length} Geschäften (parallel)...`);
    const leads = [];
    let done = 0;
    await runWithConcurrency(candidates, PSI_CONCURRENCY, async (cand) => {
        if (state.aborted) return;
        const { branch, place } = cand;
        try {
            const domainKey = hostnameOf(place.websiteUri);
            // Score-Cache: PSI nur holen, wenn nicht gecacht (spart Zeit + Quota).
            let ws, tech, screenshot = null;
            const cs = getCachedScore(domainKey);
            if (cs) { ws = cs.ws; tech = cs.tech; }
            else {
                const psi = await fetchPageSpeed(place.websiteUri);
                ws = extractWebsiteScore(psi);
                tech = detectTech(psi);
                screenshot = psi?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;
                setCachedScore(domainKey, ws, tech);
            }
            const techAge = analyzeTechAge(tech, {});
            // Transparente Vor-Bewertung (gratis): Opportunity = Schlechtigkeit × Geschäftswert.
            const opp = computeOpportunity({ ws, tech, place, websiteUri: place.websiteUri, techAge });
            // conversionRate/EV aus dem Funnel-Modell für CRM-Kontinuität (nicht als Hauptscore).
            const result = scoreLead(ws, tech, place, null, null);
            leads.push({
                key: `${branch.key}::${place.websiteUri}`,
                branch,
                place,
                domain: hostnameOf(place.websiteUri),
                websiteUri: place.websiteUri,
                name: place.displayName?.text || hostnameOf(place.websiteUri),
                rating: place.rating || null,
                reviews: place.userRatingCount || 0,
                address: place.formattedAddress || null,
                primaryType: place.primaryType || branch.key,
                ws,
                tech,
                leadScore: opp.opportunity,            // Hauptscore = Opportunity (Founder-facing)
                opportunity: opp.opportunity,
                badnessScore: opp.badnessScore,
                businessStrength: opp.businessStrength,
                reasons: opp.reasons,
                looksAlreadyGood: opp.looksAlreadyGood,
                conversionRate: result.conversionRate || 0,
                expectedValue: result.expectedValue || 0,
                isBaukasten: !!tech.isBaukasten,
                cms: tech.cms || null,
                version: tech.version || null,
                // Screenshot nur für aussichtsreiche Treffer halten (Stufe-2-Vision, Speicher-schonend).
                _screenshot: opp.opportunity >= 45 ? screenshot : null
            });
        } catch (err) {
            // Schweigend ignorieren — vermutlich PSI-Quota oder unreachable Site.
            // Nicht in der Liste, kein Score.
        }
        done++;
        const pct = 30 + Math.round((done / candidates.length) * 65);
        showProgress(pct, `③ ${done}/${candidates.length} analysiert...`);
    });

    // Stufe 2: günstige Vision-Verfeinerung der Top-N (aus dem schon vorhandenen
    // PSI-Screenshot) — fängt "modern aber langsam" ab, bevor du teuer reingehst.
    if (!state.aborted) {
        const VISION_TOP_N = 25;
        const visionCands = leads.filter(l => l.opportunity >= 45)
            .sort((a, b) => b.opportunity - a.opportunity).slice(0, VISION_TOP_N);
        if (visionCands.length && config.fnUrl) {
            let vDone = 0;
            await runWithConcurrency(visionCands, 3, async (l) => {
                if (state.aborted) return;
                let vision = getCachedVision(l.domain);
                if (!vision && l._screenshot) {
                    vision = await analyzeScreenshot(l._screenshot).catch(() => null);
                    if (vision) setCachedVision(l.domain, vision);
                }
                if (vision) {
                    const modern = siteLooksModern(vision);
                    if (modern === true) { l.opportunity = Math.round(l.opportunity * 0.4); l.leadScore = l.opportunity; l.reasons.push('Bild: modern'); }
                    else if (modern === false) { l.opportunity = Math.min(100, Math.round(l.opportunity * 1.15)); l.leadScore = l.opportunity; l.reasons.push('Bild: veraltet'); }
                }
                vDone++;
                showProgress(96 + Math.round((vDone / visionCands.length) * 3), `④ Bild-Check Top ${vDone}/${visionCands.length}…`);
            });
        }
    }
    for (const l of leads) delete l._screenshot; // Speicher freigeben

    hideProgress();
    document.getElementById('btn-scanner').disabled = false;
    if (state.aborted) return;

    leads.sort((a, b) => b.leadScore - a.leadScore);
    lastResults = leads;
    lastCity = city;
    persistFilters({}); // setze URL-Hash auf default
    renderLeadWorkspace(city, leads, getActiveFilters());

    notifyDone(`Scan fertig: ${leads.length} Leads gefunden, ${leads.filter(l => l.leadScore >= 60).length} mit Score ≥60`);
}

// runWithConcurrency lebt jetzt in lib/concurrency.js und wird von batch-search.js mitgenutzt.

function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
}

// ─────────── Filter / Sort State (URL-Hash) ───────────

function getActiveFilters() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    return {
        minScore: parseInt(h.get('min') || '0', 10),
        branch:   h.get('branch') || 'all',
        sort:     h.get('sort') || 'score',
        baukasten: h.get('baukasten') === '1'
    };
}

function persistFilters(updates) {
    const current = getActiveFilters();
    const next = { ...current, ...updates };
    const h = new URLSearchParams();
    if (next.minScore > 0) h.set('min', String(next.minScore));
    if (next.branch && next.branch !== 'all') h.set('branch', next.branch);
    if (next.sort && next.sort !== 'score') h.set('sort', next.sort);
    if (next.baukasten) h.set('baukasten', '1');
    const str = h.toString();
    location.hash = str ? '#' + str : '';
}

function applyFilters(leads, f) {
    let out = leads.slice();
    if (f.minScore > 0) out = out.filter(l => l.leadScore >= f.minScore);
    if (f.branch && f.branch !== 'all') out = out.filter(l => l.branch.key === f.branch);
    if (f.baukasten) out = out.filter(l => l.isBaukasten);
    if (f.sort === 'reviews') out.sort((a, b) => b.reviews - a.reviews);
    else if (f.sort === 'name')  out.sort((a, b) => a.name.localeCompare(b.name));
    else if (f.sort === 'perf')  out.sort((a, b) => (a.ws?.perf || 0) - (b.ws?.perf || 0));
    else /* score */              out.sort((a, b) => b.leadScore - a.leadScore);
    return out;
}

// ─────────── Render ───────────

function renderLeadWorkspace(city, leads, filters) {
    const filtered = applyFilters(leads, filters);
    const total = leads.length;
    const hot = leads.filter(l => l.leadScore >= 70).length;
    const warm = leads.filter(l => l.leadScore >= 50 && l.leadScore < 70).length;
    const cold = leads.length - hot - warm;

    // Branchen-Filter-Liste — nur die Branchen, die echte Leads haben
    const branchCounts = {};
    for (const l of leads) branchCounts[l.branch.key] = (branchCounts[l.branch.key] || 0) + 1;
    const branchOptions = BRANCHES.filter(b => branchCounts[b.key] > 0)
        .sort((a, b) => branchCounts[b.key] - branchCounts[a.key]);

    let html = `
        <div class="ws-header">
            <div class="ws-title">
                <h2>Leads in ${escapeHtml(city)}</h2>
                <div class="ws-stats">
                    <span><strong>${filtered.length}</strong> ${filtered.length === total ? 'Treffer' : 'gefiltert von ' + total}</span>
                    <span class="ws-stat-hot">🔥 ${hot} hot</span>
                    <span class="ws-stat-warm">⚠ ${warm} warm</span>
                    <span class="ws-stat-cold">○ ${cold} cold</span>
                </div>
            </div>
        </div>

        <div class="ws-toolbar">
            <div class="ws-pills" data-pill-group="minScore">
                <button class="ws-pill${filters.minScore === 0 ? ' active' : ''}" data-min="0">Alle Scores</button>
                <button class="ws-pill${filters.minScore === 50 ? ' active' : ''}" data-min="50">≥ 50</button>
                <button class="ws-pill${filters.minScore === 60 ? ' active' : ''}" data-min="60">≥ 60</button>
                <button class="ws-pill${filters.minScore === 70 ? ' active' : ''}" data-min="70">≥ 70 (hot)</button>
            </div>
            <div class="ws-pills" data-pill-group="baukasten">
                <button class="ws-pill${filters.baukasten ? ' active' : ''}" data-baukasten="${filters.baukasten ? '0' : '1'}">${filters.baukasten ? '✓ ' : ''}Baukasten-only</button>
            </div>
            <div class="ws-select-wrap">
                <select class="ws-select" data-action="branch">
                    <option value="all"${filters.branch === 'all' ? ' selected' : ''}>Alle Branchen (${total})</option>
                    ${branchOptions.map(b => `<option value="${b.key}"${filters.branch === b.key ? ' selected' : ''}>${escapeHtml(b.name)} (${branchCounts[b.key]})</option>`).join('')}
                </select>
                <select class="ws-select" data-action="sort">
                    <option value="score"${filters.sort === 'score' ? ' selected' : ''}>Sort: Score ↓</option>
                    <option value="reviews"${filters.sort === 'reviews' ? ' selected' : ''}>Sort: Reviews ↓</option>
                    <option value="perf"${filters.sort === 'perf' ? ' selected' : ''}>Sort: Performance ↑</option>
                    <option value="name"${filters.sort === 'name' ? ' selected' : ''}>Sort: A-Z</option>
                </select>
            </div>
        </div>

        <div class="ws-list">
            ${filtered.length === 0
                ? `<div class="ws-empty">Mit den aktuellen Filtern keine Leads. <button class="ws-link" data-action="reset-filters">Filter zurücksetzen</button></div>`
                : filtered.map(renderLeadCard).join('')}
        </div>
    `;

    const el = document.getElementById('batch-results');
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    bindWorkspaceEvents(el);
}

function renderEmpty(city) {
    const el = document.getElementById('batch-results');
    el.innerHTML = `
        <div class="ws-empty-block">
            <h2>Keine Leads in ${escapeHtml(city)} gefunden</h2>
            <p>Möglich: keine Geschäfte mit Website + ≥${MIN_REVIEWS} Bewertungen + nicht-Enterprise.</p>
            <p>Versuchen Sie eine andere Stadt oder eine größere Stadt im Umland.</p>
        </div>`;
    el.classList.remove('hidden');
}

function renderLeadCard(l) {
    const scoreClass = l.leadScore >= 70 ? 'hot' : l.leadScore >= 50 ? 'warm' : 'cold';
    // Begründungs-Chips: zeigen transparent, WARUM der Lead so bewertet ist.
    // "Bild: modern" ist der Grund fürs Abwerten → gedämpft markiert.
    const reasons = (l.reasons || []).map(r => {
        const muted = /Bild: modern/i.test(r) ? ' ws-chip-muted' : '';
        return `<span class="ws-lead-tech${muted}">${escapeHtml(r)}</span>`;
    }).join(' ');

    return `
        <div class="ws-lead ws-lead-${scoreClass}" data-key="${escapeHtml(l.key)}" data-url="${escapeHtml(l.websiteUri)}">
            <div class="ws-lead-score">${l.leadScore}</div>
            <div class="ws-lead-body">
                <div class="ws-lead-line1">
                    <span class="ws-lead-name">${escapeHtml(l.name)}</span>
                    <span class="ws-lead-domain"><a href="${escapeHtml(l.websiteUri)}" target="_blank" rel="noopener" data-no-bubble>${escapeHtml(l.domain)}</a></span>
                </div>
                <div class="ws-lead-line2">
                    <span class="ws-lead-branch">${escapeHtml(l.branch.name)}</span>
                    ${reasons}
                </div>
                ${l.address ? `<div class="ws-lead-line3">${escapeHtml(l.address)}</div>` : ''}
            </div>
            <div class="ws-lead-actions">
                <button class="ws-btn ws-btn-primary" data-action="analyze">Tiefe Analyse →</button>
                <button class="ws-btn" data-action="save">✚ CRM</button>
            </div>
        </div>
    `;
}

function bindWorkspaceEvents(el) {
    el.addEventListener('click', async (e) => {
        // Filter-Pills
        const pill = e.target.closest('.ws-pill');
        if (pill) {
            const group = pill.closest('.ws-pills')?.dataset.pillGroup;
            if (group === 'minScore') {
                persistFilters({ minScore: parseInt(pill.dataset.min, 10) });
            } else if (group === 'baukasten') {
                persistFilters({ baukasten: pill.dataset.baukasten === '1' });
            }
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
            return;
        }

        // Reset
        if (e.target.dataset.action === 'reset-filters') {
            persistFilters({ minScore: 0, branch: 'all', sort: 'score', baukasten: false });
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
            return;
        }

        // Lead-Action: Tiefe Analyse → in Single-Check uebernehmen
        const lead = e.target.closest('.ws-lead');
        if (!lead) return;
        if (e.target.dataset.noBubble != null) return;

        const action = e.target.dataset.action;
        const websiteUri = lead.dataset.url;
        const leadData = lastResults.find(x => x.key === lead.dataset.key);

        if (action === 'save') {
            if (!leadData) return;
            await saveLead(leadData.domain, websiteUri, {
                name: leadData.name,
                type: leadData.primaryType,
                perf: leadData.ws?.perf, seo: leadData.ws?.seo, a11y: leadData.ws?.a11y,
                cms: leadData.cms, isBaukasten: leadData.isBaukasten,
                leadScore: leadData.leadScore, conversionRate: leadData.conversionRate,
                expectedValue: leadData.expectedValue,
                reviews: leadData.reviews, rating: leadData.rating,
                source: 'scanner_workspace',
                // Magerer Pitch-Blob (PSI-Light: nur ws/tech/place, kein deep/bfsg/mockup).
                pitchInputs: buildPitchInputs(leadData)
            });
            const btn = e.target;
            btn.textContent = '✓ Gespeichert';
            btn.disabled = true;
            return;
        }

        // Default: zum Single-Check wechseln + auto-analyze
        const urlInput = document.getElementById('url-input');
        if (urlInput) urlInput.value = websiteUri;
        // Switch to single tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="single"]')?.classList.add('active');
        document.getElementById('input-single')?.classList.remove('hidden');
        document.getElementById('input-batch')?.classList.add('hidden');
        document.getElementById('input-scanner')?.classList.add('hidden');
        document.getElementById('btn-analyze')?.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    el.addEventListener('change', (e) => {
        if (e.target.dataset.action === 'branch') {
            persistFilters({ branch: e.target.value });
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
        } else if (e.target.dataset.action === 'sort') {
            persistFilters({ sort: e.target.value });
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
        }
    });
}

// escapeHtml kommt zentral aus lib/escape-html.js (Import oben).

function showProgress(pct, t) { document.getElementById('progress').classList.remove('hidden'); document.getElementById('progress-fill').style.width = pct+'%'; document.getElementById('progress-text').textContent = t; }
function hideProgress() { document.getElementById('progress').classList.add('hidden'); }
function showError(t) { document.getElementById('error-text').textContent = t; document.getElementById('error').classList.remove('hidden'); }

function notifyDone(msg) {
    const origTitle = document.title;
    document.title = '✅ ' + msg;
    setTimeout(() => { document.title = origTitle; }, 5000);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Lead Intelligence', { body: msg }); } catch {}
    }
}

export function requestNotificationPermissionOnGesture() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
    try { Notification.requestPermission(); } catch {}
}
