/**
 * Claim-Verifikation — gleicht heuristische Behauptungen gegen GROUNDED Signale
 * ab, bevor sie in einen Pitch/eine Mail gehen:
 *   • Vision (analyzeScreenshot): isModern / designEra / designQuality → widerlegt
 *     "veraltete Seite/Design"-Aussagen, wenn die Seite sichtbar modern ist.
 *   • Deep-Research (Sonnet liest die echte Seite, inkl. Unterseiten): strengths
 *     belegen Vorhandenes, weaknesses belegen echte Lücken → bestätigt/widerlegt
 *     "Feature X fehlt".
 *
 * Verhindert den realen Fall: modernes Restaurant mit OpenTable-Reservierung wird
 * als "veraltet, Reservierung fehlt" gepitcht.
 *
 * @module analysis/claim-verify
 */

const FEATURE_KEYWORDS = {
    reservier:   ['reservier', 'buchung', 'opentable', 'quandoo', 'bookatable', 'tisch'],
    anfahrt:     ['anfahrt', 'maps', 'lageplan', 'wegbeschreibung', 'route', 'standort'],
    öffnungszeit:['öffnungszeit', 'opening hour', 'geöffnet', 'kernzeit'],
    foto:        ['foto', 'galerie', 'impression', 'bild'],
    speisekarte: ['speisekarte', 'menü', 'menu', 'karte'],
    termin:      ['termin', 'booking', 'calendly', 'online-terminbuchung'],
    shop:        ['shop', 'warenkorb', 'bestell', 'woocommerce', 'gutschein']
};

function keywordsFor(name) {
    const n = (name || '').toLowerCase();
    for (const [k, kws] of Object.entries(FEATURE_KEYWORDS)) {
        if (n.includes(k) || kws.some(w => n.includes(w))) return kws;
    }
    return [n.split(/[ /]/)[0]].filter(Boolean); // Fallback: erstes Wort
}

/**
 * Vision-Urteil: wirkt die Seite modern? true | false | null (kein Signal).
 */
export function siteLooksModern(screenshotAnalysis) {
    const s = screenshotAnalysis;
    if (!s) return null;
    if (s.isModern === true) return true;
    if (s.isModern === false) return false;
    const era = (s.designEra || '').toLowerCase();
    if (era.includes('aktuell') || era.includes('2020')) return true;
    if (era.includes('2010') || era.includes('2015')) return false;
    if (typeof s.designQuality === 'number') {
        if (s.designQuality >= 7) return true;
        if (s.designQuality <= 4) return false;
    }
    return null;
}

/**
 * Feature-Behauptung gegen die Deep-Research-Lesung prüfen.
 * @returns {'present'|'confirmed'|'unverified'}
 *   present    = Deep sah es als Stärke/erwähnt → vorhanden → "fehlt" ist FALSCH
 *   confirmed  = Deep belegt es als Schwäche → fehlt wirklich → darf in den Pitch
 *   unverified = kein Signal → nur als "zu prüfen"-Hinweis verwenden
 */
export function verifyFeatureClaim(featureName, deepAssessment) {
    if (!deepAssessment) return 'unverified';
    const kws = keywordsFor(featureName);
    const hit = (arr) => (arr || []).some(w => {
        const t = (typeof w === 'string' ? w : `${w.title || ''} ${w.evidence || ''}`).toLowerCase();
        return kws.some(k => t.includes(k));
    });
    if (hit(deepAssessment.strengths)) return 'present';
    if (hit(deepAssessment.weaknesses)) return 'confirmed';
    return 'unverified';
}
