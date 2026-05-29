// ─────────────────────────────────────────────────────────────────────────────
// Firebase-Projekt: apex-executive (shared mit karriaro/app/).
//
// Firestore-Rules werden in karriaro/app/firestore.rules verwaltet und über
// karriaro/app/firebase.json deployt. Dieses Repo deployt NUR Cloud Functions
// (codebase: webdesign-functions). Die Rules für Lead-Intelligence-Collections
// (leads, leadSettings) leben dort — siehe karriaro/app/firestore.rules:182.
// ─────────────────────────────────────────────────────────────────────────────

const { onRequest } = require("firebase-functions/v2/https");
const { defineString, defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { runAuditPipeline, detectTech, checkFreshness } = require("./lib/audit-pipeline.js");
const { runLightAudit } = require("./lib/light-audit.js");
const {
    extractSubPages,
    htmlToText,
    fetchPagesParallel,
    buildResearchPrompt,
    SYSTEM_PROMPT,
    TOOL_DEFINITION
} = require("./lib/deep-research.js");
const mockupGenerator = require("./lib/mockup-generator.js");
const { runSecurityAudit } = require("./lib/security-audit.js");
const { safeFetch } = require("./lib/safe-fetch.js");
// Sprint 82 — Firestore-backed Rate-Limit + Client-IP-Parser (X-Forwarded-For-aware).
const { enforceRateLimit, clientIp } = require("./lib/rate-limit-store.js");
const { normalizeUrl } = require("./lib/url-utils.js");  // Sprint 178 — Single-Source
const logger = require("./lib/logger.js");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PLACES_KEY = defineSecret("PLACES_API_KEY");
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const CLAUDE_API_KEY = defineSecret("CLAUDE_API_KEY");
const PSI_API_KEY = defineSecret("PSI_API_KEY");

const DEEP_RESEARCH_MODEL = "claude-sonnet-4-20250514";
const DEEP_RESEARCH_CACHE_DAYS = 7;

const ALLOWED_ORIGINS = ["https://karriaro-webdesign.de", "https://www.karriaro-webdesign.de", "https://m.karriaro-webdesign.de", "http://localhost:3000", "http://localhost:5000", "http://localhost:8080", "http://localhost:8780"];
const PLACES_BASE = "https://places.googleapis.com/v1/places";

const AUDIT_FROM = '"Karriaro Webdesign" <noreply@karriaro.de>';
const AUDIT_REPLY_TO = "kontakt@karriaro.de";

function cors(req, res, methods = "POST, OPTIONS") {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Access-Control-Allow-Methods", methods);
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return true; }
    return false;
}

