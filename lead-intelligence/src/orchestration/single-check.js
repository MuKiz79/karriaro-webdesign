/**
 * Single Check Workflow — Orchestriert den gesamten Einzel-Analyse-Prozess
 */
import { state } from '../state.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces, nearbyPlaces } from '../api/places.js';
import { analyzeScreenshot, analyzeReviews, getDomainAge, getDomainAuthority, getSearchVolume, analyzeSocialProfiles, checkEmailDeliverability, generateMockupSuggestion, enrichContact, deepResearch, generateMockup, securityAudit } from '../api/cloud-functions.js';
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
import { calculateReviewVelocity } from '../analysis/review-velocity.js';
import { analyzeGBPDynamics } from '../analysis/gbp-dynamics.js';
import { assessWPSecurity } from '../analysis/wp-security.js';
import { assessCognitiveLoad } from '../analysis/cognitive-load.js';
import { checkSitemapFreshness } from '../analysis/sitemap-freshness.js';
import { calculateCompositeScore } from '../scoring/composite-score.js';
import { decideAction } from '../scoring/decision-engine.js';
import { fetchCrUX } from '../api/crux.js';
import { getScoreInsight } from '../learning/feedback-loop.js';
import { detectTech } from '../signals/tech-detect.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { analyzeDigitalFootprint as analyzeFootprint } from '../signals/digital-footprint.js';
import { scoreLead } from '../scoring/lead-scorer.js';
import { calculateRevenueLoss } from '../math/revenue-model.js';
import { auditUX } from '../analysis/ux-audit.js';
import { verifyFeatureClaim } from '../analysis/claim-verify.js';
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
import { renderScore, renderFunnel, renderUX, renderFuture, renderScience, renderAI, renderRevenue, renderStrategy, renderSignals, showToast } from '../ui/render-components.js';

