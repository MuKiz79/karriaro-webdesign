/**
 * CRM View Renderer — Pipeline, Suche, Export, Responsive
 *
 * Seit 2026-09-10 zusätzlich:
 *   • Kontaktgrundlage je Lead (Double-Opt-In / Anfrage / Bestandskunde / keine)
 *   • Panel „Einwilligungen" (consents/{id}, nur lesen + Strecke stoppen)
 *   • Sperrliste: „Nicht mehr kontaktieren", Verlust-Grund, Werbewiderspruch
 *   • Partner-Pipeline: Quelle, Partnercode, Provision
 * Die HTML-Bausteine sind als reine Funktionen exportiert (tests/crm/render-crm.test.js).
 */
import {
    loadLeads, updateLead, deleteLead, deleteAllLeads, exportCSV,
    KONTAKT_GRUNDLAGE_ARTEN, KONTAKT_GRUNDLAGE_LABELS, KONTAKT_GRUNDLAGE_ERKLAERUNG,
    QUELLEN, QUELLEN_LABELS, PROVISION_STATUS, PROVISION_STATUS_LABELS, VERLUST_GRUENDE,
    sperrgrundFuerVerlust, normalisiereKontaktGrundlage, normalisiereProvision, leiteQuelleAb,
    hatWerbewiderspruch, beurteileKontaktGrundlage, kontaktGrundlageAusEinwilligung,
    baueDetailUpdates, provisionsBetrag, datumDe, datumFuerEingabe
} from '../crm/leads.js';
import {
    ladeEinwilligungenMitStatus, stoppeSequenz, einwilligungsStatus,
    EINWILLIGUNGS_STATUS_LABELS, EINWILLIGUNGS_QUELLEN, MAX_SEQUENZ_SCHRITTE
} from '../crm/consents.js';
import { loadSuppression, addSuppression, isSuppressed, normalizeDomain } from '../crm/suppression.js';
import { pruefeMailErlaubnis } from '../outreach/kontakt-grundlage.js';
import { complianceBlock } from '../strategy/compliance.js';
import { baueMailtoHref } from '../outreach/mime.js';
import { config } from '../config.js';
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
const STATUSES = ['alle', 'neu', 'qualifiziert', 'entwurf', 'outreach_bereit', 'kontaktiert', 'geantwortet', 'interessiert', 'angebot', 'kunde', 'verloren'];
const STATUS_LABELS = { neu: 'Neu', qualifiziert: 'Qualifiziert', entwurf: 'Entwurf', outreach_bereit: 'Versandbereit', kontaktiert: 'Kontaktiert', geantwortet: 'Geantwortet', interessiert: 'Interessiert', angebot: 'Angebot', kunde: 'Kunde', verloren: 'Verloren' };
const STATUS_COLORS = { neu: 'var(--muted)', qualifiziert: 'var(--accent)', entwurf: 'var(--accent)', outreach_bereit: 'var(--orange)', kontaktiert: 'var(--orange)', geantwortet: 'var(--green)', interessiert: 'var(--accent)', angebot: 'var(--accent)', kunde: 'var(--green)', verloren: 'var(--red)' };

// AbortController für Event-Listener Cleanup
let crmController = null;

// Inbound-Heat-Listener — global, lebt über CRM-Re-Renders hinweg.
// Wird bei Sign-Out via cleanupInboundListener() abgebaut, sonst läuft
// der Firestore-Listener mit alten User-Credentials weiter.
let inboundUnsubscribe = null;
let lastNotifiedHotSlugs = new Set();
let cachedHotLeads = [];

// Aufgeklappte Detail-Bereiche überleben das Re-Render nach dem Speichern.
const offeneDetails = new Set();

// Einwilligungen kurz zwischenspeichern: jede Status-Änderung rendert das CRM neu,
// und ohne Cache würde jedes Mal die ganze consents-Collection gelesen.
const EINWILLIGUNGS_CACHE_MS = 60 * 1000;
let einwilligungsCache = { wert: null, at: 0 };

function leereEinwilligungsCache() { einwilligungsCache = { wert: null, at: 0 }; }

async function einwilligungenLesen() {
    if (einwilligungsCache.wert && Date.now() - einwilligungsCache.at < EINWILLIGUNGS_CACHE_MS) return einwilligungsCache.wert;
    const wert = await ladeEinwilligungenMitStatus();
    // Nur ein gelungenes Lesen cachen — ein Fehler soll beim nächsten Render neu versucht werden.
    einwilligungsCache = wert.geladen ? { wert, at: Date.now() } : { wert: null, at: 0 };
    return wert;
}

