// ════════════════════════════════════════════════════════════════════════════
// Dachdecker-Schadenfoto → Claude-Vision-Ersteinschätzung (Sprint 241) — pure Helfer.
//
// Erster Vision-Call der Codebase. Diese Datei hält die testbare Logik (Bild-Parsing/
// -Validierung + Normalisierung der Modell-Antwort) getrennt vom Endpoint (functions/index.js),
// analog zu lib/ki-visibility.js.
// ════════════════════════════════════════════════════════════════════════════

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB dekodiert — bremst Bild-Tokens/Kosten

// Akzeptiert eine Data-URL ("data:image/jpeg;base64,…") ODER rohes Base64 + mediaTypeHint.
// Liefert { mediaType, base64 } oder wirft mit klarer Meldung. KEIN Netzwerk, kein Schreiben.
function parseImage(input, mediaTypeHint) {
    if (typeof input !== "string" || input.length < 16) {
        throw new Error("Kein Bild übermittelt.");
    }
    let mediaType = "";
    let base64 = "";
    const m = input.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/is);
    if (m) {
        mediaType = m[1].toLowerCase();
        base64 = m[2];
    } else if (/^data:/i.test(input)) {
        // sieht aus wie eine Data-URL, ist aber unvollständig/kaputt (z.B. leerer Payload)
        throw new Error("Bilddaten beschädigt.");
    } else {
        mediaType = String(mediaTypeHint || "").toLowerCase();
        base64 = input;
    }
    base64 = base64.replace(/\s+/g, "");
    if (!ALLOWED_MEDIA.includes(mediaType)) {
        throw new Error("Nicht unterstütztes Bildformat (nur JPG, PNG, WebP).");
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error("Bilddaten beschädigt.");
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const bytes = Math.floor((base64.length * 3) / 4) - padding;
    if (bytes <= 0) throw new Error("Leeres Bild.");
    if (bytes > MAX_BYTES) {
        throw new Error("Bild zu groß — bitte ein kleineres Foto (max. 2 MB) hochladen.");
    }
    return { mediaType, base64, bytes };
}

const DAMAGE_CLASSES = ["kein", "gering", "mittel", "erheblich", "dringend"];
const CONFIDENCE = ["hoch", "mittel", "niedrig"];
const QUALITY = ["gut", "ausreichend", "schlecht"];

function str(v, max) {
    if (typeof v !== "string") return "";
    const s = v.trim();
    return max ? s.slice(0, max) : s;
}
function strList(v, maxItems, maxLen) {
    if (!Array.isArray(v)) return [];
    return v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);
}
function oneOf(v, allowed, fallback) {
    return allowed.includes(v) ? v : fallback;
}

// Macht die Modell-Antwort sicher renderbar: Enums clampen, Strings trimmen/kürzen,
// Listen begrenzen. Defensiv gegen fehlende/abweichende Felder.
function normalizeAssessment(input) {
    const a = input && typeof input === "object" ? input : {};
    return {
        isRoof: a.isRoof !== false, // default true; nur explizites false zählt
        imageQuality: oneOf(a.imageQuality, QUALITY, "ausreichend"),
        damageClass: oneOf(a.damageClass, DAMAGE_CLASSES, "mittel"),
        damageLabel: str(a.damageLabel, 60),
        title: str(a.title, 120),
        observations: strList(a.observations, 6, 240),
        urgency: str(a.urgency, 240),
        recommendedActions: strList(a.recommendedActions, 6, 240),
        costOrientation: str(a.costOrientation, 80),
        confidence: oneOf(a.confidence, CONFIDENCE, "mittel"),
    };
}

module.exports = { parseImage, normalizeAssessment, ALLOWED_MEDIA, MAX_BYTES, DAMAGE_CLASSES };
