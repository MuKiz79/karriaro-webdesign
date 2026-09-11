/**
 * HTTPS-Prüfung (V6 httpsCheck) — lib/https-pruefung.js.
 *
 * Der TLS-Teil läuft gegen ECHTE lokale Sockets (127.0.0.1, zufälliger Port):
 * gültiges Zertifikat, Zertifikat für einen fremden Host, nicht vertrauens-
 * würdig, Klartext auf dem TLS-Port, TLS-Alert, verweigerte Verbindung und ein
 * stummer Server. So wird die Einordnung an den Fehlern gemessen, die Node
 * wirklich wirft — nicht an Fehlercodes aus dem Gedächtnis. Kein externes Netz.
 *
 * Test-Zertifikat: selbstsigniert (EC P-256), SAN nur pruef.karriaro.test,
 * gültig bis 2126 — nur für diese Tests, ohne Bezug zu einem echten Host.
 */
const test = require('node:test');
const assert = require('node:assert');
const tls = require('node:tls');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const {
    tlsProbe, pruefeHttpWeiterleitung, pruefeHttps, klassifiziereTlsFehler, HTTPS_UNGEPRUEFT
} = require('../lib/https-pruefung.js');

const CERT = `-----BEGIN CERTIFICATE-----
MIIBszCCAVmgAwIBAgIUdO+wNDUWoitbDPQdpeR3HEHG28YwCgYIKoZIzj0EAwIw
HjEcMBoGA1UEAwwTcHJ1ZWYua2Fycmlhcm8udGVzdDAgFw0yNjA5MTAyMDEyMDla
GA8yMTI2MDgxNzIwMTIwOVowHjEcMBoGA1UEAwwTcHJ1ZWYua2Fycmlhcm8udGVz
dDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABHy1Y5wzAdU3qmy7O7ujmzhDJQRa
1nxVz136SE4MRAL36mVLehszgES1QXaM190LWruj8yIJAsQqVACzuzv98y2jczBx
MB0GA1UdDgQWBBT43I9+7DlnqONHqwZqXuOvl2VsBTAfBgNVHSMEGDAWgBT43I9+
7DlnqONHqwZqXuOvl2VsBTAPBgNVHRMBAf8EBTADAQH/MB4GA1UdEQQXMBWCE3By
dWVmLmthcnJpYXJvLnRlc3QwCgYIKoZIzj0EAwIDSAAwRQIhAOWLo391JOfYZdUX
y+IUlK7krsHR/XH+g7HecGSEJOXDAiA+/LS+4X5QdQ3jzYbVHXD1p3a4nAJoydyO
wDww3DMgqA==
-----END CERTIFICATE-----
`;
const KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1aLtCfGJ/ceNqY65
Jd0vTeUeU1LEnEn0xJNh3KENpJChRANCAAR8tWOcMwHVN6psuzu7o5s4QyUEWtZ8
Vc9d+khODEQC9+plS3obM4BEtUF2jNfdC1q7o/MiCQLEKlQAs7s7/fMt
-----END PRIVATE KEY-----
`;

const ruhig = () => {};

/** Startet einen Server auf 127.0.0.1:0 und räumt ihn samt offenen Sockets ab. */
async function mitServer(server, fn) {
    const offen = new Set();
    server.on('connection', s => { offen.add(s); s.on('close', () => offen.delete(s)); });
    server.on('secureConnection', s => { s.on('error', ruhig); });
    server.on('tlsClientError', ruhig);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
        return await fn(port);
    } finally {
        for (const s of offen) s.destroy();
        await new Promise(r => server.close(r));
    }
}

const tlsServer = (optionen = {}) => tls.createServer({ key: KEY, cert: CERT, ...optionen }, s => s.end());

// ─────────────────────────── TLS-Handshake ───────────────────────────

test('gültiges Zertifikat für den Host → reachable true, certValidForHost true', async () => {
    const r = await mitServer(tlsServer(), port => tlsProbe({
        host: 'pruef.karriaro.test', address: '127.0.0.1', port, timeoutMs: 3000, tlsOptions: { ca: CERT }
    }));
    assert.deepEqual(r, { reachable: true, certValidForHost: true, grund: null });
});

test('🚨 Zertifikat auf einen FREMDEN Host → erreichbar, aber certValidForHost false', async () => {
    // Derselbe Server, dieselbe vertrauenswürdige Kette — nur der Hostname passt nicht.
    // Das ist der Fall „SAN nur mail2.…" aus der geprüften Leadliste: Browser bricht ab.
    const r = await mitServer(tlsServer(), port => tlsProbe({
        host: 'fremd.karriaro.test', address: '127.0.0.1', port, timeoutMs: 3000, tlsOptions: { ca: CERT }
    }));
    assert.equal(r.reachable, true);
    assert.equal(r.certValidForHost, false);
    assert.match(r.grund, /ALTNAME|altname|Hostname/i);
});

test('nicht vertrauenswürdige Kette (selbstsigniert) → certValidForHost false', async () => {
    const r = await mitServer(tlsServer(), port => tlsProbe({
        host: 'pruef.karriaro.test', address: '127.0.0.1', port, timeoutMs: 3000
    }));
    assert.equal(r.reachable, true);
    assert.equal(r.certValidForHost, false);
    assert.match(r.grund, /SELF_SIGNED|self.signed/i);
});

test('Klartext-HTTP auf dem TLS-Port → reachable false (Server hat aktiv geantwortet)', async () => {
    const server = net.createServer(s => {
        s.on('error', ruhig);
        s.once('data', () => s.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n'));
    });
    const r = await mitServer(server, port => tlsProbe({
        host: 'pruef.karriaro.test', address: '127.0.0.1', port, timeoutMs: 3000
    }));
    assert.equal(r.reachable, false, `Grund war ${r.grund}`);
    assert.equal(r.certValidForHost, null);
});

test('TLS-Alert im Handshake (Protokollversion abgelehnt) → reachable false', async () => {
    const r = await mitServer(tlsServer({ minVersion: 'TLSv1.3' }), port => tlsProbe({
        host: 'pruef.karriaro.test', address: '127.0.0.1', port, timeoutMs: 3000,
        tlsOptions: { ca: CERT, maxVersion: 'TLSv1.2' }
    }));
    assert.equal(r.reachable, false, `Grund war ${r.grund}`);
});

test('verweigerte Verbindung auf 443 → reachable false', async () => {
    const server = net.createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    await new Promise(r => server.close(r));
    const r = await tlsProbe({ host: 'pruef.karriaro.test', address: '127.0.0.1', port, timeoutMs: 3000 });
    assert.equal(r.reachable, false);
    assert.equal(r.grund, 'ECONNREFUSED');
});

test('🚨 stummer Server (Timeout) → reachable null, NIE false', async () => {
    const server = net.createServer(s => { s.on('error', ruhig); /* antwortet nie */ });
    const start = Date.now();
    const r = await mitServer(server, port => tlsProbe({
        host: 'pruef.karriaro.test', address: '127.0.0.1', port, timeoutMs: 200
    }));
    assert.deepEqual(r, { reachable: null, certValidForHost: null, grund: 'timeout' });
    assert.ok(Date.now() - start < 2000, 'Frist muss den Handshake beenden');
});

test('🚨 Server schließt mitten im Handshake → reachable null (Firewall/Rate-Limit, kein Beleg)', async () => {
    const server = net.createServer(s => { s.on('error', ruhig); s.once('data', () => s.destroy()); });
    const r = await mitServer(server, port => tlsProbe({
        host: 'pruef.karriaro.test', address: '127.0.0.1', port, timeoutMs: 3000
    }));
    assert.equal(r.reachable, null, `Grund war ${r.grund}`);
});

test('Fehler-Einordnung: nur aktive Antworten sind false, Netzfehler bleiben null', () => {
    assert.equal(klassifiziereTlsFehler({ code: 'ERR_SSL_UNEXPECTED_EOF_WHILE_READING', message: 'unexpected eof while reading' }), null);
    assert.equal(klassifiziereTlsFehler({ code: 'ECONNREFUSED' }), false);
    assert.equal(klassifiziereTlsFehler({ code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR', message: 'tlsv1 alert internal error' }), false);
    assert.equal(klassifiziereTlsFehler({ code: 'EPROTO', message: 'wrong version number' }), false);
    // Gegenproben: nicht gemessen
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ENOTFOUND']) {
        assert.equal(klassifiziereTlsFehler({ code, message: code }), null, code);
    }
    assert.equal(klassifiziereTlsFehler(null), null);
});

// ─────────────────────────── http → https ───────────────────────────

function antwort(status, { location, body = '' } = {}) {
    return { status, headers: new Headers(location ? { location } : {}), body: null, text: async () => body };
}

function fetchFolge(liste) {
    const aufrufe = [];
    const f = async (url, opts) => {
        aufrufe.push({ url, opts });
        const naechste = liste.shift();
        if (!naechste) throw new Error('unerwarteter Abruf');
        if (naechste instanceof Error) throw naechste;
        return naechste;
    };
    f.aufrufe = aufrufe;
    return f;
}

function resolverProtokoll(sperre = () => false) {
    const aufrufe = [];
    const f = async (host) => {
        aufrufe.push(host);
        if (sperre(host)) throw new Error(`SSRF blocked: ${host}`);
        return { address: '203.0.113.7', family: 4 };
    };
    f.aufrufe = aufrufe;
    return f;
}

test('http leitet direkt auf https weiter → true, Abruf manuell', async () => {
    const fetchImpl = fetchFolge([antwort(301, { location: 'https://beispiel.de/' })]);
    const r = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl, resolve: resolverProtokoll() });
    assert.equal(r.redirectsToHttps, true);
    assert.equal(fetchImpl.aufrufe.length, 1);
    assert.equal(fetchImpl.aufrufe[0].url, 'http://beispiel.de/');
    assert.equal(fetchImpl.aufrufe[0].opts.redirect, 'manual');
});

test('Kette http → http://www → https: jeder Hop wird SSRF-geprüft', async () => {
    const resolve = resolverProtokoll();
    const fetchImpl = fetchFolge([
        antwort(301, { location: 'http://www.beispiel.de/' }),
        antwort(302, { location: 'https://www.beispiel.de/start' })
    ]);
    const r = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl, resolve });
    assert.equal(r.redirectsToHttps, true);
    assert.deepEqual(resolve.aufrufe, ['beispiel.de', 'www.beispiel.de']);
});

test('🚨 http liefert 200 ohne Weiterleitung → false (Gegenprobe zur Weiterleitung)', async () => {
    const fetchImpl = fetchFolge([antwort(200, { body: '<html><body>Willkommen</body></html>' })]);
    const r = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl, resolve: resolverProtokoll() });
    assert.equal(r.redirectsToHttps, false);
});

test('Meta-Refresh auf https zählt als Weiterleitung (beide Attribut-Reihenfolgen, echter Body-Strom)', async () => {
    const a = await pruefeHttpWeiterleitung('beispiel.de', {
        resolve: resolverProtokoll(),
        fetchImpl: fetchFolge([new Response('<meta http-equiv="refresh" content="0; url=https://beispiel.de/">', { status: 200 })])
    });
    assert.equal(a.redirectsToHttps, true);
    const b = await pruefeHttpWeiterleitung('beispiel.de', {
        resolve: resolverProtokoll(),
        fetchImpl: fetchFolge([antwort(200, { body: "<meta content='3;URL=https://beispiel.de/' http-equiv='Refresh'>" })])
    });
    assert.equal(b.redirectsToHttps, true);
    // Gegenprobe: Meta-Refresh auf http ist keine Weiterleitung auf https
    const c = await pruefeHttpWeiterleitung('beispiel.de', {
        resolve: resolverProtokoll(),
        fetchImpl: fetchFolge([antwort(200, { body: '<meta http-equiv="refresh" content="0; url=http://beispiel.de/neu">' })])
    });
    assert.equal(c.redirectsToHttps, false);
});

test('Skript-Umleitung ist nicht messbar → null statt false', async () => {
    const fetchImpl = fetchFolge([antwort(200, { body: '<script>if(location.protocol!=="https:"){location.replace("https://beispiel.de")}</script>' })]);
    const r = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl, resolve: resolverProtokoll() });
    assert.equal(r.redirectsToHttps, null);
});

test('🚨 altes Analytics-Snippet (nur Protokoll-Abfrage) ist KEINE Skript-Umleitung → false bleibt messbar', async () => {
    // Steht auf vielen reinen http-Seiten; darf sie nicht auf „nicht gemessen" drücken.
    const ga = "<script>var ga=document.createElement('script');ga.src=('https:'==document.location.protocol?'https://ssl':'http://www')+'.google-analytics.com/ga.js';</script>";
    const r = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl: fetchFolge([antwort(200, { body: ga })]), resolve: resolverProtokoll() });
    assert.equal(r.redirectsToHttps, false);
    // Gegenprobe: Abfrage + Navigation per Verkettung → nicht messbar
    const umleitung = "<script>if(location.protocol!='https:'){location.href='https:'+window.location.href.substring(window.location.protocol.length)}</script>";
    const u = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl: fetchFolge([antwort(200, { body: umleitung })]), resolve: resolverProtokoll() });
    assert.equal(u.redirectsToHttps, null);
    // Gegenprobe: Protokoll direkt umschalten
    const direkt = '<script>window.location.protocol = "https:";</script>';
    const d = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl: fetchFolge([antwort(200, { body: direkt })]), resolve: resolverProtokoll() });
    assert.equal(d.redirectsToHttps, null);
});

test('🚨 abgebrochener Body auf 2xx → null (Meta-Refresh unbekannt), nie false', async () => {
    const abbruch = {
        status: 200,
        headers: new Headers(),
        body: { getReader: () => ({ read: async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); }, cancel: async () => {} }) }
    };
    const r = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl: fetchFolge([abbruch]), resolve: resolverProtokoll() });
    assert.equal(r.redirectsToHttps, null);
});

test('4xx/5xx, fehlende Location, zu viele Hops → null', async () => {
    const r403 = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl: fetchFolge([antwort(403)]), resolve: resolverProtokoll() });
    assert.equal(r403.redirectsToHttps, null);
    const ohneOrt = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl: fetchFolge([antwort(302)]), resolve: resolverProtokoll() });
    assert.equal(ohneOrt.redirectsToHttps, null);
    const kreis = fetchFolge([1, 2, 3, 4, 5].map(i => antwort(301, { location: `http://beispiel.de/${i}` })));
    const r = await pruefeHttpWeiterleitung('beispiel.de', { fetchImpl: kreis, resolve: resolverProtokoll() });
    assert.equal(r.redirectsToHttps, null);
    assert.equal(kreis.aufrufe.length, 4, 'höchstens Start + 3 Weiterleitungen');
});

