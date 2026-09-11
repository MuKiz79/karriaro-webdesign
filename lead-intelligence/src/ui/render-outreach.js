/**
 * Outreach-Studio — Stapel-Review individueller Entwürfe.
 *
 * Ablauf: openStudio(leads) → Generierung (Fortschritt) → Review-Karten
 * (Tonalität wählen, Betreff/Text editieren, Freigeben/Überspringen) →
 * Versand (Gmail-Entwürfe / .mbox / Copy-mailto). Versand ist ASSISTIERT:
 * das Studio erstellt Entwürfe, der Gründer sendet manuell.
 *
 * Kontakt-Gate an JEDEM Ausgang (2026-09-10): Freigabe, „Alle freigeben",
 * Kopieren, mailto, Gmail-Entwürfe, .mbox und „Versendet" prüfen die Grundlage
 * erneut (pruefeMailErlaubnis). Vor Gmail/.mbox/„Versendet" werden Einwilligungen
 * und Sperrliste frisch geladen — ein Widerruf seit der Erzeugung zählt.
 * Leads ohne Grundlage erscheinen mit Grund in einer eigenen Liste; ihre Analyse
 * bleibt im CRM nutzbar.
 *
 * Der Pflichtteil (Absender, Herkunft, Abmeldung, Widerspruchshinweis) ist nicht
 * editierbar: die Textbox bearbeitet nur den Kern, `body` wird immer aus beidem
 * zusammengesetzt (setzeVarianteZusammen).
 *
 * @module ui/render-outreach
 */

import { generateBulkOutreach } from '../strategy/bulk-outreach.js';
import { updateLead, KONTAKT_GRUNDLAGE_LABELS } from '../crm/leads.js';
import { renderCRM } from './render-crm.js';
import { createGmailDrafts } from '../outreach/gmail-drafts.js';
import { exportEml } from '../outreach/eml-export.js';
import { showToast } from './render-components.js';   // geteilter Toast (kein lokales Duplikat)
import { logSent } from '../learning/ab-test.js';
import { escapeHtml as esc } from '../lib/escape-html.js';
import { config, absender } from '../config.js';
import { pruefeMailErlaubnis, nurMitGrundlage, RECHTSHINWEISE } from '../outreach/kontakt-grundlage.js';
import { ladeEinwilligungenMitStatus, stoppeSequenz } from '../crm/consents.js';
import { loadSuppression, isSuppressed, addSuppression, normalizeDomain } from '../crm/suppression.js';
import { setzeVarianteZusammen } from '../strategy/compliance.js';
import { baueMailtoHref } from '../outreach/mime.js';

let studioController = null;
let studioResults = [];
let studioKontext = { einwilligungen: [], einwilligungenGeladen: false, sperre: new Set(), touchNumber: 1 };

const TONE_LABELS = { professionell: 'Professionell', freundlich: 'Freundlich', direkt: 'Direkt' };

