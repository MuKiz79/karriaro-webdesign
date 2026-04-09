/**
 * Branchen-UX-Audit mit 9 Personas
 *
 * Prueft ob branchenspezifische Must-Have-Features vorhanden sind.
 * Erkennung ueber Lighthouse-Audits (bevorzugt) und Network-Request URL-Patterns (Fallback).
 *
 * @module analysis/ux-audit
 */

/**
 * Branchen-Personas mit erwarteten Features und deren Erkennungs-Patterns
 * @type {Object<string, Object>}
 */
const PERSONAS = {
    'dentist': {
        name: 'Zahnarztpraxis',
        persona: 'Patient sucht Zahnarzt auf dem Handy, will sofort Termin buchen',
        mustHave: [
            { id: 'booking', name: 'Online-Terminbuchung', why: '73% der Patienten erwarten Online-Buchung (Doctolib-Generation)', patterns: /doctolib|jameda|samedi|terminland|appointly|booking|termin|buchung|calendly|acuity/i, critical: true },
            { id: 'maps', name: 'Google Maps / Anfahrt', why: 'Patient will wissen wie er hinkommt', patterns: /maps\.google|google\.com\/maps|maps\.googleapis|mapbox|openstreetmap|leaflet|anfahrt/i, critical: true },
            { id: 'team', name: 'Team-Vorstellung mit Fotos', why: 'Vertrauen entsteht durch Gesichter — 68% waehlen Arzt nach Sympathie', patterns: /team|aerzte|zahnarzt.*portrait|mitarbeiter/i, critical: false },
            { id: 'reviews', name: 'Bewertungen / Referenzen', why: 'Social Proof — 84% lesen Reviews vor Arztbesuch', patterns: /jameda|google.*review|bewertung|rezension|trustpilot|provenexpert/i, critical: false },
            { id: 'services', name: 'Leistungsuebersicht', why: 'Patient will wissen ob Implantologie/Prophylaxe angeboten wird', patterns: /leistung|behandlung|implant|prophylaxe|bleaching|zahnersatz/i, critical: false },
        ],
        missingPitch: 'Ohne Online-Terminbuchung verliert eine Zahnarztpraxis 2026 Patienten an Praxen mit Doctolib. Das ist Ihr staerkstes Argument.',
        modernFeatures: ['Online-Terminbuchung', '3D-Praxisrundgang', 'Patientenportal', 'WhatsApp-Kontakt', 'Notdienst-Banner']
    },
    'doctor': {
        name: 'Arztpraxis',
        persona: 'Patient googelt Symptome, sucht Arzt in der Naehe, will schnell Termin',
        mustHave: [
            { id: 'booking', name: 'Online-Terminbuchung', why: 'Doctolib hat die Erwartung gesetzt — wer es nicht hat, wirkt veraltet', patterns: /doctolib|jameda|samedi|terminland|appointly|booking|termin|calendly/i, critical: true },
            { id: 'maps', name: 'Anfahrt / Lageplan', why: 'Besonders wichtig bei Aerzten — Patient ist oft krank und orientierungslos', patterns: /maps\.google|google\.com\/maps|maps\.googleapis|anfahrt|lageplan|mapbox|openstreetmap/i, critical: true },
            { id: 'hours', name: 'Sprechzeiten prominent', why: '91% suchen zuerst nach Oeffnungszeiten', patterns: /sprechzeit|oeffnungszeit|praxiszeit|montag.*freitag/i, critical: true },
            { id: 'emergency', name: 'Notfall-Info', why: 'Muss sofort sichtbar sein — kann lebensrettend sein', patterns: /notfall|notdienst|bereitschaft|akut/i, critical: false },
        ],
        missingPitch: 'Eine Arztpraxis ohne Online-Terminbuchung verliert junge Patienten an die Konkurrenz. Doctolib hat die Erwartung fuer immer veraendert.',
        modernFeatures: ['Online-Terminbuchung', 'Videosprechstunde', 'Rezept-Bestellung', 'Befund-Portal']
    },
    'restaurant': {
        name: 'Restaurant',
        persona: 'Hungrig, googelt "Restaurant in der Naehe", entscheidet in 10 Sekunden',
        mustHave: [
            { id: 'menu', name: 'Speisekarte online', why: '86% wollen die Karte sehen bevor sie kommen — kein PDF!', patterns: /speisekarte|menu|karte.*pdf|gerichte|vorspeise|hauptgang/i, critical: true },
            { id: 'reservation', name: 'Online-Reservierung', why: '65% buchen lieber online als anzurufen — besonders Gen Z', patterns: /reservier|opentable|thefork|quandoo|tischreservierung|buchung/i, critical: true },
            { id: 'photos', name: 'Food-Fotos / Ambiente', why: 'Instagram-Aera: Essen muss fotogen aussehen, auch auf der Website', patterns: /gallery|galerie|instagram.*embed|foto.*essen|ambiente/i, critical: false },
            { id: 'maps', name: 'Anfahrt / Maps', why: 'Spontane Besucher brauchen Navigation', patterns: /maps\.google|google\.com\/maps|anfahrt/i, critical: true },
            { id: 'hours', name: 'Oeffnungszeiten prominent', why: 'Die #1 gesuchte Info — muss sofort sichtbar sein', patterns: /oeffnungszeit|geoeffnet|ruhetag|montag.*sonntag/i, critical: true },
        ],
        missingPitch: 'Ein Restaurant ohne Online-Speisekarte und Reservierung verliert den Kampf gegen die Konkurrenz auf Google Maps. 86% wollen die Karte VORHER sehen.',
        modernFeatures: ['Online-Speisekarte (kein PDF)', 'Tischreservierung', 'Lieferservice-Integration', 'Events-Kalender', 'Instagram-Feed']
    },
    'hair_salon': {
        name: 'Friseursalon',
        persona: 'Sucht neuen Friseur, scrollt durch Google/Instagram, will sofort buchen',
        mustHave: [
            { id: 'booking', name: 'Online-Buchung', why: '70% der Kunden buchen vom Handy — Anruf ist eine Huerde', patterns: /booking|buchung|termin|treatwell|planity|calendly|terminland/i, critical: true },
            { id: 'gallery', name: 'Vorher/Nachher-Galerie', why: 'Kunden wollen das Ergebnis sehen — Instagram-Standard', patterns: /galerie|gallery|vorher.*nachher|portfolio|instagram/i, critical: true },
            { id: 'prices', name: 'Preisliste', why: 'Transparenz schafft Vertrauen — 78% checken Preise vorher', patterns: /preis|price|tarif|schnitt.*euro|damen.*herren/i, critical: false },
            { id: 'team', name: 'Stylisten-Vorstellung', why: 'Kunden waehlen ihren Stylisten — persoenliche Bindung', patterns: /team|stylist|friseur.*portrait|mitarbeiter/i, critical: false },
        ],
        missingPitch: 'Ein Friseursalon ohne Online-Buchung verliert die Generation die nicht mehr anruft. 70% buchen vom Handy.',
        modernFeatures: ['Online-Terminbuchung', 'Stylisten-Auswahl', 'Vorher/Nachher-Galerie', 'Produkt-Shop', 'Treueprogramm']
    },
    'real_estate_agency': {
        name: 'Immobilienmakler',
        persona: 'Immobilienkaeufer sucht Objekte, vergleicht 3-5 Makler, erwartet Premium-Erlebnis',
        mustHave: [
            { id: 'listings', name: 'Immobilien-Suche / Expose', why: 'Kaeufer erwartet sofort Objekte sehen zu koennen — nicht nur Kontaktformular', patterns: /immobili|objekt|expose|wohnung|haus.*kauf|listing|property/i, critical: true },
            { id: 'search', name: 'Suchfunktion / Filter', why: 'Kaeufer will nach Preis, Lage, Groesse filtern', patterns: /suche|filter|preisspanne|zimmer|flaeche.*qm|search/i, critical: true },
            { id: 'valuation', name: 'Online-Bewertung / Wertermittlung', why: 'Verkaeufer-Lead-Magnet #1 — "Was ist meine Immobilie wert?"', patterns: /bewertung|wertermittlung|immobilienwert|marktwert|valuation/i, critical: false },
            { id: 'virtual_tour', name: 'Virtuelle Besichtigung', why: 'Post-Corona Standard — spart Zeit fuer Kaeufer und Makler', patterns: /360|virtuell.*rundgang|virtual.*tour|matterport|3d.*besichtigung/i, critical: false },
        ],
        missingPitch: 'Ein Immobilienmakler ohne Expose-Suche auf der eigenen Website verliert Kaeufer an ImmoScout24 — und zahlt dort 15-25% Provision.',
        modernFeatures: ['Expose-Datenbank mit Filter', 'Online-Wertermittlung', '360-Grad-Rundgang', 'Energieausweis-Info', 'Kaeufer-Matching']
    },
    'hotel': {
        name: 'Hotel',
        persona: 'Reisender vergleicht Hotels, sucht Bilder, Preise, Verfuegbarkeit — entscheidet in Minuten',
        mustHave: [
            { id: 'booking', name: 'Direktbuchung', why: 'Jede Direktbuchung spart 15-25% Booking.com-Provision', patterns: /buchen|booking.*engine|reservierung|verfuegbarkeit|book.*now/i, critical: true },
            { id: 'gallery', name: 'Hochwertige Zimmer-Fotos', why: 'Bilder verkaufen Hotels — 67% buchen nicht ohne Fotos', patterns: /zimmer|room|suite|galerie|gallery|foto.*hotel/i, critical: true },
            { id: 'prices', name: 'Preise / Verfuegbarkeit', why: 'Gast will sofort wissen was es kostet — kein "Preis auf Anfrage"', patterns: /preis|rate|ab.*euro|verfuegbar|availability/i, critical: true },
            { id: 'reviews', name: 'Gaestebewertungen', why: 'Trust-Signal — 93% lesen Reviews vor Hotelbuchung', patterns: /bewertung|review|gaeste.*stimm|trustpilot|tripadvisor/i, critical: false },
        ],
        missingPitch: 'Jede Direktbuchung spart 15-25% Booking-Provision. Ohne Buchungsfunktion auf der eigenen Website verschenkt ein Hotel tausende Euro pro Monat.',
        modernFeatures: ['Direktbuchung', 'Zimmer-Konfigurator', 'Restaurant-Reservierung', 'Spa-Buchung', 'Erlebnis-Pakete']
    },
    'lawyer': {
        name: 'Rechtsanwalt / Kanzlei',
        persona: 'Mandant hat ein Problem, googelt panisch, braucht sofort Vertrauen und Kontakt',
        mustHave: [
            { id: 'specialization', name: 'Rechtsgebiete klar dargestellt', why: 'Mandant muss sofort sehen ob sein Problem abgedeckt ist', patterns: /rechtsgebiet|fachanwalt|arbeitsrecht|familienrecht|strafrecht|mietrecht/i, critical: true },
            { id: 'contact', name: 'Sofort-Kontakt (Telefon prominent)', why: 'Rechtsprobleme sind dringend — Telefonnummer muss in 2 Sekunden sichtbar sein', patterns: /tel:|telefon|anruf|ruf.*an|hotline|kontakt|impressum|mailto:/i, critical: true,
              check: (_psi, _urls, place) => !!(place && (place.internationalPhoneNumber || place.nationalPhoneNumber)) },
            { id: 'consultation', name: 'Erstberatung buchbar', why: '72% suchen zuerst online nach Anwaelten — wer Erstberatung anbietet gewinnt', patterns: /erstberatung|erstgespraech|beratungstermin|kostenlos.*beratung/i, critical: false },
            { id: 'team', name: 'Anwalts-Profile', why: 'Mandanten waehlen den Anwalt, nicht die Kanzlei', patterns: /anwalt|rechtsanwalt|partner|profil|vita|team/i, critical: false },
        ],
        missingPitch: '72% suchen ihren Anwalt zuerst online. Eine Kanzlei ohne klare Rechtsgebiete und sofort sichtbare Telefonnummer verliert Mandanten an die Konkurrenz.',
        modernFeatures: ['Online-Erstberatung buchen', 'Mandantenportal', 'Rechtsgebiete mit FAQ', 'Kosten-Transparenz', 'Video-Beratung']
    },
    'auto_repair': {
        name: 'KFZ-Werkstatt',
        persona: 'Auto ist kaputt, googelt panisch "Werkstatt in der Naehe", will JETZT Hilfe',
        mustHave: [
            { id: 'phone', name: 'Telefonnummer sofort sichtbar', why: 'Pannen sind Notfaelle — Nummer muss in 1 Sekunde sichtbar sein', patterns: /tel:|telefon|anruf|notdienst|pannenhilfe|kontakt|impressum/i, critical: true,
              check: (_psi, _urls, place) => !!(place && (place.internationalPhoneNumber || place.nationalPhoneNumber)) },
            { id: 'services', name: 'Leistungen / Marken', why: 'Autofahrer will wissen: "Koennen die mein Auto?"', patterns: /leistung|service|inspektion|tuev|oelwechsel|bremse|reifen/i, critical: true },
            { id: 'hours', name: 'Oeffnungszeiten', why: 'Panne passiert nicht nur Mo-Fr 9-17', patterns: /oeffnungszeit|geoeffnet|notdienst|samstag/i, critical: true },
            { id: 'appointment', name: 'Termin vereinbaren', why: 'Fuer geplante Inspektionen will niemand mehr anrufen', patterns: /termin|werkstatt.*termin|buchung|appointment/i, critical: false },
        ],
        missingPitch: 'Eine KFZ-Werkstatt ohne sofort sichtbare Telefonnummer verliert Notfall-Kunden. Die googeln, sehen keine Nummer, und rufen den naechsten an.',
        modernFeatures: ['Online-Terminbuchung', 'Schadens-Upload (Foto)', 'Kostenvoranschlag online', 'Leihwagen-Buchung', 'Status-Tracking']
    },
    'plumber': {
        name: 'Sanitaerbetrieb',
        persona: 'Rohr geplatzt, Wasser laeuft, googelt "Sanitaer Notdienst" — Panik-Modus',
        mustHave: [
            { id: 'emergency', name: 'Notdienst-Nummer GROSS', why: 'Das ist die wichtigste Info — muss in 0.5 Sekunden sichtbar sein', patterns: /notdienst|notfall|24.*stunden|rund.*uhr|sofort.*hilfe/i, critical: true },
            { id: 'phone', name: 'Telefon sofort klickbar', why: 'Auf dem Handy: Ein Tipp = Anruf. Keine Suche noetig.', patterns: /tel:|href.*tel|click.*call|anruf|kontakt|impressum/i, critical: true,
              check: (_psi, _urls, place) => !!(place && (place.internationalPhoneNumber || place.nationalPhoneNumber)) },
            { id: 'area', name: 'Einsatzgebiet', why: 'Kunde will wissen ob der Betrieb zu ihm kommt', patterns: /einsatzgebiet|region|umkreis|wir.*kommen/i, critical: false },
        ],
        missingPitch: 'Wenn ein Rohr platzt, googelt der Kunde "Sanitaer Notdienst [Stadt]". Wer keine riesige Notdienst-Nummer auf der Website hat, verliert an den Naechsten.',
        modernFeatures: ['Notdienst-Banner (sticky)', 'Click-to-Call', 'WhatsApp-Kontakt', 'Schadens-Foto hochladen', 'Preis-Indikator']
    },
    '_default': {
        name: 'Lokales Unternehmen',
        persona: 'Kunde sucht Dienstleister in der Naehe, vergleicht 3-5 Optionen',
        mustHave: [
            { id: 'contact', name: 'Kontaktdaten sichtbar', why: 'Telefon + E-Mail + Adresse muessen sofort findbar sein', patterns: /kontakt|telefon|tel:|email|adresse|anfahrt|impressum|mailto:|href="tel:/i, critical: true,
              check: (_psi, _urls, place) => !!(place && (place.internationalPhoneNumber || place.nationalPhoneNumber || place.formattedAddress)) },
            { id: 'maps', name: 'Standort / Maps', why: 'Lokale Kunden brauchen Anfahrt', patterns: /maps\.google|google\.com\/maps|maps\.googleapis|anfahrt|standort|leaflet|mapbox|openstreetmap/i, critical: true },
            { id: 'mobile', name: 'Mobile-Optimierung', why: '60%+ der Besucher kommen vom Handy',
              check: (psi) => { const s = psi?.lighthouseResult?.audits?.['viewport']?.score; return s !== 0 && s !== null; }, critical: true },
        ],
        missingPitch: 'Eine Website ohne sichtbare Kontaktdaten und Mobile-Optimierung verliert 60% der potenziellen Kunden.',
        modernFeatures: ['Online-Kontaktformular', 'WhatsApp-Button', 'Google Maps Integration', 'FAQ-Bereich']
    }
};

