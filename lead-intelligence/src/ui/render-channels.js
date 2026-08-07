/**
 * Kanal-Output-UI — Druck/Anzeige/Copy fuer die legalen Outreach-Kanaele.
 * Importiert NICHTS aus render-components (kein Zyklus; render-components bindet
 * diese Funktionen an die Single-Check-Buttons).
 * @module ui/render-channels
 */
import { buildLetter, buildCallSheet, buildLinkedIn, buildPitchEmail } from '../outreach/channels.js';
import { generatePitch } from '../api/cloud-functions.js';

/** Werbebrief in eigenem Fenster oeffnen (isolierter A4-Druck). Popup-Fallback: neuer Tab. */
export function printLetter(data, pack) {
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

/** LinkedIn-1:1-Entwurf (Vernetzung + Erst-Nachricht) in die Zwischenablage. */
export function copyLinkedIn(data, pack, btn) {
    const li = buildLinkedIn(data, pack);
    const text = `— Vernetzungs-Notiz —\n${li.connect}\n\n— Erste Nachricht —\n${li.message}`;
    navigator.clipboard.writeText(text).then(() => {
        if (btn) { const t = btn.textContent; btn.textContent = 'Kopiert ✓'; setTimeout(() => { btn.textContent = t; }, 1800); }
    }).catch(() => {});
}

/** Anruf-Leitfaden als Overlay (druckbar + Nummer kopierbar). */
export function showCallSheet(data, pack) {
    const cs = buildCallSheet(data, pack);
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const el = document.createElement('div');
    el.className = 'channel-overlay';
    el.innerHTML = `
        <div class="channel-card call-sheet">
            <p class="hero-eyebrow">Anruf-Leitfaden</p>
            <h2 class="channel-title">${esc(cs.biz)}</h2>
            <div class="call-phone"><a href="tel:${esc(cs.phone)}">${esc(cs.phone)}</a></div>
            <p class="call-legal">Hinweis: B2B-Kaltanruf ist in DE nur bei mutmaßlichem Interesse zulässig (UWG §7). Sie entscheiden das Risiko.</p>
            <div class="call-sec"><div class="section-label">Einstieg</div><p>${esc(cs.opener)}</p></div>
            <div class="call-sec"><div class="section-label">Konkrete Probleme (max. 2 nennen)</div><ul>${cs.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
            <div class="call-sec"><div class="section-label">Angebot</div><p>${esc(cs.offer)}</p></div>
            <div class="call-sec"><div class="section-label">Einwände</div>${cs.objections.map(o => `<p><strong>${esc(o.q)}</strong><br>${esc(o.a)}</p>`).join('')}</div>
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

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
        services: Array.isArray(data?.companyProfile?.services) ? data.companyProfile.services : []
    };
}

/**
 * Pitch-Seite erzeugen (volle bespoke Seite via generatePitch), dann Ergebnis
 * zeigen: teilbarer Link + die fertige Neva-Voice-Pitch-Mail (kopieren/öffnen).
 */
export async function runPitch(data, btn) {
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
        // viewInfo nur im Cache-Pfad vorhanden — eine frisch erzeugte Seite
        // kann noch niemand geöffnet haben.
        showPitchResult(data, res.url, res.cached, res.cached ? { views: res.views || 0, lastViewAtMs: res.lastViewAtMs || null } : null);
    } catch (e) {
        window.alert('Pitch-Generierung fehlgeschlagen: ' + (e?.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = original; }
    }
}

/** Overlay mit teilbarer Pitch-URL + fertiger Neva-Voice-Mail. */
function showPitchResult(data, pitchUrl, cached, viewInfo = null) {
    const mail = buildPitchEmail(data, pitchUrl);
    const mailto = `mailto:${mail.recipientEmail ? encodeURIComponent(mail.recipientEmail) : ''}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
    const el = document.createElement('div');
    el.className = 'channel-overlay';
    el.innerHTML = `
        <div class="channel-card pitch-result">
            <p class="hero-eyebrow">Pitch-Seite${cached ? ' (bereits erzeugt)' : ' erzeugt'}</p>
            <h2 class="channel-title">${escHtml(mail.subject)}</h2>
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
                <p class="call-legal">Hinweis: Der Entwurf ist auf <code>noindex</code> gesetzt — er wird nicht von Google indexiert und ist nur über diesen Link erreichbar. Aufrufe werden serverseitig gezählt (kein Cookie, keine IP-Speicherung).</p>
            </div>
            <div class="call-sec">
                <div class="section-label">Pitch-Mail (Neva-Voice) — prüfen, dann senden</div>
                <textarea class="studio-body" rows="12" data-mailbody readonly>${escHtml(mail.body)}</textarea>
            </div>
            <div class="channel-actions">
                <button class="btn-copy-large" data-copymail>E-Mail kopieren</button>
                <a class="btn-copy-large" style="text-decoration:none;text-align:center" href="${mailto}" data-mailto>In E-Mail-App öffnen</a>
                <button class="btn-copy-large channel-close" data-close>Schließen</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-close]').addEventListener('click', close);
    el.querySelector('[data-open]').addEventListener('click', () => window.open(pitchUrl, '_blank', 'noopener'));
    el.querySelector('[data-copyurl]').addEventListener('click', (e) => {
        navigator.clipboard.writeText(pitchUrl).then(() => { e.target.textContent = 'Kopiert ✓'; setTimeout(() => { e.target.textContent = 'Link kopieren'; }, 1600); });
    });
    el.querySelector('[data-copymail]').addEventListener('click', (e) => {
        navigator.clipboard.writeText(`Betreff: ${mail.subject}\n\n${mail.body}`).then(() => { e.target.textContent = 'Kopiert ✓'; setTimeout(() => { e.target.textContent = 'E-Mail kopieren'; }, 1600); });
    });
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
}
