/**
 * Phase 04 — Vision für die Top-25 mit Pass-2-opp ≥45 (scanner.js:375-380).
 * WICHTIG (IST-Verhalten): analyzeScreenshot läuft nur, wenn der Screenshot in
 * Phase 02 behalten wurde (Pass-1-opp ≥45, scanner.js:286+391). Ein Lead, der
 * erst durch adEvidence über 45 sprang, hat KEINEN Screenshot → keine Vision.
 * Concurrency 3 + ≥2 s Abstand (30/min-Limit us-central1).
 */
import { postApi, sleep } from '../lib/net.mjs';
import { runWithConcurrency } from '../lib/app.mjs';
import { selectVisionCands } from '../lib/orchestration.mjs';
import { loadPsiRecord } from './02-psi.mjs';

export async function runVision({ leads, dir, onProgress }) {
    const visionCands = selectVisionCands(leads);
    const visionMap = {};
    const skipped = [];
    let done = 0;
    await runWithConcurrency(visionCands, 3, async (l) => {
        const rec = loadPsiRecord(dir, l.domain);
        if (!rec?.screenshotKept || !rec.screenshot) {
            skipped.push({ domain: l.domain, grund: 'kein Screenshot (Pass-1-opp <45)' });
            done++; return;
        }
        try {
            const vision = await postApi('analyzeScreenshot', { screenshotBase64: rec.screenshot }, { timeoutMs: 45000, retries: 1 });
            if (vision) visionMap[l.domain] = vision;
        } catch { /* wie .catch(() => null) — kein Mod */ }
        await sleep(2000);
        done++;
        if (onProgress) onProgress(done, visionCands.length);
    });
    return { visionMap, selected: visionCands.map(l => l.domain), skipped };
}
