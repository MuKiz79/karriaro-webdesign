/**
 * Batch Search Workflow — Refactored
 *
 * Verbesserungen:
 * - Konkurrenz-Erkennung (Webdesign-Agenturen gefiltert)
 * - PageSpeed in 3er-Batches parallel (3× schneller)
 * - CSS-Klassen statt Inline-Styles
 * - Bessere Empfehlungstexte
 */
import { state } from '../state.js';
import { config } from '../config.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces } from '../api/places.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { scoreLead } from '../scoring/lead-scorer.js';
import { portfolioProbability } from '../scoring/portfolio.js';
import { saveLead, exportCSV as exportLeadsCSV } from '../crm/leads.js';
import { analyzeCompanyProfile } from '../analysis/company-profile.js';
import { checkBFSGCompliance } from '../analysis/bfsg-compliance.js';
import { showToast } from '../ui/render-components.js';

const COMPETITOR_PATTERNS = [
    /webdesign|web-design|webagentur|digitalagentur|werbeagentur/i,
    /seo-agentur|online-marketing|internetagentur|homepage.*erstell/i
];

export async function runBatchSearch() {
    const query = document.getElementById('batch-query').value.trim();
    if (!query) return;
    if (!config.fnUrl) { showError('Batch braucht Cloud Function URL.'); return; }
    state.aborted = false;
    document.getElementById('btn-batch').disabled = true;

    const max = parseInt(document.getElementById('batch-max').value);
    showLoading(`Suche "${query}"...`);

    let places;
    try {
        const data = await searchPlaces(query, max);
        places = (data?.places || []).filter(p => p.websiteUri && p.businessStatus !== 'CLOSED_PERMANENTLY');
    } catch (e) { hideLoading(); document.getElementById('btn-batch').disabled = false; showError('Suche fehlgeschlagen.'); return; }
    if (!places.length) { hideLoading(); document.getElementById('btn-batch').disabled = false; showError('Keine Unternehmen mit Website gefunden.'); return; }

    hideLoading();

    // PageSpeed in 3er-Batches parallel
    const BATCH_SIZE = 3;
    const results = [];

    for (let i = 0; i < places.length; i += BATCH_SIZE) {
        if (state.aborted) break;
        const batch = places.slice(i, i + BATCH_SIZE);
        showProgress(Math.round(((i + batch.length) / places.length) * 100), `${Math.min(i + batch.length, places.length)}/${places.length}: ${batch.map(p => p.displayName?.text || '').join(', ')}...`);

        const batchResults = await Promise.all(batch.map(async (p) => {
            try {
                const psiData = await fetchPageSpeed(p.websiteUri);
                const ws = extractWebsiteScore(psiData);
                const tech = detectTech(psiData);
                const prob = scoreLead(ws, tech, p, null, null);
                const domain = new URL(p.websiteUri).hostname.replace('www.', '');

                // Konkurrenz-Erkennung
                const domainBase = domain.split('.')[0].toLowerCase();
                const isCompetitor = COMPETITOR_PATTERNS.some(pat => pat.test(domainBase));
                let companyProfile = null;
                try { companyProfile = analyzeCompanyProfile(p.websiteUri, psiData, p, null); } catch(e) {}
                const skipLead = isCompetitor || companyProfile?.isCompetitor || companyProfile?.isEnterprise;

                // BFSG Quick-Check
                const bfsg = checkBFSGCompliance(psiData);

                // Empfehlungstext (mit neuen Modulen)
                const reasons = [];
                if (skipLead) reasons.push(companyProfile?.isCompetitor ? 'Konkurrenz' : 'Nicht Zielgruppe');
                else {
                    if (ws.perf < 50) reasons.push(`Perf ${ws.perf}`);
                    if (tech.isBaukasten) reasons.push(tech.cms);
                    if (!ws.isHttps) reasons.push('Kein SSL');
                    if (p.userRatingCount > 50) reasons.push(`${p.userRatingCount} Bewertungen`);
                    if (bfsg.risk === 'kritisch' || bfsg.risk === 'hoch') reasons.push(`BFSG: ${bfsg.riskLabel}`);
                    else if (ws.a11y < 60) reasons.push(`A11y ${ws.a11y}`);
                }

                return {
                    name: p.displayName?.text || domain, domain, url: p.websiteUri,
                    rating: p.rating, reviews: p.userRatingCount || 0,
                    type: p.primaryTypeDisplayName?.text || companyProfile?.branche || '—',
                    perf: ws.perf, seo: ws.seo, a11y: ws.a11y,
                    cms: tech.cms, isBaukasten: tech.isBaukasten,
                    leadScore: skipLead ? 0 : prob.leadScore,
                    conversionRate: prob.conversionRate,
                    expectedValue: skipLead ? 0 : prob.expectedValue,
                    timePerLead: prob.timePerLead,
                    isCompetitor: !!skipLead,
                    bfsgRisk: bfsg.risk,
                    bfsgScore: bfsg.complianceScore,
                    reasons: reasons.join('. ')
                };
            } catch (e) { return null; }
        }));

        results.push(...batchResults.filter(Boolean));
        if (i + BATCH_SIZE < places.length && !state.aborted) await delay(500);
    }

    hideProgress();
    document.getElementById('btn-batch').disabled = false;
    if (state.aborted || !results.length) return;

    results.sort((a, b) => b.leadScore - a.leadScore);
    renderBatchResults(query, results);
}

