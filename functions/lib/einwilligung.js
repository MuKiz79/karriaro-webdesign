"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Einwilligung (Double-Opt-In) für Hinweis-E-Mails — reine Logik (2026-09-10).
//
// Kein Netzwerk, kein Firestore, keine eigene Uhr: jede Funktion bekommt nowMs
// übergeben → vollständig testbar. Die Endpunkte in index.js
// (einwilligungAnfordern, einwilligungBestaetigen, abmelden, einwilligungSequenz)
// lesen und schreiben Firestore und treffen JEDE Zustandsentscheidung hier.
//
// Zeitpunkte sind in dieser Datei Millisekunden (number|null). index.js übersetzt
// die ZEITFELDER beim Lesen und Schreiben in Firestore-Timestamps (die TTL-Policy
// auf expiresAt greift nur bei einem echten Timestamp).
//
// Regeln, die aus dem Rechtsrahmen folgen:
//   • § 7 Abs. 2 Nr. 2 UWG: Werbung per E-Mail nur mit vorheriger ausdrücklicher
//     Einwilligung. Der Wortlaut (EINWILLIGUNG_TEXT) deckt höchstens DREI E-Mails.
//     Deshalb wird ein Schritt VOR dem Versand gezählt — lieber eine Mail zu wenig
//     als eine vierte. Nur ein sicher nicht zugestellter Versuch gibt ihn zurück.
//   • Nachweis: Wortlaut, Version und Zeitpunkte bleiben drei Jahre nach der
//     letzten Nutzung bzw. dem Widerruf erhalten (regelmäßige Verjährung).
//   • Eine unbestätigte Anforderung trägt keine Einwilligung. Sie läuft nach der
//     Bestätigungsfrist ab und wird per TTL gelöscht (Datenminimierung).
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");
const { domainToUnicode } = require("node:url");

const TAG_MS = 24 * 60 * 60 * 1000;

// V1 — Wortlaut und Version sind Vertragsbestandteil (Frontend zeigt denselben Text).
const EINWILLIGUNG_TEXT_VERSION = "2026-09-10";
const EINWILLIGUNG_TEXT = "Ja, Karriaro Webdesign darf mir bis zu drei E-Mails mit Hinweisen zu meiner Website und einem unverbindlichen Angebot für eine neue Website senden. Die Einwilligung ist freiwillig; ich kann sie jederzeit widerrufen – über den Abmeldelink in jeder E-Mail oder per Mail an kontakt@karriaro.de. Mehr in der Datenschutzerklärung.";
// Künftige Fassungen kommen hier dazu; eine alte Version bleibt lesbar, damit
// jeder gespeicherte Nachweis seinen Wortlaut behält.
const EINWILLIGUNG_TEXTE = Object.freeze({ [EINWILLIGUNG_TEXT_VERSION]: EINWILLIGUNG_TEXT });
const EINWILLIGUNG_SCOPE = "webdesign-hinweise";

// Quelle → Satzbaustein im Akkusativ („… über die Website-Prüfung … eingewilligt").
const EINWILLIGUNG_QUELLEN = Object.freeze({
    "website-pruefen": "die Website-Prüfung auf karriaro-webdesign.de",
    "startseite": "die Website-Prüfung auf der Startseite von karriaro-webdesign.de",
    "sofort-skizze": "die Sofort-Skizze auf karriaro-webdesign.de",
    "ki-zitier": "den KI-Zitier-Check auf karriaro-webdesign.de"
});

// Nachweis der PFLICHT-Checkbox (Verarbeitung für den angefragten Bericht bzw. die
// Skizze). Stand der Formulare am 10.09.2026; ein Test hält die Texte an den
// ausgelieferten Formularen fest. Ändert ein Formular seinen Wortlaut, braucht es
// hier eine neue Version — sonst stünde im Nachweis ein Text, den niemand sah.
const PFLICHT_WORTLAUTE = Object.freeze({
    "website-pruefen": Object.freeze({
        version: "website-pruefen-2026-09-10",
        text: "Ich bin damit einverstanden, dass Karriaro meine Website analysiert und die Ergebnisse an meine E-Mail-Adresse sendet. Die Daten werden nach 90 Tagen automatisch gelöscht. Datenschutzerklärung: karriaro-webdesign.de/datenschutz."
    }),
    // Seit der optionalen Werbe-Einwilligung (10.09.2026) ohne den Zusatz zum Newsletter.
    "startseite": Object.freeze({
        version: "startseite-2026-09-10",
        text: "Ich stimme der Verarbeitung meiner Angaben zur Erstellung des Berichts zu (Datenschutz)."
    }),
    "sofort-skizze": Object.freeze({
        version: "sofort-skizze-2026-09-10",
        text: "Ich bin mit der Kontaktaufnahme einverstanden (Datenschutz)."
    })
});

