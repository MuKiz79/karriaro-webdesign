/**
 * A/B-Test der Pitch-Varianten — Thompson Sampling.
 *
 * ⚠️ Bis 2026-07-26 hatten `logSent`/`logReply` NULL Aufrufer: die Beta-Posteriors
 * blieben auf (1,1), die Variantenwahl war reines Rauschen — und die UI hat dieser
 * Zufallswahl trotzdem ein Confidence-Label angeheftet. Genau das verbietet das
 * Playbook (§7: Verdikte an Gemessenes binden, nichts behaupten, was nicht belegt
 * ist). Beides ist jetzt behoben:
 *   • Versand und Antwort werden im Outreach-Studio bzw. beim Status-Wechsel
 *     „geantwortet" tatsächlich protokolliert.
 *   • `confidence` ist `null`, solange keine Daten vorliegen — die UI zeigt dann
 *     ehrlich „noch keine Daten" statt „niedrig".
 */
import { sampleBeta } from '../math/sampling.js';

// ⚠️ Die Varianten waren bis 2026-07-26 'emotional'/'rational'/'hybrid' — eine
// Achse, die NIRGENDS verschickt wurde. Das Outreach-Studio variiert in
// Wahrheit die TONALITÄT (strategy/outreach.js:517). Ein logSent('professionell')
// wäre an der alten Liste still abgeprallt: verdrahtet aussehend, ohne Wirkung.
// Der Test läuft jetzt auf der Achse, die tatsächlich rausgeht.
// Alt-Stände in localStorage sind sämtlich (0,0) — es wurde nie eine Mail
// erfasst — deshalb ist keine Migration nötig, getStats() ignoriert sie.
const VARIANTS = ['professionell', 'freundlich', 'direkt'];
const EMPTY = { professionell: { sent: 0, replied: 0 }, freundlich: { sent: 0, replied: 0 }, direkt: { sent: 0, replied: 0 } };

function getStats() {
    try {
        const raw = JSON.parse(localStorage.getItem('karriaro_ab_stats_v2') || 'null');
        if (!raw) return structuredClone(EMPTY);
        // Fehlende Varianten auffüllen — ein Teil-Datensatz darf selectVariant nicht werfen.
        const out = structuredClone(EMPTY);
        for (const v of VARIANTS) {
            if (raw[v] && typeof raw[v].sent === 'number') out[v] = { sent: raw[v].sent, replied: raw[v].replied || 0 };
        }
        return out;
    } catch { return structuredClone(EMPTY); }
}
function saveStats(s) {
    try { localStorage.setItem('karriaro_ab_stats_v2', JSON.stringify(s)); } catch { /* Quota/Private-Mode */ }
}

/**
 * @returns {{variant:string, stats:object, totalSent:number,
 *            confidence:'hoch'|'mittel'|'niedrig'|null}}
 *          confidence === null → noch keine Versand-Daten, die Wahl ist bewusst zufällig.
 */
export function selectVariant() {
    const stats = getStats();
    let best = null, bestSample = -1;
    for (const v of VARIANTS) {
        const s = stats[v];
        // Beta(replied+1, nicht-geantwortet+1); max(0,…) schützt gegen einen
        // korrupten Stand mit replied > sent.
        const sample = sampleBeta(s.replied + 1, Math.max(0, s.sent - s.replied) + 1);
        if (sample > bestSample) { bestSample = sample; best = v; }
    }
    const totalSent = VARIANTS.reduce((sum, v) => sum + stats[v].sent, 0);
    return {
        variant: best,
        stats,
        totalSent,
        confidence: totalSent === 0 ? null
            : totalSent >= 30 ? 'hoch'
            : totalSent >= 10 ? 'mittel'
            : 'niedrig'
    };
}

/** Eine Mail dieser Variante ist RAUS (nicht: Entwurf erzeugt). */
export function logSent(variant) {
    if (!VARIANTS.includes(variant)) return;
    const s = getStats(); s[variant].sent++; saveStats(s);
}

/**
 * Der Empfänger hat geantwortet.
 * Wird beim Status-Wechsel auf „geantwortet" ausgelöst (crm/leads.js) und ist
 * gegen Doppelzählung geschützt: der Aufrufer meldet nur den ersten Übergang.
 */
export function logReply(variant) {
    if (!VARIANTS.includes(variant)) return;
    const s = getStats();
    s[variant].replied++;
    // Eine Antwort ohne gezählten Versand ist ein Datenfehler (z.B. Status per Hand
    // gesetzt, ohne dass der Versand erfasst wurde). Versand nachziehen, damit die
    // Quote nicht über 100 % laeuft und das Beta-Update gueltig bleibt.
    if (s[variant].replied > s[variant].sent) s[variant].sent = s[variant].replied;
    saveStats(s);
}

export { VARIANTS };