function selektorId(id) {
    return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(id)) : String(id).replace(/["\\]/g, '\\$&');
}

/** Einwilligungen + Sperrliste (frisch) in den Studio-Kontext laden. */
async function ladeKontext(touchNumber = studioKontext.touchNumber) {
    const [status, sperre] = await Promise.all([ladeEinwilligungenMitStatus(), loadSuppression()]);
    if (!status.geladen) console.warn('Einwilligungen nicht lesbar — Double-Opt-In-Entwürfe bleiben gesperrt:', status.fehler);
    studioKontext = { einwilligungen: status.einwilligungen, einwilligungenGeladen: status.geladen, sperre, touchNumber };
    return studioKontext;
}

function aktuellePruefung(r) {
    return pruefeMailErlaubnis(r, {
        einwilligungen: studioKontext.einwilligungen,
        einwilligungenGeladen: studioKontext.einwilligungenGeladen,
        gesperrt: r.suppressed === true || isSuppressed(r.domain, studioKontext.sperre),
        kanal: 'email'
    });
}

/**
 * Darf dieser Entwurf JETZT hinaus? Gate + Empfänger + Übereinstimmung mit dem
 * Pflichtteil, der beim Erzeugen eingesetzt wurde (Herkunftssatz, Abmeldelink).
 */
function ausgangsPruefung(r) {
    if (r.outreachStatus !== 'ready' || !r.outreachPack?.complianceApplied) {
        return { erlaubt: false, grund: 'Kein versandfähiger Entwurf.' };
    }
    const p = aktuellePruefung(r);
    if (!p.erlaubt) return p;
    const beiErzeugung = r.outreachPack.grundlage || {};
    if (p.grundlage !== beiErzeugung.grundlage || (p.einwilligung?.id || null) !== (beiErzeugung.einwilligung?.id || null)) {
        return { ...p, erlaubt: false, grund: 'Die Kontaktgrundlage hat sich seit der Erzeugung geändert — Entwurf bitte neu erzeugen, damit der Pflichtteil stimmt.' };
    }
    const empfaenger = r.outreachPack.recipientEmail || null;
    if (!empfaenger) return { ...p, erlaubt: false, grund: 'Kein Empfänger gefunden.' };
    if (p.grundlage === 'doi' && p.empfaenger !== empfaenger) {
        return { ...p, erlaubt: false, grund: 'Der Empfänger ist nicht die eingewilligte Adresse — Entwurf bitte neu erzeugen.' };
    }
    return { ...p, empfaenger };
}

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
            <h2 class="studio-title">Outreach-Studio${touchNumber > 1 ? ` · Folge-Entwurf (Schritt ${touchNumber})` : ''}</h2>
            <button class="crm-btn-export" data-action="back">← Zurück zum CRM</button>
        </div>
        <div class="studio-progress">
            <div class="section-label">Prüfe Kontaktgrundlagen und erzeuge Entwürfe für ${leads.length} Leads…</div>
            <div class="studio-progress-bar"><div class="studio-progress-fill" id="studio-fill" style="width:0%"></div></div>
            <div class="studio-progress-text" id="studio-progress-text">Start…</div>
        </div>`;
    el.querySelector('[data-action="back"]').addEventListener('click', backToCrm, { signal });

    await ladeKontext(touchNumber);
    const opts = {
        allowDeep: true, touchNumber,
        einwilligungen: studioKontext.einwilligungen,
        einwilligungenGeladen: studioKontext.einwilligungenGeladen
    };
    const results = await generateBulkOutreach(leads, opts, (p) => {
        const fill = document.getElementById('studio-fill');
        const txt = document.getElementById('studio-progress-text');
        if (fill) fill.style.width = `${Math.round((p.done / p.total) * 100)}%`;
        if (txt) txt.textContent = p.phase === 'deep'
            ? `KI-Tiefe: ${p.lead}…`
            : `${p.done}/${p.total} — ${p.lead} (${p.status || ''})`;
    });
    if (signal.aborted) return;

    // Studio-Status pro Eintrag (ready → 'pending', wartet auf Freigabe)
    for (const r of results) {
        r._sel = 0;
        r._draftStatus = r.outreachStatus === 'ready' ? 'pending' : r.outreachStatus;
    }
    studioResults = results;

    // Ein bei der Anreicherung gefundener Werbewiderspruch gehört an den Lead —
    // leads.js trägt die Domain dabei zusätzlich in die Sperrliste ein.
    for (const r of results.filter(x => x.werbewiderspruch && x.id)) {
        updateLead(r.id, { contactData: { werbewiderspruch: true } })
            .catch(e => console.error(`Werbewiderspruch an ${r.domain} nicht gespeichert:`, e));
    }

    renderReview(el, signal);
}

function backToCrm() {
    if (studioController) studioController.abort();
    document.getElementById('outreach-view')?.classList.add('hidden');
    renderCRM();
}

function listeHtml(titel, eintraege, textFn, hinweis = '') {
    if (!eintraege.length) return '';
    return `<div class="section-label" style="margin:20px 0 8px">${titel} (${eintraege.length})</div>
        ${hinweis ? `<p class="uwg-note" style="margin:0 0 8px">${esc(hinweis)}</p>` : ''}
        <div class="studio-nocontact">${eintraege.map(r => `<div class="studio-nc-item">${esc(r.name || r.domain)} <span>${esc(textFn(r))}</span></div>`).join('')}</div>`;
}

function renderReview(el, signal) {
    const ready = studioResults.filter(r => r.outreachStatus === 'ready');
    const ohneGrundlage = studioResults.filter(r => r.outreachStatus === 'no_basis');
    const noContact = studioResults.filter(r => r.outreachStatus === 'no_contact');
    const gesperrt = studioResults.filter(r => r.outreachStatus === 'suppressed');
    const fehler = studioResults.filter(r => r.outreachStatus === 'error');
    const deepCount = ready.filter(r => r.aiTier === 'deep').length;
    const deferred = ready.filter(r => r.deepDeferred).length;

    let html = `
        <div class="studio-header">
            <h2 class="studio-title">Outreach-Studio${studioKontext.touchNumber > 1 ? ` · Folge-Entwurf (Schritt ${studioKontext.touchNumber})` : ''}</h2>
            <button class="crm-btn-export" data-action="back">← Zurück zum CRM</button>
        </div>
        <div class="studio-summary">
            <span><strong>${ready.length}</strong> entwurfsbereit</span>
            <span>${deepCount} mit KI-Tiefe${deferred ? ` · ${deferred} Deep-Research vertagt (5/h-Limit)` : ''}</span>
            <span>${ohneGrundlage.length} ohne Kontaktgrundlage</span>
            <span>${noContact.length} ohne Kontakt</span>
            ${gesperrt.length ? `<span>${gesperrt.length} gesperrt</span>` : ''}
            ${fehler.length ? `<span>${fehler.length} übersprungen</span>` : ''}
        </div>
        <p class="uwg-note">E-Mails gehen nur mit Kontaktgrundlage hinaus: bestätigtes Double-Opt-In, dokumentierte Anfrage des Betriebs oder Bestandskunde. Jeder Entwurf trägt Absender, Herkunft, Abmeldung und den Widerspruchshinweis — dieser Pflichtteil ist nicht editierbar.${studioKontext.einwilligungenGeladen ? '' : ' Einwilligungen sind gerade nicht lesbar — Double-Opt-In-Entwürfe bleiben gesperrt.'}</p>
        <div class="studio-toolbar">
            <button class="btn-primary" data-action="approveAll">Alle zulässigen freigeben</button>
            <span class="studio-approved-count" id="studio-approved-count"></span>
        </div>
        <div class="studio-cards">`;

    for (const r of ready) html += reviewCardHtml(r);
    html += `</div>`;

    html += listeHtml('Ohne Kontaktgrundlage', ohneGrundlage, r => r.kontaktPruefung?.grund || 'Keine Kontaktgrundlage.',
        `${RECHTSHINWEISE.email} Die Analyse bleibt im CRM nutzbar; ein Brief ist ohne Einwilligung zulässig, solange kein Widerspruch vorliegt.`);
    html += listeHtml('Ohne erreichbaren Kontakt', noContact, r => r.contact?.note || 'kein Impressum-Kontakt');
    html += listeHtml('Gesperrt', gesperrt, r => r.kontaktPruefung?.grund || 'Auf der Sperrliste.');

    // Sticky-Footer-Versand
    html += `<div class="studio-footer">
        <div class="studio-footer-info" id="studio-footer-info">0 freigegeben</div>
        <div class="studio-footer-actions">
            <button class="btn-primary studio-send-gmail" data-action="gmail">→ Gmail-Entwürfe</button>
            <button class="crm-btn-export" data-action="eml">→ .mbox exportieren</button>
            <button class="crm-btn-export" data-action="sent" title="Erst klicken, wenn die Mails in Gmail tatsächlich RAUS sind — setzt Status „Kontaktiert“, startet die Nachfass-Kadenz, zählt die Pitch-Variante und bei Double-Opt-In die versandten E-Mails">✓ Versendet</button>
        </div>
    </div>`;

    el.innerHTML = html;
    el.querySelector('[data-action="back"]').addEventListener('click', backToCrm, { signal });
    // wireReviewEvents NICHT hier — wird einmalig in openStudio gebunden (Delegation).
    updateApprovedCount(el);
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

    const ap = ausgangsPruefung(r);
    const grundlageBadge = ap.erlaubt
        ? `<span class="studio-badge">${esc(KONTAKT_GRUNDLAGE_LABELS[ap.grundlage] || ap.grundlage)}</span>`
        : '<span class="studio-badge studio-badge-warn">Gesperrt</span>';
    const sperrGrund = verdict === 'unklar' ? 'Befund unsicher — nicht freigebbar' : (ap.erlaubt ? '' : ap.grund);
    const locked = !!sperrGrund;
    const approved = r._draftStatus === 'approved';
    const skipped = r._draftStatus === 'skipped';
    const aus = 'style="opacity:.45;cursor:not-allowed"';

    const toneTabs = pack.variants.map((vv, i) =>
        `<button class="studio-tone-tab${i === r._sel ? ' active' : ''}" data-act="tone" data-id="${esc(r.id)}" data-i="${i}">${TONE_LABELS[vv.tone] || esc(vv.tone)}</button>`
    ).join('');

    const href = mailtoHref(r);
    const mailto = href
        ? `<a class="studio-mailto" data-act="mailto" data-id="${esc(r.id)}" href="${esc(href)}">In E-Mail öffnen</a>`
        : `<span class="studio-mailto" data-act="mailto" data-id="${esc(r.id)}" aria-disabled="true" ${aus} title="${esc(ap.erlaubt ? 'Text zu lang für einen mailto-Link — bitte kopieren' : ap.grund)}">In E-Mail öffnen</span>`;

    return `<div class="studio-card${approved ? ' is-approved' : ''}${skipped ? ' is-skipped' : ''}" data-card="${esc(r.id)}">
        <div class="studio-card-head">
            <div class="studio-card-score" style="color:${scoreColor}">${score}</div>
            <div class="studio-card-id">
                <div class="studio-card-name">${esc(r.name || r.domain)}</div>
                <div class="studio-card-contact">${esc(pack.recipientEmail || 'kein Empfänger')} <span class="studio-badge">${esc(qBadge)}</span> ${grundlageBadge} ${tierBadge} ${delivBadge} ${verdictBadge}</div>
            </div>
            <div class="studio-card-state" data-state="${esc(r.id)}">${approved ? '✓ Freigegeben' : skipped ? 'Übersprungen' : ''}</div>
        </div>
        <div class="studio-mockup-note">${ap.erlaubt ? `Grundlage: ${esc(ap.grund)}${ap.hinweis ? ` · ${esc(ap.hinweis)}` : ''}` : `Nicht zulässig: ${esc(ap.grund)}`}</div>
        <div class="studio-tone-tabs">${toneTabs}</div>
        <input class="studio-subject" data-act="subject" data-id="${esc(r.id)}" value="${esc(v.subject)}" placeholder="Betreff">
        <textarea class="studio-body" data-act="body" data-id="${esc(r.id)}" rows="9" placeholder="Text">${esc(v.textKern ?? v.body)}</textarea>
        <div class="studio-mockup-note" style="white-space:pre-wrap">Pflichtteil — wird angehängt, nicht editierbar:${esc(v.pflichtteil?.text || '')}</div>
        ${v.hasVisualMockup ? `<div class="studio-mockup-note">🖼️ Mockup-Entwurf ist in der HTML-Mail eingebettet</div>` : ''}
        <div class="studio-card-actions">
            <button class="studio-approve${approved ? ' active' : ''}" data-act="approve" data-id="${esc(r.id)}" ${locked && !approved ? `disabled title="${esc(sperrGrund)}"` : ''}>${approved ? '✓ Freigegeben' : 'Freigeben'}</button>
            <button class="studio-skip" data-act="skip" data-id="${esc(r.id)}">Überspringen</button>
            <button class="studio-copy" data-act="copy" data-id="${esc(r.id)}" ${ap.erlaubt ? '' : `disabled ${aus} title="${esc(ap.grund)}"`}>Kopieren</button>
            ${mailto}
            <button class="studio-skip" data-act="optout" data-id="${esc(r.id)}" title="Domain sperren${pack.grundlage?.einwilligung ? ', Nachfass-Strecke der Einwilligung stoppen' : ''} und Lead auf „Verloren" setzen">Abgemeldet / kein Interesse</button>
            <button class="studio-skip" data-act="bounced" data-id="${esc(r.id)}" title="Domain sperren">Unzustellbar</button>
        </div>
    </div>`;
}

/** mailto nur mit erlaubter Prüfung; der Pflichtteil wird nie abgeschnitten. */
function mailtoHref(r) {
    const ap = ausgangsPruefung(r);
    if (!ap.erlaubt) return null;
    const v = r.outreachPack.variants[r._sel] || r.outreachPack.primary;
    return baueMailtoHref({ to: ap.empfaenger, subject: v.subject, kern: v.textKern ?? v.body, pflicht: v.pflichtteil?.text || '' });
}

function findResult(id) { return studioResults.find(r => String(r.id) === String(id)); }

function syncVariant(r) {
    const v = r.outreachPack.variants[r._sel];
    if (!v) return;
    // Kern + Pflichtteil neu zusammensetzen — der Pflichtteil bleibt immer dran.
    setzeVarianteZusammen(v);
    // Der edierte Klartext ist maßgeblich. Den vorgefertigten HTML-Teil verwerfen —
    // sonst zeigt der Mail-Client (multipart/alternative bevorzugt text/html) die
    // UNgeänderte Fassung. buildMimeMessage baut text/html dann aus v.body neu auf
    // (der Pflichtteil steht im Klartext-Body). Ein visuelles Mockup entfällt bei
    // manueller Bearbeitung — gesendet = was angezeigt wird.
    v.bodyHtml = '';
    // Mockup-Flag mitziehen, sonst behauptet die Karte beim nächsten Re-Render
    // weiter „Mockup eingebettet", obwohl der regenerierte HTML-Teil keins mehr hat.
    v.hasVisualMockup = false;
}

async function sperreAusStudio(el, r, act, signal) {
    const abgemeldet = act === 'optout';
    const einwilligungId = r.outreachPack?.grundlage?.einwilligung?.id || null;
    const name = r.name || r.domain;
    const frage = abgemeldet
        ? `${name} als abgemeldet / kein Interesse eintragen?\n\nDie Domain wird gesperrt${einwilligungId ? ', die Nachfass-Strecke der Einwilligung gestoppt' : ''} und der Lead auf „Verloren" gesetzt.`
        : `${name} als unzustellbar sperren?\n\nDie Domain wird über keinen Kanal mehr kontaktiert.`;
    if (!window.confirm(frage)) return;

    const sp = await addSuppression(r.domain, abgemeldet ? 'opt_out' : 'bounced');
    if (!sp?.ok) { showToast('Sperre nicht eingetragen — die Domain fehlt.'); return; }
    const hinweise = [];
    if (sp.firestoreSynced === false) hinweise.push('Sperre nur lokal gespeichert');
    studioKontext.sperre.add(normalizeDomain(r.domain));
    r.suppressed = true;
    r.outreachStatus = 'suppressed';
    r._draftStatus = 'suppressed';
    r.kontaktPruefung = aktuellePruefung(r);

    if (abgemeldet && einwilligungId) {
        const s = await stoppeSequenz(einwilligungId);
        if (!s.ok) hinweise.push(`Nachfass-Strecke nicht gestoppt: ${s.fehler}`);
    }
    if (abgemeldet && r.id) {
        const u = await updateLead(r.id, { status: 'verloren', verlustGrund: 'kein_interesse' })
            .catch(e => { console.error('Lead-Status nach Abmeldung:', e); return null; });
        if (!u) hinweise.push('Lead-Status nicht geändert');
    }
    renderReview(el, signal);
    showToast(`${name} gesperrt${hinweise.length ? ` (${hinweise.join('; ')})` : ''}.`);
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

    // Edit Betreff/Kern (in-place in die gewählte Variante schreiben)
    el.addEventListener('input', (e) => {
        const t = e.target;
        const id = t.dataset.id;
        if (!id) return;
        const r = findResult(id);
        if (!r) return;
        const v = r.outreachPack.variants[r._sel];
        if (!v) return;
        if (t.dataset.act === 'subject') { v.subject = t.value; syncVariant(r); }
        if (t.dataset.act === 'body') { v.textKern = t.value; syncVariant(r); }
        const link = el.querySelector(`a[data-act="mailto"][data-id="${selektorId(id)}"]`);
        if (link) {
            const h = mailtoHref(r);
            if (h) link.href = h; else link.removeAttribute('href');
        }
    }, { signal });

    // Freigeben / Überspringen / Kopieren / mailto / Sperren
    el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'tone') return;
        const r = findResult(btn.dataset.id);
        if (!r) return;

        if (act === 'mailto') {
            const ap = ausgangsPruefung(r);
            if (!ap.erlaubt || !btn.getAttribute('href')) {
                e.preventDefault();
                showToast(ap.erlaubt ? 'Text zu lang für einen mailto-Link — bitte „Kopieren" nutzen.' : `Nicht zulässig: ${ap.grund}`);
            }
            return;
        }
        if (act === 'approve') {
            if (r._draftStatus !== 'approved') {
                const ap = ausgangsPruefung(r);
                if (!ap.erlaubt || r.verifyVerdict === 'unklar') {
                    showToast(`Nicht freigegeben: ${r.verifyVerdict === 'unklar' ? 'Befund unsicher.' : ap.grund}`);
                    rerenderCard(el, r, signal);
                    return;
                }
                r._draftStatus = 'approved';
            } else {
                r._draftStatus = 'pending';
            }
            rerenderCard(el, r, signal);
            updateApprovedCount(el);
        }
        if (act === 'skip') { r._draftStatus = 'skipped'; rerenderCard(el, r, signal); updateApprovedCount(el); }
        if (act === 'copy') {
            const ap = ausgangsPruefung(r);
            if (!ap.erlaubt) { showToast(`Nicht zulässig: ${ap.grund}`); return; }
            const v = r.outreachPack.variants[r._sel];
            navigator.clipboard.writeText(v.copyText)
                .then(() => { btn.textContent = 'Kopiert ✓'; setTimeout(() => { btn.textContent = 'Kopieren'; }, 1500); })
                .catch(err => console.warn('Zwischenablage nicht verfügbar:', err));
        }
        if (act === 'optout' || act === 'bounced') await sperreAusStudio(el, r, act, signal);
    }, { signal });

    // Alle zulässigen freigeben
    el.addEventListener('click', (e) => {
        if (e.target.dataset.action !== 'approveAll') return;
        let ausgelassen = 0;
        for (const r of studioResults) {
            if (r.outreachStatus !== 'ready' || r.verifyVerdict === 'unklar') continue;
            if (ausgangsPruefung(r).erlaubt) r._draftStatus = 'approved';
            else ausgelassen++;
        }
        renderReview(el, signal);
        if (ausgelassen) showToast(`${ausgelassen} Entwürfe ohne gültige Grundlage nicht freigegeben.`);
    }, { signal });

    // Versand
    el.addEventListener('click', async (e) => {
        if (e.target.dataset.action === 'gmail') return sendViaGmail(el, signal);
        if (e.target.dataset.action === 'eml') return sendViaEml(el, signal);
        if (e.target.dataset.action === 'sent') return markAsSent(el, signal);
    }, { signal });
}

