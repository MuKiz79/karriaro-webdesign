/**
 * Lead Storage — Firestore + localStorage Dual-Sync
 *
 * Zusatzfelder am Lead (2026-09-10):
 *   kontaktGrundlage {art:'doi'|'anfrage'|'bestandskunde'|'keine', datum:ISO|null, nachweis:string|null}
 *   quelle           'scan'|'ads'|'check'|'partner'|'empfehlung'|'sonstiges' | null (= nicht angegeben)
 *   partnerCode      string|null
 *   provision        {satz:0.10, status:'offen'|'faellig'|'bezahlt', betragNetto:number|null} | null
 *                    betragNetto = Netto-Auftragswert des Abschlusses; die Provision ist satz × betragNetto
 *   verlustGrund     id aus VERLUST_GRUENDE | null
 *   contactData.werbewiderspruch  true, sobald ein Werbewiderspruch im Impressum gemeldet wurde
 *
 * ⚠️ `rating` ist die GOOGLE-Bewertung des Betriebs — keine eigenen Felder damit mischen.
 */
import { logReply } from '../learning/ab-test.js';
import { addSuppression } from './suppression.js';
import { zuMillis, einwilligungenFuerLead, EINWILLIGUNGS_QUELLEN } from './consents.js';

function fb() { return typeof window !== 'undefined' ? window.__firebase : undefined; }
// Wie firebase.js currentUser(), aber ohne `window` nicht werfend — updateLead läuft
// auch aus Hilfsmodulen (reminders.js), die unter Vitest ohne Browser getestet werden.
function currentUser() { return fb()?.auth?.currentUser || null; }

// ── Helper: localStorage lesen/schreiben ──
function getLocal() { return JSON.parse(localStorage.getItem('karriaro_leads') || '[]'); }
function setLocal(leads) { localStorage.setItem('karriaro_leads', JSON.stringify(leads)); }

// ══════════════════════════════════════
// Kontaktgrundlage, Quelle, Partner-Provision — Normalisierung
// ══════════════════════════════════════

export const KONTAKT_GRUNDLAGE_ARTEN = ['doi', 'anfrage', 'bestandskunde', 'keine'];
export const KONTAKT_GRUNDLAGE_LABELS = {
    doi: 'Double-Opt-In',
    anfrage: 'Anfrage des Betriebs',
    bestandskunde: 'Bestandskunde',
    keine: 'Keine Grundlage'
};
export const KONTAKT_GRUNDLAGE_ERKLAERUNG = {
    doi: 'Bestätigte Einwilligung per Double-Opt-In. Sie trägt nur, solange sie nicht widerrufen und die Nachfass-Strecke nicht gestoppt ist.',
    anfrage: 'Der Betrieb hat selbst angefragt. Antworten Sie nur zum Gegenstand seiner Anfrage. Datum und Nachweis sind Pflicht.',
    bestandskunde: 'Bestandskunde nach § 7 Abs. 3 UWG: nur an die E-Mail-Adresse, die Sie beim Verkauf vom Kunden erhalten haben, nur für eigene ähnliche Leistungen, nur ohne Widerspruch des Kunden; Widerspruchshinweis bei der Erhebung und in jeder E-Mail. Datum und Nachweis sind Pflicht.',
    keine: 'Keine Grundlage: keine E-Mail und keine Nachricht über LinkedIn, XING, WhatsApp oder fremde Kontaktformulare.'
};

export const QUELLEN = ['scan', 'ads', 'check', 'partner', 'empfehlung', 'sonstiges'];
export const QUELLEN_LABELS = {
    scan: 'Scan',
    ads: 'Google Ads',
    check: 'Website-Check',
    partner: 'Partner',
    empfehlung: 'Empfehlung',
    sonstiges: 'Sonstiges'
};

export const PROVISION_SATZ = 0.10;
export const PROVISION_STATUS = ['offen', 'faellig', 'bezahlt'];
export const PROVISION_STATUS_LABELS = { offen: 'Offen', faellig: 'Fällig', bezahlt: 'Bezahlt' };

