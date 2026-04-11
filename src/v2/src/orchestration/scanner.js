/**
 * Branchen-Scanner — Testet alle 18 Branchen in einer Stadt
 */
import { state } from '../state.js';
import { config } from '../config.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces } from '../api/places.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { scoreLead } from '../scoring/lead-scorer.js';

const BRANCHES = [
    { key:'dentist', q:'Zahnarzt', name:'Zahnärzte' }, { key:'hair_salon', q:'Friseur', name:'Friseure' },
    { key:'restaurant', q:'Restaurant', name:'Restaurants' }, { key:'auto_repair', q:'KFZ Werkstatt', name:'KFZ-Werkstätten' },
    { key:'beauty_salon', q:'Kosmetikstudio', name:'Kosmetikstudios' }, { key:'physiotherapist', q:'Physiotherapie', name:'Physiotherapie' },
    { key:'lawyer', q:'Rechtsanwalt', name:'Rechtsanwälte' }, { key:'real_estate_agency', q:'Immobilienmakler', name:'Immobilienmakler' },
    { key:'hotel', q:'Hotel', name:'Hotels' }, { key:'plumber', q:'Sanitär Heizung', name:'Sanitärbetriebe' },
    { key:'electrician', q:'Elektriker', name:'Elektrobetriebe' }, { key:'veterinary_care', q:'Tierarzt', name:'Tierärzte' },
    { key:'gym', q:'Fitnessstudio', name:'Fitnessstudios' }, { key:'moving_company', q:'Umzugsunternehmen', name:'Umzugsfirmen' },
    { key:'car_dealer', q:'Autohaus', name:'Autohäuser' }, { key:'bakery', q:'Bäckerei', name:'Bäckereien' },
    { key:'florist', q:'Blumenladen', name:'Floristen' }, { key:'cafe', q:'Cafe', name:'Cafés' }
];

export async function runScanner() {
    const city = document.getElementById('scanner-city').value.trim();
    if (!city) return;
    if (!config.fnUrl) { showError('Scanner braucht Cloud Function URL.'); return; }
    state.aborted = false;
    document.getElementById('btn-scanner').disabled = true;

    const results = [];
    showProgress(0, `Scanne 0/${BRANCHES.length}...`);

    // Phase 1: Alle Places-Suchen parallel (schnell, nur API-Calls)
    showProgress(10, 'Suche Unternehmen in allen Branchen...');
    const placeResults = await Promise.all(
        BRANCHES.map(b => searchPlaces(`${b.q} ${city}`, 3).catch(() => null))
    );
    if (state.aborted) { hideProgress(); document.getElementById('btn-scanner').disabled = false; return; }

    // Phase 2: Je 1 PageSpeed-Call pro Branche — in 3er-Batches parallel
    const BATCH_SIZE = 3;
    for (let i = 0; i < BRANCHES.length; i += BATCH_SIZE) {
        if (state.aborted) break;
        const batch = BRANCHES.slice(i, i + BATCH_SIZE);
        showProgress(Math.round(((i + batch.length) / BRANCHES.length) * 100), `${i + batch.length}/${BRANCHES.length}: ${batch.map(b => b.name).join(', ')}...`);

        const batchPromises = batch.map(async (b, bIdx) => {
            const idx = i + bIdx;
            const places = (placeResults[idx]?.places || []).filter(p => p.websiteUri);
            if (!places.length) return { ...b, city, avgScore: 0, count: 0, tested: 0, avgPerf: 0 };

            // Nur 1 Place testen (statt 2) — spart 50% der Zeit
            try {
                const psi = await fetchPageSpeed(places[0].websiteUri);
                const ws = extractWebsiteScore(psi);
                const tech = detectTech(psi);
                const prob = scoreLead(ws, tech, places[0], null, null);
                return {
                    ...b, city,
                    avgScore: prob.leadScore,
                    avgPerf: ws.perf,
                    count: places.length, tested: 1,
                    baukastenPct: tech.isBaukasten ? 100 : 0
                };
            } catch (e) {
                return { ...b, city, avgScore: 0, count: places.length, tested: 0, avgPerf: 0, error: e.message };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Kurzer Delay zwischen Batches (API-Rate-Limit)
        if (i + BATCH_SIZE < BRANCHES.length && !state.aborted) await delay(500);
    }

    hideProgress();
    document.getElementById('btn-scanner').disabled = false;
    if (state.aborted) return;

    results.sort((a,b) => b.avgScore - a.avgScore);
    renderScannerResults(city, results);
}

function renderScannerResults(city, results) {
    const best = results.find(r => r.avgScore > 0);
    const sc = v => v >= 55 ? 'badge-green' : v >= 30 ? 'badge-orange' : 'badge-red';
    const perf = v => v >= 75 ? 'good' : v >= 50 ? 'ok' : 'bad';

    let html = `<h2 class="crm-title" style="margin-bottom:16px">Branchen-Ranking für ${city}</h2>`;

    // Top 3 Empfehlungen
    const top3 = results.filter(r => r.avgScore > 0).slice(0, 3);
    if (top3.length > 0) {
        html += `<div class="science-grid" style="grid-template-columns:repeat(${Math.min(top3.length, 3)},1fr);margin-bottom:16px">`;
        top3.forEach((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            html += `<div class="card card-accent anim-in">
                <div class="section-label-accent">${medal} #${i+1} Potenzial</div>
                <div style="font-size:1.1rem;font-weight:700">${r.name}</div>
                <div class="metric-desc">Score ${r.avgScore} · Perf ${r.avgPerf} ${r.baukastenPct > 0 ? `· ${r.baukastenPct}% Baukasten` : ''}</div>
                <div class="metric-desc" style="margin-top:4px">→ "${r.q} ${city}"</div>
            </div>`;
        });
        html += `</div>`;
    }

    // Tabelle
    html += `<div style="overflow-x:auto"><table class="data-table" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius)">
        <thead><tr><th style="text-align:left">#</th><th style="text-align:left">Branche</th><th>Score</th><th>Perf.</th><th>Baukasten</th><th>Gefunden</th></tr></thead><tbody>`;

    results.forEach((r, i) => {
        html += `<tr>
            <td style="font-weight:700;color:var(--muted)">${i+1}</td>
            <td><strong>${r.name}</strong>${r.error ? `<br><span style="font-size:11px;color:var(--red)">${r.error}</span>` : ''}</td>
            <td><span class="badge ${sc(r.avgScore)}">${r.avgScore || '—'}</span></td>
            <td class="${perf(r.avgPerf)}">${r.avgPerf || '—'}</td>
            <td>${r.baukastenPct > 0 ? `<span class="badge badge-orange">${r.baukastenPct}%</span>` : '—'}</td>
            <td style="color:var(--muted)">${r.tested}/${r.count}</td>
        </tr>`;
    });
    html += '</tbody></table></div>';

    const el = document.getElementById('batch-results');
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth' });
}

function showProgress(pct, t) { document.getElementById('progress').classList.remove('hidden'); document.getElementById('progress-fill').style.width=pct+'%'; document.getElementById('progress-text').textContent=t; }
function hideProgress() { document.getElementById('progress').classList.add('hidden'); }
function showError(t) { document.getElementById('error-text').textContent=t; document.getElementById('error').classList.remove('hidden'); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
