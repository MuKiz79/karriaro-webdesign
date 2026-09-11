/**
 * Tech-Alter-Interpretation: bewertet wann die Site gebaut wurde und auf
 * welcher Technologie. Konsumiert die Rohdaten aus tech-detect.js und
 * wayback-freshness.js — fügt nichts Neues abzufragen, nur Interpretation
 * für den Pitch-Anker.
 *
 * Liefert:
 *   - era: "modern" | "current" | "aging" | "outdated" | "abandoned"
 *   - techStackVerdict: kurze Aussage zum CMS/Version
 *   - pitchArg: ein Satz für die Outreach-Mail
 *   - severity: 0..5 (Pitch-Stärke)
 *   - eol / eolDatum / eolText: Support-Lage der GEMESSENEN Version
 */

// CMS-Releases (Major-Version → ungefähres Release-Jahr). Nur noch Anzeige-
// Information („Major-Release 2014") — die Sicherheitsaussage hängt seit
// 2026-09-10 ausschließlich an der Support-Tabelle unten.
const CMS_RELEASE_YEAR = {
    'WordPress': { 3: 2010, 4: 2014, 5: 2018, 6: 2022 },
    'Joomla':    { 3: 2012, 4: 2021, 5: 2023 },
    'Drupal':    { 7: 2011, 8: 2015, 9: 2020, 10: 2022, 11: 2024 },
    'Magento':   { 1: 2008, 2: 2015 }
};

/**
 * Support-Tabelle je CMS — mit DATUM statt nur Jahr.
 *
 * ⚠️ KORREKTUR 2026-09-10: Die alte Tabelle führte „WordPress 4 → EOL 2022" für
 * die GANZE 4er-Reihe. Tatsächlich endeten die Sicherheitsupdates gestaffelt:
 * 3.7–4.0 seit 09/2022, 4.1–4.6 seit 07/2025, und ab 4.7 erscheinen weiter
 * Sicherheitsupdates. Ein Anschreiben „WordPress 4.9 ohne Sicherheitsupdates"
 * war also nachweislich falsch — und genau diese Zeile stand im Betreff.
 *
 * Felder je Bereich (von/bis = [major, minor], beide inklusive):
 *   ende          Datum, ab dem keine (kostenlosen) Sicherheitsupdates mehr
 *                 erscheinen: 'JJJJ' | 'JJJJ-MM' | 'JJJJ-MM-TT'. Liegt es in der
 *                 Zukunft, ist die Version gepflegt (Support bis …).
 *   spaetestens   Version ÄLTER als der erste belegte Bereich: sicher ohne
 *                 Updates, das genaue Ende ist hier nicht hinterlegt — der Text
 *                 sagt deshalb „spätestens seit" und behauptet kein Datum.
 *   nurKostenlos  TYPO3: nach dem Datum nur noch kostenpflichtige Verlängerung —
 *                 der Text darf nicht „keine Sicherheitsupdates" sagen.
 *   status        'nicht-aktuell' (Updates laufen, Hauptversion alt) oder
 *                 'eol-ohne-datum' (Contao-Zwischenversionen ohne Support).
 */
const CMS_SUPPORT = {
    'WordPress': [
        { von: [0, 0],  bis: [3, 6],   ende: '2022-09', spaetestens: true },
        { von: [3, 7],  bis: [4, 0],   ende: '2022-09' },
        { von: [4, 1],  bis: [4, 6],   ende: '2025-07' },
        { von: [4, 7],  bis: [5, 999], status: 'nicht-aktuell' }
    ],
    'Joomla': [
        { von: [0, 0],  bis: [2, 999], ende: '2023-08-17', spaetestens: true },
        { von: [3, 0],  bis: [3, 999], ende: '2023-08-17' },
        { von: [4, 0],  bis: [4, 999], ende: '2025-10-14' },
        { von: [5, 0],  bis: [5, 999], ende: '2027-10-12' }
    ],
    'TYPO3': [
        { von: [0, 0],  bis: [10, 999], ende: '2024-10-31', spaetestens: true, nurKostenlos: true },
        { von: [11, 0], bis: [11, 999], ende: '2024-10-31', nurKostenlos: true },
        { von: [12, 0], bis: [12, 999], ende: '2026-04-30', nurKostenlos: true }
    ],
    'Contao': [
        { von: [0, 0],  bis: [4, 12],  ende: '2026-02-14', spaetestens: true },
        { von: [4, 13], bis: [4, 999], ende: '2026-02-14' },
        { von: [5, 0],  bis: [5, 2],   status: 'eol-ohne-datum' },
        { von: [5, 3],  bis: [5, 3],   ende: '2028-02-14' },
        { von: [5, 4],  bis: [5, 6],   status: 'eol-ohne-datum' }
    ],
    'Shopware': [
        { von: [0, 0],  bis: [4, 999], ende: '2024-07', spaetestens: true },
        { von: [5, 0],  bis: [5, 999], ende: '2024-07' }
    ],
    // Bestand (vor 2026-09-10 bereits als Jahr geführt) — bleibt auf Jahres-Genauigkeit.
    'Drupal': [
        { von: [0, 0],  bis: [6, 999], ende: '2025', spaetestens: true },
        { von: [7, 0],  bis: [7, 999], ende: '2025' },
        { von: [8, 0],  bis: [8, 999], ende: '2021' },
        { von: [9, 0],  bis: [9, 999], ende: '2023' }
    ],
    'Magento': [
        { von: [1, 0],  bis: [1, 999], ende: '2020' }
    ]
};

