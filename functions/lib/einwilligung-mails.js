"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Texte der Einwilligungs-Strecke (2026-09-10): Bestätigungsmail, drei
// Hinweis-Mails, Gründer-Benachrichtigung und die schlichten Seiten für
// „Einwilligung bestätigen" und „Abmelden". Rein (kein Versand, kein Firestore)
// → testbar. Versand: lib/mailer.js, Zustände: lib/einwilligung.js.
//
// Jede Mail entsteht aus EINER Blockliste, aus der Text- und HTML-Fassung
// gerendert werden — beide sagen dadurch dasselbe.
//
// Pflichtbausteine jeder Hinweis-Mail (§ 7 Abs. 2 Nr. 3 UWG, Art. 21 Abs. 4 DSGVO):
// erkennbarer Absender, sichtbarer Abmeldelink, Widerspruchshinweis getrennt vom
// übrigen Text, Herkunft der Einwilligung, List-Unsubscribe-Kopfzeilen (RFC 8058).
// Fehlt eine Zutat (Token, Datum, Quelle), wird die Mail NICHT gebaut (EKONFIG) —
// eine Hinweis-Mail ohne funktionierende Abmeldung darf nie hinausgehen.
// ─────────────────────────────────────────────────────────────────────────────

const { domainToUnicode } = require("node:url");
const {
    EINWILLIGUNG_TEXT,
    EINWILLIGUNG_QUELLEN,
    MAX_SCHRITTE,
    SCHRITT_TAG,
    istTokenFormat,
    istAuditSlug
} = require("./einwilligung.js");

const BASIS_URL = "https://karriaro-webdesign.de";
const KONTAKT = "kontakt@karriaro.de";

// V12 — Angaben wörtlich aus src/impressum.html (§ 5 DDG). Ein Test prüft, dass
// sie dort so stehen; ändert sich das Impressum, fällt er.
const ABSENDER = Object.freeze({
    marke: "Karriaro Webdesign",
    name: "Muammer Kizilaslan",
    strasse: "Spitalstr. 7",
    ort: "77761 Schiltach",
    email: KONTAKT,
    impressum: `${BASIS_URL}/impressum`,
    datenschutz: `${BASIS_URL}/datenschutz`
});

const MARKENZEILE = "Karriaro Webdesign — Manufaktur für handcodierte Websites";
// V11 — Einstiegspreis (Essential), einmalig. Ein Test hält ihn an index.js fest.
const EINSTIEGSPREIS = "1.290 €";

// Echte Google-Bewertung, wörtlich aus src/data/reviews.json. Die Functions werden
// ohne src/ ausgeliefert, deshalb steht sie hier; ein Test hält beide gleich.
const GOOGLE_BEWERTUNG = Object.freeze({
    autor: "Ilyas Kablan",
    sterne: 5,
    text: "Habe meine Unternehmenswebseite durch die Karriaro Webdesign erstellen lassen. TOP! Sehr übersichtlich, alles auf dem neuesten Stand. Sehr kompetenter Ansprechpartner! Stark empfehlenswert!",
    plattform: "Google",
    url: "https://share.google/8XBj19xUXH2G4PV8l"
});

// Marken-Palette; Grau und Messing-Dunkel halten auf Weiß und Creme ≥ 4,5:1.
const F = Object.freeze({
    tinte: "#16202C",
    grau: "#525E6B",
    messing: "#6E5F3F",
    messingHell: "#C9A24B",
    linie: "#D9D4C7",
    grund: "#F1EFE7",
    weiss: "#FFFFFF"
});
const SCHRIFT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function konfigFehler(nachricht) {
    const err = new Error(nachricht);
    err.code = "EKONFIG";
    return err;
}

function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const DATUM_FORMAT = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" });
const UHRZEIT_FORMAT = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

function formatiereDatum(ms) {
    return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? DATUM_FORMAT.format(new Date(ms)) : null;
}

function formatiereDatumZeit(ms) {
    const d = formatiereDatum(ms);
    return d ? `${d}, ${UHRZEIT_FORMAT.format(new Date(ms))} Uhr` : null;
}

function quelleText(source) {
    return typeof source === "string" && Object.prototype.hasOwnProperty.call(EINWILLIGUNG_QUELLEN, source)
        ? EINWILLIGUNG_QUELLEN[source]
        : null;
}

