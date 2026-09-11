/**
 * Pflichtbausteine für ZULÄSSIGE Werbe-Mails.
 *
 * Dieser Decorator macht keine Mail zulässig. Ob überhaupt geschrieben werden
 * darf, entscheidet allein das Kontakt-Gate (outreach/kontakt-grundlage.js):
 * eine vorherige ausdrückliche Einwilligung (Double-Opt-In), eine Anfrage des
 * Betriebs oder ein Bestandskunde nach § 7 Abs. 3 UWG. Absenderangaben und eine
 * Abmeldemöglichkeit HEILEN eine Mail ohne diese Grundlage nicht.
 *
 * Für eine Mail MIT Grundlage hängt er an jede Variante:
 *   • erkennbaren Absender (Name, Firma, Anschrift, E-Mail — aus dem Impressum,
 *     dessen Informationspflichten nach § 5 DDG gelten),
 *   • die Herkunft passend zur Grundlage („Sie haben am … eingewilligt"),
 *   • eine funktionierende Abmeldung (Link mit Token und/oder Adresse, § 7 Abs. 2
 *     Nr. 3 UWG),
 *   • den Widerspruchshinweis nach Art. 21 Abs. 4 DSGVO als EIGENEN Absatz,
 *     getrennt vom übrigen Text.
 *
 * Der editierbare Mailtext (`textKern`) und der Pflichtteil werden getrennt
 * geführt: Wer im Studio den Text ändert, kann den Pflichtteil nicht versehentlich
 * löschen — `body` wird immer aus beiden zusammengesetzt.
 *
 * Bewusst NICHT in outreach.js (buildEmail): das Pack entsteht auch ohne Grundlage
 * (Analyse bleibt nutzbar), der Pflichtteil erst mit ihr.
 *
 * @module strategy/compliance
 */
import { absender, ABMELDUNG } from '../config.js';
import { datumDe } from '../crm/leads.js';
import { EINWILLIGUNGS_QUELLEN, normalisiereEmail } from '../crm/consents.js';
import { escapeHtml } from '../lib/escape-html.js';
import { einfacheAdresse } from '../outreach/mime.js';

/** Widerspruchshinweis (Art. 21 Abs. 2 und 4 DSGVO; Kostenhinweis nach § 7 Abs. 3 Nr. 4 UWG). */
export function widerspruchsHinweis() {
    return `Widerspruchsrecht: Sie können der Verwendung Ihrer Daten für Werbung jederzeit widersprechen (Art. 21 Abs. 2 DSGVO). Eine formlose Nachricht an ${ABMELDUNG.email} genügt; dafür entstehen Ihnen keine anderen als die Übermittlungskosten nach den Basistarifen.`;
}

/** Abmelde-Seite mit Token (V5) — nur, wenn die Einwilligung einen Token trägt. */
export function abmeldeUrl(token) {
    const t = typeof token === 'string' ? token.trim() : '';
    return t ? `${ABMELDUNG.urlBasis}?t=${encodeURIComponent(t)}` : null;
}

/** List-Unsubscribe-Ziele passend zur Prüfung. */
export function listUnsubscribeFuer(pruefung) {
    return {
        mailto: `mailto:${ABMELDUNG.email}?subject=${encodeURIComponent(ABMELDUNG.betreff)}`,
        https: pruefung?.grundlage === 'doi' ? abmeldeUrl(pruefung?.einwilligung?.unsubscribeToken) : null
    };
}

/**
 * Versand-Kopf eines Entwurfs, unmittelbar vor Gmail/.mbox: erkennbarer Absender
 * und Abmeldeweg. Fehlen sie am Entwurf (ein Aufrufer hat sie nicht mitgegeben),
 * kommen sie aus Profil/Impressum und aus der mitgeführten Gate-Prüfung — eine
 * zulässige Mail geht nie ohne From und List-Unsubscribe hinaus. Vorhandene,
 * gültige Angaben bleiben unverändert (kein doppelter Header).
 *
 * @param {{from?:{name?:string,email?:string}, listUnsubscribe?:{mailto?:string,https?:string}, grundlage?:object}} draft
 * @param {object} [profile]  config.profile (Standard: aktuelles Profil)
 * @returns {object} neuer Entwurf
 */