/** Verlust-Gründe beim Status 'verloren'. `sperrgrund` → Eintrag in die Sperrliste. */
export const VERLUST_GRUENDE = [
    { id: 'kein_interesse', label: 'Kein Interesse / abgemeldet', sperrgrund: 'opt_out' },
    { id: 'kein_budget', label: 'Kein Budget' },
    { id: 'anderer_anbieter', label: 'Anderer Anbieter' },
    { id: 'nicht_erreichbar', label: 'Nicht erreichbar' },
    { id: 'sonstiges', label: 'Sonstiges' }
];

export function sperrgrundFuerVerlust(grundId) {
    return VERLUST_GRUENDE.find(g => g.id === grundId)?.sperrgrund || null;
}

/** Datum → ISO-String. Akzeptiert 'YYYY-MM-DD' (Datumsfeld), ISO, ms, Date, Timestamp. Unlesbar → null. */
export function normalisiereDatum(v) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        const ms = Date.parse(`${v.trim()}T00:00:00.000Z`);
        return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    const ms = zuMillis(v);
    return ms ? new Date(ms).toISOString() : null;
}

function kurzText(v, max) {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
    return s || null;
}

/** Vertrag V9. Unbekannte Art → 'keine'; bei 'keine' werden Datum und Nachweis verworfen. */
export function normalisiereKontaktGrundlage(input) {
    const art = KONTAKT_GRUNDLAGE_ARTEN.includes(input?.art) ? input.art : 'keine';
    if (art === 'keine') return { art, datum: null, nachweis: null };
    return {
        art,
        datum: normalisiereDatum(input?.datum),
        nachweis: kurzText(input?.nachweis, 500)
    };
}

/** Gültige Quelle oder null (= nicht angegeben — nie ein erfundener Default). */
export function normalisiereQuelle(q) {
    return QUELLEN.includes(q) ? q : null;
}

/** Anzeige-Quelle: gespeicherte Quelle, sonst aus dem Scanner-Feld `source` ableitbar, sonst null. */
export function leiteQuelleAb(lead) {
    return normalisiereQuelle(lead?.quelle) || (lead?.source === 'scanner_workspace' ? 'scan' : null);
}

export function normalisierePartnerCode(v) {
    if (v == null) return null;
    const s = String(v).normalize('NFC').replace(/[^\p{L}\d_.-]/gu, '').slice(0, 40);
    return s || null;
}

/** Betrag → Zahl mit höchstens zwei Nachkommastellen. Deutsche Schreibweise („1.290,50 €") wird verstanden. */
export function normalisiereBetrag(v) {
    if (v == null || v === '') return null;
    let n;
    if (typeof v === 'number') {
        n = v;
    } else {
        let s = String(v).replace(/[€\s\u00A0\u202F]/g, '');
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
        n = Number(s);
    }
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
}

export function normalisiereProvision(p) {
    const satz = Number(p?.satz);
    return {
        satz: Number.isFinite(satz) && satz > 0 && satz <= 1 ? satz : PROVISION_SATZ,
        status: PROVISION_STATUS.includes(p?.status) ? p.status : 'offen',
        betragNetto: normalisiereBetrag(p?.betragNetto)
    };
}

/**
 * Provision wird erst mit vollständigem Zahlungseingang fällig. Das CRM kennt den
 * Zahlungseingang nicht als eigenes Feld — die schwächste belastbare Bedingung ist
 * deshalb der Lead-Status 'kunde'. Vorher bleibt nur 'offen'.
 */
export function provisionStatusErlaubt(leadStatus, provisionStatus) {
    if (provisionStatus === 'offen') return true;
    if (!PROVISION_STATUS.includes(provisionStatus)) return false;
    return leadStatus === 'kunde';
}

export function hatWerbewiderspruch(lead) {
    return lead?.contactData?.werbewiderspruch === true;
}

/** Meldet ein Speicher-/Update-Payload einen Werbewiderspruch (enrichContact, V3)? */
export function werbewiderspruchGemeldet(data) {
    return data?.contactData?.werbewiderspruch === true
        || data?.contact?.werbewiderspruch === true
        || data?.werbewiderspruch === true;
}