test('🚨 Weiterleitung auf eine private Adresse wird vor dem Abruf gestoppt', async () => {
    const resolve = resolverProtokoll(h => h === '127.0.0.1');
    const fetchImpl = fetchFolge([antwort(301, { location: 'http://127.0.0.1/admin' })]);
    await assert.rejects(pruefeHttpWeiterleitung('beispiel.de', { fetchImpl, resolve }), /SSRF blocked/);
    assert.equal(fetchImpl.aufrufe.length, 1, 'der private Hop darf nie abgerufen werden');
});

// ─────────────────────────── Gesamtprüfung ───────────────────────────

function fakeTls(fehler) {
    return () => {
        const s = new EventEmitter();
        s.destroy = () => {};
        process.nextTick(() => s.emit('error', fehler));
        return s;
    };
}

test('Gesamtprüfung mit echtem TLS-Server: alles gemessen, alles positiv', async () => {
    const r = await mitServer(tlsServer(), port => pruefeHttps('pruef.karriaro.test', {
        resolve: async () => ({ address: '127.0.0.1', family: 4 }),
        tlsPort: port, tlsOptions: { ca: CERT }, tlsTimeoutMs: 3000,
        fetchImpl: fetchFolge([antwort(301, { location: 'https://pruef.karriaro.test/' })]),
        log: ruhig
    }));
    assert.deepEqual(r, { checked: true, reachable: true, certValidForHost: true, redirectsToHttps: true });
});

