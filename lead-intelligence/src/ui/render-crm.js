/**
 * CRM View Renderer — Pipeline, Suche, Export, Responsive
 */
import { loadLeads, updateLead, deleteLead, deleteAllLeads, exportCSV } from '../crm/leads.js';
import { currentUser } from '../crm/firebase.js';
import { recordOutcome, getCalibration } from '../learning/feedback-loop.js';
import { calculateStats } from '../crm/stats.js';
import { getStaleLeads } from '../crm/rescan.js';
import { getFeedbackStats } from '../learning/score-feedback.js';
import { renderStatisticsPanel } from './render-statistics.js';
import { subscribeToInboundLeads, HEAT_CONSTANTS } from '../learning/inbound-signals.js';
import { requestNotificationPermissionOnGesture } from '../orchestration/scanner.js';
import { openStudio } from './render-outreach.js';

// 'qualifiziert' (Verifikations-Plan) und 'entwurf'/'outreach_bereit' (Outreach-Studio)
// liegen zwischen 'neu' und 'kontaktiert'. Reihenfolge = Lead-Lebenszyklus.
const STATUSES = ['alle', 'neu', 'qualifiziert', 'entwurf', 'outreach_bereit', 'kontaktiert', 'interessiert', 'angebot', 'kunde', 'verloren'];
const STATUS_LABELS = { neu: 'Neu', qualifiziert: 'Qualifiziert', entwurf: 'Entwurf', outreach_bereit: 'Versandbereit', kontaktiert: 'Kontaktiert', interessiert: 'Interessiert', angebot: 'Angebot', kunde: 'Kunde', verloren: 'Verloren' };
const STATUS_COLORS = { neu: 'var(--muted)', qualifiziert: 'var(--accent)', entwurf: 'var(--accent)', outreach_bereit: 'var(--orange)', kontaktiert: 'var(--orange)', interessiert: 'var(--accent)', angebot: 'var(--accent)', kunde: 'var(--green)', verloren: 'var(--red)' };

// AbortController für Event-Listener Cleanup
let crmController = null;

// Inbound-Heat-Listener — global, lebt über CRM-Re-Renders hinweg.
// Wird bei Sign-Out via cleanupInboundListener() abgebaut, sonst läuft
// der Firestore-Listener mit alten User-Credentials weiter.
let inboundUnsubscribe = null;
let lastNotifiedHotSlugs = new Set();
let cachedHotLeads = [];

export function cleanupInboundListener() {
    if (typeof inboundUnsubscribe === 'function') {
        try { inboundUnsubscribe(); } catch {}
    }
    inboundUnsubscribe = null;
    lastNotifiedHotSlugs = new Set();
    cachedHotLeads = [];
}