const CMS_KANONISCH = {
    wordpress: 'WordPress', joomla: 'Joomla', 'joomla!': 'Joomla', drupal: 'Drupal',
    magento: 'Magento', typo3: 'TYPO3', 'typo3 cms': 'TYPO3', contao: 'Contao', shopware: 'Shopware'
};

const CURRENT_YEAR = new Date().getFullYear();

/** "WordPress + Divi" → "WordPress", "Joomla!" → "Joomla". Unbekannte Namen bleiben. */
export function kanonischerCmsName(cmsRaw) {
    const basis = String(cmsRaw || '').split(' + ')[0].trim();
    return CMS_KANONISCH[basis.toLowerCase()] || basis;
}

/**
 * CMS-Version aus adEvidence.techVersion ({cms, version, quelle}) in ein
 * PSI-tech-Objekt übernehmen — NUR Lücken füllen, die PSI-Erkennung hat Vorrang.
 *
 * ⚠️ 2026-09-10: Die bisherige Scanner-Bedingung `!tech.cms || tech.cms === tv.cms`
 * griff praktisch nie — detectTech setzt ohne Treffer „Nicht erkannt (…)" (also
 * nie leer), und „WordPress + Elementor" ist nicht „WordPress". Joomla-, TYPO3-,
 * Contao- und Shopware-Versionen, die NUR der Quelltext kennt, kamen damit nie an.
 *
 * @returns {object} dasselbe Objekt, wenn nichts zu ergänzen ist, sonst eine Kopie
 */
export function ergaenzeTechVersion(tech, techVersion) {
    const t = tech || {};
    const tv = techVersion;
    if (!tv?.version || !tv?.cms || t.version) return tech;
    const erkannt = t.cms && !/^Nicht erkannt/i.test(t.cms);
    if (erkannt && kanonischerCmsName(t.cms) !== kanonischerCmsName(tv.cms)) return tech;
    return {
        ...t,
        cms: erkannt ? t.cms : kanonischerCmsName(tv.cms),
        version: String(tv.version),
        versionQuelle: tv.quelle || 'quelltext'
    };
}

/**
 * Major-Version aus einem Versions-String extrahieren ("4.9.2" → 4).
 */
function majorVersion(versionStr) {
    if (!versionStr) return null;
    const m = String(versionStr).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

/** "4.13.2" → [4, 13]; "4" → [4, null] (Minor unbekannt); Unsinn → null. */
function zerlegeVersion(versionStr) {
    const m = String(versionStr || '').trim().match(/^v?(\d+)(?:\.(\d+))?/i);
    if (!m) return null;
    return [parseInt(m[1], 10), m[2] !== undefined ? parseInt(m[2], 10) : null];
}

function vergleiche(a, b) {
    return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
}

/** 'JJJJ' → Jan 1, 'JJJJ-MM' → Monatserster, 'JJJJ-MM-TT' → der Tag (lokale Zeit). */
function datumAlsZeit(d) {
    const m = String(d || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!m) return null;
    return new Date(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) - 1 : 0, m[3] ? parseInt(m[3], 10) : 1).getTime();
}

/**
 * Datum in der Schreibweise, in der es belegt ist — nie genauer als die Quelle:
 * '2025' → '2025', '2025-07' → '07/2025', '2023-08-17' → '17.08.2023'.
 * Unbekannte Formen bleiben wörtlich stehen (kein stilles Verwerfen).
 */