// ── Text Search: "Friseur Berlin" or "beispiel.de" ──
exports.searchPlaces = onRequest({ region: "europe-west1", cors: false, secrets: [PLACES_KEY] }, async (req, res) => {
    if (cors(req, res)) return;
    if (await enforceRateLimit(db, req, res, "searchPlaces", 30, 60)) return;

    const { query, maxResults = 10 } = req.body || {};
    if (!query) return res.status(400).json({ error: "query required" });

    try {
        const response = await fetch(`${PLACES_BASE}:searchText`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": PLACES_KEY.value(),
                "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress,places.primaryTypeDisplayName,places.regularOpeningHours,places.photos,places.businessStatus,places.location,places.primaryType"
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: "de",
                maxResultCount: Math.min(maxResults, 20)
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Places API error", details: err.message });
    }
});

// ── Nearby Search: competitors in same area + category ──
exports.nearbyPlaces = onRequest({ region: "europe-west1", cors: false, secrets: [PLACES_KEY] }, async (req, res) => {
    if (cors(req, res)) return;
    if (await enforceRateLimit(db, req, res, "nearbyPlaces", 30, 60)) return;

    const { lat, lng, type, radiusMeters = 5000, maxResults = 5 } = req.body || {};
    if (!lat || !lng || !type) return res.status(400).json({ error: "lat, lng, type required" });

    try {
        const response = await fetch(`${PLACES_BASE}:searchNearby`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": PLACES_KEY.value(),
                "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus"
            },
            body: JSON.stringify({
                includedPrimaryTypes: [type],
                maxResultCount: Math.min(maxResults, 10),
                locationRestriction: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: radiusMeters
                    }
                },
                languageCode: "de"
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Nearby API error", details: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// INBOUND-AUDIT-PIPELINE: requestAudit, getAuditData, trackLeadView
// ═══════════════════════════════════════════════════════════════

function generateSlug() {
    // 12 Zeichen, URL-safe, Crockford-base32 ohne ähnliche Zeichen.
    const ALPHA = "0123456789abcdefghjkmnpqrstvwxyz";
    const buf = crypto.randomBytes(8);
    let out = "";
    for (let i = 0; i < buf.length; i++) out += ALPHA[buf[i] % 32];
    return out + ALPHA[Math.floor(Math.random() * 32)] + ALPHA[Math.floor(Math.random() * 32)] + ALPHA[Math.floor(Math.random() * 32)] + ALPHA[Math.floor(Math.random() * 32)];
}

function isValidEmail(s) {
    return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 200;
}
// normalizeUrl: Sprint 178 → lib/url-utils.js (Single-Source, war hier dupliziert ohne i-Flag).

// Sprint 161 — Founder-Notification, wenn der Inbound-Lead aus einem
// veröffentlichten Branchen-Report kam (reportSlug + refHash gesetzt).
// Geht NUR an AUDIT_REPLY_TO (kontakt@karriaro.de), nicht an den Lead.
async function notifyFounderOnReportInbound(payload) {
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST.value(),
        port: 587,
        secure: false,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
        // Sprint 176 — gebundene SMTP-Timeouts, damit ein hängender Mailserver
        // nicht das 60s-Function-Budget aufzehrt.
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000
    });
    const subject = `Web-Index-Lead: ${payload.domain} (Report ${payload.reportSlug})`;
    const text = `Inbound aus Branchen-Report.

Domain:        ${payload.domain}
Lead-Name:     ${payload.name || "—"}
Lead-Email:    ${payload.email}
Kam von:       /audit/${payload.reportSlug}/${payload.refHash ? "  (Kennung " + payload.refHash + ")" : ""}
Audit-Slug:    ${payload.slug}
Lead-Score:    ${payload.leadScore ?? "—"}
Erstellt:      ${new Date().toISOString()}

Founder-Antwort: einfach auf diese Mail antworten (Reply-To zeigt auf den Lead).

— Karriaro Backend (requestAudit → notifyFounderOnReportInbound)`;

    const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;color:#1d1d1f;line-height:1.55">
        <h2 style="font-size:18px;margin:0 0 16px">Web-Index-Lead</h2>
        <p style="margin:0 0 16px">Ein Lead aus dem öffentlichen Branchen-Report <strong>/audit/${payload.reportSlug}/</strong>${payload.refHash ? ` (Kennung <code>${payload.refHash}</code>)` : ""} hat sich identifiziert und einen Detail-Audit angefordert.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 12px 6px 0;color:#86868b;width:130px">Domain</td><td style="padding:6px 0;font-weight:500">${payload.domain}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">Lead-Name</td><td style="padding:6px 0">${payload.name || "—"}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">Lead-Email</td><td style="padding:6px 0"><a href="mailto:${payload.email}" style="color:#0071e3">${payload.email}</a></td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">Audit-Slug</td><td style="padding:6px 0"><a href="https://karriaro-webdesign.de/audit?slug=${encodeURIComponent(payload.slug)}" style="color:#0071e3">${payload.slug}</a></td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">Lead-Score</td><td style="padding:6px 0">${payload.leadScore ?? "—"}</td></tr>
        </table>
        <p style="margin:24px 0 0;color:#86868b;font-size:12px">Reply-To zeigt auf den Lead — antworten Sie direkt.</p>
    </div>`;

    await transporter.sendMail({
        from: AUDIT_FROM,
        replyTo: payload.email,
        to: AUDIT_REPLY_TO,
        subject,
        text,
        html
    });
}

async function sendAuditMail(to, name, slug, domain, attribution = {}) {
    if (attribution.reportSlug) {
        logger.info("requestAudit attribution", {
            fn: "requestAudit", slug, domain,
            reportSlug: attribution.reportSlug,
            refHash: attribution.refHash || null
        });
    }
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST.value(),
        port: 587,
        secure: false,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
        // Sprint 176 — gebundene SMTP-Timeouts, damit ein hängender Mailserver
        // nicht das 60s-Function-Budget aufzehrt.
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000
    });
    const link = `https://karriaro-webdesign.de/audit?slug=${encodeURIComponent(slug)}`;
    const greeting = name ? `Hallo ${name},` : "Guten Tag,";
    const subject = `Ihr Mini-Audit für ${domain} ist bereit`;
    const text = `${greeting}

vielen Dank für Ihre Anfrage. Ihr Mini-Audit für ${domain} ist fertig.

Sie finden die Ergebnisse hier:
${link}

Wenn Sie das Audit besprechen möchten, antworten Sie einfach auf diese E-Mail oder buchen direkt ein 30-Minuten-Gespräch.

Beste Grüße
Karriaro Webdesign
${AUDIT_REPLY_TO}`;

    const html = `<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; color: #1d1d1f; line-height: 1.55;">
        <p>${greeting}</p>
        <p>vielen Dank für Ihre Anfrage. Ihr Mini-Audit für <strong>${domain}</strong> ist fertig.</p>
        <p style="margin: 24px 0;"><a href="${link}" style="background:#0071e3;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:500;display:inline-block">Audit-Seite öffnen</a></p>
        <p style="font-size:13px;color:#86868b">Falls der Button nicht funktioniert, kopieren Sie diesen Link:<br><a href="${link}" style="color:#0071e3">${link}</a></p>
        <p>Wenn Sie das Audit besprechen möchten, antworten Sie einfach auf diese E-Mail oder buchen direkt ein 30-Minuten-Gespräch.</p>
        <p style="margin-top:24px">Beste Grüße<br>Karriaro Webdesign<br><a href="mailto:${AUDIT_REPLY_TO}" style="color:#0071e3">${AUDIT_REPLY_TO}</a></p>
        <hr style="border:none;border-top:1px solid #e5e5e7;margin:32px 0">
        <p style="font-size:11px;color:#86868b">Diese E-Mail wurde gesendet, weil Sie auf karriaro-webdesign.de einen Audit angefordert haben. Wir werden Ihre Daten nach 90 Tagen automatisch löschen.</p>
    </div>`;

    await transporter.sendMail({
        from: AUDIT_FROM,
        replyTo: AUDIT_REPLY_TO,
        to,
        subject,
        text,
        html
    });
}

// ─── requestAudit ─── POST {url, name, email, consent, company(honeypot)}
exports.requestAudit = onRequest(
    {
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 60,
        cors: false,
        secrets: [SMTP_HOST, SMTP_USER, SMTP_PASS, PLACES_KEY, PSI_API_KEY]
    },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
        // IP-Limit 3/h + (weiter unten) Per-Email-Limit 5/Tag schuetzen Mail-Spam.
        if (await enforceRateLimit(db, req, res, "requestAudit", 3, 3600,
            "Sie haben das stündliche Limit erreicht. Bitte später erneut.")) return;

        const { url, name, email, consent, company, reportSlug, refHash } = req.body || {};

        // Honeypot — wenn ausgefüllt: stilles Erfolgs-Signal an den Bot
        if (company && String(company).trim().length > 0) {
            return res.status(200).json({ ok: true, slug: "honeypot-noop" });
        }

        // Sprint 143 — Attribution: nur sanitisierte Slugs/Hashes akzeptieren,
        // damit kein Free-Text in Firestore landet.
        const SLUG_RE  = /^[a-z0-9][a-z0-9-]{1,63}$/;
        const HASH_RE  = /^[A-Z]-\d{3}$/;
        const safeReportSlug = typeof reportSlug === "string" && SLUG_RE.test(reportSlug) ? reportSlug : null;
        const safeRefHash    = typeof refHash    === "string" && HASH_RE.test(refHash)    ? refHash    : null;

        if (!consent) return res.status(400).json({ error: "DSGVO-Zustimmung fehlt" });
        const auditUrl = normalizeUrl(url);
        if (!auditUrl) return res.status(400).json({ error: "Ungültige URL" });
        if (!isValidEmail(email)) return res.status(400).json({ error: "Ungültige E-Mail" });
        const safeName = String(name || "").trim().slice(0, 100);

        // Sprint 82 — Per-Email-Limit (5/Tag) als zweite Schutzschicht gegen Mail-Spam-Floods.
        const emailHash = crypto.createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24);
        if (await enforceRateLimit(db, { ip: emailHash, headers: {} }, res, "requestAudit:email", 5, 86400,
            "Diese E-Mail-Adresse hat das tägliche Limit erreicht. Bitte morgen erneut.")) return;

        const slug = generateSlug();
        const domain = new URL(auditUrl).hostname.replace(/^www\./, "");

        // Light-Pipeline asynchron starten — Antwort nicht blockieren bis fertig.
        // Aber: im 60s-Timeout läuft alles, wir warten doch — vereinfacht den Mail-Versand.
        let pipelineResult;
        try {
            // Sprint 176 — PSI mit API-Key (vorher ""): authentifizierte Quota, kein 429→502.
            pipelineResult = await runAuditPipeline(auditUrl, safeSecretValue(PSI_API_KEY));
        } catch (err) {
            logger.error("requestAudit pipeline failed", {
                fn: "requestAudit", domain, error: err.message
            });
            // Sprint 177 — generische Meldung: reflektiert keinen SSRF-Grund ("SSRF blocked: private IPv4 …") an den Client.
            return res.status(502).json({ error: "Audit-Pipeline fehlgeschlagen", details: "Die Seite konnte nicht analysiert werden." });
        }

        // Konkurrenz optional via Places-Search (best effort)
        let competitors = [];
        try {
            const placesRes = await fetch(`${PLACES_BASE}:searchText`, {
                method: "POST",
                signal: AbortSignal.timeout(8000),
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": PLACES_KEY.value(),
                    "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.location,places.primaryType"
                },
                body: JSON.stringify({ textQuery: domain, languageCode: "de", maxResultCount: 1 })
            });
            const placesData = await placesRes.json();
            const place = placesData?.places?.[0];
            if (place?.location && place?.primaryType) {
                const nearby = await fetch(`${PLACES_BASE}:searchNearby`, {
                    method: "POST",
                    signal: AbortSignal.timeout(8000),
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": PLACES_KEY.value(),
                        "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.websiteUri"
                    },
                    body: JSON.stringify({
                        includedPrimaryTypes: [place.primaryType],
                        maxResultCount: 5,
                        locationRestriction: { circle: { center: place.location, radius: 5000 } },
                        languageCode: "de"
                    })
                });
                const nearbyData = await nearby.json();
                competitors = (nearbyData?.places || [])
                    .filter(c => c.userRatingCount > 30 && c.rating >= 4.0 && (c.websiteUri || "").indexOf(domain) === -1)
                    .slice(0, 3)
                    .map(c => ({
                        name: c.displayName?.text || "—",
                        rating: c.rating || null,
                        reviews: c.userRatingCount || 0,
                        website: c.websiteUri || null
                    }));
            }
        } catch (err) {
            console.warn("Places competitors failed (non-fatal):", err.message);
        }

        // Firestore-Insert
        const auditDoc = {
            slug,
            url: auditUrl,
            domain,
            name: safeName,
            email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAtMs: Date.now(),
            // 90 Tage TTL — Firestore-TTL-Policy auf Feld `expiresAt`
            expiresAt: new admin.firestore.Timestamp(Math.floor((Date.now() + 90 * 86400000) / 1000), 0),
            techAge: pipelineResult.techAge,
            tech: pipelineResult.tech,
            wayback: pipelineResult.wayback,
            bfsg: pipelineResult.bfsg,
            websiteScore: pipelineResult.websiteScore,
            leadScore: pipelineResult.leadScore,
            summary: pipelineResult.summary,
            competitors,
            visitCount: 0,
            ctaClicks: 0,
            source: safeReportSlug ? "report-inbound" : "inbound_form",
            reportSlug: safeReportSlug,
            refHash: safeRefHash
        };
        await db.collection("auditRequests").doc(slug).set(auditDoc);

        // Sprint 161 — Founder-Notification bei Inbound aus Branchen-Report.
        // Best-effort, separate Mail an kontakt@karriaro.de.
        if (safeReportSlug) {
            try {
                await notifyFounderOnReportInbound({
                    domain,
                    name: safeName,
                    email,
                    slug,
                    reportSlug: safeReportSlug,
                    refHash: safeRefHash,
                    leadScore: pipelineResult?.leadScore ?? null
                });
            } catch (err) {
                logger.warn("notifyFounderOnReportInbound failed (non-fatal)", {
                    fn: "requestAudit", slug, reportSlug: safeReportSlug, error: err.message
                });
            }
        }

        // Mail senden (best effort — wenn fehlschlägt, Fehler protokollieren, aber Slug zurückgeben)
        try {
            await sendAuditMail(email, safeName, slug, domain, {
                reportSlug: safeReportSlug,
                refHash: safeRefHash
            });
        } catch (err) {
            logger.error("requestAudit mail send failed", {
                fn: "requestAudit", slug, domain, error: err.message
            });
            await db.collection("auditRequests").doc(slug).update({ mailError: err.message });
        }

        return res.json({ ok: true, slug, domain });
    }
);

