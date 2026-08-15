/**
 * Phase 02 — PSI je Kandidat (scanner.js:222-291), Concurrency 8, 1 Retry.
 * Speichert je Domain die ABLEITUNGEN (ws/tech/adIntent/jobIntent/footprint),
 * nicht das volle PSI-JSON. Screenshot wird nur behalten, wenn der Pass-1-Score
 * ≥45 ist (Retention-Regel scanner.js:286 — Vision kann später NUR für diese
 * Leads laufen, exakt das IST-Verhalten).
 *
 * Fehler-Semantik App-treu:
 *   psiStatus 'failed'  → Lead fällt still aus der Liste (scanner.js:288-291)
 *   perf fehlt in der Antwort → perfKnown=false, Lead bleibt (opportunity.js)
 */
import { fetchPsi, sleep } from '../lib/net.mjs';
import {
    extractWebsiteScore, detectTech, detectGoogleAds, detectJobSignals,
    analyzeDigitalFootprint, runWithConcurrency
} from '../lib/app.mjs';
import { hostnameOf, pass1 } from '../lib/orchestration.mjs';
import { writeJson, readJson, existsSync, join } from '../lib/io.mjs';

const PSI_CONCURRENCY = 8;   // scanner.js:75

export async function runPsi({ candidates, psiKey, month, dir, onProgress }) {
    const outDir = join(dir, '02-psi');
    let done = 0;

    await runWithConcurrency(candidates, PSI_CONCURRENCY, async (cand) => {
        const domain = hostnameOf(cand.place.websiteUri);
        const file = join(outDir, `${domain.replace(/[^a-z0-9.-]/gi, '_')}.json`);
        if (existsSync(file)) { done++; return; }   // Platten-Cache: Re-Run gratis

        let record;
        try {
            let psi;
            try { psi = await fetchPsi(cand.place.websiteUri, psiKey); }
            catch { await sleep(2000); psi = await fetchPsi(cand.place.websiteUri, psiKey); }

            const ws = extractWebsiteScore(psi);
            const tech = detectTech(psi);
            const screenshot = psi?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;
            // Ad-/Job-Signal gratis aus denselben PSI-Requests — scanner.js:236-246.
            const ga = detectGoogleAds(psi);
            const fp = analyzeDigitalFootprint(psi);
            const signals = [...ga.signals, ...(fp.hasFbPixel ? ['Meta-Pixel (Facebook-Werbung)'] : [])];
            const adIntent = { active: ga.active || fp.hasFbPixel, signals, googleAds: ga };
            const jobIntent = detectJobSignals(psi);

            record = {
                domain, psiStatus: 'ok', ws, tech, adIntent, jobIntent, footprint: fp,
                lighthouseFetchTime: psi?.lighthouseResult?.fetchTime || null,
                finalUrl: psi?.lighthouseResult?.finalUrl || null,
                screenshot: null, screenshotKept: false
            };

            // Retention-Entscheidung braucht den Pass-1-Score (scanner.js:286).
            const [lead] = pass1({ candidates: [{ ...cand, psi: record }], month });
            record.pass1Opp = lead ? lead.opportunity : null;
            if (lead && lead.opportunity >= 45 && screenshot) {
                record.screenshot = screenshot;
                record.screenshotKept = true;
            }
        } catch (e) {
            record = { domain, psiStatus: 'failed', error: String(e?.message || e) };
        }
        writeJson(file, record);
        done++;
        if (onProgress && done % 10 === 0) onProgress(done, candidates.length);
    });

    // Sammel-Index für die Offline-Phasen.
    const index = {};
    for (const cand of candidates) {
        const domain = hostnameOf(cand.place.websiteUri);
        const file = join(outDir, `${domain.replace(/[^a-z0-9.-]/gi, '_')}.json`);
        const rec = readJson(file);
        if (rec) index[domain] = { psiStatus: rec.psiStatus, pass1Opp: rec.pass1Opp ?? null, screenshotKept: !!rec.screenshotKept };
    }
    return index;
}

export function loadPsiRecord(dir, domain) {
    return readJson(join(dir, '02-psi', `${domain.replace(/[^a-z0-9.-]/gi, '_')}.json`));
}
