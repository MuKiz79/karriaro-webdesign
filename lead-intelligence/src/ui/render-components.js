/**
 * Render Components — Aufgeteilte renderResult()-Sektionen
 * Jede Funktion rendert in ein DOM-Element und ist unabhängig testbar.
 * Fehler in einer Komponente crashen NICHT die anderen (Error Boundary).
 */

import { auditUX } from '../analysis/ux-audit.js';
import { analyzeFutureReadiness } from '../analysis/future-readiness.js';
import { calculateEntropy } from '../analysis/entropy.js';
import { calculateActivation } from '../analysis/activation.js';
import { calculateEpidemic } from '../analysis/epidemic.js';
import { calculateKahneman } from '../analysis/kahneman.js';
import { detectGoogleAds } from '../signals/google-ads.js';
import { detectJobSignals } from '../signals/job-signal.js';
import { generateGoogleReport } from '../strategy/google-report.js';
import { saveLead } from '../crm/leads.js';

// ══════════════════════════════════════
// Helper
// ══════════════════════════════════════

function safeRender(el, renderFn, fallbackLabel) {
    try {
        renderFn(el);
    } catch (e) {
        console.error(`Render "${fallbackLabel}" failed:`, e);
        el.innerHTML = `<div class="card"><div class="metric-desc" style="color:var(--red)">${fallbackLabel}: ${e.message}</div></div>`;
    }
}

