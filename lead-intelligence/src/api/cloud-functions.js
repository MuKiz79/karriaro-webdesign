/**
 * Advanced Cloud Function Calls (A1, A2, A4, B6, D15, D16)
 */
import { config } from '../config.js';
import { cachedFetch } from './client.js';

// Webdesign-Functions (eigener europe-west1 Codebase) — werden absolut adressiert.
const WEBDESIGN_FN_BASE = 'https://europe-west1-apex-executive.cloudfunctions.net';

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
    const { timeout = 60000 } = opts;
    try {
        return await cachedFetch(`${WEBDESIGN_FN_BASE}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, { timeout, retries: 0, cacheKey: `wd_${endpoint}_${JSON.stringify(body)}` });
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

/** #9: Kalender-Event URL generieren */
export function getCalendarUrl(title, domain, score, date, time) {
    if (!config.fnUrl) return null;
    const base = config.fnUrl.replace(/\/[^/]+$/, ''); // Extract base URL
    return `${config.fnUrl.split('/').slice(0, -1).join('/')}/calendarEvent?title=${encodeURIComponent(title)}&domain=${encodeURIComponent(domain)}&score=${score || ''}&date=${date || ''}&time=${time || ''}`;
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
