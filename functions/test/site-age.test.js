/**
 * Website-Alter (F17) — lib/site-age.js, pure Anteile.
 * Die Fetch-Pfade sind bewusst dünn (kurze Timeouts, jede Quelle dreiwertig);
 * getestet wird die Ableitung, die aus den Quellen ein Urteil macht.
 */
const test = require('node:test');
const assert = require('node:assert');
const { bewerteRelaunch } = require('../lib/site-age.js');

test('CMS-Wechsel im Fenster ⇒ Relaunch-Verdacht', () => {
    assert.equal(bewerteRelaunch('WordPress', 'Squarespace'), true);
});

test('gleiches CMS ⇒ kein Verdacht (Redesign im selben Baukasten bleibt unsichtbar — dokumentierte Grenze)', () => {
    assert.equal(bewerteRelaunch('Squarespace', 'Squarespace'), false);
});

test('eine Seite unbekannt ⇒ null — nie aus einer Lücke ein Urteil machen', () => {
    assert.equal(bewerteRelaunch(null, 'Squarespace'), null);
    assert.equal(bewerteRelaunch('WordPress', null), null);
    assert.equal(bewerteRelaunch(null, null), null);
});