/** Bereinigt die neuen Felder in einem Update-Objekt (nur Schlüssel, die vorhanden sind). */
export function bereinigeLeadUpdates(updates = {}) {
    const u = { ...updates };
    if ('kontaktGrundlage' in u) u.kontaktGrundlage = normalisiereKontaktGrundlage(u.kontaktGrundlage);
    if ('quelle' in u) u.quelle = normalisiereQuelle(u.quelle);
    if ('partnerCode' in u) u.partnerCode = normalisierePartnerCode(u.partnerCode);
    if ('provision' in u) u.provision = u.provision == null ? null : normalisiereProvision(u.provision);
    if ('verlustGrund' in u) u.verlustGrund = VERLUST_GRUENDE.some(g => g.id === u.verlustGrund) ? u.verlustGrund : null;
    return u;
}

/** Geladenen Lead (Firestore oder localStorage) auf die bekannten Feldformen bringen. */
export function normalisiereGeladenenLead(lead) {
    return {
        ...lead,
        status: lead.status || 'neu',
        kontaktGrundlage: normalisiereKontaktGrundlage(lead.kontaktGrundlage),
        quelle: normalisiereQuelle(lead.quelle),
        partnerCode: normalisierePartnerCode(lead.partnerCode),
        provision: lead.provision ? normalisiereProvision(lead.provision) : null
    };
}

export function datumDe(v) {
    const ms = zuMillis(v);
    return ms ? new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }) : '';
}

/**
 * Zeitpunkt → 'YYYY-MM-DD' in Europe/Berlin (Wert für <input type="date">).
 * Dieselbe Zeitzone wie datumDe — sonst zeigt das Feld für eine Bestätigung um
 * 23:30 UTC einen anderen Tag als die Karte daneben.
 */
export function datumFuerEingabe(v) {
    const ms = zuMillis(v);
    if (!ms) return '';
    const teile = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date(ms))
        .reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    return teile.year && teile.month && teile.day ? `${teile.year}-${teile.month}-${teile.day}` : '';
}

/**
 * Formularwerte der CRM-Karte → Update-Objekt für updateLead, samt Prüfung.
 * Gespeichert wird nur, wenn `fehler` leer ist.
 *
 * Regeln:
 *   • Anfrage/Bestandskunde nur mit Datum UND Nachweis (V9 — ohne beides trägt es nicht).
 *   • Double-Opt-In lässt sich nur NEU eintragen, wenn eine bestätigte Einwilligung zu
 *     E-Mail oder Domain vorliegt; Datum/Nachweis kommen dann aus der Einwilligung.
 *     Ein schon gespeichertes 'doi' blockiert andere Änderungen nicht (sonst liesse sich
 *     nach einem Widerruf nicht einmal die Quelle ändern) — die Karte zeigt „entfallen".
 *   • Datum: bleibt der Tag unverändert, bleibt der gespeicherte Zeitpunkt erhalten
 *     (ein Datumsfeld kennt keine Uhrzeit und würde den Nachweis sonst verfälschen).
 *   • Provision entsteht nur mit Partner-Bezug (Quelle 'partner', Partnercode, Betrag
 *     oder Status ≠ offen); 'fällig'/'bezahlt' nur bei Lead-Status 'kunde'.
 *
 * @param {{kgArt?:string, kgDatum?:string, kgNachweis?:string, quelle?:string,
 *          partnerCode?:string, provisionStatus?:string, provisionBetrag?:string}} werte
 * @param {object} lead
 * @param {{einwilligungen?:Array, geladen?:boolean}} [ctx]
 * @returns {{updates:object, fehler:string[]}}
 */
