/**
 * Decision-Engine — Single Source of Truth fuer die Lead-Action-Empfehlung.
 *
 * Vorgeschichte: Das UI rendert(e) bisher vier separate Empfehlungen aus vier
 * unkoordinierten Quellen:
 *   - Composite-Score (Fit×Intent×Timing) → "Exzellent / Gut / Schwach"
 *   - Kelly/EV → "Skip / Quick-Pitch / Standard / Voll investieren"
 *   - Trigger-Events → "Sofort / Hoch / Mittel / Kein Anlass"
 *   - Lead-Score (Monte-Carlo) → "Starker Lead / mittel / schwach"
 *
 * Diese vier konnten widerspruechlich werden ("Exzellenter Lead" + "Skip — EV
 * zu niedrig" gleichzeitig). Diese Engine konsolidiert sie zu EINER Top-
 * Empfehlung mit klarer Hierarchie. Die einzelnen Module bleiben sichtbar als
 * Diagnose-Details unter dem Decision-Banner.
 *
 * Hierarchie (EV ist harter Top-Filter):
 *   1. EV <= 0 → SKIP (Akquise-Aufwand uebersteigt Erwartungswert)
 *   2. EV > 0 + Trigger urgent (totalImpact >= 8 oder hasSofort) → CONTACT_NOW
 *   3. EV > 0 + Composite >= 65 → CONTACT_SOON
 *   4. EV > 0 sonst → WATCHLIST
 *
 * @module scoring/decision-engine
 */

/**
 * @typedef {Object} Decision
 * @property {'skip'|'contact_now'|'contact_soon'|'watchlist'} action
 * @property {string} actionLabel
 * @property {string} reason
 * @property {'high'|'medium'|'low'} confidence
 * @property {string[]} diagnostics
 */

/**
 * Konsolidiert alle Scoring-Inputs zu einer einzigen Aktion.
 *
 * @param {Object} params
 * @param {Object} [params.composite]   — calculateCompositeScore-Output
 * @param {Object} [params.kelly]       — calculateKelly-Output
 * @param {Object} [params.triggers]    — detectTriggerEvents-Output
 * @param {number} [params.leadScore]   — Lead-Scorer Monte-Carlo-Score 0-100
 * @returns {Decision}
 */
export function decideAction({ composite, kelly, triggers, leadScore } = {}) {
    const ev = (kelly && typeof kelly.expectedValue === 'number') ? kelly.expectedValue : null;
    const compositeValue = composite?.composite ?? null;
    const compositeStrong = compositeValue !== null && compositeValue >= 65;
    const totalImpact = triggers?.totalImpact ?? 0;
    const hasSofort = !!triggers?.hasSofort;
    const urgent = hasSofort || totalImpact >= 8;

    const diagnostics = [];
    if (compositeValue !== null) diagnostics.push(`Composite ${compositeValue}/100 (Fit×Intent×Timing)`);
    if (ev !== null) diagnostics.push(`EV ${ev >= 0 ? '+' : ''}${ev.toFixed(0)}€ (p·NPV − timeCost)`);
    if (totalImpact > 0) diagnostics.push(`Trigger-Events Impact ${totalImpact}${hasSofort ? ' (sofort)' : ''}`);
    if (typeof leadScore === 'number') diagnostics.push(`Lead-Score ${leadScore}/100 (Monte-Carlo)`);

    // Wenn EV nicht berechenbar ist (z.B. Kelly-Modul nicht gelaufen), fallback
    // auf Composite-basierte Empfehlung — ohne "Skip" zu rendern, weil das eine
    // mathematische Aussage ist die wir hier nicht treffen koennen.
    if (ev === null) {
        if (compositeStrong && urgent) return { action: 'contact_now', actionLabel: 'Sofort kontaktieren', reason: `Composite ${compositeValue}/100 + Trigger-Events aktiv. EV nicht berechenbar.`, confidence: 'medium', diagnostics };
        if (compositeStrong) return { action: 'contact_soon', actionLabel: 'Bald kontaktieren', reason: `Composite ${compositeValue}/100. EV nicht berechenbar.`, confidence: 'medium', diagnostics };
        return { action: 'watchlist', actionLabel: 'In Watchlist', reason: 'Composite schwach, EV nicht berechenbar.', confidence: 'low', diagnostics };
    }

    // EV ist Top-Filter — negative Erwartungswerte werden NIE zu "Contact".
    // Begruendung: -X€/Lead × N Leads = -X·N€ sicher verloren. Bei begrenzten
    // Wochenstunden ist Zeit der knappe Faktor, nicht Lead-Volumen.
    if (ev <= 0) {
        return {
            action: 'skip',
            actionLabel: 'Skip — EV negativ',
            reason: `EV ${ev.toFixed(0)}€: Akquise-Aufwand uebersteigt Erwartungswert. Selbst starke Trigger-Events aendern das nicht — bei begrenzten Wochenstunden bringt jeder Kontakt einen erwarteten Verlust.`,
            confidence: 'high',
            diagnostics
        };
    }

    if (urgent) {
        return {
            action: 'contact_now',
            actionLabel: 'Sofort kontaktieren',
            reason: `EV +${ev.toFixed(0)}€ und Trigger-Events aktiv (${triggers.topEvent?.label || `Impact ${totalImpact}`}). Erste Kontaktaufnahme gewinnt 35-50% der Deals.`,
            confidence: 'high',
            diagnostics
        };
    }

    if (compositeStrong) {
        return {
            action: 'contact_soon',
            actionLabel: 'Bald kontaktieren',
            reason: `EV +${ev.toFixed(0)}€ und Lead-Fit ${compositeValue}/100. Kein akuter Trigger — diese Woche kontaktieren reicht.`,
            confidence: 'medium',
            diagnostics
        };
    }

    return {
        action: 'watchlist',
        actionLabel: 'In Watchlist',
        reason: `EV +${ev.toFixed(0)}€ aber Lead-Fit nur ${compositeValue ?? '?'}/100 und kein Trigger. Beobachten, in 4-8 Wochen wieder pruefen.`,
        confidence: 'medium',
        diagnostics
    };
}
