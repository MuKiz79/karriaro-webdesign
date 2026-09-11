/**
 * .mbox-Export — Fallback-Versandweg ohne OAuth. Alle freigegebenen Entwürfe
 * in eine .mbox-Datei (Import in Apple Mail / Thunderbird → Entwürfe-Ordner).
 *
 * Wie bei den Gmail-Entwürfen gilt: exportiert wird nur, was das Kontakt-Gate
 * erlaubt hat (nurMitGrundlage). Eine Datei ohne Grundlage wäre nur ein Umweg
 * um dieselbe Schranke.
 *
 * @module outreach/eml-export
 */

import { buildMimeMessage } from './mime.js';
import { nurMitGrundlage } from './kontakt-grundlage.js';
import { mitVersandKopf } from '../strategy/compliance.js';

/** mbox-„From “-Trennzeile (asctime-ähnlich). */
function mboxSeparator() {
    const d = new Date();
    return `From outreach@karriaro ${d.toUTCString()}`;
}

function dateStamp() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Baut den mbox-Inhalt (rein, ohne Download) — getrennt, damit er testbar bleibt.
 * @param {Array<{to,subject,body,bodyHtml,from?,listUnsubscribe?,grundlage}>} drafts
 * @returns {{mbox:string, exportiert:number, blockiert:number}}
 */
export function baueMbox(drafts) {
    const { erlaubt, blockiert } = nurMitGrundlage(drafts);
    const jetzt = new Date();
    const mbox = erlaubt.map(d => {
        // mbox: „From “-Escaping im Body (Zeilen, die mit „From “ beginnen).
        // Absender und List-Unsubscribe ergänzen, falls der Aufrufer sie nicht mitgab.
        const msg = buildMimeMessage({ ...mitVersandKopf(d), date: jetzt }).replace(/\r\nFrom /g, '\r\n>From ');
        return `${mboxSeparator()}\r\n${msg}`;
    }).join('\r\n');
    return { mbox, exportiert: erlaubt.length, blockiert: blockiert.length };
}

/**
 * @param {Array<{to,subject,body,bodyHtml,from?,listUnsubscribe?,grundlage}>} drafts
 * @returns {{exportiert:number, blockiert:number}}
 */
export function exportEml(drafts) {
    const { mbox, exportiert, blockiert } = baueMbox(drafts);
    if (blockiert) console.warn(`.mbox-Export: ${blockiert} Entwurf/Entwürfe ohne erlaubte Kontaktgrundlage oder Empfänger ausgelassen.`);
    if (!exportiert) return { exportiert, blockiert };

    const blob = new Blob([mbox], { type: 'application/mbox;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach_${dateStamp()}.mbox`;
    a.click();
    URL.revokeObjectURL(url);
    return { exportiert, blockiert };
}
