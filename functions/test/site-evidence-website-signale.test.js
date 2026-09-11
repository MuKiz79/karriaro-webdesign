/**
 * Website-Signale für adEvidence (V6) — lib/light-audit.js ermittleWebsiteSignale.
 *
 * Geprüft wird die Zusammenführung: parallel, jede Lücke als null, Bot-Wall
 * ohne PHP, Beleg aus dem erfolgreichen https-Abruf, und dass das Ergebnis
 * NEU zusammengesetzt wird (nur V6-Felder, nur gültige Werte).
 */
const test = require('node:test');
const assert = require('node:assert');
const { ermittleWebsiteSignale } = require('../lib/light-audit.js');

const ruhig = () => {};
const HEUTE = new Date('2026-09-10T08:00:00Z');
const UNGEPRUEFT = { checked: false, reachable: null, certValidForHost: null, redirectsToHttps: null };

test('liefert alle drei V6-Felder in exakter Form', async () => {
    const r = await ermittleWebsiteSignale(
        { url: 'http://beispiel.de', finalUrl: 'http://beispiel.de/', headers: { 'x-powered-by': 'PHP/7.4.33' } },
        {
            heute: HEUTE, log: ruhig,
            pruefeHttps: async () => ({ checked: true, reachable: false, certValidForHost: null, redirectsToHttps: false }),
            ermittleHoster: async () => ({ name: 'strato', quelle: 'mx' })
        }
    );
    assert.deepEqual(r, {
        httpsCheck: { checked: true, reachable: false, certValidForHost: null, redirectsToHttps: false },
        php: { version: '7.4.33', eol: true, eolDatum: '2022-11-28' },
        hoster: { name: 'strato', quelle: 'mx' }
    });
});

test('HTTPS und Hoster laufen parallel', async () => {
    const gestartet = [];
    let freigabe;
    const tor = new Promise(r => { freigabe = r; });
    const lauf = ermittleWebsiteSignale({ finalUrl: 'http://beispiel.de/' }, {
        log: ruhig,
        pruefeHttps: async () => { gestartet.push('https'); await tor; return UNGEPRUEFT; },
        ermittleHoster: async () => { gestartet.push('hoster'); await tor; return { name: null, quelle: null }; }
    });
    await new Promise(r => setImmediate(r));
    assert.deepEqual(gestartet.sort(), ['hoster', 'https'], 'beide gestartet, bevor einer fertig ist');
    freigabe();
    await lauf;
});

test('geprüft wird der Host von finalUrl, nicht der Eingabe', async () => {
    const hosts = [];
    await ermittleWebsiteSignale({ url: 'beispiel.de', finalUrl: 'https://www.beispiel.de/start' }, {
        log: ruhig,
        pruefeHttps: async h => { hosts.push(h); return UNGEPRUEFT; },
        ermittleHoster: async h => { hosts.push(h); return { name: null, quelle: null }; }
    });
    assert.deepEqual(hosts, ['www.beispiel.de', 'www.beispiel.de']);
});

test('🚨 Bot-Wall: PHP aus Sperr-Headern wird NICHT gewertet — Gegenprobe ohne Sperre wertet', async () => {
    const deps = { heute: HEUTE, log: ruhig, pruefeHttps: async () => UNGEPRUEFT, ermittleHoster: async () => ({ name: null, quelle: null }) };
    const headers = { 'x-powered-by': 'PHP/7.4.33' };
    const gesperrt = await ermittleWebsiteSignale({ finalUrl: 'https://beispiel.de/', headers, blocked: true }, deps);
    assert.deepEqual(gesperrt.php, { version: null, eol: null, eolDatum: null });
    const offen = await ermittleWebsiteSignale({ finalUrl: 'https://beispiel.de/', headers, blocked: false }, deps);
    assert.equal(offen.php.version, '7.4.33');
});

test('erfolgreicher https-Abruf belegt HTTPS, wenn der Handshake nichts liefert — http-Abruf belegt nichts', async () => {
    const deps = { log: ruhig, pruefeHttps: async () => ({ ...UNGEPRUEFT }), ermittleHoster: async () => ({ name: null, quelle: null }) };
    const belegt = await ermittleWebsiteSignale({ url: 'beispiel.de', finalUrl: 'https://beispiel.de/' }, deps);
    assert.deepEqual(belegt.httpsCheck, { checked: true, reachable: true, certValidForHost: true, redirectsToHttps: null });
    // Gegenprobe: Seite liegt auf http → keine Aussage aus dem Abruf
    const http = await ermittleWebsiteSignale({ url: 'beispiel.de', finalUrl: 'http://beispiel.de/' }, deps);
    assert.deepEqual(http.httpsCheck, UNGEPRUEFT);
    // Gegenprobe: nur die EINGABE ist https, finalUrl fehlt → kein Beleg
    const nurEingabe = await ermittleWebsiteSignale({ url: 'https://beispiel.de' }, deps);
    assert.deepEqual(nurEingabe.httpsCheck, UNGEPRUEFT);
});