export function cleanupInboundListener() {
    if (typeof inboundUnsubscribe === 'function') {
        try { inboundUnsubscribe(); } catch {}
    }
    inboundUnsubscribe = null;
    lastNotifiedHotSlugs = new Set();
    cachedHotLeads = [];
    // Sign-Out: Einwilligungen des alten Kontos nicht weiter anzeigen
    leereEinwilligungsCache();
    offeneDetails.clear();
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

    const [leads, einw, gesperrtSet] = await Promise.all([
        loadLeads(),
        einwilligungenLesen(),
        loadSuppression()
    ]);
    const rerender = () => renderCRM(filter, searchQuery);
    const showConsents = el.dataset.showConsents === 'true';

    // Eingeloggt, aber noch keine Leads → freundlicher Start-Hinweis statt leerer Tabelle.
    // Einwilligungen können trotzdem vorliegen (sie kommen von der Website, nicht aus dem CRM).
    if (leads.length === 0 && !searchQuery) {
        el.innerHTML = `<div class="brand-empty">
            <div class="brand-empty-eyebrow">Pipeline</div>
            <h3>Noch keine Leads gespeichert</h3>
            <p>Starten Sie unter „Finden" mit einer Website, einer Stadt oder einer ganzen Region — gespeicherte Leads erscheinen dann hier.</p>
            <button class="btn-primary" data-action="goto-finden">Zu „Finden"</button>
        </div>
        ${einw.einwilligungen.length > 0 || !einw.geladen ? einwilligungenPanelHtml(einw) : ''}`;
        el.querySelector('[data-action="goto-finden"]')?.addEventListener('click', () => {
            document.querySelector('.nav-btn[data-view="finden"]')?.click();
        }, { signal });
        bindeEinwilligungsAktionen(el, einw, signal, rerender);
        return;
    }

    // Werbewiderspruch aus dem Impressum → Sperrliste. saveLead/updateLead tragen ihn
    // beim Speichern ein; hier werden Leads nachgezogen, die auf einem anderen Gerät
    // oder vor dieser Regel gespeichert wurden. addSuppression dedupliziert.
    const mitWiderspruch = leads.filter(hatWerbewiderspruch);
    let nachgetragen = 0;
    for (const l of mitWiderspruch) {
        if (isSuppressed(l.domain, gesperrtSet)) continue;
        const r = await addSuppression(l.domain, 'opt_out');
        if (r?.ok) { gesperrtSet.add(normalizeDomain(l.domain)); nachgetragen++; }
    }
    if (nachgetragen > 0) showToast(`${nachgetragen} Lead(s) mit Werbewiderspruch auf die Sperrliste gesetzt`);
    const istGesperrt = (l) => hatWerbewiderspruch(l) || isSuppressed(l.domain, gesperrtSet);

    // Suche
    let searched = leads;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        searched = leads.filter(l =>
            (l.name || '').toLowerCase().includes(q) ||
            (l.domain || '').toLowerCase().includes(q) ||
            (l.type || '').toLowerCase().includes(q) ||
            (l.notes || '').toLowerCase().includes(q) ||
            (l.partnerCode || '').toLowerCase().includes(q)
        );
    }

    // Quelle-Filter (Partner-Pipeline) — liegt VOR dem Status-Filter, damit die Zähler
    // der Status-Knöpfe zur gewählten Quelle passen.
    const quelleFilter = el.dataset.quelleFilter || 'alle';
    const nachQuelle = filterNachQuelle(searched, quelleFilter);
    const filtered = filter === 'alle' ? nachQuelle : nachQuelle.filter(l => l.status === filter);

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
    html += `<div id="crm-hot-leads">${renderHotLeadsHtml(cachedHotLeads, { gesperrt: gesperrtSet })}</div>`;

    // ── Header mit Aktionen ──
    const bestaetigtAnzahl = einw.einwilligungen.filter(e => einwilligungsStatus(e) === 'bestaetigt').length;
    html += `<div class="crm-header">
        <h2 class="crm-title">Lead-CRM</h2>
        <div class="crm-actions-top">
            <button class="crm-btn-export crm-btn-studio" data-action="studio">✉ Outreach-Studio</button>
            <button class="crm-btn-export${showConsents ? ' is-active' : ''}" data-action="toggleConsents" aria-expanded="${showConsents}">Einwilligungen${einw.geladen ? ` (${bestaetigtAnzahl})` : ''}</button>
            <button class="crm-btn-export" data-action="toggleStats">Wissenschaft</button>
            <button class="crm-btn-export" data-action="export">CSV Export</button>
            <button class="crm-btn-export crm-btn-danger" data-action="deleteAll">Alle löschen</button>
        </div>
    </div>`;

    // ── Einwilligungen (toggle, default geschlossen) ──
    if (showConsents) html += einwilligungenPanelHtml(einw);

    // ── Statistik-Panel (toggle, default geschlossen) ──
    const showStats = el.dataset.showStats === 'true';
    if (showStats) {
        html += renderStatisticsPanel();
    }

    // ── Hinweis Werbewiderspruch ──
    if (mitWiderspruch.length > 0) {
        html += `<div class="crm-hinweis-banner" role="note">${mitWiderspruch.length} Lead(s) mit Werbewiderspruch im Impressum — auf der Sperrliste, keine Werbung an diese Betriebe.</div>`;
    }

    // ── Pipeline-Visualisierung (Mini-Kanban) ──
    // Jede Stage zeigt Count + Wert + den Top-Lead (höchster Score). User sieht
    // sofort den nächsten Move pro Stage statt nur ein Aggregat. Klick auf Stage
    // filtert die Liste, Klick auf Top-Lead-Karte scrollt zur Lead-Card.
    // „geantwortet" ist die wichtigste Frühmetrik im Outbound — sie gehört in die
    // Pipeline, sonst sieht man nie, ob die Ansprache überhaupt trägt.
    const pipeStages = ['neu', 'kontaktiert', 'geantwortet', 'interessiert', 'angebot', 'kunde'];
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
        <input type="text" class="crm-search" placeholder="Lead suchen..." value="${escapeAttr(searchQuery)}" data-action="search">
        <div class="crm-filters">`;
    for (const s of STATUSES) {
        const count = s === 'alle' ? nachQuelle.length : nachQuelle.filter(l => l.status === s).length;
        html += `<button class="crm-filter-btn${s === filter ? ' active' : ''}" data-filter="${s}">${s === 'alle' ? 'Alle' : STATUS_LABELS[s]} (${count})</button>`;
    }
    html += `</div>
        ${quelleFilterHtml(searched, quelleFilter)}
    </div>`;

    // ── Lead-Liste ──
    if (filtered.length === 0) {
        html += `<div class="crm-empty">${searchQuery ? `Keine Leads für "${escapeAttr(searchQuery)}"` : `Keine Leads in "${filter === 'alle' ? 'Alle' : STATUS_LABELS[filter] || filter}"`}</div>`;
    } else {
        html += `<div class="crm-list">`;
        for (const l of filtered) {
            const scoreColor = (l.leadScore || 0) >= 55 ? 'var(--green)' : (l.leadScore || 0) >= 30 ? 'var(--orange)' : 'var(--red)';
            const scoreBg = (l.leadScore || 0) >= 55 ? 'rgba(48,209,88,0.1)' : (l.leadScore || 0) >= 30 ? 'rgba(255,159,10,0.1)' : 'rgba(255,69,58,0.1)';
            const savedDate = l.savedAt ? new Date(l.savedAt).toLocaleDateString('de-DE') : '';
            const updatedDate = l.updatedAt ? timeAgo(l.updatedAt) : '';
            const gesperrt = istGesperrt(l);
            const befund = befundMitGate(l, beurteileKontaktGrundlage(l, { einwilligungen: einw.einwilligungen, geladen: einw.geladen, gesperrt, vollstaendig: einw.vollstaendig }), { einw, gesperrt });
            const verlust = l.status === 'verloren' && l.verlustGrund ? VERLUST_GRUENDE.find(g => g.id === l.verlustGrund)?.label : null;

            html += `<div class="card crm-lead-card anim-in${gesperrt ? ' is-gesperrt' : ''}">
                <div class="crm-lead-top">
                    <input type="checkbox" class="crm-lead-select" data-lead-id="${l.id}" title="Für Outreach-Studio auswählen">
                    <div class="crm-lead-score" style="background:${scoreBg};color:${scoreColor}">${l.leadScore || 0}</div>
                    <div class="crm-lead-info">
                        <div class="crm-lead-name">${escapeAttr(l.name || l.domain)}</div>
                        <div class="crm-lead-meta">
                            <a href="${escapeAttr(l.url || 'https://' + l.domain)}" target="_blank" rel="noopener">${escapeAttr(l.domain)}</a>
                            ${l.type ? ` · ${escapeAttr(l.type)}` : ''}
                            ${l.perf ? ` · Perf ${l.perf}` : ''}
                            ${l.seo ? ` · SEO ${l.seo}` : ''}
                            · <a href="#" class="crm-reanalyze" data-url="${l.url || 'https://' + l.domain}">neu analysieren</a>
                        </div>
                        <div class="crm-lead-dates">
                            ${savedDate ? `Gespeichert: ${savedDate}` : ''}
                            ${updatedDate ? ` · ${updatedDate}` : ''}
                            ${verlust ? ` · Verloren: ${escapeAttr(verlust)}` : ''}
                        </div>
                        ${leadBadgesHtml(l, befund, { gesperrt })}
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
                ${leadDetailsHtml(l, befund, { gesperrt, offen: offeneDetails.has(l.id) })}
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

    const leadById = (id) => leads.find(l => l.id === id) || null;

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

            // Verloren: Grund abfragen. Abbrechen = Status bleibt, wie er war.
            const zusatz = {};
            if (newStatus === 'verloren' && prevStatus !== 'verloren') {
                const lead = leadById(id);
                const grund = await frageVerlustGrund(lead?.name || domain);
                if (!grund) { e.target.value = prevStatus; return; }
                zusatz.verlustGrund = grund;
            }

            const result = await updateLead(id, { status: newStatus, ...zusatz });
            const gesperrtHinweis = zusatz.verlustGrund ? await sperreNachVerlust(domain, zusatz.verlustGrund) : '';

            // recordOutcome NUR wenn Sync ok + Score > 0 (Score 0 = Konkurrenz/Enterprise)
            if (isNewOutcome && result.firestoreSynced && numScore > 0) {
                recordOutcome(domain, numScore, newStatus, branch || null);
            }

            if (!result.firestoreSynced) {
                showToast('Sync-Fehler — Änderung nur lokal gespeichert');
            } else {
                showToast(
                    isNewOutcome && newStatus === 'kunde' ? 'Glückwunsch! Als Kunde markiert.' :
                    isNewOutcome && newStatus === 'verloren' ? `Als verloren markiert.${gesperrtHinweis}` :
                    `Status → ${STATUS_LABELS[newStatus] || newStatus}`
                );
            }
            // Stats + Pipeline refreshen
            renderCRM(filter, searchQuery);
        }
    }, { signal });

    // Kontaktgrundlage: Erklärung zur gewählten Art sofort anzeigen (ohne Speichern)
    el.addEventListener('change', (e) => {
        if (e.target.dataset.feld !== 'kg-art') return;
        const box = e.target.closest('[data-details-id]');
        const erkl = box?.querySelector('[data-erklaerung]');
        if (erkl) erkl.textContent = KONTAKT_GRUNDLAGE_ERKLAERUNG[e.target.value] || '';
        const keine = e.target.value === 'keine';
        box?.querySelectorAll('[data-feld="kg-datum"], [data-feld="kg-nachweis"]').forEach(inp => { inp.disabled = keine || e.target.value === 'doi'; });
    }, { signal });

    // Aufgeklappte Details merken. `toggle` blubbert nicht — in der Capture-Phase kommt es trotzdem an.
    el.addEventListener('toggle', (e) => {
        const box = e.target.closest?.('details[data-details-id]');
        if (!box || box !== e.target) return;
        if (box.open) offeneDetails.add(box.dataset.detailsId);
        else offeneDetails.delete(box.dataset.detailsId);
    }, { capture: true, signal });

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

    // Quelle-Filter
    el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-quelle-filter]');
        if (!btn) return;
        el.dataset.quelleFilter = btn.dataset.quelleFilter;
        renderCRM(filter, searchQuery);
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
        const zusatz = {};
        if (outcome === 'verloren') {
            const grund = await frageVerlustGrund(leadById(leadId)?.name || domain);
            if (!grund) return;
            zusatz.verlustGrund = grund;
        }
        const result = await updateLead(leadId, { status: outcome, ...zusatz });
        const gesperrtHinweis = zusatz.verlustGrund ? await sperreNachVerlust(domain, zusatz.verlustGrund) : '';
        if (result.firestoreSynced && numScore > 0) {
            recordOutcome(domain, numScore, outcome, branch || null);
        }
        if (!result.firestoreSynced) {
            showToast('Sync-Fehler — Änderung nur lokal gespeichert');
        } else {
            showToast(outcome === 'kunde' ? 'Glückwunsch! Als Kunde markiert.' : `Als verloren markiert.${gesperrtHinweis}`);
        }
        renderCRM(filter, searchQuery);
    }, { signal });

    // Details speichern: Kontaktgrundlage, Quelle, Partner, Provision
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="save-details"]');
        if (!btn) return;
        const id = btn.dataset.leadId;
        const lead = leadById(id);
        const box = btn.closest('[data-details-id]');
        if (!lead || !box) return;
        const werte = leseDetailWerte(box);
        const { updates, fehler } = baueDetailUpdates(werte, lead, { einwilligungen: einw.einwilligungen, geladen: einw.geladen });
        const fehlerBox = box.querySelector('[data-fehler]');
        if (fehler.length > 0) {
            if (fehlerBox) { fehlerBox.textContent = fehler.join(' '); fehlerBox.hidden = false; }
            return;
        }
        const bisherStatus = lead.provision ? normalisiereProvision(lead.provision).status : 'offen';
        if (updates.provision && updates.provision.status !== 'offen' && updates.provision.status !== bisherStatus
            && !confirm('Ist der vollständige Zahlungseingang des Kunden verbucht und sind Offenlegung und Zustimmung des Kunden dokumentiert?')) {
            return;
        }
        btn.disabled = true;
        const result = await updateLead(id, updates);
        showToast(result.firestoreSynced ? 'Angaben gespeichert' : 'Nur lokal gespeichert — Sync-Fehler');
        renderCRM(filter, searchQuery);
    }, { signal });

    // Bestätigte Einwilligung als Kontaktgrundlage übernehmen
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="uebernehme-doi"]');
        if (!btn) return;
        const e1 = einw.einwilligungen.find(x => x.id === btn.dataset.einwilligungId);
        if (!e1 || einwilligungsStatus(e1) !== 'bestaetigt') { showToast('Diese Einwilligung trägt nicht mehr.'); return; }
        btn.disabled = true;
        const result = await updateLead(btn.dataset.leadId, { kontaktGrundlage: kontaktGrundlageAusEinwilligung(e1) });
        showToast(result.firestoreSynced ? 'Double-Opt-In als Kontaktgrundlage übernommen' : 'Nur lokal gespeichert — Sync-Fehler');
        renderCRM(filter, searchQuery);
    }, { signal });

    // Nicht mehr kontaktieren → Sperrliste
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="suppress"]');
        if (!btn) return;
        const domain = btn.dataset.domain;
        if (!domain || !confirm(`${domain} auf die Sperrliste setzen? Dieser Betrieb wird danach nicht mehr kontaktiert.`)) return;
        btn.disabled = true;
        const r = await addSuppression(domain, 'manual');
        showToast(!r?.ok ? 'Sperrliste: Domain nicht lesbar' : r.firestoreSynced ? 'Auf die Sperrliste gesetzt' : 'Lokal gesperrt — Sync-Fehler');
        renderCRM(filter, searchQuery);
    }, { signal });

    bindeEinwilligungsAktionen(el, einw, signal, rerender);

    // CSV Export + Alle löschen + Wissenschafts-Toggle + Einwilligungen-Toggle
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
        if (e.target.dataset.action === 'toggleConsents') {
            el.dataset.showConsents = showConsents ? 'false' : 'true';
            renderCRM(filter, searchQuery);
        }
    }, { signal });

    // Outreach-Studio: angehakte Leads (sonst die gefilterte Liste) übernehmen.
    // Gesperrte Betriebe (Sperrliste, Werbewiderspruch) gehen nie ins Studio.
    el.addEventListener('click', (e) => {
        if (e.target.dataset.action !== 'studio') return;
        const checked = new Set([...el.querySelectorAll('.crm-lead-select:checked')].map(c => c.dataset.leadId));
        const kandidaten = checked.size > 0 ? filtered.filter(l => checked.has(l.id)) : filtered;
        const selection = kandidaten.filter(l => !istGesperrt(l));
        const ausgelassen = kandidaten.length - selection.length;
        if (selection.length === 0) { showToast(ausgelassen > 0 ? 'Alle gewählten Leads sind gesperrt.' : 'Keine Leads zum Anschreiben.'); return; }
        if (ausgelassen > 0) showToast(`${ausgelassen} gesperrte Lead(s) nicht übernommen`);
        if (selection.length > 50 && !confirm(`${selection.length} Leads ins Outreach-Studio übernehmen? Für Top-Leads kann das KI-Kosten verursachen.`)) return;
        openStudio(selection);
    }, { signal });
}

