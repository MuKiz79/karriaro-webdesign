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
import { checkFreshness } from '../analysis/wayback-freshness.js';
import { detectSurgeIntent } from '../analysis/surge-intent.js';
import { assessDigitalMaturity } from '../analysis/digital-maturity.js';
import { assessConversationReadiness } from '../analysis/conversation-ready.js';
import { detectStakeholder } from '../analysis/stakeholder.js';
import { assessTechTrajectory } from '../analysis/tech-trajectory.js';
import { assessLocalSEO } from '../analysis/local-seo.js';
import { assessEmotionalReadiness } from '../analysis/emotional-readiness.js';
import { calculateRevenueWeighted } from '../scoring/revenue-weighted.js';
import { detectJobSignals } from '../signals/job-signal.js';
import { generateGoogleReport } from '../strategy/google-report.js';

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

        // Fix 4: A/B-Test Variante wählen
        const { selectVariant, checkDrift } = await import('../main.js');
        const abTest = selectVariant();

        // ── 10 innovative Analyse-Module (parallel wo möglich) ──
        const wayback = await checkFreshness(url).catch(() => null);
        const surgeIntent = detectSurgeIntent(footprint, null, null, place);
        const digitalMaturity = assessDigitalMaturity(footprint, null, psiData);
        const conversationReady = assessConversationReadiness(ws, tech, place, wayback, null);
        const stakeholder = detectStakeholder(psiData, place);
        const techTrajectory = assessTechTrajectory(tech, wayback);
        const localSEO = assessLocalSEO(ws, place, psiData);
        const emotionalReady = assessEmotionalReadiness(reviewSentiment);
        const revenueWeighted = calculateRevenueWeighted(result.conversionRate / 100, place?.primaryType || '_default', result.dealSize);

        // Fix 5: Score-Drift prüfen
        const drift = checkDrift(new URL(url).hostname.replace('www.', ''), result.leadScore);

        state.lastResult = { url, ws, tech, place, competitors, footprint, result, revenue, screenshot,
            contentAnalysis, screenshotAnalysis, reviewSentiment, domainAge, domainAuthority, searchVolume, psiData,
            abTest, drift, wayback, surgeIntent, digitalMaturity, conversationReady, stakeholder,
            techTrajectory, localSEO, emotionalReady, revenueWeighted };

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
    const r = data.result;
    const ws = data.ws;
    const tech = data.tech;
    const domain = new URL(data.url).hostname.replace('www.', '');
    const color = r.leadScore >= 55 ? 'var(--green)' : r.leadScore >= 30 ? 'var(--orange)' : 'var(--red)';
    const label = r.leadScore >= 55 ? 'Starker Lead — kontaktieren' : r.leadScore >= 30 ? 'Vielversprechend — Quick-Pitch' : 'Schwacher Lead';

    // UX-Audit VOR Erklärung berechnen (branchenspezifische Features)
    const uxForExplanation = auditUX(data.psiData, data.place);

    // ── #12: Klartext-Erklärung generieren (inkl. fehlender Branchen-Features) ──
    const explanation = generateExplanation(r, ws, tech, data, uxForExplanation);

    // ── Score + Erklärung ──
    const scoreEl = document.getElementById('result-score');
    scoreEl.innerHTML = `
        <div style="text-align:center;margin-bottom:32px">
            <div style="font-size:4rem;font-weight:800;color:${color};letter-spacing:-0.04em">${r.leadScore}</div>
            <div style="font-size:14px;color:var(--muted)">Conversion-Rate: ${r.conversionRate}% · CI: ${r.ci.lower}% — ${r.ci.upper}% (N=${r.N})</div>
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${color};margin-top:8px">${label}</div>
            <div style="max-width:480px;margin:20px auto 0;padding:16px 20px;background:var(--bg);border-radius:12px;text-align:left;font-size:13px;line-height:1.65;color:var(--muted)">${explanation}</div>
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

    // ── Fix 6: Google-Report (Core Web Vitals) ──
    const gr = generateGoogleReport(ws);
    revEl.innerHTML += `<div class="card" style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px">Google Core Web Vitals — ${gr.passed}/${gr.total} bestanden</div>
        ${gr.cwv.map(c => `<div class="stat-row"><span class="stat-label"><span style="color:${c.pass ? 'var(--green)' : 'var(--red)'};margin-right:6px">${c.pass ? '✓' : '✗'}</span>${c.name}</span><span class="stat-value">${c.value} <span style="font-size:10px;color:var(--muted)">(${c.threshold})</span></span></div>`).join('')}
    </div>`;

    // ── #7: Kontakt-Strategie ──
    const stratEl = document.getElementById('result-strategy');
    let stratHtml = '';

    // #9: Screenshot
    if (data.screenshot) {
        stratHtml += `<div class="card" style="text-align:center;padding:24px;margin-bottom:12px">
            <div style="display:inline-block;border:6px solid #1d1d1f;border-radius:20px;overflow:hidden;max-width:200px;box-shadow:0 16px 48px rgba(0,0,0,0.12)">
                <img src="${data.screenshot}" alt="Mobile Screenshot" style="width:100%;display:block">
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:12px">So sieht die Website auf dem Smartphone aus</div>
        </div>`;
    }

    // #11: Digital Footprint
    if (data.footprint?.platforms?.length > 0) {
        stratHtml += `<div class="card" style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px">Digital Footprint — ${data.footprint.label} (${data.footprint.maturity})</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${data.footprint.platforms.map(p => `<span class="badge badge-green">${p.name}</span>`).join('')}</div>
            ${data.footprint.pixels?.length > 0 ? `<div style="font-size:11px;color:var(--muted)">Pixel: ${data.footprint.pixels.map(p => p.name).join(' · ')}</div>` : ''}
            <div style="font-size:12px;color:var(--muted);margin-top:4px">${data.footprint.insight}</div>
        </div>`;
    }

    // #13: Konkurrenz-Vergleich
    if (data.competitors?.length > 1) {
        stratHtml += `<div class="card" style="margin-bottom:12px;padding:0;overflow:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead><tr><th style="text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--border)">Konkurrent</th><th style="padding:10px 12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Sterne</th><th style="padding:10px 12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Bew.</th></tr></thead>
                <tbody>${data.competitors.slice(0, 5).map(c => `<tr><td style="padding:8px 12px;border-bottom:1px solid var(--border)">${c.displayName?.text || '—'}</td><td style="padding:8px 12px;border-bottom:1px solid var(--border)">${c.rating || '—'}</td><td style="padding:8px 12px;border-bottom:1px solid var(--border)">${c.userRatingCount || 0}</td></tr>`).join('')}</tbody>
            </table>
        </div>`;
    }

    // #14+15: Multi-Touch + Kanal + Timing + Betreff
    if (r.channelResult?.all?.length > 1) {
        stratHtml += `<div class="card" style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px">Kanal-Optimierung</div>`;
        for (const ch of r.channelResult.all) {
            const best = ch.name === r.channelResult.best?.name;
            stratHtml += `<div class="stat-row"><span class="stat-label">${best ? '★ ' : ''}${ch.name}</span><span class="stat-value" style="${best ? 'color:var(--green)' : ''}">${ch.ev}€ EV · ${ch.costHours}h</span></div>`;
        }
        stratHtml += '</div>';
    }

    // #16: Betreff-Tipps
    stratHtml += `<div class="card" style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px">Betreff-Optimierung (Snov.io 2026)</div>
        <div class="stat-row"><span class="stat-label">Zahlen im Betreff</span><span class="stat-value" style="color:var(--green)">+45% Open Rate</span></div>
        <div class="stat-row"><span class="stat-label">Vor- und Nachname</span><span class="stat-value">33% Open Rate</span></div>
        <div class="stat-row"><span class="stat-label">Betreff als Frage</span><span class="stat-value">+10% Open Rate</span></div>
        <div class="stat-row"><span class="stat-label">Email-Länge</span><span class="stat-value">< 80 Wörter optimal</span></div>
    </div>`;

    // #17: Timing
    stratHtml += `<div class="card" style="margin-bottom:12px;border-left:3px solid var(--accent)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:6px">Optimales Timing</div>
        <div style="font-size:13px;font-weight:600">Bester Versandtag: Dienstag (28.2% Open) · Bester Reply-Tag: Mittwoch (5.8%)</div>
        <div style="font-size:12px;color:var(--muted)">Uhrzeit: 7-11 Uhr · Saison: ${r.seasonFactor}%</div>
    </div>`;

    // #10: Pitch-Box
    const pitchLines = [];
    if (ws.perf < 65) pitchLines.push(`Googles Performance-Score liegt bei ${ws.perf}/100`);
    if (!ws.isHttps) pitchLines.push('kein SSL-Zertifikat');
    if (ws.seo < 75) pitchLines.push(`SEO-Score bei ${ws.seo}/100`);
    if (tech.isBaukasten) pitchLines.push(`läuft auf ${tech.cms}`);
    if (pitchLines.length > 0) {
        stratHtml += `<div class="pitch-box" style="margin-bottom:12px">
            <h3>Pitch-Vorlage</h3>
            <p>Guten Tag,\n\nich habe mir ${domain} angeschaut. Ein paar Dinge fallen auf: ${pitchLines.join(', ')}.\n\nDas sind Punkte die messbar Kunden und Google-Sichtbarkeit kosten. Ich baue moderne Websites — handcodiert, ab 990 Euro.\n\nDarf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?\n\nViele Grüße\nMuammer Kizilaslan\nkarriaro-webdesign.de</p>
            <button style="margin-top:12px;padding:8px 16px;font-size:12px;font-weight:600;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:8px;cursor:pointer" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent='Kopiert!'})">Kopieren</button>
        </div>`;
    }

    // #6: 5-Schritt E-Mail-Sequenz
    const seqMails = [
        { day: 1, subject: `${domain} — Ihre Website kostet Sie Kunden`, body: `Performance ${ws.perf}/100, SEO ${ws.seo}/100.${rev?.yearlyLoss > 0 ? ' Geschätzter Verlust: ~'+rev.yearlyLoss.toLocaleString('de-DE')+'€/Jahr.' : ''} Darf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?` },
        { day: 4, subject: 'Vorher/Nachher — so sah Spedition Kolbe aus', body: 'Konkretes Beispiel: Vorher eine veraltete Standard-Seite, nachher ein moderner Auftritt. karriaro-webdesign.de' },
        { day: 8, subject: ws.a11y < 70 ? 'BFSG: Barrierefreiheit seit 2025 Pflicht' : 'Google bevorzugt schnelle Websites', body: ws.a11y < 70 ? `Barrierefreiheit ${ws.a11y}/100. Gesetz seit Juni 2025. Erste Abmahnungen laufen.` : 'Websites die Core Web Vitals bestehen bekommen 24% mehr Traffic.' },
        { day: 12, subject: `Kostenloser Entwurf für ${domain}`, body: 'Darf ich Ihnen den Entwurf in einem 15-Minuten-Call zeigen? Keine Verpflichtung.' },
        { day: 18, subject: 'Letzte Nachricht', body: `Ab 990€, fertig in 1-2 Wochen.${rev?.roi > 1 ? ' Amortisiert sich in '+Math.ceil(1990/(rev.yearlyLoss/12))+' Monaten.' : ''}` }
    ];
    stratHtml += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin:16px 0 8px">5-Schritt Follow-up-Sequenz</div>`;
    for (const m of seqMails) {
        stratHtml += `<div class="pitch-box" style="margin-bottom:6px">
            <h3>Tag ${m.day} — ${m.subject}</h3>
            <p>${m.body}</p>
            <button style="margin-top:8px;padding:6px 12px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:6px;cursor:pointer" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent='✓'})">Kopieren</button>
        </div>`;
    }

    stratEl.innerHTML = stratHtml;

    // ── Expert ──
    document.getElementById('result-expert').innerHTML = `<div class="card"><pre style="font-size:11px;overflow-x:auto;max-height:400px">${JSON.stringify(r, null, 2)}</pre></div>`;

    // ── Fix 4: A/B-Test + Fix 5: Drift ──
    let actionsExtra = '';
    if (data.abTest) {
        const labels = { emotional: 'Emotional (Schmerz → Lösung)', rational: 'Rational (Daten → ROI)', hybrid: 'Hybrid (Hook → Fakten)' };
        actionsExtra += `<div class="card" style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:4px">Pitch-Variante (Thompson Sampling, Konfidenz: ${data.abTest.confidence})</div><div style="font-size:14px;font-weight:600">${labels[data.abTest.variant] || data.abTest.variant}</div></div>`;
    }
    if (data.drift?.drifted) {
        actionsExtra += `<div class="card" style="border-left:3px solid var(--orange);margin-bottom:12px"><div style="font-size:13px;font-weight:600;color:var(--orange)">Score verändert: ${data.drift.previousScore} → ${r.leadScore}</div></div>`;
    }

    // ── #4: Actions (CRM Save) ──
    document.getElementById('result-actions').innerHTML = `
        ${actionsExtra}
        <div style="text-align:center;padding:24px 0">
            <button class="btn-primary" id="btn-save-crm" style="margin-right:12px;background:var(--text)">Im CRM speichern</button>
            <a href="https://karriaro-webdesign.de/#kontakt" class="btn-primary" style="display:inline-block;text-decoration:none">Kostenlos beraten lassen</a>
        </div>
    `;
    document.getElementById('btn-save-crm')?.addEventListener('click', async function() {
        const { saveLead } = await import('../crm/leads.js');
        await saveLead(domain, data.url, {
            name: data.place?.displayName?.text || domain,
            type: data.place?.primaryTypeDisplayName?.text || '',
            perf: ws.perf, seo: ws.seo, a11y: ws.a11y,
            cms: tech.cms, isBaukasten: tech.isBaukasten,
            leadScore: r.leadScore, conversionRate: r.conversionRate,
            expectedValue: r.expectedValue || 0
        });
        this.textContent = 'Gespeichert ✓';
        this.disabled = true;
    });
}

