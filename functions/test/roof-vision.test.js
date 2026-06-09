/**
 * Sprint 241 — Tests für die Dachdecker-Vision-Helfer (pure Logik).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseImage, normalizeAssessment, MAX_BYTES } = require('../lib/roof-vision.js');

// kleines gültiges Base64 (3 Bytes → "AAAA")
const TINY = 'AAAA';

// ── parseImage ────────────────────────────────────────────────────────────────

test('parseImage: Data-URL → mediaType + base64 getrennt', () => {
    const r = parseImage('data:image/jpeg;base64,' + TINY);
    assert.equal(r.mediaType, 'image/jpeg');
    assert.equal(r.base64, TINY);
    assert.equal(r.bytes, 3);
});

test('parseImage: rohes Base64 + mediaTypeHint', () => {
    const r = parseImage(TINY.repeat(8), 'image/png');
    assert.equal(r.mediaType, 'image/png');
});

test('parseImage: Whitespace/Newlines im Base64 werden entfernt', () => {
    const r = parseImage('data:image/webp;base64,' + 'AAAA\n  AAAA');
    assert.equal(r.base64, 'AAAAAAAA');
});

test('parseImage: unzulässiges Format wirft', () => {
    assert.throws(() => parseImage('data:image/gif;base64,' + TINY), /Format/i);
    assert.throws(() => parseImage(TINY.repeat(8), 'application/pdf'), /Format/i);
});

test('parseImage: leere/zu kurze Eingabe wirft', () => {
    assert.throws(() => parseImage(''), /Kein Bild/);
    assert.throws(() => parseImage('data:image/jpeg;base64,'), /Bilddaten|Kein Bild/);
});

test('parseImage: kaputtes Base64 wirft', () => {
    assert.throws(() => parseImage('data:image/jpeg;base64,@@@not-base64@@@'), /beschädigt/);
});

test('parseImage: über 2 MB wirft', () => {
    // Base64-Länge für >2MB: bytes*4/3. Erzeuge knapp drüber.
    const chars = Math.ceil((MAX_BYTES + 1024) * 4 / 3);
    const big = 'A'.repeat(chars - (chars % 4)); // Vielfaches von 4
    assert.throws(() => parseImage('data:image/jpeg;base64,' + big), /zu groß/);
});

// ── normalizeAssessment ───────────────────────────────────────────────────────

test('normalizeAssessment: gültige Antwort bleibt erhalten', () => {
    const a = normalizeAssessment({
        isRoof: true, imageQuality: 'gut', damageClass: 'erheblich', damageLabel: '⚠ Erheblich',
        title: 'Sturmschaden', observations: ['Lose Ziegel', 'Mooswuchs'], urgency: 'Zeitnah',
        recommendedActions: ['Begehung'], costOrientation: '5.000 – 9.000 €', confidence: 'mittel'
    });
    assert.equal(a.isRoof, true);
    assert.equal(a.damageClass, 'erheblich');
    assert.deepEqual(a.observations, ['Lose Ziegel', 'Mooswuchs']);
    assert.equal(a.confidence, 'mittel');
});

test('normalizeAssessment: unbekannte Enums werden geclampt', () => {
    const a = normalizeAssessment({ damageClass: 'apokalyptisch', confidence: 'sicher', imageQuality: 'super' });
    assert.equal(a.damageClass, 'mittel');
    assert.equal(a.confidence, 'mittel');
    assert.equal(a.imageQuality, 'ausreichend');
});

test('normalizeAssessment: isRoof nur bei explizitem false', () => {
    assert.equal(normalizeAssessment({}).isRoof, true);
    assert.equal(normalizeAssessment({ isRoof: false }).isRoof, false);
    assert.equal(normalizeAssessment({ isRoof: 'nope' }).isRoof, true);
});

test('normalizeAssessment: Listen begrenzt, Strings gekürzt, Nicht-Strings gefiltert', () => {
    const a = normalizeAssessment({
        observations: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 123, null],
        title: 'x'.repeat(300)
    });
    assert.equal(a.observations.length, 6);
    assert.ok(a.title.length <= 120);
});

test('normalizeAssessment: robust gegen null/undefined', () => {
    assert.doesNotThrow(() => normalizeAssessment(null));
    const a = normalizeAssessment(undefined);
    assert.equal(a.isRoof, true);
    assert.deepEqual(a.observations, []);
});
