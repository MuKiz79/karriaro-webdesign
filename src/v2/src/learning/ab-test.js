/**
 * A/B Test Pitch-Varianten — Thompson Sampling
 */
import { sampleBeta } from '../math/sampling.js';

const VARIANTS = ['emotional', 'rational', 'hybrid'];

function getStats() { return JSON.parse(localStorage.getItem('karriaro_ab_stats') || '{"emotional":{"sent":0,"replied":0},"rational":{"sent":0,"replied":0},"hybrid":{"sent":0,"replied":0}}'); }
function saveStats(s) { localStorage.setItem('karriaro_ab_stats', JSON.stringify(s)); }

export function selectVariant() {
    const stats = getStats();
    let best = null, bestSample = -1;
    for (const v of VARIANTS) {
        const s = stats[v];
        const sample = sampleBeta(s.replied + 1, s.sent - s.replied + 1);
        if (sample > bestSample) { bestSample = sample; best = v; }
    }
    const total = Object.values(stats).reduce((s, v) => s + v.sent, 0);
    return { variant: best, stats, confidence: total >= 30 ? 'hoch' : total >= 10 ? 'mittel' : 'niedrig' };
}

export function logSent(variant) { const s = getStats(); s[variant].sent++; saveStats(s); }
export function logReply(variant) { const s = getStats(); s[variant].replied++; saveStats(s); }
