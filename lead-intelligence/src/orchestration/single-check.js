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
import { calculateEntropy } from '../analysis/entropy.js';
import { calculateActivation } from '../analysis/activation.js';
import { calculateEpidemic } from '../analysis/epidemic.js';
import { calculateShannon } from '../analysis/shannon.js';
import { calculateKahneman } from '../analysis/kahneman.js';
import { auditUX } from '../analysis/ux-audit.js';
import { analyzeFutureReadiness } from '../analysis/future-readiness.js';
import { detectGoogleAds } from '../signals/google-ads.js';
import { detectJobSignals } from '../signals/job-signal.js';

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

    // ── Branchen-UX-Audit ──
    const uxResult = auditUX(data.psiData, data.place);
    const uxEl = document.getElementById('result-ux');
    if (uxResult && uxResult.results) {
        const uxColor = uxResult.uxScore >= 70 ? 'var(--green)' : uxResult.uxScore >= 40 ? 'var(--orange)' : 'var(--red)';
        uxEl.innerHTML = `
            <div class="card" style="border-left:3px solid var(--accent);margin-bottom:12px">
                <div style="font-size:12px;color:var(--muted);font-style:italic;margin-bottom:8px">"${uxResult.persona.persona}"</div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">UX-Score: </span><span style="font-size:1.5rem;font-weight:700;color:${uxColor}">${uxResult.uxScore}/100</span></div>
                    <div style="font-size:12px"><span style="color:var(--green);font-weight:700">${uxResult.found.length} vorhanden</span> · <span style="color:var(--red);font-weight:700">${uxResult.missing.length} fehlen</span></div>
                </div>
            </div>
            <div class="card" style="margin-bottom:12px">
                ${uxResult.results.map(f => `<div class="stat-row"><span class="stat-label"><span style="color:${f.found ? 'var(--green)' : f.critical ? 'var(--red)' : 'var(--orange)'};font-weight:700;margin-right:6px">${f.found ? '✓' : '✗'}</span>${f.name}${f.critical && !f.found ? ' <span style="font-size:10px;color:var(--red)">(kritisch)</span>' : ''}</span><span class="stat-value" style="font-size:11px;font-weight:400;color:var(--muted);max-width:50%">${f.found ? 'Vorhanden' : f.why}</span></div>`).join('')}
            </div>
            ${uxResult.missing.length > 0 ? `<div class="pitch-box" style="margin-bottom:12px"><h3>Stärkstes Pitch-Argument</h3><p>${uxResult.topPitch}</p></div>` : ''}
            <div class="card" style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:8px">Was eine moderne ${uxResult.persona.name}-Website 2026 braucht</div><div style="display:flex;flex-wrap:wrap;gap:6px">${uxResult.modernFeatures.map(f => `<span class="badge badge-green">${f}</span>`).join('')}</div></div>
        `;
    } else { uxEl.innerHTML = ''; }

    // ── Zukunfts-Readiness ──
    const futureResult = analyzeFutureReadiness(data.ws, data.psiData);
    const futureEl = document.getElementById('result-future');
    if (futureResult) {
        const fcColor = futureResult.readinessScore >= 75 ? 'var(--green)' : futureResult.readinessScore >= 40 ? 'var(--orange)' : 'var(--red)';
        futureEl.innerHTML = `
            <div class="card" style="border-left:3px solid ${fcColor};margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Readiness 2026: </span><span style="font-size:1.5rem;font-weight:700;color:${fcColor}">${futureResult.readinessScore}/100</span> <span style="font-size:12px;color:var(--muted)">${futureResult.label}</span></div>
                    <div style="font-size:12px"><span style="color:var(--green)">${futureResult.passed.length} ✓</span> · <span style="color:var(--red)">${futureResult.failed.length} ✗</span></div>
                </div>
            </div>
            <div class="card" style="margin-bottom:12px">
                ${futureResult.results.map(c => `<div class="stat-row"><span class="stat-label"><span style="color:${c.passed ? 'var(--green)' : c.weight >= 3 ? 'var(--red)' : 'var(--orange)'};font-weight:700;margin-right:6px">${c.passed ? '✓' : '✗'}</span>${c.name}${c.weight >= 3 ? ' <span style="font-size:9px;color:var(--red);font-weight:700">PFLICHT</span>' : ''}</span><span class="stat-value" style="font-size:11px;font-weight:400;color:var(--muted);max-width:55%">${c.passed ? 'Bestanden' : c.stat}</span></div>`).join('')}
            </div>
        `;
    } else { futureEl.innerHTML = ''; }

    // ── Wissenschaftliche Analyse ──
    const sciEl = document.getElementById('result-science');
    try {
        const entropy = calculateEntropy(data.psiData, data.tech);
        const activation = calculateActivation(data.ws, data.tech, data.place, data.competitors, data.revenue);
        const r0 = calculateEpidemic(data.place, data.competitors);
        const ads = detectGoogleAds(data.psiData);
        const jobs = detectJobSignals(data.psiData);
        const kahneman = calculateKahneman(data.ws, data.tech, data.place, data.revenue, activation);

        const sc = v => v >= 0.6 ? 'good' : v >= 0.3 ? 'ok' : 'bad';
        sciEl.innerHTML = `
            <div class="scores-grid" style="grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px">
                <div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Thermo-Entropie</div><div style="font-size:1.8rem;font-weight:700" class="${sc(entropy?.S)}">${entropy?.S ?? '—'}</div><div style="font-size:12px;color:var(--muted)">${entropy?.label || ''}</div></div>
                <div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Aktivierungsenergie</div><div style="font-size:1.8rem;font-weight:700" class="${activation?.Ea <= 25 ? 'good' : activation?.Ea <= 45 ? 'ok' : 'bad'}">${activation?.Ea ?? '—'} kJ</div><div style="font-size:12px;color:var(--muted)">${activation?.label || ''}</div></div>
                <div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Epidemischer R₀</div><div style="font-size:1.8rem;font-weight:700" class="${r0?.R0 >= 2 ? 'good' : r0?.R0 >= 1 ? 'ok' : 'bad'}">${r0?.R0 ?? '—'}</div><div style="font-size:12px;color:var(--muted)">${r0?.label || ''}</div></div>
                <div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Google Ads</div><div style="font-size:1.8rem;font-weight:700;color:${ads?.active ? 'var(--green)' : 'var(--muted)'}">${ads?.active ? 'Aktiv' : 'Nein'}</div><div style="font-size:12px;color:var(--muted)">${ads?.insight || ''}</div></div>
            </div>
            ${kahneman ? `<div class="card" style="margin-bottom:12px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px">Kahneman-Entscheidungsprofil</div>
                <div style="display:flex;gap:24px;margin-bottom:8px">
                    <div style="flex:1;text-align:center"><div style="font-size:1.5rem;font-weight:700;color:${kahneman.system1 > 55 ? 'var(--red)' : 'var(--muted)'}">${kahneman.system1}%</div><div style="font-size:11px;color:var(--muted)">System 1 (emotional)</div></div>
                    <div style="flex:1;text-align:center"><div style="font-size:1.5rem;font-weight:700;color:${kahneman.system2 > 55 ? 'var(--accent)' : 'var(--muted)'}">${kahneman.system2}%</div><div style="font-size:11px;color:var(--muted)">System 2 (rational)</div></div>
                </div>
                <div style="font-size:13px;font-weight:600">${kahneman.pitchStrategy?.approach || ''}</div>
            </div>` : ''}
            ${jobs?.isHiring ? `<div class="card" style="margin-bottom:12px"><span class="badge badge-green">Stellt ein — wachsendes Unternehmen</span></div>` : ''}
        `;
    } catch (e) { sciEl.innerHTML = `<div class="card" style="color:var(--muted);font-size:12px">Wissenschaftliche Module: ${e.message}</div>`; }

    // ── KI-Analyse ──
    const aiEl = document.getElementById('result-ai');
    const { contentAnalysis: ca, screenshotAnalysis: sa, reviewSentiment: rs, domainAge: da, domainAuthority: dau, searchVolume: sv } = data;
    let aiHtml = '';
    if (ca && !ca.error) {
        aiHtml += `<div class="card" style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px">KI Content-Analyse</div>
            <div class="stat-row"><span class="stat-label">Tonalität</span><span class="stat-value">${ca.tonality || '—'}</span></div>
            <div class="stat-row"><span class="stat-label">Aktualität</span><span class="stat-value">${ca.freshness || '—'}${ca.copyrightYear ? ' (©'+ca.copyrightYear+')' : ''}</span></div>
            <div class="stat-row"><span class="stat-label">USP</span><span class="stat-value">${ca.hasUSP ? 'Ja' : 'Nein'}</span></div>
            <div class="stat-row"><span class="stat-label">CTA</span><span class="stat-value">${ca.hasCTA ? 'Ja' : 'Fehlt'}</span></div>
            ${ca.summary ? `<div style="font-size:12px;color:var(--muted);margin-top:8px;font-style:italic">"${ca.summary}"</div>` : ''}
        </div>`;
    }
    if (sa && !sa.error) {
        aiHtml += `<div class="card" style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px">KI Design-Bewertung</div>
            <div class="stat-row"><span class="stat-label">Design-Qualität</span><span class="stat-value" style="color:${(sa.designQuality||0) >= 7 ? 'var(--green)' : 'var(--red)'}">${sa.designQuality || '—'}/10</span></div>
            <div class="stat-row"><span class="stat-label">Design-Ära</span><span class="stat-value">${sa.designEra || '—'}</span></div>
            ${sa.overallImpression ? `<div style="font-size:12px;color:var(--muted);margin-top:8px;font-style:italic">"${sa.overallImpression}"</div>` : ''}
        </div>`;
    }
    if (da?.age || dau?.pageRank || sv?.suggestions > 0) {
        aiHtml += `<div class="scores-grid" style="grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px">`;
        if (da?.age) aiHtml += `<div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Domain-Alter</div><div style="font-size:1.5rem;font-weight:700">${da.age} Jahre</div></div>`;
        if (dau?.pageRank) aiHtml += `<div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Domain Authority</div><div style="font-size:1.5rem;font-weight:700">${dau.pageRank}</div></div>`;
        if (sv?.suggestions > 0) aiHtml += `<div class="card"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Suchvolumen</div><div style="font-size:1.5rem;font-weight:700;color:${sv.hasVolume ? 'var(--green)' : 'var(--muted)'}">${sv.hasVolume ? 'Hoch' : 'Niedrig'}</div></div>`;
        aiHtml += `</div>`;
    }
    aiEl.innerHTML = aiHtml;

    // ── Umsatzverlust ──
    const revEl = document.getElementById('result-revenue');
    const rev = data.revenue;
    if (rev && rev.yearlyLoss > 0) {
        revEl.innerHTML = `<div class="card" style="margin-bottom:12px">
            <div style="font-size:2rem;font-weight:800;color:var(--red);letter-spacing:-0.03em">~${rev.yearlyLoss.toLocaleString('de-DE')} €<span style="font-size:14px;font-weight:400;color:var(--muted)">/Jahr</span></div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px">80%-Intervall: ${rev.yearlyLow?.toLocaleString('de-DE') || '?'} € — ${rev.yearlyHigh?.toLocaleString('de-DE') || '?'} € (Monte-Carlo)</div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px">~${rev.estMonthlyVisitors} Besucher/Monat · ROI einer neuen Website: <strong style="color:var(--green)">${rev.roi}x</strong></div>
        </div>`;
    } else { revEl.innerHTML = ''; }

    // ── Expert ──
    document.getElementById('result-expert').innerHTML = `<div class="card"><pre style="font-size:11px;overflow-x:auto;max-height:400px">${JSON.stringify(r, null, 2)}</pre></div>`;

    // ── Actions ──
    document.getElementById('result-actions').innerHTML = `
        <div style="text-align:center;padding:24px 0">
            <button class="btn-primary" style="margin-right:12px;background:var(--text)" onclick="alert('CRM-Save wird in nächster Version aktiviert')">Im CRM speichern</button>
            <a href="https://karriaro-webdesign.de/#kontakt" class="btn-primary" style="display:inline-block;text-decoration:none">Kostenlos beraten lassen</a>
        </div>
    `;
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
