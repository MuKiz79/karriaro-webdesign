/**
 * BFSG-Betroffenheit — lib/bfsg-scope.js
 *
 * Die Asymmetrie ist der Kern: „wahrscheinlich nicht erfasst" darf das Modul
 * sagen, „pflichtig" NIE. Beschäftigtenzahl und Umsatz (§ 3 Abs. 3 BFSG) stehen
 * in keinem Quelltext — der stärkste mögliche Befund ist `moeglich`.
 */
const test = require('node:test');
const assert = require('node:assert');
const { bfsgPflichtLage } = require('../lib/bfsg-scope.js');

const VISITENKARTE = `<!doctype html><html lang="de"><head><title>Elektro Meier</title></head>
<body><h1>Elektro Meier GmbH</h1><p>Wir sind Ihr Partner für Elektroinstallation.</p>
<a href="/kontakt">Kontakt aufnehmen</a><a href="tel:+4971112345">Anrufen</a>
<form><label>Ihre Nachricht</label><textarea></textarea><button>Anfrage senden</button></form>
</body></html>`;

test('Visitenkarten-Seite mit Kontaktformular: wahrscheinlich NICHT erfasst', () => {
    const r = bfsgPflichtLage({ html: VISITENKARTE });
    assert.equal(r.lage, 'ausgenommen_wahrscheinlich');
    assert.equal(r.vertragsschluss, false);
    assert.deepEqual(r.belege, []);
});

test('„Anfrage senden" / „Kontakt aufnehmen" sind ANBAHNUNG, kein Abschluss', () => {
    // Sonst wäre jede Handwerkerseite mit Formular „möglicherweise pflichtig" —
    // genau der Fehlalarm, den dieses Modul verhindern soll.
    const r = bfsgPflichtLage({ html: '<html><body><button>Anfrage senden</button><a>Rückruf vereinbaren</a></body></html>' });
    assert.equal(r.lage, 'ausgenommen_wahrscheinlich');
});

test('Warenkorb im Quelltext: möglicherweise erfasst', () => {
    const r = bfsgPflichtLage({ html: '<html><body><a class="cart">In den Warenkorb</a></body></html>' });
    assert.equal(r.lage, 'moeglich');
    assert.equal(r.vertragsschluss, true);
    assert.ok(r.belege.includes('Warenkorb'));
});

test('Buchungs-Werkzeug ohne Wortmarker: Fund über paidToolKeys', () => {
    // Doctolib kündigt sich im Text oft nicht an — das Widget ist der Beleg.
    const r = bfsgPflichtLage({ html: VISITENKARTE, paidToolKeys: ['doctolib'] });
    assert.equal(r.lage, 'moeglich');
    assert.ok(r.belege.includes('Doctolib-Terminbuchung'));
});

test('Newsletter-Werkzeuge belegen KEINEN Vertragsschluss', () => {
    // mailchimp/brevo/whatsapp beweisen Budget (site-evidence.js), aber keinen
    // Verbrauchervertrag im elektronischen Geschäftsverkehr.
    const r = bfsgPflichtLage({ html: VISITENKARTE, paidToolKeys: ['mailchimp', 'brevo', 'whatsapp'] });
    assert.equal(r.lage, 'ausgenommen_wahrscheinlich');
});

test('nichts geprüft ist nicht „nichts gefunden"', () => {
    const r = bfsgPflichtLage({});
    assert.equal(r.lage, 'unbekannt');
    assert.equal(r.vertragsschluss, null);
});

test('das Modul sagt NIE „pflichtig" — auch bei erdrückender Beleglage nicht', () => {
    const r = bfsgPflichtLage({
        html: '<html><body>Shopware In den Warenkorb Zur Kasse "@type":"Product" Jetzt buchen</body></html>',
        paidToolKeys: ['shopify', 'woocommerce', 'doctolib', 'opentable']
    });
    assert.equal(r.lage, 'moeglich');
    assert.notEqual(r.lage, 'pflichtig');
    // Der Vorbehalt zur Betriebsgröße fährt IMMER mit — er ist der Grund, warum
    // aus „möglich" nie „pflichtig" werden kann.
    assert.match(r.vorbehalt, /Kleinstunternehmen/);
});

test('Belege werden entdoppelt (Shop-System + Warenkorb sind ein Shop)', () => {
    const r = bfsgPflichtLage({
        html: '<html><body>shopware In den Warenkorb warenkorb add-to-cart</body></html>'
    });
    assert.equal(new Set(r.belege).size, r.belege.length);
});

test('kein Rückgabewert enthält je eine Geldsumme', () => {
    // Regressions-Sperre: hier stand bis 2026-08-14 eine erfundene Bußgeld-Staffel.
    for (const fall of [{}, { html: VISITENKARTE }, { html: '<body>Zur Kasse</body>' }]) {
        const txt = JSON.stringify(bfsgPflichtLage(fall));
        assert.doesNotMatch(txt, /100\.000|50\.000|10\.000\s*€|Bußgeld|Bussgeld/);
    }
});
