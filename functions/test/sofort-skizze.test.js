"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const ss = require("../lib/sofort-skizze.js");

test("normalizeBranche: kanonische Keys, Synonyme, Unbekanntes → generic", () => {
    assert.equal(ss.normalizeBranche("dachdecker"), "dachdecker");
    assert.equal(ss.normalizeBranche("Makler"), "immobilien");
    assert.equal(ss.normalizeBranche("klempner"), "sanitaer");
    assert.equal(ss.normalizeBranche("Gastronomie"), "restaurant");
    assert.equal(ss.normalizeBranche("logistik"), "spedition");
    assert.equal(ss.normalizeBranche("salon"), "friseur");
    assert.equal(ss.normalizeBranche(""), "generic");
    assert.equal(ss.normalizeBranche("Tierarzt"), "generic");
});

test("pickWidget: liefert {key,name,tool} und Brief-Keys", () => {
    assert.deepEqual(ss.pickWidget("dachdecker"), { key: "bafa", name: "BAFA-Förderrechner", tool: "dachdecker" });
    assert.deepEqual(ss.pickWidget("sanitaer"), { key: "sanitaer", name: "Notfall-Anrückzeit", tool: "sanitaer" });
    assert.equal(ss.pickWidget("unbekannt").key, "generic");
});

test("extractBrandTokens: og:site_name + apple-touch-icon-Logo (NICHT og:image-Foto) + theme-color", () => {
    const html = `<html><head>
        <title>Egal | Slogan</title>
        <meta property="og:site_name" content="Mustermann GmbH">
        <meta property="og:image" content="/social-foto.jpg">
        <link rel="apple-touch-icon" href="/img/logo.png">
        <meta name="theme-color" content="#C2592E">
    </head><body>x</body></html>`;
    const b = ss.extractBrandTokens(html, "https://www.mustermann.de/start", "mustermann.de", "dachdecker");
    assert.equal(b.name, "Mustermann GmbH");
    assert.equal(b.logoUrl, "https://www.mustermann.de/img/logo.png");
    assert.ok(!/social-foto/.test(b.logoUrl), "og:image (Foto) darf NIE als Logo dienen");
    assert.equal(b.accent, "#C2592E");
    assert.equal(b.domain, "mustermann.de");
});

test("extractBrandTokens: Slogan-Titel → Name aus Domain, kein Foto als Logo (Hansgrohe-Fall)", () => {
    const html = `<html><head><title>Faucets for the bathroom, shower, and kitchen</title>
        <meta property="og:image" content="https://assets/woman-showering.jpg"></head><body>x</body></html>`;
    const b = ss.extractBrandTokens(html, "https://www.hansgrohe.com", "hansgrohe.com", "generic");
    assert.equal(b.name, "Hansgrohe", "langer Slogan-Titel darf NICHT der Markenname werden");
    assert.ok(!/woman-showering/.test(b.logoUrl || ""), "Social-Foto darf nicht Logo werden");
});

test("nameFromTitle: Domain-Kern-Segment bevorzugt, Slogan verworfen", () => {
    assert.equal(ss.nameFromTitle("Faucets for the bathroom | Hansgrohe", "hansgrohe.com"), "Hansgrohe");
    assert.equal(ss.nameFromTitle("Bäckerei Schmidt – Köln", "baeckerei-schmidt.de"), "Bäckerei Schmidt");
    assert.equal(ss.nameFromTitle("Faucets for the bathroom, shower, and kitchen", "hansgrohe.com"), null);
});

test("detectBranche: Keyword zuerst, dann Places-Typ, sonst generic", () => {
    assert.equal(ss.detectBranche("dachdecker-mueller.de", "", null), "dachdecker");
    assert.equal(ss.detectBranche("spedition-schwaben.de", "", null), "spedition");
    assert.equal(ss.detectBranche("x.de", "Wir sind Ihr Klempner und Installateur vor Ort", null), "sanitaer");
    assert.equal(ss.detectBranche("x.de", "", "real_estate_agency"), "immobilien");
    assert.equal(ss.detectBranche("x.de", "", "hair_salon"), "friseur");
    assert.equal(ss.detectBranche("x.de", "", "restaurant"), "restaurant");
    assert.equal(ss.detectBranche("hansgrohe.com", "Faucets for the bathroom", null), "generic");
    assert.equal(ss.detectBranche("randomshop.de", "", "grocery_store"), "generic");
});