test('„nur http": TLS verweigert + http liefert 200 → gemessen negativ, Zertifikat null', async () => {
    const r = await pruefeHttps('beispiel.de', {
        resolve: async () => ({ address: '203.0.113.7', family: 4 }),
        tlsConnect: fakeTls(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
        fetchImpl: fetchFolge([antwort(200, { body: '<html></html>' })]),
        log: ruhig
    });
    assert.deepEqual(r, { checked: true, reachable: false, certValidForHost: null, redirectsToHttps: false });
});

test('🚨 Netzfehler auf beiden Wegen → checked false, alles null (nie „kein HTTPS")', async () => {
    const meldungen = [];
    const r = await pruefeHttps('beispiel.de', {
        resolve: async () => ({ address: '203.0.113.7', family: 4 }),
        tlsConnect: fakeTls(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
        fetchImpl: fetchFolge([Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })]),
        log: (m, k) => meldungen.push([m, k])
    });
    assert.deepEqual(r, { ...HTTPS_UNGEPRUEFT });
    assert.equal(meldungen.length, 2, 'beide nicht gemessenen Teile werden geloggt, nicht still verschluckt');
});

test('Host nicht prüfbar (SSRF-Sperre) → ungeprüft und geloggt; leerer Host fragt gar nicht erst', async () => {
    const meldungen = [];
    const r = await pruefeHttps('intern.local', {
        resolve: async () => { throw new Error('SSRF blocked: private'); },
        log: (m) => meldungen.push(m)
    });
    assert.deepEqual(r, { ...HTTPS_UNGEPRUEFT });
    assert.equal(meldungen.length, 1);

    let gefragt = false;
    const leer = await pruefeHttps('', { resolve: async () => { gefragt = true; }, log: ruhig });
    assert.deepEqual(leer, { ...HTTPS_UNGEPRUEFT });
    assert.equal(gefragt, false);
});
