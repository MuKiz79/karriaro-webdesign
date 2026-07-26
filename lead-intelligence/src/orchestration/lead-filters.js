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
    return !!(l?.buySignal?.adActive || l?.buySignal?.hiring);
}

/**
 * @param {Array} leads
 * @param {{minScore:number, branch:string, sort:string, baukasten:boolean, buy:boolean}} f
 * @returns {Array} neue, gefilterte + sortierte Liste (Eingabe bleibt unberührt)
 */
export function applyFilters(leads, f = {}) {
    let out = (leads || []).slice();
    if (f.minScore > 0) out = out.filter(l => l.leadScore >= f.minScore);
    if (f.branch && f.branch !== 'all') out = out.filter(l => l.branch?.key === f.branch);
    if (f.baukasten) out = out.filter(l => l.isBaukasten);
    if (f.buy) out = out.filter(hasBuySignal);

    if (f.sort === 'buy') {
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