export function mitVersandKopf(draft, profile) {
    if (!draft) return draft;
    const a = absender(profile);
    const from = einfacheAdresse(draft.from?.email) ? draft.from : { name: a.name, email: a.email };
    const vorhanden = draft.listUnsubscribe && (draft.listUnsubscribe.mailto || draft.listUnsubscribe.https);
    return {
        ...draft,
        from,
        listUnsubscribe: vorhanden ? draft.listUnsubscribe : listUnsubscribeFuer(draft.grundlage)
    };
}

/**
 * Herkunftssatz passend zur Grundlage. Nur, was belegt ist: Datum und (bei DOI)
 * die erfasste Quelle der Einwilligung.
 */
export function herkunftsSatz(pruefung) {
    if (!pruefung?.erlaubt) return null;
    const datum = datumDe(pruefung.datum);
    if (pruefung.grundlage === 'doi') {
        const q = pruefung.einwilligung?.source;
        const quelle = q ? (EINWILLIGUNGS_QUELLEN[q] || null) : null;
        return `Sie erhalten diese E-Mail, weil Sie${datum ? ` am ${datum}` : ''} eingewilligt haben, von Karriaro Webdesign bis zu drei E-Mails zu Ihrer Website zu erhalten${quelle ? ` (über: ${quelle})` : ''}.`;
    }
    if (pruefung.grundlage === 'anfrage') {
        return `Sie erhalten diese E-Mail als Antwort auf Ihre Anfrage${datum ? ` vom ${datum}` : ''}.`;
    }
    if (pruefung.grundlage === 'bestandskunde') {
        return `Sie erhalten diese E-Mail, weil wir Ihre E-Mail-Adresse im Rahmen Ihres Auftrags${datum ? ` vom ${datum}` : ''} erhalten haben.`;
    }
    return null;
}

/**
 * Pflichtteil aus Absender-Profil und Gate-Prüfung.
 * @param {object} profile   config.profile
 * @param {object} pruefung  Ergebnis von pruefeMailErlaubnis (muss erlaubt sein)
 * @returns {{text:string, html:string, herkunft:string, abmeldung:string, widerspruch:string, listUnsubscribe:object}|null}
 */
export function complianceBlock(profile = {}, pruefung = null) {
    if (!pruefung?.erlaubt || pruefung.kanal !== 'email') return null;
    const a = absender(profile);
    const herkunft = herkunftsSatz(pruefung);
    const lu = listUnsubscribeFuer(pruefung);
    const abmeldung = lu.https
        ? `Abmelden: ${lu.https} — oder eine kurze E-Mail an ${ABMELDUNG.email} mit dem Betreff „${ABMELDUNG.betreff}".`
        : `Abmelden: eine kurze E-Mail an ${ABMELDUNG.email} mit dem Betreff „${ABMELDUNG.betreff}" genügt.`;
    const widerspruch = widerspruchsHinweis();
    const absenderZeilen = [
        `${a.name} · ${a.firma}`,
        `${a.anschrift} · ${a.email} · ${a.web}`
    ];

    const text = [
        '', '—',
        ...absenderZeilen,
        '',
        herkunft,
        abmeldung,
        '',
        widerspruch
    ].filter(z => z !== null).join('\n');

    const p = 'font-size:12px;color:#6e6e73;line-height:1.5;margin:0 0 10px';
    const abmeldungHtml = lu.https
        ? `Abmelden: <a href="${escapeHtml(lu.https)}" style="color:#1A2E40">Abmeldeseite</a> — oder eine kurze E-Mail an <a href="mailto:${escapeHtml(ABMELDUNG.email)}?subject=${encodeURIComponent(ABMELDUNG.betreff)}" style="color:#1A2E40">${escapeHtml(ABMELDUNG.email)}</a> mit dem Betreff „${escapeHtml(ABMELDUNG.betreff)}".`
        : `Abmelden: eine kurze E-Mail an <a href="mailto:${escapeHtml(ABMELDUNG.email)}?subject=${encodeURIComponent(ABMELDUNG.betreff)}" style="color:#1A2E40">${escapeHtml(ABMELDUNG.email)}</a> mit dem Betreff „${escapeHtml(ABMELDUNG.betreff)}" genügt.`;
    const html = `<hr style="border:none;border-top:1px solid #E5E0D8;margin:20px 0 12px">`
        + `<p style="${p}">${absenderZeilen.map(escapeHtml).join('<br>')}</p>`
        + `<p style="${p}">${herkunft ? escapeHtml(herkunft) + '<br>' : ''}${abmeldungHtml}</p>`
        + `<p style="${p}">${escapeHtml(widerspruch)}</p>`;

    return { text, html, herkunft, abmeldung, widerspruch, listUnsubscribe: lu };
}

