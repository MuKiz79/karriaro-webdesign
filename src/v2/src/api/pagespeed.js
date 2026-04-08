/**
 * Google PageSpeed Insights API
 */
import { config } from '../config.js';

export async function fetchPageSpeed(url) {
    let api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo`;
    if (config.psiKey) api += `&key=${config.psiKey}`;
    const res = await fetch(api);
    if (!res.ok) throw new Error(`PageSpeed ${res.status}`);
    return res.json();
}