/** Freigegebene Entwürfe inkl. frischer Prüfung — die Ausgänge filtern mit nurMitGrundlage. */
function approvedDrafts() {
    const von = absender(config.profile);
    return studioResults
        .filter(r => r._draftStatus === 'approved' && r.outreachStatus === 'ready')
        .map(r => {
            const v = r.outreachPack.variants[r._sel] || r.outreachPack.primary;
            const ap = ausgangsPruefung(r);
            // `variant` = die TONALITÄT (v.tone), nicht der Index _sel — sonst
            // landeten Zahlen im A/B-Test und die Zählung liefe still ins Leere.
            return {
                id: r.id, domain: r.domain,
                to: ap.erlaubt ? ap.empfaenger : null,
                subject: v.subject, body: v.body, bodyHtml: v.bodyHtml,
                variant: v.tone || null,
                from: { name: von.name, email: von.email },
                listUnsubscribe: r.outreachPack.listUnsubscribe || null,
                grundlage: ap,
                einwilligungId: ap.erlaubt ? (ap.einwilligung?.id || null) : null
            };
        });
}

function updateApprovedCount(el) {
    const n = studioResults.filter(r => r._draftStatus === 'approved').length;
    const info = el.querySelector('#studio-footer-info');
    if (info) info.textContent = `${n} freigegeben`;
    const cnt = el.querySelector('#studio-approved-count');
    if (cnt) cnt.textContent = n ? `${n} freigegeben` : '';
}

