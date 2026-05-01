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
 */

// CMS-Releases (Major-Version → ungefähres Release-Jahr).
// Quellen: WP/Joomla/Drupal Release-History.
const CMS_RELEASE_YEAR = {
    'WordPress': { 3: 2010, 4: 2014, 5: 2018, 6: 2022 },
    'Joomla':    { 3: 2012, 4: 2021, 5: 2023 },
    'Drupal':    { 7: 2011, 8: 2015, 9: 2020, 10: 2022, 11: 2024 },
    'Magento':   { 1: 2008, 2: 2015 }
};

// EOL = End of Life (keine Sicherheitsupdates mehr).
const CMS_EOL_YEAR = {
    'WordPress': { 3: 2017, 4: 2022 },
    'Joomla':    { 3: 2023 },
    'Drupal':    { 7: 2025, 8: 2021, 9: 2023 },
    'Magento':   { 1: 2020 }
};

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Major-Version aus einem Versions-String extrahieren ("4.9.2" → 4).
 */
function majorVersion(versionStr) {
    if (!versionStr) return null;
    const m = String(versionStr).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
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
 *   tech     — Output von signals/tech-detect.js
 *   wayback  — Output von analysis/wayback-freshness.js
 */
export function analyzeTechAge(tech = {}, wayback = {}) {
    const cmsRaw = tech.cms || '';
    const cmsName = cmsRaw.split(' + ')[0]; // "WordPress + Divi" → "WordPress"
    const major = majorVersion(tech.version);
    const yearsSince = wayback.yearsSince ?? null;
    const domainAgeYears = wayback.domainAgeYears ?? null;
    const firstSeen = wayback.firstSeen || null;
    const lastChanged = wayback.lastChanged || null;

    const era = classifyEra(yearsSince, domainAgeYears);

    // Tech-Stack-Verdict
    let techStackVerdict = '';
    let techSeverity = 0;
    let techYearsBehind = null;

    if (tech.isBaukasten) {
        techStackVerdict = `Läuft auf einem Baukasten-System (${cmsName}) — strukturelle Limits bei SEO, Performance und Design`;
        techSeverity = 3;
    } else if (cmsName && major !== null && CMS_RELEASE_YEAR[cmsName]?.[major]) {
        const releaseYear = CMS_RELEASE_YEAR[cmsName][major];
        const eolYear = CMS_EOL_YEAR[cmsName]?.[major];
        techYearsBehind = CURRENT_YEAR - releaseYear;
        if (eolYear && eolYear <= CURRENT_YEAR) {
            techStackVerdict = `${cmsName} ${major}.x ist seit ${eolYear} EOL — keine Sicherheitsupdates mehr`;
            techSeverity = 5;
        } else if (techYearsBehind >= 6) {
            techStackVerdict = `${cmsName} ${major}.x stammt aus ${releaseYear} — ${techYearsBehind} Jahre alte Major-Version`;
            techSeverity = 4;
        } else if (techYearsBehind >= 3) {
            techStackVerdict = `${cmsName} ${major}.x ist von ${releaseYear} — Update auf eine neuere Major-Version steht aus`;
            techSeverity = 2;
        } else {
            techStackVerdict = `${cmsName} ${major}.x — aktuelle Major-Version`;
            techSeverity = 0;
        }
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

    // Pitch-Argument: kombiniert Era + Tech-Stack zu einem Satz.
    let pitchArg = null;
    if (techSeverity >= 4 && eraSeverity >= 3) {
        pitchArg = `Ihre Website läuft seit ${yearsSince?.toFixed(1) ?? '—'} Jahren auf ${cmsName} ${major}.x — eine ${techYearsBehind ?? '?'} Jahre alte Tech-Generation, die seit ${CMS_EOL_YEAR[cmsName]?.[major] ?? '—'} keine Sicherheitsupdates mehr erhält.`;
    } else if (techSeverity >= 4) {
        pitchArg = `${techStackVerdict}.`;
    } else if (eraSeverity >= 3) {
        pitchArg = `Ihre Website wurde seit ${yearsSince?.toFixed(1) ?? '—'} Jahren nicht mehr substantiell überarbeitet — sichtbar an Design und Tech-Stack.`;
    } else if (tech.isBaukasten && eraSeverity >= 2) {
        pitchArg = `Ihre Website läuft auf ${cmsName} und wurde seit ~${Math.round((yearsSince ?? 0) * 12)} Monaten nicht angepasst — strukturell limitiert.`;
    }

    const severity = Math.max(techSeverity, eraSeverity);
    const composite = `${techStackVerdict}${eraVerdict ? ' · ' + eraVerdict : ''}`;

    return {
        cms: cmsName,
        cmsRaw,
        majorVersion: major,
        version: tech.version || null,
        isBaukasten: !!tech.isBaukasten,
        techStackVerdict,
        techSeverity,
        techYearsBehind,
        cmsReleaseYear: cmsName && major ? CMS_RELEASE_YEAR[cmsName]?.[major] ?? null : null,
        cmsEolYear: cmsName && major ? CMS_EOL_YEAR[cmsName]?.[major] ?? null : null,
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
                    : 'Tech-Stand aktuell'
    };
}
