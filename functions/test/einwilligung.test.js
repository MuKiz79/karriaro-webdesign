"use strict";
/**
 * 2026-09-10 — Tests für lib/einwilligung.js (Double-Opt-In, Nachfass-Strecke),
 * lib/mailer.js und die Verdrahtung in index.js / firebase.json / TTL-Skript.
 *
 * Jede Regel mit Gegenprobe: der verbotene Fall MUSS blockiert werden, der
 * erlaubte darf es nicht. Wirkung statt Anwesenheit: der Sequenz-Lauf wird an
 * einem Speicher-Doppel gefahren, der mitschreibt, ob der Schritt VOR dem
 * Versand gezählt war.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ew = require("../lib/einwilligung.js");
const mailer = require("../lib/mailer.js");

const WEB = path.join(__dirname, "..", "..");
const ms = (s) => Date.parse(s);
const iso = (t) => new Date(t).toISOString();

function bestaetigtesDoc(extra = {}) {
    const bestaetigtAm = ms("2026-09-10T13:00:00Z"); // 15:00 Berlin
    const r = ew.baueAnforderung({ email: "inhaber@beispiel.de", source: "startseite", textVersion: "2026-09-10", nowMs: bestaetigtAm - 3600000 });
    const b = ew.bestaetige(r.dokument, { nowMs: bestaetigtAm });
    return { ...r.dokument, ...b.update, ...extra };
}

// ─── V1 / Token / Eingaben ──────────────────────────────────────────────────

test("V1: Einwilligungstext wörtlich, Version 2026-09-10, vier Quellen", () => {
    assert.equal(ew.EINWILLIGUNG_TEXT_VERSION, "2026-09-10");
    assert.equal(ew.EINWILLIGUNG_TEXT, "Ja, Karriaro Webdesign darf mir bis zu drei E-Mails mit Hinweisen zu meiner Website und einem unverbindlichen Angebot für eine neue Website senden. Die Einwilligung ist freiwillig; ich kann sie jederzeit widerrufen – über den Abmeldelink in jeder E-Mail oder per Mail an kontakt@karriaro.de. Mehr in der Datenschutzerklärung.");
    assert.equal(ew.textFuerVersion("2026-09-10"), ew.EINWILLIGUNG_TEXT);
    assert.equal(ew.textFuerVersion("2026-09-09"), null);
    assert.equal(ew.textFuerVersion("__proto__"), null);
    assert.equal(ew.EINWILLIGUNG_SCOPE, "webdesign-hinweise");
    assert.deepEqual(Object.keys(ew.EINWILLIGUNG_QUELLEN).sort(), ["ki-zitier", "sofort-skizze", "startseite", "website-pruefen"]);
});

test("Token: 32 Bytes base64url, zufällig; im Dokument steht nur der SHA-256-Hash", () => {
    const a = ew.erzeugeToken();
    const b = ew.erzeugeToken();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
    assert.equal(Buffer.from(a, "base64url").length, 32);
    assert.equal(ew.istTokenFormat(a), true);
    assert.equal(ew.istTokenFormat(a + "x"), false);
    assert.equal(ew.istTokenFormat("a b"), false);
    assert.equal(ew.istTokenFormat(null), false);
    assert.match(ew.hashToken(a), /^[a-f0-9]{64}$/);
    assert.equal(ew.hashToken(a), ew.hashToken(a));

    const r = ew.baueAnforderung({ email: "a@beispiel.de", source: "website-pruefen", textVersion: "2026-09-10", nowMs: ms("2026-09-10T08:00:00Z") });
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(r.dokument).includes(r.confirmToken), false, "Bestätigungstoken darf nicht im Dokument stehen");
    assert.equal(r.dokument.confirmTokenHash, ew.hashToken(r.confirmToken));
    assert.equal(ew.istTokenFormat(r.dokument.unsubscribeToken), true);
    assert.notEqual(r.dokument.unsubscribeToken, r.confirmToken);
});

test("normalisiereEmail: trim/klein; Header-Injection und Unfug → null", () => {
    assert.equal(ew.normalisiereEmail("  Info@Beispiel.DE "), "info@beispiel.de");
    assert.equal(ew.normalisiereEmail("m.mueller+web@bäckerei-schmidt.de"), "m.mueller+web@bäckerei-schmidt.de");
    const boese = [
        "a@b.de\r\nBcc: x@y.de", "a@b.de\nX", "keine-mail", "@beispiel.de", "a@@b.de", "a@b",
        "a b@c.de", "<a@b.de>", "a@b..de", ".a@b.de", "a@-b.de", "", null, 42, "x".repeat(65) + "@b.de"
    ];
    for (const e of boese) assert.equal(ew.normalisiereEmail(e), null, `abzulehnen: ${JSON.stringify(e)}`);
});

test("normalisiereDomain: Hostname ohne www; Umlaut-Domain als Punycode; Unfug → null", () => {
    assert.equal(ew.normalisiereDomain("https://www.Beispiel.de/kontakt?x=1"), "beispiel.de");
    assert.equal(ew.normalisiereDomain("beispiel.de"), "beispiel.de");
    assert.match(ew.normalisiereDomain("müller-bau.de"), /^xn--[a-z0-9-]+\.de$/);
    for (const x of ["", "localhost", "javascript:alert(1)", "http://", "<script>", null, 7]) {
        assert.equal(ew.normalisiereDomain(x), null, `abzulehnen: ${JSON.stringify(x)}`);
    }
});

// ─── Dokument nach V4 ───────────────────────────────────────────────────────

test("baueAnforderung: Dokument nach V4 — unbestätigt, nichts vorausgefüllt, Bestätigungsfrist 30 Tage", () => {
    const now = ms("2026-09-10T08:00:00Z");
    const r = ew.baueAnforderung({
        email: "Inhaber@Beispiel.de", domain: "https://www.beispiel.de", source: "website-pruefen",
        auditSlug: "abc123def456", textVersion: "2026-09-10", ipHash: "a".repeat(32), nowMs: now
    });
    assert.equal(r.ok, true);
    const d = r.dokument;
    const v4 = ["email", "domain", "scope", "text", "textVersion", "source", "auditSlug", "createdAt", "confirmedAt",
        "revokedAt", "stopped", "sequenceStep", "nextSendAt", "confirmTokenHash", "unsubscribeToken", "ipHash", "expiresAt"];
    for (const feld of v4) assert.ok(Object.prototype.hasOwnProperty.call(d, feld), `V4-Feld fehlt: ${feld}`);
    assert.equal(d.email, "inhaber@beispiel.de");
    assert.equal(d.domain, "beispiel.de");
    assert.equal(d.scope, "webdesign-hinweise");
    assert.equal(d.text, ew.EINWILLIGUNG_TEXT);
    assert.equal(d.textVersion, "2026-09-10");
    assert.equal(d.auditSlug, "abc123def456");
    assert.equal(d.ipHash, "a".repeat(32));
    assert.equal(d.createdAt, now);
    assert.equal(d.confirmedAt, null);
    assert.equal(d.revokedAt, null);
    assert.equal(d.stopped, false);
    assert.equal(d.sequenceStep, 0);
    assert.equal(d.nextSendAt, null);
    assert.equal(d.expiresAt, now + 30 * 86400000);
    assert.equal(ew.zustand(d, now), "offen");
    assert.equal(ew.zustand(d, now + 31 * 86400000), "abgelaufen");
});

test("baueAnforderung: Gegenproben — Quelle, Version, E-Mail; unsaubere Nebenfelder werden null", () => {
    const basis = { email: "a@beispiel.de", source: "website-pruefen", textVersion: "2026-09-10", nowMs: ms("2026-09-10T08:00:00Z") };
    assert.deepEqual(ew.baueAnforderung({ ...basis, source: "linkedin" }), { ok: false, grund: "quelle-ungueltig" });
    assert.deepEqual(ew.baueAnforderung({ ...basis, source: "toString" }), { ok: false, grund: "quelle-ungueltig" });
    assert.deepEqual(ew.baueAnforderung({ ...basis, textVersion: "2026-01-01" }), { ok: false, grund: "version-unbekannt" });
    assert.deepEqual(ew.baueAnforderung({ ...basis, textVersion: undefined }), { ok: false, grund: "version-unbekannt" });
    assert.deepEqual(ew.baueAnforderung({ ...basis, email: "kaputt" }), { ok: false, grund: "email-ungueltig" });
    const r = ew.baueAnforderung({ ...basis, auditSlug: "../../etc", ipHash: "127.0.0.1", domain: "<b>" });
    assert.equal(r.ok, true);
    assert.equal(r.dokument.auditSlug, null);
    assert.equal(r.dokument.ipHash, null);
    assert.equal(r.dokument.domain, null);
    for (const q of Object.keys(ew.EINWILLIGUNG_QUELLEN)) assert.equal(ew.baueAnforderung({ ...basis, source: q }).ok, true, q);
});

// ─── Fälligkeit (Europe/Berlin) ─────────────────────────────────────────────

test("Fälligkeit: Tag 2/7/14 nach der Bestätigung, jeweils 10:00 Europe/Berlin (Sommerzeit)", () => {
    const bestaetigt = ms("2026-09-10T13:00:00Z");
    assert.equal(iso(ew.faelligkeitFuerSchritt(1, bestaetigt)), "2026-09-12T08:00:00.000Z");
    assert.equal(iso(ew.faelligkeitFuerSchritt(2, bestaetigt)), "2026-09-17T08:00:00.000Z");
    assert.equal(iso(ew.faelligkeitFuerSchritt(3, bestaetigt)), "2026-09-24T08:00:00.000Z");
    assert.equal(ew.faelligkeitFuerSchritt(4, bestaetigt), null);
    assert.equal(ew.faelligkeitFuerSchritt(0, bestaetigt), null);
    assert.equal(ew.faelligkeitFuerSchritt(1, null), null);
});

test("Fälligkeit: Berliner Kalendertag zählt, nicht der UTC-Tag; Winterzeit; nie zwei Mails an einem Tag", () => {
    // 00:30 Uhr in Berlin am 11.09. ist in UTC noch der 10.09.
    assert.equal(iso(ew.faelligkeitFuerSchritt(1, ms("2026-09-10T22:30:00Z"))), "2026-09-13T08:00:00.000Z");
    // In der Sommerzeit bestätigt, Schritt 3 liegt nach der Umstellung am 25.10.2026 → 10:00 MEZ = 09:00 UTC
    assert.equal(iso(ew.faelligkeitFuerSchritt(3, ms("2026-10-20T10:00:00Z"))), "2026-11-03T09:00:00.000Z");
    // Schritt 1 erst am Tag von Schritt 2 versendet → Schritt 2 frühestens am Folgetag
    const bestaetigt = ms("2026-09-10T13:00:00Z");
    assert.equal(iso(ew.faelligkeitFuerSchritt(2, bestaetigt, { fruehestensNachMs: ms("2026-09-17T08:05:00Z") })), "2026-09-18T08:00:00.000Z");
    // Gegenprobe: pünktlicher Versand verschiebt nichts
    assert.equal(iso(ew.faelligkeitFuerSchritt(2, bestaetigt, { fruehestensNachMs: ms("2026-09-12T08:00:00Z") })), "2026-09-17T08:00:00.000Z");
});

test("Fälligkeit: nur bestätigt + nicht widerrufen + nicht gestoppt + weniger als 3 Schritte", () => {
    const doc = bestaetigtesDoc();
    const termin = doc.nextSendAt;
    assert.equal(iso(termin), "2026-09-12T08:00:00.000Z");
    assert.deepEqual(ew.pruefeFaelligkeit(doc, termin), { faellig: true, schritt: 1, grund: null });
    assert.equal(ew.pruefeFaelligkeit(doc, termin - 60 * 1000).faellig, true, "Lauf startet kurz vor 10:00");
    assert.equal(ew.pruefeFaelligkeit(doc, termin - 2 * 3600000).faellig, false);

    const spaeter = termin + 86400000;
    assert.equal(ew.pruefeFaelligkeit({ ...doc, confirmedAt: null }, spaeter).faellig, false, "unbestätigt");
    assert.equal(ew.pruefeFaelligkeit({ ...doc, revokedAt: spaeter - 1000 }, spaeter).faellig, false, "widerrufen");
    assert.equal(ew.pruefeFaelligkeit({ ...doc, stopped: true }, spaeter).faellig, false, "gestoppt");
    assert.deepEqual(ew.pruefeFaelligkeit({ ...doc, sequenceStep: 3 }, spaeter), { faellig: false, schritt: null, grund: "abgeschlossen" });
    assert.equal(ew.pruefeFaelligkeit({ ...doc, nextSendAt: null }, spaeter).faellig, false, "ohne Termin");
});

// ─── Zustandsübergänge ──────────────────────────────────────────────────────

test("bestaetige: idempotent; widerrufen/abgelaufen bleiben unbestätigt; Nachweis 3 Jahre", () => {
    const now = ms("2026-09-10T08:00:00Z");
    const { dokument } = ew.baueAnforderung({ email: "a@beispiel.de", source: "sofort-skizze", textVersion: "2026-09-10", nowMs: now });
    const b = ew.bestaetige(dokument, { nowMs: now + 60000, ipHash: "b".repeat(32) });
    assert.equal(b.ergebnis, "bestaetigt");
    assert.equal(b.update.confirmedAt, now + 60000);
    assert.equal(b.update.confirmIpHash, "b".repeat(32));
    assert.equal(b.update.sequenceStep, 0);
    assert.equal(iso(b.update.expiresAt), "2029-09-10T08:01:00.000Z");
    const doc = { ...dokument, ...b.update };
    assert.deepEqual(ew.bestaetige(doc, { nowMs: now + 120000 }), { ergebnis: "bereits-bestaetigt", update: null });
    assert.deepEqual(ew.bestaetige({ ...dokument, revokedAt: now + 1000 }, { nowMs: now + 2000 }), { ergebnis: "widerrufen", update: null });
    assert.deepEqual(ew.bestaetige(dokument, { nowMs: now + 31 * 86400000 }), { ergebnis: "abgelaufen", update: null });
    assert.equal(ew.bestaetige(dokument, { nowMs: now + 29 * 86400000 }).ergebnis, "bestaetigt");
    // vor der Bestätigung gestoppt → bestätigt, aber ohne Termin
    assert.equal(ew.bestaetige({ ...dokument, stopped: true }, { nowMs: now + 1000 }).update.nextSendAt, null);
    // ohne Anforderungszeitpunkt kein Nachweis → keine Bestätigung
    assert.equal(ew.bestaetige({ ...dokument, createdAt: null }, { nowMs: now }).ergebnis, "abgelaufen");
});

test("beanspruche: Schritt wird VOR dem Versand gezählt; derselbe Schritt ist danach nicht mehr fällig; nach Schritt 3 nichts", () => {
    let doc = bestaetigtesDoc();
    const t1 = doc.nextSendAt;
    const a1 = ew.beanspruche(doc, t1);
    assert.equal(a1.schritt, 1);
    assert.equal(a1.update.sequenceStep, 1);
    assert.equal(iso(a1.update.nextSendAt), "2026-09-17T08:00:00.000Z");
    doc = { ...doc, ...a1.update };
    assert.equal(ew.beanspruche(doc, t1), null, "zweiter Lauf am selben Morgen findet nichts");

    const a2 = ew.beanspruche(doc, doc.nextSendAt);
    assert.equal(a2.schritt, 2);
    doc = { ...doc, ...a2.update };
    const t3 = doc.nextSendAt;
    assert.equal(iso(t3), "2026-09-24T08:00:00.000Z");
    const a3 = ew.beanspruche(doc, t3);
    assert.equal(a3.schritt, 3);
    assert.equal(a3.update.nextSendAt, null, "nach Schritt 3 gibt es keinen Termin mehr");
    assert.equal(iso(a3.update.expiresAt), "2029-09-24T08:00:00.000Z");
    doc = { ...doc, ...a3.update };
    assert.equal(ew.zustand(doc, t3), "abgeschlossen");
    assert.equal(ew.beanspruche(doc, ms("2027-01-01T09:00:00Z")), null);
    assert.equal(ew.beanspruche({ ...doc, nextSendAt: ms("2026-12-01T09:00:00Z") }, ms("2027-01-01T09:00:00Z")), null, "auch mit falsch gesetztem Termin keine vierte Mail");
});

test("aufraeumUpdate: veraltete Termine an gestoppten/widerrufenen Dokumenten werden geräumt, aktive nicht", () => {
    const doc = bestaetigtesDoc();
    assert.equal(ew.aufraeumUpdate(doc, doc.nextSendAt), null);
    assert.deepEqual(ew.aufraeumUpdate({ ...doc, stopped: true }, doc.nextSendAt), { nextSendAt: null });
    assert.deepEqual(ew.aufraeumUpdate({ ...doc, revokedAt: doc.confirmedAt + 1 }, doc.nextSendAt), { nextSendAt: null });
    assert.equal(ew.aufraeumUpdate({ ...doc, stopped: true, nextSendAt: null }, doc.nextSendAt), null);
});

test("widerrufe: revokedAt + stopped, Termin geräumt, Nachweis 3 Jahre; zweiter Aufruf ändert nichts", () => {
    const doc = bestaetigtesDoc();
    const t = doc.nextSendAt - 3600000;
    const w = ew.widerrufe(doc, { nowMs: t, weg: "one-click" });
    assert.equal(w.ergebnis, "widerrufen");
    assert.deepEqual(w.update, { revokedAt: t, stopped: true, nextSendAt: null, expiresAt: ew.nachweisAblauf(t), widerrufWeg: "one-click" });
    const nach = { ...doc, ...w.update };
    assert.equal(ew.zustand(nach, t), "widerrufen");
    assert.equal(ew.pruefeFaelligkeit(nach, doc.nextSendAt).faellig, false);
    assert.deepEqual(ew.widerrufe(nach, { nowMs: t + 1000 }), { ergebnis: "bereits-widerrufen", update: null });
    assert.equal(ew.widerrufe(doc, { nowMs: t, weg: "unbekannt" }).update.widerrufWeg, null);
    assert.equal(ew.zustand({ ...nach, stopped: false }, t), "widerrufen", "Widerruf schlägt Bestätigung");
});

test("pruefeNeueAnforderung: keine zweite Bestätigungsmail bei aktiver/gestoppter Einwilligung oder Doppelklick", () => {
    const now = ms("2026-09-10T08:00:00Z");
    const neu = (alterMs, extra = {}) => ({
        ...ew.baueAnforderung({ email: "a@beispiel.de", source: "website-pruefen", textVersion: "2026-09-10", nowMs: now - alterMs }).dokument,
        ...extra
    });
    assert.deepEqual(ew.pruefeNeueAnforderung([], now), { anlegen: true, grund: null });
    assert.equal(ew.pruefeNeueAnforderung([neu(60000)], now).grund, "doppelt");
    assert.equal(ew.pruefeNeueAnforderung([neu(3600000)], now).anlegen, true, "offene Anforderung von vor einer Stunde blockiert nicht");
    const aktiv = neu(86400000, { confirmedAt: now - 80000000 });
    assert.equal(ew.pruefeNeueAnforderung([aktiv], now).grund, "bereits-bestaetigt");
    assert.equal(ew.pruefeNeueAnforderung([{ ...aktiv, stopped: true }], now).grund, "gestoppt");
    assert.equal(ew.pruefeNeueAnforderung([{ ...aktiv, revokedAt: now - 1000, stopped: true }], now).anlegen, true, "nach Widerruf darf die Person erneut einwilligen");
    assert.equal(ew.pruefeNeueAnforderung([{ ...aktiv, sequenceStep: 3 }], now).anlegen, true, "abgeschlossene Strecke: neue ausdrückliche Einwilligung möglich");
});

test("bestaetige mit Adresslage: höchstens eine Strecke je Adresse; Widerruf und Stopp gelten auch für ältere offene Anforderungen", () => {
    const t0 = ms("2026-09-10T08:00:00Z");
    const anf = (nowMs) => ew.baueAnforderung({ email: "a@beispiel.de", source: "website-pruefen", textVersion: "2026-09-10", nowMs }).dokument;
    const B = anf(t0);                       // offene Anforderung, die jetzt bestätigt werden soll
    const jetzt = t0 + 2 * 3600000;
    const A = anf(t0 - 3600000);             // zweite Anforderung derselben Adresse
    const aktivA = { ...A, confirmedAt: t0 + 3600000, nextSendAt: ew.faelligkeitFuerSchritt(1, t0 + 3600000) };

    // Grundfall ohne Nachbarn
    const frei = ew.bestaetige(B, { nowMs: jetzt });
    assert.equal(frei.ergebnis, "bestaetigt");
    assert.ok(frei.update.nextSendAt > jetzt);

    // Laufende Strecke → keine zweite (sonst sechs E-Mails)
    const zweite = ew.bestaetige(B, { nowMs: jetzt, andere: [aktivA] });
    assert.equal(zweite.ergebnis, "bereits-bestaetigt");
    assert.equal(zweite.update, null);
    assert.equal(zweite.bezug, aktivA);

    // Abgeschlossen NACH dieser Anforderung bestätigt → gesperrt; VOR ihr → neue Einwilligung erlaubt
    assert.equal(ew.bestaetige(B, { nowMs: jetzt, andere: [{ ...aktivA, sequenceStep: 3, nextSendAt: null }] }).ergebnis, "bereits-bestaetigt");
    const frueherAbgeschlossen = { ...A, confirmedAt: t0 - 1000, sequenceStep: 3, nextSendAt: null };
    assert.equal(ew.bestaetige(B, { nowMs: jetzt, andere: [frueherAbgeschlossen] }).ergebnis, "bestaetigt");

    // Widerruf NACH dieser Anforderung gilt auch für sie; ein älterer Widerruf nicht
    const widerrufNach = { ...aktivA, revokedAt: t0 + 5000, stopped: true, nextSendAt: null };
    assert.deepEqual(ew.bestaetige(B, { nowMs: jetzt, andere: [widerrufNach] }), { ergebnis: "widerrufen", update: null, bezug: widerrufNach });
    assert.equal(ew.bestaetige(B, { nowMs: jetzt, andere: [{ ...widerrufNach, revokedAt: t0 - 5000 }] }).ergebnis, "bestaetigt");

    // Gestoppte Adresse → bestätigt als Nachweis, aber ohne Strecke und selbst gestoppt
    const gestoppt = ew.bestaetige(B, { nowMs: jetzt, andere: [{ ...aktivA, stopped: true }] });
    assert.equal(gestoppt.ergebnis, "bestaetigt");
    assert.equal(gestoppt.update.stopped, true);
    assert.equal(gestoppt.update.nextSendAt, null);
    const nachStopp = { ...B, ...gestoppt.update };
    assert.equal(ew.pruefeFaelligkeit({ ...nachStopp, nextSendAt: jetzt }, jetzt + 86400000).faellig, false, "auch ein nachträglich gesetzter Termin versendet nichts");

    // Vorrang: laufende Strecke vor Widerruf; eigene Kopie in der Liste wird ignoriert
    assert.equal(ew.bestaetige(B, { nowMs: jetzt, andere: [widerrufNach, aktivA] }).ergebnis, "bereits-bestaetigt");
    assert.equal(ew.bestaetige(B, { nowMs: jetzt, andere: [{ ...B, confirmedAt: t0 + 1 }] }).ergebnis, "bestaetigt");
    // Eigener Zustand zuerst: abgelaufen bleibt abgelaufen
    assert.equal(ew.bestaetige(B, { nowMs: t0 + 31 * 86400000, andere: [] }).ergebnis, "abgelaufen");
});

test("nachVersandFehler: sicher nicht zugestellt → Schritt zurück, Folgetag 10:00; unklar → Schritt bleibt gezählt", () => {
    const doc = bestaetigtesDoc();
    const t = doc.nextSendAt;
    const nach = { ...doc, ...ew.beanspruche(doc, t).update };

    const sicher = ew.nachVersandFehler(nach, { schritt: 1, sicherNichtZugestellt: true, fehlerText: "535 Auth", nowMs: t });
    assert.equal(sicher.sequenceStep, 0);
    assert.equal(iso(sicher.nextSendAt), "2026-09-13T08:00:00.000Z");
    assert.equal(sicher.fehlversuche, 1);
    assert.match(sicher.letzterFehler, /nicht zugestellt/);

    const unklar = ew.nachVersandFehler(nach, { schritt: 1, sicherNichtZugestellt: false, fehlerText: "Timeout", nowMs: t });
    assert.equal(Object.prototype.hasOwnProperty.call(unklar, "sequenceStep"), false, "unklarer Versand gibt den Schritt nicht zurück");
    assert.equal(Object.prototype.hasOwnProperty.call(unklar, "nextSendAt"), false);
    assert.match(unklar.letzterFehler, /Zustellung unklar/);

    const ausgereizt = ew.nachVersandFehler({ ...nach, fehlversuche: ew.MAX_FEHLVERSUCHE - 1 }, { schritt: 1, sicherNichtZugestellt: true, fehlerText: "x", nowMs: t });
    assert.equal(ausgereizt.nextSendAt, null);
    assert.equal(ausgereizt.sequenceStep, 0);

    const widerrufen = ew.nachVersandFehler({ ...nach, revokedAt: t, stopped: true }, { schritt: 1, sicherNichtZugestellt: true, fehlerText: "x", nowMs: t });
    assert.equal(widerrufen.nextSendAt, null);

    const fremd = ew.nachVersandFehler({ ...nach, sequenceStep: 2 }, { schritt: 1, sicherNichtZugestellt: true, fehlerText: "x", nowMs: t });
    assert.deepEqual(Object.keys(fremd).sort(), ["fehlversuche", "letzterFehler"]);

    assert.equal(/[\r\n]/.test(ew.nachVersandFehler(nach, { schritt: 1, sicherNichtZugestellt: false, fehlerText: "a\r\nb", nowMs: t }).letzterFehler), false);
});

// ─── Sequenz-Lauf an einem Speicher-Doppel ──────────────────────────────────

function speicherDoppel(docs, nowMs) {
    const daten = new Map(docs.map((d, i) => [`c${i}`, { ...d }]));
    const gesendet = [];
    const vorVersandGezaehlt = [];
    let kette = Promise.resolve();
    // Serialisierte „Transaktion" wie runTransaction: liest und schreibt atomar.
    const transaktion = (fn) => {
        const p = kette.then(fn);
        kette = p.catch(() => {});
        return p;
    };
    const deps = (extra = {}) => ({
        ladeKandidaten: async () => [...daten.keys()],
        beanspruche: (id) => transaktion(async () => {
            const doc = daten.get(id);
            const a = ew.beanspruche(doc, nowMs);
            if (!a) return null;
            Object.assign(doc, a.update);
            return { id, schritt: a.schritt, doc: { ...doc } };
        }),
        sende: async (anspruch) => {
            vorVersandGezaehlt.push(daten.get(anspruch.id).sequenceStep === anspruch.schritt);
            gesendet.push(`${anspruch.id}:${anspruch.schritt}`);
        },
        nachErfolg: async (id) => { Object.assign(daten.get(id), ew.nachVersandErfolg(nowMs)); },
        nachFehler: async (id, anspruch, err) => {
            Object.assign(daten.get(id), ew.nachVersandFehler(daten.get(id), {
                schritt: anspruch.schritt,
                sicherNichtZugestellt: mailer.versandSicherNichtErfolgt(err),
                fehlerText: err.message,
                nowMs
            }));
        },
        ...extra
    });
    return { daten, gesendet, vorVersandGezaehlt, deps };
}

test("sequenzLauf: höchstens 50 Mails je Lauf, jeder Schritt vor dem Versand gezählt", async () => {
    const doc = bestaetigtesDoc();
    const s = speicherDoppel(Array.from({ length: 60 }, () => doc), doc.nextSendAt);
    const bericht = await ew.sequenzLauf(s.deps());
    assert.equal(ew.SEQUENZ_MAX_MAILS, 50);
    assert.equal(bericht.gesendet, 50);
    assert.equal(bericht.gedeckelt, true);
    assert.equal(s.gesendet.length, 50);
    assert.equal(s.vorVersandGezaehlt.length, 50);
    assert.ok(s.vorVersandGezaehlt.every(Boolean), "Schritt muss vor dem Versand gezählt sein");
    const offen = [...s.daten.values()].filter((d) => d.sequenceStep === 0);
    assert.equal(offen.length, 10, "die übrigen zehn bleiben für den nächsten Lauf fällig");
    assert.ok([...s.daten.values()].filter((d) => d.sequenceStep === 1).every((d) => d.letzterVersandAt === doc.nextSendAt));
});

test("sequenzLauf: zwei überlappende Läufe versenden keinen Schritt doppelt", async () => {
    const doc = bestaetigtesDoc();
    const s = speicherDoppel(Array.from({ length: 5 }, () => doc), doc.nextSendAt);
    const [a, b] = await Promise.all([ew.sequenzLauf(s.deps()), ew.sequenzLauf(s.deps())]);
    assert.equal(a.gesendet + b.gesendet, 5);
    assert.equal(new Set(s.gesendet).size, s.gesendet.length);
    assert.equal(a.uebersprungen + b.uebersprungen, 5);
});

test("sequenzLauf: unbestätigt / widerrufen / gestoppt / abgeschlossen → nichts versendet", async () => {
    const doc = bestaetigtesDoc();
    const t = doc.nextSendAt;
    const s = speicherDoppel([
        { ...doc, confirmedAt: null },
        { ...doc, revokedAt: t - 1000, stopped: true },
        { ...doc, stopped: true },
        { ...doc, sequenceStep: 3 }
    ], t);
    const bericht = await ew.sequenzLauf(s.deps());
    assert.equal(bericht.versuche, 0);
    assert.equal(bericht.gesendet, 0);
    assert.equal(s.gesendet.length, 0);
    // Gegenprobe: dasselbe bestätigte Dokument ohne Sperre wird versendet
    const erlaubt = speicherDoppel([doc], t);
    assert.equal((await ew.sequenzLauf(erlaubt.deps())).gesendet, 1);
});

test("sequenzLauf: Versandfehler wird gemeldet und vermerkt, nicht verschluckt", async () => {
    const doc = bestaetigtesDoc();
    const t = doc.nextSendAt;
    const s = speicherDoppel([doc, doc], t);
    const logs = [];
    let n = 0;
    const bericht = await ew.sequenzLauf(s.deps({
        sende: async (anspruch) => {
            n++;
            if (n === 1) {
                const e = new Error("535 Authentication failed");
                e.code = "EAUTH";
                throw e;
            }
            s.gesendet.push(anspruch.id);
        },
        log: (stufe, nachricht, kontext) => logs.push({ stufe, nachricht, kontext })
    }));
    assert.equal(bericht.fehler, 1);
    assert.equal(bericht.gesendet, 1);
    assert.ok(logs.some((l) => l.stufe === "error" && l.kontext.code === "EAUTH"), "Fehler muss geloggt werden");
    const c0 = s.daten.get("c0");
    assert.equal(c0.sequenceStep, 0, "sicher nicht zugestellt → Schritt zurückgegeben");
    assert.equal(c0.fehlversuche, 1);
    assert.ok(c0.nextSendAt > t);
    assert.equal(s.daten.get("c1").sequenceStep, 1);
});

test("sequenzLauf: Zeitbudget beendet den Lauf VOR einer neuen Beanspruchung (Gegenprobe: ohne Budget alle)", async () => {
    const doc = bestaetigtesDoc();
    let jetzt = 0;
    const s = speicherDoppel(Array.from({ length: 5 }, () => doc), doc.nextSendAt);
    const logs = [];
    const bericht = await ew.sequenzLauf(s.deps({
        fristMs: 1000,
        uhr: () => jetzt,
        sende: async (anspruch) => { jetzt += 400; s.gesendet.push(anspruch.id); },
        log: (stufe, nachricht) => logs.push({ stufe, nachricht })
    }));
    assert.equal(bericht.zeitGedeckelt, true);
    assert.equal(bericht.gesendet, 3, "nach 1200 ms keine neue Beanspruchung");
    assert.equal([...s.daten.values()].filter((d) => d.sequenceStep === 1).length, 3, "kein gezählter Schritt ohne Versandversuch");
    assert.ok(logs.some((l) => l.stufe === "warn" && /Zeitbudget/.test(l.nachricht)));
    const ohne = speicherDoppel(Array.from({ length: 5 }, () => doc), doc.nextSendAt);
    const b2 = await ew.sequenzLauf(ohne.deps({ uhr: () => (jetzt += 400) }));
    assert.equal(b2.gesendet, 5);
    assert.equal(b2.zeitGedeckelt, false);
});

test("sperrDomainsFuer: Website und Host der Adresse, ASCII und Unicode; nichts Erfundenes", () => {
    assert.deepEqual(ew.sperrDomainsFuer({ domain: "beispiel.de", email: "info@beispiel.de" }), ["beispiel.de"]);
    assert.deepEqual(ew.sperrDomainsFuer({ domain: "betrieb.de", email: "inhaber@web.de" }), ["betrieb.de", "web.de"]);
    assert.deepEqual(ew.sperrDomainsFuer({ domain: "xn--mller-bau-q9a.de", email: "a@xn--mller-bau-q9a.de" }), ["xn--mller-bau-q9a.de", "müller-bau.de"]);
    assert.deepEqual(ew.sperrDomainsFuer({ domain: null, email: "kaputt" }), []);
    assert.deepEqual(ew.sperrDomainsFuer(null), []);
});

// ─── Mailer ─────────────────────────────────────────────────────────────────

test("versandSicherNichtErfolgt: nur eindeutige Fehler geben einen gezählten Schritt zurück", () => {
    const f = (props) => Object.assign(new Error(props.message || "x"), props);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "EAUTH", command: "AUTH PLAIN", responseCode: 535 })), true);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "EKONFIG" })), true);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550 })), true);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "EMESSAGE", command: "DATA", responseCode: 554 })), true);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "ESOCKET", command: "CONN", syscall: "connect", message: "connect ECONNREFUSED 127.0.0.1:25" })), true);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "ETIMEDOUT", command: "CONN", message: "Connection timeout" })), true);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "ETIMEDOUT", command: "CONN", message: "Greeting never received" })), true);
    // Gegenproben in der Form, die nodemailer WIRKLICH liefert (Prüfung vom 10.09.: die
    // Erstfassung erklärte ECONNECTION und jedes command 'CONN' für sicher nicht zugestellt;
    // ihr Fixture {ETIMEDOUT, command:'DATA'} kommt in nodemailer nie vor und bestand deshalb
    // aus dem falschen Grund). Unklar, ob die Mail schon draußen ist:
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "ETIMEDOUT", command: "CONN", message: "Timeout" })), false);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "ECONNECTION", command: "CONN", message: "Connection closed unexpectedly" })), false);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "ESOCKET", command: "CONN", syscall: "read", message: "read ECONNRESET" })), false);
    assert.equal(mailer.versandSicherNichtErfolgt(f({ code: "ESOCKET" })), false);
    assert.equal(mailer.versandSicherNichtErfolgt(f({})), false);
    assert.equal(mailer.versandSicherNichtErfolgt(null), false);
});

// Eichung an der echten Bibliothek: ein SMTP-Doppel auf 127.0.0.1, das sich nach dem
// Nachrichtenende falsch verhält. Hängt oder legt es auf, NACHDEM die Nachricht übertragen
// ist, darf der Schritt nicht zurückgegeben werden (sonst droht eine vierte E-Mail).
test("versandSicherNichtErfolgt an echtem nodemailer: Hänger/Auflegen nach DATA = unklar, Ablehnung/connect-Fehler = sicher", async () => {
    const net = require("node:net");
    const nodemailer = require("nodemailer");
    const doppel = (verhalten) => new Promise((resolve) => {
        const server = net.createServer((sock) => {
            sock.on("error", () => {});
            sock.write("220 doppel ESMTP\r\n");
            let imText = false;
            let puffer = "";
            sock.on("data", (d) => {
                puffer += d.toString();
                let i;
                while ((i = puffer.indexOf("\r\n")) >= 0) {
                    const zeile = puffer.slice(0, i);
                    puffer = puffer.slice(i + 2);
                    if (imText) {
                        if (zeile !== ".") continue;
                        imText = false;
                        if (verhalten === "haengt") continue;
                        if (verhalten === "legt-auf") { sock.destroy(); return; }
                        sock.write(verhalten === "lehnt-ab" ? "554 abgelehnt\r\n" : "250 OK\r\n");
                        continue;
                    }
                    const befehl = zeile.toUpperCase();
                    if (befehl.startsWith("EHLO")) sock.write("250-doppel\r\n250 OK\r\n");
                    else if (befehl === "DATA") { sock.write("354 los\r\n"); imText = true; }
                    else if (befehl === "QUIT") { sock.write("221 tschuess\r\n"); sock.end(); }
                    else sock.write("250 OK\r\n");
                }
            });
        });
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
    const versuch = async (port) => {
        const t = nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, ignoreTLS: true, connectionTimeout: 400, greetingTimeout: 400, socketTimeout: 400 });
        try {
            await t.sendMail({ from: "a@beispiel.de", to: "b@beispiel.de", subject: "s", text: "t" });
            return null;
        } catch (err) {
            return err;
        }
    };
    const ergebnisse = {};
    for (const v of ["haengt", "legt-auf", "lehnt-ab"]) {
        const server = await doppel(v);
        ergebnisse[v] = await versuch(server.address().port);
        await new Promise((r) => server.close(r));
    }
    const frei = await doppel("ok");
    const freierPort = frei.address().port;
    await new Promise((r) => frei.close(r));
    ergebnisse.abgelehnt = await versuch(freierPort);

    for (const [v, err] of Object.entries(ergebnisse)) assert.ok(err, `${v}: Versand muss scheitern`);
    assert.equal(mailer.versandSicherNichtErfolgt(ergebnisse.haengt), false, `Hänger nach DATA (${ergebnisse.haengt.code}/${ergebnisse.haengt.command})`);
    assert.equal(mailer.versandSicherNichtErfolgt(ergebnisse["legt-auf"]), false, `Auflegen nach DATA (${ergebnisse["legt-auf"].code}/${ergebnisse["legt-auf"].command})`);
    assert.equal(mailer.versandSicherNichtErfolgt(ergebnisse["lehnt-ab"]), true, "554 nach DATA");
    assert.equal(mailer.versandSicherNichtErfolgt(ergebnisse.abgelehnt), true, `Verbindung abgelehnt (${ergebnisse.abgelehnt.code}/${ergebnisse.abgelehnt.syscall})`);
});

test("sendeMail: Kopfzeilen kommen an; Header-Injection und abgelehnte Empfänger werfen, ohne zu senden", async () => {
    const aufrufe = [];
    const transport = { sendMail: async (msg) => { aufrufe.push(msg); return { accepted: [msg.to], rejected: [] }; } };
    await mailer.sendeMail(transport, {
        to: "a@beispiel.de", subject: "Betreff", text: "t", html: "<p>t</p>",
        headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    });
    assert.equal(aufrufe[0].from, '"Karriaro Webdesign" <noreply@karriaro.de>');
    assert.equal(aufrufe[0].replyTo, "kontakt@karriaro.de");
    assert.equal(aufrufe[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

    await assert.rejects(mailer.sendeMail(transport, { to: "a@beispiel.de\r\nBcc: x@y.de", subject: "s", text: "t" }), { code: "EENVELOPE" });
    await assert.rejects(mailer.sendeMail(transport, { to: "a@beispiel.de", subject: "s\nBcc: x", text: "t" }), { code: "EENVELOPE" });
    await assert.rejects(mailer.sendeMail(transport, { to: "a@beispiel.de", subject: "s", text: "t", headers: { "X-Test": "a\r\nBcc: x" } }), { code: "EENVELOPE" });
    assert.equal(aufrufe.length, 1, "nach Injection-Versuchen darf nichts versendet worden sein");

    const ablehnend = { sendMail: async (msg) => ({ accepted: [], rejected: [msg.to] }) };
    await assert.rejects(
        mailer.sendeMail(ablehnend, { to: "a@beispiel.de", subject: "s", text: "t" }),
        (e) => e.code === "EENVELOPE" && mailer.versandSicherNichtErfolgt(e) === true
    );
    await assert.rejects(mailer.sendeMail(null, { to: "a@beispiel.de", subject: "s", text: "t" }), { code: "EKONFIG" });
});

test("erzeugeTransport: gebundene Timeouts; fehlender Zugang → EKONFIG", () => {
    let optionen = null;
    mailer.erzeugeTransport({ host: "smtp.beispiel.de", user: "u", pass: "p" }, { erzeuge: (o) => { optionen = o; return {}; } });
    assert.equal(optionen.host, "smtp.beispiel.de");
    assert.equal(optionen.port, 587);
    assert.equal(optionen.connectionTimeout, 8000);
    assert.equal(optionen.greetingTimeout, 8000);
    assert.equal(optionen.socketTimeout, 12000);
    assert.deepEqual(optionen.auth, { user: "u", pass: "p" });
    assert.throws(() => mailer.erzeugeTransport({ host: "h", user: "u", pass: "" }), { code: "EKONFIG" });
});

// ─── Abmelden, Pseudonymisierung, Zeitfelder, Pflicht-Nachweis ──────────────

test("istOneClickBody: RFC 8058 urlencoded (geparst/roh) und multipart; Gegenproben", () => {
    assert.equal(ew.istOneClickBody({ body: { "List-Unsubscribe": "One-Click" } }), true);
    assert.equal(ew.istOneClickBody({ body: { "List-Unsubscribe": "One-Click", quelle: "seite" } }), true);
    assert.equal(ew.istOneClickBody({ body: {}, rawBody: Buffer.from("List-Unsubscribe=One-Click") }), true);
    const multipart = '--b1\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--b1--\r\n';
    assert.equal(ew.istOneClickBody({ body: {}, rawBody: Buffer.from(multipart) }), true);
    const falsch = [
        { body: {} },
        { body: { "List-Unsubscribe": "Nein" } },
        { rawBody: Buffer.from("List-Unsubscribe=One-Clicks") },
        { rawBody: Buffer.from("x=List-Unsubscribe=One-Click") },
        {}
    ];
    for (const f of falsch) assert.equal(ew.istOneClickBody(f), false, JSON.stringify(f));
});

test("Pseudonymisierung: IP-Hash schlüsselgebunden, IP gekürzt, User-Agent nur als Klasse", () => {
    const h = ew.pseudonymisiereIp("203.0.113.42", "geheim");
    assert.match(h, /^[a-f0-9]{32}$/);
    assert.equal(h, ew.pseudonymisiereIp("203.0.113.42", "geheim"));
    assert.notEqual(h, ew.pseudonymisiereIp("203.0.113.42", "anderer-schluessel"));
    assert.notEqual(h, ew.pseudonymisiereIp("203.0.113.43", "geheim"));
    assert.equal(ew.pseudonymisiereIp("203.0.113.42", ""), null, "ohne Schlüssel kein Ersatzwert");
    assert.equal(ew.pseudonymisiereIp("unknown", "geheim"), null);

    assert.equal(ew.kuerzeIp("203.0.113.42"), "203.0.113.0");
    assert.equal(ew.kuerzeIp("::ffff:198.51.100.7"), "198.51.100.0");
    assert.equal(ew.kuerzeIp("2001:db8:abcd:12:ffff::1"), "2001:db8:abcd::");
    assert.equal(ew.kuerzeIp("2001:0db8::1"), "2001:db8:0::");
    assert.equal(ew.kuerzeIp("999.1.1.1"), null);
    assert.equal(ew.kuerzeIp("unknown"), null);
    assert.equal(ew.kuerzeIp(""), null);

    assert.equal(ew.uaKlasse("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), "mobil");
    assert.equal(ew.uaKlasse("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
    assert.equal(ew.uaKlasse("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Safari/537.36"), "tablet");
    assert.equal(ew.uaKlasse("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36"), "mobil");
    assert.equal(ew.uaKlasse("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15"), "desktop");
    assert.equal(ew.uaKlasse("Googlebot/2.1 (+http://www.google.com/bot.html)"), "bot");
    assert.equal(ew.uaKlasse(""), "unbekannt");
});

test("Zeitfelder: Firestore-Timestamp ↔ ms verlustfrei; fehlende Felder werden nicht erfunden", () => {
    const fakeTs = (m) => ({ toMillis: () => m, istTimestamp: true });
    const doc = bestaetigtesDoc();
    const alsTs = ew.zeitfelderZuTimestamp(doc, fakeTs);
    assert.equal(alsTs.confirmedAt.istTimestamp, true);
    assert.equal(alsTs.expiresAt.istTimestamp, true);
    assert.equal(alsTs.revokedAt, null);
    assert.equal(alsTs.email, doc.email);
    const zurueck = ew.zeitfelderZuMs(alsTs);
    for (const f of ew.ZEITFELDER) assert.equal(zurueck[f], doc[f] ?? null, f);
    assert.deepEqual(ew.zeitfelderZuTimestamp({ sequenceStep: 1 }, fakeTs), { sequenceStep: 1 });
    assert.equal(ew.zeitfelderZuMs({ createdAt: { seconds: 1, nanoseconds: 5e8 } }).createdAt, 1500);
    assert.equal(ew.zeitfelderZuMs({ createdAt: "gestern" }).createdAt, null);
});

test("pflichtNachweis: bekanntes Formular → Stand; mitgeschickte Version gewinnt; unbekannt → alles null", () => {
    assert.deepEqual(ew.pflichtNachweis("sofort-skizze"), {
        formular: "sofort-skizze", wortlautVersion: "sofort-skizze-2026-09-10", wortlaut: ew.PFLICHT_WORTLAUTE["sofort-skizze"].text
    });
    assert.deepEqual(ew.pflichtNachweis(null), { formular: null, wortlautVersion: null, wortlaut: null });
    assert.deepEqual(ew.pflichtNachweis("__proto__"), { formular: null, wortlautVersion: null, wortlaut: null });
    assert.deepEqual(ew.pflichtNachweis("website-pruefen", { version: "website-pruefen-2026-10-01" }), {
        formular: "website-pruefen", wortlautVersion: "website-pruefen-2026-10-01", wortlaut: null
    });
    assert.equal(ew.pflichtNachweis("startseite", { version: "<script>" }).wortlautVersion, "startseite-2026-09-10");
});

test("formularFuerRequestAudit: ausdrücklich gewinnt; sonst über `landing` hergeleitet — und als Herleitung markiert", () => {
    assert.deepEqual(ew.formularFuerRequestAudit({ consentSource: "website-pruefen", landing: "/" }), { formular: "website-pruefen", herleitung: "explizit" });
    assert.deepEqual(ew.formularFuerRequestAudit({ consentSource: "startseite" }), { formular: "startseite", herleitung: "explizit" });
    assert.deepEqual(ew.formularFuerRequestAudit({ landing: "/?utm_source=google" }), { formular: "startseite", herleitung: "landing-feld" });
    // Gegenproben: ohne landing (Formular /website-pruefen) und mit unbekannter Quelle
    assert.deepEqual(ew.formularFuerRequestAudit({}), { formular: "website-pruefen", herleitung: "ohne-landing" });
    assert.deepEqual(ew.formularFuerRequestAudit({ consentSource: "sofort-skizze", landing: "  " }), { formular: "website-pruefen", herleitung: "ohne-landing" });
    // Die Herleitung stimmt mit den ausgelieferten Formularen überein
    const magic = fs.readFileSync(path.join(WEB, "src", "js", "audit-magic-moment.js"), "utf8");
    assert.match(magic, /attribution\(\),/, "Startseite mischt die Attribution in den requestAudit-Aufruf");
    // Substanz statt Schreibweise: `landing` steht in der Feldliste von krAttributionFlat (weitere Felder dürfen dazukommen)
    assert.match(fs.readFileSync(path.join(WEB, "src", "js", "attribution.js"), "utf8"), /krAttributionFlat = function[\s\S]{0,200}?concat\(\[[^\]]*'landing'[^\]]*\]\)/);
    const pruefen = fs.readFileSync(path.join(WEB, "src", "website-pruefen.html"), "utf8");
    const start = pruefen.indexOf("fetch(FN_BASE + '/requestAudit'");
    assert.ok(start > 0);
    assert.doesNotMatch(pruefen.slice(Math.max(0, start - 1500), start), /landing|krAttributionFlat/, "/website-pruefen darf kein landing senden, sonst kippt die Herleitung");
});

function sichtbarerQuelltext(roh) {
    return roh
        .replace(/'\s*\+\s*'/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s+([.,)])/g, "$1")
        .replace(/\(\s+/g, "(");
}

test("Pflicht-Wortlaute stehen so in den ausgelieferten Formularen (sonst neue Version anlegen)", () => {
    const quellen = {
        "website-pruefen": "src/website-pruefen.html",
        "startseite": "src/js/audit-magic-moment.js",
        "sofort-skizze": "src/sofort-skizze.html"
    };
    for (const [formular, datei] of Object.entries(quellen)) {
        const text = sichtbarerQuelltext(fs.readFileSync(path.join(WEB, datei), "utf8"));
        assert.ok(text.includes(ew.PFLICHT_WORTLAUTE[formular].text), `${datei}: Wortlaut der Pflicht-Checkbox weicht vom gespeicherten Nachweis ab`);
    }
});

// ─── Verdrahtung ────────────────────────────────────────────────────────────

const INDEX = () => fs.readFileSync(path.join(WEB, "functions", "index.js"), "utf8");

test("Verdrahtung: Hosting-Rewrites zeigen auf exportierte Functions in europe-west1", () => {
    const fb = JSON.parse(fs.readFileSync(path.join(WEB, "firebase.json"), "utf8"));
    const rw = fb.hosting.rewrites;
    assert.deepEqual(rw.find((r) => r.source === "/einwilligung").function, { functionId: "einwilligungBestaetigen", region: "europe-west1" });
    assert.deepEqual(rw.find((r) => r.source === "/abmelden").function, { functionId: "abmelden", region: "europe-west1" });
    const index = INDEX();
    for (const name of ["einwilligungAnfordern", "einwilligungBestaetigen", "abmelden", "einwilligungSequenz"]) {
        assert.match(index, new RegExp(`^exports\\.${name} = on(Request|Schedule)\\(`, "m"), `index.js exportiert ${name} nicht`);
    }
    // Gegenprobe: jedes Rewrite-Ziel existiert als Export (sonst scheitert der Hosting-Deploy)
    for (const r of rw.filter((x) => x.function)) {
        assert.match(index, new RegExp(`^exports\\.${r.function.functionId} = `, "m"), `Rewrite ${r.source} → ${r.function.functionId} ohne Export`);
    }
});

test("Verdrahtung: Zeitplan täglich 10:00 Europe/Berlin in europe-west1", () => {
    const index = INDEX();
    const start = index.indexOf("exports.einwilligungSequenz = onSchedule(");
    assert.ok(start > 0);
    const kopf = index.slice(start, start + 700);
    assert.match(kopf, /schedule:\s*"0 10 \* \* \*"/);
    assert.match(kopf, /timeZone:\s*"Europe\/Berlin"/);
    assert.match(kopf, /region:\s*"europe-west1"/);
});

test("trackLeadView: keine rohe IP, User-Agent nur als Klasse, expiresAt an jedem visits-Dokument", () => {
    const index = INDEX();
    const start = index.indexOf("exports.trackLeadView = onRequest(");
    const block = index.slice(start, index.indexOf("\nexports.", start + 10));
    assert.match(block, /collection\("visits"\)\.add\(/);
    assert.doesNotMatch(block, /\bip:\s*\(req\.ip/);
    assert.doesNotMatch(block, /\bua:\s*\(req\.headers/);
    assert.match(block, /kuerzeIp\(/);
    assert.match(block, /uaKlasse\(/);
    assert.match(block, /expiresAt:/);
});

function exportBlock(index, name) {
    const s = index.indexOf(`exports.${name} = on`);
    assert.ok(s >= 0, `exports.${name} fehlt`);
    const e = index.indexOf("\nexports.", s + 10);
    return index.slice(s, e > 0 ? e : undefined);
}

test("index.js: kein Köln-Bezug; Audit-Mail ohne Termin-Einladung; Einwilligung nur bei marketingConsent === true", () => {
    const index = INDEX();
    assert.doesNotMatch(index, /Köln/);
    const start = index.indexOf("async function sendAuditMail(");
    const audit = index.slice(start, index.indexOf("\n}\n", start));
    assert.doesNotMatch(audit, /buchen|Gespräch/, "sachliche Zustellung des Berichts");
    assert.match(audit, /Bei Fragen zum Bericht/);
    for (const fn of ["requestAudit", "sofortLead"]) {
        const b = exportBlock(index, fn);
        assert.match(b, /const werbungGewuenscht = marketingConsent === true;/, fn);
        assert.match(b, /werbungGewuenscht\s*\?\s*(?:await\s+)?fordereEinwilligungAn\(/, fn);
        assert.match(b, /pflichtEinwilligung:\s*\{/, fn);
    }
    // Gegenprobe für den Wächter selbst: ein lockerer Vergleich würde "true" als String durchlassen
    assert.doesNotMatch("const werbungGewuenscht = !!marketingConsent;", /marketingConsent === true/);
    // requestAudit meldet auch eine fehlgeschlagene Analyse an den Gründer
    assert.match(exportBlock(index, "requestAudit"), /pipelineFehler: true/);
    // sofortLead verspricht dem Interessenten keine Zeit und keinen Termin
    const sofort = exportBlock(index, "sofortLead");
    assert.doesNotMatch(sofort, /in Kürze|Erstgespräch/);
    assert.match(sofort, /Sie erhalten eine persönliche Antwort\./);
});

/** Steht der Ergebnis-Write in einem try, dessen catch den gemeinsamen Fehler-Ausgang nimmt? */
function ergebnisWriteAbgesichert(block) {
    const speichern = block.indexOf('status: "completed"');
    if (speichern < 0) return false;
    const tryStart = block.lastIndexOf("try {", speichern);
    const vorher = block.slice(tryStart, speichern);
    if (!/^try \{\s*await db\.collection\("auditRequests"\)\.doc\(slug\)\.set\(\{\s*techAge:/.test(vorher)) return false;
    const nachher = block.slice(speichern, block.indexOf("await notifyFounderOnReportInbound({", speichern));
    return /\}, \{ merge: true \}\);\s*\} catch \(err\) \{[\s\S]*?return analyseFehlgeschlagen\(err, "ergebnis-speichern"\);/.test(nachher);
}

test("requestAudit: Pipeline- UND Speicher-Fehler nehmen denselben Ausgang (Gründer-Mail, abgewartete Einwilligung, 502)", () => {
    const index = INDEX();
    const b = exportBlock(index, "requestAudit");
    const helfer = b.indexOf("const analyseFehlgeschlagen = async (err, stufe) =>");
    const pipeline = b.indexOf("await runAuditPipeline(");
    const lauf = b.indexOf("const einwilligungLauf = werbungGewuenscht");
    assert.ok(lauf > 0 && helfer > lauf && pipeline > helfer, "Helfer nach dem Einwilligungs-Lauf, vor der Pipeline");
    assert.match(b, /\} catch \(err\) \{\s*return analyseFehlgeschlagen\(err, "pipeline"\);\s*\}/);
    assert.equal(ergebnisWriteAbgesichert(b), true, "Ergebnis-Write abgesichert");

    const helferBlock = b.slice(helfer, pipeline);
    for (const muss of [/await einwilligungLauf/, /pipelineFehler: true/, /leadGespeichert: skelettGespeichert/, /res\.status\(502\)/]) {
        assert.match(helferBlock, muss);
    }
    // Das Flag wird erst NACH einem gelungenen Skelett-Write gesetzt
    assert.match(b, /let skelettGespeichert = false;\s*try \{\s*await db\.collection\("auditRequests"\)\.doc\(slug\)\.set\(\{\s*slug,/);
    assert.match(b, /werbeEinwilligungAngefragt: werbungGewuenscht\s*\}, \{ merge: true \}\);\s*skelettGespeichert = true;/);

    // Reihenfolge im Erfolgsfall: Ergebnis speichern → Gründer → Bericht
    const speichern = b.indexOf('status: "completed"');
    const gruender = b.indexOf("await notifyFounderOnReportInbound({", speichern);
    const bericht = b.indexOf("await sendAuditMail(", speichern);
    assert.ok(speichern > pipeline && gruender > speichern && bericht > gruender);

    // Gründer-Mail behauptet den Speicherstand nur, wenn er gemeldet wurde (dreiwertig)
    const nStart = index.indexOf("async function notifyFounderOnReportInbound(");
    const notify = index.slice(nStart, index.indexOf("\n}\n", nStart));
    assert.match(notify, /payload\.leadGespeichert === true/);
    assert.match(notify, /payload\.leadGespeichert === false/);
    assert.match(notify, /nicht bekannt/);

    // Mutationsprobe: ohne das try um den Ergebnis-Write MUSS der Wächter fallen
    const mutant = b.replace(/try \{\s*(await db\.collection\("auditRequests"\)\.doc\(slug\)\.set\(\{\s*techAge:)/, "$1");
    assert.notEqual(mutant, b, "Mutation hat gegriffen");
    assert.equal(ergebnisWriteAbgesichert(mutant), false);
});

test("sofortLead: Einwilligung und Eingangsbestätigung parallel; Gründer-Mail danach mit dem Stand der Einwilligung", () => {
    const b = exportBlock(INDEX(), "sofortLead");
    const lauf = b.indexOf("const einwilligungLauf = werbungGewuenscht");
    const eingang = b.indexOf("const eingangsbestaetigung =");
    const warten = b.indexOf("await Promise.all([einwilligungLauf, eingangsbestaetigung])");
    const gruender = b.indexOf("Neuer Lead aus der Sofort-Skizze.");
    assert.ok(lauf > 0 && eingang > lauf && warten > eingang && gruender > warten, "Reihenfolge Lauf → Eingang → warten → Gründer");
    assert.doesNotMatch(b.slice(lauf, eingang), /await\s+fordereEinwilligungAn/, "die Anforderung wird nicht seriell abgewartet");
    // Die Eingangsbestätigung lehnt nie ab (sonst risse Promise.all die Gründer-Mail mit)
    assert.match(b.slice(eingang, warten), /\}\)\.then\(\s*\(\) => logger\.info\("sofortLead confirmation mail sent"[\s\S]*?\(err\) => logger\.error\("sofortLead confirmation mail failed"/);
    assert.match(b.slice(gruender - 400, b.indexOf("return res.json", gruender)), /werbeEinwilligungText\(einwilligungErgebnis\)/);
    assert.match(b, /timeoutSeconds: 60,/);
});

test("TTL-Skript: consents und visits (Collection-Group) haben eine Policy auf expiresAt", () => {
    const sh = fs.readFileSync(path.join(WEB, "scripts", "setup-firestore-ttl.sh"), "utf8");
    const zeile = sh.split("\n").find((l) => /^for collection in /.test(l));
    const liste = zeile.replace(/^for collection in /, "").replace(/; do$/, "").split(/\s+/);
    for (const c of ["consents", "visits", "auditRequests", "sofortLeads"]) assert.ok(liste.includes(c), c);
    assert.match(sh, /--collection-group="\$\{collection\}"/);
});

// ─── Endpunkte durchlaufen (Wirkung statt Quelltext-Muster) ─────────────────
//
// Die Handler aus index.js laufen gegen ein Firestore-Doppel und einen
// Test-Transport. Gemessen wird, was danach im Speicher steht und welche Mails
// hinausgehen — so fällt auch eine Schema-Drift zwischen Bibliothek und
// Endpunkt auf (z. B. Zeitfelder, die nicht als Timestamp ankommen).

function firestoreDoppel(Timestamp) {
    const speicher = new Map();
    let naechsteId = 0;
    let kette = Promise.resolve();
    const wert = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v);
    const aufloesen = (v, alt) => {
        if (!v || typeof v !== "object") return v;
        const art = v.constructor && v.constructor.name;
        if (art === "ServerTimestampTransform") return Timestamp.now();
        if (art === "NumericIncrementTransform") return (typeof alt === "number" ? alt : 0) + v.operand;
        if (Object.getPrototypeOf(v) !== Object.prototype) return v;
        const out = {};
        for (const [k, w] of Object.entries(v)) out[k] = aufloesen(w, alt && typeof alt === "object" ? alt[k] : undefined);
        return out;
    };
    const schreibe = (pfad, daten, { merge = false, mussExistieren = false } = {}) => {
        const alt = speicher.get(pfad);
        if (mussExistieren && !alt) throw Object.assign(new Error(`NOT_FOUND: ${pfad}`), { code: 5 });
        const neu = merge && alt ? { ...alt } : {};
        for (const [k, v] of Object.entries(daten)) neu[k] = aufloesen(v, alt ? alt[k] : undefined);
        speicher.set(pfad, neu);
    };
    const schnappschuss = (sammlung, id) => {
        const daten = speicher.get(`${sammlung}/${id}`);
        return { id, ref: dokument(sammlung, id), exists: daten !== undefined, data: () => (daten === undefined ? undefined : { ...daten }) };
    };
    function dokument(sammlung, id) {
        const pfad = `${sammlung}/${id}`;
        return {
            id,
            path: pfad,
            get: async () => schnappschuss(sammlung, id),
            set: async (d, opt = {}) => schreibe(pfad, d, opt),
            update: async (d) => schreibe(pfad, d, { merge: true, mussExistieren: true }),
            collection: (name) => abfrage(`${pfad}/${name}`)
        };
    }
    function abfrage(sammlung, filter = [], ordnung = null, grenze = Infinity) {
        return {
            doc: (id) => dokument(sammlung, id || `doc${++naechsteId}`),
            add: async (d) => {
                const r = dokument(sammlung, `doc${++naechsteId}`);
                schreibe(r.path, d);
                return r;
            },
            where: (feld, op, v) => abfrage(sammlung, [...filter, [feld, op, v]], ordnung, grenze),
            orderBy: (feld) => abfrage(sammlung, filter, feld, grenze),
            limit: (n) => abfrage(sammlung, filter, ordnung, n),
            get: async () => {
                let docs = [...speicher.keys()]
                    .filter((p) => p.startsWith(`${sammlung}/`) && !p.slice(sammlung.length + 1).includes("/"))
                    .map((p) => schnappschuss(sammlung, p.slice(sammlung.length + 1)))
                    .filter((s) => filter.every(([feld, op, v]) => {
                        const a = wert(s.data()[feld]);
                        if (op === "==") return a === wert(v);
                        if (op === "<=") return a != null && a <= wert(v);
                        throw new Error(`Operator ${op} ist im Doppel nicht nachgebildet`);
                    }));
                if (ordnung) docs.sort((x, y) => wert(x.data()[ordnung]) - wert(y.data()[ordnung]));
                docs = docs.slice(0, grenze);
                return { empty: docs.length === 0, size: docs.length, docs };
            }
        };
    }
    return {
        speicher,
        collection: (name) => abfrage(name),
        // Serialisiert wie eine Transaktion: erst lesen, Schreibvorgänge gepuffert am Ende.
        runTransaction: (fn) => {
            const lauf = kette.then(async () => {
                const puffer = [];
                const tx = {
                    get: (x) => x.get(),
                    set: (ref, d, opt = {}) => { puffer.push(() => schreibe(ref.path, d, opt)); return tx; },
                    update: (ref, d) => { puffer.push(() => schreibe(ref.path, d, { merge: true, mussExistieren: true })); return tx; }
                };
                const ergebnis = await fn(tx);
                for (const f of puffer) f();
                return ergebnis;
            });
            kette = lauf.catch(() => {});
            return lauf;
        }
    };
}

let UMGEBUNG = null;
/** Lädt index.js einmal mit Firestore-Doppel, Test-Transport und mitschreibendem Logger; leert je Test. */
function umgebung() {
    if (!UMGEBUNG) {
        process.env.SMTP_HOST = "smtp.test.invalid";
        process.env.SMTP_USER = "test";
        process.env.SMTP_PASS = "test-geheimnis";
        const admin = require("firebase-admin");
        const { Timestamp, FieldValue } = admin.firestore;
        const db = firestoreDoppel(Timestamp);
        const firestore = () => db;
        firestore.Timestamp = Timestamp;
        firestore.FieldValue = FieldValue;
        Object.defineProperty(admin, "firestore", { value: firestore, configurable: true, writable: true });
        if (!admin.apps.length) admin.initializeApp({ projectId: "demo-einwilligung" });
        const postausgang = [];
        const logs = [];
        const schalter = { sendeFehler: null };
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = () => ({
            sendMail: async (m) => {
                if (schalter.sendeFehler) throw schalter.sendeFehler;
                postausgang.push(m);
                return { accepted: [m.to], rejected: [] };
            }
        });
        const logger = require("../lib/logger.js");
        for (const stufe of ["debug", "info", "notice", "warn", "error", "critical"]) {
            logger[stufe] = (nachricht, kontext = {}) => { logs.push({ stufe, nachricht, kontext }); };
        }
        const idx = require("../index.js");
        UMGEBUNG = { admin, Timestamp, db, idx, postausgang, logs, schalter };
    }
    UMGEBUNG.db.speicher.clear();
    UMGEBUNG.postausgang.length = 0;
    UMGEBUNG.logs.length = 0;
    UMGEBUNG.schalter.sendeFehler = null;
    return UMGEBUNG;
}

require("node:test").after(async () => {
    if (UMGEBUNG) await Promise.all(UMGEBUNG.admin.apps.filter(Boolean).map((a) => a.delete()));
});

async function rufe(handler, { method = "POST", query = {}, body = {}, rawBody = undefined, ip = "203.0.113.9" } = {}) {
    const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        on() {},
        setHeader(k, v) { this.headers[k] = v; },
        getHeader(k) { return this.headers[k]; },
        set(k, v) { this.headers[k] = v; return this; },
        status(c) { this.statusCode = c; return this; },
        send(b) { this.body = b; return this; },
        json(b) { this.body = b; return this; },
        end() { return this; }
    };
    await handler({ method, query, body, rawBody, headers: { "x-forwarded-for": ip }, ip }, res);
    return res;
}

const dokumenteIn = (u, sammlung) => [...u.db.speicher.entries()]
    .filter(([p]) => p.startsWith(`${sammlung}/`) && !p.slice(sammlung.length + 1).includes("/"))
    .map(([p, d]) => ({ id: p.slice(sammlung.length + 1), ...d }));
const einwilligungenIn = (u) => dokumenteIn(u, "consents");
const mailsAn = (u, an) => u.postausgang.filter((m) => m.to === an);
const tokenAusMail = (mail, pfad) => ((mail && String(mail.text).match(new RegExp(`/${pfad}\\?t=([A-Za-z0-9_-]{43})`))) || [])[1] || null;
const frisch = (u, id) => ({ id, ...u.db.speicher.get(`consents/${id}`) });
const setze = (u, id, felder) => Object.assign(u.db.speicher.get(`consents/${id}`), felder);
const vorMs = (u, zurueck) => u.Timestamp.fromMillis(Date.now() - zurueck);

async function fordereAn(u, email, extra = {}) {
    const vorher = u.postausgang.length;
    const res = await rufe(u.idx.einwilligungAnfordern, {
        body: { email, domain: "https://www.beispiel.de", source: "website-pruefen", consentVersion: "2026-09-10", ...extra }
    });
    const mail = u.postausgang.slice(vorher).find((m) => m.to === email.toLowerCase() && /einwilligung\?t=/.test(m.text));
    const token = tokenAusMail(mail, "einwilligung");
    const doc = token ? einwilligungenIn(u).find((d) => d.confirmTokenHash === ew.hashToken(token)) : null;
    return { res, mail, token, doc };
}
const klickeBestaetigen = (u, token) => rufe(u.idx.einwilligungBestaetigen, { method: "POST", query: { t: token }, body: { bestaetigen: "1" } });

test("Endpunkt einwilligungAnfordern: V4-Dokument mit Timestamps, nur der Token-Hash, genau eine werbefreie Bestätigungsmail", async () => {
    const u = umgebung();
    const { res, mail, token, doc } = await fordereAn(u, "Inhaber@Beispiel.de", { source: "ki-zitier" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(einwilligungenIn(u).length, 1);
    assert.equal(u.postausgang.length, 1);
    assert.ok(mail, "Bestätigungsmail an die normalisierte Adresse");
    assert.equal(mail.subject, "Bitte bestätigen Sie Ihre Einwilligung");
    assert.equal(mail.headers, undefined, "keine List-Unsubscribe-Kopfzeilen an der Bestätigungsmail");
    assert.ok(doc, "das Token aus der Mail passt zum gespeicherten Hash");
    assert.equal(doc.email, "inhaber@beispiel.de");
    assert.equal(doc.domain, "beispiel.de");
    assert.equal(doc.source, "ki-zitier");
    assert.equal(doc.scope, "webdesign-hinweise");
    assert.equal(doc.text, ew.EINWILLIGUNG_TEXT);
    assert.equal(doc.textVersion, "2026-09-10");
    assert.equal(doc.confirmedAt, null);
    assert.equal(doc.revokedAt, null);
    assert.equal(doc.stopped, false);
    assert.equal(doc.sequenceStep, 0);
    assert.equal(doc.nextSendAt, null);
    for (const f of ["createdAt", "expiresAt", "bestaetigungsmailAt"]) {
        assert.ok(doc[f] instanceof u.Timestamp, `${f} muss ein Timestamp sein (die TTL-Policy greift nur dann)`);
    }
    assert.match(doc.ipHash, /^[a-f0-9]{32}$/);
    assert.equal(JSON.stringify(doc).includes(token), false, "das Bestätigungstoken steht nie im Dokument");
    assert.equal(JSON.stringify(doc).includes("203.0.113.9"), false, "keine rohe IP");
});

test("Endpunkt einwilligungAnfordern: Ungültiges, Honeypot und bestätigte Adresse → dieselbe Antwort, nichts gespeichert, keine Mail", async () => {
    const u = umgebung();
    const faelle = [
        { email: "a@beispiel.de", source: "linkedin", consentVersion: "2026-09-10" },
        { email: "b@beispiel.de", source: "website-pruefen", consentVersion: "2026-01-01" },
        { email: "c@beispiel.de", source: "website-pruefen" },
        { email: "kaputt", source: "website-pruefen", consentVersion: "2026-09-10" },
        { email: "d@beispiel.de", source: "website-pruefen", consentVersion: "2026-09-10", company: "Bot GmbH" }
    ];
    for (const body of faelle) {
        const r = await rufe(u.idx.einwilligungAnfordern, { body });
        assert.equal(r.statusCode, 200, JSON.stringify(body));
        assert.deepEqual(r.body, { ok: true }, JSON.stringify(body));
    }
    assert.equal(einwilligungenIn(u).length, 0);
    assert.equal(u.postausgang.length, 0);
    assert.equal((await rufe(u.idx.einwilligungAnfordern, { method: "GET" })).statusCode, 405);

    // Gegenprobe: gültige Angaben legen an
    const gueltig = await fordereAn(u, "e@beispiel.de");
    assert.ok(gueltig.doc);
    await klickeBestaetigen(u, gueltig.token);
    // Bereits bestätigte Adresse fragt erneut an → gleiche Antwort, keine zweite Bestätigungsmail
    const vorher = u.postausgang.length;
    const nochmal = await rufe(u.idx.einwilligungAnfordern, { body: { email: "e@beispiel.de", source: "startseite", consentVersion: "2026-09-10" } });
    assert.deepEqual(nochmal.body, { ok: true });
    assert.equal(u.postausgang.length, vorher);
    assert.equal(einwilligungenIn(u).length, 1);
});

test("Endpunkt einwilligungBestaetigen: Öffnen bestätigt nichts; der Knopf bestätigt genau einmal; Termin Tag 2, 10:00; eine Gründer-Mail", async () => {
    const u = umgebung();
    const { token, doc } = await fordereAn(u, "inhaber@beispiel.de");
    const offen = await rufe(u.idx.einwilligungBestaetigen, { method: "GET", query: { t: token } });
    assert.equal(offen.statusCode, 200);
    assert.match(offen.body, /<form method="post" action="\?t=/);
    assert.equal(offen.headers["Cache-Control"], "no-store");
    assert.match(offen.headers["X-Robots-Tag"], /noindex/);
    assert.equal(offen.headers["Referrer-Policy"], "no-referrer");
    assert.equal(frisch(u, doc.id).confirmedAt, null, "ein Link-Scanner, der nur öffnet, bestätigt nichts");

    const ok = await klickeBestaetigen(u, token);
    assert.equal(ok.statusCode, 200);
    assert.match(ok.body, /Ihre Einwilligung ist bestätigt/);
    const nach = frisch(u, doc.id);
    assert.ok(nach.confirmedAt instanceof u.Timestamp);
    assert.ok(nach.nextSendAt instanceof u.Timestamp);
    assert.equal(nach.nextSendAt.toMillis(), ew.faelligkeitFuerSchritt(1, nach.confirmedAt.toMillis()));
    assert.ok(nach.expiresAt.toMillis() > Date.now() + 2 * 365 * 86400000, "der Nachweis bleibt drei Jahre");
    assert.ok(ok.body.includes(`abmelden?t=${nach.unsubscribeToken}`), "Widerrufslink auf der Seite");
    const gruender = mailsAn(u, "kontakt@karriaro.de");
    assert.equal(gruender.length, 1);
    assert.equal(gruender[0].subject, "Einwilligung bestätigt: beispiel.de");
    assert.match(gruender[0].text, /läuft automatisch/);

    const zweit = await klickeBestaetigen(u, token);
    assert.match(zweit.body, /bereits bestätigt/);
    assert.equal(frisch(u, doc.id).confirmedAt.toMillis(), nach.confirmedAt.toMillis(), "idempotent");
    assert.equal(mailsAn(u, "kontakt@karriaro.de").length, 1, "keine zweite Gründer-Mail");

    assert.equal((await klickeBestaetigen(u, ew.erzeugeToken())).statusCode, 404);
    assert.equal((await rufe(u.idx.einwilligungBestaetigen, { method: "GET", query: { t: "kurz" } })).statusCode, 404);
});

test("Endpunkt einwilligungBestaetigen: zwei Anforderungen derselben Adresse starten höchstens eine Strecke; ein späterer Widerruf gilt auch für die ältere", async () => {
    const u = umgebung();
    const adresse = "inhaber@beispiel.de";
    const a = await fordereAn(u, adresse);
    setze(u, a.doc.id, { createdAt: vorMs(u, 20 * 60000) });   // außerhalb des Doppelklick-Fensters
    const b = await fordereAn(u, adresse, { source: "ki-zitier" });
    assert.ok(b.doc && b.token !== a.token, "zweite Anforderung angelegt");

    assert.match((await klickeBestaetigen(u, a.token)).body, /Ihre Einwilligung ist bestätigt/);
    const zweite = await klickeBestaetigen(u, b.token);
    assert.match(zweite.body, /bereits bestätigt/);
    assert.ok(zweite.body.includes(`abmelden?t=${frisch(u, a.doc.id).unsubscribeToken}`), "Abmeldelink der laufenden Strecke");
    assert.equal(frisch(u, b.doc.id).confirmedAt, null, "keine zweite Strecke");
    assert.equal(frisch(u, b.doc.id).nextSendAt, null);
    assert.equal(mailsAn(u, "kontakt@karriaro.de").length, 1);

    // Widerruf der laufenden Strecke — die ältere, offene Anforderung wird danach nicht mehr wirksam
    const ab = await rufe(u.idx.abmelden, { method: "POST", query: { t: frisch(u, a.doc.id).unsubscribeToken }, body: { "List-Unsubscribe": "One-Click" } });
    assert.equal(ab.statusCode, 200);
    setze(u, b.doc.id, { createdAt: vorMs(u, 20 * 60000) });   // eindeutig vor dem Widerruf angefordert
    assert.match((await klickeBestaetigen(u, b.token)).body, /wurde widerrufen/);
    assert.equal(frisch(u, b.doc.id).confirmedAt, null);

    // Gegenprobe: eine NACH dem Widerruf angeforderte Einwilligung ist neu und wirkt
    const c = await fordereAn(u, adresse, { source: "startseite" });
    assert.ok(c.doc, "neue Anforderung nach dem Widerruf");
    assert.match((await klickeBestaetigen(u, c.token)).body, /Ihre Einwilligung ist bestätigt/);
    assert.ok(frisch(u, c.doc.id).nextSendAt instanceof u.Timestamp);
    assert.equal(mailsAn(u, "kontakt@karriaro.de").length, 2, "eine Gründer-Mail je wirksamer Bestätigung");
});

test("Endpunkt abmelden: Öffnen meldet nicht ab; ohne One-Click-Body nichts; One-Click → 200 ohne Weiterleitung; idempotent", async () => {
    const u = umgebung();
    const { token, doc } = await fordereAn(u, "inhaber@beispiel.de");
    await klickeBestaetigen(u, token);
    const abmeldeToken = frisch(u, doc.id).unsubscribeToken;

    const seite = await rufe(u.idx.abmelden, { method: "GET", query: { t: abmeldeToken } });
    assert.equal(seite.statusCode, 200);
    assert.match(seite.body, /<input type="hidden" name="List-Unsubscribe" value="One-Click">/);
    assert.equal(frisch(u, doc.id).revokedAt, null, "ein Vorab-Aufruf meldet niemanden ab");

    const leer = await rufe(u.idx.abmelden, { method: "POST", query: { t: abmeldeToken }, body: {} });
    assert.equal(leer.statusCode, 400);
    assert.equal(frisch(u, doc.id).revokedAt, null);

    const klick = await rufe(u.idx.abmelden, { method: "POST", query: { t: abmeldeToken }, body: { "List-Unsubscribe": "One-Click" } });
    assert.equal(klick.statusCode, 200);
    assert.equal(klick.headers.Location, undefined, "RFC 8058: keine Weiterleitung");
    assert.match(klick.body, /Sie sind abgemeldet/);
    const nach = frisch(u, doc.id);
    assert.ok(nach.revokedAt instanceof u.Timestamp);
    assert.equal(nach.stopped, true);
    assert.equal(nach.nextSendAt, null);
    assert.equal(nach.widerrufWeg, "one-click");
    assert.ok(nach.expiresAt.toMillis() > Date.now() + 2 * 365 * 86400000, "der Nachweis des Widerrufs bleibt");

    const multipart = '--b1\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--b1--\r\n';
    const wieder = await rufe(u.idx.abmelden, { method: "POST", query: { t: abmeldeToken }, body: {}, rawBody: Buffer.from(multipart) });
    assert.equal(wieder.statusCode, 200);
    assert.match(wieder.body, /bereits abgemeldet/);
    assert.equal(frisch(u, doc.id).revokedAt.toMillis(), nach.revokedAt.toMillis(), "idempotent");
    assert.equal((await rufe(u.idx.abmelden, { method: "POST", query: { t: ew.erzeugeToken() }, body: { "List-Unsubscribe": "One-Click" } })).statusCode, 404);

    // Nach dem Widerruf findet die Strecke nichts mehr, auch mit veraltetem Termin
    setze(u, doc.id, { nextSendAt: vorMs(u, 60000) });
    u.postausgang.length = 0;
    await u.idx.einwilligungSequenz.run({});
    assert.equal(u.postausgang.length, 0);
});

test("Endpunkt einwilligungSequenz: nur fällige, bestätigte, nicht widerrufene Einwilligung; zweiter Lauf leer; Versandfehler vermerkt und protokolliert", async () => {
    const u = umgebung();
    const x = await fordereAn(u, "x@beispiel.de");
    await klickeBestaetigen(u, x.token);
    const y = await fordereAn(u, "y@beispiel.de");
    await klickeBestaetigen(u, y.token);
    const z = await fordereAn(u, "z@beispiel.de");                  // nie bestätigt
    setze(u, x.doc.id, { nextSendAt: vorMs(u, 60000) });
    setze(u, y.doc.id, { nextSendAt: vorMs(u, 60000), revokedAt: vorMs(u, 3600000), stopped: true });
    setze(u, z.doc.id, { nextSendAt: vorMs(u, 60000) });
    u.postausgang.length = 0;

    await u.idx.einwilligungSequenz.run({});
    assert.equal(u.postausgang.length, 1, "genau eine Hinweis-Mail");
    const hinweis = u.postausgang[0];
    const xNach = frisch(u, x.doc.id);
    const abmeldeLink = `https://karriaro-webdesign.de/abmelden?t=${xNach.unsubscribeToken}`;
    assert.equal(hinweis.to, "x@beispiel.de");
    assert.equal(hinweis.subject, "Was die Prüfung Ihrer Website zeigt");
    assert.equal(hinweis.headers["List-Unsubscribe"], `<${abmeldeLink}>, <mailto:kontakt@karriaro.de?subject=Abmelden>`);
    assert.equal(hinweis.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(hinweis.text.includes(abmeldeLink));
    assert.match(hinweis.text, /Ihr Widerspruchsrecht \(Art\. 21 DSGVO\)/);
    assert.equal(xNach.sequenceStep, 1);
    assert.ok(xNach.nextSendAt.toMillis() > Date.now(), "nächster Termin liegt in der Zukunft");
    assert.ok(xNach.letzterVersandAt instanceof u.Timestamp);
    assert.equal(frisch(u, y.doc.id).nextSendAt, null, "veralteter Termin am widerrufenen Dokument geräumt");
    assert.equal(frisch(u, z.doc.id).nextSendAt, null, "unbestätigt: kein Termin");

    await u.idx.einwilligungSequenz.run({});
    assert.equal(u.postausgang.length, 1, "ein zweiter Lauf sendet nichts");

    // Versandfehler, sicher nicht zugestellt → Schritt zurück, vermerkt, protokolliert
    setze(u, x.doc.id, { nextSendAt: vorMs(u, 60000) });
    u.schalter.sendeFehler = Object.assign(new Error("535 Authentication failed"), { code: "EAUTH", command: "AUTH PLAIN", responseCode: 535 });
    await u.idx.einwilligungSequenz.run({});
    assert.equal(u.postausgang.length, 1);
    const xFehler = frisch(u, x.doc.id);
    assert.equal(xFehler.sequenceStep, 1, "Schritt 2 zurückgegeben");
    assert.equal(xFehler.fehlversuche, 1);
    assert.match(xFehler.letzterFehler, /Schritt 2: .*nicht zugestellt/);
    assert.ok(xFehler.nextSendAt.toMillis() > Date.now());
    assert.ok(u.logs.some((l) => l.stufe === "error" && /Versand fehlgeschlagen/.test(l.nachricht)), "der Fehler steht im Log");
});

test("Endpunkt einwilligungSequenz: Sperrliste des Cockpits hält die Strecke an (Gegenprobe: fremde Domain gesperrt → Mail geht)", async () => {
    const u = umgebung();
    const x = await fordereAn(u, "x@beispiel.de");
    await klickeBestaetigen(u, x.token);
    setze(u, x.doc.id, { nextSendAt: vorMs(u, 60000) });

    // Gegenprobe zuerst: eine andere Domain auf der Sperrliste darf nichts blockieren.
    u.db.speicher.set("suppression/uid1_anderer-betrieb_de", { uid: "uid1", domain: "anderer-betrieb.de", reason: "opt_out" });
    u.postausgang.length = 0;
    await u.idx.einwilligungSequenz.run({});
    assert.equal(u.postausgang.length, 1, "fremde Sperre blockiert nicht");

    // Jetzt die eigene Domain (Werbewiderspruch von Hand eingetragen) → keine Mail, Strecke angehalten.
    u.db.speicher.set("suppression/uid1_beispiel_de", { uid: "uid1", domain: "beispiel.de", reason: "opt_out" });
    setze(u, x.doc.id, { nextSendAt: vorMs(u, 60000) });
    u.postausgang.length = 0;
    await u.idx.einwilligungSequenz.run({});
    assert.equal(u.postausgang.length, 0, "gesperrte Domain erhält keine Hinweis-Mail");
    const nach = frisch(u, x.doc.id);
    assert.equal(nach.stopped, true);
    assert.equal(nach.nextSendAt, null);
    assert.equal(nach.sequenceStep, 1, "kein weiterer Schritt gezählt");
    assert.match(nach.letzterFehler, /Sperrliste: beispiel\.de/);
    assert.ok(u.logs.some((l) => l.stufe === "warn" && /Sperrliste/.test(l.nachricht)));
});

test("Endpunkt sofortLead: nur marketingConsent === true fordert an; Gründer-Mail nennt den Stand; Pflicht-Nachweis gespeichert", async () => {
    const basis = { url: "beispiel.de", email: "anna@beispiel.de", name: "Anna", branche: "friseur", score: 42, topLeak: "Mobil langsam", consent: true, hp: "", consentVersion: "2026-09-10" };

    const u = umgebung();
    const ohne = await rufe(u.idx.sofortLead, { body: { ...basis, marketingConsent: "true" } });
    assert.deepEqual(ohne.body, { ok: true });
    assert.equal(einwilligungenIn(u).length, 0, "ein String \"true\" ist keine Einwilligung");
    const eingang = mailsAn(u, "anna@beispiel.de");
    assert.equal(eingang.length, 1);
    assert.equal(eingang[0].subject, "Ihre Konzept-Skizze für beispiel.de");
    assert.ok(eingang[0].text.includes("Sie erhalten eine persönliche Antwort."));
    assert.doesNotMatch(eingang[0].text + eingang[0].html, /Stunden|in Kürze|Erstgespräch|Köln/);
    assert.match(mailsAn(u, "kontakt@karriaro.de")[0].text, /Werbe-Einw\.:\s+nicht erteilt/);
    const lead = dokumenteIn(u, "sofortLeads")[0];
    assert.equal(lead.pflichtEinwilligung.wortlautVersion, "sofort-skizze-2026-09-10");
    assert.equal(lead.pflichtEinwilligung.wortlaut, ew.PFLICHT_WORTLAUTE["sofort-skizze"].text);
    assert.ok(lead.pflichtEinwilligung.zeitpunkt instanceof u.Timestamp);
    assert.equal(lead.werbeEinwilligungAngefragt, false);

    umgebung();
    const mit = await rufe(u.idx.sofortLead, { body: { ...basis, marketingConsent: true } });
    assert.deepEqual(mit.body, { ok: true });
    const liste = einwilligungenIn(u);
    assert.equal(liste.length, 1);
    assert.equal(liste[0].source, "sofort-skizze");
    assert.equal(liste[0].domain, "beispiel.de");
    assert.deepEqual(mailsAn(u, "anna@beispiel.de").map((m) => m.subject).sort(), ["Bitte bestätigen Sie Ihre Einwilligung", "Ihre Konzept-Skizze für beispiel.de"]);
    assert.match(mailsAn(u, "kontakt@karriaro.de")[0].text, /Werbe-Einw\.:\s+angefragt, Bestätigung per E-Mail ausstehend/);
    assert.equal(dokumenteIn(u, "sofortLeads")[0].werbeEinwilligungAngefragt, true);

    // Ohne Pflicht-Checkbox: 400, nichts angelegt, keine Mail
    umgebung();
    assert.equal((await rufe(u.idx.sofortLead, { body: { ...basis, consent: false, marketingConsent: true } })).statusCode, 400);
    assert.equal(u.postausgang.length, 0);
    assert.equal(einwilligungenIn(u).length, 0);
});
