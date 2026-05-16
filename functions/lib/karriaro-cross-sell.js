/**
 * Sprint 69 — Karriaro-Cross-Sell-Mapping pro Branche.
 *
 * Liefert pro API-primaryType (Google-Places-Branche) bis zu 3 typische
 * Karriaro-Werkzeuge, die als "Karriaro-Bonus" im Audit angezeigt werden,
 * plus eine branchen-spezifische Trend-Aussage.
 *
 * Die Werkzeuge entsprechen den 8 Live-Demos auf den Sub-Pages
 * (src/js/karriaro-tools.js + src/portfolio/*.html). Audit-Ergebnis
 * enthält Direkt-Links zu den Live-Demos.
 *
 * Sprint 70 — `aliasFor`-Feld pro Tool: bildet die Tool-ID auf die
 * korrespondierende BRANCH_STANDARDS-Item-ID ab, damit die Filter-Logik
 * (getCrossSell) Tools ausblendet, die bereits auf der User-Site detected
 * wurden. Wenn `aliasFor` fehlt, wird gegen `id` selbst gematcht.
 */

const CROSS_SELL = {
    'real_estate_agency': {
        tools: [
            { id: 'wertermittlung', aliasFor: 'bewertung', name: 'Online-Wertermittlungs-Rechner', demoUrl: '/portfolio/immobilien-makler.html#wertermittlung' },
            { id: 'marktbarometer', aliasFor: 'marktbericht', name: 'Marktbarometer mit Mikromarkt-Daten', demoUrl: '/portfolio/immobilien-makler.html#marktbericht' },
            { id: 'verkaeufer-dashboard', name: 'Verkäufer-Dashboard (Live-Status)', demoUrl: '/portfolio/immobilien-makler.html' }
        ],
        trend: 'Trend 2026: Eigentümer entscheiden vor dem Anruf — wer Wertermittlung + Mikromarkt-Daten zeigt, gewinnt 3× mehr Erstgespräche.'
    },
    'doctor': {
        tools: [
            { id: 'symptom-checker', name: 'KI-Symptom-Checker mit Slot-Vorschlag', demoUrl: '/portfolio/praxis-weber.html#symptom-checker' },
            { id: 'rezept-online', name: 'Online-Folge-Rezept-Anfrage', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'telemedizin', name: 'Videosprechstunde-Integration', demoUrl: '/portfolio/praxis-weber.html' }
        ],
        trend: 'Hausarzt-Trend 2026: Praxen mit Symptom-Checker filtern 40 % der Akut-Anrufe vor — entlastet MFA, beruhigt Patienten.'
    },
    'physician': { // Alias
        tools: [
            { id: 'symptom-checker', name: 'KI-Symptom-Checker mit Slot-Vorschlag', demoUrl: '/portfolio/praxis-weber.html#symptom-checker' },
            { id: 'rezept-online', name: 'Online-Folge-Rezept-Anfrage', demoUrl: '/portfolio/praxis-weber.html' }
        ],
        trend: 'Arzt-Trend 2026: Online-Symptom-Triage filtert 40 % Akut-Anrufe vor — entlastet MFA.'
    },
    'dentist': {
        tools: [
            { id: 'termin-online', name: 'Online-Terminbuchung 24/7', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'galerie-cases', name: 'Vorher-Nachher-Galerie (Veneers/Bleaching)', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'rezept-online', name: 'Online-Rezept-Anfrage', demoUrl: '/portfolio/praxis-weber.html' }
        ],
        trend: 'Zahnarzt-Trend 2026: Praxen mit Online-Slot buchen 40 % mehr Termine als Telefon-only.'
    },
    'restaurant': {
        tools: [
            { id: 'sommelier', aliasFor: 'wein-pairing', name: 'AI-Sommelier (Wein-Pairing live)', demoUrl: '/portfolio/restaurant-template.html#ai-sommelier' },
            { id: 'saisonkarte', name: 'Saisonkarte mit Auto-Update', demoUrl: '/portfolio/restaurant-template.html' },
            { id: 'tisch-online', aliasFor: 'reservierung', name: 'Online-Tisch-Reservierung', demoUrl: '/portfolio/restaurant-template.html' }
        ],
        trend: 'Restaurant-Trend 2026: AI-Sommelier + Saisonkarte mit Filter — was Gäste in Google-Snippets sehen, entscheidet vor dem Tisch.'
    },
    'cafe': {
        tools: [
            { id: 'tisch-online', aliasFor: 'reservierung', name: 'Online-Tisch-Reservierung', demoUrl: '/portfolio/restaurant-template.html' },
            { id: 'saisonkarte', name: 'Tagesangebot live', demoUrl: '/portfolio/restaurant-template.html' }
        ],
        trend: 'Café-Trend 2026: Tagesangebot live online — Stamm-Gäste schauen vor dem Vorbeikommen.'
    },
    'hair_salon': {
        tools: [
            { id: 'style-empfehlung', aliasFor: 'stilberatung', name: 'Style-Empfehlung (Gesichtsform + Anlass)', demoUrl: '/portfolio/friseur-salon.html#style-empfehlung' },
            { id: 'stylist-wahl', name: 'Wunsch-Stylist-Direkt-Buchung', demoUrl: '/portfolio/friseur-salon.html' },
            { id: 'galerie', name: 'Style-Galerie nach Branche/Anlass', demoUrl: '/portfolio/friseur-salon.html' }
        ],
        trend: 'Friseur-Trend 2026: Kundinnen wählen erst Stylist, dann Slot — wer das nicht anbietet, verliert 20 % Walk-ins.'
    },
    'beauty_salon': {
        tools: [
            { id: 'termin-online', name: 'Online-Termin mit Behandlungs-Filter', demoUrl: '/portfolio/friseur-salon.html' },
            { id: 'galerie', name: 'Behandlungs-Vorher-Nachher-Galerie', demoUrl: '/portfolio/friseur-salon.html' }
        ],
        trend: 'Beauty-Trend 2026: Vorher-Nachher-Galerie + Online-Termin sind die zwei Kauf-Entscheidungen.'
    },
    'plumber': {
        tools: [
            { id: 'notdienst-puls', aliasFor: 'notdienst', name: 'Notdienst-Puls mit Anrückzeit', demoUrl: '/portfolio/meisterbetrieb-mueller.html#notdienst' },
            { id: 'foto-festpreis', aliasFor: 'festpreis', name: 'Foto-Festpreis-Anfrage-Tool', demoUrl: '/portfolio/meisterbetrieb-mueller.html' },
            { id: 'bafa-rechner', aliasFor: 'foerder', name: 'BAFA-Förder-Rechner (Wärmepumpe)', demoUrl: '/portfolio/dachdecker-meisterbetrieb.html' }
        ],
        trend: 'Handwerk-Trend 2026: Festpreis-Foto reduziert Telefonanrufe um 30 % — direkt zum Auftrag ohne Vor-Ort-Termin.'
    },
    'electrician': {
        tools: [
            { id: 'notdienst', name: 'Notdienst-Puls (PLZ-basiert)', demoUrl: '/portfolio/meisterbetrieb-mueller.html' },
            { id: 'foto-festpreis', name: 'Foto-Festpreis-Anfrage', demoUrl: '/portfolio/meisterbetrieb-mueller.html' },
            { id: 'wallbox-pv', aliasFor: 'pv-foerder', name: 'Wallbox-/PV-Konfigurator', demoUrl: '/portfolio/meisterbetrieb-mueller.html' }
        ],
        trend: 'Elektro-Trend 2026: Wallbox + PV-Förderung sichtbar machen — Privatkunden googeln das vor jedem Anruf.'
    },
    'auto_repair': {
        tools: [
            { id: 'tuev-termin', aliasFor: 'tuev', name: 'TÜV-/HU-Slot-Live-Buchung', demoUrl: '/portfolio/spedition-schwaben.html' },
            { id: 'kostenvoranschlag', name: 'Online-Kostenvoranschlag-Form', demoUrl: '/portfolio/spedition-schwaben.html' }
        ],
        trend: 'Kfz-Trend 2026: Autofahrer googeln „TÜV [Stadt]" — wer Slot online zeigt, kommt in die Top-3.'
    },
    'lawyer': {
        tools: [
            { id: 'honorar-rechner', aliasFor: 'honorar', name: 'Honorar-Rechner / RVG-Vorschau', demoUrl: '/portfolio/coaching-lehmann.html#klarheits-score' },
            { id: 'fachgebiet-filter', aliasFor: 'fachgebiete', name: 'Fachgebiet-Filter + Direkt-Anwalt-Wahl', demoUrl: '/portfolio/coaching-lehmann.html' }
        ],
        trend: 'Kanzlei-Trend 2026: Mandanten entscheiden anhand Online-Honorar-Transparenz + Fachgebiet vor dem Erstgespräch.'
    },
    'physiotherapist': {
        tools: [
            { id: 'symptom-checker', name: 'Beschwerden-Checker mit Therapie-Vorschlag', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'termin-online', name: 'Online-Termin nach Behandlungsart', demoUrl: '/portfolio/praxis-weber.html' }
        ],
        trend: 'Physio-Trend 2026: Behandlungs-Filter + Online-Slot — Patienten kommen mit Rezept und buchen direkt.'
    },
    'painter': {
        tools: [
            { id: 'vorher-nachher-galerie', aliasFor: 'referenzen', name: 'Vorher-Nachher-Galerie mit Schieberegler', demoUrl: '/portfolio/dachdecker-meisterbetrieb.html' },
            { id: 'foto-festpreis', name: 'Foto-Festpreis-Anfrage (Wand-Foto → Preis)', demoUrl: '/portfolio/meisterbetrieb-mueller.html' },
            { id: 'farbberatung-online', aliasFor: 'farb-beratung', name: 'Online-Farbberatung mit KI-Vorschau', demoUrl: '/portfolio/friseur-salon.html#style-empfehlung' }
        ],
        trend: 'Maler-Trend 2026: Vorher-Nachher-Bilder + Foto-Festpreis ersetzen Vor-Ort-Termine — wer das anbietet, gewinnt 30 % mehr Erstauftraege.'
    },
    'landscaper': {
        tools: [
            { id: 'projekt-galerie', aliasFor: 'foto-galerie', name: 'Interaktive Garten-Projekt-Galerie (Saison-Filter)', demoUrl: '/portfolio/immobilien-makler.html' },
            { id: 'beratung-termin', aliasFor: 'beratung-vorort', name: 'Vor-Ort-Beratungs-Termin online buchen', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'foto-festpreis', name: 'Foto-Festpreis-Anfrage (Gartenfoto → Pflegepreis)', demoUrl: '/portfolio/meisterbetrieb-mueller.html' }
        ],
        trend: 'Garten-Trend 2026: Hausbesitzer wollen Garten-Foto hochladen + Pflegepreis erhalten — wer das nicht bietet, verliert an Service-Apps.'
    },
    'general_contractor': {
        tools: [
            { id: 'bauprojekt-cockpit', name: 'Bauprojekt-Cockpit (Phasen + Termine + Dokumente)', demoUrl: '/portfolio/coaching-lehmann.html' },
            { id: 'projekt-galerie-3d', aliasFor: 'referenzen', name: 'Bauprojekt-Galerie mit 360°-Vorschau', demoUrl: '/portfolio/immobilien-makler.html' },
            { id: 'kosten-rechner', name: 'Bau-Kostenschaetzer nach BKI / Quadratmeter', demoUrl: '/portfolio/coaching-lehmann.html#klarheits-score' }
        ],
        trend: 'Bau-Trend 2026: Bauherren erwarten Projekt-Cockpit + Kosten-Schaetzung vor jedem Erstgespraech — wer das nicht bietet, verliert das Auftrags-Sondieren.'
    },
    'carpenter': {
        tools: [
            { id: 'moebel-konfigurator', aliasFor: 'leistungen', name: 'Möbel-Konfigurator (Holzart + Maße + Live-Preis)', demoUrl: '/portfolio/immobilien-makler.html' },
            { id: 'foto-aufmass', aliasFor: 'beratung-vorort', name: 'Foto-Aufmaß-Tool (Foto → Maße + Angebot)', demoUrl: '/portfolio/meisterbetrieb-mueller.html' },
            { id: 'galerie-werkschau', aliasFor: 'referenzen', name: 'Möbel-Werkschau-Galerie (Stile + Materialien)', demoUrl: '/portfolio/friseur-salon.html' }
        ],
        trend: 'Schreinerei-Trend 2026: Möbel-Konfigurator + Foto-Aufmaß ersetzen 2 Vor-Ort-Termine — wer das anbietet, gewinnt 25 % mehr Premium-Auftraege.'
    },
    'optical_store': {
        tools: [
            { id: 'sehtest-online', aliasFor: 'sehtest-online', name: 'Online-Sehtest mit Slot-Vorschlag', demoUrl: '/portfolio/praxis-weber.html#symptom-checker' },
            { id: 'termin-online', aliasFor: 'termin-online', name: 'Sehtest-Termin live buchen', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'brillen-konfigurator', name: 'Brillen-Konfigurator (Gesichtsform + Stil)', demoUrl: '/portfolio/friseur-salon.html#style-empfehlung' }
        ],
        trend: 'Optiker-Trend 2026: Kunden gehen mit Wunsch-Termin + Brillen-Idee ins Geschaeft — wer das online vorbereitet, gewinnt 30 % mehr Erstkontakte.'
    },
    'bakery': {
        tools: [
            { id: 'torten-konfigurator', aliasFor: 'vorbestellung', name: 'Torten-Konfigurator + Foto-Upload', demoUrl: '/portfolio/restaurant-template.html' },
            { id: 'broetchen-abo', aliasFor: 'lieferservice', name: 'Sonntags-Broetchen-Abo Online', demoUrl: '/portfolio/restaurant-template.html' },
            { id: 'tagesfrisch-board', aliasFor: 'frische', name: 'Tagesfrisch-Board (heute gebacken)', demoUrl: '/portfolio/restaurant-template.html' }
        ],
        trend: 'Baeckerei-Trend 2026: Sonntag-Broetchen + Geburtstagstorten werden Mittwoch online vorbestellt — wer kein Vorbestell-Formular hat, verschenkt Familien-Auftraege.'
    },
    'funeral_home': {
        tools: [
            { id: 'trauer-cockpit', name: 'Trauer-Cockpit mit Schritt-fuer-Schritt-Begleitung', demoUrl: '/portfolio/coaching-lehmann.html' },
            { id: 'vorsorge-portal', aliasFor: 'vorsorge', name: 'Bestattungs-Vorsorge-Konfigurator', demoUrl: '/portfolio/coaching-lehmann.html#klarheits-score' },
            { id: 'kosten-rechner', aliasFor: 'kosten-rechner', name: 'Kosten-Klarheit-Rechner', demoUrl: '/portfolio/coaching-lehmann.html#klarheits-score' }
        ],
        trend: 'Bestattungs-Trend 2026: Hinterbliebene googeln im Akutfall + brauchen 24h-Erreichbarkeit + Kosten-Transparenz — wer das nicht zeigt, wird nicht angerufen.'
    },
    'travel_agency': {
        tools: [
            { id: 'reise-konfigurator', aliasFor: 'leistungen', name: 'Reise-Konfigurator (Budget + Ziel + Saison)', demoUrl: '/portfolio/spedition-schwaben.html' },
            { id: 'saison-deals', aliasFor: 'katalog', name: 'Live-Saison-Deals (auto-aktualisierend)', demoUrl: '/portfolio/spedition-schwaben.html' },
            { id: 'reise-notfall', aliasFor: 'notfall-hotline', name: 'Reise-Notfall-Hotline mit GPS-Tracking', demoUrl: '/portfolio/spedition-schwaben.html' }
        ],
        trend: 'Reisebuero-Trend 2026: Last-Minute + Fruehbucher 2026 werden im Smartphone gegen Booking.com verglichen — wer Saisonangebote nicht live zeigt, ist im Pool nicht sichtbar.'
    },
    'pharmacy': {
        tools: [
            { id: 'notdienst-puls', aliasFor: 'notdienst', name: 'Notdienst-Apotheken-Puls (PLZ-Live)', demoUrl: '/portfolio/meisterbetrieb-mueller.html#notdienst' },
            { id: 'rezept-upload', aliasFor: 'rezept-online', name: 'E-Rezept-Foto-Upload', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'bestand-online', aliasFor: 'bestand-online', name: 'Medikamenten-Verfuegbarkeit live', demoUrl: '/portfolio/praxis-weber.html' }
        ],
        trend: 'Apotheke-Trend 2026: Patienten googeln Notdienst + e-Rezept-Foto-Upload — wer das nicht zeigt, verliert die naechste Generation.'
    },
    'veterinary_care': {
        tools: [
            { id: 'symptom-checker-tier', name: 'Tier-Symptom-Checker mit Notfall-Triage', demoUrl: '/portfolio/praxis-weber.html#symptom-checker' },
            { id: 'termin-online', aliasFor: 'termin-online', name: 'Online-Terminbuchung 24/7', demoUrl: '/portfolio/praxis-weber.html' },
            { id: 'notfall-puls', aliasFor: 'notfall', name: 'Notfall-Bereitschafts-Puls (Wer hat heute Dienst)', demoUrl: '/portfolio/meisterbetrieb-mueller.html#notdienst' }
        ],
        trend: 'Tierarzt-Trend 2026: Halter checken Notdienst-Bereitschaft online — wer nicht sichtbar ist, wird im Notfall nicht angerufen.'
    },
    'accounting': {
        tools: [
            { id: 'mandantenportal-online', aliasFor: 'mandantenportal', name: 'Mandantenportal (DATEV-aehnlich)', demoUrl: '/portfolio/coaching-lehmann.html' },
            { id: 'belege-foto-upload', name: 'Foto-Beleg-Upload mit OCR-Vorverbuchung', demoUrl: '/portfolio/coaching-lehmann.html' },
            { id: 'kosten-rechner-stbvv', aliasFor: 'kosten-rechner', name: 'Honorar-Rechner nach StBVV', demoUrl: '/portfolio/coaching-lehmann.html#klarheits-score' }
        ],
        trend: 'Steuerberater-Trend 2026: Mandanten erwarten Foto-Beleg-Upload statt Pendelordner — wer fehlt, verliert die Naechste-Generation-Unternehmer.'
    },
    'architect': {
        tools: [
            { id: 'hoai-rechner', aliasFor: 'kosten-rechner', name: 'HOAI-Honorar-Schaetzer (Leistungsphasen 1-9)', demoUrl: '/portfolio/coaching-lehmann.html#klarheits-score' },
            { id: 'projekt-galerie-3d', aliasFor: 'portfolio', name: 'Interaktive Projekt-Galerie mit 360-Grad-Vorschau', demoUrl: '/portfolio/immobilien-makler.html' },
            { id: 'bauherren-cockpit', name: 'Bauherren-Cockpit (Status + Termine + Dokumente)', demoUrl: '/portfolio/coaching-lehmann.html' }
        ],
        trend: 'Architektur-Trend 2026: Bauherren googeln Portfolio + HOAI-Beispiele vor dem Erstgespraech — wer beides nicht zeigt, ist nicht im Pool.'
    },
    'hotel': {
        tools: [
            { id: 'direkt-buchen', name: 'Direkt-Buchen-Engine (umgehe Booking.com)', demoUrl: '/portfolio/restaurant-template.html' },
            { id: 'galerie', name: 'Zimmer-/Suiten-Galerie mit 360°', demoUrl: '/portfolio/restaurant-template.html' }
        ],
        trend: 'Hotel-Trend 2026: Direkt-Buchen spart 15 % Provision — wer das prominent zeigt, gewinnt Stammgäste zurück.'
    }
};

