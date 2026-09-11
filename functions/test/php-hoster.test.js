/**
 * PHP-Version (Header) und Hoster (DNS) — lib/php-hoster.js, V6 php/hoster.
 * Stichtage an php.net geprüft (supported-versions.php + eol.php, 2026-09-10).
 * Resolver injiziert, kein echtes Netz.
 */
const test = require('node:test');
const assert = require('node:assert');
const {
    bewertePhpAusHeadern, bewerteHoster, ermittleHoster, domainKandidaten, PHP_EOL
} = require('../lib/php-hoster.js');

const HEUTE = new Date('2026-09-10T08:00:00Z');
const php = (wert, heute = HEUTE) => bewertePhpAusHeadern({ 'x-powered-by': wert }, { heute });

// ─────────────────────────── PHP ───────────────────────────

test('Eichanker: Stichtage entsprechen php.net', () => {
    assert.equal(PHP_EOL['7.4'], '2022-11-28');
    assert.equal(PHP_EOL['8.0'], '2023-11-26');
    assert.equal(PHP_EOL['8.1'], '2025-12-31');
    assert.equal(PHP_EOL['8.2'], '2026-12-31');
    assert.equal(PHP_EOL['8.3'], '2027-12-31');
    assert.equal(PHP_EOL['8.4'], '2028-12-31');
});

test('PHP 7.4 / 8.0 / 8.1 sind am 10.09.2026 ohne Sicherheitsupdates', () => {
    assert.deepEqual(php('PHP/7.4.33'), { version: '7.4.33', eol: true, eolDatum: '2022-11-28' });
    assert.deepEqual(php('PHP/8.0.30'), { version: '8.0.30', eol: true, eolDatum: '2023-11-26' });
    assert.deepEqual(php('PHP/8.1.31'), { version: '8.1.31', eol: true, eolDatum: '2025-12-31' });
});

test('🚨 Gegenprobe: 8.2 / 8.3 / 8.4 / 8.5 sind am 10.09.2026 NICHT abgelaufen', () => {
    assert.deepEqual(php('PHP/8.2.20'), { version: '8.2.20', eol: false, eolDatum: '2026-12-31' });
    assert.deepEqual(php('PHP/8.3.12'), { version: '8.3.12', eol: false, eolDatum: '2027-12-31' });
    assert.deepEqual(php('PHP/8.4.1'), { version: '8.4.1', eol: false, eolDatum: '2028-12-31' });
    assert.deepEqual(php('PHP/8.5.0'), { version: '8.5.0', eol: false, eolDatum: '2029-12-31' });
});

test('Stichtag-Grenze: 8.2 am 31.12.2026 noch unterstützt, am 01.01.2027 nicht mehr', () => {
    assert.equal(php('PHP/8.2.28', new Date('2026-12-31T12:00:00Z')).eol, false);
    assert.equal(php('PHP/8.2.28', new Date('2027-01-01T12:00:00Z')).eol, true);
});

test('Version ohne Patch-Stelle; älter als die Tabelle → eol ohne erfundenes Datum; neuer → nicht bewertet', () => {
    assert.deepEqual(php('PHP/7.3'), { version: '7.3', eol: true, eolDatum: '2021-12-06' });
    assert.deepEqual(php('PHP/5.1.6'), { version: '5.1.6', eol: true, eolDatum: null });
    assert.deepEqual(php('PHP/9.0.0'), { version: '9.0.0', eol: null, eolDatum: null });
});

test('🚨 Distributions-Paket (Sicherheits-Backports) → Version ja, Bewertung null', () => {
    assert.deepEqual(php('PHP/8.1.2-1ubuntu2.14'), { version: '8.1.2', eol: null, eolDatum: null });
    assert.deepEqual(php('PHP/7.4.33-1+deb11u5'), { version: '7.4.33', eol: null, eolDatum: null });
});

test('Server-Header als Rückfall, X-Powered-By hat Vorrang, Headers-Instanz und Mehrfachwert', () => {
    const nurServer = bewertePhpAusHeadern({ server: 'Apache/2.4.62 PHP/7.3.33' }, { heute: HEUTE });
    assert.equal(nurServer.version, '7.3.33');
    const beide = bewertePhpAusHeadern({ 'x-powered-by': 'PHP/8.3.1', server: 'Apache PHP/7.2.1' }, { heute: HEUTE });
    assert.equal(beide.version, '8.3.1');
    const inst = bewertePhpAusHeadern(new Headers({ 'X-Powered-By': 'PleskLin, PHP/7.4.33' }), { heute: HEUTE });
    assert.equal(inst.version, '7.4.33');
    assert.equal(inst.eol, true);
});

