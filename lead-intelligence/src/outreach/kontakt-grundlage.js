/**
 * Kontakt-Gate — darf dieser Lead über diesen Kanal angeschrieben werden?
 *
 * Einzige Stelle, an der das entschieden wird (Vertrag V9). Jeder Nachrichten-
 * Ausgang (Outreach-Studio, Einzel-Check, Pitch-Mail, LinkedIn, Anruf-Leitfaden,
 * Brief, Gmail-Entwürfe, .mbox) fragt hier — die Oberfläche zeigt nur an, was
 * diese Funktion sagt.
 *
 * Rechtsrahmen, auf den die Regeln abgebildet sind:
 *   • E-Mail: vorherige ausdrückliche Einwilligung (§ 7 Abs. 2 Nr. 2 UWG) — hier
 *     als bestätigtes Double-Opt-In —, eine Antwort auf eine Anfrage des Betriebs
 *     (nur zu deren Gegenstand) oder ein Bestandskunde (§ 7 Abs. 3 UWG).
 *   • LinkedIn/XING: dieselbe Einwilligungspflicht. Die Double-Opt-In-Einwilligung
 *     (Text V1) umfasst ausdrücklich nur E-Mails, § 7 Abs. 3 UWG nur die beim
 *     Auftrag erhaltene E-Mail-Adresse → hier trägt allein die Anfrage.
 *   • Anruf: konkreter, vorher dokumentierter Anlass aus der Sphäre des Betriebs
 *     → Anfrage oder Bestandskunde mit Datum und Nachweis.
 *   • Brief: ohne Einwilligung zulässig, solange kein Widerspruch vorliegt.
 *   • Sperrliste oder Werbewiderspruch im Impressum: über KEINEN Kanal.
 *
 * „Nicht gemessen" ist nicht „negativ gemessen": Sind die Einwilligungen nicht
 * lesbar, blockiert das Gate eine Double-Opt-In-Mail trotzdem (ohne Prüfung kein
 * Versand), sagt aber „nicht prüfbar" statt „keine Einwilligung".
 *
 * Reine Funktionen (kein DOM, kein Netz) — node-testbar.
 *
 * @module outreach/kontakt-grundlage
 */
import { normalisiereKontaktGrundlage, hatWerbewiderspruch, datumDe, KONTAKT_GRUNDLAGE_LABELS } from '../crm/leads.js';
import { einwilligungenFuerLead, normalisiereEmail, MAX_SEQUENZ_SCHRITTE } from '../crm/consents.js';
import { normalizeDomain } from '../crm/suppression.js';

export const KANAELE = {
    email: 'E-Mail',
    linkedin: 'LinkedIn/XING',
    anruf: 'Anruf',
    brief: 'Brief'
};

export const RECHTSHINWEISE = {
    email: 'Werbe-E-Mails an Unternehmen brauchen eine vorherige ausdrückliche Einwilligung (§ 7 Abs. 2 Nr. 2 UWG), eine Anfrage des Betriebs oder eine Bestandskundenbeziehung (§ 7 Abs. 3 UWG). Ein Opt-out oder das Impressum ersetzen das nicht.',
    linkedin: 'Nachrichten über LinkedIn oder XING brauchen wie E-Mails eine vorherige ausdrückliche Einwilligung (§ 7 Abs. 2 Nr. 2 UWG). Sie sind kein Ersatz dafür.',
    anruf: 'Ein Werbeanruf braucht einen konkreten, vor dem Anruf dokumentierten Anlass aus der Sphäre des Betriebs. Das Risiko einer Fehleinschätzung trägt der Anrufer.',
    brief: 'Ein Brief ist ohne Einwilligung zulässig, solange kein Widerspruch vorliegt. Der Widerspruchshinweis steht im Brief.'
};

const EIN_TAG_MS = 24 * 60 * 60 * 1000;

