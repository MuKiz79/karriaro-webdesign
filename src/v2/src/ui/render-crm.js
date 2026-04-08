/**
 * CRM View Renderer
 */
import { loadLeads, updateLead, deleteLead } from '../crm/leads.js';
import { currentUser } from '../crm/firebase.js';

export async function renderCRM(filter = 'alle') {
    const el = document.getElementById('crm-view');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('batch-results').classList.add('hidden');

    if (!currentUser()) {
        el.innerHTML = `<div style="text-align:center;padding:40px"><p style="color:var(--muted);margin-bottom:16px">Bitte zuerst anmelden.</p></div>`;
        el.classList.remove('hidden');
        return;
    }

    el.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;
    el.classList.remove('hidden');

    const leads = await loadLeads();
    const statuses = ['alle','neu','kontaktiert','interessiert','angebot','kunde','verloren'];
    const filtered = filter === 'alle' ? leads : leads.filter(l => l.status === filter);

    const stats = {
        total: leads.length,
        neu: leads.filter(l => l.status === 'neu').length,
        kontaktiert: leads.filter(l => l.status === 'kontaktiert').length,
        kunde: leads.filter(l => l.status === 'kunde').length,
        pipeline: leads.filter(l => ['kontaktiert','interessiert','angebot'].includes(l.status)).reduce((s,l) => s + (l.expectedValue || 0), 0)
    };

    let html = `<h2 style="font-size:1.3rem;font-weight:700;margin-bottom:16px">Lead-CRM</h2>`;

    // Stats
    html += `<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div class="card" style="min-width:100px;text-align:center"><div style="font-size:1.5rem;font-weight:700">${stats.total}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Gesamt</div></div>
        <div class="card" style="min-width:100px;text-align:center"><div style="font-size:1.5rem;font-weight:700;color:var(--orange)">${stats.kontaktiert}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Kontaktiert</div></div>
        <div class="card" style="min-width:100px;text-align:center"><div style="font-size:1.5rem;font-weight:700;color:var(--green)">${stats.kunde}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Kunden</div></div>
        <div class="card" style="min-width:100px;text-align:center"><div style="font-size:1.5rem;font-weight:700;color:var(--accent)">€${Math.round(stats.pipeline)}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Pipeline</div></div>
    </div>`;

    // Filters
    html += `<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">`;
    for (const s of statuses) {
        const count = s === 'alle' ? leads.length : leads.filter(l => l.status === s).length;
        const active = s === filter;
        html += `<button style="padding:6px 14px;font-size:12px;font-weight:600;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};border-radius:8px;background:${active ? 'var(--accent)' : 'var(--card)'};color:${active ? '#fff' : 'var(--muted)'};cursor:pointer" data-filter="${s}">${s.charAt(0).toUpperCase()+s.slice(1)} (${count})</button>`;
    }
    html += `</div>`;

    // Table
    if (filtered.length === 0) {
        html += `<div style="text-align:center;padding:40px;color:var(--muted)">Keine Leads in "${filter}"</div>`;
    } else {
        html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius)">
            <thead><tr><th style="text-align:left;padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Lead</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Score</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Status</th><th style="padding:12px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">Notizen</th><th style="padding:12px;border-bottom:1px solid var(--border)"></th></tr></thead><tbody>`;

        for (const l of filtered) {
            const sc = (l.leadScore || 0) >= 55 ? 'badge-green' : (l.leadScore || 0) >= 30 ? 'badge-orange' : 'badge-red';
            html += `<tr>
                <td style="padding:12px;border-bottom:1px solid var(--border)"><strong>${l.name || l.domain}</strong><br><a href="${l.url}" target="_blank" style="font-size:11px">${l.domain}</a></td>
                <td style="padding:12px;border-bottom:1px solid var(--border)"><span class="badge ${sc}">${l.leadScore || 0}</span></td>
                <td style="padding:12px;border-bottom:1px solid var(--border)"><select style="padding:4px 8px;font-size:11px;border:1px solid var(--border);border-radius:6px" data-lead-id="${l.id}" data-action="status">
                    ${['neu','kontaktiert','interessiert','angebot','kunde','verloren'].map(s => `<option value="${s}" ${l.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
                </select></td>
                <td style="padding:12px;border-bottom:1px solid var(--border)"><input style="width:100%;padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:6px" value="${(l.notes||'').replace(/"/g,'&quot;')}" placeholder="Notiz..." data-lead-id="${l.id}" data-action="notes"></td>
                <td style="padding:12px;border-bottom:1px solid var(--border)"><button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px" data-lead-id="${l.id}" data-action="delete">✕</button></td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    el.innerHTML = html;

    // Event Delegation
    el.addEventListener('change', async (e) => {
        const id = e.target.dataset.leadId;
        if (!id) return;
        if (e.target.dataset.action === 'status') await updateLead(id, { status: e.target.value });
    });
    el.addEventListener('blur', async (e) => {
        const id = e.target.dataset.leadId;
        if (id && e.target.dataset.action === 'notes') await updateLead(id, { notes: e.target.value });
    }, true);
    el.addEventListener('click', async (e) => {
        const id = e.target.dataset.leadId;
        if (id && e.target.dataset.action === 'delete' && confirm('Lead löschen?')) {
            await deleteLead(id);
            renderCRM(filter);
        }
    });
    el.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => renderCRM(btn.dataset.filter));
    });
}
