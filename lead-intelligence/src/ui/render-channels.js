/**
 * Kanal-Output-UI — Druck/Anzeige/Copy fuer Brief, Anruf-Leitfaden, LinkedIn und
 * Pitch-Seite. Jede Ausgabe geht durch das Kontakt-Gate (outreach/kontakt-grundlage.js);
 * die Builder in channels.js liefern ohne erlaubte Prüfung ohnehin keinen Text.
 *
 * Importiert NICHTS aus render-components (kein Zyklus; render-components bindet
 * diese Funktionen an die Single-Check-Buttons).
 * @module ui/render-channels
 */
import { buildLetter, buildCallSheet, buildLinkedIn, buildPitchEmail } from '../outreach/channels.js';
import { generatePitch } from '../api/cloud-functions.js';
import { PREIS_EINSTIEG } from '../config.js';
import { pruefeMailErlaubnis, leadAusCheck, RECHTSHINWEISE } from '../outreach/kontakt-grundlage.js';
import { ladeEinwilligungenMitStatus } from '../crm/consents.js';
import { loadSuppression, isSuppressed, addSuppression } from '../crm/suppression.js';
import { baueMailtoHref } from '../outreach/mime.js';

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function leseGespeicherteLeads() {
    try {
        return JSON.parse(localStorage.getItem('karriaro_leads') || '[]');
    } catch (e) {
        console.warn('Gespeicherte Leads unlesbar — Kontaktgrundlage gilt als nicht eingetragen:', e);
        return [];
    }
}

/**
 * Kontaktgrundlage für den Einzel-Check: gespeicherter Lead (Grundlage, Zähler),
 * Einwilligungen, Sperrliste. Meldet die Analyse einen Werbewiderspruch, landet
 * die Domain sofort auf der Sperrliste.
 *
 * @param {object} data  Single-Check-Result
 * @returns {Promise<{lead:object, gesperrt:boolean, einwilligungenGeladen:boolean, pruefe:(kanal:string)=>object}>}
 */
export async function ladeGrundlageFuerCheck(data) {
    const lead = leadAusCheck(data, leseGespeicherteLeads());
    if (lead.contactData?.werbewiderspruch === true && lead.domain) {
        try { await addSuppression(lead.domain, 'opt_out'); }
        catch (e) { console.error('Werbewiderspruch — Sperrliste nicht geschrieben:', e); }
    }
    const [status, sperre] = await Promise.all([ladeEinwilligungenMitStatus(), loadSuppression()]);
    if (!status.geladen) console.warn('Einwilligungen nicht lesbar:', status.fehler);
    const gesperrt = isSuppressed(lead.domain, sperre);
    const pruefe = (kanal) => pruefeMailErlaubnis(lead, {
        einwilligungen: status.einwilligungen,
        einwilligungenGeladen: status.geladen,
        gesperrt,
        kanal
    });
    return { lead, gesperrt, einwilligungenGeladen: status.geladen, pruefe };
}

function meldeGesperrt(ergebnis) {
    const hinweis = ergebnis?.rechtshinweis && !ergebnis?.gesperrt ? `\n\n${ergebnis.rechtshinweis}` : '';
    window.alert(`Nicht zulässig: ${ergebnis?.grund || 'Keine Kontaktgrundlage.'}${hinweis}`);
}

