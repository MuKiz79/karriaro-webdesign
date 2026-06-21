/**
 * Saved-Searches — persistiert das fertige ERGEBNIS einer abgeschlossenen Suche,
 * damit der Founder es spaeter OHNE erneuten Places-Call (~0,04 $/Suche) wieder
 * oeffnen kann. Reines Re-Render aus localStorage, niemals eine API.
 *
 * Bewusst getrennt vom scan-cache (api/scan-cache.js): der cacht Places/Scores je
 * Query/Domain — das gibt KEINE wieder-oeffenbare, zusammengesetzte Lead-Liste.
 * Hier speichern wir die fertig assemblierte Lead-/Prospect-Liste + Stats.
 *
 * Zwei Such-Arten, beide rendern in #batch-results:
 *   • scan  — Region-Scan  (scanner.js      → reopenScan)
 *   • batch — Stadt-Suche   (batch-search.js → reopenBatch)
 *
 * Implementierung gespiegelt von api/scan-cache.js: EINMAL lazy laden, im Speicher
 * halten, Schreibzugriffe gebuendelt (debounced) persistieren + Quota-Overflow-
 * Fallback. WICHTIG: Dieses Modul importiert NICHTS aus scanner/batch/main (es ist
 * ein Blatt im Import-Baum) → keine Zyklen. Damit scanner/batch nach dem Speichern
 * eine UI-Aktualisierung ausloesen koennen, OHNE main zu importieren, feuert
 * saveSearch/deleteSearch ein window-Event 'kz:searches-changed'.
 *
 * @module crm/saved-searches
 */

const KEY = 'kz_saved_searches';
const SCHEMA = 1;              // bei inkompatibler Feldaenderung hochzaehlen → Alt-Store wird verworfen
const MAX_ENTRIES = 12;       // Constraint: nur die letzten ~12 Laeufe
const MAX_BYTES = 1_500_000;  // zusaetzliche Gesamtgroessen-Schranke (~1,5 MB)

// ── In-Memory-Layer (einmal laden, gebuendelt persistieren) ──
// mem = { v, items: [ record, ... ] }  — neueste zuerst
let mem = null;
function load() {
    if (mem) return mem;
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
        // Schema-Gate: falscher/fehlender Top-Level-v → sauber als leer behandeln, NIE werfen.
        mem = (raw && raw.v === SCHEMA && Array.isArray(raw.items))
            ? { v: SCHEMA, items: raw.items }
            : { v: SCHEMA, items: [] };
    } catch {
        mem = { v: SCHEMA, items: [] };
    }
    return mem;
}

let flushTimer = null;
function persistNow() {
    flushTimer = null;
    const m = load();
    // Caps VOR dem Schreiben durchsetzen (Anzahl + Gesamtgroesse), aeltester zuerst.
    while (m.items.length > MAX_ENTRIES) m.items.pop();
    let payload = JSON.stringify(m);
    while (payload.length > MAX_BYTES && m.items.length > 1) { m.items.pop(); payload = JSON.stringify(m); }
    try { localStorage.setItem(KEY, payload); }
    catch {
        // Quota voll → aelteste Haelfte verwerfen, einmal erneut versuchen (wie scan-cache).
        m.items = m.items.slice(0, Math.ceil(m.items.length / 2));
        try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* aufgeben */ }
    }
}
function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(persistNow, 400);
}

function emitChanged() {
    try { window.dispatchEvent(new Event('kz:searches-changed')); } catch { /* kein DOM (Test) */ }
}

function makeId(kind) {
    return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────── Public API ───────────

/**
 * Speichert einen fertigen Lauf. record MUSS {kind, label} + Nutzlast tragen:
 *   scan:  { kind:'scan',  label:city,  city,  payload: leads[] }
 *   batch: { kind:'batch', label:query, query, payload: { results[], query, stats } }
 * id/at/v/count werden hier gesetzt. Re-Run desselben Ziels ersetzt den alten
 * Eintrag (kein Duplikat-Spam). Wirft NIE — Aufrufer wickeln zusaetzlich in try/catch.
 * @returns {string} id
 */
export function saveSearch(record) {
    const m = load();
    const id = makeId(record.kind);
    const label = record.label || record.city || record.query || '';
    const count = record.kind === 'scan'
        ? (Array.isArray(record.payload) ? record.payload.length : 0)
        : (Array.isArray(record.payload?.results) ? record.payload.results.length : 0);
    // Signatur fuer De-Dup: gleiche Art + gleiches Ziel ersetzt den alten Lauf.
    const sig = `${record.kind}:${String(label).trim().toLowerCase()}`;
    m.items = m.items.filter(r => r._sig !== sig);
    m.items.unshift({
        v: SCHEMA,
        id,
        _sig: sig,
        kind: record.kind,
        label,
        count,
        at: Date.now(),
        payload: record.payload
    });
    scheduleFlush();
    emitChanged();
    return id;
}

/**
 * Leichte Liste fuer die "Zuletzt"-Anzeige — OHNE die schwere Nutzlast (payload),
 * neueste zuerst. Inkompatible/alte Records werden still uebersprungen.
 * @returns {Array<{id,kind,label,count,at}>}
 */
export function listSearches() {
    return load().items
        .filter(r => r && r.v === SCHEMA && (r.kind === 'scan' || r.kind === 'batch'))
        .slice()
        .sort((a, b) => (b.at || 0) - (a.at || 0))
        .map(({ id, kind, label, count, at }) => ({ id, kind, label, count, at }));
}

/**
 * Vollstaendiger Record inkl. Nutzlast (payload). Reopen ruft KEINE API.
 * Gibt null bei fehlendem/inkompatiblem Eintrag.
 */
export function getSearch(id) {
    const r = load().items.find(x => x.id === id);
    return (r && r.v === SCHEMA) ? r : null;
}

/** Entfernt einen Lauf. @returns {boolean} ob etwas geloescht wurde. */
export function deleteSearch(id) {
    const m = load();
    const before = m.items.length;
    m.items = m.items.filter(r => r.id !== id);
    if (m.items.length === before) return false;
    scheduleFlush();
    emitChanged();
    return true;
}

/** 'gerade eben' / 'vor N Min.' / 'vor N Std.' / 'vor N Tagen' */
export function relativeAge(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 90) return 'gerade eben';
    const min = Math.round(s / 60); if (min < 60) return `vor ${min} Min.`;
    const h = Math.round(min / 60); if (h < 24) return `vor ${h} Std.`;
    const d = Math.round(h / 24); return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}