// ─── quickAudit ─── POST {url, hp(honeypot)}
//   Hero-Inline-Reveal: 3-Karten-Snippet, KEIN Mail-Versand, KEIN PII-Persist.
//   Cache 24h frisch, Storage-TTL 7 Tage (Feld `expiresAt`).
const QUICK_AUDIT_FRESH_MS = 24 * 3600 * 1000;
const QUICK_AUDIT_TTL_DAYS = 7;

function quickAuditCacheKey(url) {
    return crypto.createHash("sha256").update(url).digest("hex").slice(0, 32);
}

// Sprint 82 — Rotating-Salt fuer ipHash. Salt wechselt taeglich, plus optional
// ein zusaetzlicher Secret-Wert (IPHASH_SALT_BASE), den der Betreiber per
// `firebase functions:secrets:set IPHASH_SALT_BASE` rotieren kann ohne Code-Deploy.
// Auch ohne Secret ist die Pseudonymisierung jetzt taeglich neu (keine Korrelation
// ueber Tage hinweg moeglich, im Gegensatz zum statischen Salt der Vorgaenger-Version).
function dailyIpHash(ip) {
    const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const base = process.env.IPHASH_SALT_BASE || "karriaro-rotating";
    return crypto
        .createHash("sha256")
        .update(`${ip}:${dayKey}:${base}`)
        .digest("hex")
        .slice(0, 16);
}