// Re-rendert nur eine Karte (vermeidet Full-Re-Render → Edit-Fokus bleibt erhalten)
function rerenderCard(el, r, signal) {
    const card = el.querySelector(`[data-card="${selektorId(r.id)}"]`);
    if (!card) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = reviewCardHtml(r);
    card.replaceWith(wrap.firstElementChild);
}

/** Frisch geladene Grundlagen → zulässige und blockierte Entwürfe. */
async function zulaessigeEntwuerfe() {
    await ladeKontext();
    const alle = approvedDrafts();
    const { erlaubt, blockiert } = nurMitGrundlage(alle);
    return { alle, erlaubt, blockiert };
}

async function markApprovedContacted(drafts) {
    // Entwurf erstellt → Status 'outreach_bereit' (echter Versand bleibt manuell in Gmail).
    // Die gewählte Pitch-Variante wird HIER mitgespeichert, damit eine spätere
    // Antwort sie in learning/ab-test.js der richtigen Variante zuordnen kann.
    await Promise.all(drafts.map(d =>
        updateLead(d.id, { status: 'outreach_bereit', pitchVariant: d.variant || null })
            .catch(e => { console.error(`Status für ${d.domain} nicht gesetzt:`, e); return null; })));
}

/**
 * „Versendet" — bestätigt den tatsächlichen Versand und schließt die Messkette:
 * Status 'kontaktiert' (→ contactedAt, Nachfass-Kadenz), A/B-Datenpunkt und bei
 * Double-Opt-In der Zähler je Einwilligung (die Einwilligung deckt höchstens drei
 * E-Mails; das Gate zählt Server-Sequenz und Studio-Versand zusammen).
 */
