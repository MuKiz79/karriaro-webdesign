/**
 * Advanced Cloud Function Calls (A1, A2, A4, B6, D15, D16)
 */
import { config } from '../config.js';

async function call(endpoint, body) {
    if (!config.fnUrl) return null;
    try {
        const res = await fetch(`${config.fnUrl}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return res.ok ? await res.json() : null;
    } catch (e) { return null; }
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