const MAX_SCHRITTE = 3;
// Kalendertage nach dem Tag der Bestätigung (Europe/Berlin), jeweils 10:00 Uhr.
const SCHRITT_TAG = Object.freeze({ 1: 2, 2: 7, 3: 14 });
const VERSAND_STUNDE_BERLIN = 10;
const BESTAETIGUNGSFRIST_TAGE = 30;
const NACHWEIS_JAHRE = 3;
// Doppelklick/Retry: eine offene Anforderung derselben Adresse aus diesem Fenster
// löst keine zweite Bestätigungsmail aus.
const DOPPEL_FENSTER_MS = 10 * 60 * 1000;
// Der Zeitplan feuert um 10:00; ein Termin 10:00 muss auch dann gelten, wenn der
// Lauf ein paar Sekunden früher startet.
const FAELLIG_TOLERANZ_MS = 30 * 60 * 1000;
const MAX_FEHLVERSUCHE = 3;
const SEQUENZ_MAX_MAILS = 50;
const SEQUENZ_KANDIDATEN_LIMIT = 200;

// Felder, die in Firestore als Timestamp liegen (V4 + additive Zusatzfelder).
const ZEITFELDER = Object.freeze([
    "createdAt", "confirmedAt", "revokedAt", "nextSendAt", "expiresAt",
    "bestaetigungsmailAt", "letzterVersandAt"
]);

const WIDERRUF_WEGE = Object.freeze(["seite", "one-click"]);

const hatEigen = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);
const istZeit = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// ─── Zeit: Europe/Berlin ohne Bibliothek ────────────────────────────────────

const BERLIN_FORMAT = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
});

function berlinTeile(ms) {
    const t = {};
    for (const p of BERLIN_FORMAT.formatToParts(new Date(ms))) t[p.type] = p.value;
    return { y: +t.year, m: +t.month, d: +t.day, h: +t.hour, min: +t.minute, s: +t.second };
}