/** Werbebrief in eigenem Fenster oeffnen (isolierter A4-Druck). Popup-Fallback: neuer Tab. */
export function printLetter(data, pack, pruefung = null) {
    if (!pruefung?.erlaubt || pruefung.kanal !== 'brief') { meldeGesperrt(pruefung || { grund: 'Kontaktgrundlage noch nicht geprüft.' }); return; }
    const html = buildLetter(data, pack);
    const w = window.open('', '_blank', 'width=820,height=1040');
    if (!w) {
        // Popup geblockt → als Blob-URL in neuem Tab (User klickt dann selbst „Drucken").
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        window.open(url, '_blank');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
}

/** LinkedIn-1:1-Entwurf (Vernetzung + Erst-Nachricht) in die Zwischenablage — nur mit Grundlage. */
export function copyLinkedIn(data, pack, btn, pruefung = null) {
    const li = buildLinkedIn(data, pack, pruefung);
    if (!li.erlaubt) { meldeGesperrt(li); return; }
    const text = `— Vernetzungs-Notiz —\n${li.connect}\n\n— Erste Nachricht —\n${li.message}`;
    navigator.clipboard.writeText(text).then(() => {
        if (btn) { const t = btn.textContent; btn.textContent = 'Kopiert ✓'; setTimeout(() => { btn.textContent = t; }, 1800); }
    }).catch(e => console.warn('Zwischenablage nicht verfügbar:', e));
}

/** Anruf-Leitfaden als Overlay (druckbar + Nummer kopierbar) — nur mit Anlass. */
export function showCallSheet(data, pack, pruefung = null) {
    const cs = buildCallSheet(data, pack, pruefung);
    if (!cs.erlaubt) { meldeGesperrt(cs); return; }
    const el = document.createElement('div');
    el.className = 'channel-overlay';
    el.innerHTML = `
        <div class="channel-card call-sheet">
            <p class="hero-eyebrow">Anruf-Leitfaden</p>
            <h2 class="channel-title">${escHtml(cs.biz)}</h2>
            <div class="call-phone"><a href="tel:${escHtml(cs.phone)}">${escHtml(cs.phone)}</a></div>
            <p class="call-legal">${escHtml(RECHTSHINWEISE.anruf)} Dokumentierter Anlass: ${escHtml(cs.anlass)}</p>
            <div class="call-sec"><div class="section-label">Einstieg</div><p>${escHtml(cs.opener)}</p></div>
            <div class="call-sec"><div class="section-label">Konkrete Probleme (max. 2 nennen)</div><ul>${cs.problems.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul></div>
            <div class="call-sec"><div class="section-label">Angebot</div><p>${escHtml(cs.offer)}</p></div>
            <div class="call-sec"><div class="section-label">Einwände</div>${cs.objections.map(o => `<p><strong>${escHtml(o.q)}</strong><br>${escHtml(o.a)}</p>`).join('')}</div>
            <div class="call-sec"><div class="section-label">Widerspruchshinweis</div><p>${escHtml(cs.widerspruch)}</p></div>
            <p class="call-legal">${escHtml(cs.nachDemGespraech)}</p>
            <div class="channel-actions">
                <button class="btn-copy-large" data-print>Drucken</button>
                <button class="btn-copy-large channel-close" data-close>Schließen</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-close]').addEventListener('click', close);
    el.querySelector('[data-print]').addEventListener('click', () => window.print());
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
}

/** Lead-Fakten aus dem Single-Check-`data` für die Pitch-Generierung ziehen. */
function pitchFactsFrom(data) {
    let domain = '';
    try { domain = new URL(data.url).hostname.replace(/^www\./, ''); } catch { /* — */ }
    return {
        businessName: data?.place?.displayName?.text || data?.companyProfile?.name || domain || 'Ihr Unternehmen',
        branche: data?.companyProfile?.branche || data?.place?.primaryType || null,
        brancheLabel: data?.place?.primaryTypeDisplayName?.text || data?.companyProfile?.branche || null,
        rating: data?.place?.rating ?? null,
        reviewCount: data?.place?.userRatingCount ?? null,
        address: data?.place?.formattedAddress || null,
        city: (data?.place?.formattedAddress || '').split(',').pop()?.trim() || null,
        websiteUri: data?.url || (domain ? `https://${domain}` : null),
        services: Array.isArray(data?.companyProfile?.services) ? data.companyProfile.services : [],
        // Preis aus config.PREISE — sonst setzt die Function ihren eigenen Rückfallwert ein.
        priceFrom: PREIS_EINSTIEG
    };
}

/**
 * Pitch-Seite erzeugen (volle bespoke Seite via generatePitch), dann Ergebnis
 * zeigen: teilbarer Link + die Pitch-Mail — die Mail nur mit Kontaktgrundlage.
 *
 * @param {object} data
 * @param {HTMLElement} [btn]
 * @param {{pruefeMail?:()=>object|null}} [opts]  aktuelle E-Mail-Prüfung des Einzel-Checks
 */