// ══════════════════════════════════════
// Einwilligungen, Kontaktgrundlage, Partner — reine HTML-Bausteine
// ══════════════════════════════════════

/** Leads nach Quelle filtern. 'alle' | eine Quelle aus QUELLEN | 'ohne' (keine Angabe). */
export function filterNachQuelle(leads, quelleFilter = 'alle') {
    if (!Array.isArray(leads)) return [];
    if (quelleFilter === 'alle' || !quelleFilter) return leads;
    if (quelleFilter === 'ohne') return leads.filter(l => !leiteQuelleAb(l));
    return leads.filter(l => leiteQuelleAb(l) === quelleFilter);
}

/**
 * Die Karte darf nie „trägt" sagen, wo das Versand-Gate (V9) nein sagt. Das Gate
 * kennt Regeln, die die Anzeige-Beurteilung nicht wiederholt (höchstens drei
 * E-Mails je Einwilligung, Datum in der Zukunft) — statt sie ein zweites Mal zu
 * schreiben, entscheidet hier das Gate selbst über den Befund „trägt".
 */
export function befundMitGate(lead, befund, { einw = {}, gesperrt = false } = {}) {
    if (befund?.stufe !== 'traegt') return befund;
    try {
        const g = pruefeMailErlaubnis(lead, {
            einwilligungen: Array.isArray(einw.einwilligungen) ? einw.einwilligungen : [],
            einwilligungenGeladen: einw.geladen === true,
            gesperrt,
            kanal: 'email'
        });
        if (g?.erlaubt) return befund;
        return { ...befund, stufe: 'traegt_nicht', text: g?.grund || 'Das Versand-Gate lässt keine E-Mail zu.' };
    } catch (e) {
        console.warn('Kontakt-Gate im CRM nicht auswertbar:', e);
        return { ...befund, stufe: 'nicht_pruefbar', text: 'Versand-Gate nicht auswertbar — die Grundlage lässt sich gerade nicht prüfen.' };
    }
}