function renderBatchResults(query, results) {
    const validResults = results.filter(r => !r.isCompetitor);
    const portfolio = portfolioProbability(validResults);
    const sc = v => v >= 55 ? 'badge-green' : v >= 30 ? 'badge-orange' : 'badge-red';
    const perf = v => v >= 75 ? 'good' : v >= 50 ? 'ok' : 'bad';
    const competitorCount = results.filter(r => r.isCompetitor).length;

    let html = `<div class="crm-header">
        <h2 class="crm-title">${validResults.length} Leads für "${query}"${competitorCount > 0 ? ` <span class="metric-desc">(${competitorCount} Konkurrenten gefiltert)</span>` : ''}</h2>
        <div class="crm-actions-top">
            <button class="crm-btn-export" id="btn-export-csv">CSV Export</button>
            <button class="crm-btn-export" id="btn-save-batch" style="background:var(--text);color:#fff">${results.length} speichern</button>
        </div>
    </div>`;

    // Portfolio
    html += `<div class="card anim-in" style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px">
        <div><div class="section-label">P(min. 1 Conversion)</div><div class="revenue-big" style="color:var(--green)">${portfolio.atLeastOne}%</div></div>
        <div><div class="section-label">Erwartete Conversions</div><div class="revenue-big">${portfolio.expectedConversions}</div></div>
    </div>`;

    // Table
    html += `<div style="overflow-x:auto"><table class="data-table" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius)">
        <thead><tr><th style="text-align:left">Unternehmen</th><th>Branche</th><th>★</th><th>Bew.</th><th>Perf.</th><th>BFSG</th><th>Score</th></tr></thead><tbody>`;

    const bfsgBadge = risk => risk === 'kritisch' ? 'badge-red' : risk === 'hoch' ? 'badge-orange' : risk === 'mittel' ? 'badge-orange' : 'badge-green';
    const bfsgLabel = risk => risk === 'kritisch' ? '✗' : risk === 'hoch' ? '⚠' : risk === 'mittel' ? '~' : '✓';

    for (const r of results) {
        const dimmed = r.isCompetitor ? ' style="opacity:0.4"' : '';
        html += `<tr${dimmed}><td><strong>${r.name}</strong><br><a href="${r.url}" target="_blank" style="font-size:11px">${r.domain}</a></td>
            <td>${r.type}</td>
            <td>${r.rating || '—'}</td>
            <td>${r.reviews}</td>
            <td class="${perf(r.perf)}">${r.perf}</td>
            <td><span class="badge ${bfsgBadge(r.bfsgRisk)}" title="BFSG ${r.bfsgScore || '?'}%">${bfsgLabel(r.bfsgRisk)}</span></td>
            <td><span class="badge ${r.isCompetitor ? 'badge-red' : sc(r.leadScore)}">${r.isCompetitor ? '✗' : r.leadScore}</span></td>
        </tr>
        <tr${dimmed}><td colspan="7" style="padding:4px 12px 12px;font-size:12px;color:var(--muted);border-bottom:2px solid var(--border)">${
            r.isCompetitor ? '<strong style="color:var(--red)">→ Konkurrenz — übersprungen.</strong>'
            : r.leadScore >= 55 ? `<strong class="good">→ Kontaktieren.</strong> ${r.reasons}`
            : r.leadScore >= 30 ? `<strong class="ok">→ Möglich.</strong> ${r.reasons}`
            : `<strong class="bad">→ Überspringen.</strong> ${r.reasons}`
        }</td></tr>`;
    }
    html += '</tbody></table></div>';

    const el = document.getElementById('batch-results');
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth' });

    // Events
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
        exportBatchCSV(results);
        showToast(`${results.length} Leads exportiert`);
    });
    document.getElementById('btn-save-batch')?.addEventListener('click', async function() {
        for (const r of results.filter(r => !r.isCompetitor)) await saveLead(r.domain, r.url, r);
        this.textContent = `${validResults.length} gespeichert ✓`;
        this.disabled = true;
        showToast(`${validResults.length} Leads im CRM gespeichert`);
    });
}

function exportBatchCSV(results) {
    const headers = ['Name','Domain','URL','Branche','Sterne','Bewertungen','Performance','SEO','A11y','CMS','Score','Konkurrenz','Gründe'];
    const rows = results.map(r => [r.name,r.domain,r.url,r.type,r.rating,r.reviews,r.perf,r.seo,r.a11y,r.cms,r.leadScore,r.isCompetitor?'Ja':'Nein',r.reasons]);
    const csv = [headers,...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
    a.download = `karriaro-leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}

function showLoading(t) { document.getElementById('loading-text').textContent = t; document.getElementById('loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }
function showProgress(pct, t) { document.getElementById('progress').classList.remove('hidden'); document.getElementById('progress-fill').style.width = pct+'%'; document.getElementById('progress-text').textContent = t; }
function hideProgress() { document.getElementById('progress').classList.add('hidden'); }
function showError(t) { document.getElementById('error-text').textContent = t; document.getElementById('error').classList.remove('hidden'); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
