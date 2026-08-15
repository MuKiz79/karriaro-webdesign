/**
 * Phase 03 — adEvidence für die Top-60 mit Pass-1-opp ≥35 (scanner.js:315-320).
 * Concurrency 3, Server-Limit 240/h, Server-Cache 168 h (Stuttgart noch warm).
 * Rohe Endpoint-Antworten werden UNVERÄNDERT gespeichert — die Interpretation
 * (clean/blocked/Merge) passiert offline in Phase 05, damit sie re-runnbar ist.
 */
import { postApi } from '../lib/net.mjs';
import { runWithConcurrency } from '../lib/app.mjs';
import { selectAdCands } from '../lib/orchestration.mjs';

export async function runAdEvidence({ leads, onProgress }) {
    const adCands = selectAdCands(leads);
    const adevMap = {};
    let done = 0;
    await runWithConcurrency(adCands, 3, async (l) => {
        try {
            adevMap[l.domain] = await postApi('adEvidence', { url: l.websiteUri }, { timeoutMs: 30000, retries: 1 });
        } catch (e) {
            adevMap[l.domain] = null;   // wie .catch(() => null) in scanner.js:325
        }
        done++;
        if (onProgress) onProgress(done, adCands.length);
    });
    return { adevMap, selected: adCands.map(l => l.domain) };
}
