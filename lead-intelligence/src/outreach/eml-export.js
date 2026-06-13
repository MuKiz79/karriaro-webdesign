/**
 * .mbox-Export — Fallback-Versandweg ohne OAuth. Alle freigegebenen Entwürfe
 * in eine .mbox-Datei (Import in Apple Mail / Thunderbird → Entwürfe-Ordner).
 *
 * @module outreach/eml-export
 */

import { buildMimeMessage } from './mime.js';

/** mbox-„From “-Trennzeile (asctime-ähnlich). */
function mboxSeparator() {
    const d = new Date();
    return `From outreach@karriaro ${d.toUTCString()}`;
}

function dateStamp() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * @param {Array<{to,subject,body,bodyHtml}>} drafts
 */
export function exportEml(drafts) {
    const mbox = drafts.map(d => {
        // mbox: „From “-Escaping im Body (Zeilen, die mit „From “ beginnen).
        const msg = buildMimeMessage(d).replace(/\r\nFrom /g, '\r\n>From ');
        return `${mboxSeparator()}\r\n${msg}`;
    }).join('\r\n');

    const blob = new Blob([mbox], { type: 'application/mbox;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach_${dateStamp()}.mbox`;
    a.click();
    URL.revokeObjectURL(url);
}
