/**
 * Quelltext-Wächter für den adEvidence-Endpoint (V6, EVIDENCE_SCHEMA 3).
 *
 * index.js baut das Antwortobjekt SELBST zusammen — an drei Stellen (Cache-
 * Treffer, Bot-Wall, Normalfall). Ein neues Feld, das der Erzeuger liefert,
 * aber eine dieser Stellen nicht kennt, kommt nie beim Client an (Schema-Drift).
 * Dieser Test liest index.js als Text und verlangt das Feld an jeder Stelle.
 *
 * Er schlägt fehl, solange der Patch aus Paket B2 (offene Abhängigkeit an B1)
 * nicht in index.js eingespielt ist — genau dafür ist er da.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

function endpointBlock() {
    const start = quelle.indexOf('exports.adEvidence = onRequest(');
    assert.ok(start > 0, 'adEvidence-Endpoint nicht gefunden');
    const ende = quelle.indexOf('// ════', start);
    return quelle.slice(start, ende > start ? ende : undefined);
}

test('EVIDENCE_SCHEMA ist mindestens 3', () => {
    const m = quelle.match(/const EVIDENCE_SCHEMA = (\d+);/);
    assert.ok(m, 'EVIDENCE_SCHEMA nicht gefunden');
    assert.ok(Number(m[1]) >= 3, `EVIDENCE_SCHEMA ist ${m[1]}, erwartet ≥ 3`);
});

test('Cache-Treffer reicht httpsCheck, php und hoster durch', () => {
    const block = endpointBlock();
    for (const feld of ['httpsCheck', 'php', 'hoster']) {
        assert.match(block, new RegExp(`(?<![\\w.])${feld}: cached\\.${feld}\\b`), `Cache-Antwort ohne ${feld}`);
    }
});

test('Bot-Wall UND Normalfall rufen ermittleWebsiteSignale mit den Headern der HTML-Abholung', () => {
    const block = endpointBlock();
    assert.match(block, /const \{ html, finalUrl, headers \} = await fetchHtml\(/, 'fetchHtml-Header werden nicht übernommen');
    const aufrufe = block.match(/ermittleWebsiteSignale\(\{[^}]*headers[^}]*\}\)/g) || [];
    assert.ok(aufrufe.length >= 2, `erwartet ≥ 2 Aufrufe (Bot-Wall + Normalfall), gefunden ${aufrufe.length}`);
    assert.match(block, /blocked: true/, 'Bot-Wall-Aufruf muss blocked: true übergeben');
    assert.match(quelle, /ermittleWebsiteSignale[^\n]*\} = require\("\.\/lib\/light-audit\.js"\)/, 'Import aus light-audit.js fehlt');
});

test('beide payload-Blöcke ENTHALTEN das Ergebnis (Aufruf allein reicht nicht)', () => {
    // Wirkung statt Anwesenheit: ein Aufruf, dessen Ergebnis nicht in `payload`
    // landet, erreicht weder Antwort noch Cache.
    const block = endpointBlock();
    const namen = [...block.matchAll(/const (\w+) = (?:await )?ermittleWebsiteSignale\(/g)].map(m => m[1]);
    assert.ok(namen.length >= 2, `erwartet ≥ 2 Ergebnis-Variablen, gefunden ${namen.length}`);
    // Bis zum Cache-Schreiben, nicht bis zum ersten `};` — im payload stehen
    // IIFEs mit eigenem `return {…};`, dort endete eine engere Grenze zu früh.
    const payloads = [...block.matchAll(/const payload = \{([\s\S]*?)await saveAdEvidenceCache\(/g)].map(m => m[1]);
    assert.equal(payloads.length, 2, 'erwartet genau zwei payload-Blöcke (Bot-Wall + Normalfall)');
    for (const [i, p] of payloads.entries()) {
        const drin = namen.some(n => new RegExp(`\\.\\.\\.\\(?\\s*(?:await\\s+)?${n}\\b`).test(p));
        assert.ok(drin, `payload-Block ${i + 1} übernimmt httpsCheck/php/hoster nicht`);
    }
});