export function baueDetailUpdates(werte = {}, lead = {}, { einwilligungen = [], geladen = false } = {}) {
    const fehler = [];
    const bisher = normalisiereKontaktGrundlage(lead?.kontaktGrundlage);
    const art = KONTAKT_GRUNDLAGE_ARTEN.includes(werte.kgArt) ? werte.kgArt : 'keine';

    let kontaktGrundlage;
    if (art === 'doi' && bisher.art !== 'doi') {
        const tragend = geladen ? einwilligungenFuerLead(lead, einwilligungen).find(t => t.status === 'bestaetigt')?.einwilligung : null;
        if (!geladen) fehler.push('Einwilligungen nicht lesbar — Double-Opt-In lässt sich gerade nicht eintragen.');
        else if (!tragend) fehler.push('Keine bestätigte Einwilligung zu E-Mail oder Domain dieses Leads — Double-Opt-In lässt sich nicht eintragen.');
        kontaktGrundlage = tragend ? kontaktGrundlageAusEinwilligung(tragend) : bisher;
    } else {
        const tag = typeof werte.kgDatum === 'string' ? werte.kgDatum.trim() : '';
        const datum = !tag ? null : (bisher.datum && datumFuerEingabe(bisher.datum) === tag ? bisher.datum : tag);
        kontaktGrundlage = normalisiereKontaktGrundlage({ art, datum, nachweis: werte.kgNachweis });
        if (tag && !kontaktGrundlage.datum && art !== 'keine') fehler.push('Datum nicht lesbar.');
        if ((art === 'anfrage' || art === 'bestandskunde') && (!kontaktGrundlage.datum || !kontaktGrundlage.nachweis)) {
            fehler.push(`${KONTAKT_GRUNDLAGE_LABELS[art]}: Datum und Nachweis sind Pflicht.`);
        }
    }

    const quelle = normalisiereQuelle(werte.quelle);
    const partnerCode = normalisierePartnerCode(werte.partnerCode);
    const betragRoh = typeof werte.provisionBetrag === 'string' ? werte.provisionBetrag.trim() : werte.provisionBetrag;
    const betrag = normalisiereBetrag(betragRoh);
    if (betragRoh !== undefined && betragRoh !== null && betragRoh !== '' && betrag === null) {
        fehler.push('Auftragswert netto nicht lesbar (z. B. 1.290 oder 1290,50).');
    }

    const status = PROVISION_STATUS.includes(werte.provisionStatus) ? werte.provisionStatus : 'offen';
    let provision = null;
    if (quelle === 'partner' || partnerCode || betrag !== null || status !== 'offen') {
        provision = normalisiereProvision({ satz: lead?.provision?.satz, status, betragNetto: betrag });
        const bisherStatus = lead?.provision ? normalisiereProvision(lead.provision).status : 'offen';
        if (provision.status !== bisherStatus && !provisionStatusErlaubt(lead?.status, provision.status)) {
            fehler.push('„Fällig" oder „Bezahlt" erst, wenn der Lead Kunde ist und der Zahlungseingang vollständig verbucht ist.');
        }
    }

    return { updates: { kontaktGrundlage, quelle, partnerCode, provision }, fehler };
}

/** Provisionsbetrag (Satz × Auftragswert netto) oder null, wenn kein Auftragswert erfasst ist. */
export function provisionsBetrag(provision) {
    if (!provision) return null;
    const p = normalisiereProvision(provision);
    return p.betragNetto === null ? null : Math.round(p.betragNetto * p.satz * 100) / 100;
}

/** Kontaktgrundlage aus einer bestätigten Einwilligung (Vorschlag 'doi'). */
export function kontaktGrundlageAusEinwilligung(e) {
    const teile = [`Einwilligung ${e?.id || ''}`.trim()];
    if (e?.email) teile.push(`an ${e.email}`);
    if (e?.textVersion) teile.push(`Textversion ${e.textVersion}`);
    if (e?.source) teile.push(`Quelle ${EINWILLIGUNGS_QUELLEN[e.source] || e.source}`);
    return normalisiereKontaktGrundlage({ art: 'doi', datum: e?.confirmedAt ?? null, nachweis: teile.join(', ') });
}