export function quelleFilterHtml(leads, aktiv = 'alle') {
    const optionen = [['alle', 'Alle Quellen'], ...QUELLEN.map(q => [q, QUELLEN_LABELS[q]]), ['ohne', 'Ohne Angabe']];
    return `<div class="crm-filters crm-quelle-filter" aria-label="Nach Quelle filtern">
        ${optionen.map(([wert, label]) => {
            const n = filterNachQuelle(leads, wert).length;
            if (n === 0 && wert !== 'alle' && wert !== aktiv) return '';
            return `<button class="crm-filter-btn crm-filter-btn-quelle${wert === aktiv ? ' active' : ''}" data-quelle-filter="${wert}">${escapeAttr(label)} (${n})</button>`;
        }).join('')}
    </div>`;
}

const BEFUND_BADGE = {
    traegt: { klasse: 'ok', label: (l) => KONTAKT_GRUNDLAGE_LABELS[normalisiereKontaktGrundlage(l.kontaktGrundlage).art] },
    unvollstaendig: { klasse: 'warn', label: () => 'Grundlage unvollständig' },
    traegt_nicht: { klasse: 'warn', label: () => 'Grundlage trägt nicht' },
    entfallen: { klasse: 'bad', label: () => 'Einwilligung entfallen' },
    nicht_pruefbar: { klasse: 'neutral', label: () => 'Double-Opt-In nicht prüfbar' },
    keine: { klasse: 'neutral', label: () => 'Keine Kontaktgrundlage' },
    gesperrt: { klasse: 'bad', label: (l) => (hatWerbewiderspruch(l) ? 'Werbewiderspruch — gesperrt' : 'Gesperrt') }
};

