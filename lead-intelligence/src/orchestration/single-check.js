/**
 * Single Check Workflow — Orchestriert den gesamten Einzel-Analyse-Prozess
 */
import { state } from '../state.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces, nearbyPlaces } from '../api/places.js';
import { analyzeContent, analyzeScreenshot, analyzeReviews, getDomainAge, getDomainAuthority, getSearchVolume } from '../api/cloud-functions.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { analyzeDigitalFootprint as analyzeFootprint } from '../signals/digital-footprint.js';
import { scoreLead } from '../scoring/lead-scorer.js';
import { calculateRevenueLoss } from '../math/revenue-model.js';

export async function runSingleCheck() {
    let url = document.getElementById('url-input').value.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = 'https://' + url;
    state.aborted = false;

    // Reset UI
    const results = document.getElementById('results');
    results.classList.add('hidden');
    document.getElementById('batch-results').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('btn-analyze').disabled = true;

    try {
        // Phase 1: PageSpeed
        showLoading('Website wird analysiert...');
        const psiData = await fetchPageSpeed(url);
        if (state.aborted) return cleanup();

        const ws = extractWebsiteScore(psiData);
        const tech = detectTech(psiData);
        const footprint = analyzeFootprint(psiData);

        // Phase 2: Business-Daten
        showLoading('Business-Daten werden geladen...');
        const domain = new URL(url).hostname.replace('www.', '');
        let place = null;
        try {
            const placesData = await searchPlaces(domain, 1);
            if (placesData?.places?.length > 0) place = placesData.places[0];
        } catch (e) { /* optional */ }
        if (state.aborted) return cleanup();

        // Phase 3: Konkurrenz
        showLoading('Konkurrenz wird verglichen...');
        let competitors = [];
        if (place?.location && place?.primaryType) {
            try {
                const nearby = await nearbyPlaces(place.location.latitude, place.location.longitude, place.primaryType, 6);
                competitors = (nearby?.places || []).filter(p => p.websiteUri);
            } catch (e) { /* optional */ }
        }
        if (state.aborted) return cleanup();

        // Phase 4: Scoring
        showLoading('Lead wird bewertet...');
        const revenue = calculateRevenueLoss(ws, place);
        const result = scoreLead(ws, tech, place, competitors, footprint, revenue);

        // Phase 5: KI-Analyse (parallel)
        showLoading('KI-Analyse...');
        const screenshot = psiData?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;
        const [contentAnalysis, screenshotAnalysis, reviewSentiment, domainAge, domainAuthority, searchVolume] = await Promise.all([
            analyzeContent(url),
            analyzeScreenshot(screenshot),
            analyzeReviews(domain),
            getDomainAge(domain),
            getDomainAuthority(domain),
            getSearchVolume(`${place?.primaryTypeDisplayName?.text || ''} ${place?.formattedAddress?.split(',').pop()?.trim() || ''}`.trim() || domain)
        ]);

        // Render
        hideLoading();
        document.getElementById('btn-analyze').disabled = false;

        state.lastResult = { url, ws, tech, place, competitors, footprint, result, revenue, screenshot,
            contentAnalysis, screenshotAnalysis, reviewSentiment, domainAge, domainAuthority, searchVolume, psiData };

        renderResult(state.lastResult);
        results.classList.remove('hidden');

    } catch (e) {
        hideLoading();
        document.getElementById('btn-analyze').disabled = false;
        document.getElementById('error-text').textContent = `Analyse fehlgeschlagen: ${e.message}`;
        document.getElementById('error').classList.remove('hidden');
    }
}

function renderResult(data) {
    // Score section
    const scoreEl = document.getElementById('result-score');
    const r = data.result;
    const color = r.leadScore >= 55 ? 'var(--green)' : r.leadScore >= 30 ? 'var(--orange)' : 'var(--red)';
    const label = r.leadScore >= 55 ? 'Starker Lead — kontaktieren' : r.leadScore >= 30 ? 'Vielversprechend — Quick-Pitch' : 'Schwacher Lead';

    scoreEl.innerHTML = `
        <div style="text-align:center;margin-bottom:32px">
            <div style="font-size:4rem;font-weight:800;color:${color};letter-spacing:-0.04em">${r.leadScore}</div>
            <div style="font-size:14px;color:var(--muted)">Conversion-Rate: ${r.conversionRate}% · CI: ${r.ci.lower}% — ${r.ci.upper}% (N=${r.N})</div>
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${color};margin-top:8px">${label}</div>
        </div>
    `;

    // Funnel section
    const funnelEl = document.getElementById('result-funnel');
    funnelEl.innerHTML = r.stages.map(s => {
        const barColor = s.mean >= 50 ? 'var(--green)' : s.mean >= 25 ? 'var(--orange)' : 'var(--red)';
        const isBn = r.bottleneck && s.name === r.bottleneck.name;
        return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:13px;color:var(--muted);width:120px">${isBn ? '⚠ ' : ''}${s.name}</span>
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${s.mean}%;background:${barColor};border-radius:3px"></div></div>
            <span style="font-size:13px;font-weight:700;width:40px;text-align:right">${s.mean}%</span>
        </div>`;
    }).join('');

    // Decision section
    const decEl = document.getElementById('result-decision');
    decEl.innerHTML = `
        <div class="card" style="border-left:3px solid var(--accent)">
            <div class="stat-row"><span class="stat-label">Erwarteter Wert</span><span class="stat-value">${r.expectedValue > 0 ? '+' : ''}${r.expectedValue} €</span></div>
            <div class="stat-row"><span class="stat-label">Kelly-Allokation</span><span class="stat-value">${r.kelly.optimalHours}h/Woche · ${r.kelly.recommendation}</span></div>
            <div class="stat-row"><span class="stat-label">Bester Kanal</span><span class="stat-value">${r.channelResult.best?.name || 'E-Mail'}</span></div>
            <div class="stat-row"><span class="stat-label">Time-to-Conversion</span><span class="stat-value">${r.survival.label}</span></div>
            <div class="stat-row"><span class="stat-label">Nächste Aktion</span><span class="stat-value">${r.nextAction.action}</span></div>
        </div>
    `;

    // Placeholder for other sections — Phase 7 will fill these
    document.getElementById('result-ux').innerHTML = '<div class="card" style="color:var(--muted);text-align:center;padding:24px">UX-Audit — wird mit vollständiger Migration aktiviert</div>';
    document.getElementById('result-future').innerHTML = '';
    document.getElementById('result-science').innerHTML = '<div class="card" style="color:var(--muted);text-align:center;padding:24px">Wissenschaftliche Module — wird mit vollständiger Migration aktiviert</div>';
    document.getElementById('result-ai').innerHTML = '';
    document.getElementById('result-revenue').innerHTML = '';
    document.getElementById('result-strategy').innerHTML = '';
    document.getElementById('result-expert').innerHTML = `<div class="card"><pre style="font-size:11px;overflow-x:auto">${JSON.stringify(r, null, 2).slice(0, 2000)}</pre></div>`;
    document.getElementById('result-actions').innerHTML = '';
}

function showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function cleanup() {
    hideLoading();
    document.getElementById('btn-analyze').disabled = false;
}
