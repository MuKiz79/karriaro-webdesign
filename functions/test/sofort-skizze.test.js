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
    // Lebensmittel-Handwerk ist KEINE Gastronomie → neutraler Anfrage-Assistent (generic)
    assert.equal(ss.normalizeBranche("Metzgerei"), "generic");
    assert.equal(ss.normalizeBranche("Bäckerei Schmidt"), "generic");
    assert.equal(ss.normalizeBranche("Konditorei"), "generic");
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

test("extractImages: og:image zuerst, absolut, Logos/Icons/SVG/Tiny gefiltert", () => {
    const html = `<html><head><meta property="og:image" content="/hero.jpg"></head><body>
        <img src="/logo.svg"><img src="/icon-mail.png"><img width="40" src="/tiny.png">
        <img src="https://cdn.x.de/bad-gross.jpg" width="1200">
        <img srcset="/s-300.jpg 300w, /s-1200.jpg 1200w" src="/s-300.jpg">
    </body></html>`;
    const imgs = ss.extractImages(html, "https://www.firma.de/start", "firma.de", 6);
    assert.equal(imgs[0], "https://www.firma.de/hero.jpg", "og:image zuerst, absolutiert");
    assert.ok(imgs.includes("https://cdn.x.de/bad-gross.jpg"), "großes Inhaltsbild dabei");
    assert.ok(imgs.includes("https://www.firma.de/s-1200.jpg"), "srcset-größtes gewählt");
    assert.ok(!imgs.some((u) => /logo|icon|tiny|\.svg/.test(u)), "Logos/Icons/SVG/Tiny gefiltert");
    assert.deepEqual(ss.extractImages(null, "https://x.de", "x.de", 6), []);
    // Dedupe: gleiches Bild mit anderer Query/Größen-Variante nur EINMAL
    const dup = `<body><img src="https://cdn.x.de/a/bild.jpg?w=400" width="800"><img src="https://cdn.x.de/a/bild.jpg?w=1200" width="800"></body>`;
    assert.equal(ss.extractImages(dup, "https://x.de", "x.de", 6).length, 1, "Query-Duplikat dedupliziert");
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
    // Lebensmittel-Handwerk wird NUR aus dem HOST abgeleitet (Domain-Identität):
    assert.equal(ss.detectBranche("metzgerei-mueller.de", "Wir beliefern auch die Gastronomie", null), "generic");
    assert.equal(ss.detectBranche("baeckerei-schmidt.de", "", null), "generic");
    // ASCII-Umlaut-Schreibweise „baecker" im Host muss ebenfalls greifen (Domains haben selten ä),
    // auch wenn der Text Gastronomie erwähnt:
    assert.equal(ss.detectBranche("baeckerei-mueller.de", "Wir beliefern auch die Gastronomie", null), "generic");
    // Regression: ein ECHTES Restaurant, dessen Text Lebensmittel-Wörter erwähnt, bleibt restaurant
    // (Overmatch-Schutz — der frühere text-basierte generic-Regelvorrang kippte solche Seiten).
    assert.equal(ss.detectBranche("restaurant-adler.de", "Frühstück mit Brot vom Bäcker und hausgemachter Konditorei", null), "restaurant");
    assert.equal(ss.detectBranche("gasthaus-hirsch.de", "Feinkost-Vorspeisen, Wein zum Gericht", null), "restaurant");
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

test("parseCopyResult: services (echte Leistungen) werden geparst, gekappt, gescrubbt", () => {
    const data = { content: [{ type: "tool_use", name: "skizze", input: {
        found: "x", eyebrow: "Dach · Köln", headline: "Dächer", subline: "y", widgetPitch: "z", geoHook: "kann helfen",
        services: ["Dachsanierung", "Steildach", "Flachdach", "Viertes weg"]
    } }] };
    const c = ss.parseCopyResult(data);
    assert.ok(Array.isArray(c.services) && c.services.length === 3, "max 3 Services");
    assert.deepEqual(c.services, ["Dachsanierung", "Steildach", "Flachdach"]);
    assert.equal(c.accent, undefined, "ohne accent-Feld kein accent");
    const cA = ss.parseCopyResult({ content: [{ type: "tool_use", name: "skizze", input: { found: "x", eyebrow: "a", headline: "b", subline: "c", widgetPitch: "d", geoHook: "e", accent: "#C2592E" } }] });
    assert.equal(cA.accent, "#C2592E", "valide Hex-Markenfarbe übernommen");
    const cB = ss.parseCopyResult({ content: [{ type: "tool_use", name: "skizze", input: { found: "x", eyebrow: "a", headline: "b", subline: "c", widgetPitch: "d", geoHook: "e", accent: "blau" } }] });
    assert.equal(cB.accent, undefined, "ungültige Farbe verworfen");
    // ohne services → leeres Array
    const c2 = ss.parseCopyResult({ content: [{ type: "tool_use", name: "skizze", input: { found: "x", eyebrow: "a", headline: "b", subline: "c", widgetPitch: "d", geoHook: "e" } }] });
    assert.deepEqual(c2.services, []);
});

test("extractPhone: tel-Link bevorzugt, sichtbare Nummer, sonst null", () => {
    assert.equal(ss.extractPhone('<a href="tel:+49 70173 12345">Anruf</a>'), "+49 70173 12345");
    assert.match(ss.extractPhone('<p>Telefon: 0711 / 123 456 78</p>') || '', /123/);
    assert.equal(ss.extractPhone('<p>kein telefon hier</p>'), null);
    assert.equal(ss.extractPhone(null), null);
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

// ── Stufe 2: Voll-generativer Konzept-Entwurf ───────────────────────────────
test("sanitizeGeneratedHtml: extrahiert das HTML-Dokument, entfernt Fences", () => {
    const longBody = "<p>" + "Editorialer Fliesstext zur Konzept-Skizze. ".repeat(8) + "</p>";
    const raw = "Hier ist die Seite:\n```html\n<!doctype html><html><head><style>body{color:red;font-family:Georgia,serif}</style></head><body><h1>Hallo Welt, das ist ein ausreichend langer Inhalt für die Mindestlaenge der Sanitizer-Pruefung.</h1>" + longBody + "</body></html>\n```";
    const h = ss.sanitizeGeneratedHtml(raw);
    assert.ok(h, "Ergebnis vorhanden");
    assert.ok(/^<!doctype html>/i.test(h), "beginnt mit doctype");
    assert.ok(/<\/html>$/i.test(h.trim()), "endet mit </html>");
    assert.ok(!/```/.test(h), "keine Markdown-Fences");
    assert.ok(/<style>/.test(h), "Inline-Style bleibt erhalten");
});

test("sanitizeGeneratedHtml: strippt script/iframe/on*-Handler/javascript:", () => {
    const pad = "<p>" + "Vertrauensvoller Editorial-Text fuer die Konzept-Skizze. ".repeat(8) + "</p>";
    const raw = '<!doctype html><html><body><h1>Eine ausreichend lange Ueberschrift fuer die Mindestlaenge der Pruefung im Sanitizer-Test.</h1>'
        + '<script>alert(1)<\/script><iframe src="x"></iframe>'
        + '<a href="javascript:evil()" onclick="steal()">x</a>'
        + '<img src="ok.jpg" onerror="hack()">' + pad + '</body></html>';
    const h = ss.sanitizeGeneratedHtml(raw);
    assert.ok(h, "Ergebnis vorhanden");
    assert.ok(!/<script/i.test(h), "kein <script>");
    assert.ok(!/<iframe/i.test(h), "kein <iframe>");
    assert.ok(!/onclick/i.test(h), "kein onclick");
    assert.ok(!/onerror/i.test(h), "kein onerror");
    assert.ok(!/javascript:/i.test(h), "kein javascript:-URI");
    assert.ok(/<img src="ok.jpg"/.test(h), "Bild bleibt (nur Handler weg)");
});

test("sanitizeGeneratedHtml: null bei leer/zu kurz/Nicht-String", () => {
    assert.equal(ss.sanitizeGeneratedHtml(null), null);
    assert.equal(ss.sanitizeGeneratedHtml(""), null);
    assert.equal(ss.sanitizeGeneratedHtml(42), null);
    assert.equal(ss.sanitizeGeneratedHtml("<html><body>zu kurz</body></html>"), null);
});

test("buildGenerativeUserMessage: enthält Marke, Branche, Ziel und nur die Bild-URLs", () => {
    const msg = ss.buildGenerativeUserMessage({
        name: "Dachprofi Köln", domain: "dachprofi-koeln.de", brancheLabel: "Dachdecker",
        accent: "#8a1f1f", services: ["Steildach", "Flachdach"], ziel: "mehr Anfragen",
        images: ["https://x.de/a.jpg", "https://x.de/b.jpg"]
    });
    assert.ok(/Dachprofi Köln/.test(msg), "Name");
    assert.ok(/Dachdecker/.test(msg), "Branche");
    assert.ok(/mehr Anfragen/.test(msg), "Ziel");
    assert.ok(/https:\/\/x\.de\/a\.jpg/.test(msg), "Bild-URL 1");
    assert.ok(/1\. https/.test(msg), "Bilder nummeriert");
});

test("GENERATIVE_SYS: verbietet Skripte/externe Ressourcen und Hansgrohe", () => {
    assert.ok(/<script>/i.test(ss.GENERATIVE_SYS) || /KEIN <script>/i.test(ss.GENERATIVE_SYS), "Skript-Verbot benannt");
    assert.ok(/Hansgrohe/i.test(ss.GENERATIVE_SYS), "Hansgrohe-Verbot benannt");
    assert.ok(/UWG/i.test(ss.GENERATIVE_SYS), "UWG benannt");
});

// ── scrubGeneratedHtml: UWG-Scrub auf sichtbarem Text, CSS/Attribute unangetastet ──
test("scrubGeneratedHtml: scrubt sichtbare Superlative, lässt CSS '100%' in Ruhe", () => {
    const html = '<!doctype html><html><head><style>.x{width:100%;max-width:100%}</style></head>'
        + '<body><h1>Wir sind die Nr. 1 und garantiert unschlagbar</h1>'
        + '<p>100% zufrieden oder Marktführer in der Region.</p>'
        + '<img src="https://x.de/garantiert-gut.jpg" alt="garantiert schön"></body></html>';
    const out = ss.scrubGeneratedHtml(html);
    // CSS unverändert (Layout darf NICHT brechen):
    assert.ok(/width:100%/.test(out), "CSS 100% bleibt");
    assert.ok(/max-width:100%/.test(out), "CSS max-width:100% bleibt");
    // sichtbare Superlative ersetzt:
    assert.ok(!/Nr\. 1/.test(out), "Nr. 1 ersetzt");
    assert.ok(!/\bgarantiert\b/i.test(out.replace(/garantiert-gut\.jpg|alt="[^"]*"/g, "")), "garantiert im Text ersetzt");
    assert.ok(!/unschlagbar/i.test(out), "unschlagbar ersetzt");
    assert.ok(!/Marktführer/i.test(out), "Marktführer ersetzt");
    assert.ok(!/100% zufrieden/i.test(out), "100% zufrieden ersetzt");
    // Bild-URL (Attribut) bleibt funktionsfähig — Scrub fasst nur Text zwischen Tags an:
    assert.ok(/src="https:\/\/x\.de\/garantiert-gut\.jpg"/.test(out), "Bild-URL unangetastet");
});

test("scrubGeneratedHtml: SEO-Garantien werden zu Möglichkeiten", () => {
    const html = '<!doctype html><html><body><p>Wir verbessert Ihr Google-Ranking und Sie wird sichtbar bei Google.</p>'
        + '<p>Ranking-Boost und Platz 1 bei Google inklusive.</p></body></html>';
    const out = ss.scrubGeneratedHtml(html);
    assert.ok(!/Ranking-Boost/i.test(out), "Ranking-Boost weg");
    assert.ok(!/Platz 1 bei Google/i.test(out), "Platz 1 bei Google weg");
    assert.ok(!/verbessert ihr google-ranking/i.test(out), "verbessert Ranking weg");
});

test("scrubGeneratedHtml: null/non-string passthrough", () => {
    assert.equal(ss.scrubGeneratedHtml(null), null);
    assert.equal(ss.scrubGeneratedHtml(undefined), undefined);
});