export async function runSingleCheck() {
    let url = document.getElementById('url-input').value.trim();
    if (!url) return;
    // http:// → https:// hochstufen: fast jede Seite unterstützt HTTPS (Redirect),
    // sonst wird fälschlich "Kein HTTPS" gepitcht, obwohl die Seite sicher ist.
    url = url.replace(/^http:\/\//i, 'https://');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    state.aborted = false;

    // Reset UI
    const results = document.getElementById('results');
    results.classList.add('hidden');
    document.getElementById('batch-results').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('btn-analyze').disabled = true;

    try {
        // Phase 1: PageSpeed
        showLoading('① Website wird analysiert (PageSpeed)...');
        const psiData = await fetchPageSpeed(url);
        if (state.aborted) return cleanup();

        const ws = extractWebsiteScore(psiData);
        const tech = detectTech(psiData);
        const footprint = analyzeFootprint(psiData);

        // Phase 2: Business-Daten
        showLoading('② Google Business Profile...');
        const domain = new URL(url).hostname.replace('www.', '');
        let place = null;
        try {
            const placesData = await searchPlaces(domain, 1);
            if (placesData?.places?.length > 0) place = placesData.places[0];
        } catch (e) { /* optional */ }
        if (state.aborted) return cleanup();

        // Phase 3: Konkurrenz
        showLoading('③ Konkurrenz-Analyse...');
        let competitors = [];
        if (place?.location && place?.primaryType) {
            try {
                const nearby = await nearbyPlaces(place.location.latitude, place.location.longitude, place.primaryType, 6);
                // WICHTIG: den Betrieb SELBST aus der Konkurrenz ausschließen — sonst
                // steht in der Mail "Ihre Mitbewerber [Ihr eigener Name]".
                const selfName = (place.displayName?.text || '').toLowerCase().trim();
                competitors = (nearby?.places || []).filter(p => {
                    if (!p.websiteUri) return false;
                    try { if (new URL(p.websiteUri).hostname.replace(/^www\./, '') === domain) return false; } catch { /* ungültige URL */ }
                    if (place.id && p.id && p.id === place.id) return false;
                    const pName = (p.displayName?.text || '').toLowerCase().trim();
                    if (selfName && pName && (pName === selfName || pName.includes(selfName) || selfName.includes(pName))) return false;
                    return true;
                });
            } catch (e) { /* optional */ }
        }
        if (state.aborted) return cleanup();

        // Firmen-Profil (wird in Phase 4 referenziert)
        let companyProfile = null;
        try {
            companyProfile = analyzeCompanyProfile(url, psiData, place, null);
        } catch(e) { console.error('CompanyProfile failed:', e); companyProfile = { domain: new URL(url).hostname.replace('www.',''), branche: '', isEnterprise: false, enterpriseWarning: null, owner: { name: null, nationality: null }, companyName: '' }; }

        // Phase 3.5: Deep Research + Mockup SOFORT starten — laufen parallel zu Phase 4
        const brancheForAI = place?.primaryTypeDisplayName?.text || companyProfile?.branche || '';
        const businessName = place?.displayName?.text || companyProfile?.companyName || null;
        const deepResearchPromise = deepResearch({
            url,
            branche: brancheForAI || null,
            place: place ? { displayName: place.displayName, formattedAddress: place.formattedAddress, rating: place.rating, userRatingCount: place.userRatingCount, primaryType: place.primaryType, location: place.location, regularOpeningHours: place.regularOpeningHours } : null,
            psiData
        }).catch(err => { console.warn('deepResearch promise rejected:', err?.message || err); return null; });

        // Mockup-Generator: laeuft parallel — braucht kein PSI/Place-Detail, nur URL+Branche+Name
        const mockupPromise = generateMockup({
            url,
            branche: brancheForAI || null,
            businessName,
            currentIssues: null  // wird ggf. nach Deep Research mit Schwaechen-Liste angereichert
        }).catch(err => { console.warn('generateMockup promise rejected:', err?.message || err); return null; });

        // Security-Audit: HTTP-Header / TLS / DNS / Sensitive Files / Outdated Libs
        const securityAuditPromise = securityAudit({
            url,
            psiData
        }).catch(err => { console.warn('securityAudit promise rejected:', err?.message || err); return null; });

        // Phase 4: KI-Analyse parallel — analyzeContent + analyzeBranchStandards entfernt (Deep Research absorbiert beides)
        showLoading('④ KI-Analyse (Screenshot + Reviews + Domain + Deep Research)...');
        const screenshot = psiData?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;

        let screenshotAnalysis = null, reviewSentiment = null,
            domainAge = null, domainAuthority = null, searchVolume = null, deepResearchResult = null, mockupResult = null, securityResult = null;
        try {
            [screenshotAnalysis, reviewSentiment, domainAge, domainAuthority, searchVolume, deepResearchResult, mockupResult, securityResult] = await Promise.all([
                analyzeScreenshot(screenshot).catch(() => null),
                analyzeReviews(domain).catch(() => null),
                getDomainAge(domain).catch(() => null),
                getDomainAuthority(domain).catch(() => null),
                getSearchVolume(`${brancheForAI} ${place?.formattedAddress?.split(',').pop()?.trim() || ''}`.trim() || domain).catch(() => null),
                deepResearchPromise,
                mockupPromise,
                securityAuditPromise
            ]);
        } catch(e) { console.error('KI-Analyse failed:', e); }

        // Deep Research liefert {ok, cached, assessment, meta} — wir extrahieren das Assessment
        const deepAssessment = deepResearchResult?.assessment || null;
        // contentAnalysis / branchStandards halten wir für UI-Kompat noch leer — Deep Research ersetzt sie
        const contentAnalysis = null;
        const branchStandards = null;

        // Phase 5: Scoring — NACH KI-Analyse (Design-Qualität fließt ein)
        showLoading('⑤ Scoring (Monte-Carlo × 2000)...');
        let revenue = null, result = null;
        try {
            revenue = calculateRevenueLoss(ws, place);
        } catch(e) { console.error('Revenue calc failed:', e); }
        try {
            result = scoreLead(ws, tech, place, competitors, footprint, revenue, null, screenshotAnalysis, contentAnalysis, deepAssessment);
        } catch(e) {
            console.error('ScoreLead failed:', e);
            result = { leadScore: 50, conversionRate: 2.0, ci: { lower: 0.5, upper: 5 }, ciMargin: 2, N: 100,
                stages: [], bottleneck: null, drivers: [], kelly: { optimalHours: 2, recommendation: 'Standard' },
                channelResult: { best: { name: 'E-Mail' }, all: [] }, survival: { label: '~14 Tage' },
                nextAction: { action: 'E-Mail senden', state: 'Kalt' }, dealSize: 990, expectedValue: 0,
                sensitivity: [], seasonFactor: 100, timePerLead: 2 };
        }

        // ── Post-Scoring Overrides ──
        // Konkurrenz oder Enterprise → Score = 0, kein Pitch
        if (companyProfile?.isCompetitor || companyProfile?.isEnterprise) {
            result.leadScore = 0;
            result.conversionRate = 0;
            result.expectedValue = 0;
            result._skipPitch = true;
        }
        // Perfekte Website (Perf ≥ 90 + alle CWVs) → Umsatzverlust = 0
        if (ws.perf >= 90 && ws.isHttps && ws.viewport) {
            if (revenue) { revenue.yearlyLoss = 0; revenue.monthlyLoss = 0; revenue.roi = 0; }
        }

        // ── Phase 6: Lokale Analyse (synchron, kein await) ──
        const abTest = sv();
        const drift = cd(domain, result.leadScore);
        const wayback = null; // Wayback ist zu langsam — wird nicht mehr blockierend aufgerufen
        const localAnalysis = runLocalAnalysis({ ws, tech, psiData, place, competitors, footprint, revenue, result, reviewSentiment, wayback, screenshotAnalysis, contentAnalysis, companyProfile });

        // ── SOFORT rendern — der User soll nicht länger warten ──
        hideLoading();
        document.getElementById('btn-analyze').disabled = false;

        // Phase 7 läuft im Hintergrund — Ergebnisse werden NICHT blockierend geladen
        // Timeout: Max 8 Sekunden pro Call, dann null
        const withTimeout = (promise, ms = 8000) =>
            Promise.race([promise, new Promise(r => setTimeout(() => r(null), ms))]);

        const [socialProfiles, emailCheck, contactData, sitemapFreshness, mockupSuggestion] = await Promise.all([
            withTimeout(analyzeSocialProfiles(url, footprint?.profileUrls || {}).catch(() => null)),
            withTimeout(checkEmailDeliverability(domain).catch(() => null)),
            withTimeout(enrichContact(url).catch(() => null)),
            withTimeout(checkSitemapFreshness(url).catch(() => null)),
            (result.leadScore >= 50 && screenshotAnalysis?.designQuality <= 5)
                ? withTimeout(generateMockupSuggestion(domain, companyProfile?.branche || '', localAnalysis.bfsgScore?.criticalFails?.map(f => f.name).join(', ') || '', screenshot).catch(() => null), 15000)
                : null
        ]).catch(() => [null, null, null, null, null]);

        // ── SOFORT rendern mit dem was wir haben ──
        state.lastResult = {
            url, ws, tech, place, competitors, footprint, result, revenue, screenshot,
            contentAnalysis, screenshotAnalysis, reviewSentiment, domainAge, domainAuthority,
            searchVolume, psiData, abTest, drift, wayback, companyProfile, branchStandards,
            socialProfiles, emailCheck, contactData, sitemapFreshness, mockupSuggestion,
            deepResearch: deepResearchResult,
            deepAssessment,
            mockup: mockupResult,
            security: securityResult,
            ...localAnalysis
        };
        // Globale Referenz fuer Mockup-Copy-Buttons (siehe render-components.js)
        if (typeof window !== "undefined") {
            window.__lastMockupResult = mockupResult || null;
        }

        hideSkeleton();
        renderResult(state.lastResult);
        results.classList.remove('hidden');

    } catch (e) {
        hideSkeleton();
        hideLoading();
        document.getElementById('btn-analyze').disabled = false;
        const errorEl = document.getElementById('error');
        document.getElementById('error-text').innerHTML = `Analyse fehlgeschlagen: ${e.message}<br><button class="btn-primary" style="margin-top:12px;font-size:13px;padding:8px 20px" id="btn-retry">Erneut versuchen</button>`;
        errorEl.classList.remove('hidden');
        document.getElementById('btn-retry')?.addEventListener('click', () => {
            errorEl.classList.add('hidden');
            runSingleCheck();
        });
    }
}

function renderResult(data) {
    // Sicherheitscheck
    const ids = ['result-score','result-funnel','result-decision','result-ux','result-future','result-signals','result-science','result-ai','result-revenue','result-strategy','result-expert','result-actions'];
    for (const id of ids) {
        if (!document.getElementById(id)) {
            document.getElementById('error-text').textContent = 'Render-Fehler: Bitte Seite neu laden (Cmd+Shift+R)';
            document.getElementById('error').classList.remove('hidden');
            return;
        }
    }

    const r = data.result;
    const cp = data.companyProfile || {};
    const isSkip = r._skipPitch || cp.isCompetitor || cp.isEnterprise;
    const domain = new URL(data.url).hostname.replace('www.', '');

    // Erklärung generieren
    let explanation;
    if (isSkip && cp.isCompetitor) {
        explanation = `<strong style="color:var(--muted)">Diesen Lead überspringen.</strong><br><br>${domain} ist selbst eine Webdesign-Agentur oder IT-Dienstleister — ein Mitbewerber, kein potenzieller Kunde.`;
    } else if (isSkip && cp.isEnterprise) {
        explanation = `<strong style="color:var(--muted)">Diesen Lead überspringen.</strong><br><br>${cp.enterpriseWarning?.message || 'Großunternehmen — nicht Ihre Zielgruppe.'}`;
    } else {
        explanation = generateExplanation(r, data.ws, data.tech, data, auditUX(data.psiData, data.place));
    }

    // ── 8 Render-Komponenten mit Error Boundaries ──
    const sections = [
        ['result-score',    'Score',      el => renderScore(el, data, explanation)],
        ['result-funnel',   'Funnel',     el => renderFunnel(el, document.getElementById('result-decision'), r)],
        ['result-ux',       'UX-Analyse', el => renderUX(el, data)],
        ['result-future',   'Readiness',  el => renderFuture(el, data)],
        ['result-science',  'Wissenschaft', el => renderScience(el, data)],
        ['result-ai',       'KI-Analyse', el => renderAI(el, data)],
        ['result-signals',  'Signale',    el => renderSignals(el, data)],
        ['result-revenue',  'Umsatz',     el => renderRevenue(el, data)],
        ['result-strategy', 'Strategie',  el => renderStrategy(el, document.getElementById('result-expert'), document.getElementById('result-actions'), data)],
    ];

    for (const [id, label, fn] of sections) {
        const el = document.getElementById(id);
        if (!el) continue;
        try {
            fn(el);
        } catch (e) {
            console.error(`Render "${label}" failed:`, e);
            el.innerHTML = `<div class="card"><div class="metric-desc" style="color:var(--red)">${label}: ${e.message}</div></div>`;
        }
    }
}

// ── #12: Klartext-Erklärung (verständlich für jeden, nutzbar als E-Mail) ──
/**
 * Alle synchronen Analyse-Module gebündelt.
 * Keine DOM-Zugriffe, keine API-Calls — pure Berechnung.
 */
function runLocalAnalysis(p) {
    const { ws, tech, psiData, place, competitors, footprint, revenue, result, reviewSentiment, wayback, screenshotAnalysis, contentAnalysis, companyProfile } = p;

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
    const cruxData = null; // CrUX wird async separat geholt wenn nötig
    const bfsgScore = checkBFSGCompliance(psiData);
    const triggerEvents = detectTriggerEvents({ ws, tech, place, wayback, footprint, psiData, contentAnalysis, socialSignals, competitors });
    const techDepth = analyzeTechDepth(psiData, tech);
    const contentFreshness = analyzeContentFreshness(psiData, contentAnalysis, wayback);
    const pxIndex = calculatePXIndex(ws, psiData, contentAnalysis, screenshotAnalysis);
    const schemaCheck = checkSchema(psiData);
    const messagingCheck = checkMessaging(psiData);
    const reviewVelocity = calculateReviewVelocity(place?.reviews, place?.userRatingCount);
    const gbpDynamics = analyzeGBPDynamics(place);
    const wpSecurity = assessWPSecurity(psiData, tech);
    const cognitiveLoad = assessCognitiveLoad(psiData);
    const signalStack = analyzeSignalStack({ ws, tech, place, footprint, revenue, wayback, screenshotAnalysis, socialSignals, surgeIntent, emotionalReady, conversationReady, bfsgScore });
    const compositeScore = calculateCompositeScore({ ws, tech, place, footprint, revenue, result, screenshotAnalysis, contentAnalysis, socialSignals, triggerEvents, bfsgScore, signalStack, techDepth, contentFreshness, companyProfile });
    const feedbackInsight = getScoreInsight(result.leadScore);
    // Konsolidierte Top-Empfehlung — EV ist Top-Filter (siehe decision-engine.js).
    // Verhindert Widersprueche zwischen "Composite=Exzellent" und "Kelly=Skip".
    const decision = decideAction({ composite: compositeScore, kelly: result?.kelly, triggers: triggerEvents, leadScore: result?.leadScore });

    return {
        surgeIntent, digitalMaturity, conversationReady, stakeholder, techTrajectory,
        localSEO, emotionalReady, revenueWeighted, socialSignals, socialComparison,
        cruxData, bfsgScore, triggerEvents, techDepth, contentFreshness,
        pxIndex, schemaCheck, messagingCheck, signalStack, compositeScore, feedbackInsight,
        reviewVelocity, gbpDynamics, wpSecurity, cognitiveLoad, decision
    };
}

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
            // VERIFIKATIONS-TOR: Das heuristische UX-Audit rendert die Seite NICHT.
            // Jeder "fehlt"-Befund wird gegen die Deep-Research-Lesung geprüft:
            //   confirmed → echte Lücke (darf in die Mail) · present → vorhanden (raus)
            //   unverified → nur als "zu prüfen"-Hinweis (NICHT in die Mail).
            const deep = data.deepAssessment;
            const confirmed = [], toCheck = [];
            for (const m of uxAudit.missingCritical) {
                const v = verifyFeatureClaim(m.name, deep);
                if (v === 'present') continue;                 // Deep sah es → "fehlt" ist falsch
                (v === 'confirmed' ? confirmed : toCheck).push(m);
            }
            if (confirmed.length > 0) {
                let t = `<strong>Bestätigt fehlend (Deep-Research):</strong><br>`;
                for (const m of confirmed) {
                    t += `<br>✗ <strong>${m.name}</strong> — ${m.why}`;
                    emailArgs.push(`${m.name} fehlt auf Ihrer Website — ${m.why.split('—')[0].trim()}`);
                }
                problems.push(t);
            }
            if (toCheck.length > 0) {
                let t = `<strong>Bitte an der echten Seite prüfen</strong> — automatisch nicht gefunden, kann vorhanden sein:<br>`;
                for (const m of toCheck) t += `<br>? <strong>${m.name}</strong> — ${m.why}`;
                t += `<br><br><span style="color:var(--muted)">Diese Punkte gehen NICHT automatisch in die Mail.</span>`;
                problems.push(t);
            }
            // Branchen-generischer Pitch (keine seiten-spezifische Behauptung) bleibt.
            if (uxAudit.persona?.missingPitch) {
                problems.push(`<div style="background:rgba(0,113,227,0.05);padding:12px 16px;border-radius:8px;border-left:3px solid var(--accent);margin:4px 0"><strong>${uxAudit.persona.missingPitch}</strong></div>`);
            }
        } else if (uxAudit?.missing?.length > 0) {
            problems.push(`<strong>Zu prüfen</strong> (automatisch nicht gefunden, kann vorhanden sein): ${uxAudit.missing.map(m => `<strong>${m.name}</strong>`).join(', ')}.`);
        }

        // ── Basis-Features (gemessen) und Modern-Empfehlungen (nicht gemessen) klar trennen ──
        // Vorher: ein Satz vermischte uxAudit.modernFeatures (4 Items, ungeprueft) mit
        // uxAudit.results.length (3 Items, geprueft) — fuehrte zu "3 von 3 Basis-Features"
        // direkt unter einer Liste mit 4 Items.
        if (uxAudit?.results?.length > 0) {
            const foundNames = (uxAudit.found || []).map(f => f.name).join(', ') || '—';
            problems.push(`<strong>Basis-Features (geprueft):</strong> ${name} hat ${uxAudit.found?.length || 0} von ${uxAudit.results.length} (${foundNames}).`);
        }
        if (uxAudit?.modernFeatures?.length > 0) {
            problems.push(`<strong>Empfehlungen fuer eine moderne ${uxAudit.persona?.name || branche}-Website 2026:</strong> ${uxAudit.modernFeatures.join(', ')}.`);
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
            problems.push(`<strong>Geschätzter Umsatzverlust: ~${(rev.pitchValue ?? rev.yearlyLoss).toLocaleString('de-DE')} €/Jahr</strong>. Eine neue Website für 990-1.990 € amortisiert sich in ${rev.roi > 0 ? Math.ceil(1990 / (rev.yearlyLoss / 12)) + ' Monaten' : 'kurzer Zeit'}.`);
            emailArgs.push(`wir schätzen den jährlichen Verlust auf rund ${(rev.pitchValue ?? rev.yearlyLoss).toLocaleString('de-DE')} €`);
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

        // ── Module 11-15 ──
        if (data.bfsgScore?.pitchArg) {
            problems.push(`<div class="highlight-box-red"><strong>BFSG-Risiko:</strong> ${data.bfsgScore.pitchArg}</div>`);
            emailArgs.push(`die Website erfüllt nur ${data.bfsgScore.complianceScore}% der Barrierefreiheits-Anforderungen`);
        }

        if (data.triggerEvents?.hasSofort) {
            const top = data.triggerEvents.topEvent;
            problems.push(`<strong>Dringender Handlungsbedarf:</strong> ${top.label}`);
        }

        if (data.techDepth?.pitchArg) {
            problems.push(data.techDepth.pitchArg);
        }

        if (data.contentFreshness?.pitchArg) {
            problems.push(data.contentFreshness.pitchArg);
        }

        if (data.emailCheck?.pitchArg) {
            problems.push(data.emailCheck.pitchArg);
        }

        if (data.signalStack?.clusterCount >= 2) {
            problems.push(`<div class="highlight-box"><strong>Signal-Häufung:</strong> ${data.signalStack.label}. ${data.signalStack.pitchArgs[0] || ''}</div>`);
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
