/**
 * Arbeitgeber-Matching — verbindet einen Google-Places-Betrieb mit den
 * Treffern der Arbeitsagentur-Jobsuche.
 *
 * ─── Warum das konservativ sein muss ────────────────────────────────────────
 * Die Jobsuche liefert Arbeitgeber-Namen in anderer Schreibweise als Google
 * Places ("Zahnarztpraxis Dr. Müller" ↔ "Dr. Müller GmbH"). Ein zu großzügiger
 * Abgleich erzeugt Falsch-Treffer bei Gattungsnamen: „Zahnarztpraxis Köln"
 * würde sonst auf jede Zahnarztstelle in Köln matchen und dem Lead ein
 * Kaufsignal andichten, das es nicht gibt.
 *
 * Deshalb: Es zählt ausschließlich ein Overlap DISTINKTIVER Wörter. Rechtsformen
 * und Branchen-Gattungsbegriffe werden vorher entfernt. Bleibt danach auf einer
 * der beiden Seiten nichts Distinktives übrig, ist das Ergebnis `null` — lieber
 * kein Signal als ein erfundenes.
 *
 * @module signals/employer-match
 */

/** Rechtsformen und Zusätze, die nichts über die Identität aussagen. */
const LEGAL_FORMS = new Set([
    'gmbh', 'mbh', 'ug', 'ag', 'kg', 'ohg', 'gbr', 'kgaa', 'se', 'ev', 'eg',
    'partg', 'partgmbb', 'ek', 'co', 'cokg', 'gmbhcokg', 'inh', 'inhaber',
    'und', 'the', 'der', 'die', 'das', 'für', 'fuer', 'am', 'an', 'im', 'in',
    'von', 'zum', 'zur', 'bei'
]);

/**
 * Branchen-Gattungsbegriffe. Sie kommen in tausenden Betriebsnamen vor und
 * dürfen einen Treffer nie allein tragen.
 */
const GENERIC = new Set([
    'praxis', 'zahnarztpraxis', 'zahnarzt', 'zahnaerzte', 'zahnarztzentrum',
    'arztpraxis', 'arzt', 'aerzte', 'doktor', 'dr', 'med', 'dent', 'dds',
    'friseur', 'friseursalon', 'salon', 'hairstyling', 'hair', 'coiffeur',
    'kosmetik', 'kosmetikstudio', 'studio', 'beauty', 'nagelstudio',
    'restaurant', 'gaststaette', 'gasthaus', 'pizzeria', 'cafe', 'bistro',
    'baeckerei', 'backerei', 'konditorei', 'metzgerei', 'fleischerei',
    'hotel', 'pension', 'gasthof', 'herberge',
    'kanzlei', 'rechtsanwalt', 'rechtsanwaelte', 'anwalt', 'anwaelte', 'notar',
    'steuerberater', 'steuerkanzlei',
    'immobilien', 'immobilienmakler', 'makler', 'hausverwaltung',
    'dachdecker', 'dachdeckerei', 'bedachungen', 'zimmerei', 'bau', 'baugeschaeft',
    'malerbetrieb', 'maler', 'lackierer', 'elektro', 'elektrotechnik', 'elektriker',
    'sanitaer', 'heizung', 'klima', 'installateur', 'shk', 'haustechnik',
    'autohaus', 'kfz', 'werkstatt', 'autoservice', 'automobile', 'garage',
    'apotheke', 'physiotherapie', 'physiopraxis', 'therapie', 'tierarzt',
    'tierarztpraxis', 'tierklinik', 'klinik', 'zentrum', 'center', 'centrum',
    'fitness', 'fitnessstudio', 'sportstudio', 'gym',
    'spedition', 'logistik', 'transporte', 'umzuege', 'umzug',
    'floristik', 'blumen', 'gaertnerei', 'garten', 'landschaftsbau',
    'reinigung', 'gebaeudereinigung', 'service', 'dienstleistungen',
    'gmbhco', 'betrieb', 'firma', 'unternehmen', 'team', 'group', 'gruppe'
]);

/**
 * Normalisiert einen Firmennamen zu vergleichbaren Tokens.
 *
 * Umlaute werden zur ASCII-Form aufgelöst, damit „Müller" und „Mueller"
 * zusammenfinden — beide Schreibweisen kommen in den Quellen real vor
 * (Domains schreiben fast immer ae/oe/ue).
 *
 * @param {string} name
 * @returns {string[]} normalisierte Tokens (ohne Rechtsformen, Länge >= 3)
 */