/** Kleine Kennzeichen unter dem Lead-Namen: Kontaktgrundlage, DOI-Vorschlag, Quelle, Partner. */
export function leadBadgesHtml(lead, befund, { gesperrt = false } = {}) {
    const teile = [];
    const b = BEFUND_BADGE[befund?.stufe] || BEFUND_BADGE.keine;
    teile.push(`<span class="crm-badge crm-badge-${b.klasse}" title="${escapeAttr(befund?.text || '')}">${escapeAttr(b.label(lead))}</span>`);
    if (befund?.vorschlag && !gesperrt) {
        teile.push(`<span class="crm-badge crm-badge-accent">Double-Opt-In vom ${escapeAttr(datumDe(befund.vorschlag.confirmedAt))}</span>`);
    }
    const quelle = leiteQuelleAb(lead);
    if (quelle) teile.push(`<span class="crm-badge crm-badge-neutral">Quelle: ${escapeAttr(QUELLEN_LABELS[quelle])}</span>`);
    if (lead?.partnerCode) {
        const p = lead.provision ? normalisiereProvision(lead.provision) : null;
        teile.push(`<span class="crm-badge crm-badge-neutral">Partner ${escapeAttr(lead.partnerCode)}${p ? ` · Provision ${escapeAttr(PROVISION_STATUS_LABELS[p.status])}` : ''}</span>`);
    }
    return `<div class="crm-lead-badges">${teile.join('')}</div>`;
}

function euro(n) {
    return typeof n === 'number' && Number.isFinite(n)
        ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
        : '';
}