test('🚨 Gegenproben: kein PHP-Beleg → alles null, nie geraten', () => {
    const leer = { version: null, eol: null, eolDatum: null };
    assert.deepEqual(php('ASP.NET'), leer);
    assert.deepEqual(php('Express'), leer);
    assert.deepEqual(php('PleskLin'), leer);
    assert.deepEqual(php('XPHP/7.4.33'), leer);
    assert.deepEqual(bewertePhpAusHeadern({ server: 'nginx' }, { heute: HEUTE }), leer);
    assert.deepEqual(bewertePhpAusHeadern({}, { heute: HEUTE }), leer);
    assert.deepEqual(bewertePhpAusHeadern(null), leer);
    assert.deepEqual(bewertePhpAusHeadern(undefined), leer);
});

// ─────────────────────────── Hoster ───────────────────────────

function dnsFehler(code) {
    return Object.assign(new Error(code), { code });
}

/** tabelle: { 'beispiel.de': { mx:[…]|Error, ns:[…]|Error } } — fehlend = ENODATA. */
function resolverAus(tabelle) {
    const aufrufe = [];
    const antwort = (art, name) => {
        aufrufe.push([art, name]);
        const eintrag = tabelle[name] && tabelle[name][art];
        if (eintrag instanceof Error) throw eintrag;
        if (eintrag === undefined) throw dnsFehler('ENODATA');
        return eintrag;
    };
    return {
        aufrufe,
        resolveMx: async name => antwort('mx', name),
        resolveNs: async name => antwort('ns', name)
    };
}

const mx = (...namen) => namen.map((exchange, i) => ({ exchange, priority: 10 + i }));
const ruhig = () => {};

test('Strato über MX *.rzone.de', async () => {
    const resolver = resolverAus({ 'beispiel.de': { mx: mx('smtpin.rzone.de'), ns: ['ns1.cloudflare.com', 'ns2.cloudflare.com'] } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver, log: ruhig }), { name: 'strato', quelle: 'mx' });
});

test('Strato über NS *.rzone.de (Mail woanders)', async () => {
    const resolver = resolverAus({ 'beispiel.de': { mx: mx('aspmx.l.google.com'), ns: ['docks07.rzone.de', 'shades12.rzone.de'] } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver, log: ruhig }), { name: 'strato', quelle: 'ns' });
});

test('IONOS über NS *.ui-dns.* bzw. MX *.ionos.de / *.kundenserver.de', async () => {
    const ns = resolverAus({ 'beispiel.de': { ns: ['ns1045.ui-dns.de', 'ns1102.ui-dns.com', 'ns1089.ui-dns.org', 'ns1109.ui-dns.biz'] } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver: ns, log: ruhig }), { name: 'ionos', quelle: 'ns' });
    const mxIonos = resolverAus({ 'beispiel.de': { mx: mx('mx00.ionos.de', 'mx01.ionos.de') } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver: mxIonos, log: ruhig }), { name: 'ionos', quelle: 'mx' });
    const mxKs = resolverAus({ 'beispiel.de': { mx: mx('mx00.kundenserver.de.') } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver: mxKs, log: ruhig }), { name: 'ionos', quelle: 'mx' });
});

test('🚨 ui-dns-Nameserver mit Strato-Namen sind NICHT ionos (gemessen: strato.de, 2026-09-10)', async () => {
    // Echte Einträge von strato.de: MX bei Google, NS auf IONOS-Infrastruktur.
    const strato = resolverAus({ 'strato.de': {
        mx: mx('smtp.google.com'),
        ns: ['ns-strato.ui-dns.de.', 'ns-strato.ui-dns.biz.', 'ns-strato.ui-dns.org.', 'ns-strato.ui-dns.com.']
    } });
    assert.deepEqual(await ermittleHoster('strato.de', { resolver: strato, log: ruhig }), { name: 'strato', quelle: 'ns' });
    // Gegenprobe mit den echten Einträgen von ionos.de
    const ionos = resolverAus({ 'ionos.de': {
        mx: mx('mxint01.1and1.com.', 'mxint02.1and1.com.'),
        ns: ['ns-1and1.ui-dns.org.', 'ns-1and1.ui-dns.de.', 'ns-1and1.ui-dns.biz.', 'ns-1and1.ui-dns.com.']
    } });
    assert.deepEqual(await ermittleHoster('ionos.de', { resolver: ionos, log: ruhig }), { name: 'ionos', quelle: 'ns' });
});