/**
 * Domain für Menschen: gespeichert wird die Punycode-Form (xn--…, wie new URL sie
 * liefert). In einer Mail soll „müller-bau.de" stehen, nicht „xn--mller-bau-q9a.de".
 * Nicht umwandelbares bleibt so, wie es gespeichert ist — nie verschluckt.
 */
function anzeigeDomain(domain) {
    if (typeof domain !== "string" || !domain.trim()) return null;
    const roh = domain.trim();
    if (!/(?:^|\.)xn--/i.test(roh)) return roh;
    let unicode = "";
    try {
        unicode = domainToUnicode(roh);
    } catch {
        unicode = "";
    }
    return unicode || roh;
}

/** Für den Gründer: lesbare Form, dahinter die gespeicherte, wenn sie abweicht. */
function domainMitRohform(domain) {
    const anzeige = anzeigeDomain(domain);
    if (!anzeige) return null;
    const roh = domain.trim();
    return anzeige === roh ? roh : `${anzeige} (${roh})`;
}

function pflichtQuelle(source) {
    const q = quelleText(source);
    if (!q) throw konfigFehler("Unbekannte Quelle der Einwilligung");
    return q;
}

function pflichtDatum(ms, feld) {
    const d = formatiereDatum(ms);
    if (!d) throw konfigFehler(`Zeitpunkt ${feld} fehlt`);
    return d;
}

// ─── Links & Kopfzeilen ─────────────────────────────────────────────────────

const bestaetigungsLink = (token) => `${BASIS_URL}/einwilligung?t=${encodeURIComponent(token)}`;
const abmeldeLink = (token) => `${BASIS_URL}/abmelden?t=${encodeURIComponent(token)}`;
const berichtLink = (slug) => `${BASIS_URL}/website-pruefen?slug=${encodeURIComponent(slug)}`;