test("extractBrandTokens: Title-Fallback + Logo-Fallback (favicons) + accent null", () => {
    const html = `<html><head><title>Bäckerei Schmidt – Köln</title></head><body>x</body></html>`;
    const b = ss.extractBrandTokens(html, "https://baeckerei-schmidt.de", "baeckerei-schmidt.de", "generic");
    assert.equal(b.name, "Bäckerei Schmidt");
    assert.match(b.logoUrl, /google\.com\/s2\/favicons/);
    assert.equal(b.accent, null);
});

test("extractBrandTokens: data:-Logo verworfen, Name aus Domain bei leerer HTML", () => {
    const b = ss.extractBrandTokens(null, "https://acme-bau.de", "acme-bau.de", "generic");
    assert.equal(b.name, "Acme Bau");
    assert.match(b.logoUrl, /favicons/);
    const b2 = ss.extractBrandTokens(`<head><link rel="icon" href="data:image/png;base64,AAAA"></head>`, "https://x.de", "x.de", "generic");
    assert.ok(!/^data:/.test(b2.logoUrl), "data:-URI darf nicht durchrutschen");
});

test("isHexColor: nur valide Hex-Farben", () => {
    assert.ok(ss.isHexColor("#abc"));
    assert.ok(ss.isHexColor("#A1B2C3"));
    assert.ok(!ss.isHexColor("rgb(1,2,3)"));
    assert.ok(!ss.isHexColor("blue"));
    assert.ok(!ss.isHexColor("#12"));
});

test("scrubSuperlatives: UWG — Superlative/Absolut-Claims entschärft", () => {
    const out = ss.scrubSuperlatives("Wir sind die beste Nr. 1 und garantiert Marktführer — 100% zufrieden.");
    assert.ok(!/beste/i.test(out), "‚beste' muss raus");
    assert.ok(!/nr\.?\s*1/i.test(out), "‚Nr. 1' muss raus");
    assert.ok(!/garantiert/i.test(out), "‚garantiert' muss raus");
    assert.ok(!/marktführer/i.test(out), "‚Marktführer' muss raus");
});

test("scrubSuperlatives: erweiterte Begriffe (perfekt/höchste/optimal/maximal/24-7/hundert Prozent/Branchenführer)", () => {
    const out = ss.scrubSuperlatives("Perfekt, höchste Qualität, optimale & maximale Leistung, rund um die Uhr, zu hundert Prozent — der Branchenführer.");
    assert.ok(!/\bperfekt/i.test(out), "perfekt raus");
    assert.ok(!/höchste/i.test(out), "höchste raus");
    assert.ok(!/optimal/i.test(out), "optimal raus");
    assert.ok(!/maximal/i.test(out), "maximal raus");
    assert.ok(!/rund um die uhr/i.test(out), "rund um die uhr raus");
    assert.ok(!/hundert prozent/i.test(out), "hundert Prozent raus");
    assert.ok(!/führer/i.test(out), "Branchenführer raus");
    // ‚jederzeit' und ‚24/7'
    assert.ok(!/jederzeit/i.test(ss.scrubSuperlatives("jederzeit erreichbar")), "jederzeit raus");
    assert.ok(!/24\s*\/\s*7/.test(ss.scrubSuperlatives("24/7 für Sie da")), "24/7 raus");
});

test("composeFallbackCopy: immobilien-geoHook ist möglichkeits-gerahmt (kein ‚erhöhen'-Versprechen)", () => {
    const brand = { name: "Makler X", domain: "makler-x.de", logoUrl: null, accent: null };
    const c = ss.composeFallbackCopy(brand, "immobilien", ss.pickWidget("immobilien"), "", { topLeak: null, score: null });
    assert.ok(/können|kann|lässt sich/i.test(c.geoHook), "Möglichkeit gerahmt");
    assert.ok(!/garantiert/i.test(c.geoHook));
});