/**
 * @param {string|null} primaryType  z.B. 'real_estate_agency', 'doctor', etc.
 * @param {object} branch            Output aus checkBranchStandards (optional)
 * @returns {object|null}            { tools: [{id,name,demoUrl}], trend: string } oder null
 */
function getCrossSell(primaryType, branch) {
    const entry = CROSS_SELL[primaryType];
    if (!entry) return null;

    // Filter: Tools, die NICHT bereits via BRANCH_STANDARDS detected sind.
    // Sprint 70 — Match per aliasFor wenn vorhanden (Tool-IDs ≠ BRANCH_STANDARDS-IDs).
    const detectedIds = new Set();
    if (branch && Array.isArray(branch.mustHave)) {
        branch.mustHave.forEach(i => { if (i.found && i.id) detectedIds.add(i.id); });
    }
    if (branch && Array.isArray(branch.shouldHave)) {
        branch.shouldHave.forEach(i => { if (i.found && i.id) detectedIds.add(i.id); });
    }
    const missingTools = entry.tools.filter(t => !detectedIds.has(t.aliasFor || t.id));

    // Fallback: wenn alles detected ist, trotzdem die 3 Tools zeigen (positiv: „Sie haben alle, hier nochmal")
    const toolsToShow = missingTools.length > 0 ? missingTools : entry.tools;

    return {
        tools: toolsToShow,
        trend: entry.trend,
        allDetected: missingTools.length === 0
    };
}

module.exports = { getCrossSell, CROSS_SELL };
