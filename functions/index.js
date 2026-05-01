const { onRequest } = require("firebase-functions/v2/https");
const { defineString, defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { runAuditPipeline } = require("./lib/audit-pipeline.js");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PLACES_KEY = defineString("PLACES_API_KEY");
const PSI_KEY = defineString("PSI_KEY");
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

const ALLOWED_ORIGINS = ["https://karriaro-webdesign.de", "https://www.karriaro-webdesign.de", "http://localhost:3000", "http://localhost:5000", "http://localhost:8080"];
const PLACES_BASE = "https://places.googleapis.com/v1/places";
const RATE_LIMIT = new Map(); // IP -> { count, resetTime }
const MAX_REQUESTS_PER_MINUTE = 30;
const AUDIT_RATE_LIMIT = new Map(); // IP -> { count, resetTime } für requestAudit (3/h)

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

function rateLimit(req, res) {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const entry = RATE_LIMIT.get(ip) || { count: 0, resetTime: now + 60000 };
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 60000; }
    entry.count++;
    RATE_LIMIT.set(ip, entry);
    if (entry.count > MAX_REQUESTS_PER_MINUTE) {
        res.status(429).json({ error: "Rate limit exceeded. Max 30 requests/minute." });
        return true;
    }
    return false;
}

// ── Text Search: "Friseur Berlin" or "beispiel.de" ──
exports.searchPlaces = onRequest({ region: "europe-west1", cors: false }, async (req, res) => {
    if (cors(req, res)) return;
    if (rateLimit(req, res)) return;

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
exports.nearbyPlaces = onRequest({ region: "europe-west1", cors: false }, async (req, res) => {
    if (cors(req, res)) return;
    if (rateLimit(req, res)) return;

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

function auditRateLimit(req, res) {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const entry = AUDIT_RATE_LIMIT.get(ip) || { count: 0, resetTime: now + 3600000 }; // 1h
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 3600000; }
    entry.count++;
    AUDIT_RATE_LIMIT.set(ip, entry);
    if (entry.count > 3) {
        res.status(429).json({ error: "Sie haben das stündliche Limit erreicht. Bitte später erneut." });
        return true;
    }
    return false;
}

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
function normalizeUrl(s) {
    if (!s || typeof s !== "string") return null;
    let u = s.trim();
    if (!/^https?:\/\//.test(u)) u = "https://" + u;
    try {
        const url = new URL(u);
        return url.origin + url.pathname.replace(/\/$/, "");
    } catch { return null; }
}

async function sendAuditMail(to, name, slug, domain) {
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST.value(),
        port: 587,
        secure: false,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() }
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
        secrets: [SMTP_HOST, SMTP_USER, SMTP_PASS]
    },
    async (req, res) => {
        if (cors(req, res)) return;
        if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
        if (auditRateLimit(req, res)) return;

        const { url, name, email, consent, company } = req.body || {};

        // Honeypot — wenn ausgefüllt: stilles Erfolgs-Signal an den Bot
        if (company && String(company).trim().length > 0) {
            return res.status(200).json({ ok: true, slug: "honeypot-noop" });
        }

        if (!consent) return res.status(400).json({ error: "DSGVO-Zustimmung fehlt" });
        const auditUrl = normalizeUrl(url);
        if (!auditUrl) return res.status(400).json({ error: "Ungültige URL" });
        if (!isValidEmail(email)) return res.status(400).json({ error: "Ungültige E-Mail" });
        const safeName = String(name || "").trim().slice(0, 100);

        const slug = generateSlug();
        const domain = new URL(auditUrl).hostname.replace(/^www\./, "");

        // Light-Pipeline asynchron starten — Antwort nicht blockieren bis fertig.
        // Aber: im 60s-Timeout läuft alles, wir warten doch — vereinfacht den Mail-Versand.
        let pipelineResult;
        try {
            pipelineResult = await runAuditPipeline(auditUrl, PSI_KEY.value());
        } catch (err) {
            console.error("Pipeline failed:", err.message);
            return res.status(502).json({ error: "Audit-Pipeline fehlgeschlagen", details: err.message });
        }

        // Konkurrenz optional via Places-Search (best effort)
        let competitors = [];
        try {
            const placesRes = await fetch(`${PLACES_BASE}:searchText`, {
                method: "POST",
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
            source: "inbound_form"
        };
        await db.collection("auditRequests").doc(slug).set(auditDoc);

        // Mail senden (best effort — wenn fehlschlägt, Fehler protokollieren, aber Slug zurückgeben)
        try {
            await sendAuditMail(email, safeName, slug, domain);
        } catch (err) {
            console.error("Mail-Versand fehlgeschlagen:", err.message);
            await db.collection("auditRequests").doc(slug).update({ mailError: err.message });
        }

        return res.json({ ok: true, slug, domain });
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

