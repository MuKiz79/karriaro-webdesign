/**
 * Google PageSpeed Insights API — mit Cache + Timeout
 */
import { config } from '../config.js';
import { cachedFetch } from './client.js';

export async function fetchPageSpeed(url) {
    let api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo`;
    if (config.psiKey) api += `&key=${config.psiKey}`;
    return cachedFetch(api, {}, { timeout: 45000, cacheTTL: 10 * 60 * 1000 });
}