async function markAsSent(el, signal) {
    const btn = el.querySelector('[data-action="sent"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Wird erfasst…'; }
    try {
        const { alle, erlaubt, blockiert } = await zulaessigeEntwuerfe();
        if (!alle.length) { showToast('Keine freigegebenen Entwürfe.'); return; }
        let n = 0, schonErfasst = 0;
        for (const d of erlaubt) {
            const r = findResult(d.id);
            if (r?._versandErfasst) { schonErfasst++; continue; }
            const updates = { status: 'kontaktiert', pitchVariant: d.variant || null };
            if (d.einwilligungId && r) {
                const zaehler = { ...(r.einwilligungsMails || {}) };
                zaehler[d.einwilligungId] = (Number(zaehler[d.einwilligungId]) || 0) + 1;
                updates.einwilligungsMails = zaehler;
            }
            const u = await updateLead(d.id, updates).catch(e => { console.error(`Versand für ${d.domain} nicht erfasst:`, e); return null; });
            if (u) {
                n++;
                if (r) {
                    r._versandErfasst = true;
                    if (updates.einwilligungsMails) r.einwilligungsMails = updates.einwilligungsMails;
                }
                if (d.variant) logSent(d.variant);
            }
        }
        renderReview(el, signal);
        const teile = [`${n} als versendet erfasst`];
        if (schonErfasst) teile.push(`${schonErfasst} waren schon erfasst`);
        if (blockiert.length) teile.push(`${blockiert.length} ohne gültige Grundlage nicht erfasst`);
        showToast(`${teile.join(', ')}.`);
    } finally {
        const b = el.querySelector('[data-action="sent"]');
        if (b) { b.disabled = false; b.textContent = '✓ Versendet'; }
    }
}