/** Aufklappbarer Bereich je Lead: Kontaktgrundlage, Quelle & Partner, Sperrliste. */
export function leadDetailsHtml(lead, befund, { gesperrt = false, offen = false } = {}) {
    const id = escapeAttr(lead?.id || '');
    const kg = normalisiereKontaktGrundlage(lead?.kontaktGrundlage);
    const quelle = leiteQuelleAb(lead);
    const p = lead?.provision ? normalisiereProvision(lead.provision) : null;
    const summe = provisionsBetrag(p);
    const satzProzent = Math.round((p?.satz ?? 0.10) * 1000) / 10;
    const vorschlag = befund?.vorschlag && !gesperrt ? befund.vorschlag : null;
    const datumGesperrt = kg.art === 'keine' || kg.art === 'doi';

    return `<details class="crm-lead-details" data-details-id="${id}"${offen ? ' open' : ''}>
        <summary>Kontaktgrundlage, Quelle und Partner</summary>
        <div class="crm-details-grid">
            <fieldset class="crm-fieldset">
                <legend>Kontaktgrundlage</legend>
                <p class="crm-kg-befund crm-kg-${escapeAttr(befund?.stufe || 'keine')}">${escapeAttr(befund?.text || '')}</p>
                ${befund?.stufe === 'traegt' && kg.art === 'doi' ? `<p class="crm-hinweis">Die Einwilligung gilt nur für die bestätigte Adresse und nur für Hinweise zur Website samt Angebot (höchstens drei E-Mails).</p>` : ''}
                ${vorschlag ? `<div class="crm-kg-vorschlag">
                    <span>Double-Opt-In vom ${escapeAttr(datumDe(vorschlag.confirmedAt))}${vorschlag.email ? ` für ${escapeAttr(vorschlag.email)}` : ''}.</span>
                    <button type="button" class="crm-btn-export" data-action="uebernehme-doi" data-lead-id="${id}" data-einwilligung-id="${escapeAttr(vorschlag.id)}">Als Grundlage übernehmen</button>
                </div>` : ''}
                <label class="crm-feld">Art
                    <select data-feld="kg-art">
                        ${KONTAKT_GRUNDLAGE_ARTEN.map(a => `<option value="${a}"${kg.art === a ? ' selected' : ''}>${escapeAttr(KONTAKT_GRUNDLAGE_LABELS[a])}</option>`).join('')}
                    </select>
                </label>
                <p class="crm-kg-erklaerung" data-erklaerung>${escapeAttr(KONTAKT_GRUNDLAGE_ERKLAERUNG[kg.art])}</p>
                <label class="crm-feld">Datum
                    <input type="date" data-feld="kg-datum" value="${escapeAttr(datumFuerEingabe(kg.datum))}"${datumGesperrt ? ' disabled' : ''}>
                </label>
                <label class="crm-feld">Nachweis
                    <input type="text" data-feld="kg-nachweis" maxlength="500" value="${escapeAttr(kg.nachweis || '')}" placeholder="z. B. Anfrage über das Kontaktformular, abgelegt unter …"${datumGesperrt ? ' disabled' : ''}>
                </label>
            </fieldset>
            <fieldset class="crm-fieldset">
                <legend>Quelle und Partner</legend>
                <label class="crm-feld">Quelle
                    <select data-feld="quelle">
                        <option value=""${quelle ? '' : ' selected'}>Nicht angegeben</option>
                        ${QUELLEN.map(q => `<option value="${q}"${quelle === q ? ' selected' : ''}>${escapeAttr(QUELLEN_LABELS[q])}</option>`).join('')}
                    </select>
                </label>
                <label class="crm-feld">Partnercode
                    <input type="text" data-feld="partner-code" maxlength="40" value="${escapeAttr(lead?.partnerCode || '')}">
                </label>
                <label class="crm-feld">Provision (${escapeAttr(String(satzProzent).replace('.', ','))} %)
                    <select data-feld="provision-status">
                        ${PROVISION_STATUS.map(s => `<option value="${s}"${(p?.status || 'offen') === s ? ' selected' : ''}>${escapeAttr(PROVISION_STATUS_LABELS[s])}</option>`).join('')}
                    </select>
                </label>
                <label class="crm-feld">Auftragswert netto (€)
                    <input type="text" inputmode="decimal" data-feld="provision-betrag" value="${escapeAttr(p?.betragNetto != null ? String(p.betragNetto).replace('.', ',') : '')}" placeholder="z. B. 1.990">
                </label>
                ${summe !== null ? `<p class="crm-provision-summe">Provision: ${escapeAttr(euro(summe))} netto</p>` : ''}
                <p class="crm-hinweis">Provision nur nach vollständigem Zahlungseingang; Offenlegung gegenüber dem Kunden und dessen Zustimmung dokumentieren.</p>
            </fieldset>
        </div>
        <p class="crm-details-fehler" data-fehler role="alert" hidden></p>
        <div class="crm-details-actions">
            <button type="button" class="crm-btn-export crm-btn-primary" data-action="save-details" data-lead-id="${id}">Speichern</button>
            ${gesperrt
                ? `<span class="crm-badge crm-badge-bad">Auf der Sperrliste</span>`
                : `<button type="button" class="crm-btn-export crm-btn-danger" data-action="suppress" data-domain="${escapeAttr(lead?.domain || '')}">Nicht mehr kontaktieren</button>`}
        </div>
    </details>`;
}

/**
 * Panel „Einwilligungen". Nicht lesbar (kein Admin, Netz) wird ausdrücklich
 * gesagt — sonst sieht „nicht gemessen" aus wie „keine Einwilligungen".
 * @param {{einwilligungen:Array, geladen:boolean, fehler:string|null}} einw
 */