test('🚨 Gegenproben: ähnliche Namen sind KEIN Beleg', async () => {
    for (const name of ['mx.evilrzone.de', 'rzone.de.fremd.com', 'mail.ionos.de.example.org', 'mx.kundenserver.dex']) {
        const resolver = resolverAus({ 'beispiel.de': { mx: mx(name) } });
        assert.deepEqual(await ermittleHoster('beispiel.de', { resolver, log: ruhig }), { name: null, quelle: null }, name);
    }
    const nsFalsch = resolverAus({ 'beispiel.de': { ns: ['ns1.ui-dnsx.de', 'ui-dns.de.fremd.net'] } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver: nsFalsch, log: ruhig }), { name: null, quelle: null });
    const fremd = resolverAus({ 'beispiel.de': { mx: mx('aspmx.l.google.com'), ns: ['ns1.cloudflare.com'] } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver: fremd, log: ruhig }), { name: null, quelle: null });
});

test('MX und NS widersprechen sich → null und geloggt; stimmen sie überein → NS', async () => {
    const meldungen = [];
    const konflikt = resolverAus({ 'beispiel.de': { mx: mx('smtpin.rzone.de'), ns: ['ns1045.ui-dns.de'] } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver: konflikt, log: m => meldungen.push(m) }), { name: null, quelle: null });
    assert.equal(meldungen.length, 1);
    const einig = resolverAus({ 'beispiel.de': { mx: mx('smtpin.rzone.de'), ns: ['docks07.rzone.de'] } });
    assert.deepEqual(await ermittleHoster('beispiel.de', { resolver: einig, log: ruhig }), { name: 'strato', quelle: 'ns' });
    assert.deepEqual(bewerteHoster(mx('smtpin.rzone.de', 'mx00.ionos.de'), []), { name: null, quelle: null, konflikt: false });
});

test('www. wird entfernt, Subdomain ohne Einträge fällt auf die Basis-Domain zurück', async () => {
    const resolver = resolverAus({ 'beispiel.de': { mx: mx('smtpin.rzone.de') } });
    assert.deepEqual(await ermittleHoster('www.beispiel.de', { resolver, log: ruhig }), { name: 'strato', quelle: 'mx' });
    assert.equal(resolver.aufrufe[0][1], 'beispiel.de');

    const sub = resolverAus({ 'shop.beispiel.de': { mx: dnsFehler('ENOTFOUND'), ns: dnsFehler('ENOTFOUND') }, 'beispiel.de': { ns: ['ns1045.ui-dns.de'] } });
    assert.deepEqual(await ermittleHoster('shop.beispiel.de', { resolver: sub, log: ruhig }), { name: 'ionos', quelle: 'ns' });
    assert.deepEqual(domainKandidaten('a.b.beispiel.de'), ['a.b.beispiel.de', 'b.beispiel.de', 'beispiel.de']);
});

test('🚨 DNS-Fehler (Timeout/SERVFAIL) → null und KEIN Rückfall auf die Eltern-Domain', async () => {
    const meldungen = [];
    const resolver = resolverAus({ 'shop.beispiel.de': { mx: dnsFehler('ETIMEOUT'), ns: ['ns.anbieter.net'] }, 'beispiel.de': { mx: mx('smtpin.rzone.de') } });
    assert.deepEqual(await ermittleHoster('shop.beispiel.de', { resolver, log: m => meldungen.push(m) }), { name: null, quelle: null });
    assert.ok(resolver.aufrufe.every(([, name]) => name === 'shop.beispiel.de'), 'ein Fehler ist kein „keine Einträge"');
    assert.equal(meldungen.length, 1);
});

test('hängender Resolver → null nach der Frist', async () => {
    const haengt = { resolveMx: () => new Promise(() => {}), resolveNs: () => new Promise(() => {}) };
    const start = Date.now();
    const meldungen = [];
    const r = await ermittleHoster('beispiel.de', { resolver: haengt, timeoutMs: 60, log: m => meldungen.push(m) });
    assert.deepEqual(r, { name: null, quelle: null });
    assert.ok(Date.now() - start < 1000);
    assert.equal(meldungen.length, 1);
});

test('IP-Adresse oder leerer Host → keine DNS-Anfrage', async () => {
    const resolver = resolverAus({});
    assert.deepEqual(await ermittleHoster('203.0.113.7', { resolver, log: ruhig }), { name: null, quelle: null });
    assert.deepEqual(await ermittleHoster('', { resolver, log: ruhig }), { name: null, quelle: null });
    assert.equal(resolver.aufrufe.length, 0);
});
