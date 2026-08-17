/**
 * Warum kommt diese Seite in Frage? — Begründung für die Schnellsuche-Karte.
 *
 * Founder-Auftrag (2026-08-17, an der ELBCAMPUS-Karte): „Bitte immer auch
 * weitere Details hinzufügen warum eine Seite in Frage kommt." Die Karte zeigte
 * bis dahin nur „67 % Chance · Website 51/200 schlecht · Geschäft 92/100 stark" —
 * drei Zahlen ohne einen einzigen Beleg. Wer daraus ein Anschreiben bauen will,
 * muss die Seite selbst öffnen und raten, was der Angriffspunkt ist.
 *
 * Drei Regeln, die dieses Modul trägt:
 *   1. Jede Zeile nennt den GEMESSENEN Wert, nicht die Bewertung („Perf 51",
 *      nicht „langsam") — der Founder soll das im Anschreiben zitieren können.
 *   2. Nicht gemessen ist NIE ein Mangel. Fehlt ein Wert (PSI-Kategorie ohne
 *      Score, Alt-Scan ohne Feld), erscheint er gar nicht oder als „ungeprüft".
 *   3. Was gegen den Fall spricht, steht MIT drin (Gegenprobe). Ein Lead ohne
 *      strukturellen Mangel, dessen echte Nutzer die Seite schnell erleben, ist
 *      kein guter Lead — das muss die Karte sagen, nicht verschweigen.
 *
 * Bewusst ohne DOM/Store: rein, testbar, auch von gespeicherten Scans nutzbar.
 *
 * @module scoring/quick-reasons
 */

/**
 * @typedef {{kind:'geschaeft'|'mangel'|'gegenprobe', text:string}} Beleg
 */

/**
 * @param {object} r Ergebniszeile der Schnellsuche (batch-search.js)
 * @returns {{belege:Beleg[], fazit:{stufe:'stark'|'mittel'|'schwach', text:string}, ungeprueft:string[]}}
 */
export function quickReasons(r = {}) {
    const belege = [];

    // ── 1. Trägt der Betrieb das Honorar? (die „brummt"-Hälfte) ──
    const reviews = typeof r.reviews === 'number' ? r.reviews : null;
    const rating = typeof r.rating === 'number' && r.rating > 0 ? r.rating : null;
    if (reviews !== null && reviews > 0) {
        belege.push({
            kind: 'geschaeft',
            text: rating
                ? `${reviews} Bewertungen · ${de(rating)}★`
                : `${reviews} Bewertungen`
        });
    }

    // ── 2. Strukturelle Mängel: der harte, im Anschreiben zitierbare Anlass ──
    // Reihenfolge = Verkaufsstärke. Baukasten/SSL/Mobil sind Fakten, die der
    // Inhaber selbst nachvollziehen kann; Tempo ist Interpretation.
    let hart = 0;
    if (r.isBaukasten) {
        belege.push({ kind: 'mangel', text: r.cms ? `Baukasten: ${r.cms}` : 'Baukasten-Seite' });
        hart++;
    }
    if (r.isHttps === false) {
        belege.push({ kind: 'mangel', text: 'kein SSL — Browser warnt Besucher' });
        hart++;
    }
    if (r.viewportMissing === true) {
        belege.push({ kind: 'mangel', text: 'nicht für Handy gebaut' });
        hart++;
    }

    // ── 3. Tempo: Labor UND Feld. Das Feld entscheidet, ob es ein Argument ist. ──
    const perfKnown = r.perfKnown !== false && typeof r.perf === 'number';
    const feld = r.crux?.category || null;          // 'FAST' | 'AVERAGE' | 'SLOW' | null
    if (perfKnown && r.perf < 70) {
        belege.push({ kind: 'mangel', text: `Labor-Tempo ${r.perf}/100 (gedrosseltes 4G)` });
    }
    if (feld === 'SLOW') {
        belege.push({ kind: 'mangel', text: sekunden(r.crux, 'echte Nutzer warten') });
    } else if (feld === 'FAST') {
        // Der zbc.dental-Fall: Labor rot, Feld grün. Ein Tempo-Anschreiben wäre
        // vom Inhaber in einer Minute widerlegbar.
        belege.push({ kind: 'gegenprobe', text: sekunden(r.crux, 'echte Nutzer erleben sie schnell') });
    }
    if (!perfKnown) {
        belege.push({ kind: 'gegenprobe', text: 'Tempo nicht messbar — kein Tempo-Argument' });
    }

    // ── 4. Weiche Werte nur nennen, wenn sie wirklich auffällig sind ──
    if (r.seoKnown !== false && typeof r.seo === 'number' && r.seo < 70) {
        belege.push({ kind: 'mangel', text: `SEO-Grundlagen ${r.seo}/100` });
    }
    if (r.a11yKnown !== false && typeof r.a11y === 'number' && r.a11y < 70) {
        // Kein Rechtsclaim: Barrierefreiheit wird als MESSWERT genannt, nie als
        // Pflichtverstoß — die BFSG-Betroffenheit ist an dieser Stelle ungeprüft
        // (siehe functions/lib/bfsg-scope.js, Korrektur 2026-08-14).
        belege.push({ kind: 'mangel', text: `Barrierefreiheit ${r.a11y}/100` });
    }

    // ── 5. Fazit: taugt der Fall für ein Anschreiben? ──
    const nurTempo = hart === 0;
    let fazit;
    if (hart >= 2) {
        fazit = { stufe: 'stark', text: 'Konkreter Anlass: mehrere strukturelle Mängel, für den Inhaber selbst sichtbar.' };
    } else if (hart === 1) {
        fazit = { stufe: 'stark', text: 'Konkreter Anlass: ein struktureller Mangel, im Anschreiben belegbar.' };
    } else if (nurTempo && feld === 'FAST') {
        fazit = { stufe: 'schwach', text: 'Schwacher Fall: kein struktureller Mangel, und echte Nutzer erleben die Seite als schnell.' };
    } else if (nurTempo && perfKnown && r.perf < 70) {
        fazit = { stufe: 'mittel', text: 'Nur ein Tempo-Befund — Anlass wäre Gestaltung/Wirkung, nicht ein Defekt.' };
    } else {
        fazit = { stufe: 'schwach', text: 'Kein messbarer Mangel gefunden — hier gibt es wenig zu verkaufen.' };
    }

    // ── 6. Was diese Schnellprüfung NICHT gesehen hat ──
    // Ohne diese Zeile liest sich die Karte als vollständiges Urteil. Die
    // Schnellsuche kennt weder Kaufsignale noch KI-Sichtbarkeit noch Alter.
    const ungeprueft = ['Anzeigen', 'Stellenanzeigen', 'KI-Sichtbarkeit', 'Alter der Seite'];

    return { belege, fazit, ungeprueft };
}

/**
 * Feld-Beleg mit Sekunden, wenn PSI den p75-Wert mitgeliefert hat.
 * Ohne Zahl bleibt der Satz stehen — aber ohne erfundene Präzision.
 */
function sekunden(crux, satz) {
    const ms = typeof crux?.lcpMs === 'number' ? crux.lcpMs : null;
    const quelle = crux?.source === 'origin' ? ' (ganze Domain)' : '';
    return ms !== null
        ? `Feld: ${satz} — ${de(ms / 1000)} s bei 75 % der Aufrufe${quelle}`
        : `Feld: ${satz}${quelle}`;
}

/** Deutsches Dezimalkomma — die Karte ist durchgängig deutschsprachig. */
function de(n) {
    return n.toFixed(1).replace('.', ',');
}