// ── #12: Klartext-Erklärung (verständlich für jeden, nutzbar als E-Mail) ──
function generateExplanation(r, ws, tech, data, uxAudit) {
    const s = r.leadScore;
    const domain = new URL(data.url).hostname.replace('www.', '');
    const name = data.place?.displayName?.text || domain;
    const rev = data.revenue;
    const footprint = data.footprint;
    const branche = data.place?.primaryTypeDisplayName?.text || '';

    // ══════════════════════════════════════
    // STARKER LEAD (55+)
    // ══════════════════════════════════════
    if (s >= 55) {
        let text = `<strong style="color:var(--green)">Diesen Lead kontaktieren.</strong><br><br>`;
        text += `<strong>Was wir bei ${name} gefunden haben:</strong><br><br>`;

        const problems = [];
        const emailArgs = [];

        // ══════════════════════════════════════
        // BRANCHEN-SPEZIFISCHE FEATURES ZUERST (das stärkste Argument!)
        // ══════════════════════════════════════
        if (uxAudit?.missingCritical?.length > 0) {
            const missing = uxAudit.missingCritical;
            let uxText = `<strong>Wichtige Funktionen fehlen auf der Website:</strong><br>`;
            for (const m of missing) {
                uxText += `<br>✗ <strong>${m.name}</strong> — ${m.why}`;
                emailArgs.push(`${m.name} fehlt auf Ihrer Website — ${m.why.split('—')[0].trim()}`);
            }
            // Auch nicht-kritische fehlende Features erwähnen
            const missingOptional = uxAudit.missing?.filter(m => !m.critical) || [];
            if (missingOptional.length > 0) {
                uxText += `<br><br>Außerdem fehlen: ${missingOptional.map(m => m.name).join(', ')}.`;
            }
            problems.push(uxText);

            // Branchen-spezifischer Pitch
            if (uxAudit.persona?.missingPitch) {
                problems.push(`<div style="background:rgba(0,113,227,0.05);padding:12px 16px;border-radius:8px;border-left:3px solid var(--accent);margin:4px 0"><strong>${uxAudit.persona.missingPitch}</strong></div>`);
            }
        } else if (uxAudit?.missing?.length > 0) {
            problems.push(`Fehlende Features: ${uxAudit.missing.map(m => `<strong>${m.name}</strong>`).join(', ')}. Diese Funktionen erwarten Kunden in der ${branche}-Branche heute als Standard.`);
        }

        // ── Was eine moderne Website in dieser Branche braucht ──
        if (uxAudit?.modernFeatures?.length > 0) {
            problems.push(`<strong>Was eine moderne ${uxAudit.persona?.name || branche}-Website 2026 braucht:</strong> ${uxAudit.modernFeatures.join(', ')}. Davon hat ${name} ${uxAudit.found?.length || 0} von ${uxAudit.results?.length || 0} Basis-Features.`);
        }

        // ── Technische Probleme (sekundär) ──
        if (ws.perf < 40) {
            problems.push(`Die Website lädt <strong>deutlich langsamer als die Konkurrenz</strong>. Google bestraft das mit schlechterem Ranking.`);
            emailArgs.push(`die Website lädt langsamer als die Ihrer Konkurrenten`);
        } else if (ws.perf < 65) {
            problems.push(`Google bewertet die Ladegeschwindigkeit mit <strong>${ws.perf}/100</strong>. Die besten in der Branche erreichen 90+.`);
            emailArgs.push(`Googles Geschwindigkeits-Bewertung liegt bei ${ws.perf}/100`);
        }

        if (!ws.isHttps) {
            problems.push(`<strong>Kein Sicherheitszertifikat</strong> — Browser zeigt "Nicht sicher". Jeder zweite Besucher verlässt die Seite sofort.`);
            emailArgs.push(`der Browser zeigt "Nicht sicher" an`);
        }

        if (tech.isBaukasten) {
            problems.push(`Läuft auf <strong>${tech.cms}</strong> — ein Baukasten der Design, Geschwindigkeit und SEO strukturell begrenzt.`);
            emailArgs.push(`die Seite läuft auf ${tech.cms}`);
        }

        if (ws.a11y < 60) {
            problems.push(`<strong>Barrierefreiheit ${ws.a11y}/100</strong> — seit Juni 2025 gesetzlich vorgeschrieben (BFSG). Bußgelder bis 100.000€ möglich.`);
            emailArgs.push(`Barrierefreiheit nur ${ws.a11y}/100 — seit 2025 Pflicht`);
        }

        // ── Business-Signale ──
        if (data.place?.userRatingCount > 30 && data.place?.rating >= 4.0) {
            problems.push(`<strong>Das Geschäft läuft gut</strong> — ${data.place.rating} Sterne bei ${data.place.userRatingCount} Bewertungen. Die Kunden sind zufrieden. Die Website spiegelt diese Qualität nicht wider.`);
        }

        if (footprint?.hasInstagram && ws.perf < 65) {
            problems.push(`${name} ist <strong>auf Instagram aktiv</strong> — Marketing-Bewusstsein ist da. Aber Instagram bringt Bestandskunden, Google bringt Neukunden. Ohne gute Website fehlt die Hälfte.`);
        }

        if (footprint?.hasFbPixel) {
            problems.push(`Schaltet bereits <strong>Facebook-Werbung</strong> — gibt Geld für Marketing aus, aber die Website ist das schwächste Glied.`);
        }

        // ── Umsatzverlust ──
        if (rev?.yearlyLoss > 1000) {
            problems.push(`<strong>Geschätzter Umsatzverlust: ~${rev.yearlyLoss.toLocaleString('de-DE')} €/Jahr</strong>. Eine neue Website für 990-1.990 € amortisiert sich in ${rev.roi > 0 ? Math.ceil(1990 / (rev.yearlyLoss / 12)) + ' Monaten' : 'kurzer Zeit'}.`);
            emailArgs.push(`wir schätzen den jährlichen Verlust auf ~${rev.yearlyLoss.toLocaleString('de-DE')} €`);
        }

        // ── Neue Module (1-10) als Argumente ──
        if (data.wayback?.pitchArg) {
            problems.push(data.wayback.pitchArg);
            emailArgs.push(`die Website wurde seit ${data.wayback.yearsSince} Jahren nicht aktualisiert`);
        }

        if (data.emotionalReady?.paradox) {
            problems.push(`<div style="background:rgba(255,69,58,0.05);padding:12px 16px;border-radius:8px;border-left:3px solid var(--red)"><strong>Kunden beschweren sich über die Website:</strong> ${data.emotionalReady.issues?.[0] ? '"' + data.emotionalReady.issues[0] + '"' : data.emotionalReady.complaints + ' Beschwerden in Google-Bewertungen'}. Gleichzeitig ist die Zufriedenheit bei ${data.emotionalReady.satisfaction}/10 — die Kunden lieben das Geschäft, aber nicht die Website.</div>`);
            emailArgs.push('Ihre eigenen Kunden beschweren sich in den Bewertungen über die Website');
        }

        if (data.localSEO?.isParadoxLead) {
            problems.push(data.localSEO.pitchArg);
        }

        if (data.surgeIntent?.hasSurge) {
            problems.push(`<strong>Wachstumssignale erkannt:</strong> ${data.surgeIntent.signals.map(s => s.label).join(', ')}. ${data.surgeIntent.pitchArg}`);
        }

        if (data.techTrajectory?.urgency === 'critical') {
            problems.push(data.techTrajectory.pitchArg);
        }

        if (problems.length > 0) {
            text += problems.join('<br><br>');
        }

        // ── Empfehlung (erweitert mit neuen Modulen) ──
        text += `<br><br><strong>Unsere Empfehlung:</strong> `;
        if (data.conversationReady?.isReady) {
            text += `<strong style="color:var(--green)">${data.conversationReady.label}</strong> `;
            if (data.conversationReady.topTrigger) text += `Grund: ${data.conversationReady.topTrigger.label}. `;
        }
        text += `Investiere maximal ${r.kelly?.optimalHours || 2} Stunden. `;
        if (r.channelResult?.best) {
            text += `Der beste Kontaktkanal ist <strong>${r.channelResult.best.name}</strong>. `;
        }

        // ── Generierte E-Mail-Argumente (kopierbar) ──
        if (emailArgs.length > 0) {
            text += `<br><br><div style="background:#1d1d1f;color:rgba(255,255,255,0.85);padding:16px 20px;border-radius:12px;margin-top:8px">`;
            text += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:8px">Argument für die Kontakt-E-Mail</div>`;
            text += `<div style="font-size:13px;line-height:1.7">Ich habe mir ${domain} angeschaut und ein paar Dinge fallen auf: ${emailArgs.join(', ')}. Das sind Punkte die Sie messbar Kunden kosten.</div>`;
            text += `</div>`;
        }

        return text;
    }

    // ══════════════════════════════════════
    // MITTLERER LEAD (30-54)
    // ══════════════════════════════════════
    if (s >= 30) {
        let text = `<strong style="color:var(--orange)">Möglich, aber kein Selbstläufer.</strong><br><br>`;

        const pros = [];
        const cons = [];

        if (ws.perf < 50) pros.push(`Googles Geschwindigkeits-Score ist niedrig (${ws.perf}/100) — ein gutes Argument`);
        if (tech.isBaukasten) pros.push(`Läuft auf ${tech.cms} — Baukasten mit klaren Grenzen`);
        if (!ws.isHttps) pros.push(`Kein SSL-Zertifikat — Browser-Warnung ist ein starkes Argument`);
        if (ws.perf >= 65) cons.push(`Die Website ist technisch in Ordnung (${ws.perf}/100) — schwerer zu argumentieren warum eine neue nötig ist`);
        if (!data.place) cons.push(`Wir konnten keine Google-Bewertungen finden — unklar ob das Unternehmen aktiv ist und Budget hat`);
        if (data.place?.userRatingCount < 10) cons.push(`Nur ${data.place?.userRatingCount || 0} Google-Bewertungen — möglicherweise ein sehr kleines Unternehmen`);

        if (pros.length > 0) text += `<strong>Was für diesen Lead spricht:</strong><br>${pros.map(p => '✓ ' + p).join('<br>')}<br><br>`;
        if (cons.length > 0) text += `<strong>Was dagegen spricht:</strong><br>${cons.map(c => '✗ ' + c).join('<br>')}<br><br>`;

        text += `<strong>Empfehlung:</strong> Nur kontaktieren wenn du gerade wenig stärkere Leads hast. Halte den Zeitaufwand unter 1 Stunde — ein kurzer Pitch, mehr nicht.`;
        return text;
    }

    // ══════════════════════════════════════
    // SCHWACHER LEAD (0-29)
    // ══════════════════════════════════════
    let text = `<strong style="color:var(--red)">Diesen Lead überspringen.</strong><br><br>`;

    const reasons = [];
    if (ws.perf >= 70) reasons.push(`Die Website ist bereits in gutem Zustand (Performance ${ws.perf}/100) — der Inhaber würde nicht verstehen warum er eine neue braucht`);
    if (!data.place) reasons.push(`Wir haben keine Google-Bewertungen gefunden. Entweder ist das Unternehmen nicht lokal, nicht aktiv, oder hat keinen Google-Eintrag. Ohne diese Informationen ist eine Einschätzung zu unsicher`);
    if (data.place?.userRatingCount < 5) reasons.push(`Nur ${data.place?.userRatingCount || 0} Bewertungen — wahrscheinlich ein sehr kleines Unternehmen ohne Budget für eine neue Website`);
    if (ws.perf >= 50 && ws.seo >= 70 && ws.isHttps) reasons.push(`Website hat keine offensichtlichen Probleme — kein Ansatzpunkt für ein Verkaufsgespräch`);

    if (reasons.length > 0) {
        text += `<strong>Warum:</strong><br>${reasons.map(r => '• ' + r).join('<br>')}<br><br>`;
    }

    text += `Deine Zeit ist besser investiert in Leads mit einem Score über 50. Bei diesem Lead müsstest du statistisch ${Math.round(100 / Math.max(0.1, parseFloat(r.conversionRate)))} ähnliche kontaktieren um einen einzigen Kunden zu gewinnen.`;
    return text;
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