export function normalizeName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(t => t.length >= 3 && !LEGAL_FORMS.has(t));
}

/**
 * Ortsnamen sind NICHT distinktiv: "Zahnarztpraxis Köln" würde sonst auf jeden
 * anderen Kölner Betrieb matchen. Primär wird der real bekannte Ort abgezogen
 * (`cityHint` aus der Places-Adresse); die Liste ist nur ein Sicherheitsnetz
 * für Aufrufer ohne Ortsangabe.
 */
const BIG_CITIES = new Set([
    'berlin', 'hamburg', 'muenchen', 'koeln', 'frankfurt', 'stuttgart', 'duesseldorf',
    'dortmund', 'essen', 'leipzig', 'bremen', 'dresden', 'hannover', 'nuernberg',
    'duisburg', 'bochum', 'wuppertal', 'bielefeld', 'bonn', 'muenster', 'karlsruhe',
    'mannheim', 'augsburg', 'wiesbaden', 'moenchengladbach', 'gelsenkirchen', 'aachen',
    'braunschweig', 'chemnitz', 'kiel', 'halle', 'magdeburg', 'freiburg', 'krefeld',
    'mainz', 'luebeck', 'erfurt', 'rostock', 'kassel', 'potsdam', 'saarbruecken'
]);

/**
 * Distinktive Tokens = alles, was weder Rechtsform, Branchen-Gattung noch
 * Ortsname ist. Das sind typischerweise Eigennamen ("müller", "kablan",
 * "sonnenschein").
 *
 * @param {string} name
 * @param {string} [cityHint] - bekannter Ort des Betriebs (aus der Adresse)
 * @returns {string[]}
 */
export function distinctiveTokens(name, cityHint = '') {
    const cityTokens = new Set(normalizeName(cityHint));
    return normalizeName(name).filter(t =>
        !GENERIC.has(t) && !BIG_CITIES.has(t) && !cityTokens.has(t));
}

/**
 * Sucht den Arbeitsagentur-Arbeitgeber, der zum Places-Betrieb gehört.
 *
 * @param {string} placeName - Name aus Google Places
 * @param {string[]} employers - Arbeitgeber-Namen aus der Jobsuche
 * @param {string} [cityHint] - bekannter Ort (wird als nicht-distinktiv behandelt)
 * @returns {string|null} der gematchte Arbeitgeber-String oder null
 */
export function matchEmployer(placeName, employers, cityHint = '') {
    const mine = distinctiveTokens(placeName, cityHint);
    if (!mine.length || !Array.isArray(employers) || !employers.length) return null;

    const mineSet = new Set(mine);
    let best = null;
    let bestOverlap = 0;

    for (const emp of employers) {
        if (!emp) continue;
        const theirs = distinctiveTokens(emp, cityHint);
        if (!theirs.length) continue;
        const overlap = theirs.filter(t => mineSet.has(t)).length;
        if (overlap > bestOverlap) { bestOverlap = overlap; best = emp; }
    }

    // Mindestens EIN distinktives Wort muss übereinstimmen. Gattungsbegriffe
    // allein reichen bewusst nicht.
    return bestOverlap >= 1 ? best : null;
}

/**
 * Leitet aus einer Jobsuche-Antwort die belastbare Zahl offener Stellen ab.
 *
 * Ketten-Schutz: Bei sehr vielen Treffern (`total > 25`) hat die Suche
 * offensichtlich breit gestreut — dann zählen nur die Stellen, deren
 * Arbeitgeber exakt dem gematchten Namen entspricht. Sonst würde ein
 * Allerweltsname wie „Müller" hunderte fremde Stellen einsammeln.
 *
 * @param {Object|null} payload - Antwort der jobSignals-Function
 * @param {string} placeName
 * @param {string} [cityHint]
 * @returns {{openings:number, employer:string|null}}
 */
export function deriveJobOpenings(payload, placeName, cityHint = '') {
    if (!payload?.ok) return { openings: 0, employer: null };
    const employer = matchEmployer(placeName, payload.employers, cityHint);
    if (!employer) return { openings: 0, employer: null };

    const total = typeof payload.total === 'number' ? payload.total : 0;
    if (total > 25) {
        const exact = (payload.jobs || []).filter(j => j.arbeitgeber === employer).length;
        return { openings: exact, employer };
    }
    return { openings: total, employer };
}