// Sprint 81 — Server-Side Score-Berechnung analog zu Frontend computeKarriaroScore (index.html).
// Liefert int 0-100 fuer Severity-Tracking & spaeter Industry-Benchmark.
function computeServerScore(payload) {
    let score = 100;
    const branch = payload.branch;
    if (branch && branch.totalCount) {
        score -= (1 - branch.foundCount / branch.totalCount) * 30;
    }
    const ta = payload.techAge;
    if (ta) {
        if (ta.severity >= 4) score -= 25;
        else if (ta.severity >= 2) score -= 12;
    }
    const bfsg = payload.bfsg;
    if (bfsg && bfsg.complianceScore != null) {
        score -= (100 - bfsg.complianceScore) * 0.35;
    }
    const perf = payload.performance;
    if (perf && perf.score != null) {
        score -= (100 - perf.score) * 0.15;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

function buildQuickResponse(domain, light, full) {
    // Light liefert immer: tech, wayback, techAge (heur.), bfsg (heur.), branch.
    // Full liefert wenn verfuegbar: techAge (PSI-confirmed), bfsg (WCAG), websiteScore, summary.
    // Strategie: Tech-Daten bevorzugt aus Full (PSI-confirmed Versionen), sonst Light.
    //            BFSG bevorzugt Full (WCAG-Pruefung) — wenn nur Light, Heuristik mit method-Flag.
    //            Performance nur wenn Full.
    //            Branche immer aus Light.
    const ta = (full?.techAge && full.techAge.cms) ? full.techAge : (light.techAge || {});
    const bfsg = (full?.bfsg && typeof full.bfsg.complianceScore === "number")
        ? { ...full.bfsg, method: "wcag" }
        : { ...(light.bfsg || {}), method: "heuristic" };
    const perfScore = full?.websiteScore?.perf;

    return {
        ok: true,
        domain,
        light: !full,
        techAge: {
            headline: ta.headline || null,
            cms: ta.cms || null,
            majorVersion: ta.majorVersion || null,
            severity: ta.severity != null ? ta.severity : null,
            pitchArg: ta.pitchArg || null,
            composite: ta.composite || null,
            yearsSinceLastChange: ta.yearsSinceLastChange != null ? ta.yearsSinceLastChange : null
        },
        bfsg: {
            complianceScore: bfsg.complianceScore != null ? bfsg.complianceScore : null,
            risk: bfsg.risk || null,
            fine: bfsg.fine || null,
            pitchArg: bfsg.pitchArg || null,
            method: bfsg.method
        },
        performance: perfScore != null
            ? { score: perfScore, source: "psi" }
            : { score: null, source: null, hint: "Performance-Score erhalten Sie im Komplettaudit per E-Mail." },
        branch: light.branch ? {
            name: light.branch.branch,
            primaryType: light.branch.primaryType,
            usedDefault: light.branch.usedDefault,
            mustHave: light.branch.mustHave,
            shouldHave: light.branch.shouldHave,
            foundCount: light.branch.foundCount,
            totalCount: light.branch.totalCount,
            severity: light.branch.severity,
            pitchArg: light.branch.pitchArg
        } : null,
        // Sprint 68 — Pain-Points: Content-Freshness, Security-Headers,
        // Vendor-Lockin, Mobile-Viewport, Social-Meta. Adressiert die Buy-Trigger
        // (Veraltung, Sicherheit, kein Self-Service, Mobile-Probleme, Social-Sharing).
        painPoints: light.painPoints || null,
        // Sprint 69 — SEO (Schema.org, Canonical, robots/sitemap, Title/Meta-Description)
        // + GEO (llms.txt, FAQ-/Article-/BreadcrumbList-Schema fuer ChatGPT/Perplexity).
        seoGeo: light.seoGeo || null,
        // Sprint 69 — Karriaro-Cross-Sell-Tools pro Branche + Trend-Phrase.
        crossSell: light.crossSell || null,
        summary: full?.summary || null
    };
}

function safeSecretValue(secretRef) {
    try { return secretRef.value() || ""; }
    catch { return ""; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 169 — Karriaro MCP-Server (Public-API für Claude/Cursor/v0).
// Eigener Endpoint mit no-auth CORS und separatem Rate-Limit (20/h pro IP).
// Tools: audit_site, extract_voice, generate_brand_mockup, phyllotaxis_signature.
// ─────────────────────────────────────────────────────────────────────────────

const mcpServer = require("./mcp/index.js");

exports.mcpHandler = onRequest(
    {
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 60,
        cors: false,
        secrets: [PLACES_KEY, CLAUDE_API_KEY]
    },
    async (req, res) => {
        // MCP-Handler hat eigene CORS-Logik (* erlaubt, da MCP-Clients
        // unterschiedliche Origins haben). Rate-Limit verteidigt gegen Abuse.
        if (req.method !== "OPTIONS" && req.method !== "GET") {
            if (await enforceRateLimit(db, req, res, "mcpHandler", 20, 3600,
                "Stündliches Limit erreicht. Bitte später erneut.")) return;
        }
        var ctx = {
            placesKey: safeSecretValue(PLACES_KEY),
            claudeKey: safeSecretValue(CLAUDE_API_KEY)
        };
        try {
            await mcpServer.handleHttp(req, res, ctx);
        } catch (err) {
            console.error("mcpHandler unhandled error:", err);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal error: " + (err && err.message ? err.message : String(err)) },
                    id: null
                });
            }
        }
    }
);

exports.quickAudit = onRequest(
    {
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 60,
        cors: false,
        secrets: [PLACES_KEY, PSI_API_KEY]
    },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
        if (await enforceRateLimit(db, req, res, "quickAudit", 5, 3600,
            "Sie haben das stündliche Limit erreicht. Bitte später erneut.")) return;

        const { url, hp } = req.body || {};

        if (hp && String(hp).trim().length > 0) {
            return res.status(200).json({ ok: true, bot: true });
        }

        const auditUrl = normalizeUrl(url);
        if (!auditUrl) return res.status(400).json({ error: "Ungültige URL" });

        let domain;
        try { domain = new URL(auditUrl).hostname.replace(/^www\./, ""); }
        catch { return res.status(400).json({ error: "Ungültige URL" }); }

        const cacheKey = quickAuditCacheKey(auditUrl);

        try {
            const cached = await db.collection("quickAudits").doc(cacheKey).get();
            if (cached.exists) {
                const d = cached.data();
                if (d.cachedAtMs && Date.now() - d.cachedAtMs < QUICK_AUDIT_FRESH_MS) {
                    return res.json({ ...d.payload, cached: true });
                }
            }
        } catch (err) {
            console.warn("quickAudit cache lookup failed:", err.message);
        }

        const placesKey = safeSecretValue(PLACES_KEY);

        // Light-Audit ist die einzige Pipeline im Hero — garantiert 3-5s Antwort.
        // PSI-basierte Vollpipeline (Performance + WCAG-BFSG) laeuft nur noch in
        // requestAudit (Komplettaudit per E-Mail), wo der User Wartezeit akzeptiert.
        let lightResult;
        try {
            lightResult = await runLightAudit(auditUrl, placesKey);
        } catch (err) {
            // SSRF-Errors als WARNING, alles andere als ERROR (Sprint 82 trennt Angriffe vom Infra-Bug).
            const isSsrf = String(err.message || "").startsWith("SSRF blocked");
            const sev = isSsrf ? "warn" : "error";
            logger[sev]("quickAudit light failed", {
                fn: "quickAudit", domain, error: err.message, ssrf: isSsrf
            });
            const lower = String(err.message || "").toLowerCase();
            const isUnreachable = lower.includes("http ") || lower.includes("abort") || lower.includes("fetch") || isSsrf;
            return res.json({
                ok: true,
                degraded: true,
                domain,
                error: isUnreachable
                    ? "Wir konnten Ihre Seite gerade nicht erreichen."
                    : "Wir konnten Ihre Seite gerade nicht analysieren."
            });
        }

        const payload = buildQuickResponse(domain, lightResult, null);

        try {
            await db.collection("quickAudits").doc(cacheKey).set({
                cachedAtMs: Date.now(),
                domain,
                url: auditUrl,
                hadFullResult: false,
                payload,
                expiresAt: new admin.firestore.Timestamp(
                    Math.floor((Date.now() + QUICK_AUDIT_TTL_DAYS * 86400000) / 1000), 0
                )
            });
        } catch (err) {
            console.warn("quickAudit cache write failed:", err.message);
        }

        // Sprint 81 — Severity-Tracking fuer Industry-Benchmark (Folge-Sprint).
        // Separate Collection, 90-Tage-Retention (vs. 7d Cache).
        // Sprint 82 — clientIp() statt ungesplittetem X-Forwarded-For, dailyIpHash() statt statischem Salt.
        try {
            const ip = clientIp(req);
            const ipHash = dailyIpHash(ip);
            const seo = payload.seoGeo?.seo || {};
            const geo = payload.seoGeo?.geo || {};
            const branchInfo = payload.branch || {};
            const score = computeServerScore(payload);
            const sevClass = score < 50 ? "high" : score < 80 ? "mid" : "low";
            await db.collection("auditAnalytics").add({
                domain,
                score,
                sevClass,
                branchType: branchInfo.primaryType || null,
                usedDefault: branchInfo.usedDefault || false,
                foundCount: branchInfo.foundCount || 0,
                totalCount: branchInfo.totalCount || 0,
                seoFound: seo.found || 0,
                geoFound: geo.found || 0,
                isSpa: !!payload.painPoints?.spaArchitecture?.isSpa,
                bfsgScore: payload.bfsg?.complianceScore ?? null,
                ipHash,
                ts: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.warn("auditAnalytics write failed:", err.message);
        }

        return res.json(payload);
    }
);

// ─── getAuditData ─── GET ?slug=... → JSON für Lead-Page
exports.getAuditData = onRequest(
    { region: "europe-west1", memory: "256MiB", timeoutSeconds: 10, cors: false },
    async (req, res) => {
        if (cors(req, res, "GET, OPTIONS")) return;
        if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

        const slug = String(req.query.slug || "");
        if (!slug || slug.length > 32 || !/^[0-9a-z]+$/.test(slug)) {
            return res.status(400).json({ error: "Invalid slug" });
        }

        const snap = await db.collection("auditRequests").doc(slug).get();
        if (!snap.exists) return res.status(404).json({ error: "Audit nicht gefunden" });

        const d = snap.data();
        // Personenbezogene Daten (E-Mail, Name) NICHT exposen.
        const safe = {
            domain: d.domain,
            url: d.url,
            createdAt: d.createdAtMs,
            techAge: d.techAge,
            bfsg: d.bfsg,
            websiteScore: d.websiteScore,
            leadScore: d.leadScore,
            summary: d.summary,
            competitors: d.competitors || []
        };
        // Cache-Header für 5 Min
        res.set("Cache-Control", "public, max-age=300");
        res.json(safe);
    }
);

// ─── requestPackage ─── POST {name, email, industry, pkg, url?, message?, _hp}
//   Sprint 90 — Mobile-Lead-Form ersetzt mailto-Friction.
//   Speichert in Firestore `packageRequests` (TTL 90 Tage), sendet Mail an kontakt@karriaro.de.
const PACKAGE_INDUSTRY_ALLOWLIST = new Set([
    "immobilien", "dachdecker", "praxis", "friseur", "coaching",
    "gastro", "handwerk", "logistik", "anwalt", "sonstiges"
]);
const PACKAGE_TIER_ALLOWLIST = new Set([
    "essential", "professional", "premium", "premium-plus", "unsure"
]);
const PACKAGE_TIER_LABEL = {
    "essential": "Essential (1.290 €)",
    "professional": "Professional (1.990 €)",
    "premium": "Premium (2.990 €)",
    "premium-plus": "Premium+ Anwalt (3.990 €)",
    "unsure": "Unsicher – Beratung gewünscht"
};
const PACKAGE_INDUSTRY_LABEL = {
    "immobilien": "Immobilien-Makler",
    "dachdecker": "Dachdecker / Handwerk",
    "praxis": "Arztpraxis / Therapeut",
    "friseur": "Friseur / Beauty",
    "coaching": "Coaching / Beratung",
    "gastro": "Gastronomie",
    "handwerk": "Handwerk (allgemein)",
    "logistik": "Spedition / Logistik",
    "anwalt": "Anwaltskanzlei",
    "sonstiges": "Sonstiges"
};

async function sendPackageRequestMail(payload) {
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST.value(),
        port: 587,
        secure: false,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
        // Sprint 176 — gebundene SMTP-Timeouts, damit ein hängender Mailserver
        // nicht das 60s-Function-Budget aufzehrt.
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000
    });
    const industryLabel = PACKAGE_INDUSTRY_LABEL[payload.industry] || payload.industry;
    const pkgLabel = PACKAGE_TIER_LABEL[payload.pkg] || payload.pkg;
    const subject = `Neue Paket-Anfrage: ${pkgLabel} (${industryLabel})`;
    const text = `Neue Anfrage von der Mobile-Seite:

Name:           ${payload.name}
E-Mail:         ${payload.email}
Branche:        ${industryLabel}
Wunsch-Paket:   ${pkgLabel}
Aktuelle Site:  ${payload.url || "—"}
Nachricht:      ${payload.message || "—"}

Request-ID:     ${payload.requestId}
Quelle:         ${payload.source}
IP-Hash:        ${payload.ipHash}
User-Agent:     ${payload.userAgent || "—"}
Eingegangen:    ${new Date().toISOString()}

— Karriaro Backend (functions/index.js → requestPackage)`;

    const html = `<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; color: #1d1d1f; line-height: 1.55;">
        <h2 style="font-size:18px;margin:0 0 16px">Neue Paket-Anfrage (Mobile)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 12px 6px 0;color:#86868b;width:130px">Name</td><td style="padding:6px 0;font-weight:500">${payload.name}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">E-Mail</td><td style="padding:6px 0"><a href="mailto:${payload.email}" style="color:#0071e3">${payload.email}</a></td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">Branche</td><td style="padding:6px 0">${industryLabel}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">Wunsch-Paket</td><td style="padding:6px 0;font-weight:500">${pkgLabel}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b">Aktuelle Site</td><td style="padding:6px 0">${payload.url ? `<a href="${payload.url}" style="color:#0071e3">${payload.url}</a>` : "—"}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#86868b;vertical-align:top">Nachricht</td><td style="padding:6px 0;white-space:pre-wrap">${payload.message || "—"}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e5e7;margin:24px 0">
        <p style="font-size:11px;color:#86868b">Request-ID ${payload.requestId} · Quelle ${payload.source} · IP-Hash ${payload.ipHash} · ${new Date().toISOString()}</p>
    </div>`;

    await transporter.sendMail({
        from: AUDIT_FROM,
        replyTo: payload.email,
        to: AUDIT_REPLY_TO,
        subject,
        text,
        html
    });
}