export function einwilligungenPanelHtml(einw, now = Date.now()) {
    const liste = Array.isArray(einw?.einwilligungen) ? einw.einwilligungen : [];
    let inhalt;
    if (!einw?.geladen) {
        inhalt = `<p class="crm-einw-leer">Einwilligungen nicht lesbar${einw?.fehler ? ` (${escapeAttr(einw.fehler)})` : ''}. Solange sie nicht gelesen werden können, trägt keine Double-Opt-In-Grundlage.</p>`;
    } else if (liste.length === 0) {
        inhalt = `<p class="crm-einw-leer">Noch keine Einwilligungen eingegangen.</p>`;
    } else {
        const zaehler = {};
        for (const e of liste) { const s = einwilligungsStatus(e, now); zaehler[s] = (zaehler[s] || 0) + 1; }
        const kopf = Object.entries(EINWILLIGUNGS_STATUS_LABELS)
            .filter(([s]) => zaehler[s])
            .map(([s, label]) => `${escapeAttr(label)}: ${zaehler[s]}`).join(' · ');
        inhalt = `<p class="crm-einw-zaehler">${kopf}</p>
        ${einw.vollstaendig === false ? `<p class="crm-einw-leer">Angezeigt werden nur die neuesten ${liste.length} Einwilligungen; ältere sind nicht geladen.</p>` : ''}
        <ul class="crm-einw-liste">${liste.map(e => einwilligungZeileHtml(e, now)).join('')}</ul>`;
    }
    return `<section class="card crm-einw-panel anim-in" aria-label="Einwilligungen">
        <div class="section-label">Einwilligungen (Double-Opt-In)</div>
        ${inhalt}
    </section>`;
}

export function einwilligungZeileHtml(e, now = Date.now()) {
    const status = einwilligungsStatus(e, now);
    const daten = [];
    if (e.createdAt) daten.push(`angefordert ${datumDe(e.createdAt)}`);
    if (e.confirmedAt) daten.push(`bestätigt ${datumDe(e.confirmedAt)}`);
    if (e.revokedAt) daten.push(`widerrufen ${datumDe(e.revokedAt)}`);
    if (status === 'bestaetigt' && e.nextSendAt) daten.push(`nächste E-Mail ${datumDe(e.nextSendAt)}`);
    const schritt = e.confirmedAt ? `Schritt ${Math.min(e.sequenceStep, MAX_SEQUENZ_SCHRITTE)} von ${MAX_SEQUENZ_SCHRITTE}` : 'Strecke nicht gestartet';
    const quelle = e.source ? (EINWILLIGUNGS_QUELLEN[e.source] || e.source) : 'Quelle unbekannt';
    const stoppbar = status === 'bestaetigt' || status === 'offen';
    return `<li class="crm-einw-zeile crm-einw-${status}">
        <div class="crm-einw-haupt">
            <span class="crm-badge crm-einw-status crm-einw-status-${status}">${escapeAttr(EINWILLIGUNGS_STATUS_LABELS[status])}</span>
            <span class="crm-einw-adresse">${escapeAttr(e.email || '—')}</span>
            ${e.domain ? `<span class="crm-einw-domain">${escapeAttr(e.domain)}</span>` : ''}
        </div>
        <div class="crm-einw-meta">${escapeAttr(schritt)} · ${escapeAttr(quelle)}${daten.length ? ` · ${escapeAttr(daten.join(' · '))}` : ''}</div>
        ${stoppbar ? `<button type="button" class="crm-btn-export crm-btn-danger" data-action="stoppe-sequenz" data-einwilligung-id="${escapeAttr(e.id)}">Strecke stoppen</button>` : ''}
    </li>`;
}

function bindeEinwilligungsAktionen(el, einw, signal, rerender) {
    el.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-action="stoppe-sequenz"]');
        if (!btn) return;
        const e1 = (einw?.einwilligungen || []).find(x => x.id === btn.dataset.einwilligungId);
        const wer = e1?.email || e1?.domain || 'diese Einwilligung';
        if (!confirm(`Nachfass-Strecke für ${wer} stoppen? Danach geht aus dieser Einwilligung keine E-Mail mehr hinaus. Hier lässt sich das nicht zurücknehmen.`)) return;
        btn.disabled = true;
        const r = await stoppeSequenz(btn.dataset.einwilligungId);
        if (r.ok) {
            leereEinwilligungsCache();
            showToast('Nachfass-Strecke gestoppt');
        } else {
            btn.disabled = false;
            showToast(`Nicht gestoppt: ${r.fehler || 'unbekannter Fehler'}`);
            return;
        }
        rerender();
    }, { signal });
}

/** Formularwerte eines Detail-Bereichs lesen (DOM → baueDetailUpdates). */
function leseDetailWerte(box) {
    const wert = (feld) => box.querySelector(`[data-feld="${feld}"]`)?.value ?? '';
    return {
        kgArt: wert('kg-art'),
        kgDatum: wert('kg-datum'),
        kgNachweis: wert('kg-nachweis'),
        quelle: wert('quelle'),
        partnerCode: wert('partner-code'),
        provisionStatus: wert('provision-status'),
        provisionBetrag: wert('provision-betrag')
    };
}

/** Verlust-Grund → ggf. Sperrliste. Liefert einen Zusatz für den Toast. */
async function sperreNachVerlust(domain, grundId) {
    const sperrgrund = sperrgrundFuerVerlust(grundId);
    if (!sperrgrund || !domain) return '';
    const r = await addSuppression(domain, sperrgrund);
    return r?.ok ? ' Auf die Sperrliste gesetzt.' : ' Sperrliste: nicht eingetragen.';
}

/**
 * Fragt den Verlust-Grund in einem Dialog ab.
 * @returns {Promise<string|null>} Grund-ID oder null (abgebrochen)
 */
