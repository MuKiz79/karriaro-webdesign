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
            // Sprint 72 — body-Fallbacks (steiger-zerr.de hat "Rechtsgebiete" + "Kanzlei" sichtbar, war ✗)
            { id: 'fachgebiete', label: 'Fachgebiete-/Rechtsgebiete-Seite', detect: { subPage: /fachgebiet|rechtsgebiet|taetigkeit|tätigkeit|spezialis/i, body: /\b(fachgebiete?|rechtsgebiete?|tätigkeitsfelder?|spezialisierung|rechtsbereich)\b/i } },
            { id: 'team', label: 'Anwalts-/Team-Vorstellung', detect: { subPage: /team|anwalt|kanzlei|ueber[- ]?uns|über[- ]?uns/i, body: /\b(anwa[lt]+|fachanwa[lt]+|partner(in)?|kanzlei|sozietät|unsere kanzlei|anwaltskanzlei)\b/i } },
            { id: 'impressum-rak', label: 'Impressum mit Rechtsanwaltskammer', detect: { body: /rechtsanwaltskammer|\bRAK\b/i } },
            // Sprint 71 — body-Fallback (PLZ-Pattern) fuer SPA-Sites ohne /kontakt-SubPage
            { id: 'kontakt-adresse', label: 'Kontakt mit Kanzleiadresse', detect: { subPage: /kontakt|anfahrt|standort/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
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
            // Sprint 72 — Pattern erweitert um Weekday+Time (Site mit "Montag - Freitag 9:00 Uhr" sichtbar)
            { id: 'sprechzeiten', label: 'Sprechzeiten / Oeffnungszeiten', detect: { body: /sprechzeit|oeffnungszeit|öffnungszeit|montag.*freitag|mo[- ]?fr|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            // Sprint 71 — body-Fallback fuer SPA-Sites ohne /kontakt-SubPage (deuschle.de hat "70329 Stuttgart" im body sichtbar)
            { id: 'kontakt-adresse', label: 'Kontakt mit Praxis-Adresse', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
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
            // Sprint 72 — Weekday+Time-Pattern
            { id: 'sprechzeiten', label: 'Sprechzeiten', detect: { body: /sprechzeit|oeffnungszeit|öffnungszeit|mo[- ]?fr|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            // Sprint 71 — body-Fallback fuer SPA-Sites (gleicher Fix wie dentist)
            { id: 'kontakt-adresse', label: 'Kontakt mit Praxis-Adresse', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
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
            // Sprint 71 — body-Fallback (PLZ-Pattern) fuer SPA-Sites
            { id: 'kontakt-adresse', label: 'Kontakt mit Adresse + Anfahrt', detect: { subPage: /kontakt|anfahrt|lage/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } },
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
            // Sprint 71 — body-Fallback: "ZUR SPEISEKARTE" als Button-Text sichtbar (zur-sattlerei.de) auch wenn kein /speisekarte-SubPage-Anker
            { id: 'speisekarte', label: 'Speisekarte', detect: { subPage: /speise|menu|menü|karte/i, body: /\b(speisekarte|speise.?karte|menü|menu(\skarte)?|gerichte|à\s?la\s?carte|tagesempfehlung|wochenkarte|spargelkarte|mittagstisch)\b/i } },
            // Sprint 72 — Weekday+Time-Pattern
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|geoeffnet|geöffnet|montag.*sonntag|mo[- ]?fr|mo[- ]?so|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
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
            // Sprint 70 — body-Fallback fuer Preisliste/€-Pattern (kimbutun.de hatte "PREISLISTE" 2x, war false)
            { id: 'leistungen-preise', label: 'Leistungen mit Preisen', detect: { subPage: /leistung|preis|service/i, body: /€\s?\d|ab\s?\d+\s?€|\b(preisliste|preisuebersicht|preisübersicht|preise|preisinformation)\b/i } },
            // Sprint 72 — Weekday+Time-Pattern
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|geoeffnet|geöffnet|mo[- ]?fr|mo[- ]?sa|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            // Sprint 70 — body-Fallback fuer Team-Keywords (kimbutun.de hatte "Unser Team" sichtbar, war false)
            { id: 'team', label: 'Team mit Foto', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /\b(unser team|über uns|ueber uns|stylistin|stylist|friseurmeister(in)?|hairstylist)\b/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Terminbuchung 24/7', detect: { body: /termin.*online|treatwell|booksy|salonkee|shore|fresha/i } },
            // Sprint 70 — body-Fallback fuer Galerie-Keyword (kimbutun.de hatte "GALERIE" sichtbar, war false)
            { id: 'galerie', label: 'Stil-/Galerie-Beispiele', detect: { subPage: /galerie|inspiration|frisuren|portfolio|gallery/i, body: /\b(galerie|gallery|portfolio|inspiration|impressionen)\b/i } },
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
            // Sprint 72 — Weekday+Time
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|mo[- ]?fr|mo[- ]?sa|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            // Sprint 72 — body-Fallback (beautyspa36.de hat "Kosmetikerin"/"Inhaberin" sichtbar)
            { id: 'team', label: 'Studio-/Team-Vorstellung', detect: { subPage: /team|studio|ueber[- ]?uns|über[- ]?uns/i, body: /\b(unser team|über uns|kosmetikerin|inhaberin|inhaber|mein team)\b/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Terminbuchung', detect: { body: /termin.*online|booksy|treatwell|wellme/i } },
            // Sprint 72 — body-Fallback (beautyspa36.de hat "Gutschein" sichtbar als Button-Text)
            { id: 'gutscheine', label: 'Gutschein-Verkauf', detect: { subPage: /gutschein/i, body: /\b(gutschein|geschenkgutschein)\b/i } }
        ],
        pitchMissing: 'Kundinnen vergleichen Behandlungen und Preise online — fehlt Transparenz, wandern sie zur Konkurrenz.',
        pitchAllOk: 'Ihr Studio ist online entscheidbar.'
    },
    'physiotherapist': {
        name: 'Physiotherapie',
        mustHave: [
            { id: 'leistungen', label: 'Behandlungs-/Therapie-Uebersicht', detect: { subPage: /behandl|therap|leistung/i } },
            { id: 'team', label: 'Therapeuten-/Team-Vorstellung', detect: { subPage: /team|therapeut|ueber[- ]?uns|über[- ]?uns/i } },
            // Sprint 72 — Weekday+Time
            { id: 'oeffnungszeiten', label: 'Sprechzeiten', detect: { body: /oeffnungszeit|öffnungszeit|sprechzeit|mo[- ]?fr|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
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
            // Sprint 70 — body-Fallback fuer Leistungs-Keywords (hwoe.de hatte "Leistungen" 14x sichtbar, war false)
            { id: 'leistungen', label: 'Leistungs-Liste', detect: { subPage: /leistung|service|angebot/i, body: /\b(leistungen|unsere leistungen|services?|leistungsspektrum|unser angebot|wir bieten|heizungsbau|sanitaer|sanitär|bad(planung|sanierung)?)\b/i } },
            { id: 'notdienst', label: 'Notdienst-Hinweis', detect: { body: /notdienst|notfall|24h|24[- ]?stund/i } },
            { id: 'einsatzgebiet', label: 'Einsatzgebiet / Region', detect: { body: /einsatzgebiet|umkreis|region|umgebung/i } },
            // Sprint 70 — robust gegen verschiedene Tel-Darstellungen (body ist visible-text, ohne href-Attribute).
            // Matched "Telefon: ...", "Tel ...", "+49 ...", "0711 ..." (DE-Festnetz + Mobil).
            { id: 'kontakt-telefon', label: 'Telefon prominent', detect: { body: /\b(telefon|tel\.?|☎|📞|fon)\s*[:\.]?\s*[\+\d][\d\s\-\/]{4,}|\b\+49[\s\-\/]?[\d][\d\s\-\/]{5,}|\b0\d{2,4}[\s\-\/][\d][\d\s\-\/]{3,}/i } }
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
            // Sprint 70 — body-Fallback gleich wie plumber
            { id: 'leistungen', label: 'Leistungs-Liste', detect: { subPage: /leistung|service|angebot/i, body: /\b(leistungen|unsere leistungen|services?|leistungsspektrum|unser angebot|wir bieten|elektroinstallation|elektrotechnik)\b/i } },
            { id: 'notdienst', label: 'Notdienst-Hinweis', detect: { body: /notdienst|notfall|24h/i } },
            { id: 'einsatzgebiet', label: 'Einsatzgebiet / Region', detect: { body: /einsatzgebiet|umkreis|region/i } },
            // Sprint 70 — robustes Telefon-Pattern (visible-text statt href)
            { id: 'kontakt-telefon', label: 'Telefon prominent', detect: { body: /\b(telefon|tel\.?|☎|📞|fon)\s*[:\.]?\s*[\+\d][\d\s\-\/]{4,}|\b\+49[\s\-\/]?[\d][\d\s\-\/]{5,}|\b0\d{2,4}[\s\-\/][\d][\d\s\-\/]{3,}/i } }
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
    'painter': {
        name: 'Malerbetrieb',
        mustHave: [
            { id: 'leistungen', label: 'Leistungen (Innen/Außen/Fassade/Lackier)', detect: { subPage: /leistung|service|angebot/i, body: /\b(innenanstrich|aussenanstrich|fassaden(arbeit|sanierung|gestaltung)?|lackier(arbeit|en)?|tapezier(arbeit|en)?|spachtelarbeit|maler(arbeit|werk)?)\b/i } },
            { id: 'referenzen', label: 'Vorher-Nachher-Projekte / Galerie', detect: { subPage: /referenz|projekt|galerie|portfolio/i, body: /\b(referenzprojekt|kundenprojekt|vorher.?nachher|werkschau)\b/i } },
            { id: 'einsatzgebiet', label: 'Einsatzgebiet / Region', detect: { body: /einsatzgebiet|umkreis|region|umgebung|tätigkeitsgebiet/i } },
            { id: 'kontakt-telefon', label: 'Telefon prominent', detect: { body: /\b(telefon|tel\.?|☎|📞|fon)\s*[:\.]?\s*[\+\d][\d\s\-\/]{4,}|\b\+49[\s\-\/]?[\d][\d\s\-\/]{5,}|\b0\d{2,4}[\s\-\/][\d][\d\s\-\/]{3,}/i } }
        ],
        shouldHave: [
            { id: 'team', label: 'Maler-/Team-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /malermeister\w*|inhaber(in)?|unser team|familienbetrieb/i } },
            { id: 'innung', label: 'Maler-Innung / HWK-Mitgliedschaft', detect: { body: /maler.?innung|innung|handwerkskammer|\bHWK\b|fachverband/i } },
            { id: 'farb-beratung', label: 'Farb-/Stil-Beratung explizit', detect: { body: /farbberatung|farbkonzept|wandgestaltung|stilberatung|wohnberatung/i } }
        ],
        pitchMissing: 'Privatkunden googeln "Maler + Stadt" + erwarten Vorher-Nachher-Galerie und Region. Wer das nicht zeigt, ruft nicht an.',
        pitchAllOk: 'Ihr Malerbetrieb ist online entscheidbar.'
    },
    'landscaper': {
        name: 'Garten-/Landschaftsbau',
        mustHave: [
            { id: 'leistungen', label: 'Leistungen (Gartenanlage/Pflege/Baumpflege)', detect: { subPage: /leistung|service|angebot|garten|pflege/i, body: /\b(gartenanlage|gartenpflege|baumpflege|baumfäll|hecken(schnitt|pflege)?|rollrasen|terrassen(bau)?|wegebau|teich(bau|pflege)?)\b/i } },
            { id: 'einsatzgebiet', label: 'Einsatzgebiet / Region', detect: { body: /einsatzgebiet|umkreis|region|umgebung|tätigkeitsgebiet/i } },
            { id: 'foto-galerie', label: 'Garten-Foto-Galerie', detect: { subPage: /galerie|portfolio|projekte|referenz/i, body: /\b(galerie|projektgalerie|kundenprojekt|referenzgalerie|werkschau)\b/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'team', label: 'Meister-/Team-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /gärtnermeister\w*|landschaftsgärtner\w*|inhaber(in)?|unser team|familienbetrieb/i } },
            { id: 'beratung-vorort', label: 'Vor-Ort-Beratung / Gartenplanung', detect: { body: /vor.?ort.?beratung|gartenplanung|kostenfrei.*beratung|individuelle.*planung/i } }
        ],
        pitchMissing: 'Hausbesitzer googeln „Garten + Pflege + Stadt" + erwarten Foto-Galerie und Region — wer nichts zeigt, ist im Vergleich unsichtbar.',
        pitchAllOk: 'Ihr Garten-Landschaftsbau ist online entscheidbar.'
    },
    'general_contractor': {
        name: 'Bauunternehmen',
        mustHave: [
            { id: 'leistungen', label: 'Leistungen (Rohbau/Schlüsselfertig/Sanierung)', detect: { subPage: /leistung|service|angebot/i, body: /\b(rohbau|schluesselfertig|schlüsselfertig|hochbau|tiefbau|sanierung|umbau|neubau|baubetreuung|baukoordination)\b/i } },
            { id: 'referenzen', label: 'Bauprojekt-Referenzen / Portfolio', detect: { subPage: /referenz|projekt|portfolio|galerie/i, body: /\b(referenzprojekt|bauprojekt|fertiggestellt|kundenprojekt|projektgalerie)\b/i } },
            { id: 'team', label: 'Bauleitungs-/Team-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /bauleiter(in)?|polier|baumeister|geschäftsführ|inhaber(in)?|architekt(in)?/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'einsatzgebiet', label: 'Einsatzgebiet / Bauleistungs-Region', detect: { body: /einsatzgebiet|baugebiet|umkreis|region|umgebung/i } },
            { id: 'innung', label: 'Bau-Innung / HWK-Mitgliedschaft', detect: { body: /bauinnung|innung|handwerkskammer|\bHWK\b|fachverband|gütezeichen|gütesiegel/i } }
        ],
        pitchMissing: 'Bauherren entscheiden via Referenzprojekte + Team-Substanz. Wer Bauleitung + Bauten nicht zeigt, ist nicht im Pool.',
        pitchAllOk: 'Ihr Bauunternehmen ist online entscheidbar.'
    },
    'carpenter': {
        name: 'Schreinerei/Tischlerei',
        mustHave: [
            { id: 'leistungen', label: 'Leistungen (Möbel/Treppen/Türen/Küchen)', detect: { subPage: /leistung|service|angebot|möbel|moebel|kueche|küche/i, body: /\b(möbelbau|moebelbau|massivholz|einbaumöbel|einbaumoebel|treppen(bau)?|türen|tueren|fenster|kuechen|küchen|möbelschreiner|moebelschreiner|innenausbau)\b/i } },
            { id: 'referenzen', label: 'Möbel-/Foto-Galerie', detect: { subPage: /galerie|portfolio|projekte|referenz/i, body: /\b(galerie|kundenprojekt|werkschau|projektgalerie|möbelgalerie|moebelgalerie)\b/i } },
            { id: 'team', label: 'Schreinermeister-/Team-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /schreinermeister\w*|tischlermeister\w*|holzhandwerk|inhaber(in)?|familienbetrieb/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Werkstatt-Standort', detect: { subPage: /kontakt|anfahrt|werkstatt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'beratung-vorort', label: 'Vor-Ort-Aufmaß / Beratung', detect: { body: /aufmaß|aufmass|kostenfrei.*beratung|individuelle.*planung|maßgeschneidert|massgeschneidert/i } },
            { id: 'innung', label: 'Schreiner-Innung / HWK', detect: { body: /schreiner.?innung|tischler.?innung|innung|handwerkskammer|\bHWK\b/i } }
        ],
        pitchMissing: 'Bauherren googeln „Schreiner + Möbel + Stadt" + erwarten Foto-Galerie individueller Arbeiten — wer nichts zeigt, verliert das Erstgespräch.',
        pitchAllOk: 'Ihre Schreinerei ist online entscheidbar.'
    },
    'optical_store': {
        name: 'Optiker',
        mustHave: [
            { id: 'leistungen', label: 'Brillen-/Kontaktlinsen-/Sehtest-Leistungen', detect: { subPage: /leistung|brille|kontaktlins|sehtest/i, body: /\b(brille|kontaktlins|sehtest|gleitsicht|sonnenbrille|sportbrille|kinderbrille)\b/i } },
            { id: 'team', label: 'Augenoptiker-/Team-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /augenoptik\w*|optikermeister\w*|hörakustik\w*|hoerakustik\w*|inhaber(in)?/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|mo[- ]?fr|mo[- ]?sa|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Termin (Sehtest/Beratung)', detect: { body: /termin.*online|sehtest.*termin|online.*buchen|terminland|calendly/i } },
            { id: 'marken', label: 'Brillen-Marken / Premium-Marken', detect: { body: /\b(ray[- ]?ban|persol|silhouette|lindberg|prada|gucci|tom\s?ford|oakley|essilor|zeiss|rodenstock)\b|markenuebersicht|markenwelt/i } },
            { id: 'sehtest-online', label: 'Online-Sehtest oder Vor-Check', detect: { body: /sehtest.?online|onlinesehtest|sehtest.?vor|sehtest.?check|sehprofil/i } }
        ],
        pitchMissing: 'Kunden googeln "Optiker + Stadt" + erwarten Sehtest-Slot online — wer das nicht bietet, verliert sie an Apollo/Fielmann.',
        pitchAllOk: 'Ihr Geschaeft ist online auffindbar und entscheidbar.'
    },
    'bakery': {
        name: 'Baeckerei',
        mustHave: [
            { id: 'sortiment', label: 'Sortiment (Brot/Kuchen/Snacks)', detect: { subPage: /sortiment|produkte|brote|backwaren/i, body: /\b(brot(sorten)?|kuchen|toerten|torten|backwaren|brötchen|broetchen|gebäck|gebaeck|snack)\b/i } },
            { id: 'frische', label: 'Frische- / Regionalitäts-Hinweis', detect: { body: /\b(taeglich frisch|täglich frisch|frisch gebacken|regional|biobaeckerei|biobäckerei|handwerksbaeckerei|handwerksbäckerei|familienbaeckerei|familienbäckerei|traditionsbaeckerei|traditionsbäckerei)\b/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|mo[- ]?fr|mo[- ]?sa|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            { id: 'kontakt-adresse', label: 'Filialen / Adressen', detect: { subPage: /kontakt|anfahrt|filiale|standort/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'vorbestellung', label: 'Online-Vorbestellung Torten/Catering', detect: { body: /\b(torten.?bestell|vorbestell|catering|partyservice|hochzeitstorte|geburtstagstorte|brötchen.?service|broetchen.?service)\b/i } },
            { id: 'lieferservice', label: 'Lieferservice', detect: { body: /lieferservice|brötchen.?lieferung|broetchen.?lieferung|frühstücks.?lieferung|fruehstuecks.?lieferung/i } },
            { id: 'bio-glutenfrei', label: 'Bio- / Glutenfrei-Angebot', detect: { body: /\bbio\b|biozertifik|glutenfrei|laktosefrei|vegan|dinkelvollkorn/i } }
        ],
        pitchMissing: 'Stammkunden bestellen Sonntags-Brötchen + Geburtstagstorten online — wer kein Vorbestell-Formular hat, verschenkt Familien-Aufträge.',
        pitchAllOk: 'Ihre Baeckerei ist online erreichbar.'
    },
    'funeral_home': {
        name: 'Bestattungsinstitut',
        mustHave: [
            { id: 'leistungen', label: 'Bestattungs-Leistungen (Erd/Feuer/See/Baum)', detect: { subPage: /leistung|bestattung|abschied|trauer/i, body: /\b(erdbestattung|feuerbestattung|seebestattung|baumbestattung|urnenbeisetzung|trauerfeier|abschiednahme)\b/i } },
            { id: 'team', label: 'Team / Bestatter-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /bestatter(meister)?|trauerbegleit\w*|inhaber(in)?|familienbetrieb/i } },
            { id: 'kontakt-adresse', label: 'Adresse + 24h-Telefon', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } },
            { id: 'notfall', label: '24h-Erreichbarkeit / Trauerfall-Hotline', detect: { body: /24[- ]?stund|24h|trauerfall|jederzeit erreichbar|tag und nacht|notruf|sterbefall/i } }
        ],
        shouldHave: [
            { id: 'vorsorge', label: 'Bestattungs-Vorsorge / Vorsorgevertrag', detect: { body: /\bvorsorge\b|bestattungsvorsorge|vorsorgevertrag|treuhand|sicherheits.?vorsorge/i } },
            { id: 'kosten-rechner', label: 'Kosten-Uebersicht / Vorab-Schaetzung', detect: { body: /kosten.?ueberblick|kosten.?übersicht|preise|festpreis|kostenklarheit|kostenrechner/i } }
        ],
        pitchMissing: 'Hinterbliebene googeln im Akutfall — wer 24h-Erreichbarkeit + Kosten-Transparenz nicht zeigt, wird nicht angerufen.',
        pitchAllOk: 'Ihr Institut ist online jederzeit erreichbar.'
    },
    'travel_agency': {
        name: 'Reisebuero',
        mustHave: [
            { id: 'leistungen', label: 'Reise-Angebote (Pauschal/Individual/Gruppen)', detect: { subPage: /leistung|angebot|reise|pauschal|individual/i, body: /\b(pauschalreise|individualreise|gruppenreise|familienreise|kreuzfahrt|busreise|fernreise|städtereise|staedtereise|aktivreise)\b/i } },
            { id: 'team', label: 'Reiseberater-/Team-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /reisefachfrau|reisefachmann|reiseberater(in)?|reiseverkehrskauffrau|reiseverkehrskaufmann|inhaber(in)?/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|mo[- ]?fr|mo[- ]?sa|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'katalog', label: 'Saison-Angebote / Reise-Katalog', detect: { body: /\b(saisonangebot|fruehbucher|frühbucher|lastminute|reiseangebot|sonderangebot|hot[- ]?deal|topangebot)\b/i } },
            { id: 'notfall-hotline', label: 'Reise-Notfall-Hotline', detect: { body: /reise.?notfall|24h.?hotline|notfall.?nummer|reise.?notdienst/i } }
        ],
        pitchMissing: 'Reisende googeln Last-Minute + Frühbucher 2026 — wer keine aktuellen Saisonangebote zeigt, ist im Vergleich unsichtbar.',
        pitchAllOk: 'Ihr Reisebuero ist online entscheidbar.'
    },
    'pharmacy': {
        name: 'Apotheke',
        mustHave: [
            { id: 'notdienst', label: 'Notdienst-Hinweis (24h-Apotheke)', detect: { body: /notdienst|notfall|24[- ]?stund|nachtdienst|bereitschaft/i } },
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|geoeffnet|geöffnet|mo[- ]?fr|mo[- ]?sa|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Adresse', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } },
            { id: 'leistungen', label: 'Beratungs-/Service-Leistungen', detect: { subPage: /leistung|service|beratung/i, body: /\b(beratung|impfberatung|medikament|rezept|hautanalyse|blutdruck.?mess)\b/i } }
        ],
        shouldHave: [
            { id: 'rezept-online', label: 'E-Rezept- oder Online-Rezept-Service', detect: { body: /e[- ]?rezept|rezept.*online|rezept.*upload|rezept.*foto|gesund\.bund|kim[- ]?dienst/i } },
            { id: 'bestand-online', label: 'Medikamenten-Verfuegbarkeit / Online-Bestellung', detect: { body: /verfuegbarkeit|verfügbarkeit|vorbestell|reservier|online[- ]?bestell|abhol/i } },
            { id: 'team', label: 'Apotheker-/Team-Vorstellung', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns/i, body: /\b(apotheker|pta|inhaber(in)?|unser team)\b/i } }
        ],
        pitchMissing: 'Patienten googeln "Notdienst Apotheke" + e-Rezept — wer Notdienst-Live + Foto-Rezept nicht zeigt, verliert sie an die naechste.',
        pitchAllOk: 'Ihre Apotheke ist online auffindbar und entscheidbar.'
    },
    'veterinary_care': {
        name: 'Tierarztpraxis',
        mustHave: [
            { id: 'leistungen', label: 'Behandlungen / Tierart-Spezialisierung', detect: { subPage: /leistung|behandl|therap|spezialis/i, body: /\b(hund|katze|nager|kaninchen|exoten|kleintier|großtier|grosstier|pferd|chirurgie|impfung|operation)\b/i } },
            { id: 'team', label: 'Tieraerzte-/Team-Vorstellung', detect: { subPage: /team|tieraerzt|tierärzt|ueber[- ]?uns|über[- ]?uns/i, body: /tierärzt\w*|tieraerzt\w*|fachtierarzt\w*|praxisleitung|\binhaber(in)?\b/i } },
            { id: 'sprechzeiten', label: 'Sprechzeiten', detect: { body: /sprechzeit|oeffnungszeit|öffnungszeit|mo[- ]?fr|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)/i } },
            { id: 'notfall', label: 'Notdienst / 24h-Notfall', detect: { body: /notdienst|notfall|24[- ]?stund|bereitschaft|tier[- ]?notfall/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Terminbuchung', detect: { body: /termin.*online|terminland|petsdeli|doctolib|samedi/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        pitchMissing: 'Halter rufen die Praxis an, die Sprechzeiten + Notdienst online zeigt — wer das nicht hat, ist im Notfall unsichtbar.',
        pitchAllOk: 'Ihre Tierarztpraxis ist online erreichbar.'
    },
    'accounting': {
        name: 'Steuerberater',
        mustHave: [
            { id: 'leistungen', label: 'Leistungen (Bilanz/EUER/USt-VA/Lohn)', detect: { subPage: /leistung|service|beratung/i, body: /\b(bilanz|EUER|euer\b|umsatzsteuer|ust[- ]?va|lohnabrechnung|jahresabschluss|steuererklaerung|steuererklärung|finanzbuchhaltung)\b/i } },
            { id: 'team', label: 'Steuerberater-/Team-Vorstellung', detect: { subPage: /team|kanzlei|ueber[- ]?uns|über[- ]?uns/i, body: /\b(steuerberater(in)?|wirtschaftspruefer|wirtschaftsprüfer|fachberater|kanzlei|sozietät)\b/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Kanzleiadresse', detect: { subPage: /kontakt|anfahrt|standort/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } },
            { id: 'mandantenportal', label: 'Mandantenportal / DATEV-Hinweis', detect: { body: /mandantenportal|datev|unternehmen[- ]?online|beleg.?upload|digitalbuchhaltung/i } }
        ],
        shouldHave: [
            { id: 'fachgebiete', label: 'Branchen-/Fachgebiet-Spezialisierung', detect: { subPage: /fachgebiet|branche|spezialis/i, body: /\b(spezialisierung|fachgebiet|aerzte|ärzte|handwerk|gastronomie|gemeinnuetzig|gemeinnützig)\b/i } },
            { id: 'kosten-rechner', label: 'Honorar-/StBVV-Hinweis', detect: { body: /honorar|gebührenordnung|gebuehrenordnung|\bstbvv\b|kostenfair|vorab.?berechnung/i } }
        ],
        pitchMissing: 'Mandanten googeln "Steuerberater + Branche + Stadt" + erwarten Belegupload-Portal — fehlt eines, gehen sie zur Konkurrenz.',
        pitchAllOk: 'Ihre Kanzlei ist online entscheidbar.'
    },
    'architect': {
        name: 'Architekturbuero',
        mustHave: [
            { id: 'portfolio', label: 'Projekt-Portfolio mit Bildern', detect: { subPage: /portfolio|projekt|referenz|werke|galerie/i, body: /\b(projekte|projektliste|referenzprojekte|werkschau|portfolio)\b/i } },
            { id: 'leistungen', label: 'Leistungen (Planung/Bauleitung/HOAI)', detect: { subPage: /leistung|planung/i, body: /\b(planung|entwurfsplanung|bauleitung|baugenehmigung|\bhoai\b|leistungsphasen)\b/i } },
            { id: 'team', label: 'Architekten-/Team-Vorstellung', detect: { subPage: /team|architekt|ueber[- ]?uns|über[- ]?uns/i, body: /\b(architekt(in)?|innenarchitekt|büroleitung|buero|bauleiter(in)?)\b/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Bueroadresse', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'schwerpunkte', label: 'Schwerpunkte (Wohn-/Gewerbe-/Sanierung)', detect: { subPage: /schwerpunkt|spezialis/i, body: /\b(wohnungsbau|gewerbebau|sanierung|denkmalschutz|bestandsbau|neubau|umbau|energieberatung)\b/i } },
            { id: 'kosten-rechner', label: 'HOAI-Rechner / Honorarbeispiele', detect: { body: /honorar.?beispiel|\bhoai\b.*rechner|kostenschaetzung|kostenschätzung|kostenrahmen|honorarrechner/i } }
        ],
        pitchMissing: 'Bauherren googeln Portfolio + HOAI-Schaetzung vor dem Erstgespraech — wer nichts zeigt, ist nicht im Bewerber-Pool.',
        pitchAllOk: 'Ihr Buero ist online entscheidbar.'
    },
    'auto_repair': {
        name: 'Kfz-Werkstatt',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-Liste (TUEV, Inspektion, Reifen, ...)', detect: { subPage: /leistung|service/i, body: /tuev|tüv|inspektion|reifen|oelwechsel|ölwechsel/i } },
            // Sprint 72 — Weekday+Time
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten', detect: { body: /oeffnungszeit|öffnungszeit|mo[- ]?fr|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } },
            { id: 'kontakt-adresse', label: 'Adresse + Telefon', detect: { body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            { id: 'tuev', label: 'TUEV/HU-Service genannt', detect: { body: /tuev|tüv|hauptuntersuchung|\bhu\b|\bau\b/i } }
        ],
        shouldHave: [
            { id: 'termin-online', label: 'Online-Termin / Werkstatt-Anfrage', detect: { body: /termin.*online|werkstatt.*anfrage|kostenvoranschlag/i } },
            // Sprint 72 — body-Fallback (sass-auto.de sagt "markenungebundene" — markenunabhängig sichtbar)
            { id: 'marken', label: 'Marken-Spezialisierung sichtbar', detect: { body: /\bvw\b|\bbmw\b|mercedes|\baudi\b|\bopel\b|\bford\b|spezialist|markenwerkstatt|markenungebunden|markenunabh[äa]ngig|\bmarke[ns]?\b/i } }
        ],
        pitchMissing: 'Autofahrer googeln "TUEV [Stadt]" — wer das nicht prominent zeigt, taucht in der Suche nicht auf.',
        pitchAllOk: 'Ihre Werkstatt ist online auffindbar.'
    },
    'creative_agency': {
        name: 'Digital-/Kreativagentur',
        mustHave: [
            // Sprint 174 — Digital-/Kreativagentur (B2B-Dienstleister). KEINE Öffnungszeiten-/Walk-in-Erwartung.
            { id: 'leistungen', label: 'Leistungs-/Service-Seite', detect: { subPage: /leistung|service|angebot|webdesign|webentwicklung|kompetenz/i, body: /\b(webdesign|webentwicklung|webgestaltung|onlineshop|online[- ]?marketing|seo|suchmaschinen|branding|corporate[- ]?design|grafikdesign|app[- ]?entwicklung|softwareentwicklung|digitalisierung|markenauftritt)\b/i } },
            { id: 'referenzen', label: 'Portfolio / Referenzen / Cases', detect: { subPage: /portfolio|referenz|case|projekt|arbeiten|kunden|werke/i, body: /\b(referenz|portfolio|case[- ]?stud|kundenprojekt|unsere arbeiten|ausgewählte projekte|projektgalerie|kundenstimme)\b/i } },
            { id: 'team', label: 'Über-uns / Team / Gründer', detect: { subPage: /team|ueber[- ]?uns|über[- ]?uns|about|agentur|gruender|gründer|manufaktur/i, body: /\b(über uns|ueber uns|unser team|das team|wer wir sind|gegründet|gründer(in)?|inhaber(in)?|geschäftsführ|manufaktur)\b/i } },
            { id: 'kontakt', label: 'Kontakt / Projektanfrage', detect: { subPage: /kontakt|anfrage|contact|projekt[- ]?start/i, body: /\b(kontakt|projektanfrage|jetzt anfragen|unverbindlich|schreiben sie uns|projekt besprechen)\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/i } }
        ],
        shouldHave: [
            { id: 'prozess', label: 'Arbeitsweise / Prozess transparent', detect: { subPage: /prozess|ablauf|vorgehen|so-arbeiten/i, body: /\b(unser prozess|so arbeiten wir|vorgehen|arbeitsweise|ablauf|methodik|in \d+ schritten)\b/i } },
            { id: 'journal', label: 'Journal / Blog / Insights', detect: { subPage: /blog|journal|magazin|insights|wissen|ratgeber/i, body: /\b(blog|journal|magazin|insights|fachbeitrag|ratgeber)\b/i } },
            { id: 'pakete', label: 'Pakete / Investitions-Transparenz', detect: { subPage: /preis|pakete|investition|leistungspaket/i, body: /\b(paket|festpreis|ab \d+ ?€|investition|preismodell|preisarchitektur)\b/i } }
        ],
        pitchMissing: 'Auftraggeber entscheiden anhand sichtbarer Arbeiten und klarer Leistungen — Portfolio, Referenzen und ein konkreter Kontaktweg sind die Substanz, nicht das Beiwerk.',
        pitchAllOk: 'Ihr Auftritt zeigt, was eine Agentur ausmacht: Arbeiten, Leistungen, Haltung.'
    },
    '_default': {
        name: 'Lokales Unternehmen',
        mustHave: [
            { id: 'leistungen', label: 'Leistungs-/Service-Uebersicht', detect: { subPage: /leistung|service|angebot|produkt/i } },
            { id: 'kontakt-adresse', label: 'Kontakt mit Adresse', detect: { subPage: /kontakt|anfahrt/i, body: /\b\d{5}\s+[A-Z][a-zäöüß]+/i } },
            // Sprint 72 — Weekday+Time
            { id: 'oeffnungszeiten', label: 'Oeffnungszeiten oder Erreichbarkeit', detect: { body: /oeffnungszeit|öffnungszeit|sprechzeit|mo[- ]?fr|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b[\s\S]{0,80}(\d|uhr|geöffnet|geschlossen)|\b(mo|di|mi|do|fr|sa|so)\.?\s*[-–]\s*(mo|di|mi|do|fr|sa|so)\b/i } }
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
