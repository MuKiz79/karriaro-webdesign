/**
 * Outreach-Studio — Stapel-Review hunderter individueller Entwürfe.
 *
 * Ablauf: openStudio(leads) → Generierung (Fortschritt) → Review-Karten
 * (Tonalität wählen, Betreff/Body editieren, Freigeben/Überspringen) →
 * Versand (Gmail-Entwürfe / .eml / Copy-mailto). Versand ist ASSISTIERT:
 * das Studio erstellt Entwürfe, der Gründer sendet manuell.
 *
 * @module ui/render-outreach
 */

import { generateBulkOutreach } from '../strategy/bulk-outreach.js';
import { updateLead } from '../crm/leads.js';
import { renderCRM } from './render-crm.js';
import { createGmailDrafts } from '../outreach/gmail-drafts.js';
import { exportEml } from '../outreach/eml-export.js';
import { budgetStatus, noteCreated } from '../outreach/send-budget.js';
import { showToast } from './render-components.js';   // geteilter Toast (kein lokales Duplikat)
import { escapeHtml as esc } from '../lib/escape-html.js';

let studioController = null;
let studioResults = [];

const TONE_LABELS = { professionell: 'Professionell', freundlich: 'Freundlich', direkt: 'Direkt' };

/** Einstieg: Leads übernehmen, generieren, Review zeigen.
 *  @param {object[]} leads
 *  @param {{touchNumber?:number}} [opts]  touchNumber>1 → Folge-Entwurf der Sequenz
 */
