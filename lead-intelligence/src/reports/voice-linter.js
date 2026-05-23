/**
 * Voice-Linter — Brand-Codex-Guard.
 *
 * Hält die Karriaro-Voice (CLAUDE.md) im generierten Report-Content
 * sauber. Wird vom Static-HTML-Builder vor Auslieferung aufgerufen und
 * wirft bei Treffer.
 *
 * Verbotene Patterns (Auszug aus CLAUDE.md, Sprint 141):
 *  - "handgemacht" als isoliertes Hero-Wort (Werkstatt-Klischee)
 *  - "Werkstatt", "Werkbank" als visuelle Sprache
 *  - SaaS-Filler: "kostenlos starten", "keine Kreditkarte", "in unter 60 Sekunden"
 *  - "Du"-Anrede (Public-Site nutzt durchgängig Sie)
 *  - Hansgrohe-Bezug (Brand-Trennung-Regel)
 */

export const FORBIDDEN_PATTERNS = [
    { pattern: /\bhandgemacht\b/i, label: 'handgemacht (isoliert — Werkstatt-Klischee, nur als Pull-Quote im Editorial-Kontext erlaubt)' },
    { pattern: /\bwerkstatt\b/i,   label: 'Werkstatt (Werkbank-Aesthetic verboten)' },
    { pattern: /\bwerkbank\b/i,    label: 'Werkbank (Werkstatt-Klischee)' },
    { pattern: /kostenlos starten/i, label: 'SaaS-Filler "kostenlos starten"' },
    { pattern: /keine kreditkarte/i, label: 'SaaS-Filler "keine Kreditkarte"' },
    { pattern: /in unter 60 sekunden/i, label: 'SaaS-Filler "in unter 60 Sekunden"' },
    { pattern: /\bhansgrohe\b/i, label: 'Hansgrohe-Erwähnung (Brand-Trennung)' }
];

const DU_PATTERN = /\b(Du|Dein|Deine|Dir|Dich)\b/;

const DU_ALLOWLIST_HINTS = [
    'Spar', 'Curri', 'Mass'
];

function isDuAllowlisted(line) {
    return DU_ALLOWLIST_HINTS.some(h => line.includes(h));
}

/**
 * Prüft den menschen-lesbaren Text (NICHT das ganze HTML — Tags würden
 * false positives erzeugen).
 *
 * @returns {Array<{pattern:string, line:string, snippet:string}>} Treffer, leer wenn sauber.
 */
export function lintVoice(text) {
    const hits = [];
    const lines = String(text).split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const { pattern, label } of FORBIDDEN_PATTERNS) {
            if (pattern.test(line)) {
                hits.push({ pattern: label, line: i + 1, snippet: line.trim().slice(0, 120) });
            }
        }
        if (DU_PATTERN.test(line) && !isDuAllowlisted(line)) {
            hits.push({ pattern: 'Du-Anrede (Public-Site nutzt durchgängig Sie)', line: i + 1, snippet: line.trim().slice(0, 120) });
        }
    }
    return hits;
}

/**
 * Throw-Variante für den Build-Pfad. Liefert eine sprechende Fehler-Meldung.
 */
export function assertVoiceClean(text, { context = 'content' } = {}) {
    const hits = lintVoice(text);
    if (!hits.length) return;
    const summary = hits.map(h => `  Zeile ${h.line}: ${h.pattern}\n    » ${h.snippet}`).join('\n');
    const err = new Error(`Voice-Linter (${context}) — ${hits.length} Treffer:\n${summary}`);
    err.code = 'VOICE_VIOLATION';
    err.hits = hits;
    throw err;
}

/**
 * Extrahiert reinen Text aus einem HTML-String — Tags raus, Whitespace
 * normalisiert. Damit kann der Linter direkt gegen finales HTML laufen,
 * ohne dass z.B. ein `<script>`-Tag-Name selbst false-positive auslöst.
 */
export function stripTags(html) {
    return String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
