/**
 * Filter- und Sortierlogik der Lead-Liste — pure, DOM-frei, testbar.
 *
 * Bewusst aus scanner.js herausgelöst: das ist die Logik, die entscheidet, WEN
 * der Founder tatsächlich kontaktiert. Ein stiller Fehler hier kostet keine
 * Fehlermeldung, sondern die richtigen Leads.
 *
 * @module orchestration/lead-filters
 */

/**
 * Hat der Lead ein BEWIESENES Kaufsignal — schaltet Anzeigen oder stellt ein?
 *
 * Das ist die stärkste billige Evidenz für „der Inhaber will erneuern": wer für
 * Klicks zahlt, will mehr Kunden und leitet sie gerade auf eine schwache Seite.
 * Aktivitätssignale (frische Bewertungen, gute Note) zählen bewusst NICHT — die
 * beweisen Zahlungsfähigkeit, nicht Kaufabsicht.
 * @param {{buySignal?:{adActive?:boolean, hiring?:boolean}}} l
 */
export function hasBuySignal(l) {
    // `proven` kommt seit der Kaufsignal-Achse im Scanner (2026-07-26) aus
    // buying-intent.js und deckt zusätzlich Werbe-Evidenz ab, die erst der
    // GTM-Container-Scan gefunden hat. Die beiden alten Flags bleiben als
    // Rückfall für Leads aus älteren, gespeicherten Scans stehen.
    return !!(l?.buySignal?.proven || l?.buySignal?.adActive || l?.buySignal?.hiring);
}

/**
 * Ist der Betrieb nachweislich ansprechbar?
 *
 * ⚠️ Ein Lead, dessen Seite NICHT geprüft wurde, gilt hier als erreichbar —
 * „nicht geprüft" ist nicht „nicht erreichbar". Der Filter blendet nur aus,
 * was nachweislich keinen Kontaktweg hat; ein ungeprüfter Lead soll nicht
 * unsichtbar werden, bloß weil er außerhalb der Top-60 lag.
 */
export function isReachable(l) {
    const c = l?.siteEvidence?.contactPaths;
    if (!c || c.checked !== true) return true;
    return !!(c.hasMailto || c.hasTel || c.hasImpressumLink);
}

/**
 * Hat der Lead einen Anlass mit DATUM (Chrome-Warnung ab 10/2026, PHP- oder
 * CMS-Version ohne Sicherheitsupdates seit …)?
 *
 * Bewusst nur ein FILTER, kein Score-Aufschlag: „alt" ist kein Kaufsignal. Der
 * Anlass hilft beim Formulieren, nicht beim Sortieren. `anlaesse` kommt aus
 * computeOpportunity (analysis/trigger-events.js → datierteAnlaesse). Leads aus
 * gespeicherten Scans ohne das Feld fallen heraus — ungeprüft ist kein Anlass.
 */
export function hasDatedAnlass(l) {
    return Array.isArray(l?.anlaesse) && l.anlaesse.some(a => !!(a && a.datum));
}

/**
 * @param {Array} leads
 * @param {{minScore:number, branch:string, sort:string, baukasten:boolean, buy:boolean, reach:boolean, unrated:boolean, anlass:boolean}} f
 * @returns {Array} neue, gefilterte + sortierte Liste (Eingabe bleibt unberührt)
 */
export function applyFilters(leads, f = {}) {
    let out = (leads || []).slice();
    if (f.minScore > 0) out = out.filter(l => l.leadScore >= f.minScore);
    if (f.branch && f.branch !== 'all') out = out.filter(l => l.branch?.key === f.branch);
    if (f.baukasten) out = out.filter(l => l.isBaukasten);
    if (f.buy) out = out.filter(hasBuySignal);
    if (f.reach) out = out.filter(isReachable);
    if (f.anlass) out = out.filter(hasDatedAnlass);
    // `urteil` wird vom Aufrufer aufs Lead hydriert (scanner.js) — dieses Modul
    // bleibt dadurch pure und DOM-/Store-frei, die Bestandstests gelten weiter.
    if (f.unrated) out = out.filter(l => !l.urteil);

    if (f.sort === 'uncertain') {
        // Aktives Lernen: die Faelle zuerst, bei denen das Modell am wenigsten
        // weiss (|p − 0.5| klein). Zwanzig Klicks hier sind mehr wert als hundert
        // auf offensichtliche Treffer. Leads ohne Vorhersage ans Ende.
        out.sort((a, b) => {
            const ua = typeof a.uncertainty === 'number' ? a.uncertainty : Infinity;
            const ub = typeof b.uncertainty === 'number' ? b.uncertainty : Infinity;
            return ua - ub || (b.leadScore - a.leadScore);
        });
    } else if (f.sort === 'ambition') {
        // B6 (2026-08-17, Founder-Zielbild B): „Gründer, die im KI-Zeitalter
        // mithalten wollen" — sortiert nach der Kaufsignal-EVIDENZSUMME
        // (Anzeigen, Stellen, bezahlte Werkzeuge, Pflege, Kanäle), nicht nach
        // Website-Schwäche. Zeigt dieselbe Liste aus der Ambitions-Perspektive;
        // Leads ohne geprüfte Evidenz (intentScore null) ans Ende.
        out.sort((a, b) => {
            const ia = typeof a.buySignal?.intentScore === 'number' ? a.buySignal.intentScore : -1;
            const ib = typeof b.buySignal?.intentScore === 'number' ? b.buySignal.intentScore : -1;
            return (ib - ia) || (b.leadScore - a.leadScore);
        });
    } else if (f.sort === 'buy') {
        // Bewiesene Spender zuerst, innerhalb der Gruppe nach Score.
        out.sort((a, b) => (hasBuySignal(b) - hasBuySignal(a)) || (b.leadScore - a.leadScore));
    } else if (f.sort === 'reviews') {
        out.sort((a, b) => b.reviews - a.reviews);
    } else if (f.sort === 'name') {
        out.sort((a, b) => a.name.localeCompare(b.name));
    } else if (f.sort === 'perf') {
        out.sort((a, b) => (a.ws?.perf || 0) - (b.ws?.perf || 0));
    } else {
        out.sort((a, b) => b.leadScore - a.leadScore);
    }
    return out;
}