function animateCount(el, from, to, duration) {
    const start = performance.now();
    function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(from + (to - from) * ease);
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

export function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ══════════════════════════════════════
// 1. Score Ring + Warnings + Explanation
// ══════════════════════════════════════

export function renderScore(el, data, explanation) {
    const r = data.result;
    const cp = data.companyProfile || {};
    const isSkip = r._skipPitch || cp.isCompetitor || cp.isEnterprise;
    const color = isSkip ? 'var(--muted)' : r.leadScore >= 55 ? 'var(--green)' : r.leadScore >= 30 ? 'var(--orange)' : 'var(--red)';
    const rawColor = isSkip ? '#86868b' : r.leadScore >= 55 ? '#30d158' : r.leadScore >= 30 ? '#ff9f0a' : '#ff453a';
    const label = isSkip
        ? (cp.isCompetitor ? 'Konkurrenz — nicht kontaktieren' : 'Nicht Ihre Zielgruppe')
        : r.leadScore >= 55 ? 'Starker Lead — kontaktieren' : r.leadScore >= 30 ? 'Vielversprechend — Quick-Pitch' : 'Schwacher Lead';

    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (r.leadScore / 100) * circumference;
    let html = '';

    // Warnings
    if (cp?.isEnterprise) {
        html += `<div class="card card-warn anim-in" style="text-align:left">
            <div class="enterprise-warn-title">⚠ Großunternehmen erkannt</div>
            <div class="enterprise-warn-body">${cp.enterpriseWarning.message}</div>
            <div class="enterprise-warn-signals">Signale: ${cp.enterpriseWarning.signals.join(' · ')}</div>
            <div class="enterprise-warn-rec">${cp.enterpriseWarning.recommendation}</div>
        </div>`;
    }
    if (cp?.isCompetitor) {
        html += `<div class="card card-warn anim-in" style="text-align:left">
            <div class="enterprise-warn-title">⚠ Konkurrenz erkannt</div>
            <div class="enterprise-warn-body">${cp.competitorWarning.message}</div>
            <div class="enterprise-warn-rec">${cp.competitorWarning.recommendation}</div>
        </div>`;
    }

    // Company Info
    html += `<div class="company-info anim-in">
        <span><strong>Branche:</strong> ${cp?.branche || '—'}</span>
        ${cp?.owner?.name ? `<span><strong>Inhaber:</strong> ${cp.owner.name}${cp.owner.nationality ? ' ('+cp.owner.nationality+')' : ''}</span>` : ''}
        ${data.stakeholder ? `<span><strong>Entscheider:</strong> ${data.stakeholder.decisionMaker.type}</span>` : ''}
        ${data.stakeholder ? `<span><strong>Sales-Cycle:</strong> ${data.stakeholder.salesCycle}</span>` : ''}
    </div>`;

    // SVG Ring
    html += `<div style="text-align:center;margin-bottom:32px" class="anim-in">
        <div class="score-ring-wrap">
            <svg class="score-ring-svg" viewBox="0 0 160 160">
                <circle class="score-ring-bg" cx="80" cy="80" r="70"/>
                <circle class="score-ring-fill" cx="80" cy="80" r="70"
                    stroke="${rawColor}" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" data-target="${offset}"/>
            </svg>
            <div class="score-ring-value">
                <div class="score-number" style="color:${color}" data-target="${r.leadScore}">0</div>
                <div class="score-label" style="color:${color}">${label}</div>
            </div>
        </div>
        <div class="score-meta">Conversion-Rate: ${r.conversionRate}% · CI: ${r.ci.lower}% — ${r.ci.upper}% (N=${r.N})</div>
        <div class="explanation-box">${explanation}</div>
    </div>`;

    el.innerHTML = html;

    // Animate
    requestAnimationFrame(() => {
        const ring = el.querySelector('.score-ring-fill');
        if (ring) ring.style.strokeDashoffset = ring.dataset.target;
        const num = el.querySelector('.score-number');
        if (num) animateCount(num, 0, parseInt(num.dataset.target), 800);
    });
}

// ══════════════════════════════════════
// 2. Funnel + Decision
// ══════════════════════════════════════

export function renderFunnel(funnelEl, decEl, r) {
    funnelEl.innerHTML = r.stages.map(s => {
        const barColor = s.mean >= 50 ? 'var(--green)' : s.mean >= 25 ? 'var(--orange)' : 'var(--red)';
        const isBn = r.bottleneck && s.name === r.bottleneck.name;
        return `<div class="funnel-stage">
            <span class="funnel-stage-name${isBn ? ' bottleneck' : ''}">${isBn ? '⚠ ' : ''}${s.name}</span>
            <div class="funnel-bar-wrap"><div class="funnel-bar-fill" style="background:${barColor}" data-width="${s.mean}%"></div></div>
            <span class="funnel-stage-value">${s.mean}%</span>
        </div>`;
    }).join('');

    requestAnimationFrame(() => {
        funnelEl.querySelectorAll('.funnel-bar-fill').forEach((bar, i) => {
            setTimeout(() => { bar.style.width = bar.dataset.width; }, i * 80);
        });
    });

    decEl.innerHTML = `
        <div class="card card-accent anim-in">
            <div class="stat-row"><span class="stat-label">Erwarteter Wert</span><span class="stat-value">${r.expectedValue > 0 ? '+' : ''}${r.expectedValue} €</span></div>
            <div class="stat-row"><span class="stat-label">Kelly-Allokation</span><span class="stat-value">${r.kelly.optimalHours}h/Woche · ${r.kelly.recommendation}</span></div>
            <div class="stat-row"><span class="stat-label">Bester Kanal</span><span class="stat-value">${r.channelResult.best?.name || 'E-Mail'}</span></div>
            <div class="stat-row"><span class="stat-label">Time-to-Conversion</span><span class="stat-value">${r.survival.label}</span></div>
            <div class="stat-row"><span class="stat-label">Nächste Aktion</span><span class="stat-value">${r.nextAction.action}</span></div>
        </div>`;
}

// ══════════════════════════════════════
// 3. UX Audit + Branch Standards + Social
// ══════════════════════════════════════

export function renderUX(el, data) {
    let html = '';

    // KI-Branchenanalyse
    if (data.branchStandards && !data.branchStandards.error) {
        const bs = data.branchStandards;
        const modColor = (bs.modernityScore || 0) >= 7 ? 'var(--green)' : (bs.modernityScore || 0) >= 4 ? 'var(--orange)' : 'var(--red)';
        html += `<div class="card card-accent anim-in">
            <div class="section-label-accent">KI-Branchenanalyse: ${bs.branche || data.companyProfile?.branche || ''}</div>
            <div class="flex-between" style="margin-bottom:12px">
                <div><span class="metric-desc">Modernität: </span><span class="metric-xl" style="color:${modColor}">${bs.modernityScore || '?'}/10</span> <span class="metric-desc">${bs.modernityLabel || ''}</span></div>
                <div style="font-size:12px"><span style="color:var(--green);font-weight:700">${bs.found?.length || 0} vorhanden</span> · <span style="color:var(--red);font-weight:700">${bs.missing?.length || 0} fehlen</span></div>
            </div>`;
        if (bs.missing?.length > 0) {
            html += `<div style="font-size:13px;font-weight:700;margin-bottom:8px">Was dieser Website fehlt:</div>`;
            for (const m of bs.missing) {
                html += `<div class="missing-feature"><div class="missing-feature-name"><span class="feature-icon missing">✗</span><strong>${m.name}</strong></div><div class="missing-feature-why">${m.why}</div>${m.impact ? `<div class="missing-feature-impact">${m.impact}</div>` : ''}</div>`;
            }
        }
        if (bs.found?.length > 0) html += `<div class="found-list">Vorhanden: ${bs.found.join(', ')}</div>`;
        html += `</div>`;
        if (bs.topPitchArgument) html += `<div class="pitch-box anim-in"><h3>Stärkstes Argument (KI-generiert)</h3><p>${bs.topPitchArgument}</p></div>`;
        if (bs.summary) html += `<div class="card-summary anim-in" style="margin-bottom:12px">"${bs.summary}"</div>`;
    }

    // UX-Audit
    const uxResult = auditUX(data.psiData, data.place);
    if (uxResult && uxResult.results) {
        const uxColor = uxResult.uxScore >= 70 ? 'var(--green)' : uxResult.uxScore >= 40 ? 'var(--orange)' : 'var(--red)';
        html += `
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
            <div class="card anim-in"><div class="section-label-accent">Was eine moderne ${uxResult.persona.name}-Website 2026 braucht</div><div style="display:flex;flex-wrap:wrap;gap:6px">${uxResult.modernFeatures.map(f => `<span class="badge badge-green">${f}</span>`).join('')}</div></div>`;
    }

    // Social Signals
    html += renderSocialSignals(data);

    el.innerHTML = html;
}

function renderSocialSignals(data) {
    const ss = data.socialSignals;
    const sc = data.socialComparison;
    const sp = data.socialProfiles;
    if (!ss?.available && !sc?.available && !sp) return '';

    let html = '';

    if (ss?.available && ss.signals.length > 0) {
        const ssColor = ss.pct >= 60 ? 'var(--green)' : ss.pct >= 30 ? 'var(--orange)' : 'var(--red)';
        html += `<div class="card card-accent anim-in">
            <div class="section-label-accent">Social Signals — Google Business Profile</div>
            <div class="flex-between" style="margin-bottom:12px"><div><span class="metric-xl" style="color:${ssColor}">${ss.pct}%</span> <span class="metric-desc">${ss.label}</span></div></div>
            ${ss.signals.map(s => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${s.strength > 0 ? 'found' : 'missing'}">${s.strength > 0 ? '✓' : '✗'}</span>${s.label}</span><span class="feature-detail">${s.detail}</span></div>`).join('')}
        </div>`;
        if (ss.reviewTrend && ss.reviewTrend.direction !== 'stabil') {
            const tColor = ss.reviewTrend.direction === 'steigend' ? 'var(--green)' : 'var(--red)';
            html += `<div class="card anim-in" style="border-left:3px solid ${tColor}"><div class="section-label">Review-Trend</div><div class="metric-xl" style="color:${tColor}">${ss.reviewTrend.olderAvg} → ${ss.reviewTrend.recentAvg} Sterne</div><div class="metric-desc">Bewertungen werden ${ss.reviewTrend.direction} (Δ ${ss.reviewTrend.delta > 0 ? '+' : ''}${ss.reviewTrend.delta})</div></div>`;
        }
    }

    if (sp && !sp.error) {
        let profileHtml = '';
        if (sp.instagram?.followers) profileHtml += `<div class="stat-row"><span class="stat-label">Instagram</span><span class="stat-value">${sp.instagram.followers.toLocaleString('de-DE')} Follower · ${sp.instagram.posts || '?'} Posts</span></div>`;
        if (sp.facebook?.likes || sp.facebook?.followers) profileHtml += `<div class="stat-row"><span class="stat-label">Facebook</span><span class="stat-value">${(sp.facebook.followers || sp.facebook.likes || 0).toLocaleString('de-DE')} ${sp.facebook.followers ? 'Follower' : 'Likes'}</span></div>`;
        if (sp.linkedin?.detected) profileHtml += `<div class="stat-row"><span class="stat-label">LinkedIn</span><span class="stat-value">${sp.linkedin.isCompanyPage ? 'Company Page' : 'Profil'} vorhanden</span></div>`;
        if (sp.tiktok?.followers) profileHtml += `<div class="stat-row"><span class="stat-label">TikTok</span><span class="stat-value">${sp.tiktok.followers.toLocaleString('de-DE')} Follower</span></div>`;
        if (profileHtml) html += `<div class="card anim-in"><div class="section-label">Social-Media-Reichweite</div>${profileHtml}</div>`;
    }

    if (sc?.available && sc.gaps.length > 0) {
        html += `<div class="card anim-in"><div class="section-label">Konkurrenz-Vergleich (Social)</div>${sc.gaps.map(g => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${g.severity === 'paradox' ? 'found' : 'missing'}">${g.severity === 'paradox' ? '★' : '⚠'}</span>${g.label}</span><span class="feature-detail">${g.detail}</span></div>`).join('')}</div>`;
        if (sc.pitchArgs.length > 0) html += `<div class="pitch-box anim-in"><h3>Social-Argument für den Pitch</h3><p>${sc.pitchArgs[0]}</p></div>`;
    }

    return html;
}

// ══════════════════════════════════════
// 4. Future Readiness
// ══════════════════════════════════════

export function renderFuture(el, data) {
    const futureResult = analyzeFutureReadiness(data.ws, data.psiData);
    if (!futureResult) { el.innerHTML = ''; return; }
    const fcColor = futureResult.readinessScore >= 75 ? 'var(--green)' : futureResult.readinessScore >= 40 ? 'var(--orange)' : 'var(--red)';
    el.innerHTML = `
        <div class="card anim-in" style="border-left:3px solid ${fcColor}">
            <div class="flex-between">
                <div><span class="section-label">Readiness 2026: </span><span class="metric-xl" style="color:${fcColor}">${futureResult.readinessScore}/100</span> <span class="metric-desc">${futureResult.label}</span></div>
                <div style="font-size:12px"><span class="good">${futureResult.passed.length} ✓</span> · <span class="bad">${futureResult.failed.length} ✗</span></div>
            </div>
        </div>
        <div class="card anim-in">
            ${futureResult.results.map(c => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${c.passed ? 'found' : c.weight >= 3 ? 'missing' : 'warn'}">${c.passed ? '✓' : '✗'}</span>${c.name}${c.weight >= 3 ? ' <span class="feature-critical">PFLICHT</span>' : ''}</span><span class="feature-detail">${c.passed ? 'Bestanden' : c.stat}</span></div>`).join('')}
        </div>`;
}

// ══════════════════════════════════════
// 5. Science (Entropy, Activation, R0, Kahneman)
// ══════════════════════════════════════

export function renderScience(el, data) {
    const entropy = calculateEntropy(data.psiData, data.tech);
    const activation = calculateActivation(data.ws, data.tech, data.place, data.competitors, data.revenue);
    const r0 = calculateEpidemic(data.place, data.competitors);
    const ads = detectGoogleAds(data.psiData);
    const jobs = detectJobSignals(data.psiData);
    const kahneman = calculateKahneman(data.ws, data.tech, data.place, data.revenue, activation);

    const sc = v => v >= 0.6 ? 'good' : v >= 0.3 ? 'ok' : 'bad';
    el.innerHTML = `
        <div class="science-grid">
            <div class="card anim-in"><div class="section-label">Thermo-Entropie</div><div class="metric-big ${sc(entropy?.S)}">${entropy?.S ?? '—'}</div><div class="metric-desc">${entropy?.label || ''}</div></div>
            <div class="card anim-in"><div class="section-label">Aktivierungsenergie</div><div class="metric-big ${activation?.Ea <= 25 ? 'good' : activation?.Ea <= 45 ? 'ok' : 'bad'}">${activation?.Ea ?? '—'} kJ</div><div class="metric-desc">${activation?.label || ''}</div></div>
            <div class="card anim-in"><div class="section-label">Epidemischer R₀</div><div class="metric-big ${r0?.R0 >= 2 ? 'good' : r0?.R0 >= 1 ? 'ok' : 'bad'}">${r0?.R0 ?? '—'}</div><div class="metric-desc">${r0?.label || ''}</div></div>
            <div class="card anim-in"><div class="section-label">Google Ads</div><div class="metric-big" style="color:${ads?.active ? 'var(--green)' : 'var(--muted)'}">${ads?.active ? 'Aktiv' : 'Nein'}</div><div class="metric-desc">${ads?.insight || ''}</div></div>
        </div>
        ${kahneman ? `<div class="card anim-in"><div class="section-label">Kahneman-Entscheidungsprofil</div><div class="kahneman-wrap"><div class="kahneman-system"><div class="kahneman-value" style="color:${kahneman.system1 > 55 ? 'var(--red)' : 'var(--muted)'}">${kahneman.system1}%</div><div class="kahneman-label">System 1 (emotional)</div></div><div class="kahneman-system"><div class="kahneman-value" style="color:${kahneman.system2 > 55 ? 'var(--accent)' : 'var(--muted)'}">${kahneman.system2}%</div><div class="kahneman-label">System 2 (rational)</div></div></div><div class="kahneman-strategy">${kahneman.pitchStrategy?.approach || ''}</div></div>` : ''}
        ${jobs?.isHiring ? `<div class="card anim-in"><span class="badge badge-green">Stellt ein — wachsendes Unternehmen</span></div>` : ''}`;
}

// ══════════════════════════════════════
// 6. KI Analyse (Content, Screenshot, Domain)
// ══════════════════════════════════════

export function renderAI(el, data) {
    const { contentAnalysis: ca, screenshotAnalysis: sa, domainAge: da, domainAuthority: dau, searchVolume: svol } = data;
    let html = '';
    if (ca && !ca.error) {
        html += `<div class="card anim-in"><div class="section-label">KI Content-Analyse</div>
            <div class="stat-row"><span class="stat-label">Tonalität</span><span class="stat-value">${ca.tonality || '—'}</span></div>
            <div class="stat-row"><span class="stat-label">Aktualität</span><span class="stat-value">${ca.freshness || '—'}${ca.copyrightYear ? ' (©'+ca.copyrightYear+')' : ''}</span></div>
            <div class="stat-row"><span class="stat-label">USP</span><span class="stat-value">${ca.hasUSP ? 'Ja' : 'Nein'}</span></div>
            <div class="stat-row"><span class="stat-label">CTA</span><span class="stat-value">${ca.hasCTA ? 'Ja' : 'Fehlt'}</span></div>
            ${ca.summary ? `<div class="card-summary" style="margin-top:8px">"${ca.summary}"</div>` : ''}</div>`;
    }
    if (sa && !sa.error) {
        html += `<div class="card anim-in"><div class="section-label">KI Design-Bewertung</div>
            <div class="stat-row"><span class="stat-label">Design-Qualität</span><span class="stat-value ${(sa.designQuality||0) >= 7 ? 'good' : 'bad'}">${sa.designQuality || '—'}/10</span></div>
            <div class="stat-row"><span class="stat-label">Design-Ära</span><span class="stat-value">${sa.designEra || '—'}</span></div>
            ${sa.overallImpression ? `<div class="card-summary" style="margin-top:8px">"${sa.overallImpression}"</div>` : ''}</div>`;
    }
    if (da?.age || dau?.pageRank || svol?.suggestions > 0) {
        html += `<div class="science-grid">`;
        if (da?.age) html += `<div class="card anim-in"><div class="section-label">Domain-Alter</div><div class="metric-xl">${da.age} Jahre</div></div>`;
        if (dau?.pageRank) html += `<div class="card anim-in"><div class="section-label">Domain Authority</div><div class="metric-xl">${dau.pageRank}</div></div>`;
        if (svol?.suggestions > 0) html += `<div class="card anim-in"><div class="section-label">Suchvolumen</div><div class="metric-xl ${svol.hasVolume ? 'good' : ''}">${svol.hasVolume ? 'Hoch' : 'Niedrig'}</div></div>`;
        html += `</div>`;
    }
    el.innerHTML = html;
}

// ══════════════════════════════════════
// 7. Revenue + CWV
// ══════════════════════════════════════

export function renderRevenue(el, data) {
    const rev = data.revenue;
    let html = '';
    if (rev && rev.yearlyLoss > 0) {
        html += `<div class="card anim-in">
            <div class="revenue-big">~${rev.yearlyLoss.toLocaleString('de-DE')} €<span class="revenue-unit">/Jahr</span></div>
            <div class="revenue-detail">80%-Intervall: ${rev.yearlyLow?.toLocaleString('de-DE') || '?'} € — ${rev.yearlyHigh?.toLocaleString('de-DE') || '?'} € (Monte-Carlo)</div>
            <div class="revenue-detail">~${rev.estMonthlyVisitors} Besucher/Monat · ROI einer neuen Website: <strong class="good">${rev.roi}x</strong></div>
        </div>`;
    }
    const gr = generateGoogleReport(data.ws);
    html += `<div class="card anim-in">
        <div class="section-label">Google Core Web Vitals — ${gr.passed}/${gr.total} bestanden</div>
        ${gr.cwv.map(c => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${c.pass ? 'found' : 'missing'}">${c.pass ? '✓' : '✗'}</span>${c.name}</span><span class="feature-detail">${c.value} (${c.threshold})</span></div>`).join('')}
    </div>`;
    el.innerHTML = html;
}

// ══════════════════════════════════════
// 8. Strategy + Pitch + Sequence + Actions
// ══════════════════════════════════════

export function renderStrategy(stratEl, expertEl, actionsEl, data) {
    const r = data.result;
    const ws = data.ws;
    const tech = data.tech;
    const domain = new URL(data.url).hostname.replace('www.', '');
    const rev = data.revenue;
    let html = '';

    // Skip-Check
    if (r._skipPitch) {
        if (data.screenshot) {
            html += `<div class="card anim-in" style="text-align:center;padding:24px"><div class="phone-frame"><img src="${data.screenshot}" alt="Mobile Screenshot"></div><div class="phone-caption">So sieht die Website auf dem Smartphone aus</div></div>`;
        }
        stratEl.innerHTML = html;
        expertEl.innerHTML = `<div class="card"><pre style="font-size:11px;overflow-x:auto;max-height:400px">${JSON.stringify(r, null, 2)}</pre></div>`;
        actionsEl.innerHTML = '';
        return;
    }

    // Screenshot
    if (data.screenshot) {
        html += `<div class="card anim-in" style="text-align:center;padding:24px"><div class="phone-frame"><img src="${data.screenshot}" alt="Mobile Screenshot"></div><div class="phone-caption">So sieht die Website auf dem Smartphone aus</div></div>`;
    }

    // Digital Footprint
    if (data.footprint?.platforms?.length > 0) {
        html += `<div class="card anim-in"><div class="section-label">Digital Footprint — ${data.footprint.label} (${data.footprint.maturity})</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${data.footprint.platforms.map(p => `<span class="badge badge-green">${p.name}</span>`).join('')}</div>${data.footprint.pixels?.length > 0 ? `<div class="metric-desc">Pixel: ${data.footprint.pixels.map(p => p.name).join(' · ')}</div>` : ''}<div class="metric-desc" style="margin-top:4px">${data.footprint.insight}</div></div>`;
    }

    // Competitors
    if (data.competitors?.length > 1) {
        html += `<div class="card anim-in" style="padding:0;overflow:auto"><table class="data-table"><thead><tr><th>Konkurrent</th><th>Sterne</th><th>Bew.</th></tr></thead><tbody>${data.competitors.slice(0, 5).map(c => `<tr><td>${c.displayName?.text || '—'}</td><td>${c.rating || '—'}</td><td>${c.userRatingCount || 0}</td></tr>`).join('')}</tbody></table></div>`;
    }

    // Channels
    if (r.channelResult?.all?.length > 1) {
        html += `<div class="card anim-in"><div class="section-label">Kanal-Optimierung</div>`;
        for (const ch of r.channelResult.all) {
            const best = ch.name === r.channelResult.best?.name;
            html += `<div class="stat-row"><span class="stat-label">${best ? '★ ' : ''}${ch.name}</span><span class="stat-value${best ? ' good' : ''}">${ch.ev}€ EV · ${ch.costHours}h</span></div>`;
        }
        html += '</div>';
    }

    // Subject Tips + Timing
    html += `<div class="card anim-in"><div class="section-label">Betreff-Optimierung (Snov.io 2026)</div><div class="stat-row"><span class="stat-label">Zahlen im Betreff</span><span class="stat-value good">+45% Open Rate</span></div><div class="stat-row"><span class="stat-label">Vor- und Nachname</span><span class="stat-value">33% Open Rate</span></div><div class="stat-row"><span class="stat-label">Betreff als Frage</span><span class="stat-value">+10% Open Rate</span></div><div class="stat-row"><span class="stat-label">Email-Länge</span><span class="stat-value">< 80 Wörter optimal</span></div></div>`;
    html += `<div class="card card-accent anim-in"><div class="section-label">Optimales Timing</div><div class="timing-best">Bester Versandtag: Dienstag (28.2% Open) · Bester Reply-Tag: Mittwoch (5.8%)</div><div class="timing-detail">Uhrzeit: 7-11 Uhr · Saison: ${r.seasonFactor}%</div></div>`;

    // Pitch
    const pitchLines = [];
    if (ws.perf < 65) pitchLines.push(`Googles Performance-Score liegt bei ${ws.perf}/100`);
    if (!ws.isHttps) pitchLines.push('kein SSL-Zertifikat');
    if (ws.seo < 75) pitchLines.push(`SEO-Score bei ${ws.seo}/100`);
    if (tech.isBaukasten) pitchLines.push(`läuft auf ${tech.cms}`);
    if (pitchLines.length > 0) {
        html += `<div class="pitch-box anim-in"><h3>Pitch-Vorlage</h3><p>Guten Tag,\n\nich habe mir ${domain} angeschaut. Ein paar Dinge fallen auf: ${pitchLines.join(', ')}.\n\nDas sind Punkte die messbar Kunden und Google-Sichtbarkeit kosten. Ich baue moderne Websites — handcodiert, ab 990 Euro.\n\nDarf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?\n\nViele Grüße\nMuammer Kizilaslan\nkarriaro-webdesign.de</p><button class="btn-copy-large" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent='Kopiert!'})">Kopieren</button></div>`;
    }

    // Sequence
    const seqMails = [
        { day: 1, subject: `${domain} — Ihre Website kostet Sie Kunden`, body: `Performance ${ws.perf}/100, SEO ${ws.seo}/100.${rev?.yearlyLoss > 0 ? ' Geschätzter Verlust: ~'+rev.yearlyLoss.toLocaleString('de-DE')+'€/Jahr.' : ''} Darf ich Ihnen zeigen wie Ihre neue Seite aussehen könnte?` },
        { day: 4, subject: 'Vorher/Nachher — so sah Spedition Kolbe aus', body: 'Konkretes Beispiel: Vorher eine veraltete Standard-Seite, nachher ein moderner Auftritt. karriaro-webdesign.de' },
        { day: 8, subject: ws.a11y < 70 ? 'BFSG: Barrierefreiheit seit 2025 Pflicht' : 'Google bevorzugt schnelle Websites', body: ws.a11y < 70 ? `Barrierefreiheit ${ws.a11y}/100. Gesetz seit Juni 2025. Erste Abmahnungen laufen.` : 'Websites die Core Web Vitals bestehen bekommen 24% mehr Traffic.' },
        { day: 12, subject: `Kostenloser Entwurf für ${domain}`, body: 'Darf ich Ihnen den Entwurf in einem 15-Minuten-Call zeigen? Keine Verpflichtung.' },
        { day: 18, subject: 'Letzte Nachricht', body: `Ab 990€, fertig in 1-2 Wochen.${rev?.roi > 1 ? ' Amortisiert sich in '+Math.ceil(1990/(rev.yearlyLoss/12))+' Monaten.' : ''}` }
    ];
    html += `<div class="section-label" style="margin:16px 0 8px">5-Schritt Follow-up-Sequenz</div>`;
    for (const m of seqMails) {
        html += `<div class="pitch-box sequence-step anim-in"><h3>Tag ${m.day} — ${m.subject}</h3><p>${m.body}</p><button class="btn-copy" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent='✓'})">Kopieren</button></div>`;
    }

    stratEl.innerHTML = html;

    // Expert
    expertEl.innerHTML = `<div class="card"><pre style="font-size:11px;overflow-x:auto;max-height:400px">${JSON.stringify(r, null, 2)}</pre></div>`;

    // Actions
    let actionsExtra = '';
    if (data.abTest) {
        const labels = { emotional: 'Emotional (Schmerz → Lösung)', rational: 'Rational (Daten → ROI)', hybrid: 'Hybrid (Hook → Fakten)' };
        actionsExtra += `<div class="card anim-in"><div class="section-label">Pitch-Variante (Thompson Sampling, Konfidenz: ${data.abTest.confidence})</div><div style="font-size:14px;font-weight:600">${labels[data.abTest.variant] || data.abTest.variant}</div></div>`;
    }
    if (data.drift?.drifted) {
        actionsExtra += `<div class="card card-alert anim-in"><div style="font-size:13px;font-weight:600;color:var(--orange)">Score verändert: ${data.drift.previousScore} → ${r.leadScore}</div></div>`;
    }
    actionsEl.innerHTML = `${actionsExtra}<div class="actions-center"><button class="btn-primary" id="btn-save-crm" style="background:var(--text)">Im CRM speichern</button><a href="https://karriaro-webdesign.de/#kontakt" class="btn-cta-link">Kostenlos beraten lassen</a></div>`;

    document.getElementById('btn-save-crm')?.addEventListener('click', async function() {
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

// ══════════════════════════════════════
// 9. Signal Analyse + BFSG + Trigger + Tech + Composite
// ══════════════════════════════════════

export function renderSignals(el, data) {
    let html = '';

    // Composite Score (Fit × Intent × Timing)
    const cs = data.compositeScore;
    if (cs) {
        const csColor = cs.composite >= 65 ? 'var(--green)' : cs.composite >= 45 ? 'var(--orange)' : cs.composite >= 30 ? 'var(--muted)' : 'var(--red)';
        html += `<div class="card card-accent anim-in">
            <div class="section-label-accent">Composite Score — Fit × Intent × Timing</div>
            <div class="flex-between" style="margin-bottom:12px">
                <div><span class="metric-xl" style="color:${csColor}">${cs.composite}</span> <span class="metric-desc">${cs.label}</span></div>
            </div>
            <div class="science-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">
                <div style="text-align:center"><div class="metric-xl">${cs.fit}</div><div class="metric-desc">Fit</div></div>
                <div style="text-align:center"><div class="metric-xl">${cs.intent}</div><div class="metric-desc">Intent</div></div>
                <div style="text-align:center"><div class="metric-xl">${cs.timing}</div><div class="metric-desc">Timing</div></div>
            </div>
            <div class="metric-desc">Engpass: <strong>${cs.bottleneck.name}</strong> (${cs.bottleneck.value}) — ${cs.recommendation}</div>
        </div>`;
    }

    // Signal Stacking
    const ss = data.signalStack;
    if (ss && ss.clusterCount > 0) {
        html += `<div class="card anim-in">
            <div class="section-label">Signal Stacking — ${ss.signalCount} Signale, ${ss.clusterCount} Cluster</div>
            <div class="flex-between" style="margin-bottom:8px">
                <div><span class="metric-xl" style="color:${ss.stackMultiplier >= 2 ? 'var(--green)' : 'var(--orange)'}">${ss.stackMultiplier}×</span> <span class="metric-desc">Multiplikator</span></div>
            </div>
            ${ss.activeClusters.map(c => `<div class="feature-row"><span class="stat-label"><span class="feature-icon found">★</span>${c.name} (${c.matchCount}/${c.totalSignals} Signale)</span><span class="feature-detail">${c.multiplier}×</span></div>`).join('')}
        </div>`;
        if (ss.pitchArgs.length > 0) {
            html += `<div class="pitch-box anim-in"><h3>Signal-Stack Argument</h3><p>${ss.pitchArgs[0]}</p></div>`;
        }
    }

    // BFSG Compliance
    const bf = data.bfsgScore;
    if (bf) {
        const bfColor = bf.risk === 'niedrig' ? 'var(--green)' : bf.risk === 'mittel' ? 'var(--orange)' : 'var(--red)';
        html += `<div class="card anim-in" style="border-left:3px solid ${bfColor}">
            <div class="section-label">BFSG-Compliance (Barrierefreiheit seit 2025)</div>
            <div class="flex-between" style="margin-bottom:8px">
                <div><span class="metric-xl" style="color:${bfColor}">${bf.complianceScore}%</span> <span class="metric-desc">${bf.riskLabel}</span></div>
                <div><span class="badge ${bf.risk === 'niedrig' ? 'badge-green' : bf.risk === 'mittel' ? 'badge-orange' : 'badge-red'}">${bf.fine}</span></div>
            </div>
            <div class="metric-desc">${bf.passed} bestanden · ${bf.failed} nicht bestanden · ${bf.criticalFails.length} kritisch</div>
            ${bf.pitchArg ? `<div class="highlight-box-red" style="margin-top:8px;font-size:12px">${bf.pitchArg}</div>` : ''}
        </div>`;
    }

    // Trigger Events
    const te = data.triggerEvents;
    if (te && te.eventCount > 0) {
        html += `<div class="card anim-in">
            <div class="section-label">Trigger Events — ${te.label}</div>
            ${te.events.slice(0, 5).map(e => {
                const uColor = e.urgency === 'sofort' ? 'var(--red)' : e.urgency === 'hoch' ? 'var(--orange)' : 'var(--muted)';
                return `<div class="feature-row"><span class="stat-label"><span class="badge" style="background:${uColor}20;color:${uColor};font-size:10px;padding:2px 6px">${e.urgency}</span> ${e.label}</span><span class="feature-detail">${e.timing}</span></div>`;
            }).join('')}
        </div>`;
    }

    // Tech Depth
    const td = data.techDepth;
    if (td && td.findings.length > 0) {
        html += `<div class="card anim-in">
            <div class="section-label">Technologie-Analyse — ${td.techAge}</div>
            ${td.findings.filter(f => f.severity !== 'info').map(f => `<div class="feature-row"><span class="stat-label"><span class="feature-icon ${f.severity === 'hoch' ? 'missing' : 'warn'}">${f.severity === 'hoch' ? '✗' : '⚠'}</span>${f.label}</span><span class="feature-detail">${f.risk || ''}</span></div>`).join('')}
            ${td.securityRisk >= 3 ? `<div class="metric-desc" style="color:var(--red);margin-top:8px">${td.findings.filter(f => f.severity === 'hoch').length} Sicherheitsrisiken erkannt</div>` : ''}
        </div>`;
    }

    // PX Index
    const px = data.pxIndex;
    if (px) {
        const pxColor = px.pxIndex >= 75 ? 'var(--green)' : px.pxIndex >= 50 ? 'var(--orange)' : 'var(--red)';
        html += `<div class="card anim-in">
            <div class="section-label">Performance Experience Index</div>
            <div class="flex-between" style="margin-bottom:8px">
                <div><span class="metric-xl" style="color:${pxColor}">${px.pxIndex}</span> <span class="metric-desc">${px.label}</span></div>
                ${px.psDiff !== 0 ? `<div class="metric-desc">${px.psDiff > 0 ? '+' : ''}${px.psDiff} vs. PageSpeed</div>` : ''}
            </div>
            <div class="science-grid" style="grid-template-columns:repeat(4,1fr)">
                <div style="text-align:center"><div class="metric-desc">Speed</div><div style="font-weight:700">${px.dimensions.speed.score}</div></div>
                <div style="text-align:center"><div class="metric-desc">Interaktiv</div><div style="font-weight:700">${px.dimensions.interactivity.score}</div></div>
                <div style="text-align:center"><div class="metric-desc">Visual</div><div style="font-weight:700">${px.dimensions.visual.score}</div></div>
                <div style="text-align:center"><div class="metric-desc">Content</div><div style="font-weight:700">${px.dimensions.content.score}</div></div>
            </div>
        </div>`;
    }

    // Email Deliverability
    const em = data.emailCheck;
    if (em && !em.error) {
        const emColor = em.score >= 90 ? 'var(--green)' : em.score >= 50 ? 'var(--orange)' : 'var(--red)';
        html += `<div class="card anim-in">
            <div class="section-label">E-Mail Deliverability</div>
            <div class="flex-between" style="margin-bottom:8px">
                <div><span class="metric-xl" style="color:${emColor}">${em.score}%</span> <span class="metric-desc">${em.label}</span></div>
            </div>
            <div class="feature-row"><span class="stat-label"><span class="feature-icon ${em.spf ? 'found' : 'missing'}">${em.spf ? '✓' : '✗'}</span>SPF</span><span class="feature-detail">${em.spf ? 'Konfiguriert' : 'Fehlt'}</span></div>
            <div class="feature-row"><span class="stat-label"><span class="feature-icon ${em.dkim ? 'found' : 'missing'}">${em.dkim ? '✓' : '✗'}</span>DKIM</span><span class="feature-detail">${em.dkim ? 'Konfiguriert' : 'Fehlt'}</span></div>
            <div class="feature-row"><span class="stat-label"><span class="feature-icon ${em.dmarc ? 'found' : 'missing'}">${em.dmarc ? '✓' : '✗'}</span>DMARC</span><span class="feature-detail">${em.dmarc ? 'Konfiguriert' : 'Fehlt'}</span></div>
            ${em.pitchArg ? `<div class="metric-desc" style="margin-top:8px;color:var(--red)">${em.pitchArg}</div>` : ''}
        </div>`;
    }

    // Mockup Suggestion
    const mk = data.mockupSuggestion;
    if (mk && !mk.error) {
        html += `<div class="pitch-box anim-in">
            <h3>KI-Redesign-Vorschlag</h3>
            <p><strong>${mk.headline || ''}</strong></p>
            <p>${mk.designDirection || ''}</p>
            ${mk.colorPalette ? `<div style="display:flex;gap:4px;margin:8px 0">${mk.colorPalette.map(c => `<div style="width:28px;height:28px;border-radius:6px;background:${c}"></div>`).join('')}</div>` : ''}
            ${mk.keyFeatures ? `<div style="margin:8px 0">${mk.keyFeatures.map(f => `<span class="badge badge-green" style="margin:2px">${f}</span>`).join('')}</div>` : ''}
            ${mk.oneLinePitch ? `<div style="margin-top:8px;font-style:italic;opacity:0.8">"${mk.oneLinePitch}"</div>` : ''}
        </div>`;
    }

    // Feedback Insight (persönliche Kalibrierung)
    const fi = data.feedbackInsight;
    if (fi) {
        html += `<div class="card anim-in">
            <div class="section-label">Persönliche Kalibrierung</div>
            <div class="metric-desc">${fi.message}</div>
        </div>`;
    }

    el.innerHTML = html || '<div class="metric-desc" style="padding:16px;text-align:center">Keine zusätzlichen Signale erkannt</div>';
}