test('Widerspruch (Abruf über https gelang, Handshake meldet ungültiges Zertifikat) → Zertifikat null', async () => {
    const meldungen = [];
    const r = await ermittleWebsiteSignale({ finalUrl: 'https://beispiel.de/' }, {
        log: m => meldungen.push(m),
        pruefeHttps: async () => ({ checked: true, reachable: true, certValidForHost: false, redirectsToHttps: true }),
        ermittleHoster: async () => ({ name: null, quelle: null })
    });
    assert.deepEqual(r.httpsCheck, { checked: true, reachable: true, certValidForHost: null, redirectsToHttps: true });
    assert.equal(meldungen.length, 1);
});

test('🚨 werfender oder hängender Teil → dieser Teil ungeprüft und geloggt, der andere bleibt', async () => {
    const meldungen = [];
    const wirft = await ermittleWebsiteSignale({ finalUrl: 'http://beispiel.de/' }, {
        log: m => meldungen.push(m),
        pruefeHttps: async () => { throw new Error('kaputt'); },
        ermittleHoster: async () => ({ name: 'ionos', quelle: 'ns' })
    });
    assert.deepEqual(wirft.httpsCheck, UNGEPRUEFT);
    assert.deepEqual(wirft.hoster, { name: 'ionos', quelle: 'ns' });
    assert.equal(meldungen.length, 1);

    const start = Date.now();
    const haengt = await ermittleWebsiteSignale({ finalUrl: 'http://beispiel.de/' }, {
        log: ruhig, fristMs: 50,
        pruefeHttps: async () => ({ checked: true, reachable: true, certValidForHost: true, redirectsToHttps: true }),
        ermittleHoster: () => new Promise(() => {})
    });
    assert.ok(Date.now() - start < 1000);
    assert.equal(haengt.httpsCheck.reachable, true);
    assert.deepEqual(haengt.hoster, { name: null, quelle: null });
});

test('Schema-Wächter: ungültige Werte werden null, Fremdfelder fallen weg', async () => {
    const r = await ermittleWebsiteSignale({ finalUrl: 'http://beispiel.de/', headers: {} }, {
        log: ruhig,
        pruefeHttps: async () => ({ checked: true, reachable: 'ja', certValidForHost: true, redirectsToHttps: 0, geheim: 'x' }),
        ermittleHoster: async () => ({ name: 'hetzner', quelle: 'mx', extra: 1 })
    });
    assert.deepEqual(Object.keys(r).sort(), ['hoster', 'httpsCheck', 'php']);
    assert.deepEqual(r.httpsCheck, UNGEPRUEFT, 'certValidForHost ohne gemessenen Handshake ist wertlos');
    assert.deepEqual(r.hoster, { name: null, quelle: null });
    assert.deepEqual(r.php, { version: null, eol: null, eolDatum: null });
});

test('🚨 rejected nie — auch nicht bei kaputter Eingabe oder werfendem Logger', async () => {
    const leer = { httpsCheck: UNGEPRUEFT, php: { version: null, eol: null, eolDatum: null }, hoster: { name: null, quelle: null } };
    assert.deepEqual(await ermittleWebsiteSignale(null, null), leer);
    const r = await ermittleWebsiteSignale({ finalUrl: 'http://beispiel.de/' }, {
        log: () => { throw new Error('Logger kaputt'); },
        pruefeHttps: async () => { throw new Error('kaputt'); },
        ermittleHoster: async () => ({ name: null, quelle: null })
    });
    assert.deepEqual(r, leer);
});

test('ohne lesbare URL → alles ungeprüft, keine Prüfung gestartet', async () => {
    let gefragt = false;
    const r = await ermittleWebsiteSignale({ url: 'http://', finalUrl: null }, {
        log: ruhig,
        pruefeHttps: async () => { gefragt = true; return UNGEPRUEFT; },
        ermittleHoster: async () => { gefragt = true; return { name: null, quelle: null }; }
    });
    assert.equal(gefragt, false);
    assert.deepEqual(r.httpsCheck, UNGEPRUEFT);
    assert.deepEqual(r.hoster, { name: null, quelle: null });
});