/**
 * Anzeige-Befund zur Kontaktgrundlage eines Leads — für die CRM-Karte, NICHT das
 * Versand-Gate (das ist outreach/kontakt-grundlage.js). Die Regeln sind dieselben
 * (V9); die DOI-Zuordnung kommt aus consents.js, damit es nur eine gibt.
 *
 * stufe:
 *   'gesperrt'       Sperrliste oder Werbewiderspruch — nie Werbung
 *   'traegt'         Grundlage vollständig und (bei DOI) durch eine bestätigte Einwilligung gedeckt
 *   'unvollstaendig' Anfrage/Bestandskunde ohne Datum oder Nachweis
 *   'entfallen'      DOI eingetragen, aber keine tragende Einwilligung (widerrufen, gestoppt, offen)
 *   'nicht_pruefbar' DOI eingetragen, Einwilligungen konnten nicht gelesen werden
 *   'keine'          keine Grundlage
 * vorschlag: bestätigte Einwilligung, wenn art nicht schon 'doi' ist
 *
 * @returns {{stufe:string, text:string, vorschlag:object|null}}
 */
export function beurteileKontaktGrundlage(lead, { einwilligungen = [], geladen = false, gesperrt = false, vollstaendig = true } = {}) {
    const kg = normalisiereKontaktGrundlage(lead?.kontaktGrundlage);
    const treffer = geladen ? einwilligungenFuerLead(lead, einwilligungen) : [];
    const tragend = treffer.find(t => t.status === 'bestaetigt')?.einwilligung || null;

    if (gesperrt || hatWerbewiderspruch(lead)) {
        return {
            stufe: 'gesperrt',
            text: hatWerbewiderspruch(lead)
                ? 'Werbewiderspruch im Impressum — dieser Betrieb darf nicht beworben werden.'
                : 'Auf der Sperrliste — dieser Betrieb wird nicht mehr kontaktiert.',
            vorschlag: null
        };
    }

    const vorschlag = kg.art !== 'doi' ? tragend : null;

    if (kg.art === 'doi') {
        if (!geladen) {
            return { stufe: 'nicht_pruefbar', text: 'Einwilligungen nicht lesbar — die Double-Opt-In-Grundlage lässt sich gerade nicht prüfen.', vorschlag: null };
        }
        if (tragend) {
            return { stufe: 'traegt', text: `Double-Opt-In vom ${datumDe(tragend.confirmedAt)} (${tragend.email || tragend.domain || 'ohne Adresse'}).`, vorschlag: null };
        }
        const juengste = treffer[0];
        // Nur die neuesten Einwilligungen gelesen (Lese-Limit erreicht): kein Treffer
        // heisst dann „nicht gesehen", nicht „gibt es nicht".
        if (!juengste && vollstaendig === false) {
            return { stufe: 'nicht_pruefbar', text: 'Nur die neuesten Einwilligungen gelesen — zu diesem Lead ist keine darunter. Die Double-Opt-In-Grundlage lässt sich hier nicht prüfen.', vorschlag: null };
        }
        const texte = {
            widerrufen: `Einwilligung widerrufen${juengste?.einwilligung.revokedAt ? ` am ${datumDe(juengste.einwilligung.revokedAt)}` : ''} — die Grundlage ist entfallen.`,
            gestoppt: 'Nachfass-Strecke gestoppt — aus dieser Einwilligung gehen keine E-Mails mehr hinaus.',
            offen: 'Einwilligung noch nicht bestätigt — ohne Bestätigung trägt sie nicht.',
            abgelaufen: 'Einwilligung nie bestätigt und abgelaufen — sie trägt nicht.'
        };
        return {
            stufe: 'entfallen',
            text: juengste ? texte[juengste.status] : 'Keine bestätigte Einwilligung zu E-Mail oder Domain dieses Leads gefunden.',
            vorschlag: null
        };
    }

    if (kg.art === 'anfrage' || kg.art === 'bestandskunde') {
        if (kg.datum && kg.nachweis) {
            return { stufe: 'traegt', text: `${KONTAKT_GRUNDLAGE_LABELS[kg.art]} vom ${datumDe(kg.datum)} — ${kg.nachweis}`, vorschlag };
        }
        return { stufe: 'unvollstaendig', text: 'Datum und Nachweis fehlen — ohne beides trägt diese Grundlage nicht.', vorschlag };
    }

    return { stufe: 'keine', text: 'Keine Grundlage für E-Mails oder Nachrichten.', vorschlag };
}