export function formatiereDatum(d) {
    const s = String(d ?? '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return `${m[2]}/${m[1]}`;
    m = s.match(/^(\d{4})$/);
    if (m) return m[1];
    return s;
}

function ergebnisAusRegel(regel, cms, version, jetztMs) {
    const basis = { cms, version, eol: false, eolDatum: null, spaetestens: false, nurKostenlos: false, supportBis: null };
    if (regel.status === 'nicht-aktuell') {
        return { ...basis, status: 'nicht-aktuell', text: 'nicht aktuell' };
    }
    if (regel.status === 'eol-ohne-datum') {
        // Satzbau wie die datierten Fälle („Contao 5.1 ohne Sicherheitsupdates …"),
        // weil Chips und Trigger „CMS Version Text" zusammensetzen.
        return { ...basis, status: 'eol', eol: true, text: 'ohne Sicherheitsupdates (Nicht-LTS-Version)' };
    }
    const endeMs = datumAlsZeit(regel.ende);
    const d = formatiereDatum(regel.ende);
    if (endeMs !== null && jetztMs < endeMs) {
        return { ...basis, status: 'gepflegt', supportBis: regel.ende, text: `Support bis ${d}` };
    }
    const spaet = !!regel.spaetestens;
    const kostenlos = !!regel.nurKostenlos;
    let text;
    if (kostenlos) {
        // Die kostenpflichtige Verlängerung ist nur für die belegten Bereiche
        // (v11, v12) hinterlegt. Für ältere Versionen ist offen, ob es sie noch
        // gibt — der Text sagt dort nur, was sicher gilt.
        text = spaet
            ? `ohne kostenlose Sicherheitsupdates (spätestens seit ${d})`
            : `ohne kostenlose Sicherheitsupdates seit ${d} (nur kostenpflichtige Verlängerung)`;
    } else {
        text = spaet
            ? `ohne Sicherheitsupdates (spätestens seit ${d})`
            : `ohne Sicherheitsupdates seit ${d}`;
    }
    return { ...basis, status: 'eol', eol: true, eolDatum: regel.ende, spaetestens: spaet, nurKostenlos: kostenlos, text };
}

/**
 * Support-Lage einer GEMESSENEN CMS-Version.
 *
 * Regeln, die dieses Modul trägt:
 *   • Ohne Version keine Aussage (status 'unbekannt') — ein erkanntes CMS allein
 *     belegt kein Support-Ende.
 *   • Reicht die Version nicht aus (WordPress „4" deckt drei Bereiche mit
 *     unterschiedlichem Ende ab), gibt es ebenfalls keine Aussage. Lieber nichts
 *     behaupten als eine falsche Version.
 *   • Eine Version ohne passenden Bereich (WordPress 6, Joomla 6) ist 'ohne-befund'
 *     — nicht „aktuell", das wüssten wir nur mit der neuesten Versionsnummer.
 *
 * @param {string} cmsRaw    z.B. "WordPress + Elementor", "Joomla", "TYPO3"
 * @param {string} version   gemessene Version, z.B. "4.9.18"
 * @param {Date|number} [jetzt]
 * @returns {{cms:string, version:string|null, status:'eol'|'gepflegt'|'nicht-aktuell'|'ohne-befund'|'unbekannt',
 *            eol:boolean, eolDatum:string|null, spaetestens:boolean, nurKostenlos:boolean,
 *            supportBis:string|null, text:string, bekanntesCms:boolean}}
 */
export function bewerteCmsVersion(cmsRaw, version, jetzt = new Date()) {
    const cms = kanonischerCmsName(cmsRaw);
    const regeln = CMS_SUPPORT[cms] || null;
    const leer = {
        cms, version: version || null, status: 'unbekannt', eol: false, eolDatum: null,
        spaetestens: false, nurKostenlos: false, supportBis: null, text: '', bekanntesCms: !!regeln
    };
    if (!regeln || !version) return leer;
    const v = zerlegeVersion(version);
    if (!v) return leer;
    const jetztMs = typeof jetzt === 'number' ? jetzt : (jetzt instanceof Date ? jetzt.getTime() : Date.now());

    if (v[1] === null) {
        // Minor unbekannt: eine Aussage nur, wenn EIN Bereich die ganze
        // Hauptversion abdeckt (Joomla „3"). Zerfällt sie in Bereiche mit
        // verschiedenem Ende (WordPress „4") oder hat Lücken (Contao „5"), bleibt
        // die Lage offen.
        const beruehrt = regeln.some(r => r.von[0] <= v[0] && r.bis[0] >= v[0]);
        if (!beruehrt) return { ...leer, status: 'ohne-befund' };
        const ganz = regeln.find(r => vergleiche([v[0], 0], r.von) >= 0 && vergleiche([v[0], 999], r.bis) <= 0);
        if (!ganz) return leer;
        return { ...ergebnisAusRegel(ganz, cms, version, jetztMs), bekanntesCms: true };
    }
    const regel = regeln.find(r => vergleiche(v, r.von) >= 0 && vergleiche(v, r.bis) <= 0);
    if (!regel) return { ...leer, status: 'ohne-befund' };
    return { ...ergebnisAusRegel(regel, cms, version, jetztMs), bekanntesCms: true };
}

/**
 * Satz für ein Anschreiben — nur das, was die gemessene Version belegt.
 * @param {ReturnType<typeof bewerteCmsVersion>} sv
 */
function eolSatz(sv) {
    if (!sv?.eol) return null;
    if (!sv.eolDatum) return 'für diese Zwischenversion erscheinen keine Sicherheitsupdates mehr';
    const d = formatiereDatum(sv.eolDatum);
    if (sv.nurKostenlos) {
        return sv.spaetestens
            ? `für diese Version gibt es spätestens seit ${d} keine kostenlosen Sicherheitsupdates mehr`
            : `für diese Version gibt es seit ${d} keine kostenlosen Sicherheitsupdates mehr, nur noch eine kostenpflichtige Verlängerung`;
    }
    return sv.spaetestens
        ? `für diese Version erscheinen spätestens seit ${d} keine Sicherheitsupdates mehr`
        : `für diese Version erscheinen seit ${d} keine Sicherheitsupdates mehr`;
}

/**
 * Domain-Alter / Letzte-Aktualisierung-Bewertung.
 */
function classifyEra(yearsSince, domainAgeYears) {
    if (yearsSince === null || yearsSince === undefined) return 'unknown';
    if (yearsSince >= 5)  return 'abandoned';
    if (yearsSince >= 3)  return 'outdated';
    if (yearsSince >= 1.5) return 'aging';
    if (yearsSince >= 0.5) return 'current';
    return 'modern';
}

/**
 * Hauptfunktion. Erwartet:
 *   tech     — Output von signals/tech-detect.js (ggf. um adEvidence.techVersion ergänzt)
 *   wayback  — Output von analysis/wayback-freshness.js
 *   opts.jetzt — Stichtag (Tests), Default: jetzt
 */
export function analyzeTechAge(tech = {}, wayback = {}, { jetzt = new Date() } = {}) {
    const cmsRaw = tech.cms || '';
    const cmsName = kanonischerCmsName(cmsRaw);
    const major = majorVersion(tech.version);
    const yearsSince = wayback.yearsSince ?? null;
    const domainAgeYears = wayback.domainAgeYears ?? null;
    const firstSeen = wayback.firstSeen || null;
    const lastChanged = wayback.lastChanged || null;

    const era = classifyEra(yearsSince, domainAgeYears);
    const sv = bewerteCmsVersion(cmsName, tech.version, jetzt);
    const versionText = tech.version ? `${cmsName} ${tech.version}` : cmsName;

    // Tech-Stack-Verdict
    let techStackVerdict = '';
    let techSeverity = 0;
    const releaseYear = cmsName && major !== null ? (CMS_RELEASE_YEAR[cmsName]?.[major] ?? null) : null;
    const techYearsBehind = releaseYear ? CURRENT_YEAR - releaseYear : null;

    if (tech.isBaukasten) {
        techStackVerdict = `Läuft auf einem Baukasten-System (${cmsName}) — strukturelle Limits bei SEO, Performance und Design`;
        techSeverity = 3;
    } else if (sv.status === 'eol') {
        techStackVerdict = `${versionText} ${sv.text}`;
        techSeverity = 5;
    } else if (sv.status === 'nicht-aktuell') {
        // Ab WordPress 4.7 erscheinen weiter Sicherheitsupdates — also höchstens
        // „nicht aktuell", nie „ohne Sicherheitsupdates" und KEIN hartes Signal.
        techStackVerdict = `${versionText} — nicht aktuell`;
        techSeverity = 2;
    } else if (sv.status === 'gepflegt') {
        techStackVerdict = `${versionText} — ${sv.text}`;
        techSeverity = 0;
    } else if (sv.status === 'ohne-befund') {
        techStackVerdict = `${versionText} — keine überschrittene Support-Grenze bekannt`;
        techSeverity = 0;
    } else if (cmsName && tech.version && cmsName !== 'Nicht erkannt (moeglicherweise handcodiert)') {
        // Version gemessen, aber zu ungenau für eine Support-Aussage (z.B. „WordPress 4").
        techStackVerdict = `${versionText} erkannt — Versionsangabe zu ungenau für eine Support-Aussage`;
        techSeverity = 1;
    } else if (cmsName && cmsName !== 'Nicht erkannt (moeglicherweise handcodiert)') {
        techStackVerdict = `${cmsName} erkannt`;
        techSeverity = 1;
    } else {
        techStackVerdict = 'Tech-Stack nicht eindeutig erkennbar';
        techSeverity = 0;
    }

    // Era-Verdict
    let eraVerdict = '';
    let eraSeverity = 0;
    if (era === 'abandoned') {
        eraVerdict = `Site wirkt aufgegeben — seit ${yearsSince.toFixed(1)} Jahren keine Änderung`;
        eraSeverity = 5;
    } else if (era === 'outdated') {
        eraVerdict = `Site seit ${yearsSince.toFixed(1)} Jahren nicht mehr überarbeitet`;
        eraSeverity = 3;
    } else if (era === 'aging') {
        eraVerdict = `Letzte größere Änderung vor ${yearsSince.toFixed(1)} Jahren`;
        eraSeverity = 2;
    } else if (era === 'current') {
        eraVerdict = `Letzte Änderung vor ~${Math.round(yearsSince * 12)} Monaten`;
        eraSeverity = 0;
    } else if (era === 'modern') {
        eraVerdict = 'Site wurde kürzlich aktualisiert';
        eraSeverity = 0;
    } else {
        eraVerdict = 'Aktualisierungs-Historie unbekannt';
        eraSeverity = 0;
    }

    // Pitch-Argument: nur behaupten, was die GEMESSENE Version belegt.
    let pitchArg = null;
    const satz = eolSatz(sv);
    if (!tech.isBaukasten && satz && eraSeverity >= 3) {
        pitchArg = `Ihre Website wurde seit ${yearsSince.toFixed(1)} Jahren nicht mehr substanziell überarbeitet und läuft auf ${versionText} — ${satz}.`;
    } else if (!tech.isBaukasten && satz) {
        pitchArg = `Ihre Website läuft auf ${versionText} — ${satz}.`;
    } else if (eraSeverity >= 3) {
        pitchArg = `Ihre Website wurde seit ${yearsSince?.toFixed(1) ?? '—'} Jahren nicht mehr substantiell überarbeitet — sichtbar an Design und Tech-Stack.`;
    } else if (tech.isBaukasten && eraSeverity >= 2) {
        pitchArg = `Ihre Website läuft auf ${cmsName} und wurde seit ~${Math.round((yearsSince ?? 0) * 12)} Monaten nicht angepasst — strukturell limitiert.`;
    }

    const severity = Math.max(techSeverity, eraSeverity);
    const composite = `${techStackVerdict}${eraVerdict ? ' · ' + eraVerdict : ''}`;
    const eolAktiv = !tech.isBaukasten && sv.eol;

    return {
        cms: cmsName,
        cmsRaw,
        majorVersion: major,
        version: tech.version || null,
        isBaukasten: !!tech.isBaukasten,
        techStackVerdict,
        techSeverity,
        techYearsBehind,
        cmsReleaseYear: releaseYear,
        // Jahreszahl NUR für den präzisen Fall (Datum belegt, kostenlose Updates
        // wirklich beendet). Nachgelagerte Texte bauen daraus „seit JJJJ ohne
        // Sicherheitsupdates" — für „spätestens seit" oder TYPO3-Verlängerung
        // wäre das eine Falschaussage. `eol` ist das vollständige Signal.
        cmsEolYear: eolAktiv && sv.eolDatum && !sv.spaetestens && !sv.nurKostenlos
            ? parseInt(String(sv.eolDatum).slice(0, 4), 10)
            : null,
        eol: eolAktiv,
        eolDatum: eolAktiv ? sv.eolDatum : null,
        eolText: eolAktiv ? sv.text : null,
        eolSpaetestens: eolAktiv && sv.spaetestens,
        eolNurKostenlos: eolAktiv && sv.nurKostenlos,
        supportStatus: tech.isBaukasten ? 'baukasten' : sv.status,
        supportBis: sv.supportBis,
        era,
        eraVerdict,
        eraSeverity,
        yearsSinceLastChange: yearsSince,
        domainAgeYears,
        firstSeen,
        lastChanged,
        severity,
        composite,
        pitchArg,
        // Headline für die UI-Karte
        headline: severity >= 4
            ? '⚠ Veraltete Technologie + lange nicht aktualisiert'
            : severity >= 3
                ? 'Technische Generation überfällig'
                : severity >= 2
                    ? 'Aktualisierung empfehlenswert'
                    : 'Kein Befund zum Tech-Stand'
    };
}
