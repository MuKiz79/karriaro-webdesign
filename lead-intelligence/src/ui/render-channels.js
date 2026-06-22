/**
 * Kanal-Output-UI — Druck/Anzeige/Copy fuer die legalen Outreach-Kanaele.
 * Importiert NICHTS aus render-components (kein Zyklus; render-components bindet
 * diese Funktionen an die Single-Check-Buttons).
 * @module ui/render-channels
 */
import { buildLetter, buildCallSheet, buildLinkedIn } from '../outreach/channels.js';

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
