/**
 * Einwilligungen (Double-Opt-In) — Leseschicht auf consents/{id}.
 *
 * Die Dokumente schreibt ausschliesslich der Server (webdesign-functions,
 * einwilligungAnfordern/-Bestaetigen/abmelden). Der Client darf laut Regel nur
 * lesen (isAdmin) und genau EIN Feld ändern: `stopped`. Deshalb schreibt
 * stoppeSequenz() nichts ausser `{stopped:true}` — schon ein zusätzliches
 * updatedAt würde von der Regel abgelehnt.
 *
 * Zwei Zustände werden bewusst getrennt geführt:
 *   • „keine Einwilligung vorhanden"  → einwilligungen = [], geladen = true
 *   • „nicht lesbar" (kein Login, keine Berechtigung, Netz) → geladen = false
 * Nicht gemessen ist nicht negativ gemessen — die Oberfläche soll beides
 * unterscheidbar anzeigen. ladeEinwilligungen() liefert (Vertrag V8) in beiden
 * Fällen nur das Array; wer den Unterschied braucht, nimmt
 * ladeEinwilligungenMitStatus().
 *
 * window-/Firestore-Zugriffe sind guarded wie in suppression.js, damit die reine
 * Logik unter Vitest (node) ohne Browser läuft.
 *
 * @module crm/consents
 */
import { normalizeDomain } from './suppression.js';

export const EINWILLIGUNGS_SCOPE = 'webdesign-hinweise';
/** Die Einwilligung (V1) deckt höchstens drei E-Mails ab. */
export const MAX_SEQUENZ_SCHRITTE = 3;

export const EINWILLIGUNGS_QUELLEN = {
    'website-pruefen': 'Website-Prüfung',
    'startseite': 'Startseite',
    'sofort-skizze': 'Sofort-Skizze',
    'ki-zitier': 'KI-Zitier-Check'
};

export const EINWILLIGUNGS_STATUS_LABELS = {
    bestaetigt: 'Bestätigt',
    offen: 'Nicht bestätigt',
    abgelaufen: 'Abgelaufen',
    gestoppt: 'Gestoppt',
    widerrufen: 'Widerrufen'
};

const LESE_LIMIT = 500;

function win() { return typeof window !== 'undefined' ? window : null; }
function fb() { return win()?.__firebase || null; }
function currentUser() { return fb()?.auth?.currentUser || null; }

/**
 * Firestore-Timestamp / Millisekunden / Date / ISO-String → Millisekunden.
 * Alles andere (fehlend, unlesbar) → null. Nie 0: 0 wäre ein Datum (1970).
 */
export function zuMillis(v) {
    if (v == null || v === '') return null;
    if (typeof v?.toMillis === 'function') {
        const ms = v.toMillis();
        return Number.isFinite(ms) ? ms : null;
    }
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
    if (typeof v === 'string') {
        const ms = Date.parse(v);
        return Number.isFinite(ms) ? ms : null;
    }
    // Rohes Timestamp-Objekt ohne Methoden (z. B. aus JSON)
    if (typeof v?.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    return null;
}

export function normalisiereEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return e.includes('@') ? e : '';
}

function domainAusEmail(email) {
    const e = normalisiereEmail(email);
    return e ? normalizeDomain(e.slice(e.lastIndexOf('@') + 1)) : '';
}

/**
 * Firestore-Dokument → flaches Objekt nach Vertrag V8. Zeitpunkte in
 * Millisekunden (wie savedAt/updatedAt in leads.js). Zusatzfelder
 * (textVersion, expiresAt, nextSendAt, auditSlug) sind additiv.
 */
export function normalisiereEinwilligung(id, data = {}) {
    const d = data || {};
    const step = Number(d.sequenceStep);
    return {
        id: String(id || ''),
        email: normalisiereEmail(d.email),
        domain: d.domain ? (normalizeDomain(d.domain) || null) : null,
        confirmedAt: zuMillis(d.confirmedAt),
        revokedAt: zuMillis(d.revokedAt),
        stopped: d.stopped === true,
        sequenceStep: Number.isFinite(step) && step > 0 ? Math.floor(step) : 0,
        source: typeof d.source === 'string' && d.source ? d.source : null,
        createdAt: zuMillis(d.createdAt),
        unsubscribeToken: typeof d.unsubscribeToken === 'string' && d.unsubscribeToken ? d.unsubscribeToken : null,
        // Zusatzfelder
        textVersion: typeof d.textVersion === 'string' && d.textVersion ? d.textVersion : null,
        expiresAt: zuMillis(d.expiresAt),
        nextSendAt: zuMillis(d.nextSendAt),
        auditSlug: typeof d.auditSlug === 'string' && d.auditSlug ? d.auditSlug : null
    };
}