function frageVerlustGrund(name) {
    if (typeof document === 'undefined') return Promise.resolve(null);
    const d = document.createElement('dialog');
    if (typeof d.showModal !== 'function') {
        // Rückfall ohne <dialog>: nummerierte Auswahl
        const text = VERLUST_GRUENDE.map((g, i) => `${i + 1} = ${g.label}`).join('\n');
        const antwort = prompt(`Warum verloren?\n${text}`, '');
        const g = VERLUST_GRUENDE[parseInt(antwort, 10) - 1];
        return Promise.resolve(g ? g.id : null);
    }
    return new Promise((resolve) => {
        d.className = 'crm-dialog';
        d.innerHTML = `<form method="dialog" class="crm-dialog-form">
            <div class="crm-dialog-title">Warum verloren?</div>
            ${name ? `<div class="crm-dialog-sub">${escapeAttr(name)}</div>` : ''}
            ${VERLUST_GRUENDE.map(g => `<label class="crm-dialog-option">
                <input type="radio" name="verlustGrund" value="${g.id}" required>
                <span>${escapeAttr(g.label)}${g.sperrgrund ? ' <span class="crm-dialog-hint">— kommt auf die Sperrliste</span>' : ''}</span>
            </label>`).join('')}
            <div class="crm-dialog-actions">
                <button type="button" class="crm-btn-export" data-dialog="abbrechen">Abbrechen</button>
                <button type="submit" value="ok" class="crm-btn-export crm-btn-primary">Als verloren markieren</button>
            </div>
        </form>`;
        d.querySelector('[data-dialog="abbrechen"]').addEventListener('click', () => d.close(''), { once: true });
        d.addEventListener('close', () => {
            const wahl = d.returnValue === 'ok' ? d.querySelector('input[name="verlustGrund"]:checked')?.value : null;
            d.remove();
            resolve(wahl || null);
        }, { once: true });
        document.body.appendChild(d);
        d.showModal();
    });
}

// ── Hot-Leads-Rendering ──
// Name, Domain und Adresse stammen aus dem ÖFFENTLICHEN Audit-Formular → jede
// Ausgabe escapen (sonst Stored-XSS im angemeldeten CRM). Gesperrte Domains
// (Sperrliste, Werbewiderspruch) bekommen keinen E-Mail-Knopf.
const EMAIL_MUSTER = /^[^\s@<>"'?&#]+@[^\s@<>"'?&#]+\.[^\s@<>"'?&#]+$/;

export function renderHotLeadsHtml(hotLeads, { gesperrt = null } = {}) {
    if (!hotLeads || hotLeads.length === 0) return '';
    const cards = hotLeads.slice(0, 6).map(l => {
        const pulseClass = l.tier === 'very_hot' ? ' hot-pulse' : '';
        const badge = l.tier === 'very_hot' ? '🔥 Heißer Lead' : '🔥 Warm';
        const lastSeen = l.lastVisitAtMs ? timeAgo(l.lastVisitAtMs) : 'noch keine Page-Visits';
        const visits = Number(l.visitCount) > 0 ? ` · ${Number(l.visitCount)} Visits` : '';
        const ctas = Number(l.ctaClicks) > 0 ? ` · ${Number(l.ctaClicks)} CTA-Klicks` : '';
        const auditUrl = `https://karriaro-webdesign.de/audit?slug=${encodeURIComponent(l.slug || '')}`;
        const email = typeof l.email === 'string' && EMAIL_MUSTER.test(l.email.trim()) ? l.email.trim() : '';
        const istGesperrt = !!l.domain && isSuppressed(l.domain, gesperrt);
        // Antwort auf die eigene Anfrage (Grundlage „anfrage"): derselbe Pflichtteil wie
        // jede Mail aus dem Werkzeug — Absender, Abmeldeweg, Widerspruchshinweis.
        // 2026-09-11: Der Text verrät nicht mehr, dass Seitenaufrufe gemessen werden.
        const pflicht = email
            ? (complianceBlock(config.profile, { erlaubt: true, kanal: 'email', grundlage: 'anfrage', datum: l.createdAtMs || null })?.text || '')
            : '';
        const mailto = email
            ? (baueMailtoHref({
                to: email,
                subject: 'Ihre Website-Prüfung' + (l.domain ? ' für ' + l.domain : ''),
                kern: `Guten Tag${l.name ? ' ' + l.name : ''},\n\nvielen Dank für Ihre Anfrage zur Website-Prüfung. Gern bespreche ich die Ergebnisse in einem kurzen Gespräch mit Ihnen — passt Ihnen ein Termin in den nächsten Tagen?\n\nViele Grüße`,
                pflicht
            }) || '')
            : '';
        const mailKnopf = istGesperrt
            ? `<span class="hot-lead-btn hot-lead-btn-gesperrt">Auf der Sperrliste — keine E-Mail</span>`
            : mailto
                ? `<a href="${escapeAttr(mailto)}" class="hot-lead-btn hot-lead-btn-primary">E-Mail schreiben</a>`
                : '';
        return `<div class="hot-lead-card${pulseClass}">
            <div class="hot-lead-top">
                <span class="hot-lead-badge">${badge}</span>
                <span class="hot-lead-heat">${escapeAttr(l.heat)}</span>
            </div>
            <div class="hot-lead-domain">${escapeAttr(l.domain || '—')}</div>
            <div class="hot-lead-meta">${escapeAttr(l.name || '—')}${l.email ? ' · ' + escapeAttr(l.email) : ''}</div>
            <div class="hot-lead-meta">${escapeAttr(l.techHeadline || '')}${visits}${ctas}</div>
            <div class="hot-lead-meta">Letzter Visit: ${lastSeen}</div>
            <div class="hot-lead-actions">
                ${mailKnopf}
                <a href="${escapeAttr(auditUrl)}" target="_blank" rel="noopener" class="hot-lead-btn">Audit-Seite öffnen</a>
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
    if (lead.domain && isSuppressed(lead.domain)) return;
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