export async function runPitch(data, btn, { pruefeMail = null } = {}) {
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Erzeuge Pitch-Seite… (~1–2 Min)'; }
    try {
        const res = await generatePitch(pitchFactsFrom(data));
        if (!res || !res.ok || !res.url) {
            window.alert(res?.error
                ? `Pitch-Seite nicht erzeugt: ${res.error}`
                : 'Die Pitch-Seite konnte nicht erzeugt werden. Bitte in einer Minute erneut versuchen (KI-Limit oder Überlast).');
            return;
        }
        // Prüfung erst NACH der Erzeugung ziehen — die Generierung dauert, und eine
        // Einwilligung kann inzwischen widerrufen oder die Domain gesperrt sein.
        let pruefung = typeof pruefeMail === 'function' ? pruefeMail() : null;
        if (!pruefung) pruefung = (await ladeGrundlageFuerCheck(data)).pruefe('email');
        // viewInfo nur im Cache-Pfad vorhanden — eine frisch erzeugte Seite
        // kann noch niemand geöffnet haben.
        showPitchResult(data, res.url, res.cached, res.cached ? { views: res.views || 0, lastViewAtMs: res.lastViewAtMs || null } : null, pruefung);
    } catch (e) {
        console.error('Pitch-Generierung:', e);
        window.alert('Pitch-Generierung fehlgeschlagen: ' + (e?.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = original; }
    }
}

/** Overlay mit teilbarer Pitch-URL + (nur mit Grundlage) fertiger Pitch-Mail. */
function showPitchResult(data, pitchUrl, cached, viewInfo = null, pruefung = null) {
    const mail = buildPitchEmail(data, pitchUrl, pruefung);
    const mailto = mail.erlaubt
        ? baueMailtoHref({ to: mail.recipientEmail, subject: mail.subject, kern: mail.textKern, pflicht: mail.pflichtteil.text })
        : null;
    const mailBlock = mail.erlaubt
        ? `<div class="call-sec">
                <div class="section-label">Pitch-Mail (Neva-Voice) — prüfen, dann senden</div>
                <p class="call-legal">Grundlage: ${escHtml(pruefung.grund)}${pruefung.hinweis ? ` · ${escHtml(pruefung.hinweis)}` : ''} · Empfänger: ${escHtml(mail.recipientEmail || 'keine Adresse gefunden')}</p>
                <textarea class="studio-body" rows="12" data-mailbody readonly>${escHtml(mail.body)}</textarea>
            </div>`
        : `<div class="call-sec">
                <div class="section-label">Pitch-Mail gesperrt</div>
                <p class="uwg-note">${escHtml(mail.grund)}${mail.rechtshinweis ? ` ${escHtml(mail.rechtshinweis)}` : ''}</p>
                <p class="call-legal">Die Seite bleibt nutzbar — zum Beispiel für einen Brief oder als Antwort, sobald der Betrieb anfragt.</p>
            </div>`;
    const mailButtons = mail.erlaubt
        ? `<button class="btn-copy-large" data-copymail ${mail.recipientEmail ? '' : 'disabled title="Kein Empfänger gefunden"'}>E-Mail kopieren</button>
           ${mailto && mail.recipientEmail
                ? `<a class="btn-copy-large" style="text-decoration:none;text-align:center" href="${escHtml(mailto)}" data-mailto>In E-Mail-App öffnen</a>`
                : `<span class="btn-copy-large" style="text-align:center;opacity:.45;cursor:not-allowed" aria-disabled="true" title="${mail.recipientEmail ? 'Text zu lang für einen mailto-Link — bitte kopieren' : 'Kein Empfänger gefunden'}">In E-Mail-App öffnen</span>`}`
        : '';
    const el = document.createElement('div');
    el.className = 'channel-overlay';
    el.innerHTML = `
        <div class="channel-card pitch-result">
            <p class="hero-eyebrow">Pitch-Seite${cached ? ' (bereits erzeugt)' : ' erzeugt'}</p>
            <h2 class="channel-title">${escHtml(`Ein Entwurf für ${pitchFactsFrom(data).businessName}`)}</h2>
            <div class="call-sec">
                <div class="section-label">Teilbare Seite</div>
                <p><a href="${escHtml(pitchUrl)}" target="_blank" rel="noopener">${escHtml(pitchUrl)}</a></p>
                <div class="channel-btn-row">
                    <button class="channel-btn" data-open>Seite öffnen</button>
                    <button class="channel-btn" data-copyurl>Link kopieren</button>
                </div>
                ${viewInfo && viewInfo.views > 0
                    ? `<p class="pitch-views"><strong>${viewInfo.views}× geöffnet</strong>${viewInfo.lastViewAtMs ? ` · zuletzt ${new Date(viewInfo.lastViewAtMs).toLocaleString('de-DE')}` : ''} — der Empfänger hat den Entwurf angesehen.</p>`
                    : (cached ? `<p class="pitch-views pitch-views-none">Noch nicht geöffnet.</p>` : '')}
                <p class="call-legal">Hinweis: Der Entwurf ist auf <code>noindex</code> gesetzt — er wird nicht von Google indexiert und ist nur über diesen Link erreichbar. Aufrufe werden serverseitig gezählt (kein Cookie, keine IP-Speicherung). Den Link per E-Mail, LinkedIn oder XING zu schicken, braucht dieselbe Grundlage wie jede andere Werbe-Nachricht.</p>
            </div>
            ${mailBlock}
            <div class="channel-actions">
                ${mailButtons}
                <button class="btn-copy-large channel-close" data-close>Schließen</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-close]').addEventListener('click', close);
    el.querySelector('[data-open]').addEventListener('click', () => window.open(pitchUrl, '_blank', 'noopener'));
    el.querySelector('[data-copyurl]').addEventListener('click', (e) => {
        navigator.clipboard.writeText(pitchUrl).then(() => { e.target.textContent = 'Kopiert ✓'; setTimeout(() => { e.target.textContent = 'Link kopieren'; }, 1600); })
            .catch(err => console.warn('Zwischenablage nicht verfügbar:', err));
    });
    el.querySelector('[data-copymail]')?.addEventListener('click', (e) => {
        if (!mail.erlaubt || !mail.recipientEmail) return;
        navigator.clipboard.writeText(`Betreff: ${mail.subject}\n\n${mail.body}`).then(() => { e.target.textContent = 'Kopiert ✓'; setTimeout(() => { e.target.textContent = 'E-Mail kopieren'; }, 1600); })
            .catch(err => console.warn('Zwischenablage nicht verfügbar:', err));
    });
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
}