exports.requestPackage = onRequest(
    {
        region: "europe-west1",
        memory: "256MiB",
        timeoutSeconds: 30,
        cors: false,
        secrets: [SMTP_HOST, SMTP_USER, SMTP_PASS]
    },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

        const body = req.body || {};
        // Honeypot — Bot füllt _hp aus, wir antworten mit 204 ohne Verarbeitung.
        if (body._hp && String(body._hp).trim().length > 0) {
            return res.status(204).send("");
        }

        // Rate-Limit: 3 Requests pro IP pro 24h
        if (await enforceRateLimit(db, req, res, "requestPackage", 3, 86400,
            "Sie haben das tägliche Limit erreicht. Bitte morgen erneut oder schreiben Sie an kontakt@karriaro.de.")) return;

        const name = String(body.name || "").trim().slice(0, 100);
        const email = String(body.email || "").trim().toLowerCase();
        const industry = String(body.industry || "").trim().toLowerCase();
        const pkg = String(body.pkg || "").trim().toLowerCase();
        const rawUrl = body.url ? String(body.url).trim() : "";
        const message = String(body.message || "").trim().slice(0, 500);

        if (!name) return res.status(400).json({ ok: false, error: "Name fehlt" });
        if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "Ungültige E-Mail" });
        if (!PACKAGE_INDUSTRY_ALLOWLIST.has(industry)) {
            return res.status(400).json({ ok: false, error: "Ungültige Branche" });
        }
        if (!PACKAGE_TIER_ALLOWLIST.has(pkg)) {
            return res.status(400).json({ ok: false, error: "Ungültiges Paket" });
        }
        let url = "";
        if (rawUrl) {
            const normalized = normalizeUrl(rawUrl);
            if (!normalized) return res.status(400).json({ ok: false, error: "Ungültige Website-URL" });
            url = normalized;
        }

        // Per-Email-Limit: 5/Tag als zweite Schutzschicht.
        const emailHash = crypto.createHash("sha256").update(email).digest("hex").slice(0, 24);
        if (await enforceRateLimit(db, { ip: emailHash, headers: {} }, res, "requestPackage:email", 5, 86400,
            "Diese E-Mail-Adresse hat das tägliche Limit erreicht.")) return;

        const requestId = generateSlug();
        const ip = clientIp(req);
        const ipHash = dailyIpHash(ip);
        const userAgent = String(req.headers["user-agent"] || "").slice(0, 200);
        const source = String(body.source || "mobile-index").slice(0, 40);

        const doc = {
            requestId,
            name,
            email,
            industry,
            pkg,
            url,
            message,
            ipHash,
            userAgent,
            source,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAtMs: Date.now(),
            expiresAt: new admin.firestore.Timestamp(Math.floor((Date.now() + 90 * 86400000) / 1000), 0),
            mailSent: false
        };

        try {
            await db.collection("packageRequests").doc(requestId).set(doc);
        } catch (err) {
            logger.error("requestPackage firestore write failed", {
                fn: "requestPackage", requestId, error: err.message
            });
            return res.status(500).json({ ok: false, error: "Speichern fehlgeschlagen" });
        }

        try {
            await sendPackageRequestMail({ ...doc, requestId });
            await db.collection("packageRequests").doc(requestId).update({ mailSent: true });
        } catch (err) {
            logger.error("requestPackage mail send failed", {
                fn: "requestPackage", requestId, error: err.message
            });
            await db.collection("packageRequests").doc(requestId).update({ mailError: err.message });
            // Mail-Fehler nicht zum User durchreichen — Daten sind gespeichert, Team sieht es im Cockpit.
        }

        return res.json({ ok: true, requestId });
    }
);

