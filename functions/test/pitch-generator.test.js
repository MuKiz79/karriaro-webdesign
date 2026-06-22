"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const pg = require("../lib/pitch-generator.js");

test("pitchSlug: ASCII-Umlaut-Transliteration + kurzer Slug", () => {
    assert.equal(pg.pitchSlug("Avenius Immobilien"), "avenius-immobilien");
    assert.equal(pg.pitchSlug("Bäckerei Müller & Söhne"), "baeckerei-mueller-soehne");
    assert.equal(pg.pitchSlug("  Trattoria  Bella!! Vista  "), "trattoria-bella-vista");
    assert.equal(pg.pitchSlug(""), "pitch");
});

test("pitchId: deterministisch (gleicher Name+Site → gleiche ID), Slug + 6-Hex", () => {
    const a = pg.pitchId("Avenius Immobilien", "https://stuttgart-wohnungssuche.de");
    const b = pg.pitchId("Avenius Immobilien", "https://stuttgart-wohnungssuche.de");
    assert.equal(a, b);
    assert.match(a, /^avenius-immobilien-[a-f0-9]{6}$/);
    // andere Website → andere ID
    assert.notEqual(a, pg.pitchId("Avenius Immobilien", "https://andere.de"));
});

test("sanitizePitchHtml: entfernt <script> und on*-Handler, behält Inhalt", () => {
    const raw = `<!doctype html><html><head><title>x</title></head><body>
        <h1 onclick="alert(1)">Hallo</h1><script>steal()</script><p>Text ${"y".repeat(400)}</p></body></html>`;
    const out = pg.sanitizePitchHtml(raw);
    assert.ok(out, "sollte Ergebnis liefern");
    assert.ok(!/<script/i.test(out), "kein <script>");
    assert.ok(!/onclick/i.test(out), "kein onclick");
    assert.ok(/Hallo/.test(out), "sichtbarer Inhalt bleibt");
});

test("sanitizePitchHtml: Google-Fonts-<link> bleibt, fremde <link> fliegen raus", () => {
    const raw = `<!doctype html><html><head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces">
        <link rel="stylesheet" href="https://evil.example/x.css">
        </head><body><p>${"z".repeat(400)}</p></body></html>`;
    const out = pg.sanitizePitchHtml(raw);
    assert.ok(/fonts\.googleapis\.com/.test(out), "Google-Fonts erlaubt");
    assert.ok(!/evil\.example/.test(out), "fremder Stylesheet-Link entfernt");
});

test("sanitizePitchHtml: garantiert robots-noindex + viewport, auch wenn das Modell sie wegließ", () => {
    const raw = `<!doctype html><html><head><title>x</title></head><body><p>${"w".repeat(400)}</p></body></html>`;
    const out = pg.sanitizePitchHtml(raw);
    assert.match(out, /name=["']robots["'][^>]*noindex/i);
    assert.match(out, /name=["']viewport["']/i);
});

test("sanitizePitchHtml: Müll/zu kurz → null", () => {
    assert.equal(pg.sanitizePitchHtml("kein html"), null);
    assert.equal(pg.sanitizePitchHtml(""), null);
    assert.equal(pg.sanitizePitchHtml(null), null);
});

test("buildPitchUserMessage: echte Fakten drin, Preis-Rahmen exakt", () => {
    const msg = pg.buildPitchUserMessage({
        name: "Avenius Immobilien", brancheLabel: "Immobilienmakler",
        rating: 4.8, reviewCount: 1600, city: "Stuttgart",
        services: ["Verkauf", "Vermietung"], priceFrom: "ab 2.990 €"
    });
    assert.match(msg, /Avenius Immobilien/);
    assert.match(msg, /Immobilienmakler/);
    assert.match(msg, /4\.8 von 5 aus 1600 Bewertungen/);
    assert.match(msg, /Verkauf, Vermietung/);
    assert.match(msg, /ab 2\.990 €/);
});

test("buildPitchUserMessage: ohne Bewertung keine erfundene Bewertungs-Zeile", () => {
    const msg = pg.buildPitchUserMessage({ name: "Test GmbH", brancheLabel: "Handwerk" });
    assert.ok(!/Bewertung/.test(msg), "keine Bewertungs-Zeile ohne rating");
});

test("PITCH_CSP: kein script-src → Skripte blockiert; Fonts/Bilder erlaubt", () => {
    assert.match(pg.PITCH_CSP, /default-src 'none'/);
    assert.ok(!/script-src/.test(pg.PITCH_CSP), "kein script-src → default-src 'none' blockt Skripte");
    assert.match(pg.PITCH_CSP, /fonts\.gstatic\.com/);
    assert.match(pg.PITCH_CSP, /img-src https: data:/);
});