// ══════════════════════════════════════
// Speichern / Laden / Ändern
// ══════════════════════════════════════

export async function saveLead(domain, url, data = {}) {
    const id = domain.replace(/[^a-zA-Z0-9]/g, '_');
    const widerspruch = werbewiderspruchGemeldet(data);

    // Neue Felder nur übernehmen, wenn der Aufrufer sie ausdrücklich liefert —
    // ein erneutes Speichern (Re-Analyse) darf eine gesetzte Kontaktgrundlage,
    // Quelle oder Provision nie auf den Default zurücksetzen.
    const rest = { ...data };
    delete rest.kontaktGrundlage; delete rest.quelle; delete rest.partnerCode; delete rest.provision;
    const explizit = {};
    if (data.kontaktGrundlage !== undefined) explizit.kontaktGrundlage = normalisiereKontaktGrundlage(data.kontaktGrundlage);
    const quelle = normalisiereQuelle(data.quelle) || (data.source === 'scanner_workspace' ? 'scan' : null);
    if (quelle) explizit.quelle = quelle;
    if (data.partnerCode !== undefined) explizit.partnerCode = normalisierePartnerCode(data.partnerCode);
    if (data.provision !== undefined) explizit.provision = data.provision == null ? null : normalisiereProvision(data.provision);
    const defaults = { kontaktGrundlage: normalisiereKontaktGrundlage(null), quelle: null, partnerCode: null, provision: null };

    const entry = {
        domain, url, ...rest, ...explizit,
        status: 'neu', notes: '',
        savedAt: Date.now(),
        updatedAt: Date.now(),
        id
    };

    // localStorage — immer
    const local = getLocal();
    const idx = local.findIndex(l => l.domain === domain);
    const prev = idx >= 0 ? local[idx] : null;
    // Werbewiderspruch ist „klebrig": einmal gesehen, nie durch einen späteren Scan gelöscht.
    if (widerspruch || hatWerbewiderspruch(prev)) {
        entry.contactData = { ...(prev?.contactData || {}), ...(data.contactData || {}), werbewiderspruch: true };
    }
    if (prev) {
        // Bestehendes Lead updaten, Status/Notes behalten
        local[idx] = { ...defaults, ...prev, ...entry, status: prev.status || 'neu', notes: prev.notes || '' };
    } else {
        local.push({ ...defaults, ...entry });
    }
    setLocal(local);

    // Sperrliste — unabhängig von Login und Firestore
    let gesperrt = false;
    if (widerspruch) {
        const sp = await addSuppression(domain, 'opt_out');
        gesperrt = !!sp?.ok;
    }
    const zusatz = widerspruch ? { werbewiderspruch: true, gesperrt } : {};

    // Firestore
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true, ...zusatz };
    try {
        const ref = fb().fns.doc(fb().db, 'leads', `${user.uid}_${id}`);
        // Existiert das Dokument schon? Dann Status/Notizen NICHT überschreiben
        // (setDoc mit merge schrieb bisher status:'neu' und setzte eine laufende
        // Pipeline bei jeder Re-Analyse zurück). Nicht prüfbar → ebenfalls nicht
        // schreiben; loadLeads ergänzt einen fehlenden Status als 'neu'.
        let existiert = null;
        if (typeof fb().fns.getDoc === 'function') {
            try {
                const snap = await fb().fns.getDoc(ref);
                existiert = typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;
            } catch (e) {
                console.warn('Firestore Lead-Existenz nicht prüfbar — Status/Notizen bleiben unberührt:', e);
            }
        }
        const neu = existiert === false;
        await fb().fns.setDoc(ref, {
            uid: user.uid, domain, url,
            name: data.name || domain,
            type: data.type || '',
            rating: data.rating || null,
            reviews: data.reviews || 0,
            perf: data.perf || null,
            seo: data.seo || null,
            a11y: data.a11y || null,
            cms: data.cms || '',
            isBaukasten: data.isBaukasten || false,
            leadScore: data.leadScore || 0,
            conversionRate: data.conversionRate || 0,
            expectedValue: data.expectedValue || 0,
            ...(neu ? { status: 'neu', notes: '', ...defaults } : {}),
            ...explizit,
            // Nur das Flag — nie die ganze Impressums-Auswertung in die Cloud schreiben.
            ...(widerspruch ? { contactData: { werbewiderspruch: true } } : {}),
            // Outreach-Felder additiv — nur schreiben wenn vorhanden (Firestore
            // verträgt kein undefined; pitchInputs/contact werden via clean() bereits
            // undefined-frei geliefert).
            ...(data.pitchInputs ? { pitchInputs: data.pitchInputs } : {}),
            ...(data.outreachStatus ? { outreachStatus: data.outreachStatus } : {}),
            ...(data.contact ? { contact: data.contact } : {}),
            ...(data.aiTier ? { aiTier: data.aiTier } : {}),
            savedAt: fb().fns.serverTimestamp(),
            updatedAt: fb().fns.serverTimestamp()
        }, { merge: true });
        return { ok: true, firestoreSynced: true, ...zusatz };
    } catch (e) {
        console.error('Firestore save:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e), ...zusatz };
    }
}