/** Hängt HTML vor das letzte schließende </div> des Mail-Bodys. */
function injectHtml(bodyHtml, block) {
    if (!bodyHtml) return block;
    if (/<\/div>\s*$/.test(bodyHtml)) return bodyHtml.replace(/<\/div>\s*$/, () => block + '</div>');
    return bodyHtml + block;
}

/** Setzt body/copyText einer Variante aus Kern + Pflichtteil neu zusammen. */
export function setzeVarianteZusammen(v) {
    if (!v) return v;
    const kern = typeof v.textKern === 'string' ? v.textKern : (v.body || '');
    const pflicht = v.pflichtteil?.text || '';
    v.textKern = kern;
    v.body = kern + pflicht;
    v.copyText = `Betreff: ${v.subject}\n\n${v.body}`;
    return v;
}

/**
 * Dekoriert ein Outreach-Pack für eine erlaubte E-Mail: Pflichtteil an jede
 * Variante, Empfänger aus der Prüfung (bei Double-Opt-In ausschliesslich die
 * eingewilligte Adresse). Lässt das Original unangetastet.
 *
 * Ohne erlaubte Prüfung bleibt das Pack unverändert und trägt
 * `complianceApplied:false` — die Ausgänge blockieren es dann (nurMitGrundlage).
 *
 * @param {object} pack      Ergebnis von buildOutreachPack
 * @param {object|null} contact  { allEmails[], emails[], genericEmails[] }
 * @param {object} profile   config.profile
 * @param {object|null} pruefung  Ergebnis von pruefeMailErlaubnis
 * @returns {object}
 */
export function compliancify(pack, contact = null, profile = {}, pruefung = null) {
    if (!pack || !pack.available) return pack;
    const cb = complianceBlock(profile, pruefung);
    if (!cb) return { ...pack, complianceApplied: false, grundlage: pruefung || null };

    const recipientEmail = pruefung.grundlage === 'doi'
        ? pruefung.empfaenger
        : (pruefung.empfaenger
            || normalisiereEmail(contact?.allEmails?.[0])
            || normalisiereEmail(contact?.emails?.[0])
            || normalisiereEmail(contact?.genericEmails?.[0])
            || normalisiereEmail(pack.recipientEmail)
            || null);

    const variants = (pack.variants || []).map(v => setzeVarianteZusammen({
        ...v,
        textKern: v.body,
        pflichtteil: { text: cb.text, html: cb.html },
        bodyHtml: injectHtml(v.bodyHtml, cb.html)
    }));

    return {
        ...pack,
        recipientEmail,
        variants,
        primary: variants[0] || pack.primary,
        complianceApplied: true,
        grundlage: pruefung,
        listUnsubscribe: cb.listUnsubscribe
    };
}
