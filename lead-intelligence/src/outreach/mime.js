/**
 * MIME-Bau für Outreach-Mails — geteilt von Gmail-Entwürfen und .mbox-Export.
 * Reine String-Funktionen (node-testbar). base64-Transfer-Encoding umgeht
 * 8bit-/Umlaut-Probleme zuverlässig.
 *
 * Header, die eine zulässige Werbe-Mail braucht:
 *   • From:  erkennbarer Absender (Name + Adresse aus Profil/Impressum)
 *   • List-Unsubscribe: immer die Abmelde-Adresse (mailto), zusätzlich die
 *     Abmeldeseite mit Token, wenn die Einwilligung einen trägt
 *   • List-Unsubscribe-Post: NUR zusammen mit einer https-URI (RFC 8058) —
 *     ein One-Click-Versprechen ohne https-Ziel wäre eine Falschangabe.
 *
 * Alle Header-Werte werden von CR/LF befreit: ein im Studio editierter Betreff
 * mit Zeilenumbruch dürfte sonst eigene Header einschleusen.
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

/** Header-Wert ohne Zeilenumbrüche (Schutz gegen Header-Injection). */
export function bereinigeHeaderWert(s) {
    return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function utf8Laenge(ch) {
    const cp = ch.codePointAt(0);
    return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

/**
 * RFC-2047-Encoded-Words für Header mit Nicht-ASCII (Umlaute im Betreff/Namen).
 * Jedes Encoded-Word bleibt ≤ 75 Zeichen (RFC 2047 § 2): höchstens 45 UTF-8-Bytes
 * je Wort, nie mitten in einem Zeichen getrennt; mehrere Wörter werden mit
 * CRLF + Leerzeichen gefaltet (der Leerraum zwischen Encoded-Words zählt nicht).
 */
export function encodeHeader(s) {
    const str = bereinigeHeaderWert(s);
    if (/^[\x00-\x7F]*$/.test(str)) return str;
    const MAX_BYTES = 45;                        // 45 Bytes → 60 base64-Zeichen + 12 Rahmen = 72
    const worte = [];
    let teil = '', bytes = 0;
    for (const ch of str) {                       // for…of iteriert Codepoints, nicht UTF-16-Hälften
        const l = utf8Laenge(ch);
        if (bytes + l > MAX_BYTES && teil) { worte.push(teil); teil = ''; bytes = 0; }
        teil += ch; bytes += l;
    }
    if (teil) worte.push(teil);
    return worte.map(w => `=?UTF-8?B?${toBase64(w)}?=`).join('\r\n ');
}

/** Zulässige einfache Adresse (kein Anzeigename, keine spitzen Klammern, keine Umbrüche). */
export function einfacheAdresse(email) {
    const e = bereinigeHeaderWert(email);
    return /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(e) ? e : '';
}

/**
 * Adress-Header „Name <adresse>" mit korrekter Kodierung des Namens.
 * @param {{name?:string, email:string}} a
 * @returns {string} leer, wenn die Adresse ungültig ist
 */
export function formatAdresse(a) {
    const email = einfacheAdresse(a?.email);
    if (!email) return '';
    const name = bereinigeHeaderWert(a?.name);
    if (!name) return email;
    if (/[^\x00-\x7F]/.test(name)) return `${encodeHeader(name)} <${email}>`;
    if (/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~ ]+$/.test(name)) return `${name} <${email}>`;
    return `"${name.replace(/(["\\])/g, '\\$1')}" <${email}>`;
}

/**
 * List-Unsubscribe-Header aus {mailto, https}.
 * @returns {Array<[string,string]>} Header-Paare (leer, wenn kein Ziel)
 */
export function listUnsubscribeHeader(lu) {
    const mailto = typeof lu?.mailto === 'string' && /^mailto:[^\s<>]+$/i.test(lu.mailto) ? lu.mailto : null;
    const https = typeof lu?.https === 'string' && /^https:\/\/[^\s<>]+$/i.test(lu.https) ? lu.https : null;
    const ziele = [mailto, https].filter(Boolean).map(z => `<${z}>`);
    if (!ziele.length) return [];
    const paare = [['List-Unsubscribe', ziele.join(', ')]];
    if (https) paare.push(['List-Unsubscribe-Post', 'List-Unsubscribe=One-Click']);
    return paare;
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
 * Baut eine RFC-5322 multipart/alternative Nachricht (text + html).
 * @param {{to:string, subject:string, body:string, bodyHtml?:string,
 *          from?:{name?:string,email:string}, listUnsubscribe?:{mailto?:string,https?:string},
 *          date?:Date}} draft
 * @returns {string} MIME (CRLF-getrennt)
 */
export function buildMimeMessage({ to, subject, body, bodyHtml, from = null, listUnsubscribe = null, date = null }) {
    const toHeader = einfacheAdresse(to);
    const fromHeader = from ? formatAdresse(from) : '';
    const boundary = 'kbnd_' + simpleHash(`${toHeader}|${subject}`).toString(36);
    const html = bodyHtml || `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(body || '')}</pre>`;
    const kopf = [];
    if (fromHeader) kopf.push(`From: ${fromHeader}`);
    kopf.push(`To: ${toHeader}`);
    kopf.push(`Subject: ${encodeHeader(subject || '')}`);
    if (date instanceof Date && Number.isFinite(date.getTime())) kopf.push(`Date: ${date.toUTCString()}`);
    for (const [k, v] of listUnsubscribeHeader(listUnsubscribe)) kopf.push(`${k}: ${v}`);
    return [
        ...kopf,
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

/**
 * mailto-Link, der den Pflichtteil NIE abschneidet. mailto-URLs sind je nach
 * Client auf rund 2000 Zeichen begrenzt; passt der ganze Text nicht, wird nur der
 * Kern gekürzt (mit sichtbarem Hinweis), der Pflichtteil bleibt vollständig.
 * Passt nicht einmal der Pflichtteil → null (dann nur „Kopieren").
 *
 * @param {{to:string, subject:string, kern:string, pflicht?:string, maxLaenge?:number}} p
 * @returns {string|null}
 */
export function baueMailtoHref({ to, subject, kern, pflicht = '', maxLaenge = 1900 }) {
    const adresse = einfacheAdresse(to);
    if (!adresse) return null;
    // Nur lokalen Teil und Domain kodieren — das trennende @ bleibt wörtlich
    // (RFC 6068); manche Mail-Programme zeigen ein %40 sonst als Adresse an.
    const at = adresse.lastIndexOf('@');
    const ziel = `${encodeURIComponent(adresse.slice(0, at))}@${encodeURIComponent(adresse.slice(at + 1))}`;
    const kopf = `mailto:${ziel}?subject=${encodeURIComponent(bereinigeHeaderWert(subject))}&body=`;
    const k = String(kern || '');
    const voll = kopf + encodeURIComponent(k + pflicht);
    if (voll.length <= maxLaenge) return voll;
    const MARKE = '\n\n[…] Text gekürzt — den vollständigen Text über „Kopieren" einfügen.';
    const passt = n => (kopf + encodeURIComponent(k.slice(0, n) + MARKE + pflicht)).length <= maxLaenge;
    if (!passt(0)) return null;
    let lo = 0, hi = k.length;
    while (lo < hi) {                             // größtes n, das noch passt
        const mid = Math.ceil((lo + hi) / 2);
        if (passt(mid)) lo = mid; else hi = mid - 1;
    }
    return kopf + encodeURIComponent(k.slice(0, lo) + MARKE + pflicht);
}