// ─── trackLeadView ─── POST {slug, event}
exports.trackLeadView = onRequest(
    { region: "europe-west1", memory: "256MiB", timeoutSeconds: 5, cors: false },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

        const { slug, event } = req.body || {};
        if (!slug || typeof slug !== "string" || slug.length > 32) {
            return res.status(400).json({ error: "Invalid slug" });
        }
        const validEvents = new Set(["open", "heartbeat", "cta_click"]);
        if (!validEvents.has(event)) {
            return res.status(400).json({ error: "Invalid event" });
        }

        const ref = db.collection("auditRequests").doc(slug);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: "Slug nicht gefunden" });

        const updates = {
            lastVisitAt: admin.firestore.FieldValue.serverTimestamp(),
            lastVisitAtMs: Date.now()
        };
        if (event === "open") {
            updates.visitCount = admin.firestore.FieldValue.increment(1);
            updates.firstVisitAt = updates.firstVisitAt || admin.firestore.FieldValue.serverTimestamp();
        }
        if (event === "cta_click") {
            updates.ctaClicks = admin.firestore.FieldValue.increment(1);
        }
        await ref.update(updates);

        // Append visit-event into subcollection (light, capped via TTL)
        await ref.collection("visits").add({
            event,
            ts: admin.firestore.FieldValue.serverTimestamp(),
            tsMs: Date.now(),
            ip: (req.ip || req.headers["x-forwarded-for"] || "").toString().slice(0, 64),
            ua: (req.headers["user-agent"] || "").toString().slice(0, 256)
        });

        res.json({ ok: true });
    }
);

// ═══════════════════════════════════════════════════════════════
// DEEP RESEARCH: ganzheitliche Site-Analyse mit Sub-Pages + Sonnet
// ═══════════════════════════════════════════════════════════════

function deepResearchCacheKey(url) {
    const u = String(url || "").toLowerCase().replace(/\/+$/, "");
    return crypto.createHash("sha256").update(u).digest("hex").slice(0, 24);
}

async function loadDeepResearchCache(url) {
    try {
        const key = deepResearchCacheKey(url);
        const snap = await db.collection("deepResearch").doc(key).get();
        if (!snap.exists) return null;
        const data = snap.data();
        const expires = data.expiresAtMs || 0;
        if (expires > 0 && expires < Date.now()) return null;
        return data;
    } catch (err) {
        console.warn("deepResearch cache read failed:", err.message);
        return null;
    }
}

async function saveDeepResearchCache(url, payload) {
    try {
        const key = deepResearchCacheKey(url);
        const expiresAtMs = Date.now() + DEEP_RESEARCH_CACHE_DAYS * 86400000;
        await db.collection("deepResearch").doc(key).set({
            ...payload,
            cachedUrl: url,
            cachedAtMs: Date.now(),
            expiresAtMs,
            expiresAt: new admin.firestore.Timestamp(Math.floor(expiresAtMs / 1000), 0)
        });
    } catch (err) {
        console.warn("deepResearch cache write failed:", err.message);
    }
}