test("deriveAudit: topLeak gesetzt, echtes LCP-Finding high, sortiert, ≤7", () => {
    const payload = {
        techAge: { severity: 4, headline: "Veraltete Technologie + lange nicht aktualisiert", composite: "x" },
        bfsg: { complianceScore: 40, risk: "hoch", pitchArg: "Barrierefreiheit lückenhaft" },
        performance: { score: 28, lcpMs: 4200, cls: 0.2 },
        branch: {
            mustHave: [{ label: "Telefon prominent", found: false }],
            shouldHave: [{ label: "Online-Anfrage-Formular", found: false }]
        },
        painPoints: {
            mobileViewport: { ok: false, label: "Nicht für Mobilgeräte optimiert" },
            spaArchitecture: { ok: true },
            securityHeaders: { ok: false, label: "Sicherheits-Header fehlen" },
            contentFreshness: { ok: true }, vendorLockin: { ok: true }, socialMeta: { ok: true }
        },
        seoGeo: { seo: { flags: { hasLocalBusiness: false }, items: [{ ok: false, label: "Title fehlt" }] } }
    };
    const { topLeak, findings } = ss.deriveAudit(payload);
    assert.ok(topLeak, "topLeak muss gesetzt sein");
    assert.ok(findings.length > 0 && findings.length <= 7, "max 7 findings");
    const lcp = findings.find((f) => /LCP/.test(f.label));
    assert.ok(lcp && lcp.severity === "high", "LCP 4,2 s muss als high erscheinen");
    assert.match(lcp.label, /4,2 s/, "LCP im DE-Format");
    // High vor Medium vor Low
    const sev = findings.map((f) => f.severity);
    const idxFirstMed = sev.indexOf("medium");
    if (idxFirstMed > -1) assert.ok(!sev.slice(idxFirstMed).includes("high"), "kein high nach erstem medium");
});

test("deriveAudit: leeres/fehlendes Payload → keine Befunde, kein topLeak", () => {
    assert.deepEqual(ss.deriveAudit(null), { topLeak: null, findings: [] });
    const empty = ss.deriveAudit({});
    assert.equal(empty.topLeak, null);
    assert.equal(empty.findings.length, 0);
});

test("parseCopyResult: tool_use-Payload → 6 Felder, gescrubbt; Fehlerfälle werfen", () => {
    const data = {
        content: [{
            type: "tool_use", name: "skizze",
            input: {
                found: "Auf der Seite erkannt: Dachdeckerei mit Notdienst.",
                eyebrow: "Dachdecker · Köln",
                headline: "Die beste Nr. 1 für Dächer",
                subline: "Vom Sturmschaden bis zur neuen Eindeckung.",
                widgetPitch: "Der BAFA-Rechner schätzt Ihre Förderung.",
                geoHook: "Strukturierte Inhalte können die Auffindbarkeit verbessern."
            }
        }]
    };
    const c = ss.parseCopyResult(data);
    assert.ok(!/beste|nr\.?\s*1/i.test(c.headline), "Headline UWG-gescrubbt");
    for (const k of ["found", "eyebrow", "headline", "subline", "widgetPitch", "geoHook"]) {
        assert.ok(c[k] && c[k].length, "Feld vorhanden: " + k);
    }
    assert.throws(() => ss.parseCopyResult({ content: [] }), /tool_use/);
    assert.throws(() => ss.parseCopyResult({ content: [{ type: "tool_use", name: "skizze", input: { found: "", eyebrow: "x", headline: "x", subline: "x", widgetPitch: "x", geoHook: "x" } }] }), /leeres Feld/);
});

test("composeFallbackCopy: alle 6 Felder, UWG-sicher, branche-aware", () => {
    const brand = { name: "Müller Sanitär", domain: "mueller-sanitaer.de", logoUrl: null, accent: null };
    const widget = ss.pickWidget("sanitaer");
    const c = ss.composeFallbackCopy(brand, "sanitaer", widget, "mehr Notdienst-Anfragen", { topLeak: "Telefon nicht prominent", score: 41 });
    for (const k of ["found", "eyebrow", "headline", "subline", "widgetPitch", "geoHook"]) {
        assert.ok(c[k] && c[k].length, "Feld vorhanden: " + k);
        assert.ok(!/\b(beste|nr\.?\s*1|garantiert|marktführer)\b/i.test(c[k]), "UWG: " + k);
    }
});
