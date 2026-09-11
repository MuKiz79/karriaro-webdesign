"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Gemeinsamer SMTP-Versand (2026-09-10).
//
// Bisher baute jede Stelle in index.js ihren eigenen nodemailer-Transport. Die
// neuen Einwilligungs-Endpunkte nutzen diesen einen; die Altstellen dürfen
// schrittweise folgen. Zugangsdaten werden übergeben (Secrets liest index.js),
// damit diese Datei ohne Firebase-Umgebung testbar bleibt.
// ─────────────────────────────────────────────────────────────────────────────

const nodemailer = require("nodemailer");

const ABSENDER_FROM = '"Karriaro Webdesign" <noreply@karriaro.de>';
const ANTWORT_AN = "kontakt@karriaro.de";

// Gebundene Timeouts (wie seit Sprint 176): ein hängender Mailserver darf das
// Zeitbudget einer Function nicht aufzehren.
const SMTP_OPTIONEN = Object.freeze({
    port: 587,
    secure: false,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000
});

function konfigFehler(nachricht) {
    const err = new Error(nachricht);
    err.code = "EKONFIG";
    return err;
}

/**
 * @param {{host:string, user:string, pass:string}} zugang
 * @param {{erzeuge?:Function}} [optionen]  Test-Naht für den Transport-Bau
 */
function erzeugeTransport({ host, user, pass } = {}, { erzeuge = nodemailer.createTransport } = {}) {
    if (!host || !user || !pass) throw konfigFehler("SMTP-Zugang unvollständig");
    return erzeuge({ host, ...SMTP_OPTIONEN, auth: { user, pass } });
}

const ZEILENUMBRUCH = /[\r\n]/;

/**
 * Versendet eine Mail. Wirft bei ungültigen Kopfzeilen-Werten (Header-Injection),
 * fehlendem Transport und — anders als nodemailer von sich aus — wenn der Server
 * alle Empfänger abgelehnt hat.
 */
async function sendeMail(transport, { to, subject, text, html, headers = null, replyTo = ANTWORT_AN, from = ABSENDER_FROM } = {}) {
    if (!transport || typeof transport.sendMail !== "function") throw konfigFehler("Kein Mail-Transport");
    for (const [name, wert] of [["to", to], ["subject", subject], ["replyTo", replyTo], ["from", from]]) {
        if (typeof wert !== "string" || !wert.trim() || ZEILENUMBRUCH.test(wert)) {
            const err = new Error(`Ungültiger Wert für ${name}`);
            err.code = "EENVELOPE";
            throw err;
        }
    }
    if (headers) {
        for (const [k, v] of Object.entries(headers)) {
            if (ZEILENUMBRUCH.test(k) || ZEILENUMBRUCH.test(String(v))) {
                const err = new Error(`Ungültige Kopfzeile ${k}`);
                err.code = "EENVELOPE";
                throw err;
            }
        }
    }
    const info = await transport.sendMail({ from, replyTo, to, subject, text, html, ...(headers ? { headers } : {}) });
    const abgelehnt = Array.isArray(info && info.rejected) ? info.rejected : [];
    const angenommen = Array.isArray(info && info.accepted) ? info.accepted : null;
    if (abgelehnt.length > 0 && (!angenommen || angenommen.length === 0)) {
        const err = new Error("Empfänger abgelehnt");
        err.code = "EENVELOPE";
        err.command = "RCPT TO";
        throw err;
    }
    return info;
}

/**
 * Ist die Mail nach diesem Fehler SICHER nicht beim Empfänger-Server angekommen?
 * Nur dann darf ein gezählter Schritt zurückgegeben werden. Zeitüberschreitungen
 * oder Verbindungsabbrüche während/nach DATA sind unklar → false.
 */
function versandSicherNichtErfolgt(err) {
    if (!err) return false;
    const code = String(err.code || "");
    if (["EKONFIG", "EAUTH", "EDNS", "EENVELOPE", "ETLS", "EREQUIRETLS"].includes(code)) return true;
    const befehl = String(err.command || "").toUpperCase();
    if (/^(EHLO|HELO|LHLO|STARTTLS|AUTH|MAIL FROM|RCPT TO)/.test(befehl)) return true;
    // Der Server hat die Nachricht nach DATA ausdrücklich abgelehnt (4xx/5xx).
    if (befehl === "DATA" && Number(err.responseCode) >= 400) return true;
    // ACHTUNG: nodemailer (6.10) meldet den Socket-Timeout ('Timeout'), den Socket-Fehler
    // und „Connection closed unexpectedly" mit command 'CONN' — auch dann, wenn die
    // Nachricht längst übertragen war und nur die 250-Antwort fehlt (gemessen an einem
    // SMTP-Doppel, das nach DATA hängt bzw. auflegt). 'CONN' und ECONNECTION sind deshalb
    // KEIN Beleg. Sicher vor jeder Übertragung liegen nur der Verbindungsaufbau selbst
    // (Socket-Fehler beim connect/DNS) und die Fristen bis zur Begrüßung.
    if (code === "ESOCKET" && ["connect", "getaddrinfo"].includes(String(err.syscall || ""))) return true;
    if (code === "ETIMEDOUT" && /^(Connection timeout|Greeting never received)$/.test(String(err.message || ""))) return true;
    return false;
}

module.exports = {
    ABSENDER_FROM,
    ANTWORT_AN,
    SMTP_OPTIONEN,
    erzeugeTransport,
    sendeMail,
    versandSicherNichtErfolgt
};