export async function openStudio(leads, { touchNumber = 1 } = {}) {
    const el = document.getElementById('outreach-view');
    ['results', 'batch-results', 'crm-view', 'error'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    el.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (studioController) studioController.abort();
    studioController = new AbortController();
    const signal = studioController.signal;

    // Delegierte Review-Listener EINMAL pro Studio-Sitzung an den dauerhaften
    // Container binden — NICHT in renderReview, sonst verdoppeln sie sich bei
    // „Alle freigeben" (renderReview läuft erneut) → doppelter Gmail-Versand.
    // Event-Delegation auf #outreach-view greift auch für später gerenderte Karten;
    // alte Sitzungs-Listener entfernt der studioController.abort() oben via signal.
    wireReviewEvents(el, signal);

    el.innerHTML = `
        <div class="studio-header">
            <h2 class="studio-title">Outreach-Studio</h2>
            <button class="crm-btn-export" data-action="back">← Zurück zum CRM</button>
        </div>
        <div class="studio-progress">
            <div class="section-label">Generiere ${leads.length} individuelle Entwürfe…</div>
            <div class="studio-progress-bar"><div class="studio-progress-fill" id="studio-fill" style="width:0%"></div></div>
            <div class="studio-progress-text" id="studio-progress-text">Start…</div>
        </div>`;
    el.querySelector('[data-action="back"]').addEventListener('click', backToCrm, { signal });

    const opts = { allowDeep: true, touchNumber };
    const results = await generateBulkOutreach(leads, opts, (p) => {
        const fill = document.getElementById('studio-fill');
        const txt = document.getElementById('studio-progress-text');
        if (fill) fill.style.width = `${Math.round((p.done / p.total) * 100)}%`;
        if (txt) txt.textContent = p.phase === 'deep'
            ? `KI-Tiefe: ${p.lead}…`
            : `${p.done}/${p.total} — ${p.lead} (${p.status || ''})`;
    });

    // Studio-Status pro Eintrag (ready → 'pending', wartet auf Freigabe)
    for (const r of results) {
        r._sel = 0;
        r._draftStatus = r.outreachStatus === 'ready' ? 'pending' : r.outreachStatus;
    }
    studioResults = results;
    renderReview(el, signal);
}

function backToCrm() {
    if (studioController) studioController.abort();
    document.getElementById('outreach-view')?.classList.add('hidden');
    renderCRM();
}

function renderReview(el, signal) {
    const ready = studioResults.filter(r => r.outreachStatus === 'ready');
    const noContact = studioResults.filter(r => r.outreachStatus === 'no_contact');
    const skippedOrErr = studioResults.filter(r => ['suppressed', 'error'].includes(r.outreachStatus));
    const deepCount = ready.filter(r => r.aiTier === 'deep').length;
    const deferred = ready.filter(r => r.deepDeferred).length;

    let html = `
        <div class="studio-header">
            <h2 class="studio-title">Outreach-Studio</h2>
            <button class="crm-btn-export" data-action="back">← Zurück zum CRM</button>
        </div>
        <div class="studio-summary">
            <span><strong>${ready.length}</strong> entwurfsbereit</span>
            <span>${deepCount} mit KI-Tiefe${deferred ? ` · ${deferred} Deep-Research vertagt (5/h-Limit)` : ''}</span>
            <span>${noContact.length} ohne Kontakt</span>
            ${skippedOrErr.length ? `<span>${skippedOrErr.length} übersprungen</span>` : ''}
        </div>
        <div class="studio-toolbar">
            <button class="btn-primary" data-action="approveAll">Alle freigeben</button>
            <span class="studio-approved-count" id="studio-approved-count"></span>
        </div>
        <div class="studio-cards">`;

    for (const r of ready) html += reviewCardHtml(r);
    html += `</div>`;

    if (noContact.length) {
        html += `<div class="section-label" style="margin:20px 0 8px">Ohne erreichbaren Kontakt (${noContact.length})</div>
            <div class="studio-nocontact">${noContact.map(r => `<div class="studio-nc-item">${esc(r.name || r.domain)} <span>${esc(r.contact?.note || 'kein Impressum-Kontakt')}</span></div>`).join('')}</div>`;
    }

    // UWG-Hinweis (Bulk = höchstes Risiko) + Domain-Schutz-Budget über dem Footer.
    html += `<p class="uwg-note">⚠️ Bulk-Mail an Firmen <strong>ohne deren Einwilligung</strong> ist in DE abmahnfähig (UWG §7) — bevorzugt einzeln, relevant und an Firmen mit mutmaßlichem Interesse. Entwürfe werden NICHT automatisch gesendet.</p>`;

    // Sticky-Footer-Versand
    html += `<div class="studio-footer">
        <div class="studio-footer-info">
            <span id="studio-footer-info">0 freigegeben</span>
            <span class="studio-budget" id="studio-budget"></span>
        </div>
        <div class="studio-footer-actions">
            <button class="btn-primary studio-send-gmail" data-action="gmail">→ Gmail-Entwürfe</button>
            <button class="crm-btn-export" data-action="eml">→ .eml exportieren</button>
        </div>
    </div>`;

    el.innerHTML = html;
    el.querySelector('[data-action="back"]').addEventListener('click', backToCrm, { signal });
    // wireReviewEvents NICHT hier — wird einmalig in openStudio gebunden (Delegation).
    updateApprovedCount(el);
    renderBudgetLine(el);
}

function reviewCardHtml(r) {
    const pack = r.outreachPack;
    const v = pack.variants[r._sel] || pack.primary;
    const score = r.leadScore || 0;
    const scoreColor = score >= 55 ? 'var(--green)' : score >= 30 ? 'var(--orange)' : 'var(--red)';
    const q = r.contact?.quality || 'generisch';
    const qBadge = q === 'persönlich' ? 'Persönlich' : q === 'generisch' ? 'Generisch' : q;
    // Zustellbarkeit (SPF/DKIM/DMARC) wird pro Lead gemessen — hier sichtbar machen
    // statt nur stumm zu persistieren. Fehlt das Signal (Abruf-Fehler), kein Badge.
    const deliv = r.contact?.deliverability || null;
    const delivBadge = deliv?.label
        ? `<span class="studio-badge" title="Zustellbarkeit — SPF ${deliv.spf ? '✓' : '✗'} · DKIM ${deliv.dkim ? '✓' : '✗'} · DMARC ${deliv.dmarc ? '✓' : '✗'}">✉ ${esc(deliv.label)}</span>`
        : '';
    const tierBadge = r.aiTier === 'deep' ? '<span class="studio-badge studio-badge-deep">KI-Tiefe</span>' : '<span class="studio-badge">Light</span>';
    const verdict = r.verifyVerdict;
    const verdictBadge = verdict === 'unklar'
        ? '<span class="studio-badge studio-badge-warn">Befund unsicher</span>' : '';
    const locked = verdict === 'unklar';
    const approved = r._draftStatus === 'approved';
    const skipped = r._draftStatus === 'skipped';

    const toneTabs = pack.variants.map((vv, i) =>
        `<button class="studio-tone-tab${i === r._sel ? ' active' : ''}" data-act="tone" data-id="${r.id}" data-i="${i}">${TONE_LABELS[vv.tone] || vv.tone}</button>`
    ).join('');

    return `<div class="studio-card${approved ? ' is-approved' : ''}${skipped ? ' is-skipped' : ''}" data-card="${r.id}">
        <div class="studio-card-head">
            <div class="studio-card-score" style="color:${scoreColor}">${score}</div>
            <div class="studio-card-id">
                <div class="studio-card-name">${esc(r.name || r.domain)}</div>
                <div class="studio-card-contact">${esc(pack.recipientEmail)} <span class="studio-badge">${qBadge}</span> ${tierBadge} ${delivBadge} ${verdictBadge}</div>
            </div>
            <div class="studio-card-state" data-state="${r.id}">${approved ? '✓ Freigegeben' : skipped ? 'Übersprungen' : ''}</div>
        </div>
        <div class="studio-tone-tabs">${toneTabs}</div>
        <input class="studio-subject" data-act="subject" data-id="${r.id}" value="${esc(v.subject)}" placeholder="Betreff">
        <textarea class="studio-body" data-act="body" data-id="${r.id}" rows="9" placeholder="Text">${esc(v.body)}</textarea>
        ${v.hasVisualMockup ? `<div class="studio-mockup-note">🖼️ Mockup-Entwurf ist in der HTML-Mail eingebettet</div>` : ''}
        <div class="studio-card-actions">
            <button class="studio-approve${approved ? ' active' : ''}" data-act="approve" data-id="${r.id}" ${locked ? 'disabled title="Befund unsicher — nicht freigebbar"' : ''}>${approved ? '✓ Freigegeben' : 'Freigeben'}</button>
            <button class="studio-skip" data-act="skip" data-id="${r.id}">Überspringen</button>
            <button class="studio-copy" data-act="copy" data-id="${r.id}">Kopieren</button>
            <a class="studio-mailto" data-act="mailto" data-id="${r.id}" href="${mailtoHref(r)}">In E-Mail öffnen</a>
        </div>
    </div>`;
}

function mailtoHref(r) {
    const v = r.outreachPack.variants[r._sel] || r.outreachPack.primary;
    // mailto:-URLs sind je nach Client/OS auf ~2000 Zeichen begrenzt; lange Bodies
    // (inkl. angehängtem Opt-out) würden sonst stumm abgeschnitten. Klartext deckeln
    // und auf „Kopieren" verweisen — Gmail-/.eml-Versand bleibt davon unberührt.
    const MAX_BODY = 1500;
    const body = v.body.length > MAX_BODY
        ? v.body.slice(0, MAX_BODY) + '\n\n[…] — vollständigen Text über „Kopieren" einfügen.'
        : v.body;
    return `mailto:${encodeURIComponent(r.outreachPack.recipientEmail)}?subject=${encodeURIComponent(v.subject)}&body=${encodeURIComponent(body)}`;
}

function findResult(id) { return studioResults.find(r => r.id === id); }

function syncVariant(r) {
    const v = r.outreachPack.variants[r._sel];
    if (!v) return;
    v.copyText = `Betreff: ${v.subject}\n\n${v.body}`;
    // Der edierte Klartext ist maßgeblich. Den vorgefertigten HTML-Teil verwerfen —
    // sonst zeigt der Mail-Client (multipart/alternative bevorzugt text/html) die
    // UNgeänderte Fassung. buildMimeMessage baut text/html dann aus v.body neu auf
    // (Pflicht-Bestandteile inkl. Opt-out stehen bereits im Klartext-Body). Ein
    // visuelles Mockup entfällt bei manueller Bearbeitung — gesendet = was angezeigt wird.
    v.bodyHtml = '';
    // Mockup-Flag mitziehen, sonst behauptet die Karte beim nächsten Re-Render
    // weiter „Mockup eingebettet", obwohl der regenerierte HTML-Teil keins mehr hat.
    v.hasVisualMockup = false;
}

function wireReviewEvents(el, signal) {
    // Tonalität wechseln
    el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act="tone"]');
        if (!btn) return;
        const r = findResult(btn.dataset.id);
        if (!r) return;
        r._sel = parseInt(btn.dataset.i, 10) || 0;
        rerenderCard(el, r, signal);
    }, { signal });

    // Edit Betreff/Body (in-place in die gewählte Variante schreiben)
    el.addEventListener('input', (e) => {
        const t = e.target;
        const id = t.dataset.id;
        if (!id) return;
        const r = findResult(id);
        if (!r) return;
        const v = r.outreachPack.variants[r._sel];
        if (t.dataset.act === 'subject') { v.subject = t.value; syncVariant(r); }
        if (t.dataset.act === 'body') { v.body = t.value; syncVariant(r); }
        const link = el.querySelector(`a[data-act="mailto"][data-id="${id}"]`);
        if (link) link.href = mailtoHref(r);
    }, { signal });

    // Freigeben / Überspringen / Copy
    el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        const r = findResult(btn.dataset.id);
        if (!r) return;
        if (act === 'approve') { r._draftStatus = r._draftStatus === 'approved' ? 'pending' : 'approved'; rerenderCard(el, r, signal); updateApprovedCount(el); }
        if (act === 'skip') { r._draftStatus = 'skipped'; rerenderCard(el, r, signal); updateApprovedCount(el); }
        if (act === 'copy') {
            const v = r.outreachPack.variants[r._sel];
            navigator.clipboard.writeText(v.copyText).then(() => { btn.textContent = 'Kopiert ✓'; setTimeout(() => { btn.textContent = 'Kopieren'; }, 1500); });
        }
    }, { signal });

    // Alle freigeben
    el.addEventListener('click', (e) => {
        if (e.target.dataset.action !== 'approveAll') return;
        for (const r of studioResults) {
            if (r.outreachStatus === 'ready' && r.verifyVerdict !== 'unklar') r._draftStatus = 'approved';
        }
        renderReview(el, signal);
    }, { signal });

    // Versand
    el.addEventListener('click', async (e) => {
        if (e.target.dataset.action === 'gmail') return sendViaGmail(el);
        if (e.target.dataset.action === 'eml') return sendViaEml(el);
    }, { signal });
}

