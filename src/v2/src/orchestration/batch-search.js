/**
 * Batch Search Workflow
 */
import { state } from '../state.js';
import { config } from '../config.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces } from '../api/places.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { scoreLead } from '../scoring/lead-scorer.js';
import { portfolioProbability } from '../scoring/portfolio.js';
import { saveLead } from '../crm/leads.js';

export async function runBatchSearch() {
    const query = document.getElementById('batch-query').value.trim();
    if (!query) return;
    if (!config.fnUrl) { showError('Batch braucht Cloud Function URL. Bitte in Einstellungen konfigurieren.'); return; }
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
    showProgress(0, `0 von ${places.length} analysiert...`);

    const results = [];
    for (let i = 0; i < places.length; i++) {
        if (state.aborted) break;
        const p = places[i];
        showProgress(Math.round(((i + 1) / places.length) * 100), `${i + 1}/${places.length}: ${p.displayName?.text || ''}...`);

        try {
            const psiData = await fetchPageSpeed(p.websiteUri);
            const ws = extractWebsiteScore(psiData);
            const tech = detectTech(psiData);
            const prob = scoreLead(ws, tech, p, null, null);
            const domain = new URL(p.websiteUri).hostname.replace('www.', '');

            results.push({
                name: p.displayName?.text || domain, domain, url: p.websiteUri,
                rating: p.rating, reviews: p.userRatingCount || 0,
                type: p.primaryTypeDisplayName?.text || '—',
                perf: ws.perf, seo: ws.seo, a11y: ws.a11y,
                cms: tech.cms, isBaukasten: tech.isBaukasten,
                leadScore: prob.leadScore, conversionRate: prob.conversionRate,
                ciMargin: prob.ciMargin, expectedValue: prob.expectedValue,
                timePerLead: prob.timePerLead, probability: prob.leadScore
            });
        } catch (e) { /* skip */ }

        if (i < places.length - 1) await delay(2000);
    }

    hideProgress();
    document.getElementById('btn-batch').disabled = false;
    if (state.aborted || !results.length) return;

    results.sort((a, b) => b.leadScore - a.leadScore);
    renderBatchResults(query, results);
}

function renderBatchResults(query, results) {
    const portfolio = portfolioProbability(results);
    const sc = v => v >= 55 ? 'badge-green' : v >= 30 ? 'badge-orange' : 'badge-red';
    const perf = v => v >= 75 ? 'good' : v >= 50 ? 'ok' : 'bad';

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="font-size:1.2rem;font-weight:700">${results.length} Leads für "${query}"</h2>
        <div><button class="btn-primary" style="font-size:12px;padding:8px 16px;background:var(--card);color:var(--text);border:1px solid var(--border)" id="btn-export-csv">CSV Export</button>
        <button class="btn-primary" style="font-size:12px;padding:8px 16px;margin-left:8px;background:var(--text)" id="btn-save-batch">Im CRM speichern</button></div>
    </div>`;

    // Portfolio
    html += `<div class="card" style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px">
        <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">P(min. 1 Conversion)</div><div style="font-size:2rem;font-weight:800;color:var(--green)">${portfolio.atLeastOne}%</div></div>
        <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Erwartete Conversions</div><div style="font-size:2rem;font-weight:800">${portfolio.expectedConversions}</div></div>
    </div>`;

    // Table
    html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius)">
        <thead><tr><th style="text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);padding:12px;border-bottom:1px solid var(--border)">Unternehmen</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Branche</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">★</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Bew.</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Perf.</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Score</th></tr></thead><tbody>`;

    for (const r of results) {
        html += `<tr><td style="padding:12px;border-bottom:1px solid var(--border)"><strong>${r.name}</strong><br><a href="${r.url}" target="_blank" style="font-size:11px">${r.domain}</a></td>
            <td style="padding:12px;border-bottom:1px solid var(--border)">${r.type}</td>
            <td style="padding:12px;border-bottom:1px solid var(--border)">${r.rating || '—'}</td>
            <td style="padding:12px;border-bottom:1px solid var(--border)">${r.reviews}</td>
            <td style="padding:12px;border-bottom:1px solid var(--border)" class="${perf(r.perf)}">${r.perf}</td>
            <td style="padding:12px;border-bottom:1px solid var(--border)"><span class="badge ${sc(r.leadScore)}">${r.leadScore}</span></td>
        </tr>
        <tr><td colspan="6" style="padding:4px 12px 12px;font-size:12px;color:var(--muted);border-bottom:2px solid var(--border)">${r.leadScore >= 55 ? '<strong style="color:var(--green)">→ Kontaktieren.</strong> ' : r.leadScore >= 30 ? '<strong style="color:var(--orange)">→ Möglich.</strong> ' : '<strong style="color:var(--red)">→ Überspringen.</strong> '}${r.perf < 50 ? `Perf ${r.perf}. ` : ''}${r.isBaukasten ? r.cms + '. ' : ''}${r.reviews > 50 ? r.reviews + ' Bewertungen. ' : ''}</td></tr>`;
    }
    html += '</tbody></table></div>';

    const el = document.getElementById('batch-results');
    el.innerHTML = html;
    el.classList.remove('hidden');

    // Event Listeners
    document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCSV(results));
    document.getElementById('btn-save-batch')?.addEventListener('click', async function() {
        for (const r of results) await saveLead(r.domain, r.url, r);
        this.textContent = `${results.length} gespeichert ✓`; this.disabled = true;
    });
}

function exportCSV(results) {
    const headers = ['Name','Domain','URL','Branche','Sterne','Bewertungen','Performance','SEO','CMS','Score'];
    const rows = results.map(r => [r.name,r.domain,r.url,r.type,r.rating,r.reviews,r.perf,r.seo,r.cms,r.leadScore]);
    const csv = [headers,...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
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
