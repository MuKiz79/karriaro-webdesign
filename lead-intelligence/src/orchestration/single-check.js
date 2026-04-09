/**
 * Single Check Workflow — Orchestriert den gesamten Einzel-Analyse-Prozess
 */
import { state } from '../state.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces, nearbyPlaces } from '../api/places.js';
import { analyzeContent, analyzeScreenshot, analyzeReviews, getDomainAge, getDomainAuthority, getSearchVolume, analyzeBranchStandards, analyzeSocialProfiles, checkEmailDeliverability, generateMockupSuggestion } from '../api/cloud-functions.js';
import { analyzeSocialSignals } from '../analysis/social-signals.js';
import { compareSocialPresence } from '../analysis/social-comparison.js';
import { analyzeSignalStack } from '../analysis/signal-stacking.js';
import { checkBFSGCompliance } from '../analysis/bfsg-compliance.js';
import { detectTriggerEvents } from '../analysis/trigger-events.js';
import { checkSchema } from '../analysis/schema-check.js';
import { calculatePXIndex } from '../analysis/px-index.js';
import { analyzeContentFreshness } from '../analysis/content-freshness.js';
import { analyzeTechDepth } from '../analysis/tech-depth.js';
import { checkMessaging } from '../analysis/messaging-check.js';
import { calculateCompositeScore } from '../scoring/composite-score.js';
import { fetchCrUX } from '../api/crux.js';
import { getScoreInsight } from '../learning/feedback-loop.js';
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
import { analyzeCompanyProfile } from '../analysis/company-profile.js';
import { selectVariant as sv } from '../learning/ab-test.js';
import { checkDrift as cd } from '../learning/tracking.js';
import { saveLead } from '../crm/leads.js';
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

        // Firmen-Profil (wird in Phase 4 referenziert)
        let companyProfile = null;
        try {
            companyProfile = analyzeCompanyProfile(url, psiData, place, null);
        } catch(e) { console.error('CompanyProfile failed:', e); companyProfile = { domain: new URL(url).hostname.replace('www.',''), branche: '', isEnterprise: false, enterpriseWarning: null, owner: { name: null, nationality: null }, companyName: '' }; }

        // Phase 4: KI-Analyse ZUERST (Design-Qualität beeinflusst Scoring)
        showLoading('KI-Analyse...');
        const screenshot = psiData?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;
        const brancheForAI = place?.primaryTypeDisplayName?.text || companyProfile?.branche || '';
        let uxFound = [];
        try { uxFound = auditUX(psiData, place)?.found?.map(f => f.name) || []; } catch(e) {}

        let contentAnalysis = null, screenshotAnalysis = null, reviewSentiment = null,
            domainAge = null, domainAuthority = null, searchVolume = null, branchStandards = null;
        try {
            [contentAnalysis, screenshotAnalysis, reviewSentiment, domainAge, domainAuthority, searchVolume, branchStandards] = await Promise.all([
                analyzeContent(url).catch(() => null),
                analyzeScreenshot(screenshot).catch(() => null),
                analyzeReviews(domain).catch(() => null),
                getDomainAge(domain).catch(() => null),
                getDomainAuthority(domain).catch(() => null),
                getSearchVolume(`${brancheForAI} ${place?.formattedAddress?.split(',').pop()?.trim() || ''}`.trim() || domain).catch(() => null),
                analyzeBranchStandards(url, brancheForAI, uxFound).catch(() => null)
            ]);
        } catch(e) { console.error('KI-Analyse failed:', e); }

        // Phase 5: Scoring — NACH KI-Analyse (Design-Qualität fließt ein)
        showLoading('Lead wird bewertet...');
        let revenue = null, result = null;
        try {
            revenue = calculateRevenueLoss(ws, place);
        } catch(e) { console.error('Revenue calc failed:', e); }
        try {
            result = scoreLead(ws, tech, place, competitors, footprint, revenue, null, screenshotAnalysis, contentAnalysis);
        } catch(e) {
            console.error('ScoreLead failed:', e);
            result = { leadScore: 50, conversionRate: 2.0, ci: { lower: 0.5, upper: 5 }, ciMargin: 2, N: 100,
                stages: [], bottleneck: null, drivers: [], kelly: { optimalHours: 2, recommendation: 'Standard' },
                channelResult: { best: { name: 'E-Mail' }, all: [] }, survival: { label: '~14 Tage' },
                nextAction: { action: 'E-Mail senden', state: 'Kalt' }, dealSize: 990, expectedValue: 0,
                sensitivity: [], seasonFactor: 100, timePerLead: 2 };
        }

        // Render
        hideLoading();
        document.getElementById('btn-analyze').disabled = false;

        // A/B-Test Variante wählen
        const abTest = sv();

        // ── Bestehende Analyse-Module ──
        const wayback = await checkFreshness(url).catch(() => null);
        const surgeIntent = detectSurgeIntent(footprint, null, null, place);
        const digitalMaturity = assessDigitalMaturity(footprint, null, psiData);
        const conversationReady = assessConversationReadiness(ws, tech, place, wayback, null);
        const stakeholder = detectStakeholder(psiData, place);
        const techTrajectory = assessTechTrajectory(tech, wayback);
        const localSEO = assessLocalSEO(ws, place, psiData);
        const emotionalReady = assessEmotionalReadiness(reviewSentiment);
        const revenueWeighted = calculateRevenueWeighted(result.conversionRate / 100, place?.primaryType || '_default', result.dealSize);
        const socialSignals = analyzeSocialSignals(place);
        const socialComparison = compareSocialPresence(place, competitors);

        // ── 15 neue Module ──
        // #2: CrUX Real-User-Daten
        const cruxData = await fetchCrUX(`https://${domain}`).catch(() => null);

        // #3: BFSG-Compliance
        const bfsgScore = checkBFSGCompliance(psiData);

        // #4: Trigger Events
        const triggerEvents = detectTriggerEvents({ ws, tech, place, wayback, footprint, psiData, contentAnalysis, socialSignals, competitors });

        // #5: Technographische Tiefe
        const techDepth = analyzeTechDepth(psiData, tech);

        // #6: Content Freshness (erweitert)
        const contentFreshness = analyzeContentFreshness(psiData, contentAnalysis, wayback);

        // #9: PX Index
        const pxIndex = calculatePXIndex(ws, psiData, contentAnalysis, screenshotAnalysis);

        // #10: Schema.org Check
        const schemaCheck = checkSchema(psiData);

        // #14: WhatsApp/Messaging Check
        const messagingCheck = checkMessaging(psiData);

        // #1: Signal Stacking (braucht alle anderen Module)
        const signalStack = analyzeSignalStack({
            ws, tech, place, footprint, revenue, wayback,
            screenshotAnalysis, socialSignals, surgeIntent,
            emotionalReady, conversationReady, bfsgScore
        });

        // #7: Composite Score (Fit × Intent × Timing)
        const compositeScore = calculateCompositeScore({
            ws, tech, place, footprint, revenue, result,
            screenshotAnalysis, contentAnalysis, socialSignals,
            triggerEvents, bfsgScore, signalStack, techDepth,
            contentFreshness, companyProfile
        });

        // #12: Feedback Loop — historischer Hinweis
        const feedbackInsight = getScoreInsight(result.leadScore);

        // #11 + #6-8: Cloud Functions (parallel, optional)
        const [socialProfiles, emailCheck] = await Promise.all([
            analyzeSocialProfiles(url, footprint?.profileUrls || {}).catch(() => null),
            checkEmailDeliverability(domain).catch(() => null)
        ]);

        // #13: Mockup-Suggestion (nur bei starken Leads, spart API-Kosten)
        let mockupSuggestion = null;
        if (result.leadScore >= 50 && screenshotAnalysis?.designQuality <= 5) {
            mockupSuggestion = await generateMockupSuggestion(
                domain,
                companyProfile?.branche || '',
                bfsgScore?.criticalFails?.map(f => f.name).join(', ') || '',
                screenshot
            ).catch(() => null);
        }

        // Score-Drift prüfen
        const drift = cd(new URL(url).hostname.replace('www.', ''), result.leadScore);

        state.lastResult = { url, ws, tech, place, competitors, footprint, result, revenue, screenshot,
            contentAnalysis, screenshotAnalysis, reviewSentiment, domainAge, domainAuthority, searchVolume, psiData,
            abTest, drift, wayback, surgeIntent, digitalMaturity, conversationReady, stakeholder,
            techTrajectory, localSEO, emotionalReady, revenueWeighted, companyProfile, branchStandards,
            socialSignals, socialComparison, socialProfiles,
            // 15 neue Module
            cruxData, bfsgScore, triggerEvents, techDepth, contentFreshness,
            pxIndex, schemaCheck, messagingCheck, signalStack, compositeScore,
            feedbackInsight, emailCheck, mockupSuggestion };

        hideSkeleton();
        renderResult(state.lastResult);
        results.classList.remove('hidden');

    } catch (e) {
        hideSkeleton();
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
    const rawColor = r.leadScore >= 55 ? '#30d158' : r.leadScore >= 30 ? '#ff9f0a' : '#ff453a';
    const label = r.leadScore >= 55 ? 'Starker Lead — kontaktieren' : r.leadScore >= 30 ? 'Vielversprechend — Quick-Pitch' : 'Schwacher Lead';

    // UX-Audit VOR Erklärung berechnen
    const uxForExplanation = auditUX(data.psiData, data.place);
    const explanation = generateExplanation(r, ws, tech, data, uxForExplanation);

    // ── Score Section mit SVG-Ring ──
    const scoreEl = document.getElementById('result-score');
    const cp = data.companyProfile || {};
    const circumference = 2 * Math.PI * 70; // r=70
    const offset = circumference - (r.leadScore / 100) * circumference;
    let scoreHtml = '';

    // Enterprise-Warnung
    if (cp?.isEnterprise) {
        scoreHtml += `<div class="card card-warn anim-in" style="text-align:left">
            <div class="enterprise-warn-title">⚠ Großunternehmen erkannt</div>
            <div class="enterprise-warn-body">${cp.enterpriseWarning.message}</div>
            <div class="enterprise-warn-signals">Signale: ${cp.enterpriseWarning.signals.join(' · ')}</div>
            <div class="enterprise-warn-rec">${cp.enterpriseWarning.recommendation}</div>
        </div>`;
    }

    // Firmen-Info
    scoreHtml += `<div class="company-info anim-in">
        <span><strong>Branche:</strong> ${cp?.branche || '—'}</span>
        ${cp?.owner?.name ? `<span><strong>Inhaber:</strong> ${cp.owner.name}${cp.owner.nationality ? ' ('+cp.owner.nationality+')' : ''}</span>` : ''}
        ${data.stakeholder ? `<span><strong>Entscheider:</strong> ${data.stakeholder.decisionMaker.type}</span>` : ''}
        ${data.stakeholder ? `<span><strong>Sales-Cycle:</strong> ${data.stakeholder.salesCycle}</span>` : ''}
    </div>`;

    // Animated Score Ring (SVG)
    scoreHtml += `<div style="text-align:center;margin-bottom:32px" class="anim-in">
        <div class="score-ring-wrap">
            <svg class="score-ring-svg" viewBox="0 0 160 160">
                <circle class="score-ring-bg" cx="80" cy="80" r="70"/>
                <circle class="score-ring-fill" cx="80" cy="80" r="70"
                    stroke="${rawColor}"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${circumference}"
                    data-target="${offset}"/>
            </svg>
            <div class="score-ring-value">
                <div class="score-number" style="color:${color}" data-target="${r.leadScore}">0</div>
                <div class="score-label" style="color:${color}">${label}</div>
            </div>
        </div>
        <div class="score-meta">Conversion-Rate: ${r.conversionRate}% · CI: ${r.ci.lower}% — ${r.ci.upper}% (N=${r.N})</div>
        <div class="explanation-box">${explanation}</div>
    </div>`;

    scoreEl.innerHTML = scoreHtml;

    // Animate score ring + number after render
    requestAnimationFrame(() => {
        const ring = scoreEl.querySelector('.score-ring-fill');
        if (ring) ring.style.strokeDashoffset = ring.dataset.target;
        const num = scoreEl.querySelector('.score-number');
        if (num) animateCount(num, 0, parseInt(num.dataset.target), 800);
    });

    // Funnel section — animated bars
    const funnelEl = document.getElementById('result-funnel');
    funnelEl.innerHTML = r.stages.map(s => {
        const barColor = s.mean >= 50 ? 'var(--green)' : s.mean >= 25 ? 'var(--orange)' : 'var(--red)';
        const isBn = r.bottleneck && s.name === r.bottleneck.name;
        return `<div class="funnel-stage">
            <span class="funnel-stage-name${isBn ? ' bottleneck' : ''}">${isBn ? '⚠ ' : ''}${s.name}</span>
            <div class="funnel-bar-wrap"><div class="funnel-bar-fill" style="background:${barColor}" data-width="${s.mean}%"></div></div>
            <span class="funnel-stage-value">${s.mean}%</span>
        </div>`;
    }).join('');
    // Animate funnel bars
    requestAnimationFrame(() => {
        funnelEl.querySelectorAll('.funnel-bar-fill').forEach((bar, i) => {
            setTimeout(() => { bar.style.width = bar.dataset.width; }, i * 80);
        });
    });

    // Decision section
    const decEl = document.getElementById('result-decision');
    decEl.innerHTML = `
        <div class="card card-accent anim-in">
            <div class="stat-row"><span class="stat-label">Erwarteter Wert</span><span class="stat-value">${r.expectedValue > 0 ? '+' : ''}${r.expectedValue} €</span></div>
            <div class="stat-row"><span class="stat-label">Kelly-Allokation</span><span class="stat-value">${r.kelly.optimalHours}h/Woche · ${r.kelly.recommendation}</span></div>
            <div class="stat-row"><span class="stat-label">Bester Kanal</span><span class="stat-value">${r.channelResult.best?.name || 'E-Mail'}</span></div>
            <div class="stat-row"><span class="stat-label">Time-to-Conversion</span><span class="stat-value">${r.survival.label}</span></div>
            <div class="stat-row"><span class="stat-label">Nächste Aktion</span><span class="stat-value">${r.nextAction.action}</span></div>
        </div>
    `;

    // ── KI-Branchenanalyse ──
    if (data.branchStandards && !data.branchStandards.error) {
        const bs = data.branchStandards;
        const modColor = (bs.modernityScore || 0) >= 7 ? 'var(--green)' : (bs.modernityScore || 0) >= 4 ? 'var(--orange)' : 'var(--red)';
        const uxEl2 = document.getElementById('result-ux');
        let bsHtml = `<div class="card card-accent anim-in">
            <div class="section-label-accent">KI-Branchenanalyse: ${bs.branche || data.companyProfile?.branche || ''}</div>
            <div class="flex-between" style="margin-bottom:12px">
                <div><span class="metric-desc">Modernität: </span><span class="metric-xl" style="color:${modColor}">${bs.modernityScore || '?'}/10</span> <span class="metric-desc">${bs.modernityLabel || ''}</span></div>
                <div style="font-size:12px"><span style="color:var(--green);font-weight:700">${bs.found?.length || 0} vorhanden</span> · <span style="color:var(--red);font-weight:700">${bs.missing?.length || 0} fehlen</span></div>
            </div>`;
        if (bs.missing?.length > 0) {
            bsHtml += `<div style="font-size:13px;font-weight:700;margin-bottom:8px">Was dieser Website fehlt:</div>`;
            for (const m of bs.missing) {
                bsHtml += `<div class="missing-feature">
                    <div class="missing-feature-name"><span class="feature-icon missing">✗</span><strong>${m.name}</strong></div>
                    <div class="missing-feature-why">${m.why}</div>
                    ${m.impact ? `<div class="missing-feature-impact">${m.impact}</div>` : ''}
                </div>`;
            }
        }
        if (bs.found?.length > 0) bsHtml += `<div class="found-list">Vorhanden: ${bs.found.join(', ')}</div>`;
        bsHtml += `</div>`;
        if (bs.topPitchArgument) bsHtml += `<div class="pitch-box anim-in"><h3>Stärkstes Argument (KI-generiert)</h3><p>${bs.topPitchArgument}</p></div>`;
        if (bs.summary) bsHtml += `<div class="card-summary anim-in" style="margin-bottom:12px">"${bs.summary}"</div>`;
        uxEl2.innerHTML = bsHtml + uxEl2.innerHTML;
    }

    // ── Branchen-UX-Audit ──
    const uxResult = auditUX(data.psiData, data.place);
    const uxEl = document.getElementById('result-ux');
    if (uxResult && uxResult.results) {
        const uxColor = uxResult.uxScore >= 70 ? 'var(--green)' : uxResult.uxScore >= 40 ? 'var(--orange)' : 'var(--red)';
        uxEl.innerHTML = `
            <div class="card card-accent anim-in">
                <div class="card-quote">"${uxResult.persona.persona}"</div>
                <div class="flex-between">
                    <div><span class="section-label">UX-Score: </span><span class="metric-xl" style="color:${uxColor}">${uxResult.uxScore}/100</span></div>
                    <div style="font-size:12px"><span style="color:var(--green);font-weight:700">${uxResult.found.length} vorhanden</span> · <span style="color:var(--red);font-weight:700">${uxResult.missing.length} fehlen</span></div>
                </div>
            </div>
            <div class="card anim-in">
                ${uxResult.results.map(f => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${f.found ? 'found' : f.critical ? 'missing' : 'warn'}">${f.found ? '✓' : '✗'}</span>${f.name}${f.critical && !f.found ? ' <span class="feature-critical">(kritisch)</span>' : ''}</span><span class="feature-detail">${f.found ? 'Vorhanden' : f.why}</span></div>`).join('')}
            </div>
            ${uxResult.missing.length > 0 ? `<div class="pitch-box anim-in"><h3>Stärkstes Pitch-Argument</h3><p>${uxResult.topPitch}</p></div>` : ''}
            <div class="card anim-in"><div class="section-label-accent">Was eine moderne ${uxResult.persona.name}-Website 2026 braucht</div><div style="display:flex;flex-wrap:wrap;gap:6px">${uxResult.modernFeatures.map(f => `<span class="badge badge-green">${f}</span>`).join('')}</div></div>
        `;
    } else { uxEl.innerHTML = ''; }

    // ── Social Signals (nach UX, vor Future) ──
    const ss = data.socialSignals;
    const sc = data.socialComparison;
    const sp = data.socialProfiles;
    if (ss?.available || sc?.available || sp) {
        let socialHtml = '';

        // GBP Social Signals (1-4, 9)
        if (ss?.available && ss.signals.length > 0) {
            const ssColor = ss.pct >= 60 ? 'var(--green)' : ss.pct >= 30 ? 'var(--orange)' : 'var(--red)';
            socialHtml += `<div class="card card-accent anim-in">
                <div class="section-label-accent">Social Signals — Google Business Profile</div>
                <div class="flex-between" style="margin-bottom:12px">
                    <div><span class="metric-xl" style="color:${ssColor}">${ss.pct}%</span> <span class="metric-desc">${ss.label}</span></div>
                </div>
                ${ss.signals.map(s => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${s.strength > 0 ? 'found' : 'missing'}">${s.strength > 0 ? '✓' : '✗'}</span>${s.label}</span><span class="feature-detail">${s.detail}</span></div>`).join('')}
            </div>`;

            // Review-Trend
            if (ss.reviewTrend && ss.reviewTrend.direction !== 'stabil') {
                const tColor = ss.reviewTrend.direction === 'steigend' ? 'var(--green)' : 'var(--red)';
                socialHtml += `<div class="card anim-in" style="border-left:3px solid ${tColor}">
                    <div class="section-label">Review-Trend</div>
                    <div class="metric-xl" style="color:${tColor}">${ss.reviewTrend.olderAvg} → ${ss.reviewTrend.recentAvg} Sterne</div>
                    <div class="metric-desc">Bewertungen werden ${ss.reviewTrend.direction} (Δ ${ss.reviewTrend.delta > 0 ? '+' : ''}${ss.reviewTrend.delta})</div>
                </div>`;
            }
        }

        // Social Media Profiles (6-8, 11-12)
        if (sp && !sp.error) {
            let profileHtml = '';
            if (sp.instagram?.followers) {
                profileHtml += `<div class="stat-row"><span class="stat-label">Instagram</span><span class="stat-value">${sp.instagram.followers.toLocaleString('de-DE')} Follower · ${sp.instagram.posts || '?'} Posts</span></div>`;
            }
            if (sp.facebook?.likes || sp.facebook?.followers) {
                profileHtml += `<div class="stat-row"><span class="stat-label">Facebook</span><span class="stat-value">${(sp.facebook.followers || sp.facebook.likes || 0).toLocaleString('de-DE')} ${sp.facebook.followers ? 'Follower' : 'Likes'}</span></div>`;
            }
            if (sp.linkedin?.detected) {
                profileHtml += `<div class="stat-row"><span class="stat-label">LinkedIn</span><span class="stat-value">${sp.linkedin.isCompanyPage ? 'Company Page' : 'Profil'} vorhanden</span></div>`;
            }
            if (sp.tiktok?.followers) {
                profileHtml += `<div class="stat-row"><span class="stat-label">TikTok</span><span class="stat-value">${sp.tiktok.followers.toLocaleString('de-DE')} Follower</span></div>`;
            }
            if (profileHtml) {
                socialHtml += `<div class="card anim-in">
                    <div class="section-label">Social-Media-Reichweite</div>
                    ${profileHtml}
                </div>`;
            }
        }

        // Konkurrenz-Vergleich (10)
        if (sc?.available && sc.gaps.length > 0) {
            socialHtml += `<div class="card anim-in">
                <div class="section-label">Konkurrenz-Vergleich (Social)</div>
                ${sc.gaps.map(g => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${g.severity === 'paradox' ? 'found' : 'missing'}">${g.severity === 'paradox' ? '★' : '⚠'}</span>${g.label}</span><span class="feature-detail">${g.detail}</span></div>`).join('')}
            </div>`;

            // Pitch-Argumente aus Social Comparison
            if (sc.pitchArgs.length > 0) {
                socialHtml += `<div class="pitch-box anim-in"><h3>Social-Argument für den Pitch</h3><p>${sc.pitchArgs[0]}</p></div>`;
            }
        }

        // In den UX-Container einfügen (nach UX-Audit)
        const uxContainer = document.getElementById('result-ux');
        uxContainer.innerHTML += socialHtml;
    }

    // ── Zukunfts-Readiness ──
    const futureResult = analyzeFutureReadiness(data.ws, data.psiData);
    const futureEl = document.getElementById('result-future');
    if (futureResult) {
        const fcColor = futureResult.readinessScore >= 75 ? 'var(--green)' : futureResult.readinessScore >= 40 ? 'var(--orange)' : 'var(--red)';
        futureEl.innerHTML = `
            <div class="card anim-in" style="border-left:3px solid ${fcColor}">
                <div class="flex-between">
                    <div><span class="section-label">Readiness 2026: </span><span class="metric-xl" style="color:${fcColor}">${futureResult.readinessScore}/100</span> <span class="metric-desc">${futureResult.label}</span></div>
                    <div style="font-size:12px"><span class="good">${futureResult.passed.length} ✓</span> · <span class="bad">${futureResult.failed.length} ✗</span></div>
                </div>
            </div>
            <div class="card anim-in">
                ${futureResult.results.map(c => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${c.passed ? 'found' : c.weight >= 3 ? 'missing' : 'warn'}">${c.passed ? '✓' : '✗'}</span>${c.name}${c.weight >= 3 ? ' <span class="feature-critical">PFLICHT</span>' : ''}</span><span class="feature-detail">${c.passed ? 'Bestanden' : c.stat}</span></div>`).join('')}
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
            <div class="science-grid">
                <div class="card anim-in"><div class="section-label">Thermo-Entropie</div><div class="metric-big ${sc(entropy?.S)}">${entropy?.S ?? '—'}</div><div class="metric-desc">${entropy?.label || ''}</div></div>
                <div class="card anim-in"><div class="section-label">Aktivierungsenergie</div><div class="metric-big ${activation?.Ea <= 25 ? 'good' : activation?.Ea <= 45 ? 'ok' : 'bad'}">${activation?.Ea ?? '—'} kJ</div><div class="metric-desc">${activation?.label || ''}</div></div>
                <div class="card anim-in"><div class="section-label">Epidemischer R₀</div><div class="metric-big ${r0?.R0 >= 2 ? 'good' : r0?.R0 >= 1 ? 'ok' : 'bad'}">${r0?.R0 ?? '—'}</div><div class="metric-desc">${r0?.label || ''}</div></div>
                <div class="card anim-in"><div class="section-label">Google Ads</div><div class="metric-big" style="color:${ads?.active ? 'var(--green)' : 'var(--muted)'}">${ads?.active ? 'Aktiv' : 'Nein'}</div><div class="metric-desc">${ads?.insight || ''}</div></div>
            </div>
            ${kahneman ? `<div class="card anim-in">
                <div class="section-label">Kahneman-Entscheidungsprofil</div>
                <div class="kahneman-wrap">
                    <div class="kahneman-system"><div class="kahneman-value" style="color:${kahneman.system1 > 55 ? 'var(--red)' : 'var(--muted)'}">${kahneman.system1}%</div><div class="kahneman-label">System 1 (emotional)</div></div>
                    <div class="kahneman-system"><div class="kahneman-value" style="color:${kahneman.system2 > 55 ? 'var(--accent)' : 'var(--muted)'}">${kahneman.system2}%</div><div class="kahneman-label">System 2 (rational)</div></div>
                </div>
                <div class="kahneman-strategy">${kahneman.pitchStrategy?.approach || ''}</div>
            </div>` : ''}
            ${jobs?.isHiring ? `<div class="card anim-in"><span class="badge badge-green">Stellt ein — wachsendes Unternehmen</span></div>` : ''}
        `;
    } catch (e) { sciEl.innerHTML = `<div class="card"><div class="metric-desc">Wissenschaftliche Module: ${e.message}</div></div>`; }

    // ── KI-Analyse ──
    const aiEl = document.getElementById('result-ai');
    const { contentAnalysis: ca, screenshotAnalysis: sa, reviewSentiment: rs, domainAge: da, domainAuthority: dau, searchVolume: svol } = data;
    let aiHtml = '';
    if (ca && !ca.error) {
        aiHtml += `<div class="card anim-in"><div class="section-label">KI Content-Analyse</div>
            <div class="stat-row"><span class="stat-label">Tonalität</span><span class="stat-value">${ca.tonality || '—'}</span></div>
            <div class="stat-row"><span class="stat-label">Aktualität</span><span class="stat-value">${ca.freshness || '—'}${ca.copyrightYear ? ' (©'+ca.copyrightYear+')' : ''}</span></div>
            <div class="stat-row"><span class="stat-label">USP</span><span class="stat-value">${ca.hasUSP ? 'Ja' : 'Nein'}</span></div>
            <div class="stat-row"><span class="stat-label">CTA</span><span class="stat-value">${ca.hasCTA ? 'Ja' : 'Fehlt'}</span></div>
            ${ca.summary ? `<div class="card-summary" style="margin-top:8px">"${ca.summary}"</div>` : ''}
        </div>`;
    }
    if (sa && !sa.error) {
        aiHtml += `<div class="card anim-in"><div class="section-label">KI Design-Bewertung</div>
            <div class="stat-row"><span class="stat-label">Design-Qualität</span><span class="stat-value ${(sa.designQuality||0) >= 7 ? 'good' : 'bad'}">${sa.designQuality || '—'}/10</span></div>
            <div class="stat-row"><span class="stat-label">Design-Ära</span><span class="stat-value">${sa.designEra || '—'}</span></div>
            ${sa.overallImpression ? `<div class="card-summary" style="margin-top:8px">"${sa.overallImpression}"</div>` : ''}
        </div>`;
    }
    if (da?.age || dau?.pageRank || svol?.suggestions > 0) {
        aiHtml += `<div class="science-grid">`;
        if (da?.age) aiHtml += `<div class="card anim-in"><div class="section-label">Domain-Alter</div><div class="metric-xl">${da.age} Jahre</div></div>`;
        if (dau?.pageRank) aiHtml += `<div class="card anim-in"><div class="section-label">Domain Authority</div><div class="metric-xl">${dau.pageRank}</div></div>`;
        if (svol?.suggestions > 0) aiHtml += `<div class="card anim-in"><div class="section-label">Suchvolumen</div><div class="metric-xl ${svol.hasVolume ? 'good' : ''}">${svol.hasVolume ? 'Hoch' : 'Niedrig'}</div></div>`;
        aiHtml += `</div>`;
    }
    aiEl.innerHTML = aiHtml;

    // ── Umsatzverlust ──
    const revEl = document.getElementById('result-revenue');
    const rev = data.revenue;
    if (rev && rev.yearlyLoss > 0) {
        revEl.innerHTML = `<div class="card anim-in">
            <div class="revenue-big">~${rev.yearlyLoss.toLocaleString('de-DE')} €<span class="revenue-unit">/Jahr</span></div>
            <div class="revenue-detail">80%-Intervall: ${rev.yearlyLow?.toLocaleString('de-DE') || '?'} € — ${rev.yearlyHigh?.toLocaleString('de-DE') || '?'} € (Monte-Carlo)</div>
            <div class="revenue-detail">~${rev.estMonthlyVisitors} Besucher/Monat · ROI einer neuen Website: <strong class="good">${rev.roi}x</strong></div>
        </div>`;
    } else { revEl.innerHTML = ''; }

    // Google-Report (Core Web Vitals)
    const gr = generateGoogleReport(ws);
    revEl.innerHTML += `<div class="card anim-in">
        <div class="section-label">Google Core Web Vitals — ${gr.passed}/${gr.total} bestanden</div>
        ${gr.cwv.map(c => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${c.pass ? 'found' : 'missing'}">${c.pass ? '✓' : '✗'}</span>${c.name}</span><span class="feature-detail">${c.value} (${c.threshold})</span></div>`).join('')}
    </div>`;

    // ── Kontakt-Strategie ──
    const stratEl = document.getElementById('result-strategy');
    let stratHtml = '';

    // Screenshot
    if (data.screenshot) {
        stratHtml += `<div class="card anim-in" style="text-align:center;padding:24px">
            <div class="phone-frame"><img src="${data.screenshot}" alt="Mobile Screenshot"></div>
            <div class="phone-caption">So sieht die Website auf dem Smartphone aus</div>
        </div>`;
    }

    // Digital Footprint
    if (data.footprint?.platforms?.length > 0) {
        stratHtml += `<div class="card anim-in">
            <div class="section-label">Digital Footprint — ${data.footprint.label} (${data.footprint.maturity})</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${data.footprint.platforms.map(p => `<span class="badge badge-green">${p.name}</span>`).join('')}</div>
            ${data.footprint.pixels?.length > 0 ? `<div class="metric-desc">Pixel: ${data.footprint.pixels.map(p => p.name).join(' · ')}</div>` : ''}
            <div class="metric-desc" style="margin-top:4px">${data.footprint.insight}</div>
        </div>`;
    }

    // Konkurrenz-Vergleich
    if (data.competitors?.length > 1) {
        stratHtml += `<div class="card anim-in" style="padding:0;overflow:auto">
            <table class="data-table">
                <thead><tr><th>Konkurrent</th><th>Sterne</th><th>Bew.</th></tr></thead>
                <tbody>${data.competitors.slice(0, 5).map(c => `<tr><td>${c.displayName?.text || '—'}</td><td>${c.rating || '—'}</td><td>${c.userRatingCount || 0}</td></tr>`).join('')}</tbody>
            </table>
        </div>`;
    }

    // Kanal-Optimierung
    if (r.channelResult?.all?.length > 1) {
        stratHtml += `<div class="card anim-in"><div class="section-label">Kanal-Optimierung</div>`;
        for (const ch of r.channelResult.all) {
            const best = ch.name === r.channelResult.best?.name;
            stratHtml += `<div class="stat-row"><span class="stat-label">${best ? '★ ' : ''}${ch.name}</span><span class="stat-value${best ? ' good' : ''}">${ch.ev}€ EV · ${ch.costHours}h</span></div>`;
        }
        stratHtml += '</div>';
    }

    // Betreff-Tipps
    stratHtml += `<div class="card anim-in">
        <div class="section-label">Betreff-Optimierung (Snov.io 2026)</div>
        <div class="stat-row"><span class="stat-label">Zahlen im Betreff</span><span class="stat-value good">+45% Open Rate</span></div>
        <div class="stat-row"><span class="stat-label">Vor- und Nachname</span><span class="stat-value">33% Open Rate</span></div>
        <div class="stat-row"><span class="stat-label">Betreff als Frage</span><span class="stat-value">+10% Open Rate</span></div>
        <div class="stat-row"><span class="stat-label">Email-Länge</span><span class="stat-value">< 80 Wörter optimal</span></div>
    </div>`;

    // Timing
    stratHtml += `<div class="card card-accent anim-in">
        <div class="section-label">Optimales Timing</div>
        <div class="timing-best">Bester Versandtag: Dienstag (28.2% Open) · Bester Reply-Tag: Mittwoch (5.8%)</div>
        <div class="timing-detail">Uhrzeit: 7-11 Uhr · Saison: ${r.seasonFactor}%</div>
    </div>`;

    // Pitch-Box
    const pitchLines = [];
    if (ws.perf < 65) pitchLines.push(`Googles Performance-Score liegt bei ${ws.perf}/100`);
    if (!ws.isHttps) pitchLines.push('kein SSL-Zertifikat');
    if (ws.seo < 75) pitchLines.push(`SEO-Score bei ${ws.seo}/100`);
    if (tech.isBaukasten) pitchLines.push(`läuft auf ${tech.cms}`);
    if (pitchLines.length > 0) {
        stratHtml += `<div class="pitch-box anim-in">
            <h3>Pitch-Vorlage</h3>
            <p>Guten Tag,\n\nich habe mir ${domain} angeschaut. Ein paar Dinge fallen auf: ${pitchLines.join(', ')}.\n\nDas sind Punkte die messbar Kunden und Google-Sichtbarkeit kosten. Ich baue moderne Websites — handcodiert, ab 990 Euro.\n\nDarf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?\n\nViele Grüße\nMuammer Kizilaslan\nkarriaro-webdesign.de</p>
            <button class="btn-copy-large" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent='Kopiert!'})">Kopieren</button>
        </div>`;
    }

    // 5-Schritt E-Mail-Sequenz
    const seqMails = [
        { day: 1, subject: `${domain} — Ihre Website kostet Sie Kunden`, body: `Performance ${ws.perf}/100, SEO ${ws.seo}/100.${rev?.yearlyLoss > 0 ? ' Geschätzter Verlust: ~'+rev.yearlyLoss.toLocaleString('de-DE')+'€/Jahr.' : ''} Darf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?` },
        { day: 4, subject: 'Vorher/Nachher — so sah Spedition Kolbe aus', body: 'Konkretes Beispiel: Vorher eine veraltete Standard-Seite, nachher ein moderner Auftritt. karriaro-webdesign.de' },
        { day: 8, subject: ws.a11y < 70 ? 'BFSG: Barrierefreiheit seit 2025 Pflicht' : 'Google bevorzugt schnelle Websites', body: ws.a11y < 70 ? `Barrierefreiheit ${ws.a11y}/100. Gesetz seit Juni 2025. Erste Abmahnungen laufen.` : 'Websites die Core Web Vitals bestehen bekommen 24% mehr Traffic.' },
        { day: 12, subject: `Kostenloser Entwurf für ${domain}`, body: 'Darf ich Ihnen den Entwurf in einem 15-Minuten-Call zeigen? Keine Verpflichtung.' },
        { day: 18, subject: 'Letzte Nachricht', body: `Ab 990€, fertig in 1-2 Wochen.${rev?.roi > 1 ? ' Amortisiert sich in '+Math.ceil(1990/(rev.yearlyLoss/12))+' Monaten.' : ''}` }
    ];
    stratHtml += `<div class="section-label" style="margin:16px 0 8px">5-Schritt Follow-up-Sequenz</div>`;
    for (const m of seqMails) {
        stratHtml += `<div class="pitch-box sequence-step anim-in">
            <h3>Tag ${m.day} — ${m.subject}</h3>
            <p>${m.body}</p>
            <button class="btn-copy" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent='✓'})">Kopieren</button>
        </div>`;
    }

    stratEl.innerHTML = stratHtml;

    // ── Expert ──
    document.getElementById('result-expert').innerHTML = `<div class="card"><pre style="font-size:11px;overflow-x:auto;max-height:400px">${JSON.stringify(r, null, 2)}</pre></div>`;

    // ── A/B-Test + Drift ──
    let actionsExtra = '';
    if (data.abTest) {
        const labels = { emotional: 'Emotional (Schmerz → Lösung)', rational: 'Rational (Daten → ROI)', hybrid: 'Hybrid (Hook → Fakten)' };
        actionsExtra += `<div class="card anim-in"><div class="section-label">Pitch-Variante (Thompson Sampling, Konfidenz: ${data.abTest.confidence})</div><div style="font-size:14px;font-weight:600">${labels[data.abTest.variant] || data.abTest.variant}</div></div>`;
    }
    if (data.drift?.drifted) {
        actionsExtra += `<div class="card card-alert anim-in"><div style="font-size:13px;font-weight:600;color:var(--orange)">Score verändert: ${data.drift.previousScore} → ${r.leadScore}</div></div>`;
    }

    // ── Actions (CRM Save) ──
    document.getElementById('result-actions').innerHTML = `
        ${actionsExtra}
        <div class="actions-center">
            <button class="btn-primary" id="btn-save-crm" style="background:var(--text)">Im CRM speichern</button>
            <a href="https://karriaro-webdesign.de/#kontakt" class="btn-cta-link">Kostenlos beraten lassen</a>
        </div>
    `;
    document.getElementById('btn-save-crm')?.addEventListener('click', async function() {
        // saveLead importiert statisch oben
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
        showToast('Lead im CRM gespeichert');
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
        // KI-BRANCHENANALYSE ZUERST (wenn verfügbar — stärkstes Argument!)
        // ══════════════════════════════════════
        if (data.branchStandards?.missing?.length > 0) {
            const bs = data.branchStandards;
            let aiText = `<strong>Was dieser ${bs.branche || 'Branche'}-Website fehlt (KI-Analyse):</strong><br>`;
            for (const m of bs.missing.slice(0, 5)) {
                aiText += `<br>✗ <strong>${m.name}</strong> — ${m.why}`;
                emailArgs.push(`${m.name} fehlt`);
            }
            if (bs.topPitchArgument) {
                aiText += `<br><br><div style="background:rgba(0,113,227,0.05);padding:12px 16px;border-radius:8px;border-left:3px solid var(--accent)">${bs.topPitchArgument}</div>`;
            }
            problems.push(aiText);
        }

        // STATISCHES UX-AUDIT ALS FALLBACK (wenn KI nicht verfügbar)
        else if (uxAudit?.missingCritical?.length > 0) {
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

// ── Skeleton Loading ──
// WICHTIG: Skeleton als EIGENES Element, NICHT den results-Container überschreiben
// sonst werden #result-score, #result-funnel etc. zerstört und renderResult() crasht
let skelEl = null;
function showSkeleton() {
    if (!skelEl) {
        skelEl = document.createElement('div');
        skelEl.id = 'skeleton-overlay';
        skelEl.className = 'skeleton';
        skelEl.innerHTML = `
            <div class="skel-card" style="text-align:center;padding:32px">
                <div class="skel-circle"></div>
                <div class="skel-line skel-line-short" style="margin:0 auto 8px"></div>
                <div class="skel-line skel-line-xs" style="margin:0 auto"></div>
            </div>
            <div class="skel-card">
                <div class="skel-line skel-line-xs"></div>
                <div class="skel-bar"></div><div class="skel-bar"></div><div class="skel-bar"></div>
                <div class="skel-bar"></div><div class="skel-bar"></div><div class="skel-bar"></div>
            </div>
            <div class="skel-card">
                <div class="skel-line skel-line-short"></div>
                <div class="skel-line"></div>
                <div class="skel-line"></div>
                <div class="skel-line skel-line-short"></div>
            </div>
        `;
    }
    // Füge VOR den results-Container ein (nicht hinein!)
    const results = document.getElementById('results');
    results.parentNode.insertBefore(skelEl, results);
    skelEl.style.display = '';
}

function hideSkeleton() {
    if (skelEl) skelEl.style.display = 'none';
}

function showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading').classList.remove('hidden');
    // Show skeleton on first phase
    if (text.includes('Website wird analysiert')) showSkeleton();
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function cleanup() {
    hideLoading();
    document.getElementById('btn-analyze').disabled = false;
}

// ── Animate Count (score number) ──
function animateCount(el, from, to, duration) {
    const start = performance.now();
    function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
        el.textContent = Math.round(from + (to - from) * ease);
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ── Toast Notification ──
function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