export async function loadLeads() {
    const user = currentUser();
    if (user && fb()?.db) {
        try {
            const q = fb().fns.query(
                fb().fns.collection(fb().db, 'leads'),
                fb().fns.where('uid', '==', user.uid)
            );
            const snap = await fb().fns.getDocs(q);
            const leads = snap.docs.map(d => {
                const data = d.data();
                return normalisiereGeladenenLead({
                    id: d.id, ...data,
                    // Firestore Timestamps → Millisekunden normalisieren
                    savedAt: data.savedAt?.toMillis?.() || data.savedAt || 0,
                    updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || 0,
                    contactedAt: data.contactedAt?.toMillis?.() || data.contactedAt || null
                });
            });
            // Sync nach localStorage für Offline + Reminders
            setLocal(leads);
            leads.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
            return leads;
        } catch (e) { console.error('Firestore load:', e); }
    }
    const local = getLocal().map(normalisiereGeladenenLead);
    local.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return local;
}

export async function updateLead(leadId, updates) {
    const u = bereinigeLeadUpdates(updates);
    const widerspruch = werbewiderspruchGemeldet(u);

    // localStorage updaten (immer)
    const local = getLocal();
    const idx = local.findIndex(l => l.id === leadId);
    let prev = null;
    if (idx >= 0) {
        prev = local[idx];
        local[idx] = { ...prev, ...u, updatedAt: Date.now() };
        if (u.contactData || hatWerbewiderspruch(prev)) {
            local[idx].contactData = {
                ...(prev.contactData || {}), ...(u.contactData || {}),
                ...(widerspruch || hatWerbewiderspruch(prev) ? { werbewiderspruch: true } : {})
            };
        }
        // Automatisch contactedAt setzen wenn Status → kontaktiert
        if (u.status === 'kontaktiert' && !prev.contactedAt) {
            local[idx].contactedAt = Date.now();
        }
        // Antwort erfassen — die wichtigste Frühmetrik im Outbound.
        // NUR beim ERSTEN Übergang nach 'geantwortet' zählen: sonst würde jedes
        // erneute Speichern desselben Leads die Antwortquote aufblähen und das
        // Beta-Update in learning/ab-test.js verfälschen.
        if (u.status === 'geantwortet' && prev.status !== 'geantwortet' && !prev.repliedAt) {
            local[idx].repliedAt = Date.now();
            if (prev.pitchVariant) logReply(prev.pitchVariant);
        }
        setLocal(local);
    }

    let zusatz = {};
    if (widerspruch) {
        const domain = prev?.domain || u.domain || null;
        const sp = domain ? await addSuppression(domain, 'opt_out') : { ok: false };
        zusatz = { werbewiderspruch: true, gesperrt: !!sp?.ok };
    }

    // Firestore
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true, ...zusatz };
    try {
        const firestoreUpdates = { ...u, updatedAt: fb().fns.serverTimestamp() };
        // contactData als Pfad-Updates schreiben: updateDoc mit einer Map ersetzt
        // sonst die ganze Map und löscht damit einen früher gesetzten Werbewiderspruch.
        if (u.contactData) {
            delete firestoreUpdates.contactData;
            for (const [k, v] of Object.entries(u.contactData)) {
                if (v !== undefined) firestoreUpdates[`contactData.${k}`] = v;
            }
            if (widerspruch) firestoreUpdates['contactData.werbewiderspruch'] = true;
        }
        if (u.status === 'kontaktiert') {
            firestoreUpdates.contactedAt = fb().fns.serverTimestamp();
        }
        if (u.status === 'geantwortet') {
            firestoreUpdates.repliedAt = fb().fns.serverTimestamp();
        }
        const ref = fb().fns.doc(fb().db, 'leads', leadId);
        await fb().fns.updateDoc(ref, firestoreUpdates);
        return { ok: true, firestoreSynced: true, ...zusatz };
    } catch (e) {
        console.error('Update lead:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e), ...zusatz };
    }
}