async function callClaudeForResearch(promptText) {
    const body = {
        model: DEEP_RESEARCH_MODEL,
        max_tokens: 4096,
        system: [
            { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
        ],
        tools: [TOOL_DEFINITION],
        tool_choice: { type: "tool", name: TOOL_DEFINITION.name },
        messages: [{ role: "user", content: promptText }]
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": CLAUDE_API_KEY.value(),
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000)
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const toolUse = (data.content || []).find(c => c.type === "tool_use" && c.name === TOOL_DEFINITION.name);
    if (!toolUse?.input) throw new Error("Claude returned no tool_use payload");
    return {
        assessment: toolUse.input,
        usage: data.usage || null,
        stopReason: data.stop_reason
    };
}

// ─── deepResearch ─── POST {url, branche?, place?, psiData?}
exports.deepResearch = onRequest(
    {
        region: "europe-west1",
        memory: "1GiB",
        timeoutSeconds: 90,
        cors: false,
        secrets: [CLAUDE_API_KEY, PLACES_KEY]
    },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
        // Claude-Calls = $$$ → strenges Limit 5/h
        if (await enforceRateLimit(db, req, res, "deepResearch", 5, 3600)) return;

        const startMs = Date.now();
        let { url, branche = null, place = null, psiData = null, force = false } = req.body || {};
        if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        // 1) Cache lookup
        if (!force) {
            const cached = await loadDeepResearchCache(url);
            if (cached?.assessment) {
                return res.json({
                    ok: true,
                    cached: true,
                    cachedAtMs: cached.cachedAtMs,
                    assessment: cached.assessment,
                    debug: { fromCache: true, durationMs: Date.now() - startMs }
                });
            }
        }

        try {
            // 2) Homepage holen + Sub-Pages parallel
            // Sprint 175 — SSRF: Homepage über safeFetch (per-Hop-Validierung, manueller Redirect-Follow).
            const homepageFetch = safeFetch(url, {
                timeoutMs: 10000,
                headers: { "User-Agent": "Karriaro-LeadBot/1.0", "Accept": "text/html,*/*" }
            }).then(async r => ({ ok: r.ok, status: r.status, html: r.ok ? await r.text() : "" }))
              .catch(err => ({ ok: false, status: 0, html: "", error: String(err?.message || err) }));

            const homepage = await homepageFetch;
            if (!homepage.ok || !homepage.html) {
                // Sprint 177 — generisch: kein SSRF-Grund/interne IP an den Client.
                return res.status(502).json({ error: "Homepage konnte nicht geladen werden", details: "Die Zielseite war nicht erreichbar." });
            }

            const homepageText = htmlToText(homepage.html, 2200);
            const subPageEntries = extractSubPages(homepage.html, url, 6);
            const subPages = subPageEntries.length > 0
                ? await fetchPagesParallel(subPageEntries, { textChars: 1200, timeoutMs: 6000 })
                : [];

            // 3) Tech + Wayback + Place ggf. ergänzen
            let psiSnapshot = psiData ? psiData.lighthouseResult ? psiData : { lighthouseResult: psiData } : null;
            if (!psiSnapshot) {
                // Falls Aufrufer kein PSI mitgeschickt hat, läuft Deep Research auch ohne
                psiSnapshot = null;
            }
            const tech = psiSnapshot ? detectTech(psiSnapshot) : { cms: null, version: null, isBaukasten: false };
            const wayback = await checkFreshness(url).catch(() => ({ available: false }));

            const psiScores = psiSnapshot ? {
                perf: Math.round((psiSnapshot.lighthouseResult?.categories?.performance?.score || 0) * 100),
                seo: Math.round((psiSnapshot.lighthouseResult?.categories?.seo?.score || 0) * 100),
                a11y: Math.round((psiSnapshot.lighthouseResult?.categories?.accessibility?.score || 0) * 100),
                bp: Math.round((psiSnapshot.lighthouseResult?.categories?.["best-practices"]?.score || 0) * 100)
            } : null;

            // 4) Konkurrenz ergänzen falls Place-Daten vorliegen
            let competitors = [];
            try {
                if (place?.location && place?.primaryType) {
                    const r = await fetch(`${PLACES_BASE}:searchNearby`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-Goog-Api-Key": PLACES_KEY.value(),
                            "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.websiteUri"
                        },
                        body: JSON.stringify({
                            includedPrimaryTypes: [place.primaryType],
                            maxResultCount: 5,
                            locationRestriction: { circle: { center: place.location, radius: 5000 } },
                            languageCode: "de"
                        }),
                        signal: AbortSignal.timeout(6000)
                    });
                    const data = await r.json();
                    const baseHost = new URL(url).hostname.replace(/^www\./, "");
                    competitors = (data?.places || [])
                        .filter(c => c.userRatingCount > 30 && c.rating >= 4.0 && (c.websiteUri || "").indexOf(baseHost) === -1)
                        .slice(0, 3)
                        .map(c => ({
                            name: c.displayName?.text || "—",
                            rating: c.rating || null,
                            reviews: c.userRatingCount || 0,
                            website: c.websiteUri || null
                        }));
                }
            } catch (err) {
                console.warn("deepResearch competitors fetch failed:", err.message);
            }

            // 5) Prompt bauen + Claude rufen
            const prompt = buildResearchPrompt({
                url, branche, place,
                homepage: { ok: true, text: homepageText },
                subPages,
                psiScores, tech, wayback, competitors
            });

            const claude = await callClaudeForResearch(prompt);
            const assessment = claude.assessment;

            // 6) Cache + Return
            const payload = {
                assessment,
                meta: {
                    url,
                    branche,
                    domain: new URL(url).hostname.replace(/^www\./, ""),
                    subPagesAnalyzed: subPages.map(p => ({ slot: p.slot, url: p.url, ok: p.ok, status: p.status })),
                    pagesCount: subPages.length + 1,
                    psiAvailable: !!psiSnapshot,
                    competitorCount: competitors.length,
                    model: DEEP_RESEARCH_MODEL,
                    usage: claude.usage,
                    durationMs: Date.now() - startMs
                }
            };
            await saveDeepResearchCache(url, payload);
            res.json({ ok: true, cached: false, ...payload });
        } catch (err) {
            console.error("deepResearch failed:", err);
            res.status(500).json({ error: "Deep Research fehlgeschlagen", details: String(err?.message || err) });
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// GENERATE MOCKUP: Sonnet entwirft Hero-Spec, Server rendert SVG
// ═══════════════════════════════════════════════════════════════

const MOCKUP_MODEL = "claude-sonnet-4-20250514";
const MOCKUP_CACHE_DAYS = 7;

function mockupCacheKey(url) {
    const u = String(url || "").toLowerCase().replace(/\/+$/, "");
    return crypto.createHash("sha256").update(u).digest("hex").slice(0, 24);
}

async function loadMockupCache(url) {
    try {
        const key = mockupCacheKey(url);
        const snap = await db.collection("mockups").doc(key).get();
        if (!snap.exists) return null;
        const data = snap.data();
        if ((data.expiresAtMs || 0) < Date.now()) return null;
        return data;
    } catch (err) {
        console.warn("mockup cache read failed:", err.message);
        return null;
    }
}

async function saveMockupCache(url, payload) {
    try {
        const key = mockupCacheKey(url);
        const expiresAtMs = Date.now() + MOCKUP_CACHE_DAYS * 86400000;
        await db.collection("mockups").doc(key).set({
            ...payload,
            cachedUrl: url,
            cachedAtMs: Date.now(),
            expiresAtMs,
            expiresAt: new admin.firestore.Timestamp(Math.floor(expiresAtMs / 1000), 0)
        });
    } catch (err) {
        console.warn("mockup cache write failed:", err.message);
    }
}

async function callClaudeForMockup(promptText) {
    const body = {
        model: MOCKUP_MODEL,
        max_tokens: 1500,
        system: [
            { type: "text", text: mockupGenerator.SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
        ],
        tools: [mockupGenerator.TOOL_DEFINITION],
        tool_choice: { type: "tool", name: mockupGenerator.TOOL_DEFINITION.name },
        messages: [{ role: "user", content: promptText }]
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": CLAUDE_API_KEY.value(),
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const toolUse = (data.content || []).find(c => c.type === "tool_use" && c.name === mockupGenerator.TOOL_DEFINITION.name);
    if (!toolUse?.input) throw new Error("Claude returned no tool_use payload");
    return { spec: toolUse.input, usage: data.usage || null };
}

// ─── generateMockup ─── POST {url, branche?, businessName?, currentIssues?, deepResearchSummary?, force?}
exports.generateMockup = onRequest(
    {
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 60,
        cors: false,
        secrets: [CLAUDE_API_KEY]
    },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
        // Claude-Calls = $$$ → strenges Limit 5/h
        if (await enforceRateLimit(db, req, res, "generateMockup", 5, 3600)) return;

        const startMs = Date.now();
        let { url, branche = null, businessName = null, currentIssues = null, deepResearchSummary = null, force = false } = req.body || {};
        if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        // Cache lookup
        if (!force) {
            const cached = await loadMockupCache(url);
            if (cached?.spec && cached?.svg) {
                return res.json({
                    ok: true,
                    cached: true,
                    cachedAtMs: cached.cachedAtMs,
                    spec: cached.spec,
                    svg: cached.svg,
                    svgDataUrl: cached.svgDataUrl,
                    htmlSnippet: cached.htmlSnippet,
                    meta: { fromCache: true, durationMs: Date.now() - startMs }
                });
            }
        }

        try {
            const prompt = mockupGenerator.buildMockupPrompt({
                url, branche, businessName, currentIssues, deepResearchSummary
            });
            const claude = await callClaudeForMockup(prompt);
            const spec = claude.spec;

            // Server-Side SVG-Render
            const svg = mockupGenerator.renderSvg(spec);
            const svgDataUrl = mockupGenerator.svgToDataUrl(svg);
            const htmlSnippet = mockupGenerator.composeMockupHtmlSnippet(svgDataUrl, spec?.hero?.headline, spec?.hero?.primaryCta);

            const payload = {
                spec,
                svg,
                svgDataUrl,
                htmlSnippet,
                meta: {
                    url,
                    domain: new URL(url).hostname.replace(/^www\./, ""),
                    branche,
                    model: MOCKUP_MODEL,
                    layoutVariant: spec?.layoutVariant || "centered",
                    usage: claude.usage,
                    durationMs: Date.now() - startMs
                }
            };
            await saveMockupCache(url, payload);
            res.json({ ok: true, cached: false, ...payload });
        } catch (err) {
            console.error("generateMockup failed:", err);
            res.status(500).json({ error: "Mockup-Generierung fehlgeschlagen", details: String(err?.message || err) });
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// SECURITY AUDIT: HTTP-Header, TLS, DNS, Sensitive Files, Libraries
// ═══════════════════════════════════════════════════════════════

const SECURITY_CACHE_HOURS = 24;

function securityCacheKey(url) {
    const u = String(url || "").toLowerCase().replace(/\/+$/, "");
    return crypto.createHash("sha256").update(u).digest("hex").slice(0, 24);
}

async function loadSecurityCache(url) {
    try {
        const key = securityCacheKey(url);
        const snap = await db.collection("securityAudits").doc(key).get();
        if (!snap.exists) return null;
        const data = snap.data();
        if ((data.expiresAtMs || 0) < Date.now()) return null;
        return data;
    } catch (err) {
        console.warn("security cache read failed:", err.message);
        return null;
    }
}

async function saveSecurityCache(url, payload) {
    try {
        const key = securityCacheKey(url);
        const expiresAtMs = Date.now() + SECURITY_CACHE_HOURS * 3600000;
        await db.collection("securityAudits").doc(key).set({
            ...payload,
            cachedUrl: url,
            cachedAtMs: Date.now(),
            expiresAtMs,
            expiresAt: new admin.firestore.Timestamp(Math.floor(expiresAtMs / 1000), 0)
        });
    } catch (err) {
        console.warn("security cache write failed:", err.message);
    }
}

// ─── securityAudit ─── POST {url, psiData?, force?}
exports.securityAudit = onRequest(
    {
        region: "europe-west1",
        memory: "512MiB",
        timeoutSeconds: 45,
        cors: false
    },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
        if (await enforceRateLimit(db, req, res, "securityAudit", 10, 3600)) return;

        const startMs = Date.now();
        let { url, psiData = null, force = false } = req.body || {};
        if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        // Cache lookup
        if (!force) {
            const cached = await loadSecurityCache(url);
            if (cached?.findings) {
                return res.json({
                    ok: true,
                    cached: true,
                    cachedAtMs: cached.cachedAtMs,
                    findings: cached.findings,
                    summary: cached.summary,
                    severityScore: cached.severityScore,
                    meta: { ...(cached.meta || {}), fromCache: true, durationMs: Date.now() - startMs }
                });
            }
        }

        try {
            const result = await runSecurityAudit(url, psiData);
            const payload = {
                findings: result.findings,
                summary: result.summary,
                severityScore: result.severityScore,
                meta: { ...result.meta, durationMs: result.durationMs }
            };
            await saveSecurityCache(url, payload);
            res.json({ ok: true, cached: false, ...payload });
        } catch (err) {
            console.error("securityAudit failed:", err);
            res.status(500).json({ error: "Security-Audit fehlgeschlagen", details: String(err?.message || err) });
        }
    }
);