/**
 * Status einer Einwilligung. Vorrang: widerrufen > gestoppt > bestätigt >
 * abgelaufen > offen. Ein Widerruf schlägt alles — auch eine Bestätigung.
 * „abgelaufen" nur für NICHT bestätigte Anfragen, deren Bestätigungsfrist
 * vorbei ist; eine bestätigte Einwilligung läuft über expiresAt nicht ab.
 */
export function einwilligungsStatus(e, now = Date.now()) {
    if (!e) return 'offen';
    if (e.revokedAt) return 'widerrufen';
    if (e.stopped === true) return 'gestoppt';
    if (e.confirmedAt) return 'bestaetigt';
    if (e.expiresAt && e.expiresAt < now) return 'abgelaufen';
    return 'offen';
}

/** Nur eine bestätigte, nicht widerrufene, nicht gestoppte Einwilligung trägt. */
export function istNutzbar(e, now = Date.now()) {
    return einwilligungsStatus(e, now) === 'bestaetigt';
}

/** Alle E-Mail-Adressen, die an einem Lead hängen können (normalisiert, ohne Dubletten). */
export function leadEmails(lead) {
    if (!lead) return [];
    const cd = lead.contactData || {};
    const roh = [
        lead.email, lead.contactEmail, lead.contact?.email,
        cd.email, ...(Array.isArray(cd.allEmails) ? cd.allEmails : []),
        ...(Array.isArray(cd.emails) ? cd.emails : []),
        ...(Array.isArray(cd.genericEmails) ? cd.genericEmails : [])
    ];
    return [...new Set(roh.map(normalisiereEmail).filter(Boolean))];
}

/**
 * Wie passt eine Einwilligung zu einem Lead?
 *   'email'  — dieselbe Adresse wie am Lead
 *   'domain' — die geprüfte Domain der Einwilligung ist die Lead-Domain, oder
 *              die eingewilligte Adresse liegt auf der Lead-Domain
 *   null     — kein Bezug
 * Domains werden exakt verglichen (nach normalizeDomain): meinbeispiel.de ist
 * nicht beispiel.de, shop.beispiel.de ebenfalls nicht.
 */
export function einwilligungsTreffer(lead, e) {
    if (!lead || !e) return null;
    const mail = normalisiereEmail(e.email);
    if (mail && leadEmails(lead).includes(mail)) return 'email';
    const ld = normalizeDomain(lead.domain);
    if (!ld) return null;
    if (e.domain && normalizeDomain(e.domain) === ld) return 'domain';
    if (mail && domainAusEmail(mail) === ld) return 'domain';
    return null;
}

/**
 * Alle Einwilligungen mit Bezug zum Lead (auch widerrufene/gestoppte — die
 * Oberfläche soll zeigen, dass eine Grundlage entfallen ist), neueste zuerst.
 * @returns {Array<{einwilligung:object, treffer:'email'|'domain', status:string}>}
 */
export function einwilligungenFuerLead(lead, einwilligungen = [], now = Date.now()) {
    if (!Array.isArray(einwilligungen)) return [];
    return einwilligungen
        .map(e => ({ einwilligung: e, treffer: einwilligungsTreffer(lead, e), status: einwilligungsStatus(e, now) }))
        .filter(x => x.treffer)
        .sort((a, b) => {
            // E-Mail-Treffer vor Domain-Treffer, dann jüngste Bestätigung/Anlage zuerst
            if (a.treffer !== b.treffer) return a.treffer === 'email' ? -1 : 1;
            const ta = a.einwilligung.confirmedAt || a.einwilligung.createdAt || 0;
            const tb = b.einwilligung.confirmedAt || b.einwilligung.createdAt || 0;
            return tb - ta;
        });
}

