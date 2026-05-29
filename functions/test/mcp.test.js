/**
 * Sprint 178 — Tests für die öffentliche mcp/-Oberfläche + url-utils.
 *
 * Deckt die testbaren, netzwerk-freien Teile ab: Protokoll-Dispatch (JSONRPC),
 * deterministisches Phyllotaxis-Siegel, Branding-Helper, URL-Normalisierung.
 * (Claude-/PSI-aufrufende Tools — extract_voice/generate_mockup — brauchen Mocks
 *  und bleiben hier außen vor; getestet wird der Dispatch-Pfad über phyllotaxis.)
 *
 * Run: Teil von `npm run test:audit`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeUrl } = require('../lib/url-utils.js');
const { withSignature, header, SIGNATURE } = require('../mcp/branding.js');
const phyllotaxis = require('../mcp/tool-phyllotaxis.js');
const { dispatch, TOOLS, SERVER_NAME } = require('../mcp/index.js');

// ──────────────── url-utils (Single-Source, Sprint 178) ────────────────

test('normalizeUrl: prefixt https:// + strippt Trailing-Slash', () => {
    assert.equal(normalizeUrl('example.de/'), 'https://example.de');
    assert.equal(normalizeUrl('  example.de/pfad/  '), 'https://example.de/pfad');
});

test('normalizeUrl: case-insensitiver Protokoll-Check (i-Flag-Fix gegen frühere index.js-Divergenz)', () => {
    assert.equal(normalizeUrl('HTTP://example.de'), 'http://example.de');     // NICHT https://HTTP://...
    assert.equal(normalizeUrl('HTTPS://example.de/'), 'https://example.de');
});

test('normalizeUrl: non-string / leer → null', () => {
    assert.equal(normalizeUrl(null), null);
    assert.equal(normalizeUrl(123), null);
    assert.equal(normalizeUrl('   '), null);
    assert.equal(normalizeUrl('http://'), null);   // ungültig
});

// ──────────────── branding ────────────────

test('branding: withSignature hängt die Karriaro-Signatur an', () => {
    const out = withSignature('Hallo');
    assert.ok(out.startsWith('Hallo'));
    assert.ok(out.endsWith(SIGNATURE));
    assert.match(out, /Karriaro Webdesign-Manufaktur/);
});

test('branding: header uppercased Titel + Linien >= 60 Zeichen', () => {
    const h = header('Karriaro · Test');
    assert.match(h, /KARRIARO · TEST/);
    assert.ok(h.split('\n')[0].length >= 60);
});

// ──────────────── phyllotaxis (deterministisch, pure) ────────────────

test('phyllotaxis: deterministisch — gleicher Name = gleicher Output', async () => {
    const a = await phyllotaxis.execute({ name: 'Praxis Weber' });
    const b = await phyllotaxis.execute({ name: 'Praxis Weber' });
    assert.equal(a, b);
    assert.match(a, /<svg/);
});

test('phyllotaxis: Name wird im SVG XML-escaped (kein ausführbares <script> im einbettbaren SVG)', async () => {
    const out = await phyllotaxis.execute({ name: '<script>alert(1)</script>' });
    const svg = out.match(/<svg[\s\S]*<\/svg>/)[0];   // nur der einbettbare SVG-Teil ist HTML-relevant
    assert.doesNotMatch(svg, /<script/i);              // kein roher script-Tag im SVG
    assert.match(svg, /&lt;script&gt;/);               // Name escaped in aria-label/title
});

test('phyllotaxis: fehlender Name wirft', async () => {
    await assert.rejects(() => phyllotaxis.execute({}), /erforderlich/);
});

// ──────────────── MCP-Dispatch (JSONRPC, ohne Netzwerk) ────────────────

test('dispatch: tools/list — DEFINITION.name == TOOLS-Key für alle 4', async () => {
    const r = await dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});
    const names = r.result.tools.map(t => t.name).sort();
    assert.equal(r.result.tools.length, 4);
    assert.deepEqual(names, Object.keys(TOOLS).sort());
});

test('dispatch: initialize liefert serverInfo + protocolVersion', async () => {
    const r = await dispatch({ id: 2, method: 'initialize' }, {});
    assert.equal(r.result.serverInfo.name, SERVER_NAME);
    assert.ok(r.result.protocolVersion);
});

test('dispatch: ping → leeres result', async () => {
    const r = await dispatch({ id: 3, method: 'ping' }, {});
    assert.deepEqual(r.result, {});
});

test('dispatch: unbekannte Methode → -32601', async () => {
    const r = await dispatch({ id: 4, method: 'bogus/method' }, {});
    assert.equal(r.error.code, -32601);
});

test('dispatch: tools/call unbekanntes Tool → -32602', async () => {
    const r = await dispatch({ id: 5, method: 'tools/call', params: { name: 'nope' } }, {});
    assert.equal(r.error.code, -32602);
});

test('dispatch: tools/call phyllotaxis (voller Pfad, pure) → SVG, isError false', async () => {
    const r = await dispatch({ id: 6, method: 'tools/call', params: { name: 'karriaro_phyllotaxis_signature', arguments: { name: 'Test GmbH' } } }, {});
    assert.equal(r.result.isError, false);
    assert.match(r.result.content[0].text, /<svg/);
});
