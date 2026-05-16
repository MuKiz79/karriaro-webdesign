/**
 * Branchen-Standards — Was eine Website der jeweiligen Branche
 * mindestens haben sollte (mustHave) und idealerweise hat (shouldHave).
 *
 * Schluessel: Google Places primaryType (siehe Lead-Intelligence-Tool
 * priors/branch-priors.js fuer die kanonische Liste).
 *
 * Detect-Strategie:
 *  - subPage: Regex ueber den per extractSubPages() gefundenen Slot/URL/Anchor-Text
 *  - body:    Regex ueber den HTML-Body der Startseite (geplain-text)
 *
 * Match: ein Item gilt als gefunden, sobald EINE der detect-Strategien greift.
 */

const BRANCH_STANDARDS = {
    'lawyer': {
        name: 'Anwaltskanzlei',
        mustHave: [
            { id: 'fachgebiete', label: 'Fachgebiete-/Rechtsgebiete-Seite', detect: { subPage: /fachgebiet|rechtsgebiet|taetigkeit|tätigkeit|spezialis/i } },
            { id: 'team', label: 'Anwalts-/Team-Vorstellung', detect: { subPage: /team|anwalt|kanzlei|ueber[- ]?uns|über[- ]?uns/i } },
            { id: 'impressum-rak', label: 'Impressum mit Rechtsanwaltskammer', detect: { body: /rechtsanwaltskammer|\bRAK\b/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Kanzleiadresse', detect: { subPage: /kontakt|anfahrt|standort/i } }
        ],
        shouldHave: [
            { id: 'honorar', label: 'Honorar-/Gebuehreninformation', detect: { subPage: /honorar|gebuehr|gebühr|preis|kosten/i, body: /honorar|stundensatz|\bRVG\b/i } },
            { id: 'termin-online', label: 'Online-Terminbuchung', detect: { body: /termin.*online|online.*termin|calendly|terminland|kanzlei.*buchung/i } }
        ],
        pitchMissing: 'Mandanten erwarten heute, dass eine Kanzlei online entscheidbar wird — Fachgebiete, Anwaelte und Honorare transparent.',
        pitchAllOk: 'Ihre Site erfuellt die zentralen Kanzlei-Standards.'
    },
    'dentist': {
        name: 'Zahnarztpraxis',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-/Behandlungs-Seite', detect: { subPage: /leistung|behandl|therap|prophylax/i } },
            { id: 'team', label: 'Praxis-/Team-Vorstellung', detect: { subPage: /team|praxis|ueber[- ]?uns|über[- ]?uns/i } },
            { id: 'sprechzeiten', label: 'Sprechzeiten / Oeffnungszeiten', detect: { body: /sprechzeit|oeffnungszeit|öffnungszeit|montag.*freitag|mo[- ]?fr/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Praxis-Adresse', detect: { subPage: /kontakt|anfahrt/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Terminbuchung', detect: { body: /termin.*online|doctolib|jameda|samedi|terminland/i } },
            { id: 'notdienst', label: 'Notdienst-Hinweis', detect: { body: /notdienst|notfall.*nummer/i } }
        ],
        pitchMissing: 'Patienten googeln Sprechzeiten und buchen Termine online — wer das nicht zeigt, verliert sie an die Praxis nebenan.',
        pitchAllOk: 'Ihre Praxis ist online auffindbar und entscheidbar.'
    },
    'doctor': {
        name: 'Arztpraxis',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-/Behandlungs-Seite', detect: { subPage: /leistung|behandl|therap|sprech/i } },
            { id: 'team', label: 'Aerzte-/Team-Vorstellung', detect: { subPage: /team|aerzt|ärzt|arzt|praxis|ueber[- ]?uns|über[- ]?uns/i } },
            { id: 'sprechzeiten', label: 'Sprechzeiten', detect: { body: /sprechzeit|oeffnungszeit|öffnungszeit|mo[- ]?fr/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Praxis-Adresse', detect: { subPage: /kontakt|anfahrt/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Terminbuchung', detect: { body: /termin.*online|doctolib|jameda|samedi|terminland/i } },
            { id: 'kassen', label: 'Kassen-/Privatpatient-Hinweis', detect: { body: /gesetzlich.*kasse|privatpatient|alle.*kassen/i } },
            // Sprint 67 — Karriaro-typische Praxis-Werkzeuge
            { id: 'rezept-online', label: 'Online-/Folge-Rezept-Anfrage', detect: { body: /rezept.*online|folgerezept|e[-_]?rezept|rezept.*anfordern|rezept.*bestellen/i } },
            { id: 'telemedizin', label: 'Telemedizin / Videosprechstunde', detect: { body: /telemedizin|video.*sprechstunde|videosprechstund|online.*sprechstunde/i } }
        ],
        pitchMissing: 'Patienten erwarten online klare Sprechzeiten und Termin-Buchung. Fehlt das, wird die Praxis nicht gefunden — oder nicht angerufen.',
        pitchAllOk: 'Ihre Praxis ist online entscheidbar.'
    },
    'real_estate_agency': {
        name: 'Immobilienmakler',
        mustHave: [
            { id: 'objekte', label: 'Objekt-/Immobilien-Liste', detect: { subPage: /objekt|immobilie|expose|exposé|angebot|portfolio/i, body: /\b(portfolio|aktuelle angebote|unsere immobilien|expose|exposé|verkaufsobjekt|mietobjekt)\b/i } },
            { id: 'leistungen', label: 'Leistungs-Seite (Vermarktung/Bewertung)', detect: { subPage: /leistung|service|verkauf|vermiet|bewertung/i, body: /\b(leistungen|unsere leistungen|services?|unser angebot|wir bieten|leistungsspektrum|was wir tun|verkaufen|vermieten|kauf.*verkauf)\b/i } },
            { id: 'team', label: 'Makler-/Team-Vorstellung', detect: { subPage: /team|makler|ueber[- ]?uns|über[- ]?uns/i, body: /\b(über uns|über mich|ueber uns|ueber mich|unser team|das team|wer wir sind|inhabergeführt|inhaberin|inhaber|geschäftsführer|geschaeftsfuehrer)\b/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Buerostandort', detect: { subPage: /kontakt/i, body: /\bkontakt\b[\s\S]{0,800}(\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+|Stuttgart|München|Muenchen|Berlin|Hamburg|Köln|Koeln|Düsseldorf|Duesseldorf|Frankfurt|Leipzig|Hannover|Bremen|Nürnberg|Nuernberg|Dortmund|Essen|Dresden)/i } }
        ],
        shouldHave: [
            { id: 'bewertung', label: 'Online-Wertermittlungs-Rechner', detect: { body: /immobilienbewertung|wert.*ermitteln|kostenlos.*bewertung|wertermittlung|sprengnetter|preisatlas/i } },
            { id: 'referenzen', label: 'Referenzen / Erfolgsgeschichten', detect: { subPage: /referenz|kundenstimme|verkauf/i, body: /verkauft|erfolgreich.*vermittelt/i } },
            // Sprint 67 — Karriaro-typische Immobilien-Werkzeuge
            { id: 'ivd-zert', label: 'IVD-/HypZert-Mitgliedschaft', detect: { body: /\bIVD\b|hypzert|sachverstaendig|sachverständig|öbuv/i } },
            { id: 'marktbericht', label: 'Marktbericht / Marktbarometer', detect: { subPage: /markt|news|insights|wissen|magazin/i, body: /marktbericht|marktbarometer|marktanalyse|quadratmeter[- ]?preis/i } },
            { id: 'objekt-filter', label: 'Filter-/Suche-Werkzeug im Portfolio', detect: { body: /filter|sortieren|preis.*von.*bis|zimmer.*anzahl|kaufen.*mieten/i } }
        ],
        pitchMissing: 'Eigentuemer entscheiden online vor dem Erstgespraech — Wertermittlung, Marktbericht und IVD-Zertifikat schaffen das Vertrauen.',
        pitchAllOk: 'Ihre Maklerseite zeigt, was Eigentuemer suchen.'
    },
    'hotel': {
        name: 'Hotel',
        mustHave: [
            { id: 'zimmer', label: 'Zimmer-/Suiten-Uebersicht', detect: { subPage: /zimmer|suite|unterkunft/i } },
            { id: 'preise', label: 'Preise oder Buchungs-Widget', detect: { body: /€\s?\d|ab\s?\d+\s?€|booking|hrs|reservierung/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Adresse + Anfahrt', detect: { subPage: /kontakt|anfahrt|lage/i } },
            { id: 'fruehstueck', label: 'Fruehstueck / Verpflegung', detect: { body: /fruehstueck|frühstück|halbpension|inklusive/i } }
        ],
        shouldHave: [
            { id: 'direkt-buchen', label: 'Direkt-Buchen-Button', detect: { body: /direkt.*buchen|jetzt.*buchen|verfuegbarkeit|verfügbarkeit/i } },
            { id: 'wellness', label: 'Wellness-/Spa-Bereich', detect: { subPage: /wellness|spa|sauna/i } }
        ],
        pitchMissing: 'Gaeste vergleichen Bilder, Preise und Lage in 30 Sekunden — alles drei muss sofort sichtbar sein.',
        pitchAllOk: 'Ihre Hotel-Seite liefert die drei Entscheidungs-Faktoren.'
    },
    'restaurant': {
        name: 'Restaurant',
        mustHave: [
            { id: 'speisekarte', label: 'Speisekarte', detect: { subPage: /speise|menu|menü|karte/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|geoeffnet|geöffnet|montag.*sonntag|mo[- ]?fr|mo[- ]?so/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-ZAEOEUae][a-zaeoeuß]+/i } },
            { id: 'reservierung', label: 'Online-Reservierungs-Tool', detect: { body: /reserv|tisch.*buch|opentable|quandoo|bookatable|formitable/i } }
        ],
        shouldHave: [
            { id: 'galerie', label: 'Galerie / Foodfotos', detect: { subPage: /galerie|impression|fotos/i } },
            { id: 'events', label: 'Events / Catering', detect: { subPage: /event|catering|feier/i } },
            // Sprint 67 — Karriaro-typische Gastro-Werkzeuge
            { id: 'saisonkarte', label: 'Saisonkarte / Tagesempfehlung', detect: { body: /saisonal|saisonkarte|tagesempfehlung|wochenkarte|saison.*menu/i } },
            { id: 'wein-pairing', label: 'Weinkarte / Sommelier-Empfehlung', detect: { body: /weinkarte|weinempfehlung|sommelier|wein.*pairing/i } },
            { id: 'bewertungen', label: 'Google-/TripAdvisor-Bewertungen sichtbar', detect: { body: /google.*bewert|tripadvisor|sterne.*bewertung|trustpilot/i } }
        ],
        pitchMissing: 'Speisekarte, Oeffnungszeiten und Reservierung sind die drei Klicks, nach denen Gaeste suchen — fehlt einer, gehen sie nebenan essen.',
        pitchAllOk: 'Ihre Restaurant-Seite liefert die drei Entscheidungs-Klicks.'
    },
    'hair_salon': {
        name: 'Friseursalon',
        mustHave: [
            { id: 'leistungen-preise', label: 'Leistungen mit Preisen', detect: { subPage: /leistung|preis/i, body: /€\s?\d|ab\s?\d+\s?€/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|geoeffnet|geöffnet|mo[- ]?fr|mo[- ]?sa/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            { id: 'team', label: 'Team mit Foto', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Terminbuchung 24/7', detect: { body: /termin.*online|treatwell|booksy|salonkee|shore|fresha/i } },
            { id: 'galerie', label: 'Stil-/Galerie-Beispiele', detect: { subPage: /galerie|inspiration|frisuren/i } },
            // Sprint 67 — Karriaro-typische Friseur-Werkzeuge
            { id: 'stylist-wahl', label: 'Wunsch-Stylist wählbar', detect: { body: /stylist.*waehlen|stylist.*wählen|lieblings.*stylist|persönlich.*stylist/i } },
            { id: 'stilberatung', label: 'Stil-/Farbberatung explizit', detect: { body: /stilberatung|farbberatung|hairconcept|typberatung|colour.*consult/i } }
        ],
        pitchMissing: 'Kundinnen entscheiden via Bilder und Preise vor dem ersten Termin — wer beides nicht zeigt, kostet Walk-ins.',
        pitchAllOk: 'Ihr Salon zeigt online, was Kundinnen suchen.'
    },
    'beauty_salon': {
        name: 'Kosmetikstudio',
        mustHave: [
            { id: 'leistungen-preise', label: 'Behandlungen mit Preisen', detect: { subPage: /behandl|leistung|preis/i, body: /€|preis/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|mo[- ]?fr|mo[- ]?sa/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            { id: 'team', label: 'Studio-/Team-Vorstellung', detect: { subPage: /team|studio|ueber[- ]?uns|über[- ]?uns/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Terminbuchung', detect: { body: /termin.*online|booksy|treatwell/i } },
            { id: 'gutscheine', label: 'Gutschein-Verkauf', detect: { subPage: /gutschein/i } }
        ],
        pitchMissing: 'Kundinnen vergleichen Behandlungen und Preise online — fehlt Transparenz, wandern sie zur Konkurrenz.',
        pitchAllOk: 'Ihr Studio ist online entscheidbar.'
    },
    'physiotherapist': {
        name: 'Physiotherapie',
        mustHave: [
            { id: 'leistungen', label: 'Behandlungs-/Therapie-Uebersicht', detect: { subPage: /behandl|therap|leistung/i } },
            { id: 'team', label: 'Therapeuten-/Team-Vorstellung', detect: { subPage: /team|therapeut|ueber[- ]?uns|über[- ]?uns/i } },
            { id: 'oeffnungszeiten', label: 'Sprechzeiten', detect: { body: /oeffnungszeit|öffnungszeit|sprechzeit|mo[- ]?fr/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Termin', detect: { body: /termin.*online|terminland|samedi/i } },
            { id: 'kassen', label: 'Kassen-Hinweis (Rezept/Privat)', detect: { body: /rezept|gesetzlich|privatpatient|verordnung/i } }
        ],
        pitchMissing: 'Patienten googeln Behandlungs-Schwerpunkte und Termine — beides muss klar sein, sonst rufen sie woanders an.',
        pitchAllOk: 'Ihre Praxis ist online auffindbar.'
    },
    'plumber': {
        name: 'Sanitaer-/Heizungs-Betrieb',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-Liste', detect: { subPage: /leistung|service|angebot/i } },
            { id: 'notdienst', label: 'Notdienst-Hinweis', detect: { body: /notdienst|notfall|24h|24[- ]?stund/i } },
            { id: 'einsatzgebiet', label: 'Einsatzgebiet / Region', detect: { body: /einsatzgebiet|umkreis|region|umgebung/i } },
            { id: 'kontakt-telefon', label: 'Telefon prominent', detect: { body: /tel[\.: ]\s*[\+\d]/i } }
        ],
        shouldHave: [
            { id: 'referenzen', label: 'Projekt-Referenzen / Bilder', detect: { subPage: /referenz|projekt|galerie/i } },
            { id: 'foerder', label: 'Foerder-/BAFA-Hinweis Waermepumpe', detect: { body: /BAFA|foerderung|förderung|waermepump|wärmepump/i } },
            // Sprint 67 — Karriaro-typische Handwerk-Werkzeuge
            { id: 'anfrage-formular', label: 'Online-Anfrage-Formular (statt nur Telefon)', detect: { subPage: /anfrage|kontaktformular/i, body: /anfrage.*formular|jetzt.*anfragen|kostenloses.*angebot/i } },
            { id: 'festpreis', label: 'Festpreis-/Foto-Anfrage-Tool', detect: { body: /festpreis|fixpreis|garantierter.*preis|foto.*anfrage|bild.*hochladen|schadensfoto/i } },
            { id: 'innung', label: 'SHK-/Innungs-Mitgliedschaft', detect: { body: /\bSHK\b|innung|handwerkskammer|\bHWK\b|fachverband/i } }
        ],
        pitchMissing: 'Hausbesitzer rufen den Betrieb an, der Leistungen, Notdienst und Telefonnummer in 5 Sekunden zeigt.',
        pitchAllOk: 'Ihr Betrieb ist online direkt anrufbar.'
    },
    'electrician': {
        name: 'Elektriker',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-Liste', detect: { subPage: /leistung|service|angebot/i } },
            { id: 'notdienst', label: 'Notdienst-Hinweis', detect: { body: /notdienst|notfall|24h/i } },
            { id: 'einsatzgebiet', label: 'Einsatzgebiet / Region', detect: { body: /einsatzgebiet|umkreis|region/i } },
            { id: 'kontakt-telefon', label: 'Telefon prominent', detect: { body: /tel[\.: ]\s*[\+\d]/i } }
        ],
        shouldHave: [
            { id: 'pv-foerder', label: 'PV-/Wallbox-/Foerder-Hinweis', detect: { body: /photovoltaik|\bpv\b|wallbox|\bkfw\b|foerderung|förderung/i } },
            { id: 'referenzen', label: 'Projekt-Referenzen', detect: { subPage: /referenz|projekt/i } },
            // Sprint 67 — Karriaro-typische Elektro-Werkzeuge
            { id: 'anfrage-formular', label: 'Online-Anfrage-Formular', detect: { subPage: /anfrage|kontaktformular/i, body: /anfrage.*formular|jetzt.*anfragen|kostenloses.*angebot/i } },
            { id: 'innung', label: 'Elektro-Innung / HWK-Mitgliedschaft', detect: { body: /innung|handwerkskammer|\bHWK\b|fachverband|elektro.*meister/i } }
        ],
        pitchMissing: 'Privatkunden googeln Wallbox + PV — wer die Leistungen nicht zeigt, faellt aus dem Suchergebnis.',
        pitchAllOk: 'Ihr Betrieb ist online direkt anrufbar.'
    },
    'auto_repair': {
        name: 'Kfz-Werkstatt',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-Liste (TUEV, Inspektion, Reifen, ...)', detect: { subPage: /leistung|service/i, body: /tuev|tüv|inspektion|reifen|oelwechsel|ölwechsel/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|mo[- ]?fr/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            { id: 'tuev', label: 'TUEV/HU-Service genannt', detect: { body: /tuev|tüv|hauptuntersuchung|\bhu\b|\bau\b/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Termin / Werkstatt-Anfrage', detect: { body: /termin.*online|werkstatt.*anfrage|kostenvoranschlag/i } },
            { id: 'marken', label: 'Marken-Spezialisierung sichtbar', detect: { body: /\bvw\b|\bbmw\b|mercedes|\baudi\b|\bopel\b|\bford\b|spezialist/i } }
        ],
        pitchMissing: 'Autofahrer googeln "TUEV [Stadt]" — wer das nicht prominent zeigt, taucht in der Suche nicht auf.',
        pitchAllOk: 'Ihre Werkstatt ist online auffindbar.'
    },
    '_default': {
        name: 'Lokales Unternehmen',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-/Service-Uebersicht', detect: { subPage: /leistung|service|angebot|produkt/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Adresse', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten oder Erreichbarkeit', detect: { body: /oeffnungszeit|öffnungszeit|sprechzeit|mo[- ]?fr/i } }
        ],
        shouldHave: [
            { id: 'team', label: 'Team-/Ueber-uns-Seite', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns|about/i } }
        ],
        pitchMissing: 'Auch ohne Branchen-Spezifika erwarten Besucher Leistungen, Adresse und Oeffnungszeiten.',
        pitchAllOk: 'Die Standard-Erwartungen sind erfuellt.'
    }
};

/**
 * @param {string|null} primaryType  Google Places primaryType (z.B. 'lawyer'),
 *                                   oder null wenn keine Branche erkannt.
 * @param {object} ctx               { subPages: [{slot, url, anchorText}], body: string }
 * @returns {object}                 { branch, primaryType, mustHave[], shouldHave[],
 *                                     foundCount, totalCount, severity, pitchArg }
 */
function checkBranchStandards(primaryType, ctx) {
    const standards = BRANCH_STANDARDS[primaryType] || BRANCH_STANDARDS._default;
    const usedDefault = !BRANCH_STANDARDS[primaryType];
    const subPages = ctx.subPages || [];
    const subPageStr = subPages.map(p => `${p.url || ''} ${p.anchorText || ''} ${p.slot || ''}`).join(' ');
    const body = ctx.body || '';

    function check(item) {
        if (item.detect.subPage && item.detect.subPage.test(subPageStr)) return true;
        if (item.detect.body && item.detect.body.test(body)) return true;
        return false;
    }

    const must = standards.mustHave.map(i => ({ id: i.id, label: i.label, found: check(i) }));
    const should = standards.shouldHave.map(i => ({ id: i.id, label: i.label, found: check(i) }));
    const totalCount = must.length + should.length;
    const foundCount = must.filter(i => i.found).length + should.filter(i => i.found).length;
    const mustMissingCount = must.filter(i => !i.found).length;

    let severity;
    if (mustMissingCount >= 2) severity = 4;
    else if (mustMissingCount === 1) severity = 3;
    else if (foundCount < totalCount - 1) severity = 2;
    else if (foundCount < totalCount) severity = 1;
    else severity = 0;

    return {
        branch: standards.name,
        primaryType: primaryType || null,
        usedDefault,
        mustHave: must,
        shouldHave: should,
        foundCount,
        totalCount,
        severity,
        pitchArg: mustMissingCount > 0 || foundCount < totalCount - 1
            ? standards.pitchMissing
            : standards.pitchAllOk
    };
}

module.exports = { BRANCH_STANDARDS, checkBranchStandards };