/** Versatz Berlin gegenüber UTC in ms an diesem Zeitpunkt (Sommerzeit +2 h, Winterzeit +1 h). */
function berlinVersatzMs(ms) {
    const b = berlinTeile(ms);
    return Date.UTC(b.y, b.m - 1, b.d, b.h, b.min, b.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * UTC-Millisekunden für Y-M-D hh:00 Berliner Ortszeit. Ein Tagesüberlauf
 * (d = 32) wird wie bei Date.UTC normalisiert. 10:00 liegt nie in der
 * Umstellungslücke (02:00–03:00), die zweite Korrektur fängt den Wechseltag.
 */
function berlinZeitpunkt(y, m, d, stunde = VERSAND_STUNDE_BERLIN) {
    const naiv = Date.UTC(y, m - 1, d, stunde, 0, 0);
    let t = naiv - berlinVersatzMs(naiv);
    const korrigiert = naiv - berlinVersatzMs(t);
    if (korrigiert !== t) t = korrigiert;
    return t;
}

/** Berliner Kalendertag von ms, plus `tage`, um `stunde` Uhr Berliner Zeit. */
function berlinTagPlus(ms, tage, stunde = VERSAND_STUNDE_BERLIN) {
    const b = berlinTeile(ms);
    return berlinZeitpunkt(b.y, b.m, b.d + tage, stunde);
}

function nachweisAblauf(ms) {
    const d = new Date(ms);
    d.setUTCFullYear(d.getUTCFullYear() + NACHWEIS_JAHRE);
    return d.getTime();
}

/**
 * Termin für Schritt 1–3: Tag der Bestätigung + 2/7/14 Kalendertage, 10:00 Berlin.
 * `fruehestensNachMs`: nach einem (verspäteten) Versand nie am selben Tag nachlegen —
 * frühestens am folgenden Berliner Kalendertag um 10:00.
 * @returns {number|null}
 */
function faelligkeitFuerSchritt(schritt, confirmedAtMs, { fruehestensNachMs = null } = {}) {
    if (!Number.isInteger(schritt) || schritt < 1 || schritt > MAX_SCHRITTE) return null;
    if (!istZeit(confirmedAtMs)) return null;
    let termin = berlinTagPlus(confirmedAtMs, SCHRITT_TAG[schritt]);
    if (istZeit(fruehestensNachMs)) {
        const naechsterTag = berlinTagPlus(fruehestensNachMs, 1);
        if (termin < naechsterTag) termin = naechsterTag;
    }
    return termin;
}

// ─── Eingaben ───────────────────────────────────────────────────────────────

const EMAIL_LOKAL = /^[^\s\p{Cc}@<>"(),;:[\]\\]{1,64}$/u;
const EMAIL_HOST = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:\p{L}{2,63}|xn--[a-z0-9-]{2,59})$/u;

/**
 * Normalisiert eine E-Mail-Adresse (trim, klein) oder liefert null. Lehnt alles
 * ab, was einen Mail-Header aufbrechen könnte (CR/LF, Steuerzeichen, Klammern).
 */
function normalisiereEmail(roh) {
    if (typeof roh !== "string") return null;
    const e = roh.trim().toLowerCase();
    if (e.length < 6 || e.length > 200) return null;
    const at = e.indexOf("@");
    if (at <= 0 || e.lastIndexOf("@") !== at) return null;
    const lokal = e.slice(0, at);
    const host = e.slice(at + 1);
    if (!EMAIL_LOKAL.test(lokal) || lokal.startsWith(".") || lokal.endsWith(".") || lokal.includes("..")) return null;
    if (!EMAIL_HOST.test(host)) return null;
    return e;
}

/** Hostname ohne www., klein, Umlaut-Domains als Punycode (wie new URL); sonst null. */
function normalisiereDomain(roh) {
    if (typeof roh !== "string") return null;
    const s = roh.trim();
    if (!s || s.length > 300) return null;
    let host;
    try {
        host = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.toLowerCase();
    } catch {
        return null;
    }
    host = host.replace(/^www\./, "").replace(/\.$/, "");
    if (host.length > 253) return null;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(host)) return null;
    return host;
}

function istAuditSlug(s) {
    return typeof s === "string" && /^[0-9a-z]{8,32}$/.test(s);
}

function istQuelle(source) {
    return hatEigen(EINWILLIGUNG_QUELLEN, source);
}

function textFuerVersion(version) {
    return hatEigen(EINWILLIGUNG_TEXTE, version) ? EINWILLIGUNG_TEXTE[version] : null;
}

// ─── Token & Pseudonymisierung ──────────────────────────────────────────────

const TOKEN_MUSTER = /^[A-Za-z0-9_-]{43}$/;

/** 32 Zufallsbytes, base64url (43 Zeichen). */
function erzeugeToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function istTokenFormat(t) {
    return typeof t === "string" && TOKEN_MUSTER.test(t);
}

/** Im Dokument steht nur dieser Hash des Bestätigungstokens, nie das Token selbst. */
function hashToken(token) {
    return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

/**
 * Schlüssel-gebundener Hash einer IP (HMAC-SHA256). Ohne Schlüssel oder ohne IP → null
 * (nicht gemessen, kein Ersatzwert). Derselbe Schlüssel ergibt denselben Hash — so
 * lässt sich später belegen, dass Anforderung und Bestätigung vom selben Anschluss kamen.
 */
function pseudonymisiereIp(ip, schluessel) {
    const roh = typeof ip === "string" ? ip.trim() : "";
    if (!roh || roh === "unknown" || typeof schluessel !== "string" || !schluessel) return null;
    return crypto.createHmac("sha256", schluessel).update("karriaro-einwilligung-ip:" + roh).digest("hex").slice(0, 32);
}

/**
 * Gekürzte IP (IPv4 → /24, IPv6 → /48) für Besuchsprotokolle. Auch von
 * trackLeadView genutzt. Unlesbares → null.
 */
function kuerzeIp(ip) {
    let s = typeof ip === "string" ? ip.trim() : "";
    if (!s) return null;
    const gemappt = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (gemappt) s = gemappt[1];
    const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const zahlen = v4.slice(1, 5).map(Number);
        if (zahlen.some((n) => n > 255)) return null;
        return `${zahlen[0]}.${zahlen[1]}.${zahlen[2]}.0`;
    }
    if (!s.includes(":") || !/^[0-9a-f:]+$/i.test(s)) return null;
    const teile = s.split("::");
    if (teile.length > 2) return null;
    const links = teile[0] ? teile[0].split(":") : [];
    const rechts = teile.length === 2 && teile[1] ? teile[1].split(":") : [];
    let gruppen;
    if (teile.length === 2) {
        const fehlend = 8 - links.length - rechts.length;
        if (fehlend < 1) return null;
        gruppen = [...links, ...Array(fehlend).fill("0"), ...rechts];
    } else {
        gruppen = links;
    }
    if (gruppen.length !== 8 || gruppen.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
    return gruppen.slice(0, 3).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::";
}

/** Grobe Geräteklasse statt vollem User-Agent. */
function uaKlasse(ua) {
    const s = typeof ua === "string" ? ua : "";
    if (!s.trim()) return "unbekannt";
    if (/bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|curl\/|wget|python|java\/|go-http|scanner|facebookexternalhit|embedly/i.test(s)) return "bot";
    if (/ipad|tablet|kindle|silk\/|playbook|android(?!.*mobile)/i.test(s)) return "tablet";
    if (/mobi|iphone|ipod|android|windows phone/i.test(s)) return "mobil";
    return "desktop";
}

// ─── Dokument & Zustand ─────────────────────────────────────────────────────

/**
 * Baut ein neues Einwilligungs-Dokument nach V4 (plus additive Zusatzfelder).
 * @returns {{ok:true, dokument:object, confirmToken:string} | {ok:false, grund:string}}
 */
function baueAnforderung({ email, domain = null, source, auditSlug = null, textVersion, ipHash = null, nowMs } = {}) {
    const mail = normalisiereEmail(email);
    if (!mail) return { ok: false, grund: "email-ungueltig" };
    if (!istQuelle(source)) return { ok: false, grund: "quelle-ungueltig" };
    const text = textFuerVersion(textVersion);
    if (!text) return { ok: false, grund: "version-unbekannt" };
    if (!istZeit(nowMs)) return { ok: false, grund: "zeit-ungueltig" };
    const confirmToken = erzeugeToken();
    const dokument = {
        email: mail,
        domain: normalisiereDomain(domain),
        scope: EINWILLIGUNG_SCOPE,
        text,
        textVersion,
        source,
        auditSlug: istAuditSlug(auditSlug) ? auditSlug : null,
        createdAt: nowMs,
        confirmedAt: null,
        revokedAt: null,
        stopped: false,
        sequenceStep: 0,
        nextSendAt: null,
        confirmTokenHash: hashToken(confirmToken),
        unsubscribeToken: erzeugeToken(),
        ipHash: typeof ipHash === "string" && /^[a-f0-9]{16,64}$/.test(ipHash) ? ipHash : null,
        expiresAt: nowMs + BESTAETIGUNGSFRIST_TAGE * TAG_MS,
        // Zusatzfelder (additiv zu V4)
        confirmIpHash: null,
        bestaetigungsmailAt: null,
        letzterVersandAt: null,
        fehlversuche: 0,
        letzterFehler: null,
        widerrufWeg: null
    };
    return { ok: true, dokument, confirmToken };
}

function schrittZahl(doc) {
    const n = Number(doc && doc.sequenceStep);
    return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_SCHRITTE) : 0;
}

/** Ohne bekannten Anforderungszeitpunkt gibt es keinen Nachweis — dann gilt die Frist als verstrichen. */
function bestaetigungAbgelaufen(doc, nowMs) {
    if (!doc || istZeit(doc.confirmedAt)) return false;
    if (!istZeit(doc.createdAt)) return true;
    return nowMs > doc.createdAt + BESTAETIGUNGSFRIST_TAGE * TAG_MS;
}

/**
 * 'widerrufen' > 'gestoppt' > 'aktiv'/'abgeschlossen' (bestätigt) > 'abgelaufen' > 'offen'.
 * Ein Widerruf schlägt alles, auch eine Bestätigung.
 */
function zustand(doc, nowMs) {
    if (!doc || typeof doc !== "object") return "unbekannt";
    if (istZeit(doc.revokedAt)) return "widerrufen";
    if (doc.stopped === true) return "gestoppt";
    if (istZeit(doc.confirmedAt)) return schrittZahl(doc) >= MAX_SCHRITTE ? "abgeschlossen" : "aktiv";
    if (bestaetigungAbgelaufen(doc, nowMs)) return "abgelaufen";
    return "offen";
}

/**
 * Soll für diese Adresse eine neue Anforderung (samt Bestätigungsmail) entstehen?
 * `vorhandene`: alle Dokumente mit derselben normalisierten E-Mail (Zeitfelder in ms).
 */
function pruefeNeueAnforderung(vorhandene, nowMs) {
    const liste = Array.isArray(vorhandene) ? vorhandene.filter((d) => d && typeof d === "object") : [];
    for (const d of liste) {
        const z = zustand(d, nowMs);
        if (z === "aktiv") return { anlegen: false, grund: "bereits-bestaetigt" };
        // Eine vom Gründer gestoppte Strecke wird nicht durch eine neue Anforderung umgangen.
        if (z === "gestoppt") return { anlegen: false, grund: "gestoppt" };
    }
    for (const d of liste) {
        if (zustand(d, nowMs) === "offen" && istZeit(d.createdAt) && nowMs - d.createdAt < DOPPEL_FENSTER_MS) {
            return { anlegen: false, grund: "doppelt" };
        }
    }
    return { anlegen: true, grund: null };
}

/**
 * Eine Adresse trägt höchstens EINE Strecke. Beim Bestätigen werden die übrigen
 * Dokumente derselben Adresse geprüft (in derselben Transaktion gelesen):
 *   • dort läuft eine Strecke, oder sie wurde erst NACH dieser Anforderung bestätigt →
 *     keine zweite Strecke ('bereits-bestaetigt'). Sonst ergäben zwei angeklickte
 *     Bestätigungslinks sechs E-Mails, der Wortlaut deckt drei.
 *   • die Adresse wurde NACH dieser Anforderung widerrufen → der Widerruf gilt auch für
 *     diese ältere, noch offene Anforderung ('widerrufen').
 *   • die Strecke der Adresse ist gestoppt → bestätigt (Nachweis), aber ohne Strecke;
 *     sonst hebelte ein alter Link den Stopp aus.
 * Eine Anforderung, die nach Widerruf bzw. Abschluss neu entstand, ist eine neue
 * ausdrückliche Einwilligung und wird nicht gesperrt.
 * @returns {{sperre:null|'bereits-bestaetigt'|'widerrufen', gestoppt:boolean, bezug:object|null}}
 */
function adressLage(doc, andere, nowMs) {
    const eigenerHash = doc && typeof doc.confirmTokenHash === "string" ? doc.confirmTokenHash : null;
    const liste = Array.isArray(andere)
        ? andere.filter((d) => d && typeof d === "object" && d !== doc && !(eigenerHash && d.confirmTokenHash === eigenerHash))
        : [];
    const angefordert = doc && istZeit(doc.createdAt) ? doc.createdAt : null;
    // Ohne Anforderungszeitpunkt ist „davor/danach" nicht entscheidbar → wie „davor" (sperrt).
    const vor = (zeitpunkt) => angefordert == null || !istZeit(zeitpunkt) || angefordert < zeitpunkt;
    let widerruf = null;
    let gestoppt = false;
    for (const d of liste) {
        const z = zustand(d, nowMs);
        if (z === "aktiv") return { sperre: "bereits-bestaetigt", gestoppt: false, bezug: d };
        if (z === "abgeschlossen" && vor(d.confirmedAt)) return { sperre: "bereits-bestaetigt", gestoppt: false, bezug: d };
        if (z === "widerrufen" && !widerruf && vor(d.revokedAt)) widerruf = d;
        if (z === "gestoppt") gestoppt = true;
    }
    if (widerruf) return { sperre: "widerrufen", gestoppt: false, bezug: widerruf };
    return { sperre: null, gestoppt, bezug: null };
}

/**
 * Bestätigung (Klick im Double-Opt-In). Idempotent: eine zweite Bestätigung ändert nichts.
 * `andere`: übrige Dokumente derselben Adresse (Zeitfelder in ms), siehe adressLage.
 * @returns {{ergebnis:'bestaetigt'|'bereits-bestaetigt'|'widerrufen'|'abgelaufen'|'unbekannt', update:object|null, bezug?:object}}
 */
function bestaetige(doc, { nowMs, ipHash = null, andere = [] } = {}) {
    if (!doc || typeof doc !== "object") return { ergebnis: "unbekannt", update: null };
    if (istZeit(doc.revokedAt)) return { ergebnis: "widerrufen", update: null };
    if (istZeit(doc.confirmedAt)) return { ergebnis: "bereits-bestaetigt", update: null };
    if (bestaetigungAbgelaufen(doc, nowMs)) return { ergebnis: "abgelaufen", update: null };
    const lage = adressLage(doc, andere, nowMs);
    if (lage.sperre) return { ergebnis: lage.sperre, update: null, bezug: lage.bezug };
    const ohneStrecke = doc.stopped === true || lage.gestoppt;
    return {
        ergebnis: "bestaetigt",
        update: {
            confirmedAt: nowMs,
            confirmIpHash: typeof ipHash === "string" && /^[a-f0-9]{16,64}$/.test(ipHash) ? ipHash : null,
            sequenceStep: 0,
            ...(lage.gestoppt && doc.stopped !== true ? { stopped: true } : {}),
            nextSendAt: ohneStrecke ? null : faelligkeitFuerSchritt(1, nowMs),
            expiresAt: nachweisAblauf(nowMs)
        }
    };
}

/**
 * Ist jetzt eine Hinweis-Mail fällig? Nur eine bestätigte, nicht widerrufene, nicht
 * gestoppte Einwilligung mit weniger als drei versendeten Schritten.
 */
function pruefeFaelligkeit(doc, nowMs) {
    const z = zustand(doc, nowMs);
    if (z !== "aktiv") return { faellig: false, schritt: null, grund: z };
    if (!istZeit(doc.nextSendAt)) return { faellig: false, schritt: null, grund: "kein-termin" };
    if (doc.nextSendAt > nowMs + FAELLIG_TOLERANZ_MS) return { faellig: false, schritt: null, grund: "noch-nicht" };
    return { faellig: true, schritt: schrittZahl(doc) + 1, grund: null };
}

/**
 * Beansprucht den fälligen Schritt VOR dem Versand (in einer Transaktion anzuwenden).
 * Nach der Beanspruchung ist derselbe Schritt nicht mehr fällig — ein zweiter,
 * überlappender Lauf findet nichts mehr.
 * @returns {{schritt:number, update:object}|null}
 */
function beanspruche(doc, nowMs) {
    const f = pruefeFaelligkeit(doc, nowMs);
    if (!f.faellig) return null;
    const schritt = f.schritt;
    return {
        schritt,
        update: {
            sequenceStep: schritt,
            nextSendAt: schritt < MAX_SCHRITTE
                ? faelligkeitFuerSchritt(schritt + 1, doc.confirmedAt, { fruehestensNachMs: nowMs })
                : null,
            expiresAt: nachweisAblauf(nowMs)
        }
    };
}

/** Veralteten Termin an einem nicht (mehr) versandfähigen Dokument räumen, sonst null. */
function aufraeumUpdate(doc, nowMs) {
    if (!doc || doc.nextSendAt == null) return null;
    return zustand(doc, nowMs) === "aktiv" ? null : { nextSendAt: null };
}

function nachVersandErfolg(nowMs) {
    return { letzterVersandAt: nowMs, fehlversuche: 0, letzterFehler: null };
}

/**
 * Vermerk nach einem fehlgeschlagenen Versand, berechnet auf dem AKTUELLEN Dokument
 * (in einer Transaktion gelesen):
 *   • Zustellung unklar (z. B. Zeitüberschreitung nach DATA) → Schritt bleibt gezählt.
 *     Die Einwilligung deckt drei E-Mails; ein Doppelversand wäre eine vierte.
 *   • Sicher nicht zugestellt → Schritt zurückgeben, neuer Versuch am Folgetag 10:00;
 *     nach MAX_FEHLVERSUCHE ohne Termin (bleibt im Cockpit als letzterFehler sichtbar).
 *   • Inzwischen widerrufen/gestoppt oder von anderer Stelle verändert → nur vermerken.
 */
function nachVersandFehler(aktuell, { schritt, sicherNichtZugestellt, fehlerText = "", nowMs } = {}) {
    const bisher = aktuell && Number.isInteger(aktuell.fehlversuche) && aktuell.fehlversuche > 0 ? aktuell.fehlversuche : 0;
    const versuche = bisher + 1;
    const kurz = String(fehlerText || "unbekannter Fehler").replace(/[\r\n]+/g, " ").slice(0, 160);
    const basis = { fehlversuche: versuche };
    if (!aktuell || Number(aktuell.sequenceStep) !== schritt) {
        return { ...basis, letzterFehler: `Schritt ${schritt}: ${kurz}` };
    }
    if (!sicherNichtZugestellt) {
        return { ...basis, letzterFehler: `Schritt ${schritt}: ${kurz} (Zustellung unklar, Schritt bleibt gezählt)` };
    }
    const nochNutzbar = istZeit(aktuell.confirmedAt) && !istZeit(aktuell.revokedAt) && aktuell.stopped !== true;
    if (!nochNutzbar) {
        return { ...basis, sequenceStep: schritt - 1, nextSendAt: null, letzterFehler: `Schritt ${schritt}: ${kurz} (nicht zugestellt)` };
    }
    if (versuche >= MAX_FEHLVERSUCHE) {
        return { ...basis, sequenceStep: schritt - 1, nextSendAt: null, letzterFehler: `Schritt ${schritt}: ${kurz} (nicht zugestellt, nach ${versuche} Versuchen angehalten)` };
    }
    return { ...basis, sequenceStep: schritt - 1, nextSendAt: berlinTagPlus(nowMs, 1), letzterFehler: `Schritt ${schritt}: ${kurz} (nicht zugestellt, neuer Versuch am Folgetag)` };
}

/**
 * Widerruf (Abmeldelink oder RFC-8058-One-Click). Idempotent.
 * @returns {{ergebnis:'widerrufen'|'bereits-widerrufen'|'unbekannt', update:object|null}}
 */
function widerrufe(doc, { nowMs, weg = null } = {}) {
    if (!doc || typeof doc !== "object") return { ergebnis: "unbekannt", update: null };
    if (istZeit(doc.revokedAt)) return { ergebnis: "bereits-widerrufen", update: null };
    return {
        ergebnis: "widerrufen",
        update: {
            revokedAt: nowMs,
            stopped: true,
            nextSendAt: null,
            expiresAt: nachweisAblauf(nowMs),
            widerrufWeg: WIDERRUF_WEGE.includes(weg) ? weg : null
        }
    };
}

/**
 * Nachweis der Pflicht-Checkbox. Eine vom Formular mitgeschickte Version gewinnt;
 * ohne sie gilt der bekannte Stand des Formulars. Ist das Formular unbekannt, bleibt
 * alles null — lieber „nicht übermittelt" als ein Wortlaut, den der Besucher nie sah.
 */
function pflichtNachweis(formular, { version = null } = {}) {
    const bekannt = hatEigen(PFLICHT_WORTLAUTE, formular) ? PFLICHT_WORTLAUTE[formular] : null;
    const gesendet = typeof version === "string" && /^[a-z0-9][a-z0-9.-]{2,59}$/.test(version) ? version : null;
    if (gesendet) {
        return {
            formular: bekannt ? formular : null,
            wortlautVersion: gesendet,
            wortlaut: bekannt && bekannt.version === gesendet ? bekannt.text : null
        };
    }
    if (bekannt) return { formular, wortlautVersion: bekannt.version, wortlaut: bekannt.text };
    return { formular: null, wortlautVersion: null, wortlaut: null };
}

/**
 * Domains, unter denen die Sperrliste des Lead-Cockpits (Firestore `suppression`, Feld
 * `domain`) diese Einwilligung treffen kann: die angegebene Website und der Host der
 * E-Mail-Adresse, jeweils als ASCII- und als Unicode-Form (das Cockpit speichert, was es
 * vorfindet). Ein Sperrlisten-Eintrag (z. B. Widerspruch per Mail an kontakt@, der von Hand
 * eingetragen wurde) hält die Strecke an — V9: gesperrt ist nie erlaubt.
 */
function sperrDomainsFuer(doc) {
    const kandidaten = [];
    if (doc && typeof doc.domain === "string") kandidaten.push(doc.domain);
    const mail = doc ? normalisiereEmail(doc.email) : null;
    if (mail) kandidaten.push(mail.slice(mail.indexOf("@") + 1));
    const out = new Set();
    for (const k of kandidaten) {
        const d = normalisiereDomain(k);
        if (!d) continue;
        out.add(d);
        const unicode = domainToUnicode(d);
        if (unicode && unicode !== d) out.add(unicode);
    }
    return [...out];
}

/** RFC 8058: Body „List-Unsubscribe=One-Click" — urlencoded (geparst oder roh) oder multipart. */
function istOneClickBody({ body, rawBody } = {}) {
    if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
        const v = body["List-Unsubscribe"];
        if (typeof v === "string" && v.trim() === "One-Click") return true;
    }
    let roh = "";
    if (Buffer.isBuffer(rawBody)) roh = rawBody.toString("utf8");
    else if (typeof rawBody === "string") roh = rawBody;
    else if (typeof body === "string") roh = body;
    else if (Buffer.isBuffer(body)) roh = body.toString("utf8");
    if (!roh || roh.length > 10000) return false;
    if (/(?:^|&)List-Unsubscribe=One-Click(?:&|$)/.test(roh.trim())) return true;
    return /name="?List-Unsubscribe"?[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\nOne-Click[ \t]*(?:\r?\n|$)/i.test(roh);
}

// ─── Firestore-Zeitfelder ───────────────────────────────────────────────────

function alsMillis(v) {
    if (v == null) return null;
    if (typeof v === "number") return istZeit(v) ? v : null;
    if (v instanceof Date) return istZeit(v.getTime()) ? v.getTime() : null;
    if (typeof v.toMillis === "function") {
        const ms = v.toMillis();
        return istZeit(ms) ? ms : null;
    }
    if (typeof v.seconds === "number") {
        const ms = v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
        return istZeit(ms) ? ms : null;
    }
    return null;
}

/** Firestore-Daten → Kopie mit ZEITFELDERN in ms. */
function zeitfelderZuMs(daten) {
    if (!daten || typeof daten !== "object") return {};
    const out = { ...daten };
    for (const f of ZEITFELDER) out[f] = alsMillis(daten[f]);
    return out;
}

/** Update/Dokument (ms) → Kopie mit ZEITFELDERN als Timestamp (Konverter wird übergeben). */
function zeitfelderZuTimestamp(daten, ausMillis) {
    const out = { ...(daten || {}) };
    for (const f of ZEITFELDER) {
        if (!Object.prototype.hasOwnProperty.call(out, f)) continue;
        out[f] = istZeit(out[f]) ? ausMillis(out[f]) : null;
    }
    return out;
}

// ─── Sequenz-Lauf (Abhängigkeiten werden übergeben) ─────────────────────────

function fehlerText(err) {
    return String(err && err.message ? err.message : err).replace(/[\r\n]+/g, " ").slice(0, 200);
}

/**
 * Ein Lauf der Nachfass-Strecke. Reihenfolge je Kandidat: beanspruchen (Transaktion,
 * Schritt wird gezählt) → senden → Erfolg bzw. Fehler vermerken. Höchstens `maxMails`
 * Versandversuche je Lauf. Fehler werden über `log` gemeldet, nie still verschluckt.
 *
 * @param {object} deps
 * @param {() => Promise<string[]>} deps.ladeKandidaten
 * @param {(id:string) => Promise<object|null>} deps.beanspruche  liefert {schritt, doc, …} oder null
 * @param {(anspruch:object) => Promise<void>} deps.sende
 * @param {(id:string, anspruch:object) => Promise<void>} deps.nachErfolg
 * @param {(id:string, anspruch:object, err:Error) => Promise<void>} deps.nachFehler
 * @param {() => Promise<void>} [deps.pause]  Abstand zwischen zwei Versandversuchen
 * @param {(stufe:string, nachricht:string, kontext:object) => void} [deps.log]
 */
async function sequenzLauf({ ladeKandidaten, beanspruche: beanspruchen, sende, nachErfolg, nachFehler, maxMails = SEQUENZ_MAX_MAILS, fristMs = Infinity, uhr = Date.now, pause = null, log = () => {} } = {}) {
    const bericht = { kandidaten: 0, versuche: 0, gesendet: 0, fehler: 0, uebersprungen: 0, beanspruchFehler: 0, gedeckelt: false, zeitGedeckelt: false };
    const startMs = uhr();
    const ids = await ladeKandidaten();
    const liste = Array.isArray(ids) ? ids : [];
    bericht.kandidaten = liste.length;
    for (const id of liste) {
        if (bericht.versuche >= maxMails) {
            bericht.gedeckelt = true;
            break;
        }
        // Zeitbudget: vor einer NEUEN Beanspruchung aufhören, statt vom Function-Timeout
        // mitten im Versand abgeschnitten zu werden (dann bliebe ein gezählter Schritt
        // ohne Mail, und der Abschlussbericht fehlte im Log). Der Rest ist morgen fällig.
        if (uhr() - startMs >= fristMs) {
            bericht.zeitGedeckelt = true;
            log("warn", "Zeitbudget erreicht, übrige Kandidaten im nächsten Lauf", { versuche: bericht.versuche });
            break;
        }
        let anspruch = null;
        try {
            anspruch = await beanspruchen(id);
        } catch (err) {
            bericht.beanspruchFehler++;
            log("warn", "Schritt konnte nicht beansprucht werden", { id, error: fehlerText(err) });
            continue;
        }
        if (!anspruch) {
            bericht.uebersprungen++;
            continue;
        }
        if (pause && bericht.versuche > 0) await pause();
        bericht.versuche++;
        try {
            await sende(anspruch);
        } catch (err) {
            bericht.fehler++;
            log("error", "Versand fehlgeschlagen", { id, schritt: anspruch.schritt, code: (err && err.code) || null, error: fehlerText(err) });
            try {
                await nachFehler(id, anspruch, err);
            } catch (err2) {
                log("error", "Versandfehler konnte nicht vermerkt werden", { id, error: fehlerText(err2) });
            }
            continue;
        }
        bericht.gesendet++;
        try {
            await nachErfolg(id, anspruch);
        } catch (err) {
            log("warn", "Versand gelungen, Vermerk fehlgeschlagen", { id, schritt: anspruch.schritt, error: fehlerText(err) });
        }
    }
    return bericht;
}

/**
 * requestAudit wird von zwei Formularen gerufen. Eine ausdrückliche Angabe (consentSource)
 * gewinnt. Ohne sie wird hergeleitet: die Startseite (src/js/audit-magic-moment.js) mischt
 * die First-Touch-Attribution samt `landing` ein, das Formular auf /website-pruefen schickt
 * dieses Feld nie. Die Herleitung wird mitgespeichert — „abgeleitet" ist nicht „gemessen".
 * @returns {{formular:'startseite'|'website-pruefen', herleitung:'explizit'|'landing-feld'|'ohne-landing'}}
 */
function formularFuerRequestAudit({ consentSource, landing } = {}) {
    if (consentSource === "startseite" || consentSource === "website-pruefen") {
        return { formular: consentSource, herleitung: "explizit" };
    }
    if (typeof landing === "string" && landing.trim()) return { formular: "startseite", herleitung: "landing-feld" };
    return { formular: "website-pruefen", herleitung: "ohne-landing" };
}

module.exports = {
    formularFuerRequestAudit,
    // Konstanten
    EINWILLIGUNG_TEXT,
    EINWILLIGUNG_TEXT_VERSION,
    EINWILLIGUNG_TEXTE,
    EINWILLIGUNG_SCOPE,
    EINWILLIGUNG_QUELLEN,
    PFLICHT_WORTLAUTE,
    MAX_SCHRITTE,
    SCHRITT_TAG,
    VERSAND_STUNDE_BERLIN,
    BESTAETIGUNGSFRIST_TAGE,
    NACHWEIS_JAHRE,
    DOPPEL_FENSTER_MS,
    FAELLIG_TOLERANZ_MS,
    MAX_FEHLVERSUCHE,
    SEQUENZ_MAX_MAILS,
    SEQUENZ_KANDIDATEN_LIMIT,
    ZEITFELDER,
    TAG_MS,
    // Zeit
    berlinZeitpunkt,
    berlinTagPlus,
    faelligkeitFuerSchritt,
    nachweisAblauf,
    // Eingaben
    normalisiereEmail,
    normalisiereDomain,
    istAuditSlug,
    istQuelle,
    textFuerVersion,
    // Token & Pseudonymisierung
    erzeugeToken,
    istTokenFormat,
    hashToken,
    pseudonymisiereIp,
    kuerzeIp,
    uaKlasse,
    // Zustand
    baueAnforderung,
    zustand,
    bestaetigungAbgelaufen,
    pruefeNeueAnforderung,
    adressLage,
    bestaetige,
    pruefeFaelligkeit,
    beanspruche,
    aufraeumUpdate,
    nachVersandErfolg,
    nachVersandFehler,
    widerrufe,
    pflichtNachweis,
    sperrDomainsFuer,
    istOneClickBody,
    // Firestore
    zeitfelderZuMs,
    zeitfelderZuTimestamp,
    // Lauf
    sequenzLauf
};