// ─────────── Sonder-Listen: Neueröffnungen & Empfehlungspartner (2026-09-10) ───────────
// Beide Listen laufen bewusst NEBEN dem Kunden-Scoring: eine Neueröffnung hat
// noch keine Website und keine Bewertungen, ein Empfehlungspartner ist kein
// Kunde. Durch computeOpportunity geschickt, würden beide als „zu kleiner
// Betrieb" genullt.

/** Places `openingDate` → {year,month,day} | ISO-String → Zeitwert, unbekannt → null. */
function oeffnungsTeile(d) {
    if (!d) return null;
    if (typeof d === 'object') {
        const y = Number(d.year), m = Number(d.month), t = Number(d.day);
        if (!Number.isFinite(y) || y <= 0) return null;
        return { y, m: Number.isFinite(m) && m > 0 ? m : null, t: Number.isFinite(t) && t > 0 ? t : null };
    }
    const s = String(d).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!s) return null;
    return { y: +s[1], m: s[2] ? +s[2] : null, t: s[3] ? +s[3] : null };
}

/**
 * Eröffnungsdatum so genau, wie Google es liefert — nie genauer:
 * {year:2026,month:10,day:1} → „01.10.2026", nur Monat → „10/2026", nur Jahr → „2026".
 * @returns {string|null}
 */
export function formatiereOeffnungsdatum(d) {
    const p = oeffnungsTeile(d);
    if (!p) return null;
    const zz = n => String(n).padStart(2, '0');
    if (p.m && p.t) return `${zz(p.t)}.${zz(p.m)}.${p.y}`;
    if (p.m) return `${zz(p.m)}/${p.y}`;
    return String(p.y);
}

function oeffnungsSortwert(d) {
    const p = oeffnungsTeile(d);
    return p ? p.y * 10000 + (p.m || 12) * 100 + (p.t || 31) : Infinity;
}

/**
 * Neueröffnungen aus Places-Treffern: NUR businessStatus FUTURE_OPENING, OHNE
 * websiteUri- und OHNE Bewertungs-Tor (beides hat ein Betrieb vor dem Start
 * meist nicht). Dedupliziert über Place-ID bzw. Name+Adresse, sortiert nach
 * Eröffnungsdatum (unbekannt ans Ende).
 * @param {Array<{branch:object, place:object}>} eintraege
 */
export function filterNeueroeffnungen(eintraege) {
    const gesehen = new Set();
    const out = [];
    for (const e of eintraege || []) {
        const p = e?.place;
        if (!p || p.businessStatus !== 'FUTURE_OPENING') continue;
        const name = p.displayName?.text || '';
        const schluessel = p.id || `${name.toLowerCase()}|${(p.formattedAddress || '').toLowerCase()}`;
        if (!name && !p.id) continue;
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        out.push({
            branch: e.branch || null,
            name: name || '—',
            address: p.formattedAddress || null,
            websiteUri: p.websiteUri || null,
            typ: p.primaryTypeDisplayName?.text || null,
            openingDate: p.openingDate || null,
            eroeffnung: formatiereOeffnungsdatum(p.openingDate)
        });
    }
    return out.sort((a, b) => oeffnungsSortwert(a.openingDate) - oeffnungsSortwert(b.openingDate) || a.name.localeCompare(b.name));
}

/**
 * Empfehlungspartner (Werbetechnik, Fotograf, Druckerei, IT-Service): sortiert
 * nach Bewertungszahl — sichtbare lokale Verankerung —, dann Note, dann Name.
 * KEIN Kunden-Scoring. Fehlende Bewertungszahl zählt als 0 (ans Ende), nie als Strafe.
 * @param {Array<{reviews?:number, rating?:number|null, name?:string}>} liste
 */
export function sortierePartner(liste) {
    return (liste || []).slice().sort((a, b) =>
        ((b.reviews || 0) - (a.reviews || 0))
        || ((b.rating || 0) - (a.rating || 0))
        || String(a.name || '').localeCompare(String(b.name || '')));
}
