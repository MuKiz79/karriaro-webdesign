/**
 * URL-Normalisierung — Single-Source (Sprint 178).
 *
 * Vorher 3× dupliziert (index.js, mcp/tool-audit-site.js, mcp/tool-extract-voice.js)
 * mit subtiler Divergenz: index.js nutzte /^https?:\/\// OHNE i-Flag, die mcp-Kopien
 * MIT. Kanonisch = case-insensitiv (sonst würde "HTTP://x" fälschlich zu
 * "https://HTTP://x"). Liefert origin + pathname ohne Trailing-Slash, oder null.
 */
function normalizeUrl(raw) {
    if (typeof raw !== 'string') return null;   // untrusted Input: Nicht-Strings ablehnen (nicht coercen → kein "https://0.0.0.123" aus 123)
    const s = raw.trim();
    if (!s) return null;
    const withProto = /^https?:\/\//i.test(s) ? s : 'https://' + s;
    try {
        const u = new URL(withProto);
        return u.origin + u.pathname.replace(/\/$/, '');
    } catch { return null; }
}

module.exports = { normalizeUrl };
