/**
 * Advanced Cloud Function Calls (A1, A2, A4, B6, D15, D16)
 */
import { config } from '../config.js';
import { cachedFetch } from './client.js';

// Webdesign-Functions (europe-west1 Codebase). Same-Origin über den Hosting-
// Rewrite /api/* (kein CORS) — die /api/<endpoint>-Routen zeigen je nach Endpoint
// auf die richtige Region (siehe firebase.json der karriaro-leads-Site).
const WEBDESIGN_FN_BASE = '/api';

async function call(endpoint, body) {
    if (!config.fnUrl) return null;
    try {
        return await cachedFetch(`${config.fnUrl}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, { timeout: 20000, retries: 1, cacheKey: `cf_${endpoint}_${JSON.stringify(body)}` });
    } catch (e) { return null; }
}

async function callWebdesign(endpoint, body, opts = {}) {
    // retries=1: Anthropic-5xx/Overload sind transient — ein zweiter Versuch
    // rettet ~5-10% sonst verlorener deepResearch/generateMockup-Calls.
    // cachedFetch wartet 2s zwischen Versuchen. Bei Total-Fail return null.
    const { timeout = 60000, retries = 1 } = opts;
    try {
        return await cachedFetch(`${WEBDESIGN_FN_BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, { timeout, retries, cacheKey: `wd_${endpoint}_${JSON.stringify(body)}` });
    } catch (e) {
        console.warn(`callWebdesign(${endpoint}) failed:`, e?.message || e);
        return null;
    }
}

/** A1: LLM Content-Analyse */
export function analyzeContent(url) { return call('analyzeContent', { url }); }

/** A2: Claude Vision Screenshot */
export function analyzeScreenshot(base64) { return call('analyzeScreenshot', { screenshotBase64: base64 }); }

/** A4: Review-Sentiment */
export function analyzeReviews(query) { return call('analyzeReviews', { placeQuery: query }); }

/** D15: Domain-Alter */
export function getDomainAge(domain) { return call('domainAge', { domain }); }

/** D16: Domain Authority */
export function getDomainAuthority(domain) { return call('domainAuthority', { domain }); }

/** B6: Suchvolumen */
export function getSearchVolume(query) { return call('searchVolume', { query }); }

/** KI-Branchenanalyse: Was ist Standard, was fehlt? */
export function analyzeBranchStandards(url, branche, features) { return call('analyzeBranchStandards', { url, branche, features }); }

/** Social Profile Analyzer: Instagram Followers, FB Likes, LinkedIn, TikTok */
export function analyzeSocialProfiles(websiteUrl, profileUrls) { return call('analyzeSocialProfiles', { websiteUrl, profileUrls }); }

/** #11: E-Mail Deliverability Check (SPF, DKIM, DMARC) */
export function checkEmailDeliverability(domain) { return call('checkEmailDeliverability', { domain }); }

/** #13: Auto-Mockup Generator (KI-Redesign-Vorschlag) */
export function generateMockupSuggestion(domain, branche, currentIssues, screenshotBase64) {
    return call('generateMockupSuggestion', { domain, branche, currentIssues, screenshotBase64 });
}

/** Contact Enrichment: E-Mail, Telefon, Inhaber aus Impressum */
export function enrichContact(url) { return call('enrichContact', { url }); }

/** #7: Lead-Page speichern (für personalisierte Landingpage) */
export function saveLeadPage(data) { return call('saveLeadPage', data); }

/** #9: Kalender-Event URL generieren — direkt am Endpoint (config.fnUrl ist die Basis, z.B. '/api'). */
export function getCalendarUrl(title, domain, score, date, time) {
    if (!config.fnUrl) return null;
    return `${config.fnUrl}/calendarEvent?title=${encodeURIComponent(title)}&domain=${encodeURIComponent(domain)}&score=${score || ''}&date=${date || ''}&time=${time || ''}`;
}

/**
 * Deep Research — ganzheitliche Site-Analyse mit Sub-Pages + Sonnet.
 * Nutzt den webdesign-functions europe-west1-Endpoint direkt.
 * Liefert { ok, cached, assessment, meta } oder null bei Failure.
 */
export function deepResearch({ url, branche = null, place = null, psiData = null, force = false } = {}) {
    if (!url) return Promise.resolve(null);
    return callWebdesign('deepResearch', { url, branche, place, psiData, force }, { timeout: 60000 });
}

/**
 * Generate Mockup — Sonnet entwirft Hero-Spec, Server rendert SVG.
 * Liefert { ok, cached, spec, svg, svgDataUrl, htmlSnippet, meta }.
 */
export function generateMockup({ url, branche = null, businessName = null, currentIssues = null, deepResearchSummary = null, force = false } = {}) {
    if (!url) return Promise.resolve(null);
    return callWebdesign('generateMockup', { url, branche, businessName, currentIssues, deepResearchSummary, force }, { timeout: 45000 });
}

/**
 * Pitch-Fabrik — Sonnet generiert aus echten Lead-Fakten eine volle, eigenständige,
 * teilbare Premium-Pitch-Seite (Avenius-Register). Liefert { ok, id, url, businessName }.
 *
 * WICHTIG: Direkt-Call an die Function-URL, NICHT über den /api-Hosting-Rewrite —
 * der Fastly-Edge cappt Rewrites bei ~60s, die Generierung dauert aber länger (502
 * trotz erfolgreicher Function). Der Direkt-Call respektiert das 120s-Function-Timeout.
 * CORS ist serverseitig für die karriaro-leads-Origin freigegeben.
 */
const PITCH_FN_URL = 'https://europe-west1-apex-executive.cloudfunctions.net/generatePitch';

export async function generatePitch({ businessName, branche = null, brancheLabel = null, rating = null, reviewCount = null, address = null, city = null, websiteUri = null, services = [], priceFrom = null, force = false } = {}) {
    if (!businessName) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 185000);
    try {
        const res = await fetch(PITCH_FN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessName, branche, brancheLabel, rating, reviewCount, address, city, websiteUri, services, priceFrom, force }),
            signal: ctrl.signal
        });
        const data = await res.json().catch(() => null);
        return data;   // {ok,id,url,...} bei Erfolg, sonst {error} → UI zeigt Detail
    } catch (e) {
        return { error: e?.name === 'AbortError' ? 'Zeitüberschreitung — bitte erneut versuchen.' : (e?.message || 'Netzwerkfehler') };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Security Audit — HTTP-Header, TLS, DNS, Sensitive Files, Outdated Libs.
 * Liefert { ok, cached, findings, summary, severityScore, meta }.
 */
export function securityAudit({ url, psiData = null, force = false } = {}) {
    if (!url) return Promise.resolve(null);
    return callWebdesign('securityAudit', { url, psiData, force }, { timeout: 45000 });
}