export async function renderCRM(filter = 'alle', searchQuery = '') {
    const el = document.getElementById('crm-view');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('batch-results').classList.add('hidden');

    // Cleanup vorherige Event-Listener
    if (crmController) crmController.abort();
    crmController = new AbortController();
    const signal = crmController.signal;

    if (!currentUser()) {
        el.innerHTML = `<div class="brand-empty">
            <div class="brand-empty-eyebrow">Pipeline</div>
            <h3>Ihre Leads, an einem Ort</h3>
            <p>Ihre gespeicherten Leads, die Verkaufs-Pipeline und das Outreach-Studio erscheinen hier, sobald Sie angemeldet sind.</p>
            <button class="btn-primary" data-action="auth">Anmelden</button>
        </div>`;
        el.classList.remove('hidden');
        el.querySelector('[data-action="auth"]')?.addEventListener('click', () => {
            document.getElementById('auth-btn')?.click();
        }, { signal });
        return;
    }

    el.innerHTML = `<div class="crm-loading"><div class="spinner"></div></div>`;
    el.classList.remove('hidden');

    // CRM-Tab-Open ist eine User-Geste → Notification-Permission anfragen
    requestNotificationPermissionOnGesture();

    // Inbound-Listener starten (läuft im Hintergrund, re-rendert CRM bei Änderung)
    if (!inboundUnsubscribe && window.__firebase) {
        inboundUnsubscribe = subscribeToInboundLeads(window.__firebase, (hotLeads) => {
            // Diff: neue very-hot-Slugs gegen bisherige → Notification
            const currentVeryHot = new Set(hotLeads.filter(l => l.tier === 'very_hot').map(l => l.slug));
            for (const slug of currentVeryHot) {
                if (!lastNotifiedHotSlugs.has(slug)) {
                    notifyHotLead(hotLeads.find(l => l.slug === slug));
                    lastNotifiedHotSlugs.add(slug);
                }
            }
            cachedHotLeads = hotLeads;
            // Soft-Re-Render der Hot-Sektion ohne den ganzen CRM neu zu bauen
            const hotSection = document.getElementById('crm-hot-leads');
            if (hotSection) hotSection.innerHTML = renderHotLeadsHtml(hotLeads);
        });
    }

    const leads = await loadLeads();

    // Eingeloggt, aber noch keine Leads → freundlicher Start-Hinweis statt leerer Tabelle.
    if (leads.length === 0 && !searchQuery) {
        el.innerHTML = `<div class="brand-empty">
            <div class="brand-empty-eyebrow">Pipeline</div>
            <h3>Noch keine Leads gespeichert</h3>
            <p>Starten Sie unter „Finden" mit einer Website, einer Stadt oder einer ganzen Region — gespeicherte Leads erscheinen dann hier.</p>
            <button class="btn-primary" data-action="goto-finden">Zu „Finden"</button>
        </div>`;
        el.querySelector('[data-action="goto-finden"]')?.addEventListener('click', () => {
            document.querySelector('.nav-btn[data-view="finden"]')?.click();
        }, { signal });
        return;
    }

    // Suche
    let searched = leads;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        searched = leads.filter(l =>
            (l.name || '').toLowerCase().includes(q) ||
            (l.domain || '').toLowerCase().includes(q) ||
            (l.type || '').toLowerCase().includes(q) ||
            (l.notes || '').toLowerCase().includes(q)
        );
    }

    const filtered = filter === 'alle' ? searched : searched.filter(l => l.status === filter);

    // ── Stats ──
    const pipelineLeads = leads.filter(l => ['kontaktiert', 'interessiert', 'angebot'].includes(l.status));
    const stats = {
        total: leads.length,
        neu: leads.filter(l => l.status === 'neu').length,
        pipeline: pipelineLeads.length,
        pipelineValue: pipelineLeads.reduce((s, l) => s + (l.expectedValue || 0), 0),
        kunde: leads.filter(l => l.status === 'kunde').length,
        conversionRate: leads.length > 0 ? Math.round(leads.filter(l => l.status === 'kunde').length / leads.length * 100) : 0
    };

    let html = '';

    // ── Hot-Leads-Sektion (Inbound mit Heat ≥ 60) ──
    html += `<div id="crm-hot-leads">${renderHotLeadsHtml(cachedHotLeads)}</div>`;

    // ── Header mit Aktionen ──
    html += `<div class="crm-header">
        <h2 class="crm-title">Lead-CRM</h2>
        <div class="crm-actions-top">
            <button class="crm-btn-export crm-btn-studio" data-action="studio">✉ Outreach-Studio</button>
            <button class="crm-btn-export" data-action="toggleStats">Wissenschaft</button>
            <button class="crm-btn-export" data-action="export">CSV Export</button>
            <button class="crm-btn-export crm-btn-danger" data-action="deleteAll">Alle löschen</button>
        </div>
    </div>`;

    // ── Statistik-Panel (toggle, default geschlossen) ──
    const showStats = el.dataset.showStats === 'true';
    if (showStats) {
        html += renderStatisticsPanel();
    }

    // ── Pipeline-Visualisierung (Mini-Kanban) ──
    // Jede Stage zeigt Count + Wert + den Top-Lead (höchster Score). User sieht
    // sofort den nächsten Move pro Stage statt nur ein Aggregat. Klick auf Stage
    // filtert die Liste, Klick auf Top-Lead-Karte scrollt zur Lead-Card.
    const pipeStages = ['neu', 'kontaktiert', 'interessiert', 'angebot', 'kunde'];
    html += `<div class="crm-pipeline">`;
    for (const stage of pipeStages) {
        const stageLeads = leads.filter(l => l.status === stage);
        const count = stageLeads.length;
        const value = stageLeads.reduce((s, l) => s + (l.expectedValue || 0), 0);
        const isActive = filter === stage;
        const topLead = stageLeads.length > 0
            ? [...stageLeads].sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))[0]
            : null;
        html += `<div class="crm-pipe-stage${isActive ? ' active' : ''}" data-filter="${stage}">
            <div class="crm-pipe-count" style="color:${STATUS_COLORS[stage]}">${count}</div>
            <div class="crm-pipe-label">${STATUS_LABELS[stage]}</div>
            ${value > 0 ? `<div class="crm-pipe-value">${Math.round(value)}€</div>` : ''}
            ${topLead ? `<div class="crm-pipe-top" data-scroll-lead="${topLead.id}" title="Top-Lead: ${escapeAttr(topLead.name || topLead.domain)} (Score ${topLead.leadScore || 0})">
                <span class="crm-pipe-top-score" style="color:${STATUS_COLORS[stage]}">${topLead.leadScore || 0}</span>
                <span class="crm-pipe-top-name">${escapeAttr((topLead.name || topLead.domain).slice(0, 18))}</span>
            </div>` : ''}
        </div>`;
    }
    html += `</div>`;

    // ── Stats Karten ──
    html += `<div class="crm-stats">
        <div class="card crm-stat anim-in"><div class="metric-xl">${stats.total}</div><div class="section-label">Gesamt</div></div>
        <div class="card crm-stat anim-in"><div class="metric-xl" style="color:var(--accent)">${stats.pipeline}</div><div class="section-label">In Pipeline</div></div>
        <div class="card crm-stat anim-in"><div class="metric-xl" style="color:var(--accent)">${Math.round(stats.pipelineValue)}€</div><div class="section-label">Pipeline-Wert</div></div>
        <div class="card crm-stat anim-in"><div class="metric-xl" style="color:var(--green)">${stats.kunde}</div><div class="section-label">Kunden</div></div>
        <div class="card crm-stat anim-in"><div class="metric-xl" style="color:${stats.conversionRate >= 10 ? 'var(--green)' : 'var(--muted)'}">${stats.conversionRate}%</div><div class="section-label">Conversion</div></div>
    </div>`;

    // ── Suche + Filter ──
    html += `<div class="crm-toolbar">
        <input type="text" class="crm-search" placeholder="Lead suchen..." value="${searchQuery}" data-action="search">
        <div class="crm-filters">`;
    for (const s of STATUSES) {
        const count = s === 'alle' ? searched.length : searched.filter(l => l.status === s).length;
        html += `<button class="crm-filter-btn${s === filter ? ' active' : ''}" data-filter="${s}">${s === 'alle' ? 'Alle' : STATUS_LABELS[s]} (${count})</button>`;
    }
    html += `</div></div>`;

    // ── Lead-Liste ──
    if (filtered.length === 0) {
        html += `<div class="crm-empty">${searchQuery ? `Keine Leads für "${searchQuery}"` : `Keine Leads in "${filter === 'alle' ? 'Alle' : STATUS_LABELS[filter] || filter}"`}</div>`;
    } else {
        html += `<div class="crm-list">`;
        for (const l of filtered) {
            const scoreColor = (l.leadScore || 0) >= 55 ? 'var(--green)' : (l.leadScore || 0) >= 30 ? 'var(--orange)' : 'var(--red)';
            const scoreBg = (l.leadScore || 0) >= 55 ? 'rgba(48,209,88,0.1)' : (l.leadScore || 0) >= 30 ? 'rgba(255,159,10,0.1)' : 'rgba(255,69,58,0.1)';
            const savedDate = l.savedAt ? new Date(l.savedAt).toLocaleDateString('de-DE') : '';
            const updatedDate = l.updatedAt ? timeAgo(l.updatedAt) : '';

            html += `<div class="card crm-lead-card anim-in">
                <div class="crm-lead-top">
                    <input type="checkbox" class="crm-lead-select" data-lead-id="${l.id}" title="Für Outreach-Studio auswählen">
                    <div class="crm-lead-score" style="background:${scoreBg};color:${scoreColor}">${l.leadScore || 0}</div>
                    <div class="crm-lead-info">
                        <div class="crm-lead-name">${l.name || l.domain}</div>
                        <div class="crm-lead-meta">
                            <a href="${l.url || 'https://' + l.domain}" target="_blank" rel="noopener">${l.domain}</a>
                            ${l.type ? ` · ${l.type}` : ''}
                            ${l.perf ? ` · Perf ${l.perf}` : ''}
                            ${l.seo ? ` · SEO ${l.seo}` : ''}
                            · <a href="#" class="crm-reanalyze" data-url="${l.url || 'https://' + l.domain}">neu analysieren</a>
                        </div>
                        <div class="crm-lead-dates">
                            ${savedDate ? `Gespeichert: ${savedDate}` : ''}
                            ${updatedDate ? ` · ${updatedDate}` : ''}
                        </div>
                    </div>
                    <div class="crm-lead-actions">
                        <select class="crm-status-select" data-lead-id="${l.id}" data-action="status" data-domain="${l.domain}" data-score="${l.leadScore || 0}" data-branch="${l.type || ''}" data-prev-status="${l.status || 'neu'}" style="color:${STATUS_COLORS[l.status] || 'var(--muted)'}">
                            ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}</option>`).join('')}
                        </select>
                        <button class="crm-btn-delete" data-lead-id="${l.id}" data-action="delete" title="Löschen">✕</button>
                    </div>
                </div>
                <div class="crm-lead-bottom">
                    <input type="text" class="crm-notes-input" value="${(l.notes || '').replace(/"/g, '&quot;')}" placeholder="Notiz hinzufügen..." data-lead-id="${l.id}" data-action="notes">
                    ${l.expectedValue ? `<span class="crm-lead-ev">EV: ${l.expectedValue}€</span>` : ''}
                    ${l.status === 'angebot' || l.status === 'interessiert' ? `<button class="crm-btn-outcome crm-btn-won" data-lead-id="${l.id}" data-domain="${l.domain}" data-score="${l.leadScore}" data-branch="${l.type || ''}" data-outcome="kunde" title="Kunde geworden">✓ Gewonnen</button><button class="crm-btn-outcome crm-btn-lost" data-lead-id="${l.id}" data-domain="${l.domain}" data-score="${l.leadScore}" data-branch="${l.type || ''}" data-outcome="verloren" title="Lead verloren">✗ Verloren</button>` : ''}
                </div>
            </div>`;
        }
        html += `</div>`;
    }

    // ── Zusammenfassung ──
    if (filtered.length > 0) {
        const avgScore = Math.round(filtered.reduce((s, l) => s + (l.leadScore || 0), 0) / filtered.length);
        const totalEV = Math.round(filtered.reduce((s, l) => s + (l.expectedValue || 0), 0));
        html += `<div class="crm-summary">
            ${filtered.length} Leads · Ø Score: ${avgScore} · Gesamt-EV: ${totalEV}€
        </div>`;
    }

    // ── Persönliche Kalibrierung ──
    const cal = getCalibration();
    if (cal.available) {
        html += `<div class="card anim-in" style="margin-top:16px">
            <div class="section-label">Deine persönliche Conversion-Rate</div>
            <div class="flex-between" style="margin-bottom:8px">
                <div><span class="metric-xl" style="color:${cal.overall.rate >= 10 ? 'var(--green)' : 'var(--muted)'}">${cal.overall.rate}%</span> <span class="metric-desc">${cal.overall.converted} von ${cal.overall.total} Leads konvertiert</span></div>
            </div>
            <div class="metric-desc">${cal.insight}</div>
            ${Object.entries(cal.buckets).map(([bucket, stats]) =>
                `<div class="stat-row"><span class="stat-label">Score ${bucket}</span><span class="stat-value">${stats.conversionRate}% (${stats.converted}/${stats.total})</span></div>`
            ).join('')}
        </div>`;
    }

    // ── Stats Dashboard (#4) ──
    const perfStats = calculateStats(leads);
    if (perfStats.available) {
        html += `<div class="card anim-in" style="margin-top:16px">
            <div class="section-label-accent">Dein Performance-Dashboard</div>
            <div class="science-grid" style="margin-bottom:12px">
                <div style="text-align:center"><div class="metric-xl">${perfStats.overview.thisMonth}</div><div class="metric-desc">Leads diesen Monat</div></div>
                <div style="text-align:center"><div class="metric-xl" style="color:${perfStats.conversion.cr >= 10 ? 'var(--green)' : 'var(--muted)'}">${perfStats.conversion.cr}%</div><div class="metric-desc">Conversion-Rate</div></div>
                <div style="text-align:center"><div class="metric-xl" style="color:var(--accent)">${perfStats.conversion.pipelineValue}€</div><div class="metric-desc">Pipeline-Wert</div></div>
                <div style="text-align:center"><div class="metric-xl">${perfStats.overview.trend === 'steigend' ? '↑' : perfStats.overview.trend === 'fallend' ? '↓' : '→'}</div><div class="metric-desc">Trend</div></div>
            </div>
            ${perfStats.branches.length > 0 ? `<div class="section-label" style="margin-top:12px">Beste Branchen</div>${perfStats.branches.slice(0, 3).map(([name, s]) => `<div class="stat-row"><span class="stat-label">${name}</span><span class="stat-value">${s.cr}% CR (${s.converted}/${s.total})</span></div>`).join('')}` : ''}
            ${perfStats.insights.length > 0 ? `<div style="margin-top:12px">${perfStats.insights.map(i => `<div class="metric-desc">💡 ${i}</div>`).join('')}</div>` : ''}
        </div>`;
    }

    // ── Scoring-Kalibrierung (Feedback-Lernstatus) ──
    const fbStats = getFeedbackStats();
    if (fbStats.total > 0) {
        const corrKeys = Object.keys(fbStats.corrections);
        html += `<div class="card anim-in" style="margin-top:12px">
            <div class="section-label">Scoring-Kalibrierung (${fbStats.total} Bewertungen)</div>
            <div class="stat-row"><span class="stat-label">Genauigkeit</span><span class="stat-value">${fbStats.accuracy}% korrekt</span></div>
            <div class="stat-row"><span class="stat-label">Zu hoch / Passt / Zu niedrig</span><span class="stat-value">${fbStats.tooHigh} / ${fbStats.correct} / ${fbStats.tooLow}</span></div>
            <div class="stat-row"><span class="stat-label">Kalibriert</span><span class="stat-value ${fbStats.isCalibrated ? 'good' : ''}">${fbStats.isCalibrated ? 'Ja — Korrekturen aktiv' : `Nein (${10 - fbStats.total} Bewertungen fehlen)`}</span></div>
            ${corrKeys.length > 0 ? `<div class="section-label" style="margin-top:8px">Gelernte Korrekturen</div>${corrKeys.map(k => `<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-value">${fbStats.corrections[k].multiplier}× (n=${fbStats.corrections[k].sampleSize})</span></div>`).join('')}` : ''}
            ${fbStats.topSkipReason ? `<div class="metric-desc" style="margin-top:8px">Häufigster Skip-Grund: <strong>${fbStats.topSkipReason[0]}</strong> (${fbStats.topSkipReason[1]}×)</div>` : ''}
            ${fbStats.freeTextReasons.length > 0 ? `<div class="section-label" style="margin-top:8px">Letzte Kommentare</div>${fbStats.freeTextReasons.slice(-3).map(r => `<div class="metric-desc">${r.domain}: "${r.reason}" (Score ${r.score})</div>`).join('')}` : ''}
        </div>`;
    }

    // ── Re-Scan Alerts (#3) ──
    const stale = getStaleLeads();
    if (stale.length > 0) {
        html += `<div class="card card-alert anim-in" style="margin-top:12px">
            <div class="section-label">Re-Scan fällig (${stale.length} Leads)</div>
            ${stale.slice(0, 5).map(s => `<div class="stat-row"><span class="stat-label">${s.domain}</span><span class="stat-value">Seit ${s.daysSince} Tagen · Score ${s.lastScore}</span></div>`).join('')}
            <div class="metric-desc" style="margin-top:8px">Klicke auf "neu analysieren" bei einem Lead um den Score zu aktualisieren.</div>
        </div>`;
    }

    el.innerHTML = html;

    // ── Events (mit AbortController für Cleanup) ──
    // Status-Änderung — Reihenfolge: updateLead AWAIT first (Race-Fix), dann recordOutcome
    // NUR wenn Firestore-Sync ok. prev-status verhindert Doppel-Logs. Score 0 = Konkurrenz/
    // Enterprise (_skipPitch in single-check.js:166-171) → kein echtes Outcome für Calibration.
    el.addEventListener('change', async (e) => {
        const id = e.target.dataset.leadId;
        if (!id) return;
        if (e.target.dataset.action === 'status') {
            const newStatus = e.target.value;
            const prevStatus = e.target.dataset.prevStatus;
            const isOutcome = newStatus === 'kunde' || newStatus === 'verloren';
            const isNewOutcome = isOutcome && newStatus !== prevStatus;
            const { domain, score, branch } = e.target.dataset;
            const numScore = parseInt(score) || 0;

            const result = await updateLead(id, { status: newStatus });

            // recordOutcome NUR wenn Sync ok + Score > 0 (Score 0 = Konkurrenz/Enterprise)
            if (isNewOutcome && result.firestoreSynced && numScore > 0) {
                recordOutcome(domain, numScore, newStatus, branch || null);
            }

            if (!result.firestoreSynced) {
                showToast('Sync-Fehler — Änderung nur lokal gespeichert');
            } else {
                showToast(
                    isNewOutcome && newStatus === 'kunde' ? 'Glückwunsch! Als Kunde markiert.' :
                    isNewOutcome && newStatus === 'verloren' ? 'Als verloren markiert.' :
                    `Status → ${STATUS_LABELS[newStatus] || newStatus}`
                );
            }
            // Stats + Pipeline refreshen
            renderCRM(filter, searchQuery);
        }
    }, { signal });

    // Notes (blur + Enter)
    el.addEventListener('blur', async (e) => {
        const id = e.target.dataset.leadId;
        if (id && e.target.dataset.action === 'notes') {
            const result = await updateLead(id, { notes: e.target.value });
            if (!result.firestoreSynced) showToast('Notiz nur lokal — Sync-Fehler');
        }
    }, { capture: true, signal });
    el.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && e.target.dataset.action === 'notes') {
            e.target.blur();
            showToast('Notiz gespeichert');
        }
    }, { signal });

    // Delete
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="delete"]');
        if (!btn) return;
        const id = btn.dataset.leadId;
        if (id && confirm('Lead wirklich löschen?')) {
            const result = await deleteLead(id);
            showToast(result.firestoreSynced ? 'Lead gelöscht' : 'Lokal gelöscht — Sync-Fehler');
            renderCRM(filter, searchQuery);
        }
    }, { signal });

    // Filter
    el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (btn) renderCRM(btn.dataset.filter, searchQuery);
    }, { signal });

    // Suche (debounced)
    let searchTimer;
    const searchInput = el.querySelector('[data-action="search"]');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => renderCRM(filter, e.target.value), 300);
        }, { signal });
        // Focus erhalten nach re-render
        if (searchQuery) {
            searchInput.focus();
            searchInput.setSelectionRange(searchQuery.length, searchQuery.length);
        }
    }

    // Re-Analyse Link
    el.addEventListener('click', (e) => {
        const link = e.target.closest('.crm-reanalyze');
        if (!link) return;
        e.preventDefault();
        const url = link.dataset.url;
        // Switch to single-check, fill URL, hide CRM
        document.getElementById('crm-view').classList.add('hidden');
        const urlInput = document.getElementById('url-input');
        if (urlInput) urlInput.value = url;
        // Activate single tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="single"]')?.classList.add('active');
        document.getElementById('input-single')?.classList.remove('hidden');
        document.getElementById('input-batch')?.classList.add('hidden');
        document.getElementById('input-scanner')?.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, { signal });

    // Outcome-Tracking (Feedback Loop) — gleiche Race-Logik wie Status-Dropdown:
    // updateLead AWAIT first, recordOutcome nur bei Sync-OK + Score > 0.
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-outcome]');
        if (!btn) return;
        const { leadId, domain, score, outcome, branch } = btn.dataset;
        const numScore = parseInt(score) || 0;
        const result = await updateLead(leadId, { status: outcome });
        if (result.firestoreSynced && numScore > 0) {
            recordOutcome(domain, numScore, outcome, branch || null);
        }
        if (!result.firestoreSynced) {
            showToast('Sync-Fehler — Änderung nur lokal gespeichert');
        } else {
            showToast(outcome === 'kunde' ? 'Glückwunsch! Als Kunde markiert.' : 'Als verloren markiert.');
        }
        renderCRM(filter, searchQuery);
    }, { signal });

    // CSV Export + Alle löschen + Wissenschafts-Toggle
    el.addEventListener('click', async (e) => {
        if (e.target.dataset.action === 'export') {
            exportCSV(filtered.length > 0 ? filtered : leads);
            showToast(`${filtered.length || leads.length} Leads exportiert`);
        }
        if (e.target.dataset.action === 'deleteAll') {
            if (!confirm(`Wirklich ALLE ${leads.length} Leads unwiderruflich löschen?`)) return;
            if (!confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) return;
            showToast(`Lösche ${leads.length} Leads...`);
            const result = await deleteAllLeads((done, total) => {
                if (done % 50 === 0 || done === total) showToast(`Gelöscht: ${done} / ${total}`);
            });
            if (!result.firestoreSynced) {
                showToast('Lokal geleert — Cloud-Sync-Fehler');
            } else {
                showToast(`Alle ${result.deleted ?? leads.length} Leads gelöscht`);
            }
            renderCRM();
        }
        if (e.target.dataset.action === 'toggleStats') {
            el.dataset.showStats = el.dataset.showStats === 'true' ? 'false' : 'true';
            renderCRM(filter, searchQuery);
        }
    }, { signal });

    // Outreach-Studio: angehakte Leads (sonst die gefilterte Liste) übernehmen.
    el.addEventListener('click', (e) => {
        if (e.target.dataset.action !== 'studio') return;
        const checked = new Set([...el.querySelectorAll('.crm-lead-select:checked')].map(c => c.dataset.leadId));
        let selection = checked.size > 0 ? filtered.filter(l => checked.has(l.id)) : filtered;
        if (selection.length === 0) { showToast('Keine Leads zum Anschreiben.'); return; }
        if (selection.length > 50 && !confirm(`${selection.length} Leads ins Outreach-Studio übernehmen? Für Top-Leads kann das KI-Kosten verursachen.`)) return;
        openStudio(selection);
    }, { signal });
}

// ── Hot-Leads-Rendering ──
function renderHotLeadsHtml(hotLeads) {
    if (!hotLeads || hotLeads.length === 0) return '';
    const cards = hotLeads.slice(0, 6).map(l => {
        const pulseClass = l.tier === 'very_hot' ? ' hot-pulse' : '';
        const badge = l.tier === 'very_hot' ? '🔥 Heißer Lead' : '🔥 Warm';
        const lastSeen = l.lastVisitAtMs ? timeAgo(l.lastVisitAtMs) : 'noch keine Page-Visits';
        const visits = l.visitCount > 0 ? ` · ${l.visitCount} Visits` : '';
        const ctas = l.ctaClicks > 0 ? ` · ${l.ctaClicks} CTA-Klicks` : '';
        const auditUrl = `https://karriaro-webdesign.de/audit?slug=${encodeURIComponent(l.slug)}`;
        const mailto = l.email
            ? `mailto:${l.email}?subject=${encodeURIComponent('Ihr Audit für ' + l.domain)}&body=${encodeURIComponent('Hallo ' + (l.name || '') + ',\n\nvielen Dank für die Audit-Anfrage. Schön, dass Sie sich die Ergebnisse angesehen haben — ich würde gerne ein 30-Minuten-Gespräch dazu mit Ihnen führen.\n\n')}`
            : '#';
        return `<div class="hot-lead-card${pulseClass}">
            <div class="hot-lead-top">
                <span class="hot-lead-badge">${badge}</span>
                <span class="hot-lead-heat">${l.heat}</span>
            </div>
            <div class="hot-lead-domain">${l.domain || '—'}</div>
            <div class="hot-lead-meta">${l.name || '—'}${l.email ? ' · ' + l.email : ''}</div>
            <div class="hot-lead-meta">${l.techHeadline || ''}${visits}${ctas}</div>
            <div class="hot-lead-meta">Letzter Visit: ${lastSeen}</div>
            <div class="hot-lead-actions">
                <a href="${mailto}" class="hot-lead-btn hot-lead-btn-primary">E-Mail schreiben</a>
                <a href="${auditUrl}" target="_blank" rel="noopener" class="hot-lead-btn">Audit-Seite öffnen</a>
            </div>
        </div>`;
    }).join('');
    return `<div class="hot-leads-section">
        <div class="hot-leads-header">
            <span class="hot-leads-title">🔥 Heiße Leads</span>
            <span class="hot-leads-sub">Inbound-Form-Anfragen mit hoher Konvertierungs-Wahrscheinlichkeit (Heat ≥ ${HEAT_CONSTANTS.HOT_THRESHOLD})</span>
        </div>
        <div class="hot-leads-grid">${cards}</div>
    </div>`;
}

function notifyHotLead(lead) {
    if (!lead) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
        const n = new Notification('🔥 Heißer Lead — sofort kontaktieren', {
            body: `${lead.domain} hat die Audit-Seite gerade geöffnet (Heat ${lead.heat})`,
            tag: `hot-lead-${lead.slug}`
        });
        n.onclick = () => {
            window.focus();
            n.close();
        };
    } catch {}
}

// ── Helpers ──
function escapeAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `vor ${days}T`;
    return `vor ${Math.floor(days / 7)}W`;
}

function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