export async function deleteLead(leadId) {
    // localStorage
    const local = getLocal();
    const filtered = local.filter(l => l.id !== leadId);
    setLocal(filtered);

    // Firestore
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true };
    try {
        await fb().fns.deleteDoc(fb().fns.doc(fb().db, 'leads', leadId));
        return { ok: true, firestoreSynced: true };
    } catch (e) {
        console.error('Delete lead:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e) };
    }
}

// ── Alle Leads löschen ──
// onProgress(done, total) ist optional — Caller kann Fortschritt anzeigen.
// Firestore-Deletes laufen in 10er-Chunks parallel, damit 200+ Leads nicht 16 s blocken.
export async function deleteAllLeads(onProgress = null) {
    // localStorage leeren
    setLocal([]);

    // Firestore: alle Leads des Users löschen
    const user = currentUser();
    if (!user || !fb()?.db) return { ok: true, firestoreSynced: true, deleted: 0 };
    try {
        const q = fb().fns.query(
            fb().fns.collection(fb().db, 'leads'),
            fb().fns.where('uid', '==', user.uid)
        );
        const snap = await fb().fns.getDocs(q);
        const docs = snap.docs;
        const total = docs.length;
        let done = 0;
        const CHUNK = 10;
        for (let i = 0; i < docs.length; i += CHUNK) {
            const chunk = docs.slice(i, i + CHUNK);
            await Promise.all(chunk.map(d => fb().fns.deleteDoc(d.ref)));
            done += chunk.length;
            if (typeof onProgress === 'function') onProgress(done, total);
        }
        return { ok: true, firestoreSynced: true, deleted: done };
    } catch (e) {
        console.error('Delete all leads:', e);
        return { ok: true, firestoreSynced: false, firestoreError: e?.message || String(e) };
    }
}

// ── CSV Export ──
export function exportCSV(leads) {
    const headers = ['Domain', 'Name', 'Branche', 'Score', 'Conversion%', 'EV€', 'Performance', 'SEO', 'A11y', 'CMS', 'Status', 'Notizen', 'Gespeichert', 'Quelle', 'Kontaktgrundlage', 'Partnercode', 'Provision'];
    const rows = leads.map(l => [
        l.domain, l.name || '', l.type || '', l.leadScore || 0, l.conversionRate || 0,
        l.expectedValue || 0, l.perf || '', l.seo || '', l.a11y || '', l.cms || '',
        l.status || '', l.notes || '',
        l.savedAt ? new Date(l.savedAt).toLocaleDateString('de-DE') : '',
        QUELLEN_LABELS[leiteQuelleAb(l)] || '',
        KONTAKT_GRUNDLAGE_LABELS[normalisiereKontaktGrundlage(l.kontaktGrundlage).art],
        l.partnerCode || '',
        l.provision ? PROVISION_STATUS_LABELS[normalisiereProvision(l.provision).status] : ''
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
