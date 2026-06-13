/**
 * Compliance-Decorator für Outreach-Mails.
 *
 * Kalt-B2B-Mail in DE (UWG §7) erfordert mindestens: Absender-Impressum
 * (§5 TMG) und eine niederschwellige Opt-out-Möglichkeit. Dieser Decorator
 * hängt beides an JEDE Variante eines Outreach-Packs — bewusst NICHT in
 * outreach.js (buildEmail), das auch im Einzel-Check ohne Massenversand
 * wiederverwendet wird.
 *
 * @module strategy/compliance
 */

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

const OPT_OUT = 'Sie erhalten diese einmalige Nachricht, weil Ihr Unternehmen öffentlich gelistet ist. Möchten Sie keine weitere Nachricht von mir, genügt eine kurze Antwort mit „kein Interesse" — ich trage Sie dann dauerhaft aus.';

/**
 * Baut den Impressum- + Opt-out-Block aus dem Absender-Profil (config.profile).
 *
 * @param {object} profile  { name, company, location, portfolio }
 * @returns {{text:string, html:string, optOut:string}}
 */
export function complianceBlock(profile = {}) {
    const name = profile.name || 'Muammer Kizilaslan';
    const company = profile.company || 'Karriaro Webdesign';
    const location = profile.location || '';
    const portfolio = profile.portfolio || 'karriaro-webdesign.de';
    const sig = [name, company, location, portfolio].filter(Boolean).join(' · ');

    return {
        optOut: OPT_OUT,
        text: `\n—\n${sig}\n\n${OPT_OUT}`,
        html: `<hr style="border:none;border-top:1px solid #E5E0D8;margin:20px 0 12px">`
            + `<p style="font-size:12px;color:#8a8a8f;line-height:1.5">${escapeHtml(sig)}<br><br>${escapeHtml(OPT_OUT)}</p>`
    };
}

/** Hängt HTML vor das letzte schließende </div> des Mail-Bodys. */
function injectHtml(bodyHtml, block) {
    if (!bodyHtml) return block;
    if (/<\/div>\s*$/.test(bodyHtml)) return bodyHtml.replace(/<\/div>\s*$/, block + '</div>');
    return bodyHtml + block;
}

/**
 * Dekoriert ein Outreach-Pack: Impressum + Opt-out an jede Variante, Empfänger
 * aus dem verifizierten Kontakt. Lässt das Original unangetastet (gibt eine
 * neue Struktur zurück).
 *
 * @param {object} pack     Ergebnis von buildOutreachPack
 * @param {object|null} contact  { allEmails[], genericEmails[], owner }
 * @param {object} profile  config.profile
 * @returns {object} dekoriertes Pack (oder Original, wenn pack.available === false)
 */
export function compliancify(pack, contact = null, profile = {}) {
    if (!pack || !pack.available) return pack;
    const cb = complianceBlock(profile);
    const recipientEmail = contact?.allEmails?.[0] || contact?.emails?.[0] || contact?.genericEmails?.[0] || pack.recipientEmail;

    const variants = (pack.variants || []).map(v => {
        const body = v.body + cb.text;
        return {
            ...v,
            body,
            bodyHtml: injectHtml(v.bodyHtml, cb.html),
            copyText: `Betreff: ${v.subject}\n\n${body}`
        };
    });

    return {
        ...pack,
        recipientEmail,
        variants,
        primary: variants[0] || pack.primary,
        complianceApplied: true
    };
}