async function sendViaGmail(el, signal) {
    const btn = el.querySelector('[data-action="gmail"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Prüfe Grundlagen…'; }
    try {
        const { alle, erlaubt, blockiert } = await zulaessigeEntwuerfe();
        if (!alle.length) { showToast('Keine freigegebenen Entwürfe.'); return; }
        if (!erlaubt.length) { renderReview(el, signal); showToast(`Keine zulässigen Entwürfe — ${blockiert.length} ohne gültige Grundlage oder Empfänger.`); return; }
        const res = await createGmailDrafts(erlaubt, (done, total) => {
            const b = el.querySelector('[data-action="gmail"]');
            if (b) b.textContent = `Gmail-Entwürfe ${done}/${total}…`;
        });
        await markApprovedContacted(erlaubt);
        renderReview(el, signal);
        showToast(`${res.created} Gmail-Entwürfe erstellt${res.failed ? `, ${res.failed} fehlgeschlagen` : ''}${blockiert.length ? `, ${blockiert.length} ohne gültige Grundlage ausgelassen` : ''}. Prüfen & senden in Gmail.`);
    } catch (err) {
        console.error('Gmail-Entwürfe:', err);
        showToast(`Gmail-Versand fehlgeschlagen: ${err.message}. Nutzen Sie den .mbox-Export.`);
    } finally {
        const b = el.querySelector('[data-action="gmail"]');
        if (b) { b.disabled = false; b.textContent = '→ Gmail-Entwürfe'; }
    }
}

async function sendViaEml(el, signal) {
    const { alle, erlaubt, blockiert } = await zulaessigeEntwuerfe();
    if (!alle.length) { showToast('Keine freigegebenen Entwürfe.'); return; }
    if (!erlaubt.length) { renderReview(el, signal); showToast(`Keine zulässigen Entwürfe — ${blockiert.length} ohne gültige Grundlage oder Empfänger.`); return; }
    const res = exportEml(erlaubt);
    await markApprovedContacted(erlaubt);
    renderReview(el, signal);
    showToast(`${res.exportiert} Entwürfe als .mbox exportiert${blockiert.length ? `, ${blockiert.length} ohne gültige Grundlage ausgelassen` : ''}.`);
}
