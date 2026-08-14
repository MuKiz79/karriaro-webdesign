/**
 * Barriere-Stufe aus dem Compliance-Score — Single-Source (Sprint 180).
 *
 * ─── 2026-08-14: Die Bußgeld-Staffel ist ERSATZLOS entfallen ─────────────────
 * Vorher mappte dieses Modul den Score auf Beträge: <50 → „100.000 €",
 * <70 → „50.000 €", <90 → „10.000 €". Das war frei erfunden.
 *
 * § 37 BFSG kennt ZWEI Rahmen, und die hängen daran, WELCHE Pflicht verletzt
 * wurde — nicht daran, wie schlecht ein Lighthouse-Score ist:
 *   · bis 100.000 € für Abs. 1 Nr. 1, 7, 8, 9, 10 (u. a. nicht barrierefreies
 *     Anbieten einer Dienstleistung)
 *   · bis  10.000 € für Nr. 2–6 (Informations- und Kennzeichnungspflichten)
 * Ein Betrag von 50.000 € steht im Gesetz an keiner Stelle. Und ein Score von
 * 65 erlaubt ÜBERHAUPT keine Aussage über eine Bußgeldhöhe — schon gar nicht,
 * solange nicht geprüft ist, ob der Betrieb dem BFSG unterliegt
 * (→ lib/bfsg-scope.js, drei Bedingungen aus §§ 1, 3 BFSG).
 *
 * ⚠️ Hier NIE wieder einen Geldbetrag einführen. Was dieses Modul liefert, ist
 * die SCHWERE der gemessenen Barrieren — eine Aussage über die Website, die für
 * jeden Betrieb gilt und die an gemessenen Kriterien hängt. Die Rechtsfolge ist
 * eine andere Frage, und die beantwortet bfsg-scope.js mit Vorbehalt.
 *
 * `risk` behält die vier Stufennamen, weil Farb-/Gewichtungslogik in
 * audit-pipeline.js, render-components.js und composite-score.js daran hängt.
 * `label` ist der kundentaugliche Text und ersetzt das frühere `fine`.
 */
function bfsgRiskTier(score, opts) {
    const mittelBelow = (opts && typeof opts.mittelBelow === 'number') ? opts.mittelBelow : 90;
    if (score < 50) return { risk: 'kritisch', label: 'gravierende Barrieren' };
    if (score < 70) return { risk: 'hoch', label: 'deutliche Barrieren' };
    if (score < mittelBelow) return { risk: 'mittel', label: 'einzelne Barrieren' };
    return { risk: 'niedrig', label: 'keine auffälligen Barrieren' };
}

module.exports = { bfsgRiskTier };
