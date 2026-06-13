/**
 * MIME-Bau für Outreach-Mails — geteilt von Gmail-Entwürfen und .eml-Export.
 * Reine String-Funktionen (node-testbar). base64-Transfer-Encoding umgeht
 * 8bit-/Umlaut-Probleme zuverlässig.
 *
 * @module outreach/mime
 */

function b64(binaryStr) {
    if (typeof btoa === 'function') return btoa(binaryStr);
    return globalThis.Buffer.from(binaryStr, 'binary').toString('base64');
}

/** UTF-8-String → base64. */
export function toBase64(str) {
    return b64(unescape(encodeURIComponent(String(str ?? ''))));
}

/** base64 → base64url (für Gmail `raw`). */
export function toBase64Url(str) {
    return toBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC-2047-Encoded-Word für Header mit Nicht-ASCII (Umlaute im Betreff). */
export function encodeHeader(s) {
    const str = String(s ?? '');
    if (/^[\x00-\x7F]*$/.test(str)) return str;
    return `=?UTF-8?B?${toBase64(str)}?=`;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/** base64 in 76-Zeichen-Zeilen (RFC 2045). */
function chunk76(b64str) {
    return (b64str.match(/.{1,76}/g) || ['']).join('\r\n');
}

function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/**
 * Baut eine RFC-822 multipart/alternative Nachricht (text + html).
 * @param {{to:string, subject:string, body:string, bodyHtml?:string}} draft
 * @returns {string} MIME (CRLF-getrennt)
 */
export function buildMimeMessage({ to, subject, body, bodyHtml }) {
    const boundary = 'kbnd_' + simpleHash(`${to}|${subject}`).toString(36);
    const html = bodyHtml || `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(body || '')}</pre>`;
    return [
        `To: ${to}`,
        `Subject: ${encodeHeader(subject || '')}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        chunk76(toBase64(body || '')),
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        chunk76(toBase64(html)),
        `--${boundary}--`,
        ''
    ].join('\r\n');
}