/**
 * Die tragende Einwilligung für einen Lead (bestätigt, nicht widerrufen, nicht
 * gestoppt), oder null. Einzige Quelle für „passt eine DOI zu diesem Lead?" —
 * das Mail-Gate (outreach/kontakt-grundlage.js) soll diese Funktion nutzen,
 * statt die Zuordnung ein zweites Mal zu schreiben.
 */
export function findeEinwilligungFuerLead(lead, einwilligungen = [], now = Date.now()) {
    const nutzbar = einwilligungenFuerLead(lead, einwilligungen, now).find(x => x.status === 'bestaetigt');
    return nutzbar ? nutzbar.einwilligung : null;
}

/**
 * Lädt alle Einwilligungen samt Lesestatus.
 * vollstaendig=false: das Lese-Limit wurde erreicht, ältere Einwilligungen fehlen.
 * @returns {Promise<{einwilligungen:Array, geladen:boolean, fehler:string|null, vollstaendig?:boolean}>}
 */
export async function ladeEinwilligungenMitStatus() {
    const f = fb();
    if (!f?.db || !f?.fns) return { einwilligungen: [], geladen: false, fehler: 'Firebase nicht verfügbar' };
    if (!currentUser()) return { einwilligungen: [], geladen: false, fehler: 'Nicht angemeldet' };
    try {
        const col = f.fns.collection(f.db, 'consents');
        const teile = [];
        if (typeof f.fns.orderBy === 'function') teile.push(f.fns.orderBy('createdAt', 'desc'));
        if (typeof f.fns.limit === 'function') teile.push(f.fns.limit(LESE_LIMIT));
        const q = teile.length > 0 && typeof f.fns.query === 'function' ? f.fns.query(col, ...teile) : col;
        const snap = await f.fns.getDocs(q);
        const docs = snap?.docs || [];
        const einwilligungen = docs
            .map(d => normalisiereEinwilligung(d.id, typeof d.data === 'function' ? d.data() : d.data))
            .filter(e => e.id);
        // Lese-Limit erreicht → ältere Einwilligungen fehlen. Das Mail-Gate blockiert
        // dann ohnehin (kein Treffer = kein Versand); die Oberfläche soll aber
        // „nicht gesehen" nicht als „gibt es nicht" anzeigen.
        const vollstaendig = docs.length < LESE_LIMIT;
        if (!vollstaendig) console.warn(`Einwilligungen: Lese-Limit ${LESE_LIMIT} erreicht — ältere Einträge sind nicht geladen.`);
        return { einwilligungen, geladen: true, fehler: null, vollstaendig };
    } catch (e) {
        const code = e?.code || '';
        console.error('Einwilligungen laden:', e);
        return {
            einwilligungen: [],
            geladen: false,
            fehler: code === 'permission-denied'
                ? 'Keine Leseberechtigung für Einwilligungen'
                : (e?.message || String(e))
        };
    }
}

/** Vertrag V8: Array der Einwilligungen; nicht lesbar → []. */
export async function ladeEinwilligungen() {
    const { einwilligungen } = await ladeEinwilligungenMitStatus();
    return einwilligungen;
}

/**
 * Stoppt die Nachfass-Strecke einer Einwilligung. Schreibt ausschliesslich
 * `stopped: true` (die Firestore-Regel erlaubt kein weiteres Feld).
 * @returns {Promise<{ok:boolean, fehler?:string}>}
 */
export async function stoppeSequenz(id) {
    const docId = String(id || '').trim();
    if (!docId) return { ok: false, fehler: 'Keine Einwilligungs-ID' };
    const f = fb();
    if (!f?.db || !f?.fns || !currentUser()) return { ok: false, fehler: 'Nicht angemeldet' };
    try {
        await f.fns.updateDoc(f.fns.doc(f.db, 'consents', docId), { stopped: true });
        return { ok: true };
    } catch (e) {
        console.error('Nachfass-Strecke stoppen:', e);
        return { ok: false, fehler: e?.code === 'permission-denied' ? 'Keine Schreibberechtigung' : (e?.message || String(e)) };
    }
}