function approvedDrafts() {
    return studioResults
        .filter(r => r._draftStatus === 'approved' && r.outreachStatus === 'ready')
        .map(r => {
            const v = r.outreachPack.variants[r._sel] || r.outreachPack.primary;
            return { id: r.id, domain: r.domain, to: r.outreachPack.recipientEmail, subject: v.subject, body: v.body, bodyHtml: v.bodyHtml };
        });
}

function updateApprovedCount(el) {
    const n = studioResults.filter(r => r._draftStatus === 'approved').length;
    const info = el.querySelector('#studio-footer-info');
    if (info) info.textContent = `${n} freigegeben`;
    const cnt = el.querySelector('#studio-approved-count');
    if (cnt) cnt.textContent = n ? `${n} freigegeben` : '';
}

// Domain-Schutz: heute empfohlenes Restvolumen sichtbar machen (Warmlauf-Rampe).
function renderBudgetLine(el) {
    const b = budgetStatus();
    const node = el.querySelector('#studio-budget');
    if (!node) return;
    node.textContent = b.remaining > 0
        ? `· Domain-Schutz: heute noch ~${b.remaining} von ${b.cap} empfohlen`
        : `· Tagesempfehlung erreicht (${b.cap}) — morgen weiter, Domain schonen`;
    node.classList.toggle('is-maxed', b.remaining <= 0);
}