/** RFC 2369 + RFC 8058: Abmeldung per HTTPS-POST und per Mail. */
function abmeldeKopfzeilen(unsubscribeToken) {
    if (!istTokenFormat(unsubscribeToken)) throw konfigFehler("Abmelde-Token fehlt");
    return {
        "List-Unsubscribe": `<${abmeldeLink(unsubscribeToken)}>, <mailto:${KONTAKT}?subject=Abmelden>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    };
}

// ─── Blöcke → Text/HTML ─────────────────────────────────────────────────────

const absatz = (text) => ({ typ: "absatz", text });
const zeilen = (...z) => ({ typ: "zeilen", zeilen: z });
const liste = (punkte, { nummeriert = false } = {}) => ({ typ: "liste", punkte, nummeriert });
const knopf = (label, href, { imText = true, ersatzlink = true } = {}) => ({ typ: "knopf", label, href, imText, ersatzlink });
const zitat = (text, quelle, href = null) => ({ typ: "zitat", text, quelle, href });
const gruss = () => zeilen("Mit freundlichen Grüßen", MARKENZEILE);

function alsText(bloecke) {
    return bloecke.map((b) => {
        switch (b.typ) {
            case "absatz": return b.text;
            case "zeilen": return b.zeilen.join("\n");
            case "liste": return b.punkte.map((p, i) => `${b.nummeriert ? `${i + 1}.` : "–"} ${p.titel}: ${p.text}`).join("\n");
            case "knopf": return b.imText ? `${b.label}:\n${b.href}` : null;
            case "zitat": return `„${b.text}“\n– ${b.quelle}${b.href ? `\n${b.href}` : ""}`;
            default: return null;
        }
    }).filter((t) => t != null).join("\n\n");
}

function alsHtml(bloecke) {
    return bloecke.map((b) => {
        switch (b.typ) {
            case "absatz":
                return `<p style="margin:0 0 16px">${esc(b.text)}</p>`;
            case "zeilen":
                return `<p style="margin:0 0 16px">${b.zeilen.map(esc).join("<br>")}</p>`;
            case "liste": {
                const tag = b.nummeriert ? "ol" : "ul";
                const punkte = b.punkte.map((p) => `<li style="margin:0 0 10px"><strong style="font-weight:600">${esc(p.titel)}</strong> – ${esc(p.text)}</li>`).join("");
                return `<${tag} style="margin:0 0 20px;padding-left:22px">${punkte}</${tag}>`;
            }
            case "knopf": {
                const haupt = `<p style="margin:8px 0 20px"><a href="${esc(b.href)}" style="display:inline-block;background:${F.tinte};color:${F.grund};text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">${esc(b.label)}</a></p>`;
                const ersatz = b.ersatzlink
                    ? `<p style="margin:0 0 16px;font-size:13px;color:${F.grau}">Falls der Knopf nicht funktioniert, öffnen Sie diesen Link:<br><a href="${esc(b.href)}" style="color:${F.messing};word-break:break-all">${esc(b.href)}</a></p>`
                    : "";
                return haupt + ersatz;
            }
            case "zitat":
                return `<blockquote style="margin:0 0 20px;padding:4px 0 4px 18px;border-left:2px solid ${F.messingHell};font-family:${SERIF};font-size:17px;line-height:1.55;color:${F.tinte}">„${esc(b.text)}“`
                    + `<span style="display:block;margin-top:8px;font-family:${SCHRIFT};font-size:13px;color:${F.grau}">– ${esc(b.quelle)}${b.href ? ` · <a href="${esc(b.href)}" style="color:${F.messing}">Bewertung ansehen</a>` : ""}</span></blockquote>`;
            default:
                return "";
        }
    }).join("");
}

function mailRahmen({ eyebrow = null, titel, kern, unterKern = "", fuss = "" }) {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titel)}</title></head>`
        + `<body style="margin:0;padding:0;background:${F.grund}">`
        + `<div style="background:${F.grund};padding:32px 16px">`
        + `<div style="max-width:560px;margin:0 auto;background:${F.weiss};border:1px solid ${F.linie};padding:36px 32px;color:${F.tinte};font-family:${SCHRIFT};font-size:16px;line-height:1.6">`
        + (eyebrow ? `<p style="margin:0 0 12px;font-family:${MONO};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${F.messing}">${esc(eyebrow)}</p>` : "")
        + `<h1 style="margin:0 0 20px;font-family:${SERIF};font-weight:600;font-size:24px;line-height:1.25;color:${F.tinte}">${esc(titel)}</h1>`
        + kern
        + unterKern
        + `</div>`
        + (fuss ? `<div style="max-width:560px;margin:0 auto;padding:20px 8px 0;font-family:${SCHRIFT};font-size:12px;line-height:1.55;color:${F.grau}">${fuss}</div>` : "")
        + `</div></body></html>`;
}

function absenderText() {
    return [
        ABSENDER.marke,
        `${ABSENDER.name} · ${ABSENDER.strasse} · ${ABSENDER.ort}`,
        `${ABSENDER.email} · ${ABSENDER.impressum}`
    ].join("\n");
}

function absenderHtml() {
    return `${esc(ABSENDER.marke)}<br>${esc(ABSENDER.name)} · ${esc(ABSENDER.strasse)} · ${esc(ABSENDER.ort)}<br>`
        + `<a href="mailto:${esc(ABSENDER.email)}" style="color:${F.messing}">${esc(ABSENDER.email)}</a> · `
        + `<a href="${esc(ABSENDER.impressum)}" style="color:${F.messing}">Impressum</a> · `
        + `<a href="${esc(ABSENDER.datenschutz)}" style="color:${F.messing}">Datenschutz</a>`;
}

/** Einwilligungstext wörtlich; nur das letzte Wort wird zum Link auf die Datenschutzerklärung. */
function einwilligungstextHtml() {
    const wort = "Datenschutzerklärung";
    const i = EINWILLIGUNG_TEXT.lastIndexOf(wort);
    if (i < 0) return esc(EINWILLIGUNG_TEXT);
    return esc(EINWILLIGUNG_TEXT.slice(0, i))
        + `<a href="${esc(ABSENDER.datenschutz)}" style="color:${F.messing}">${wort}</a>`
        + esc(EINWILLIGUNG_TEXT.slice(i + wort.length));
}

// ─── Bestätigungsmail (strikt werbefrei) ────────────────────────────────────

/**
 * Nur: Bitte um Bestätigung, Einwilligungstext wörtlich, Bestätigungslink,
 * Hinweis „nicht angefordert → ignorieren", Absenderangaben. Keine Leistung,
 * kein Preis, kein Angebot außerhalb des zitierten Wortlauts.
 */
function bestaetigungsMail({ domain = null, source, createdAtMs, confirmToken } = {}) {
    const quelle = pflichtQuelle(source);
    const datum = pflichtDatum(createdAtMs, "createdAt");
    if (!istTokenFormat(confirmToken)) throw konfigFehler("Bestätigungs-Token fehlt");
    const link = bestaetigungsLink(confirmToken);
    const subject = "Bitte bestätigen Sie Ihre Einwilligung";
    const einleitung = `über ${quelle} wurde am ${datum} für diese E-Mail-Adresse folgende Einwilligung abgegeben:`;
    const anzeige = anzeigeDomain(domain);
    const websiteZeile = anzeige ? `Angegebene Website: ${anzeige}` : null;
    const bitte = "Bitte bestätigen Sie die Einwilligung über diesen Link:";
    const ignorieren = "Haben Sie das nicht angefordert, ignorieren Sie diese E-Mail – es passiert nichts.";

    const text = [
        "Guten Tag,",
        einleitung,
        `„${EINWILLIGUNG_TEXT}“`,
        websiteZeile,
        `${bitte}\n${link}`,
        `Datenschutzerklärung: ${ABSENDER.datenschutz}`,
        ignorieren,
        absenderText()
    ].filter(Boolean).join("\n\n");

    const kern = `<p style="margin:0 0 16px">Guten Tag,</p>`
        + `<p style="margin:0 0 16px">${esc(einleitung)}</p>`
        + `<blockquote style="margin:0 0 20px;padding:4px 0 4px 18px;border-left:2px solid ${F.messingHell};color:${F.tinte}">„${einwilligungstextHtml()}“</blockquote>`
        + (websiteZeile ? `<p style="margin:0 0 16px;font-size:14px;color:${F.grau}">${esc(websiteZeile)}</p>` : "")
        + `<p style="margin:0 0 8px">${esc(bitte)}</p>`
        + alsHtml([knopf("Einwilligung bestätigen", link)])
        + `<p style="margin:0">${esc(ignorieren)}</p>`;

    const html = mailRahmen({ titel: subject, kern, fuss: absenderHtml() });
    return { subject, text, html };
}

// ─── Drei Hinweis-Mails ─────────────────────────────────────────────────────

const SCHRITT_INHALTE = Object.freeze({
    1: ({ domain, auditSlug }) => ({
        subject: "Was die Prüfung Ihrer Website zeigt",
        bloecke: [
            absatz("Guten Tag,"),
            auditSlug
                ? absatz(`Ihr Bericht${domain ? ` zu ${domain}` : ""} liegt weiterhin für Sie bereit. Er zeigt, was die Prüfung an Ihrer Website gefunden hat.`)
                : absatz(`Sie haben Hinweise zu Ihrer Website${domain ? ` ${domain}` : ""} angefordert. Dies ist der erste.`),
            ...(auditSlug ? [knopf("Bericht öffnen", berichtLink(auditSlug))] : []),
            absatz("Drei Stellen, auf die es bei einer Website besonders ankommt:"),
            liste([
                { titel: "Mobiles Tempo", text: "Wie schnell steht der erste Bildschirm auf dem Smartphone, und ist er dort ohne Zoomen lesbar?" },
                { titel: "Klare Kontaktwege", text: "Finden Interessenten auf jeder Seite ohne Suchen einen Weg zu Ihnen – Telefon, E-Mail oder Anfrage?" },
                { titel: "Auffindbarkeit in KI-Antworten", text: "Versteht ein KI-Assistent wie ChatGPT oder Perplexity, was Ihr Betrieb anbietet und wo? Strukturierte Daten auf der Website können dazu beitragen." }
            ]),
            absatz("Im nächsten Hinweis zeigen wir, wie bei uns ein Entwurf für eine neue Website entsteht."),
            gruss()
        ]
    }),
    2: () => ({
        subject: "So entsteht Ihr Entwurf",
        bloecke: [
            absatz("Guten Tag,"),
            absatz("eine neue Website entsteht bei uns in vier Schritten – und die Entscheidung liegt erst nach dem Entwurf bei Ihnen."),
            liste([
                { titel: "Gespräch", text: "Wir sprechen darüber, was Ihr Betrieb leistet, wen Sie erreichen möchten und was die Website für Sie tun soll." },
                { titel: "Entwurf", text: "Sie sehen zuerst einen kostenfreien Entwurf für Ihren Betrieb." },
                { titel: "Entscheidung", text: "Erst der Entwurf, dann Ihre Entscheidung. Passt er nicht, entstehen Ihnen keine Kosten." },
                { titel: "Umsetzung", text: "Sagen Sie zu, setzen wir die Website zum vereinbarten Festpreis um." }
            ], { nummeriert: true }),
            absatz("Was ein Kunde nach der Zusammenarbeit auf Google geschrieben hat:"),
            zitat(GOOGLE_BEWERTUNG.text, `${GOOGLE_BEWERTUNG.autor} · ${GOOGLE_BEWERTUNG.sterne} von 5 Sternen auf ${GOOGLE_BEWERTUNG.plattform}`, GOOGLE_BEWERTUNG.url),
            absatz("Im dritten und letzten Hinweis erhalten Sie unser Angebot für einen Entwurf."),
            gruss()
        ]
    }),
    3: ({ domain }) => ({
        subject: "Ein kostenfreier Entwurf für Ihre Website",
        bloecke: [
            absatz("Guten Tag,"),
            absatz("dies ist der dritte und letzte Hinweis, den Sie mit Ihrer Einwilligung von uns erhalten."),
            absatz(`Unser Angebot: Wir entwerfen eine neue Website${domain ? ` für ${domain}` : ""}. Sie sehen zuerst einen kostenfreien Entwurf und entscheiden danach – unverbindlich.`),
            absatz(`Entscheiden Sie sich für die Umsetzung, gelten unsere Festpreise ab ${EINSTIEGSPREIS}, einmalig, kein Abo.`),
            absatz(`Wenn Sie einen Entwurf möchten, antworten Sie auf diese E-Mail oder schreiben Sie an ${KONTAKT}. Ein Satz zu Ihrem Betrieb genügt.`),
            knopf("Entwurf per E-Mail anfragen", `mailto:${KONTAKT}?subject=${encodeURIComponent(`Entwurf${domain ? ` für ${domain}` : ""}`)}`, { imText: false, ersatzlink: false }),
            absatz("Danach schreiben wir Ihnen nicht mehr unaufgefordert."),
            gruss()
        ]
    })
});

function herkunftSatz({ quelle, angefordert, bestaetigt, schritt }) {
    return `Sie haben am ${angefordert} über ${quelle} eingewilligt, bis zu drei E-Mails mit Hinweisen zu Ihrer Website und einem unverbindlichen Angebot für eine neue Website zu erhalten, und die Einwilligung am ${bestaetigt} per E-Mail bestätigt. Dies ist E-Mail ${schritt} von ${MAX_SCHRITTE}.`;
}

const WIDERSPRUCH_TITEL = "Ihr Widerspruchsrecht (Art. 21 DSGVO)";
const WIDERSPRUCH_TEXT = `Sie können der Verarbeitung Ihrer personenbezogenen Daten zum Zweck der Direktwerbung jederzeit widersprechen. Nach einem Widerspruch verwenden wir Ihre Daten nicht mehr für diesen Zweck. Ein formloser Widerspruch genügt – über den Abmeldelink oder per Mail an ${KONTAKT}.`;

/**
 * Hinweis-Mail Schritt 1–3 samt Pflichtbausteinen und Kopfzeilen.
 * @returns {{subject:string, text:string, html:string, headers:object}}
 */
function sequenzMail(schritt, { domain = null, source, createdAtMs, confirmedAtMs, auditSlug = null, berichtVerfuegbar = false, unsubscribeToken } = {}) {
    if (!Number.isInteger(schritt) || schritt < 1 || schritt > MAX_SCHRITTE) throw konfigFehler(`Unbekannter Schritt ${schritt}`);
    const headers = abmeldeKopfzeilen(unsubscribeToken);
    const quelle = pflichtQuelle(source);
    const angefordert = pflichtDatum(createdAtMs, "createdAt");
    const bestaetigt = pflichtDatum(confirmedAtMs, "confirmedAt");
    const inhalt = SCHRITT_INHALTE[schritt]({
        domain: anzeigeDomain(domain),
        auditSlug: berichtVerfuegbar === true && istAuditSlug(auditSlug) ? auditSlug : null
    });
    const abmelden = abmeldeLink(unsubscribeToken);
    const herkunft = herkunftSatz({ quelle, angefordert, bestaetigt, schritt });
    const eyebrow = `Hinweis ${schritt} von ${MAX_SCHRITTE}`;

    const text = [
        alsText(inhalt.bloecke),
        "———",
        `Keine weiteren E-Mails erhalten – hier abmelden:\n${abmelden}`,
        herkunft,
        `${WIDERSPRUCH_TITEL}\n${WIDERSPRUCH_TEXT}`,
        absenderText()
    ].join("\n\n");

    const unterKern = `<hr style="border:none;border-top:1px solid ${F.linie};margin:28px 0 16px">`
        + `<p style="margin:0;font-size:14px;color:${F.tinte}">Keine weiteren E-Mails erhalten? <a href="${esc(abmelden)}" style="color:${F.messing};text-decoration:underline">Hier abmelden</a></p>`;

    const fuss = `<p style="margin:0 0 14px">${esc(herkunft)}</p>`
        + `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid ${F.linie};background:${F.weiss};color:${F.tinte}">`
        + `<p style="margin:0 0 6px;font-weight:600">${esc(WIDERSPRUCH_TITEL)}</p>`
        + `<p style="margin:0">${esc(WIDERSPRUCH_TEXT)}</p></div>`
        + `<p style="margin:0">${absenderHtml()}</p>`;

    const html = mailRahmen({ eyebrow, titel: inhalt.subject, kern: alsHtml(inhalt.bloecke), unterKern, fuss });
    return { subject: inhalt.subject, text, html, headers };
}

// ─── Gründer-Benachrichtigung ───────────────────────────────────────────────

/**
 * `gestoppt`: für die Adresse läuft KEINE Strecke (vor der Bestätigung gestoppt oder
 * Stopp einer anderen Anforderung derselben Adresse). Der Zustand wird übergeben, nicht
 * angenommen — sonst meldete die Mail eine Strecke, die nie startet.
 */
function gruenderMailBestaetigt({ id = null, email, domain = null, source, createdAtMs, confirmedAtMs, textVersion, auditSlug = null, gestoppt = false } = {}) {
    const zeilenPaare = [
        ["E-Mail", email || "—"],
        ["Domain", domainMitRohform(domain) || "—"],
        ["Quelle", source ? `${source}${quelleText(source) ? ` (${quelleText(source)})` : ""}` : "—"],
        ["Text-Version", textVersion || "—"],
        ["Angefordert", formatiereDatumZeit(createdAtMs) || "—"],
        ["Bestätigt", formatiereDatumZeit(confirmedAtMs) || "—"],
        ["Strecke", gestoppt === true ? "gestoppt — keine Hinweis-E-Mails" : "geplant"],
        ["Bericht", istAuditSlug(auditSlug) ? berichtLink(auditSlug) : "—"],
        ["Einwilligungs-ID", id || "—"]
    ];
    const plan = gestoppt === true
        ? "Für diese Adresse ist die Nachfass-Strecke gestoppt: Es werden keine Hinweis-E-Mails versendet. Die Bestätigung bleibt als Nachweis gespeichert."
        : `Die Nachfass-Strecke läuft automatisch: drei E-Mails, ${SCHRITT_TAG[1]}, ${SCHRITT_TAG[2]} und ${SCHRITT_TAG[3]} Tage nach der Bestätigung, jeweils um 10 Uhr. Stoppen lässt sie sich im Lead-Cockpit.`;
    const grenze = "Die Einwilligung deckt genau diese drei E-Mails. Zusätzliche Werbe-Mails von Hand sind davon nicht gedeckt; eine Antwort auf eine Nachricht des Interessenten bleibt davon unberührt.";
    const subject = `Einwilligung bestätigt: ${anzeigeDomain(domain) || email || "unbekannt"}${gestoppt === true ? " (Strecke gestoppt)" : ""}`;
    const text = [
        "Eine Einwilligung (Double-Opt-In) wurde bestätigt.",
        zeilenPaare.map(([k, v]) => `${(k + ":").padEnd(18)}${v}`).join("\n"),
        plan,
        grenze,
        "— Karriaro Backend (einwilligungBestaetigen)"
    ].join("\n\n");
    const html = `<div style="font-family:${SCHRIFT};max-width:580px;margin:0 auto;color:${F.tinte};line-height:1.55">`
        + `<h2 style="font-size:18px;margin:0 0 16px">Einwilligung bestätigt</h2>`
        + `<table style="width:100%;border-collapse:collapse;font-size:14px">`
        + zeilenPaare.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:${F.grau};width:140px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;word-break:break-all">${esc(v)}</td></tr>`).join("")
        + `</table>`
        + `<p style="margin:20px 0 8px">${esc(plan)}</p>`
        + `<p style="margin:0;color:${F.grau};font-size:13px">${esc(grenze)}</p>`
        + `</div>`;
    return { subject, text, html };
}

// ─── Seiten: Bestätigen & Abmelden ──────────────────────────────────────────

const SEITEN_CSS = `*{box-sizing:border-box}body{margin:0;background:${F.grund};color:${F.tinte};font-family:${SCHRIFT};font-size:17px;line-height:1.6}`
    + `main{max-width:560px;margin:0 auto;padding:12vh 24px 64px}`
    + `.eyebrow{margin:0 0 12px;font-family:${MONO};font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${F.messing}}`
    + `h1{margin:0 0 20px;font-family:${SERIF};font-weight:600;font-size:clamp(1.6rem,4.5vw,2.2rem);line-height:1.2}`
    + `p{margin:0 0 16px}blockquote{margin:0 0 20px;padding:4px 0 4px 18px;border-left:2px solid ${F.messingHell}}`
    + `a{color:${F.messing}}form{margin:24px 0 8px}`
    + `button{font:inherit;font-weight:600;background:${F.tinte};color:${F.grund};border:0;border-radius:6px;padding:12px 24px;min-height:44px;cursor:pointer}`
    + `button:focus-visible,a:focus-visible{outline:2px solid ${F.messingHell};outline-offset:3px}`
    + `.hinweis{font-size:15px;color:${F.grau}}`
    + `footer{margin-top:48px;padding-top:16px;border-top:1px solid ${F.linie};font-size:13px;color:${F.grau}}`;

// Kein Script, kein fremder Inhalt: nur Inline-Styles und Formular an dieselbe Adresse.
const SEITEN_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const WIDERRUF_WEGE_TEXT = `über den Abmeldelink in jeder E-Mail oder per Mail an ${KONTAKT}`;

const SEITEN = Object.freeze({
    bestaetigenFrage: {
        status: 200,
        titel: "Einwilligung bestätigen",
        absaetze: ["Mit dem Knopf bestätigen Sie diese Einwilligung:"],
        einwilligungstext: true,
        knopf: "Einwilligung bestätigen",
        versteckt: { bestaetigen: "1" },
        hinweis: "Haben Sie das nicht angefordert, schließen Sie diese Seite – es passiert nichts."
    },
    bestaetigt: {
        status: 200,
        titel: "Ihre Einwilligung ist bestätigt",
        absaetze: [
            "Vielen Dank. Sie erhalten höchstens drei E-Mails mit Hinweisen zu Ihrer Website und einem unverbindlichen Angebot.",
            `Sie können die Einwilligung jederzeit widerrufen – ${WIDERRUF_WEGE_TEXT} oder direkt über den folgenden Link.`
        ],
        widerrufLink: true
    },
    bereitsBestaetigt: {
        status: 200,
        titel: "Ihre Einwilligung ist bereits bestätigt",
        absaetze: [`Sie können sie jederzeit widerrufen – ${WIDERRUF_WEGE_TEXT} oder direkt über den folgenden Link.`],
        widerrufLink: true
    },
    widerrufen: {
        status: 200,
        titel: "Diese Einwilligung wurde widerrufen",
        absaetze: ["Sie erhalten keine E-Mails dieser Art mehr von uns. Möchten Sie wieder Hinweise erhalten, können Sie die Einwilligung auf karriaro-webdesign.de erneut erteilen."]
    },
    abgelaufen: {
        status: 410,
        titel: "Dieser Link ist abgelaufen",
        absaetze: ["Die Frist für die Bestätigung ist verstrichen. Die Einwilligung ist nicht wirksam geworden, und es werden keine E-Mails versendet."]
    },
    ungueltig: {
        status: 404,
        titel: "Dieser Link ist nicht gültig",
        absaetze: [`Bitte prüfen Sie, ob der Link vollständig übernommen wurde. Bei Fragen erreichen Sie uns unter ${KONTAKT}.`]
    },
    fehler: {
        status: 503,
        titel: "Gerade nicht erreichbar",
        absaetze: [`Bitte versuchen Sie es später noch einmal. Abmelden können Sie sich jederzeit auch per Mail an ${KONTAKT}.`]
    },
    zuViele: {
        status: 429,
        titel: "Zu viele Aufrufe",
        absaetze: ["Bitte versuchen Sie es später noch einmal."]
    },
    abmeldenFrage: {
        status: 200,
        titel: "Von E-Mails abmelden",
        absaetze: ["Mit dem Knopf widerrufen Sie Ihre Einwilligung. Danach erhalten Sie keine E-Mails mit Hinweisen und Angeboten mehr von uns."],
        knopf: "Abmelden",
        versteckt: { "List-Unsubscribe": "One-Click", quelle: "seite" }
    },
    abgemeldet: {
        status: 200,
        titel: "Sie sind abgemeldet",
        absaetze: ["Ihre Einwilligung ist widerrufen. Sie erhalten keine weiteren E-Mails dieser Art von uns."]
    },
    bereitsAbgemeldet: {
        status: 200,
        titel: "Sie sind bereits abgemeldet",
        absaetze: ["Ihre Einwilligung ist widerrufen. Sie erhalten keine weiteren E-Mails dieser Art von uns."]
    },
    unvollstaendig: {
        status: 400,
        titel: "Anfrage unvollständig",
        absaetze: [`Bitte nutzen Sie den Knopf auf der Abmeldeseite oder schreiben Sie an ${KONTAKT}.`]
    },
    methode: {
        status: 405,
        titel: "Nicht unterstützt",
        absaetze: ["Diese Adresse lässt sich nur im Browser öffnen."]
    }
});

/**
 * Seite nach Art. `token` (Formularziel) und `widerrufToken` (Link „Einwilligung
 * widerrufen") werden nur verwendet, wenn sie das Token-Format haben.
 * @returns {{status:number, html:string}}
 */
function seite(art, { token = null, widerrufToken = null } = {}) {
    const s = Object.prototype.hasOwnProperty.call(SEITEN, art) ? SEITEN[art] : SEITEN.ungueltig;
    const teile = [];
    for (const a of s.absaetze || []) teile.push(`<p>${esc(a)}</p>`);
    if (s.einwilligungstext) teile.push(`<blockquote>„${einwilligungstextHtml()}“</blockquote>`);
    if (s.knopf && istTokenFormat(token)) {
        const versteckt = Object.entries(s.versteckt || {})
            .map(([n, v]) => `<input type="hidden" name="${esc(n)}" value="${esc(v)}">`).join("");
        teile.push(`<form method="post" action="?t=${esc(encodeURIComponent(token))}">${versteckt}<button type="submit">${esc(s.knopf)}</button></form>`);
    }
    if (s.widerrufLink && istTokenFormat(widerrufToken)) {
        teile.push(`<p><a href="${esc(abmeldeLink(widerrufToken))}">Einwilligung widerrufen</a></p>`);
    }
    if (s.hinweis) teile.push(`<p class="hinweis">${esc(s.hinweis)}</p>`);
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width, initial-scale=1">`
        + `<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">`
        + `<title>${esc(s.titel)} · Karriaro Webdesign</title><style>${SEITEN_CSS}</style></head>`
        + `<body><main><p class="eyebrow">Karriaro Webdesign</p><h1>${esc(s.titel)}</h1>${teile.join("")}`
        + `<footer>${esc(ABSENDER.marke)} · ${esc(ABSENDER.name)} · ${esc(ABSENDER.strasse)} · ${esc(ABSENDER.ort)}<br>`
        + `<a href="${esc(ABSENDER.impressum)}">Impressum</a> · <a href="${esc(ABSENDER.datenschutz)}">Datenschutz</a></footer>`
        + `</main></body></html>`;
    return { status: s.status, html };
}

module.exports = {
    BASIS_URL,
    KONTAKT,
    ABSENDER,
    MARKENZEILE,
    EINSTIEGSPREIS,
    GOOGLE_BEWERTUNG,
    SEITEN_CSP,
    esc,
    formatiereDatum,
    formatiereDatumZeit,
    quelleText,
    anzeigeDomain,
    bestaetigungsLink,
    abmeldeLink,
    berichtLink,
    abmeldeKopfzeilen,
    bestaetigungsMail,
    sequenzMail,
    gruenderMailBestaetigt,
    seite
};