/** Wie viele E-Mails wurden aus dem Studio auf Grundlage dieser Einwilligung versandt? */
export function manuelleDoiMails(lead, einwilligungId) {
    const n = Number(lead?.einwilligungsMails?.[einwilligungId]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Empfänger aus dem Lead für Anfrage/Bestandskunde. `contactEmail` bleibt bewusst
 * aussen vor: Alt-Leads tragen dort eine früher geratene info@-Adresse.
 */
export function empfaengerAusLead(lead) {
    if (!lead) return null;
    const cd = lead.contactData || {};
    const kandidaten = [
        lead.email, lead.contact?.email,
        ...(Array.isArray(cd.emails) ? cd.emails : []),
        ...(Array.isArray(cd.allEmails) ? cd.allEmails : []),
        ...(Array.isArray(cd.genericEmails) ? cd.genericEmails : [])
    ];
    for (const k of kandidaten) {
        const e = normalisiereEmail(k);
        if (e) return e;
    }
    return null;
}

function istGesperrt(lead, gesperrt) {
    return gesperrt === true || lead?.suppressed === true;
}

/**
 * @param {object} lead  CRM-Lead (oder lead-artiges Objekt aus dem Einzel-Check)
 * @param {object} [opts]
 * @param {Array}   [opts.einwilligungen=[]]         normalisierte Einwilligungen (V8)
 * @param {boolean} [opts.gesperrt=false]            Domain steht auf der Sperrliste
 * @param {boolean} [opts.einwilligungenGeladen=true] false = Einwilligungen nicht lesbar
 * @param {'email'|'linkedin'|'anruf'|'brief'} [opts.kanal='email']
 * @param {number}  [opts.now=Date.now()]
 * @returns {{erlaubt:boolean, grundlage:string, grund:string, einwilligung:object|null,
 *           empfaenger:string|null, kanal:string, rechtshinweis:string,
 *           hinweis?:string, vorschlag?:object, nichtPruefbar?:boolean, verbleibend?:number}}
 */
export function pruefeMailErlaubnis(lead, {
    einwilligungen = [],
    gesperrt = false,
    einwilligungenGeladen = true,
    kanal = 'email',
    now = Date.now()
} = {}) {
    const k = KANAELE[kanal] ? kanal : 'email';
    const kg = normalisiereKontaktGrundlage(lead?.kontaktGrundlage);
    const art = kg.art;
    const rechtshinweis = RECHTSHINWEISE[k];
    const nein = (grund, extra = {}) => ({
        erlaubt: false, grundlage: art, grund, einwilligung: null, empfaenger: null, kanal: k, rechtshinweis, ...extra
    });
    const ja = (grund, extra = {}) => ({
        erlaubt: true, grundlage: art, grund, einwilligung: null, empfaenger: null, kanal: k, rechtshinweis, ...extra
    });

    // 1) Werbewiderspruch und Sperrliste schlagen alles — auch den Brief. Der
    //    Widerspruch zuerst: er ist die genauere Ursache, wenn beides zutrifft
    //    (ein gefundener Widerspruch landet sofort auch auf der Sperrliste).
    // `gesperrt:true` kennzeichnet beide Fälle: dort hilft keine Grundlage, der
    // Einwilligungs-Rechtshinweis wäre in der Anzeige irreführend.
    if (hatWerbewiderspruch(lead)) {
        return nein('Werbewiderspruch im Impressum — dieser Betrieb darf über keinen Kanal beworben werden.', { gesperrt: true });
    }
    if (istGesperrt(lead, gesperrt)) {
        return nein('Auf der Sperrliste (abgemeldet, kein Interesse oder unzustellbar) — dieser Betrieb wird nicht mehr kontaktiert.', { gesperrt: true });
    }

    // 2) Brief — ohne Einwilligung zulässig.
    if (k === 'brief') {
        return ja('Brief ohne Einwilligung zulässig, solange kein Widerspruch vorliegt.');
    }

    // 3) Double-Opt-In.
    const treffer = einwilligungenGeladen ? einwilligungenFuerLead(lead, einwilligungen, now) : [];
    const tragend = treffer.find(t => t.status === 'bestaetigt')?.einwilligung || null;

    if (art === 'doi') {
        if (!einwilligungenGeladen) {
            return nein('Einwilligungen konnten nicht gelesen werden — die Double-Opt-In-Grundlage ist gerade nicht prüfbar. Ohne Prüfung keine Nachricht.', { nichtPruefbar: true });
        }
        if (!tragend) {
            const juengste = treffer[0];
            const texte = {
                widerrufen: `Einwilligung widerrufen${juengste?.einwilligung?.revokedAt ? ` am ${datumDe(juengste.einwilligung.revokedAt)}` : ''} — die Grundlage ist entfallen.`,
                gestoppt: 'Nachfass-Strecke gestoppt — auf Grundlage dieser Einwilligung geht nichts mehr hinaus.',
                offen: 'Einwilligung noch nicht bestätigt — ohne Bestätigung trägt sie nicht.',
                abgelaufen: 'Einwilligung nie bestätigt und abgelaufen — sie trägt nicht.'
            };
            return nein(juengste ? texte[juengste.status] : 'Keine bestätigte Einwilligung zu E-Mail-Adresse oder Domain dieses Leads gefunden.');
        }
        if (k !== 'email') {
            return nein(`Die Einwilligung umfasst nur E-Mails — für ${KANAELE[k]} trägt sie nicht.`);
        }
        const empfaenger = normalisiereEmail(tragend.email);
        if (!empfaenger) {
            return nein('Die Einwilligung trägt keine E-Mail-Adresse — es gibt keinen zulässigen Empfänger.');
        }
        const serverSchritte = Number(tragend.sequenceStep) || 0;
        const versandt = serverSchritte + manuelleDoiMails(lead, tragend.id);
        if (versandt >= MAX_SEQUENZ_SCHRITTE) {
            return nein(`Die Einwilligung deckt höchstens ${MAX_SEQUENZ_SCHRITTE} E-Mails — ${versandt} sind bereits versandt.`);
        }
        // Die Server-Strecke (einwilligungSequenz) sendet nach der Bestätigung selbst
        // bis zu drei E-Mails und kennt die Studio-Zähler nicht. Solange sie einen
        // Termin hat, schöpft sie das Kontingent aus — jede zusätzliche E-Mail von
        // hier wäre die vierte und damit nicht mehr von der Einwilligung gedeckt.
        if (tragend.nextSendAt) {
            return nein(`Die automatische Nachfass-Strecke dieser Einwilligung sendet noch ${MAX_SEQUENZ_SCHRITTE - serverSchritte} von ${MAX_SEQUENZ_SCHRITTE} E-Mails — eine zusätzliche E-Mail wäre nicht von der Einwilligung gedeckt.`, { strecke: true });
        }
        return {
            ...ja(`Double-Opt-In vom ${datumDe(tragend.confirmedAt)} (${empfaenger}).`, {
                hinweis: `Nur an die eingewilligte Adresse ${empfaenger}. Noch ${MAX_SEQUENZ_SCHRITTE - versandt} von ${MAX_SEQUENZ_SCHRITTE} E-Mails abgedeckt.`,
                verbleibend: MAX_SEQUENZ_SCHRITTE - versandt,
                datum: tragend.confirmedAt ? new Date(tragend.confirmedAt).toISOString() : null
            }),
            grundlage: 'doi',
            einwilligung: tragend,
            empfaenger
        };
    }

    // 4) Anfrage / Bestandskunde — nur mit Datum UND Nachweis.
    if (art === 'anfrage' || art === 'bestandskunde') {
        const datumMs = kg.datum ? Date.parse(kg.datum) : NaN;
        if (!kg.datum || !kg.nachweis || !Number.isFinite(datumMs)) {
            return nein(`${KONTAKT_GRUNDLAGE_LABELS[art]} ohne Datum und Nachweis — ohne beides trägt diese Grundlage nicht.`);
        }
        if (datumMs > now + EIN_TAG_MS) {
            return nein(`${KONTAKT_GRUNDLAGE_LABELS[art]}: Das Datum liegt in der Zukunft — bitte korrigieren.`);
        }
        if (k === 'linkedin' && art === 'bestandskunde') {
            return nein('Für Bestandskunden gilt die Ausnahme nur für die beim Auftrag erhaltene E-Mail-Adresse (§ 7 Abs. 3 UWG), nicht für LinkedIn oder XING.');
        }
        // Das Gate kann nicht wissen, WELCHE der gefundenen Adressen die richtige ist —
        // der Hinweis steht deshalb neben dem angezeigten Empfänger.
        // § 7 Abs. 3 UWG deckt nur die beim Verkauf vom Kunden erhaltene Adresse.
        const hinweis = art === 'anfrage'
            ? (k === 'email'
                ? 'Nur zum Gegenstand der Anfrage schreiben — an die Adresse, von der die Anfrage kam.'
                : 'Nur zum Gegenstand der Anfrage.')
            : (k === 'email'
                ? 'Nur an die beim Auftrag erhaltene E-Mail-Adresse und nur für eigene ähnliche Leistungen; der Widerspruchshinweis gehört in jede Nachricht.'
                : 'Nur zu eigenen ähnlichen Leistungen.');
        return ja(`${KONTAKT_GRUNDLAGE_LABELS[art]} vom ${datumDe(kg.datum)} — ${kg.nachweis}`, {
            hinweis,
            datum: kg.datum,
            empfaenger: k === 'email' ? empfaengerAusLead(lead) : null
        });
    }

    // 5) Keine Grundlage.
    if (tragend) {
        return nein('Keine Kontaktgrundlage eingetragen. Eine bestätigte Einwilligung liegt vor — übernehmen Sie sie im CRM als Grundlage.', { vorschlag: tragend });
    }
    return nein(`Keine Kontaktgrundlage für ${KANAELE[k]}.`);
}

/**
 * Letzte Schranke vor Gmail/.mbox: nur Entwürfe, deren mitgeführte Prüfung
 * erlaubt ist und die einen Empfänger haben.
 * @param {Array<{to?:string, grundlage?:object}>} drafts
 * @returns {{erlaubt:Array, blockiert:Array}}
 */
export function nurMitGrundlage(drafts = []) {
    const erlaubt = [];
    const blockiert = [];
    for (const d of Array.isArray(drafts) ? drafts : []) {
        if (d?.grundlage?.erlaubt === true && d.grundlage.kanal === 'email' && normalisiereEmail(d.to)) erlaubt.push(d);
        else blockiert.push(d);
    }
    return { erlaubt, blockiert };
}

/**
 * Lead-artiges Objekt für den Einzel-Check: Kontaktgrundlage und Zähler aus dem
 * gespeicherten CRM-Lead (falls vorhanden), frische Kontaktdaten aus der Analyse.
 * Ein Werbewiderspruch ist klebrig — gesehen ist gesehen.
 */
export function leadAusCheck(data, gespeicherteLeads = []) {
    let domain = '';
    try { domain = normalizeDomain(new URL(data?.url).hostname); } catch { domain = normalizeDomain(data?.domain); }
    const liste = Array.isArray(gespeicherteLeads) ? gespeicherteLeads : [];
    const gespeichert = domain ? liste.find(l => normalizeDomain(l?.domain) === domain) || null : null;
    const widerspruch = data?.contactData?.werbewiderspruch === true || hatWerbewiderspruch(gespeichert);
    return {
        ...(gespeichert || {}),
        domain: gespeichert?.domain || domain,
        contactData: {
            ...(gespeichert?.contactData || {}),
            ...(data?.contactData || {}),
            ...(widerspruch ? { werbewiderspruch: true } : {})
        }
    };
}
