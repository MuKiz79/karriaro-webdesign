/**
 * Gemeinsames HTML-Escaping — eine Quelle statt mehrerer Duplikate.
 * Escaped < > & " ' (Apostroph mit, für Attribut-Sicherheit).
 *
 * @module lib/escape-html
 */
const MAP = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, c => MAP[c]);
}