// Volumen-Gate vor dem Versand: bei Überschreitung der Tagesempfehlung nachfragen
// (kein harter Block — der Gründer entscheidet das Risiko). true = fortfahren.
function confirmVolume(count) {
    const b = budgetStatus();
    if (count <= b.remaining) return true;
    return window.confirm(
        `Du gibst ${count} Entwürfe frei. Für den Schutz deiner Domain-Reputation sind heute noch ` +
        `~${b.remaining} empfohlen (max. ${b.cap}/Tag im Warmlauf).\n\n` +
        `Zu viele Kalt-Mails auf einmal → Spam-Markierung, schlechtere Zustellbarkeit auch für deine ` +
        `echten Mails, und bei Kalt-Mail an DE-Firmen UWG-§7-Risiko.\n\n` +
        `Trotzdem alle ${count} Entwürfe erstellen?`
    );
}

// Re-rendert nur eine Karte (vermeidet Full-Re-Render → Edit-Fokus bleibt erhalten)
function rerenderCard(el, r, signal) {
    const card = el.querySelector(`[data-card="${r.id}"]`);
    if (!card) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = reviewCardHtml(r);
    card.replaceWith(wrap.firstElementChild);
}

async function markApprovedContacted() {
    // Entwurf erstellt → Status 'outreach_bereit' (echter Versand bleibt manuell in Gmail).
    const drafts = approvedDrafts();
    await Promise.all(drafts.map(d => updateLead(d.id, { status: 'outreach_bereit' }).catch(() => null)));
}

async function sendViaGmail(el) {
    const drafts = approvedDrafts();
    if (!drafts.length) { showToast('Keine freigegebenen Entwürfe.'); return; }
    if (!confirmVolume(drafts.length)) return;
    const btn = el.querySelector('[data-action="gmail"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Erstelle Entwürfe…'; }
    try {
        const res = await createGmailDrafts(drafts, (done, total) => {
            if (btn) btn.textContent = `Gmail-Entwürfe ${done}/${total}…`;
        });
        noteCreated(res.created);
        renderBudgetLine(el);
        await markApprovedContacted();
        showToast(`${res.created} Gmail-Entwürfe erstellt${res.failed ? `, ${res.failed} fehlgeschlagen` : ''}. Prüfen & senden in Gmail.`);
    } catch (err) {
        showToast(`Gmail-Versand fehlgeschlagen: ${err.message}. Nutzen Sie den .eml-Export.`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '→ Gmail-Entwürfe'; }
    }
}

async function sendViaEml(el) {
    const drafts = approvedDrafts();
    if (!drafts.length) { showToast('Keine freigegebenen Entwürfe.'); return; }
    if (!confirmVolume(drafts.length)) return;
    exportEml(drafts);
    noteCreated(drafts.length);
    renderBudgetLine(el);
    await markApprovedContacted();
    showToast(`${drafts.length} Entwürfe als .eml exportiert.`);
}
