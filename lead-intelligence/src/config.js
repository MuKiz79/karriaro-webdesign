/**
 * App Configuration + User Profile (SuperPrompt)
 * Persisted in localStorage
 */
export const config = {
    psiKey: '',
    fnUrl: '',

    // SuperPrompt: Wer bin ich und was kann ich?
    profile: {
        name: '',
        company: '',
        email: '',          // Absender-Adresse der Mails; leer → ABSENDER_IMPRESSUM.email
        role: '',           // z.B. "Gründer & Webdesigner"
        services: '',       // z.B. "Handcodierte Websites, SEO, BFSG-Compliance"
        // priceRange: frei eingebbarer Profiltext. Preise in Mails, Sequenz und
        // Pitch kommen seit 2026-09-10 ausschliesslich aus PREISE (siehe unten) —
        // ein veralteter Freitext darf nie in eine Kundennachricht wandern.
        priceRange: '',
        targetGroup: '',    // z.B. "Lokale Unternehmen (Handwerk, Gastronomie, Ärzte)"
        usp: '',            // z.B. "Kein Baukasten, kein Abo. Handcodiert."
        location: '',       // z.B. "Schwarzwald / Ortenau"
        portfolio: '',      // z.B. "karriaro-webdesign.de"
        tone: 'professionell'  // professionell | freundlich | direkt
    }
};

// ══════════════════════════════════════
// Preise — einzige Quelle in dieser Codebasis (Vertrag V11)
// ══════════════════════════════════════

/** Einmalpreise je Paket in Euro. Kein Abo. */
export const PREISE = {
    essential: { name: 'Essential', betrag: 1290 },
    professional: { name: 'Professional', betrag: 1990 },
    premium: { name: 'Premium', betrag: 2990 },
    'premium-plus': { name: 'Premium+', betrag: 3990 }
};

/** 1290 → "1.290 €" (Tausenderpunkt ohne ICU-Abhängigkeit, damit Node und Browser gleich formatieren). */
export function preisText(betrag) {
    const n = Math.round(Number(betrag));
    if (!Number.isFinite(n)) return '';
    return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
}

/** Paket-Schlüssel → "ab 1.990 €"; unbekannt → Einstieg. */
export function preisAb(paket) {
    const p = PREISE[paket] || PREISE.essential;
    return `ab ${preisText(p.betrag)}`;
}

/** Einstiegspreis „ab 1.290 €". */
export const PREIS_EINSTIEG = preisAb('essential');

// ══════════════════════════════════════
// Absender — ausschliesslich aus dem Impressum übernommen (Vertrag V12)
// ══════════════════════════════════════

/**
 * Quelle: webdesign/src/impressum.html, „Angaben gemäß § 5 DDG" (Stand 2026-09-10).
 * Ändert sich das Impressum, MUSS dieser Block mitgezogen werden — er steht in
 * jeder zulässigen Werbe-Mail als erkennbarer Absender.
 */
export const ABSENDER_IMPRESSUM = {
    name: 'Muammer Kizilaslan',
    firma: 'Karriaro Webdesign',
    anschrift: 'Spitalstr. 7, 77761 Schiltach',
    email: 'kontakt@karriaro.de',
    web: 'karriaro-webdesign.de'
};

/** Abmeldung per Mail (List-Unsubscribe mailto) und Seite mit Token (Vertrag V5). */
export const ABMELDUNG = {
    email: 'kontakt@karriaro.de',
    betreff: 'Abmelden',
    urlBasis: 'https://karriaro-webdesign.de/abmelden',
    datenschutzUrl: 'https://karriaro-webdesign.de/datenschutz'
};

function gueltigeEmail(e) {
    const s = String(e || '').trim();
    return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ? s : '';
}

/**
 * Absender aus Profil + Impressum. Profilwerte gewinnen, fehlende Felder kommen
 * aus dem Impressum — nie eine erfundene Angabe.
 * @returns {{name:string, firma:string, anschrift:string, email:string, web:string}}
 */
export function absender(profile = config.profile) {
    const p = profile || {};
    return {
        name: String(p.name || '').trim() || ABSENDER_IMPRESSUM.name,
        firma: String(p.company || '').trim() || ABSENDER_IMPRESSUM.firma,
        anschrift: ABSENDER_IMPRESSUM.anschrift,
        email: gueltigeEmail(p.email) || ABSENDER_IMPRESSUM.email,
        web: String(p.portfolio || '').trim().split(/[,\s]/)[0] || ABSENDER_IMPRESSUM.web
    };
}

// Same-Origin-Proxy: Aufrufe gehen über den Hosting-Rewrite /api/* derselben
// Domain → kein CORS (die Functions liegen in einem anderen Origin). Direkte
// cloudfunctions.net-URLs werden bewusst ignoriert (würden vom Browser geblockt)
// — das heilt auch einen alt zwischengespeicherten Wert automatisch.
const DEFAULT_FN_URL = '/api';

export function loadConfig() {
    config.psiKey = localStorage.getItem('karriaro_psi_key') || '';
    const storedFn = localStorage.getItem('karriaro_fn_url') || '';
    config.fnUrl = (storedFn && !storedFn.includes('cloudfunctions.net')) ? storedFn : DEFAULT_FN_URL;

    // Profil laden
    const saved = localStorage.getItem('karriaro_profile');
    if (saved) {
        try { Object.assign(config.profile, JSON.parse(saved)); } catch(e) { console.warn('Profil in localStorage unlesbar — Standardwerte bleiben:', e); }
    }
}

export function saveConfig() {
    localStorage.setItem('karriaro_psi_key', config.psiKey);
    localStorage.setItem('karriaro_fn_url', config.fnUrl);
    localStorage.setItem('karriaro_profile', JSON.stringify(config.profile));
}
