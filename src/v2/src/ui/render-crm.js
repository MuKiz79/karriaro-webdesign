/**
 * CRM View Renderer — Pipeline, Suche, Export, Responsive
 */
import { loadLeads, updateLead, deleteLead, deleteAllLeads, exportCSV } from '../crm/leads.js';
import { currentUser } from '../crm/firebase.js';
import { recordOutcome, getCalibration } from '../learning/feedback-loop.js';

const STATUSES = ['alle', 'neu', 'kontaktiert', 'interessiert', 'angebot', 'kunde', 'verloren'];
const STATUS_LABELS = { neu: 'Neu', kontaktiert: 'Kontaktiert', interessiert: 'Interessiert', angebot: 'Angebot', kunde: 'Kunde', verloren: 'Verloren' };
const STATUS_COLORS = { neu: 'var(--muted)', kontaktiert: 'var(--orange)', interessiert: 'var(--accent)', angebot: 'var(--accent)', kunde: 'var(--green)', verloren: 'var(--red)' };

// AbortController für Event-Listener Cleanup
let crmController = null;

export async function renderCRM(filter = 'alle', searchQuery = '') {
    const el = document.getElementById('crm-view');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('batch-results').classList.add('hidden');

    // Cleanup vorherige Event-Listener
    if (crmController) crmController.abort();
    crmController = new AbortController();
    const signal = crmController.signal;

    if (!currentUser()) {
        el.innerHTML = `<div class="crm-empty"><p>Bitte zuerst anmelden um deine Leads zu sehen.</p></div>`;
        el.classList.remove('hidden');
        return;
    }

    el.innerHTML = `<div class="crm-loading"><div class="spinner"></div></div>`;
    el.classList.remove('hidden');

    const leads = await loadLeads();

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

    // ── Header mit Aktionen ──
    html += `<div class="crm-header">
        <h2 class="crm-title">Lead-CRM</h2>
        <div class="crm-actions-top">
            <button class="crm-btn-export" data-action="export">CSV Export</button>
            <button class="crm-btn-export crm-btn-danger" data-action="deleteAll">Alle löschen</button>
        </div>
    </div>`;

    // ── Pipeline-Visualisierung ──
    const pipeStages = ['neu', 'kontaktiert', 'interessiert', 'angebot', 'kunde'];
    html += `<div class="crm-pipeline">`;
    for (const stage of pipeStages) {
        const count = leads.filter(l => l.status === stage).length;
        const value = leads.filter(l => l.status === stage).reduce((s, l) => s + (l.expectedValue || 0), 0);
        const isActive = filter === stage;
        html += `<div class="crm-pipe-stage${isActive ? ' active' : ''}" data-filter="${stage}">
            <div class="crm-pipe-count" style="color:${STATUS_COLORS[stage]}">${count}</div>
            <div class="crm-pipe-label">${STATUS_LABELS[stage]}</div>
            ${value > 0 ? `<div class="crm-pipe-value">${Math.round(value)}€</div>` : ''}
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
                    <div class="crm-lead-score" style="background:${scoreBg};color:${scoreColor}">${l.leadScore || 0}</div>
                    <div class="crm-lead-info">
                        <div class="crm-lead-name">${l.name || l.domain}</div>
                        <div class="crm-lead-meta">
                            <a href="${l.url || 'https://' + l.domain}" target="_blank" rel="noopener">${l.domain}</a>
                            ${l.type ? ` · ${l.type}` : ''}
                            ${l.perf ? ` · Perf ${l.perf}` : ''}
                            ${l.seo ? ` · SEO ${l.seo}` : ''}
                        </div>
                        <div class="crm-lead-dates">
                            ${savedDate ? `Gespeichert: ${savedDate}` : ''}
                            ${updatedDate ? ` · ${updatedDate}` : ''}
                        </div>
                    </div>
                    <div class="crm-lead-actions">
                        <select class="crm-status-select" data-lead-id="${l.id}" data-action="status" style="color:${STATUS_COLORS[l.status] || 'var(--muted)'}">
                            ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}</option>`).join('')}
                        </select>
                        <button class="crm-btn-delete" data-lead-id="${l.id}" data-action="delete" title="Löschen">✕</button>
                    </div>
                </div>
                <div class="crm-lead-bottom">
                    <input type="text" class="crm-notes-input" value="${(l.notes || '').replace(/"/g, '&quot;')}" placeholder="Notiz hinzufügen..." data-lead-id="${l.id}" data-action="notes">
                    ${l.expectedValue ? `<span class="crm-lead-ev">EV: ${l.expectedValue}€</span>` : ''}
                    ${l.status === 'angebot' || l.status === 'interessiert' ? `<button class="crm-btn-outcome crm-btn-won" data-lead-id="${l.id}" data-domain="${l.domain}" data-score="${l.leadScore}" data-outcome="kunde" title="Kunde geworden">✓ Gewonnen</button><button class="crm-btn-outcome crm-btn-lost" data-lead-id="${l.id}" data-domain="${l.domain}" data-score="${l.leadScore}" data-outcome="verloren" title="Lead verloren">✗ Verloren</button>` : ''}
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

    el.innerHTML = html;

    // ── Events (mit AbortController für Cleanup) ──
    // Status-Änderung
    el.addEventListener('change', async (e) => {
        const id = e.target.dataset.leadId;
        if (!id) return;
        if (e.target.dataset.action === 'status') {
            await updateLead(id, { status: e.target.value });
            showToast(`Status → ${STATUS_LABELS[e.target.value] || e.target.value}`);
            // Stats + Pipeline refreshen
            renderCRM(filter, searchQuery);
        }
    }, { signal });

    // Notes (blur + Enter)
    el.addEventListener('blur', async (e) => {
        const id = e.target.dataset.leadId;
        if (id && e.target.dataset.action === 'notes') {
            await updateLead(id, { notes: e.target.value });
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
            await deleteLead(id);
            showToast('Lead gelöscht');
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

    // Outcome-Tracking (Feedback Loop)
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-outcome]');
        if (!btn) return;
        const { leadId, domain, score, outcome } = btn.dataset;
        recordOutcome(domain, parseInt(score), outcome);
        await updateLead(leadId, { status: outcome });
        showToast(outcome === 'kunde' ? 'Glückwunsch! Als Kunde markiert.' : 'Als verloren markiert.');
        renderCRM(filter, searchQuery);
    }, { signal });

    // CSV Export + Alle löschen
    el.addEventListener('click', async (e) => {
        if (e.target.dataset.action === 'export') {
            exportCSV(filtered.length > 0 ? filtered : leads);
            showToast(`${filtered.length || leads.length} Leads exportiert`);
        }
        if (e.target.dataset.action === 'deleteAll') {
            if (!confirm(`Wirklich ALLE ${leads.length} Leads unwiderruflich löschen?`)) return;
            if (!confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) return;
            await deleteAllLeads();
            showToast('Alle Leads gelöscht');
            renderCRM();
        }
    }, { signal });
}

// ── Helpers ──
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
