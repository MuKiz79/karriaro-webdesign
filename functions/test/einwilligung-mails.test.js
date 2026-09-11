"use strict";
/**
 * 2026-09-10 — Tests für lib/einwilligung-mails.js: Bestätigungsmail (strikt
 * werbefrei), Hinweis-Mails 1–3 samt Pflichtbausteinen, Gründer-Mail, Seiten.
 * Die Werbewort-Prüfung hat eine Gegenprobe (sie MUSS bei Hinweis 3 anschlagen),
 * sonst wäre ihr Grün bei der Bestätigungsmail wertlos.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ew = require("../lib/einwilligung.js");
const m = require("../lib/einwilligung-mails.js");

const WEB = path.join(__dirname, "..", "..");
const TOKEN_A = ew.erzeugeToken();
const TOKEN_B = ew.erzeugeToken();
const ANGEFORDERT = Date.parse("2026-09-10T08:15:00Z");
const BESTAETIGT = Date.parse("2026-09-10T13:00:00Z");
const ABSENDER_TEILE = ["Karriaro Webdesign", "Muammer Kizilaslan", "Spitalstr. 7", "77761 Schiltach", "kontakt@karriaro.de"];

function sichtbar(html) {
    return html
        .replace(/<head[\s\S]*?<\/head>/i, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ");
}

const WERBEWORT = /(?<![\p{L}\d])(?:angebot\p{L}*|preis\p{L}*|festpreis\p{L}*|euro|entw(?:urf|ürf)\p{L}*|kostenfrei\p{L}*|kostenlos\p{L}*|gratis|rabatt\p{L}*|gespräch\p{L}*|termin\p{L}*|buchen|unikat\p{L}*|handcodiert\p{L}*|manufaktur|paket\p{L}*|exklusiv\p{L}*|vorteil\p{L}*|bewertung\p{L}*|empfehl\p{L}*)(?![\p{L}\d])|€/giu;
const werbeFunde = (text) => String(text).match(WERBEWORT) || [];

const ctx = (extra = {}) => ({
    domain: "beispiel.de",
    source: "sofort-skizze",
    createdAtMs: ANGEFORDERT,
    confirmedAtMs: BESTAETIGT,
    auditSlug: null,
    berichtVerfuegbar: false,
    unsubscribeToken: TOKEN_B,
    ...extra
});

// ─── Bestätigungsmail ───────────────────────────────────────────────────────

test("Bestätigungsmail: Einwilligungstext wörtlich, Link, Ignorieren-Hinweis, Absender — strikt werbefrei", () => {
    const mail = m.bestaetigungsMail({ domain: "beispiel.de", source: "website-pruefen", createdAtMs: ANGEFORDERT, confirmToken: TOKEN_A });
    assert.equal(mail.subject, "Bitte bestätigen Sie Ihre Einwilligung");
    assert.deepEqual(werbeFunde(mail.subject), []);
    assert.equal(mail.headers, undefined, "Bestätigungsmail ist keine Listen-Mail");
    for (const fassung of [mail.text, sichtbar(mail.html)]) {
        assert.ok(fassung.includes(ew.EINWILLIGUNG_TEXT), "V1 wörtlich");
        assert.ok(fassung.includes("Haben Sie das nicht angefordert, ignorieren Sie diese E-Mail – es passiert nichts."));
        assert.ok(fassung.includes(`https://karriaro-webdesign.de/einwilligung?t=${TOKEN_A}`));
        assert.ok(fassung.includes("10. September 2026"));
        assert.ok(fassung.includes("die Website-Prüfung auf karriaro-webdesign.de"));
        for (const teil of ABSENDER_TEILE) assert.ok(fassung.includes(teil), teil);
        const ohneEinwilligungstext = fassung.split(ew.EINWILLIGUNG_TEXT).join(" ");
        assert.deepEqual(werbeFunde(ohneEinwilligungstext), [], "Werbewort außerhalb des zitierten Wortlauts");
    }
    assert.match(mail.html, /<a href="https:\/\/karriaro-webdesign\.de\/datenschutz"[^>]*>Datenschutzerklärung<\/a>/);
});

test("Werbewort-Prüfung ist nicht blind: sie schlägt bei Hinweis 3 an, bei einer Bestätigungsbitte nicht", () => {
    assert.ok(werbeFunde(m.sequenzMail(3, ctx()).text).length >= 3);
    assert.ok(werbeFunde("Unser Festpreis ab 1.290 €").length >= 2);
    assert.deepEqual(werbeFunde("Bitte bestätigen Sie Ihre Einwilligung."), []);
});

// ─── Hinweis-Mails ──────────────────────────────────────────────────────────

test("Hinweis-Mails 1–3: Abmeldelink, Widerspruchshinweis getrennt, Herkunft, Absender, List-Unsubscribe", () => {
    const abmelde = `https://karriaro-webdesign.de/abmelden?t=${TOKEN_B}`;
    for (const schritt of [1, 2, 3]) {
        const mail = m.sequenzMail(schritt, ctx());
        assert.deepEqual(mail.headers, {
            "List-Unsubscribe": `<${abmelde}>, <mailto:kontakt@karriaro.de?subject=Abmelden>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        });
        assert.ok(mail.text.includes(abmelde), `Schritt ${schritt}: Abmeldelink im Text`);
        assert.ok(mail.html.includes(`href="${abmelde}"`), `Schritt ${schritt}: Abmeldelink im HTML`);
        const sicht = sichtbar(mail.html);
        assert.match(sicht, /Hier abmelden/);
        for (const fassung of [mail.text, sicht]) {
            assert.ok(fassung.includes("Ihr Widerspruchsrecht (Art. 21 DSGVO)"));
            assert.ok(fassung.includes("Sie haben am 10. September 2026 über die Sofort-Skizze auf karriaro-webdesign.de eingewilligt"));
            assert.ok(fassung.includes(`Dies ist E-Mail ${schritt} von 3.`));
            for (const teil of ABSENDER_TEILE) assert.ok(fassung.includes(teil), `${schritt}: ${teil}`);
        }
        assert.match(mail.html, /<div style="[^"]*border:1px solid[^"]*"><p[^>]*>Ihr Widerspruchsrecht \(Art\. 21 DSGVO\)<\/p>/, "eigener, umrandeter Block");
        assert.match(mail.text, /\n\nIhr Widerspruchsrecht \(Art\. 21 DSGVO\)\n/, "im Text durch Leerzeilen abgesetzt");
    }
});

test("Ohne Abmelde-Token, Datum oder bekannte Quelle wird keine Mail gebaut (EKONFIG)", () => {
    assert.throws(() => m.sequenzMail(1, ctx({ unsubscribeToken: null })), { code: "EKONFIG" });
    assert.throws(() => m.sequenzMail(1, ctx({ unsubscribeToken: "kurz" })), { code: "EKONFIG" });
    assert.throws(() => m.sequenzMail(2, ctx({ confirmedAtMs: null })), { code: "EKONFIG" });
    assert.throws(() => m.sequenzMail(2, ctx({ createdAtMs: undefined })), { code: "EKONFIG" });
    assert.throws(() => m.sequenzMail(3, ctx({ source: "linkedin" })), { code: "EKONFIG" });
    assert.throws(() => m.sequenzMail(4, ctx()), { code: "EKONFIG" });
    assert.throws(() => m.bestaetigungsMail({ source: "startseite", createdAtMs: ANGEFORDERT, confirmToken: "x" }), { code: "EKONFIG" });
    // Gegenprobe: vollständige Zutaten bauen
    assert.equal(typeof m.sequenzMail(1, ctx()).html, "string");
});

test("Hinweis 1: verfügbarer Bericht → Link; sonst drei allgemeine Hebel; keine Zahlen im Inhalt", () => {
    const mit = m.sequenzMail(1, ctx({ auditSlug: "abc123def4567890", berichtVerfuegbar: true }));
    assert.equal(mit.subject, "Was die Prüfung Ihrer Website zeigt");
    assert.ok(mit.text.includes("https://karriaro-webdesign.de/website-pruefen?slug=abc123def4567890"));
    const ohne = m.sequenzMail(1, ctx({ auditSlug: "abc123def4567890", berichtVerfuegbar: false }));
    assert.equal(ohne.text.includes("website-pruefen?slug="), false, "ein nicht verfügbarer Bericht wird nicht verlinkt");
    assert.equal(ohne.html.includes("website-pruefen?slug="), false);
    for (const mail of [mit, ohne]) {
        for (const hebel of ["Mobiles Tempo", "Klare Kontaktwege", "Auffindbarkeit in KI-Antworten"]) assert.ok(mail.text.includes(hebel), hebel);
        const inhalt = mail.text.split("———")[0].replace(/https?:\/\/\S+/g, "");
        assert.doesNotMatch(inhalt, /\d/, "Hinweis 1 behauptet keine Zahlen");
    }
});

test("Hinweis 2: Ablauf in vier Schritten + echte Google-Bewertung wörtlich aus src/data/reviews.json", () => {
    const mail = m.sequenzMail(2, ctx());
    assert.equal(mail.subject, "So entsteht Ihr Entwurf");
    const reviews = JSON.parse(fs.readFileSync(path.join(WEB, "src", "data", "reviews.json"), "utf8")).reviews;
    const echt = reviews.find((r) => r.author === m.GOOGLE_BEWERTUNG.autor);
    assert.ok(echt, "Bewertung muss in reviews.json stehen");
    assert.equal(m.GOOGLE_BEWERTUNG.text, echt.body);
    assert.equal(m.GOOGLE_BEWERTUNG.sterne, echt.rating);
    assert.equal(m.GOOGLE_BEWERTUNG.url, echt.url);
    assert.equal(m.GOOGLE_BEWERTUNG.plattform, echt.publisher);
    for (const fassung of [mail.text, sichtbar(mail.html)]) {
        assert.ok(fassung.includes(echt.body));
        assert.ok(fassung.includes(echt.author));
        for (const s of ["Gespräch", "Entwurf", "Entscheidung", "Umsetzung"]) assert.ok(fassung.includes(s), s);
        assert.ok(fassung.includes("Erst der Entwurf, dann Ihre Entscheidung."));
    }
});

test("Hinweis 3: kostenfreier Entwurf, Festpreise ab 1.290 € einmalig, kein Abo, Antwort an kontakt@karriaro.de", () => {
    const mail = m.sequenzMail(3, ctx());
    assert.equal(mail.subject, "Ein kostenfreier Entwurf für Ihre Website");
    for (const fassung of [mail.text, sichtbar(mail.html)]) {
        for (const teil of ["kostenfreien Entwurf", "ab 1.290 €", "einmalig", "kein Abo", "kontakt@karriaro.de", "dritte und letzte"]) {
            assert.ok(fassung.includes(teil), teil);
        }
    }
    assert.match(mail.html, /href="mailto:kontakt@karriaro\.de\?subject=Entwurf%20f%C3%BCr%20beispiel\.de"/);
});

test("Einstiegspreis hat eine Quelle: Mail = index.js Essential = Pitch-Default", () => {
    assert.equal(m.EINSTIEGSPREIS, "1.290 €");
    const index = fs.readFileSync(path.join(WEB, "functions", "index.js"), "utf8");
    assert.ok(index.includes(`"essential": "Essential (${m.EINSTIEGSPREIS})"`));
    assert.ok(index.includes(`: "ab ${m.EINSTIEGSPREIS}"`), "generatePitch-Default");
    assert.doesNotMatch(index, /"ab 2\.990 €"/);
    const { buildPitchUserMessage, PITCH_SYS } = require("../lib/pitch-generator.js");
    assert.match(buildPitchUserMessage({ name: "X" }), /Preis-Rahmen \(genau so nennen, nicht ändern\): ab 1\.290 €, einmalig, kein Abo\./);
    assert.match(buildPitchUserMessage({ name: "X", priceFrom: "ab 2.990 €" }), /: ab 2\.990 €, einmalig/, "ein übergebener Preis bleibt unangetastet");
    assert.doesNotMatch(PITCH_SYS, /ab 2\.990 €/);
});

test("V12: Absenderangaben stehen so im Impressum (§ 5 DDG)", () => {
    const imp = fs.readFileSync(path.join(WEB, "src", "impressum.html"), "utf8");
    assert.match(imp, /§ 5 DDG/);
    for (const teil of [m.ABSENDER.name, m.ABSENDER.strasse, m.ABSENDER.ort, m.ABSENDER.email]) assert.ok(imp.includes(teil), teil);
});

test("Umlaut-Domains stehen lesbar in den Mails (Unicode statt Punycode); ASCII und Unlesbares bleiben unverändert", () => {
    const puny = ew.normalisiereDomain("müller-bau.de");
    assert.match(puny, /^xn--/, "gespeichert wird die Punycode-Form");
    assert.equal(m.anzeigeDomain(puny), "müller-bau.de");
    assert.equal(m.anzeigeDomain(puny.toUpperCase()), "müller-bau.de");
    assert.equal(m.anzeigeDomain("beispiel.de"), "beispiel.de");
    assert.equal(m.anzeigeDomain("xn--zz.de"), "xn--zz.de", "nicht umwandelbar → so wie gespeichert, nie verschluckt");
    assert.equal(m.anzeigeDomain(null), null);
    assert.equal(m.anzeigeDomain("   "), null);

    // Wirkung bis in die ausgelieferten Fassungen, nicht nur im Helfer
    const b = m.bestaetigungsMail({ domain: puny, source: "website-pruefen", createdAtMs: ANGEFORDERT, confirmToken: TOKEN_A });
    const fassungen = [b.text, sichtbar(b.html)];
    for (const schritt of [1, 3]) {
        const s = m.sequenzMail(schritt, ctx({ domain: puny }));
        fassungen.push(s.text, sichtbar(s.html));
    }
    for (const f of fassungen) {
        assert.ok(f.includes("müller-bau.de"), f.slice(0, 120));
        assert.doesNotMatch(f, /xn--/, "kein Punycode im sichtbaren Text");
    }
    const g = m.gruenderMailBestaetigt({ email: "a@beispiel.de", domain: puny, source: "startseite" });
    assert.equal(g.subject, "Einwilligung bestätigt: müller-bau.de");
    assert.ok(g.text.includes(`müller-bau.de (${puny})`), "der Gründer sieht zusätzlich die gespeicherte Form");
    // Gegenprobe: ohne Umwandlung stünde Punycode in der Bestätigungsmail
    assert.match(`Angegebene Website: ${puny}`, /xn--/);
});

// ─── Gründer-Mail, Seiten, Kodex ────────────────────────────────────────────

test("Gründer-Mail: Adresse, Domain, Quelle und die Grenze der Einwilligung", () => {
    const g = m.gruenderMailBestaetigt({
        id: "abc", email: "inhaber@beispiel.de", domain: "beispiel.de", source: "ki-zitier",
        createdAtMs: ANGEFORDERT, confirmedAtMs: BESTAETIGT, textVersion: "2026-09-10"
    });
    for (const teil of ["inhaber@beispiel.de", "beispiel.de", "ki-zitier", "den KI-Zitier-Check", "2026-09-10", "drei E-Mails", "nicht gedeckt"]) {
        assert.ok(g.text.includes(teil), teil);
    }
    assert.ok(g.html.includes("inhaber@beispiel.de"));
    assert.equal(g.subject, "Einwilligung bestätigt: beispiel.de");
});

test("Gründer-Mail: eine gestoppte Strecke wird als gestoppt gemeldet, nie als laufend", () => {
    const basis = { id: "x", email: "inhaber@beispiel.de", domain: "beispiel.de", source: "startseite", createdAtMs: ANGEFORDERT, confirmedAtMs: BESTAETIGT, textVersion: "2026-09-10" };
    const laeuft = m.gruenderMailBestaetigt(basis);
    for (const f of [laeuft.text, sichtbar(laeuft.html)]) {
        assert.match(f, /läuft automatisch/);
        assert.doesNotMatch(f, /gestoppt/);
    }
    const gestoppt = m.gruenderMailBestaetigt({ ...basis, gestoppt: true });
    assert.equal(gestoppt.subject, "Einwilligung bestätigt: beispiel.de (Strecke gestoppt)");
    for (const f of [gestoppt.text, sichtbar(gestoppt.html)]) {
        assert.doesNotMatch(f, /läuft automatisch/, "die Mail darf keine Strecke melden, die nie startet");
        assert.match(f, /keine Hinweis-E-Mails/);
    }
    // Nur ein echtes true schaltet um
    assert.match(m.gruenderMailBestaetigt({ ...basis, gestoppt: "ja" }).text, /läuft automatisch/);
});

test("HTML-Fassungen escapen Fremdtext", () => {
    const mail = m.sequenzMail(1, ctx({ domain: "<img src=x onerror=alert(1)>" }));
    assert.doesNotMatch(mail.html, /<img src=x/);
    assert.ok(mail.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    const g = m.gruenderMailBestaetigt({ email: "a@b.de", domain: "<b>x</b>", source: "startseite" });
    assert.doesNotMatch(g.html, /<b>x<\/b>/);
});

test("Seiten: noindex, kein Referrer, kein Script; Formular nur mit gültigem Token", () => {
    const frage = m.seite("abmeldenFrage", { token: TOKEN_A });
    assert.equal(frage.status, 200);
    assert.match(frage.html, /<meta name="robots" content="noindex,nofollow">/);
    assert.match(frage.html, /<meta name="referrer" content="no-referrer">/);
    assert.ok(frage.html.includes(`<form method="post" action="?t=${TOKEN_A}">`));
    assert.match(frage.html, /<input type="hidden" name="List-Unsubscribe" value="One-Click">/);
    assert.doesNotMatch(frage.html, /<script/i);
    assert.doesNotMatch(m.seite("abmeldenFrage", { token: '"><script>' }).html, /<form/, "ohne gültiges Token kein Formular");

    const best = m.seite("bestaetigenFrage", { token: TOKEN_A });
    assert.ok(sichtbar(best.html).includes(ew.EINWILLIGUNG_TEXT));
    assert.match(best.html, /<button type="submit">Einwilligung bestätigen<\/button>/);

    const ok = m.seite("bestaetigt", { widerrufToken: TOKEN_B });
    assert.ok(ok.html.includes(`href="https://karriaro-webdesign.de/abmelden?t=${TOKEN_B}"`));
    assert.doesNotMatch(m.seite("bestaetigt", { widerrufToken: "kaputt" }).html, /abmelden\?t=/);

    assert.equal(m.seite("gibt-es-nicht").status, 404);
    assert.equal(m.seite("abgelaufen").status, 410);
    assert.ok(m.SEITEN_CSP.includes("default-src 'none'"));
    assert.ok(m.SEITEN_CSP.includes("form-action 'self'"));
    assert.doesNotMatch(m.SEITEN_CSP, /script-src/);
});

function kundensichtbareTexte() {
    const out = [];
    const b = m.bestaetigungsMail({ domain: "beispiel.de", source: "startseite", createdAtMs: ANGEFORDERT, confirmToken: TOKEN_A });
    out.push(b.subject, b.text, sichtbar(b.html));
    for (const schritt of [1, 2, 3]) {
        for (const extra of [{}, { auditSlug: "abc123def4567890", berichtVerfuegbar: true, domain: null }]) {
            const s = m.sequenzMail(schritt, ctx(extra));
            out.push(s.subject, s.text, sichtbar(s.html));
        }
    }
    for (const art of ["bestaetigenFrage", "bestaetigt", "bereitsBestaetigt", "widerrufen", "abgelaufen", "ungueltig", "fehler", "zuViele", "abmeldenFrage", "abgemeldet", "bereitsAbgemeldet", "unvollstaendig", "methode"]) {
        out.push(sichtbar(m.seite(art, { token: TOKEN_A, widerrufToken: TOKEN_B }).html));
    }
    return out;
}

test("Marken-Kodex: echte Umlaute, keine Transliteration, kein Ortsbezug, keine Zeit-, Verknappungs- oder Garantie-Zusagen", () => {
    const TRANSLIT = /(?<![\p{L}])(?:fuer|ueber|koennen|moechten|pruefen|pruefung|aendern|gruessen|gruesse|bestaetig\p{L}*|oeffnen|waehrend|zurueck|massnahmen|schliessen|gemaess|verfuegbar\p{L}*)(?![\p{L}])/iu;
    const VERBOTEN = /köln|hansgrohe|handgemacht|(?<![\p{L}\d])(?:\d+\s*(?:stunden|std\.|h|werktag\p{L}*|tag\p{L}*)|binnen|innerhalb von|in kürze|umgehend|garantie\p{L}*|garantiert|nur noch|letzte chance|begrenzt\p{L}*|sofort)(?![\p{L}\d-])/iu;
    const texte = kundensichtbareTexte();
    for (const t of texte) {
        const ohneLinks = t.replace(/https?:\/\/\S+|mailto:\S+/g, "");
        assert.doesNotMatch(ohneLinks, TRANSLIT, `Transliteration: ${ohneLinks.slice(0, 160)}`);
        assert.doesNotMatch(ohneLinks, VERBOTEN, `Verbotene Formulierung: ${ohneLinks.slice(0, 160)}`);
        assert.doesNotMatch(ohneLinks, /\bDu\b|\bdein/, "Sie-Anrede");
    }
    // Gegenprobe: die Muster greifen
    assert.match("Antwort binnen 24 Stunden", VERBOTEN);
    assert.match("Kölner Manufaktur", VERBOTEN);
    assert.match("Fuegen Sie", /fuegen/i);
    assert.doesNotMatch("über die Sofort-Skizze", VERBOTEN, "Produktname ist keine Tempo-Zusage");
    assert.ok(texte.join(" ").match(/[äöüß]/g).length > 20);
});