/**
 * Fuehrt Branchen-UX-Audit durch
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @param {Object|null} place - Google Places Daten
 * @returns {{persona: Object, results: Array, found: Array, missing: Array,
 *            missingCritical: Array, uxScore: number, funnelImpact: number,
 *            pitchArguments: string[], topPitch: string, modernFeatures: string[]}}
 */
export function auditUX(psiData, place) {
    const type = place?.primaryType || '_default';
    const persona = PERSONAS[type] || PERSONAS._default;
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || [])
        .map(i => i.url || '').join(' ');

    // Universelle Checks die JEDE Branche bekommt (wenn nicht schon in Persona)
    let features = [...persona.mustHave];
    const hasIds = new Set(features.map(f => f.id));

    if (!hasIds.has('mobile')) {
        features.push({
            id: 'mobile', name: 'Mobile-Optimierung', why: '60%+ der Besucher kommen vom Handy',
            check: (psi) => { const s = psi?.lighthouseResult?.audits?.['viewport']?.score; return s !== 0 && s !== null; },
            critical: true
        });
    }
    if (!hasIds.has('contact') && !hasIds.has('phone')) {
        features.push({
            id: 'contact', name: 'Kontaktdaten sichtbar', why: 'Telefon + Adresse muessen sofort findbar sein',
            patterns: /kontakt|telefon|tel:|email|impressum|mailto:|href="tel:|@[a-z].*\.[a-z]/i,
            check: (_psi, _urls, pl) => !!(pl && (pl.internationalPhoneNumber || pl.nationalPhoneNumber || pl.formattedAddress)),
            critical: true
        });
        // HINWEIS: check() und patterns sind ODER-verknüpft — wenn check() false (kein Place),
        // wird patterns geprüft. "kontakt" oder "impressum" in irgendeiner URL = found.
    }

    const results = features.map(feature => {
        let found = false;
        if (feature.check) {
            found = feature.check(psiData, urls, place);
        }
        if (!found && feature.patterns) {
            found = feature.patterns.test(urls);
        }
        return { ...feature, found };
    });

    const missing = results.filter(r => !r.found);
    const missingCritical = missing.filter(r => r.critical);
    const found = results.filter(r => r.found);

    // UX Score: 0-100 basierend auf vorhandenen Features
    const totalWeight = results.reduce((s, r) => s + (r.critical ? 2 : 1), 0);
    const foundWeight = found.reduce((s, r) => s + (r.critical ? 2 : 1), 0);
    const uxScore = Math.round((foundWeight / totalWeight) * 100);

    // Funnel-Impact: Fehlende kritische Features senken Interesse und Abschluss
    const funnelImpact = missingCritical.length * 2 + missing.filter(r => !r.critical).length;

    return {
        persona,
        results,
        found,
        missing,
        missingCritical,
        uxScore,
        funnelImpact,
        pitchArguments: missing.map(m => `${m.name}: ${m.why}`),
        topPitch: missingCritical.length > 0
            ? persona.missingPitch
            : (missing.length > 0
                ? `Fehlende Features: ${missing.map(m => m.name).join(', ')}`
                : 'Website hat alle erwarteten Features'),
        modernFeatures: persona.modernFeatures
    };
}
